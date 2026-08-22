-- ==============================================================================
-- SkillSync Phase 5: Suspension Appeals & Support Review Migration
-- Migration: 20260824000000_phase_5_suspension_appeals.sql
-- ==============================================================================

-- 1. Data Normalization for pre-Phase-3 Legacy Suspended Accounts
-- Establishes a real, stable suspension instance timestamp for any existing
-- effectively suspended accounts where suspended_at is currently NULL.
UPDATE public.profiles p
SET suspended_at = COALESCE(
    (
        SELECT a.created_at
        FROM public.admin_audit_logs a
        WHERE a.target_id = p.id
          AND a.action IN ('CANDIDATE_SUSPENDED', 'EMPLOYER_SUSPENDED')
        ORDER BY a.created_at DESC
        LIMIT 1
    ),
    p.updated_at,
    now()
)
WHERE (
    COALESCE(p.is_suspended, false) = true
    OR p.verification_status = 'Suspended'
)
AND p.suspended_at IS NULL;

-- 2. Create public.suspension_appeals (Public-safe / User-readable table)
CREATE TABLE IF NOT EXISTS public.suspension_appeals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    account_role text NOT NULL CHECK (account_role IN ('candidate', 'employer')),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'approved', 'rejected', 'cancelled')),
    appeal_message text NOT NULL CHECK (char_length(trim(appeal_message)) >= 20 AND char_length(appeal_message) <= 2000),
    user_evidence_note text NULL CHECK (user_evidence_note IS NULL OR char_length(user_evidence_note) <= 2000),
    admin_public_response text NULL,
    suspension_reason_code_snapshot text NULL,
    suspended_at_snapshot timestamptz NOT NULL,
    suspension_expires_at_snapshot timestamptz NULL,
    reviewed_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.suspension_appeals OWNER TO postgres;

-- 3. Create Unique Index: One appeal per real suspension instance
-- No fake 1970 COALESCE fallback — uses the authentic instance timestamp
CREATE UNIQUE INDEX IF NOT EXISTS idx_suspension_appeals_user_instance
ON public.suspension_appeals (user_id, suspended_at_snapshot);

CREATE INDEX IF NOT EXISTS idx_suspension_appeals_status ON public.suspension_appeals(status);
CREATE INDEX IF NOT EXISTS idx_suspension_appeals_user_id ON public.suspension_appeals(user_id);

-- 4. Create public.suspension_appeal_reviews (Admin-private table)
CREATE TABLE IF NOT EXISTS public.suspension_appeal_reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    appeal_id uuid NOT NULL REFERENCES public.suspension_appeals(id) ON DELETE CASCADE,
    reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    decision text NOT NULL CHECK (decision IN ('under_review', 'approved', 'rejected')),
    admin_internal_note text NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.suspension_appeal_reviews OWNER TO postgres;

CREATE INDEX IF NOT EXISTS idx_suspension_appeal_reviews_appeal_id ON public.suspension_appeal_reviews(appeal_id);

-- 5. Enable RLS on both tables
ALTER TABLE public.suspension_appeals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suspension_appeal_reviews ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies for suspension_appeals
-- Users can view their own appeals; Admins can view all appeals
DROP POLICY IF EXISTS "Users and admins can view appeals" ON public.suspension_appeals;
CREATE POLICY "Users and admins can view appeals"
ON public.suspension_appeals
FOR SELECT
TO authenticated
USING (
    auth.uid() = user_id OR public.is_platform_admin()
);

-- Users DO NOT have direct INSERT/UPDATE/DELETE policies.
-- Appeal submission and reviews MUST happen exclusively via secure RPCs.
DROP POLICY IF EXISTS "Admins can update appeals" ON public.suspension_appeals;
CREATE POLICY "Admins can update appeals"
ON public.suspension_appeals
FOR UPDATE
TO authenticated
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

