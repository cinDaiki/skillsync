-- supabase/phase_10_qa_fixes_rls.sql
-- SkillSync — Phase 10 QA & Security Hardening RLS Migration

-- 1. Applications Table: Allow employers to view applications for jobs they own
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employers can view applications for their jobs" ON public.applications;

CREATE POLICY "Employers can view applications for their jobs"
ON public.applications FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.jobs
    WHERE jobs.id = applications.job_id
      AND jobs.employer_id = auth.uid()
  )
);

-- 2. Admin Audit Logs Table: Enable RLS and establish least-privilege policies
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view audit logs" ON public.admin_audit_logs;
DROP POLICY IF EXISTS "Authenticated users can insert audit logs for self" ON public.admin_audit_logs;
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.admin_audit_logs;

-- SELECT Policy: Platform Admins only can view audit logs
CREATE POLICY "Admins can view audit logs"
ON public.admin_audit_logs FOR SELECT
TO authenticated
USING (is_platform_admin());

-- INSERT Policy: Authenticated users can log audit entries for their own actions/session
CREATE POLICY "Authenticated users can insert audit logs"
ON public.admin_audit_logs FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = admin_id OR admin_id IS NULL OR is_platform_admin());
