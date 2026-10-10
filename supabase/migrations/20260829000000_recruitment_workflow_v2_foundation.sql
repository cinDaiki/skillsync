-- ==============================================================================
-- SkillSync Recruitment Workflow V2: Phase 2 Database & Backend Foundation
-- Migration: 20260829000000_recruitment_workflow_v2_foundation.sql
--
-- Scope:
--   1. Add minimum_match_percentage (INT, NOT NULL, DEFAULT 70) to public.jobs
--   2. Enforce jobs_minimum_match_percentage_check (BETWEEN 60 AND 90)
--   3. Create server-authoritative read-only helper get_employer_weekly_job_usage()
--      using Asia/Manila week boundaries (Monday 00:00:00 to Monday 00:00:00)
--   4. Set explicit column documentation and hardened SECURITY DEFINER privileges
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Add minimum_match_percentage to public.jobs with Default 70
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jobs'
      AND column_name = 'minimum_match_percentage'
  ) THEN
    ALTER TABLE public.jobs
      ADD COLUMN minimum_match_percentage INTEGER NOT NULL DEFAULT 70;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. Explicit Named Check Constraint (Range: 60% - 90%)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'jobs_minimum_match_percentage_check'
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_minimum_match_percentage_check
      CHECK (minimum_match_percentage BETWEEN 60 AND 90);
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. Column Documentation
-- ------------------------------------------------------------------------------
COMMENT ON COLUMN public.jobs.minimum_match_percentage IS
  'Employer-configurable minimum SkillSync match percentage required for candidate application eligibility; valid range 60-90. Default is 70.';

-- ------------------------------------------------------------------------------
-- 4. Server-Authoritative Weekly Quota Read-Only Helper
--    Computes current week usage for the authenticated employer based on
--    Asia/Manila week boundaries (Monday 00:00:00 to next Monday 00:00:00).
--    Counts strictly jobs.created_at (new job posts consume quota; edits do not).
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_employer_weekly_job_usage()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_weekly_limit CONSTANT INTEGER := 5;
  v_used_count INTEGER := 0;
  v_manila_now TIMESTAMP;
  v_manila_monday TIMESTAMP;
  v_week_start TIMESTAMPTZ;
  v_week_end TIMESTAMPTZ;
  v_caller_role TEXT;
BEGIN
  -- A. Enforce Caller Authentication
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: Caller must be authenticated.';
  END IF;

  -- B. Enforce Employer or Platform Admin Role Authority
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = v_caller_id;

  IF NOT (public.is_platform_admin() OR LOWER(COALESCE(v_caller_role, '')) = 'employer') THEN
    RAISE EXCEPTION 'FORBIDDEN: Only authenticated employers can query weekly job posting usage.';
  END IF;

  -- C. Compute Deterministic Asia/Manila Monday 00:00:00 Week Boundaries
  -- Step 1: Current local date/time in Asia/Manila
  v_manila_now := timezone('Asia/Manila', now());

  -- Step 2: Truncate to Monday 00:00:00 of the current Manila week
  v_manila_monday := date_trunc('week', v_manila_now);

  -- Step 3: Convert Manila Monday boundary back to absolute timestamptz
  v_week_start := timezone('Asia/Manila', v_manila_monday);

  -- Step 4: Next Monday 00:00:00 boundary
  v_week_end := v_week_start + INTERVAL '7 days';

  -- D. Count New Jobs Created in Current Manila Week (Edits do not alter created_at)
  SELECT COUNT(*)::INTEGER INTO v_used_count
  FROM public.jobs
  WHERE employer_id = v_caller_id
    AND created_at >= v_week_start
    AND created_at < v_week_end;

  RETURN jsonb_build_object(
    'used_count', v_used_count,
    'weekly_limit', v_weekly_limit,
    'remaining_count', GREATEST(0, v_weekly_limit - v_used_count),
    'week_start', v_week_start,
    'week_end', v_week_end
  );
END;
$$;

-- Function ownership & privilege hardening
ALTER FUNCTION public.get_employer_weekly_job_usage() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_employer_weekly_job_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_employer_weekly_job_usage() TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 5. Reload PostgREST Schema Cache
-- ------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
