-- ==============================================================================
-- SkillSync Phase 6 Migration: Fix Admin Job Moderation RPC
-- Migration: 20260825040000_fix_admin_job_moderation_rpc.sql
--
-- Implements server-authoritative Admin job moderation RPC:
--   - public.admin_moderate_job(target_job_id UUID, new_status TEXT, reason_note TEXT)
--
-- Security Controls:
--   - Requires active authenticated session (auth.uid() IS NOT NULL)
--   - Strictly enforces platform admin authorization via public.is_platform_admin()
--   - Derives Admin identity server-side
--   - Validates existence and eligibility of target job
--   - Validates target status is an allowed moderation decision ('open', 'rejected', 'suspended', 'closed')
--   - Atomically updates status, rejection_reason, and updated_at
--   - Creates audit trail entry in public.admin_audit_logs
--   - Emits server-authoritative notification to the job owner (Employer)
--   - Hardened with search_path = public, pg_temp
--   - Explicit permissions: REVOKE PUBLIC / anon; GRANT authenticated, service_role
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.admin_moderate_job(
  target_job_id UUID,
  new_status TEXT,
  reason_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_job RECORD;
  v_normalized_status TEXT;
  v_audit_action TEXT;
  v_notif_title TEXT;
  v_notif_msg TEXT;
BEGIN
  -- 1. Enforce Authentication & Admin Authorization
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: Caller must be authenticated.';
  END IF;

  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Admin authorization required to moderate job postings.';
  END IF;

  -- 2. Validate Target Job Existence
  SELECT id, title, employer_id, status
  INTO v_job
  FROM public.jobs
  WHERE id = target_job_id;

  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND: Job listing does not exist.';
  END IF;

  -- 3. Validate Moderation Decision Status
  v_normalized_status := LOWER(TRIM(COALESCE(new_status, '')));
  IF v_normalized_status NOT IN ('open', 'rejected', 'suspended', 'closed') THEN
    RAISE EXCEPTION 'INVALID_STATUS: Moderation status must be open, rejected, suspended, or closed. Received: %', new_status;
  END IF;

  -- 4. Atomically Update Job Record
  UPDATE public.jobs
  SET 
    status = v_normalized_status,
    rejection_reason = CASE 
      WHEN v_normalized_status IN ('rejected', 'suspended') THEN reason_note 
      ELSE NULL 
    END,
    updated_at = NOW()
  WHERE id = target_job_id;

  -- 5. Record Server-Authoritative Audit Trail
  v_audit_action := CASE 
    WHEN v_normalized_status = 'open' THEN 'JOB_APPROVED'
    WHEN v_normalized_status = 'rejected' THEN 'JOB_REJECTED'
    WHEN v_normalized_status = 'suspended' THEN 'JOB_SUSPENDED'
    WHEN v_normalized_status = 'closed' THEN 'JOB_CLOSED'
    ELSE 'JOB_STATUS_UPDATED'
  END;

  INSERT INTO public.admin_audit_logs (
    admin_id,
    action,
    target_type,
    target_id,
    reason,
    created_at
  )
  VALUES (
    v_admin_id,
    v_audit_action,
    'job',
    target_job_id,
    reason_note,
    NOW()
  );

  -- 6. Dispatch Authoritative Employer Notification
  IF v_job.employer_id IS NOT NULL THEN
    IF v_normalized_status = 'open' THEN
      v_notif_title := '🎉 Job Listing Approved';
      v_notif_msg   := 'Your job listing "' || v_job.title || '" has been approved by admin and is now live on SkillSync.';
    ELSIF v_normalized_status = 'rejected' THEN
      v_notif_title := '❌ Job Listing Rejected';
      v_notif_msg   := 'Your job listing "' || v_job.title || '" was not approved.' || 
                       COALESCE(' Reason: ' || reason_note, ' Please review our job posting guidelines.');
    ELSIF v_normalized_status = 'suspended' THEN
      v_notif_title := '⚠️ Job Listing Suspended';
      v_notif_msg   := 'Your job listing "' || v_job.title || '" has been suspended by administration.' || 
                       COALESCE(' Reason: ' || reason_note, '');
    ELSE
      v_notif_title := '📋 Job Listing Status Updated';
      v_notif_msg   := 'Your job listing "' || v_job.title || '" status has been changed to ' || v_normalized_status || '.';
    END IF;

    INSERT INTO public.notifications (
      user_id,
      title,
      message,
      type,
      is_read,
      created_at
    )
    VALUES (
      v_job.employer_id,
      v_notif_title,
      v_notif_msg,
      'announcement',
      FALSE,
      NOW()
    );
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'job_id', target_job_id,
    'status', v_normalized_status,
    'action', v_audit_action
  );
END;
$$;

ALTER FUNCTION public.admin_moderate_job(UUID, TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_moderate_job(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_moderate_job(UUID, TEXT, TEXT) TO authenticated, service_role;
