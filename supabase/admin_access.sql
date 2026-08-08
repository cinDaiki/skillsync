-- Run in Supabase SQL Editor (after employer_applicant_access.sql)
-- Lets the admin panel read all users, jobs, and applications

-- Helper: check if current user is admin (for authenticated admin accounts)
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Dashboard stats (works for local admin via RPC + SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.admin_get_dashboard_stats()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'job_seekers', (
      SELECT count(*)::int FROM profiles
      WHERE role IN ('candidate', 'job_seeker')
    ),
    'employers', (
      SELECT count(*)::int FROM profiles WHERE role = 'employer'
    ),
    'total_jobs', (SELECT count(*)::int FROM jobs),
    'open_jobs', (
      SELECT count(*)::int FROM jobs WHERE status = 'open'
    ),
    'closed_jobs', (
      SELECT count(*)::int FROM jobs WHERE status = 'closed'
    ),
    'total_applications', (SELECT count(*)::int FROM applications)
  );
$$;

-- All profiles for admin user management
CREATE OR REPLACE FUNCTION public.admin_get_all_profiles()
RETURNS SETOF profiles
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM profiles ORDER BY created_at DESC NULLS LAST;
$$;

-- All jobs with employer name/email
CREATE OR REPLACE FUNCTION public.admin_get_all_jobs()
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  employment_type text,
  location text,
  required_skills text,
  status text,
  employer_id uuid,
  created_at timestamptz,
  employer_name text,
  employer_email text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    j.id,
    j.title,
    j.description,
    j.employment_type,
    j.location,
    j.required_skills,
    j.status,
    j.employer_id,
    j.created_at,
    p.full_name AS employer_name,
    p.email AS employer_email
  FROM jobs j
  LEFT JOIN profiles p ON p.id = j.employer_id
  ORDER BY j.created_at DESC NULLS LAST;
$$;

-- RLS: authenticated users with admin role can read all profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'Admins can view all profiles'
  ) THEN
    CREATE POLICY "Admins can view all profiles"
    ON profiles FOR SELECT
    TO authenticated
    USING (public.is_platform_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'Admins can update all profiles'
  ) THEN
    CREATE POLICY "Admins can update all profiles"
    ON profiles FOR UPDATE
    TO authenticated
    USING (public.is_platform_admin())
    WITH CHECK (public.is_platform_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'Admins can delete profiles'
  ) THEN
    CREATE POLICY "Admins can delete profiles"
    ON profiles FOR DELETE
    TO authenticated
    USING (public.is_platform_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'jobs' AND policyname = 'Admins can manage all jobs'
  ) THEN
    CREATE POLICY "Admins can manage all jobs"
    ON jobs FOR ALL
    TO authenticated
    USING (public.is_platform_admin())
    WITH CHECK (public.is_platform_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'applications' AND policyname = 'Admins can view all applications'
  ) THEN
    CREATE POLICY "Admins can view all applications"
    ON applications FOR SELECT
    TO authenticated
    USING (public.is_platform_admin());
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_get_dashboard_stats() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_all_profiles() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_all_jobs() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
