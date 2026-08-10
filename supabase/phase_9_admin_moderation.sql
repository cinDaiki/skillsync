-- ============================================================
-- SkillSync Phase 9: Admin Moderation & System Schema Migration
-- Safe, Idempotent, Production-Ready
-- ============================================================

-- 1. Extend jobs table for Moderation Cycle tracking
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS resubmitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moderation_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.profiles(id);

-- 2. Ensure Admin FOR SELECT policy on candidate_profiles table
DROP POLICY IF EXISTS "Admins can view all candidate profiles" ON public.candidate_profiles;
CREATE POLICY "Admins can view all candidate profiles" ON public.candidate_profiles
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

-- 3. Ensure Admin FOR UPDATE policy on jobs table
DROP POLICY IF EXISTS "Admins can update all jobs" ON public.jobs;
CREATE POLICY "Admins can update all jobs" ON public.jobs
  FOR UPDATE TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- 4. Ensure Admin FOR SELECT policy on employer_profiles table
DROP POLICY IF EXISTS "Admins can view all employer profiles" ON public.employer_profiles;
CREATE POLICY "Admins can view all employer profiles" ON public.employer_profiles
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

-- 5. Reload PostgREST Schema Cache
NOTIFY pgrst, 'reload schema';
