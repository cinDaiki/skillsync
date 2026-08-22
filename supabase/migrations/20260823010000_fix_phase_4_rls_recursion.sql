-- ==============================================================================
-- SkillSync Phase 4: Fix Profiles <-> Jobs RLS Recursion (Cycle Breaker)
-- Migration: 20260823010000_fix_phase_4_rls_recursion.sql
-- ==============================================================================

-- 1. Create Security-Definer Helper: is_employer_job_eligible
-- Evaluates whether target_employer_id is Approved/Verified and NOT effectively suspended.
-- Runs with search_path = public, pg_temp as SECURITY DEFINER to bypass RLS inside the function,
-- breaking the circular dependency: profiles -> applications -> jobs -> profiles.
CREATE OR REPLACE FUNCTION public.is_employer_job_eligible(
  target_employer_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = target_employer_id
      AND lower(coalesce(p.verification_status, '')) IN ('approved', 'verified')
      AND NOT (
        -- Modern Phase 3/4 effective active suspension (indefinite or unexpired temporary)
        (p.is_suspended IS TRUE AND (p.suspension_expires_at IS NULL OR p.suspension_expires_at > now()))
        -- Legacy compatibility: verification_status='Suspended' with no modern expiry metadata
        OR (p.is_suspended IS NOT TRUE AND p.suspension_expires_at IS NULL AND lower(coalesce(p.verification_status, '')) = 'suspended')
      )
  );
$$;

-- 2. Harden Function Permissions
REVOKE ALL ON FUNCTION public.is_employer_job_eligible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_employer_job_eligible(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_employer_job_eligible(uuid) TO anon;

-- 3. Replace Recursive Jobs SELECT Policy
DROP POLICY IF EXISTS "Public and candidates view open jobs" ON public.jobs;
DROP POLICY IF EXISTS "Public can view open jobs" ON public.jobs;

CREATE POLICY "Public and candidates view open jobs" ON public.jobs
  FOR SELECT
  TO authenticated, anon
  USING (
    (
      lower(coalesce(status, 'open')) = 'open'
      AND public.is_employer_job_eligible(employer_id)
    )
    OR (auth.uid() = employer_id)
    OR public.is_platform_admin()
  );

-- 4. Replace Recursive Jobs INSERT Policy
DROP POLICY IF EXISTS "Approved employers can insert pending_review jobs" ON public.jobs;
DROP POLICY IF EXISTS "Approved employers can insert jobs" ON public.jobs;
DROP POLICY IF EXISTS "Employers can insert jobs" ON public.jobs;

CREATE POLICY "Approved employers can insert jobs" ON public.jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      auth.uid() = employer_id
      AND public.is_employer_job_eligible(auth.uid())
    )
    OR public.is_platform_admin()
  );
