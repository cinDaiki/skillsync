-- Security hardening for SkillSync admin RPCs and matching engine RLS
-- Run in Supabase SQL Editor BEFORE production deployment

-- 1. Revoke dangerous anon grants on admin functions
REVOKE EXECUTE ON FUNCTION public.admin_get_dashboard_stats() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_all_profiles() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_all_jobs() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_toggle_user_suspension(uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_update_profile(uuid, text, text, text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_user(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_all_resumes() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_all_applications() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_resume(uuid) FROM anon;

-- 2. Wrap admin RPCs with is_platform_admin() guard
CREATE OR REPLACE FUNCTION public.admin_get_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN (
    SELECT json_build_object(
      'job_seekers', (SELECT count(*)::int FROM profiles WHERE role IN ('candidate', 'job_seeker')),
      'employers', (SELECT count(*)::int FROM profiles WHERE role = 'employer'),
      'total_jobs', (SELECT count(*)::int FROM jobs),
      'open_jobs', (SELECT count(*)::int FROM jobs WHERE status = 'open'),
      'closed_jobs', (SELECT count(*)::int FROM jobs WHERE status = 'closed'),
      'total_applications', (SELECT count(*)::int FROM applications)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_all_profiles()
RETURNS SETOF profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN QUERY SELECT * FROM profiles ORDER BY created_at DESC NULLS LAST;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_toggle_user_suspension(user_id uuid, suspend_status boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  UPDATE public.profiles SET is_suspended = suspend_status WHERE id = user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_user(user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  DELETE FROM public.resumes WHERE applicant_id = user_id;
  DELETE FROM public.applications WHERE applicant_id = user_id;
  DELETE FROM public.profiles WHERE id = user_id;
END;
$$;

-- 3. Tighten job_matches RLS (replace open policy)
DROP POLICY IF EXISTS "Anyone can insert/update matches" ON public.job_matches;

CREATE POLICY "Users can manage own matches" ON public.job_matches
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role manages matches" ON public.job_matches
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 4. Restrict notification inserts to own user_id
DROP POLICY IF EXISTS "Users can insert notifications" ON notifications;
CREATE POLICY "Users can insert own notifications"
ON notifications FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

GRANT EXECUTE ON FUNCTION public.admin_get_dashboard_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_all_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_all_jobs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_toggle_user_suspension(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_profile(uuid, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_all_resumes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_all_applications() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_resume(uuid) TO authenticated;