-- 7. RLS Policies for suspension_appeal_reviews (Admin-only)
DROP POLICY IF EXISTS "Admins can view appeal reviews" ON public.suspension_appeal_reviews;
CREATE POLICY "Admins can view appeal reviews"
ON public.suspension_appeal_reviews
FOR SELECT
TO authenticated
USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins can insert appeal reviews" ON public.suspension_appeal_reviews;
CREATE POLICY "Admins can insert appeal reviews"
ON public.suspension_appeal_reviews
FOR INSERT
TO authenticated
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins can update appeal reviews" ON public.suspension_appeal_reviews;
CREATE POLICY "Admins can update appeal reviews"
ON public.suspension_appeal_reviews
FOR UPDATE
TO authenticated
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

-- 8. Grant access permissions
GRANT ALL ON TABLE public.suspension_appeals TO authenticated, service_role;
GRANT ALL ON TABLE public.suspension_appeal_reviews TO authenticated, service_role;

-- ==============================================================================
-- 9. Server-Authoritative Appeal Submission RPC
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.submit_suspension_appeal(
    p_appeal_message text,
    p_user_evidence_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id uuid;
    v_profile record;
    v_normalized_role text;
    v_trimmed_message text;
    v_trimmed_evidence text;
    v_is_effectively_suspended boolean;
    v_existing_appeal_id uuid;
    v_new_appeal_id uuid;
    v_instance_suspended_at timestamptz;
BEGIN
    -- 1. Identify authenticated caller
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to submit an appeal.';
    END IF;

    -- 2. Fetch user profile
    SELECT * INTO v_profile
    FROM public.profiles
    WHERE id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User profile not found.';
    END IF;

    -- 3. Reject Admin accounts
    IF v_profile.role = 'admin' OR public.is_platform_admin() THEN
        RAISE EXCEPTION 'Administrators cannot submit suspension appeals.';
    END IF;

    -- 4. Normalize role
    IF v_profile.role IN ('candidate', 'jobseeker', 'job_seeker') THEN
        v_normalized_role := 'candidate';
    ELSIF v_profile.role = 'employer' THEN
        v_normalized_role := 'employer';
    ELSE
        RAISE EXCEPTION 'Only Candidates and Employers may submit suspension appeals.';
    END IF;

    -- 5. Validate Phase 4 effective suspension
    v_is_effectively_suspended := (
        COALESCE(v_profile.is_suspended, false) = true
        AND (
            v_profile.suspension_expires_at IS NULL
            OR v_profile.suspension_expires_at > now()
        )
    ) OR (
        -- Legacy verification_status='Suspended' support
        v_profile.verification_status = 'Suspended'
    );

    IF NOT v_is_effectively_suspended THEN
        RAISE EXCEPTION 'Only effectively suspended accounts can submit a suspension appeal.';
    END IF;

    -- 6. Ensure a concrete suspension-instance timestamp exists
    v_instance_suspended_at := v_profile.suspended_at;
    IF v_instance_suspended_at IS NULL THEN
        v_instance_suspended_at := now();
        UPDATE public.profiles
        SET suspended_at = v_instance_suspended_at,
            updated_at = now()
        WHERE id = v_user_id;
    END IF;

    -- 7. Validate message content & character constraints
    v_trimmed_message := trim(p_appeal_message);
    IF v_trimmed_message IS NULL OR char_length(v_trimmed_message) < 20 THEN
        RAISE EXCEPTION 'Appeal message must be at least 20 characters.';
    END IF;
    IF char_length(v_trimmed_message) > 2000 THEN
        RAISE EXCEPTION 'Appeal message cannot exceed 2000 characters.';
    END IF;

    v_trimmed_evidence := NULLIF(trim(p_user_evidence_note), '');
    IF v_trimmed_evidence IS NOT NULL AND char_length(v_trimmed_evidence) > 2000 THEN
        RAISE EXCEPTION 'Additional information cannot exceed 2000 characters.';
    END IF;

    -- 8. Enforce one appeal per real suspension instance
    SELECT id INTO v_existing_appeal_id
    FROM public.suspension_appeals
    WHERE user_id = v_user_id
      AND suspended_at_snapshot = v_instance_suspended_at
    LIMIT 1;

    IF v_existing_appeal_id IS NOT NULL THEN
        RAISE EXCEPTION 'An appeal has already been submitted for this suspension instance.';
    END IF;

    -- 9. Insert appeal row with server-derived snapshots
    INSERT INTO public.suspension_appeals (
        user_id,
        account_role,
        status,
        appeal_message,
        user_evidence_note,
        suspension_reason_code_snapshot,
        suspended_at_snapshot,
        suspension_expires_at_snapshot,
        created_at,
        updated_at
    ) VALUES (
        v_user_id,
        v_normalized_role,
        'pending',
        v_trimmed_message,
        v_trimmed_evidence,
        v_profile.suspension_reason_code,
        v_instance_suspended_at,
        v_profile.suspension_expires_at,
        now(),
        now()
    )
    RETURNING id INTO v_new_appeal_id;

    RETURN jsonb_build_object(
        'success', true,
        'appeal_id', v_new_appeal_id,
        'status', 'pending',
        'created_at', now()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_suspension_appeal(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_suspension_appeal(text, text) TO authenticated, service_role;

-- ==============================================================================
-- 10. Transactional Admin Review RPC with Outcome-Aware Result & Notifications
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.admin_review_suspension_appeal(
    p_appeal_id uuid,
    p_decision text,
    p_public_response text DEFAULT NULL,
    p_internal_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_id uuid;
    v_appeal record;
    v_profile record;
    v_is_effectively_suspended boolean;
    v_is_same_suspension boolean;
    v_action_taken text;
    v_restored boolean := false;
    v_trimmed_public_response text;
    v_trimmed_internal_note text;
    v_notif_title text;
    v_notif_message text;
BEGIN
    -- 1. Verify Admin caller
    v_admin_id := auth.uid();
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Administrator privileges required to review suspension appeals.';
    END IF;

    -- 2. Validate decision argument
    IF p_decision NOT IN ('under_review', 'approved', 'rejected') THEN
        RAISE EXCEPTION 'Invalid appeal decision: "%". Must be under_review, approved, or rejected.', p_decision;
    END IF;

    v_trimmed_public_response := NULLIF(trim(p_public_response), '');
    v_trimmed_internal_note := NULLIF(trim(p_internal_note), '');

    -- 3. Lock appeal row FOR UPDATE
    SELECT * INTO v_appeal
    FROM public.suspension_appeals
    WHERE id = p_appeal_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Suspension appeal not found: %', p_appeal_id;
    END IF;

    -- 4. Validate appeal status transitions
    IF v_appeal.status IN ('approved', 'rejected', 'cancelled') THEN
        RAISE EXCEPTION 'Cannot update a resolved appeal with status "%". Resolved appeals are final.', v_appeal.status;
    END IF;

    IF v_appeal.status = 'under_review' AND p_decision = 'under_review' THEN
        RAISE EXCEPTION 'Appeal is already under review.';
    END IF;

    -- 5. Lock target user profile FOR UPDATE
    SELECT * INTO v_profile
    FROM public.profiles
    WHERE id = v_appeal.user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target user profile not found: %', v_appeal.user_id;
    END IF;

    -- 6. Check suspension instance identity & effective suspension
    v_is_same_suspension := (
        v_profile.suspended_at IS NOT NULL
        AND v_profile.suspended_at = v_appeal.suspended_at_snapshot
    );
    v_is_effectively_suspended := (
        COALESCE(v_profile.is_suspended, false) = true
        AND (
            v_profile.suspension_expires_at IS NULL
            OR v_profile.suspension_expires_at > now()
        )
    );

    -- =========================================================================
    -- DECISION BRANCHES
    -- =========================================================================

    IF p_decision = 'under_review' THEN
        -- Mark Under Review (Does not alter suspension or expires_at)
        UPDATE public.suspension_appeals
        SET status = 'under_review',
            updated_at = now()
        WHERE id = p_appeal_id;

        -- Record private review event
        INSERT INTO public.suspension_appeal_reviews (
            appeal_id,
            reviewed_by,
            decision,
            admin_internal_note,
            created_at
        ) VALUES (
            p_appeal_id,
            v_admin_id,
            'under_review',
            v_trimmed_internal_note,
            now()
        );

        -- Audit log
        INSERT INTO public.admin_audit_logs (
            admin_id,
            action,
            target_type,
            target_id,
            reason,
            metadata,
            created_at
        ) VALUES (
            v_admin_id,
            'SUSPENSION_APPEAL_UNDER_REVIEW',
            v_profile.role,
            v_profile.id,
            'Appeal placed under moderation review',
            jsonb_build_object(
                'appeal_id', p_appeal_id,
                'account_role', v_appeal.account_role,
                'suspended_at_snapshot', v_appeal.suspended_at_snapshot
            ),
            now()
        );

        -- User notification
        INSERT INTO public.notifications (
            user_id,
            title,
            message,
            type,
            is_read,
            created_at
        ) VALUES (
            v_profile.id,
            'Appeal Under Review',
            'Your suspension appeal is currently under review by our moderation team.',
            'system',
            false,
            now()
        );

        v_action_taken := 'marked_under_review';
        v_restored := false;

    ELSIF p_decision = 'approved' THEN
        -- Mark Appeal Approved
        UPDATE public.suspension_appeals
        SET status = 'approved',
            admin_public_response = v_trimmed_public_response,
            reviewed_at = now(),
            updated_at = now()
        WHERE id = p_appeal_id;

        -- Record private review event
        INSERT INTO public.suspension_appeal_reviews (
            appeal_id,
            reviewed_by,
            decision,
            admin_internal_note,
            created_at
        ) VALUES (
            p_appeal_id,
            v_admin_id,
            'approved',
            v_trimmed_internal_note,
            now()
        );

        -- STALE APPEAL & EXPIRY LOGIC
        IF v_is_same_suspension AND v_is_effectively_suspended THEN
            -- CASE A: Same suspension & still active -> Restore profile
            UPDATE public.profiles
            SET is_suspended = false,
                suspension_reason_code = NULL,
                suspended_at = NULL,
                suspension_expires_at = NULL,
                updated_at = now()
            WHERE id = v_profile.id;

            -- If legacy verification_status='Suspended', recover to Pending
            IF v_profile.verification_status = 'Suspended' THEN
                UPDATE public.profiles
                SET verification_status = 'Pending',
                    updated_at = now()
                WHERE id = v_profile.id;
            END IF;

            v_action_taken := 'approved_and_restored';
            v_restored := true;
            v_notif_title := '✓ Appeal Approved';
            v_notif_message := COALESCE(v_trimmed_public_response, 'Your suspension appeal was approved. Your SkillSync account access has been restored.');

            -- Audit log
            INSERT INTO public.admin_audit_logs (
                admin_id,
                action,
                target_type,
                target_id,
                reason,
                metadata,
                created_at
            ) VALUES (
                v_admin_id,
                'SUSPENSION_APPEAL_APPROVED',
                v_profile.role,
                v_profile.id,
                COALESCE(v_trimmed_public_response, 'Appeal approved and account restored'),
                jsonb_build_object(
                    'appeal_id', p_appeal_id,
                    'account_role', v_appeal.account_role,
                    'restored', true,
                    'suspended_at_snapshot', v_appeal.suspended_at_snapshot
                ),
                now()
            );

        ELSIF NOT v_is_same_suspension THEN
            -- CASE C: Stale appeal (snapshot mismatch). DO NOT mutate current suspension!
            v_action_taken := 'approved_stale_record_only';
            v_restored := false;
            v_notif_title := '✓ Appeal Approved (Previous Suspension)';
            v_notif_message := COALESCE(v_trimmed_public_response, 'Your appeal regarding a previous suspension was reviewed and approved. This decision does not affect any newer suspension currently applied to your account.');

            INSERT INTO public.admin_audit_logs (
                admin_id,
                action,
                target_type,
                target_id,
                reason,
                metadata,
                created_at
            ) VALUES (
                v_admin_id,
                'SUSPENSION_APPEAL_APPROVED',
                v_profile.role,
                v_profile.id,
                COALESCE(v_trimmed_public_response, 'Historical appeal approved (stale instance, active suspension preserved)'),
                jsonb_build_object(
                    'appeal_id', p_appeal_id,
                    'account_role', v_appeal.account_role,
                    'restored', false,
                    'reason', 'stale_suspension_instance_mismatch',
                    'suspended_at_snapshot', v_appeal.suspended_at_snapshot,
                    'current_suspended_at', v_profile.suspended_at
                ),
                now()
            );

        ELSE
            -- CASE B: Already expired naturally. DO NOT mutate profile unnecessarily.
            v_action_taken := 'approved_already_expired';
            v_restored := false;
            v_notif_title := '✓ Appeal Approved';
            v_notif_message := COALESCE(v_trimmed_public_response, 'Your suspension appeal was approved. Your previous suspension had already expired and your account is currently active.');

            INSERT INTO public.admin_audit_logs (
                admin_id,
                action,
                target_type,
                target_id,
                reason,
                metadata,
                created_at
            ) VALUES (
                v_admin_id,
                'SUSPENSION_APPEAL_APPROVED',
                v_profile.role,
                v_profile.id,
                COALESCE(v_trimmed_public_response, 'Appeal approved (suspension already expired naturally)'),
                jsonb_build_object(
                    'appeal_id', p_appeal_id,
                    'account_role', v_appeal.account_role,
                    'restored', false,
                    'reason', 'already_expired_naturally',
                    'suspended_at_snapshot', v_appeal.suspended_at_snapshot
                ),
                now()
            );
        END IF;

        -- Insert notification
        INSERT INTO public.notifications (
            user_id,
            title,
            message,
            type,
            is_read,
            created_at
        ) VALUES (
            v_profile.id,
            v_notif_title,
            v_notif_message,
            'system',
            false,
            now()
        );

    ELSIF p_decision = 'rejected' THEN
        -- Mark Appeal Rejected (Never re-suspends active/expired profile)
        UPDATE public.suspension_appeals
        SET status = 'rejected',
            admin_public_response = v_trimmed_public_response,
            reviewed_at = now(),
            updated_at = now()
        WHERE id = p_appeal_id;

        -- Record private review event
        INSERT INTO public.suspension_appeal_reviews (
            appeal_id,
            reviewed_by,
            decision,
            admin_internal_note,
            created_at
        ) VALUES (
            p_appeal_id,
            v_admin_id,
            'rejected',
            v_trimmed_internal_note,
            now()
        );

        v_action_taken := 'rejected';
        v_restored := false;

        -- Determine state-aware rejection notification
        IF v_is_same_suspension AND v_is_effectively_suspended THEN
            v_notif_title := 'Appeal Decision';
            v_notif_message := COALESCE(v_trimmed_public_response, 'Your suspension appeal has been reviewed. The suspension remains in place.');
        ELSIF NOT v_is_same_suspension THEN
            v_notif_title := 'Appeal Decision (Previous Suspension)';
            v_notif_message := COALESCE(v_trimmed_public_response, 'Your appeal regarding a previous suspension has been reviewed. This decision does not affect any newer suspension currently applied to your account.');
        ELSE
            v_notif_title := 'Appeal Decision';
            v_notif_message := COALESCE(v_trimmed_public_response, 'Your suspension appeal has been reviewed. The suspension associated with this appeal has already expired.');
        END IF;

        -- Audit log
        INSERT INTO public.admin_audit_logs (
            admin_id,
            action,
            target_type,
            target_id,
            reason,
            metadata,
            created_at
        ) VALUES (
            v_admin_id,
            'SUSPENSION_APPEAL_REJECTED',
            v_profile.role,
            v_profile.id,
            COALESCE(v_trimmed_public_response, 'Suspension appeal rejected by administrator'),
            jsonb_build_object(
                'appeal_id', p_appeal_id,
                'account_role', v_appeal.account_role,
                'suspended_at_snapshot', v_appeal.suspended_at_snapshot,
                'is_same_suspension', v_is_same_suspension,
                'is_effectively_suspended', v_is_effectively_suspended
            ),
            now()
        );

        -- Notification
        INSERT INTO public.notifications (
            user_id,
            title,
            message,
            type,
            is_read,
            created_at
        ) VALUES (
            v_profile.id,
            v_notif_title,
            v_notif_message,
            'system',
            false,
            now()
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'appeal_id', p_appeal_id,
        'decision', p_decision,
        'action_taken', v_action_taken,
        'restored', v_restored,
        'stale', (NOT v_is_same_suspension),
        'already_expired', (v_is_same_suspension AND NOT v_is_effectively_suspended),
        'reviewed_at', now()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_suspension_appeal(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_review_suspension_appeal(uuid, text, text, text) TO authenticated, service_role;
