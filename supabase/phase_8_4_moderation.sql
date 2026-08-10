-- 0. Ensure is_platform_admin helper exists
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, anon;

-- 1. Ensure profiles has verification_reason column
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verification_reason TEXT;

-- 2. Ensure jobs has rejection_reason column
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- 3. Create job_reports table for candidate job reporting
CREATE TABLE IF NOT EXISTS public.job_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  reporter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT DEFAULT 'pending', -- pending, reviewed, dismissed, action_taken
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolution_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

ALTER TABLE public.job_reports ENABLE ROW LEVEL SECURITY;

-- 4. Create admin_audit_logs table for audit trail
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL, -- EMPLOYER_APPROVED, EMPLOYER_REJECTED, EMPLOYER_SUSPENDED, JOB_APPROVED, JOB_REJECTED, JOB_SUSPENDED, REPORT_RESOLVED
  target_type TEXT NOT NULL, -- employer, job, report
  target_id UUID,
  reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- 5. SECURE ADMIN RPC: Update Employer Verification Status
CREATE OR REPLACE FUNCTION public.admin_update_employer_verification(
  target_user_id UUID,
  new_status TEXT,
  reason_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden: Admin authorization required.';
  END IF;

  UPDATE public.profiles
  SET 
    verification_status = new_status,
    verification_reason = reason_note,
    updated_at = NOW()
  WHERE id = target_user_id;

  UPDATE public.employer_profiles
  SET 
    verification_status = new_status,
    updated_at = NOW()
  WHERE id = target_user_id;

  -- Audit log entry
  INSERT INTO public.admin_audit_logs (admin_id, action, target_type, target_id, reason)
  VALUES (
    auth.uid(),
    CASE 
      WHEN new_status IN ('Approved', 'Verified') THEN 'EMPLOYER_APPROVED'
      WHEN new_status = 'Rejected' THEN 'EMPLOYER_REJECTED'
      WHEN new_status = 'Suspended' THEN 'EMPLOYER_SUSPENDED'
      ELSE 'EMPLOYER_STATUS_UPDATED'
    END,
    'employer',
    target_user_id,
    reason_note
  );
END;
$$;

-- 6. SECURE ADMIN RPC: Moderate Job Status (Approve/Reject/Suspend)
CREATE OR REPLACE FUNCTION public.admin_moderate_job(
  target_job_id UUID,
  new_status TEXT,
  reason_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden: Admin authorization required.';
  END IF;

  UPDATE public.jobs
  SET 
    status = new_status,
    rejection_reason = reason_note,
    updated_at = NOW()
  WHERE id = target_job_id;

  -- Audit log entry
  INSERT INTO public.admin_audit_logs (admin_id, action, target_type, target_id, reason)
  VALUES (
    auth.uid(),
    CASE 
      WHEN new_status = 'open' THEN 'JOB_APPROVED'
      WHEN new_status = 'rejected' THEN 'JOB_REJECTED'
      WHEN new_status = 'suspended' THEN 'JOB_SUSPENDED'
      ELSE 'JOB_STATUS_UPDATED'
    END,
    'job',
    target_job_id,
    reason_note
  );
END;
$$;

-- 7. RLS ENFORCEMENT: Employer Verification Gate on Job Insert
DROP POLICY IF EXISTS "Employers can insert jobs" ON public.jobs;
DROP POLICY IF EXISTS "Approved employers can insert pending_review jobs" ON public.jobs;

CREATE POLICY "Approved employers can insert pending_review jobs" ON public.jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = employer_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND verification_status IN ('Approved', 'Verified')
        AND (is_suspended IS NOT TRUE)
    )
    AND (status IN ('pending_review', 'draft'))
  );

-- 8. RLS ENFORCEMENT: Public Viewable Jobs Guard
DROP POLICY IF EXISTS "Public and candidates view open jobs" ON public.jobs;

CREATE POLICY "Public and candidates view open jobs" ON public.jobs
  FOR SELECT
  TO authenticated, anon
  USING (
    (
      status = 'open'
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = jobs.employer_id
          AND p.verification_status IN ('Approved', 'Verified')
          AND (p.is_suspended IS NOT TRUE)
      )
    )
    OR (auth.uid() = employer_id)
    OR public.is_platform_admin()
  );

-- 9. RLS POLICIES for Job Reports
DROP POLICY IF EXISTS "Candidates can submit job reports" ON public.job_reports;
DROP POLICY IF EXISTS "Users view own reports" ON public.job_reports;
DROP POLICY IF EXISTS "Admins manage job reports" ON public.job_reports;

CREATE POLICY "Candidates can submit job reports" ON public.job_reports
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Users view own reports" ON public.job_reports
  FOR SELECT TO authenticated
  USING (auth.uid() = reporter_id OR public.is_platform_admin());

CREATE POLICY "Admins manage job reports" ON public.job_reports
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- 10. RLS POLICIES for Admin Audit Logs
DROP POLICY IF EXISTS "Admins view audit logs" ON public.admin_audit_logs;

CREATE POLICY "Admins view audit logs" ON public.admin_audit_logs
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

-- 11. RLS POLICIES for Admin Profile Updates
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins can update employer profiles" ON public.employer_profiles;
CREATE POLICY "Admins can update employer profiles" ON public.employer_profiles
  FOR UPDATE TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins can view all employer profiles" ON public.employer_profiles;
CREATE POLICY "Admins can view all employer profiles" ON public.employer_profiles
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

-- Grants & Security Revokes
REVOKE EXECUTE ON FUNCTION public.admin_update_employer_verification(UUID, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_moderate_job(UUID, TEXT, TEXT) FROM anon;

GRANT EXECUTE ON FUNCTION public.admin_update_employer_verification(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_moderate_job(UUID, TEXT, TEXT) TO authenticated;

-- Reload PostgREST schema cache immediately
NOTIFY pgrst, 'reload schema';
