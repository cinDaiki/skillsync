-- ==============================================================================
-- Migration: 20261006000000_phase_8_admin_job_moderation_and_reporting.sql
-- Description: Server-authoritative job reporting, post-auto-publish moderation,
--              disabling, restoring, and report resolution for Phase 8 Revision.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Table: public.job_reports
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  reporter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason_code TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'dismissed', 'action_taken')),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_reports_job_id ON public.job_reports(job_id);
CREATE INDEX IF NOT EXISTS idx_job_reports_status ON public.job_reports(status);
CREATE INDEX IF NOT EXISTS idx_job_reports_created_at ON public.job_reports(created_at DESC);

ALTER TABLE public.job_reports OWNER TO postgres;

-- ------------------------------------------------------------------------------
-- 2. RLS for public.job_reports
-- ------------------------------------------------------------------------------
ALTER TABLE public.job_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reporters view own reports" ON public.job_reports;
CREATE POLICY "Reporters view own reports" ON public.job_reports
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid());

DROP POLICY IF EXISTS "Admins manage all job reports" ON public.job_reports;
CREATE POLICY "Admins manage all job reports" ON public.job_reports
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- ------------------------------------------------------------------------------
-- 3. Server-Authoritative submit_job_report RPC
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_job_report(
  p_job_id UUID,
  p_reason_code TEXT,
  p_details TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reporter_id UUID := auth.uid();
  v_job_exists BOOLEAN := FALSE;
  v_report_id UUID;
  v_clean_reason TEXT;
BEGIN
  -- Strict server-derived authentication
  IF v_reporter_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: Caller must be authenticated to report a job.';
  END IF;

  -- Validate target job
  SELECT EXISTS(SELECT 1 FROM public.jobs WHERE id = p_job_id) INTO v_job_exists;
  IF NOT v_job_exists THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND: Job listing does not exist.';
  END IF;

  -- Controlled reason taxonomy normalization
  v_clean_reason := LOWER(TRIM(COALESCE(p_reason_code, 'other')));
  IF v_clean_reason NOT IN (
    'misleading_information',
    'scam_or_suspicious',
    'discriminatory_content',
    'incorrect_details',
    'duplicate_posting',
    'inappropriate_content',
    'other'
  ) THEN
    -- Map user-facing labels if passed directly
    IF v_clean_reason LIKE '%scam%' OR v_clean_reason LIKE '%fraud%' THEN
      v_clean_reason := 'scam_or_suspicious';
    ELSIF v_clean_reason LIKE '%mislead%' THEN
      v_clean_reason := 'misleading_information';
    ELSIF v_clean_reason LIKE '%discriminat%' THEN
      v_clean_reason := 'discriminatory_content';
    ELSIF v_clean_reason LIKE '%incorrect%' THEN
      v_clean_reason := 'incorrect_details';
    ELSIF v_clean_reason LIKE '%duplicate%' THEN
      v_clean_reason := 'duplicate_posting';
    ELSIF v_clean_reason LIKE '%inappropriate%' THEN
      v_clean_reason := 'inappropriate_content';
    ELSE
      v_clean_reason := 'other';
    END IF;
  END IF;

  -- Insert report with server-derived reporter_id (job status remains untouched)
  INSERT INTO public.job_reports (
    job_id,
    reporter_id,
    reason_code,
    details,
    status,
    created_at
  )
  VALUES (
    p_job_id,
    v_reporter_id,
    v_clean_reason,
    p_details,
    'pending',
    NOW()
  )
  RETURNING id INTO v_report_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'report_id', v_report_id,
    'job_id', p_job_id,
    'reason_code', v_clean_reason,
    'status', 'pending'
  );
END;
$$;

ALTER FUNCTION public.submit_job_report(UUID, TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.submit_job_report(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_job_report(UUID, TEXT, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 4. Server-Authoritative admin_resolve_job_report RPC
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_resolve_job_report(
  p_report_id UUID,
  p_decision TEXT,
  p_resolution_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_report RECORD;
  v_clean_decision TEXT;
  v_audit_action TEXT;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: Caller must be authenticated.';
  END IF;

  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Admin authorization required to resolve job reports.';
  END IF;

  SELECT * INTO v_report FROM public.job_reports WHERE id = p_report_id;
  IF v_report.id IS NULL THEN
    RAISE EXCEPTION 'REPORT_NOT_FOUND: Job report not found.';
  END IF;

  v_clean_decision := LOWER(TRIM(COALESCE(p_decision, '')));
  IF v_clean_decision NOT IN ('dismissed', 'action_taken') THEN
    RAISE EXCEPTION 'INVALID_DECISION: Decision must be either dismissed or action_taken.';
  END IF;

  UPDATE public.job_reports
  SET
    status = v_clean_decision,
    reviewed_at = NOW(),
    reviewed_by = v_admin_id,
    resolution_note = p_resolution_note
  WHERE id = p_report_id;

  v_audit_action := CASE 
    WHEN v_clean_decision = 'dismissed' THEN 'JOB_REPORT_DISMISSED'
    ELSE 'JOB_REPORT_ACTIONED'
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
    'job_report',
    p_report_id,
    p_resolution_note,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'report_id', p_report_id,
    'status', v_clean_decision,
    'action', v_audit_action
  );
END;
$$;

ALTER FUNCTION public.admin_resolve_job_report(UUID, TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_resolve_job_report(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_job_report(UUID, TEXT, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 5. Updated admin_moderate_job RPC (Supports Disable, Restore, Close, Approve, Reject)
-- ------------------------------------------------------------------------------
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

  -- Require reason when suspending / disabling
  IF v_normalized_status IN ('suspended', 'rejected') AND (reason_note IS NULL OR TRIM(reason_note) = '') THEN
    RAISE EXCEPTION 'REASON_REQUIRED: A moderation reason is required when disabling or rejecting a job.';
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
    WHEN v_normalized_status = 'open' THEN 
      CASE WHEN v_job.status = 'suspended' THEN 'JOB_RESTORED' ELSE 'JOB_APPROVED' END
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
      IF v_job.status = 'suspended' THEN
        v_notif_title := '✅ Job Listing Restored';
        v_notif_msg   := 'Your job listing "' || v_job.title || '" has been restored by admin and is now active on SkillSync.';
      ELSE
        v_notif_title := '🎉 Job Listing Approved';
        v_notif_msg   := 'Your job listing "' || v_job.title || '" has been approved by admin and is now live on SkillSync.';
      END IF;
    ELSIF v_normalized_status = 'rejected' THEN
      v_notif_title := '❌ Job Listing Rejected';
      v_notif_msg   := 'Your job listing "' || v_job.title || '" was not approved.' || 
                       COALESCE(' Reason: ' || reason_note, ' Please review our job posting guidelines.');
    ELSIF v_normalized_status = 'suspended' THEN
      v_notif_title := '⚠️ Job Listing Disabled';
      v_notif_msg   := 'Your job listing "' || v_job.title || '" has been disabled by administration.' || 
                       COALESCE(' Reason: ' || reason_note, '');
    ELSE
      v_notif_title := '📋 Job Listing Closed';
      v_notif_msg   := 'Your job listing "' || v_job.title || '" has been closed.';
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

-- ------------------------------------------------------------------------------
-- 6. Reload schema cache for PostgREST
-- ------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
