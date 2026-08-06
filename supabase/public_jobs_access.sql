-- Run in Supabase SQL Editor.
-- Lets everyone (guests + signed-in users) READ open job listings on Browse Jobs.
-- Applying still requires sign-in in the app.

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view open jobs" ON public.jobs;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'jobs'
      AND policyname = 'Public can view open jobs'
  ) THEN
    CREATE POLICY "Public can view open jobs"
    ON public.jobs
    FOR SELECT
    TO anon, authenticated
    USING (lower(coalesce(status, 'open')) = 'open');
  END IF;
END $$;
