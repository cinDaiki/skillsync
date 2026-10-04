-- ==============================================================================
-- Migration: 20261004010000_phase_5_employer_weekly_job_posting_limit.sql
-- Description: Implement and enforce Phase 5 server-authoritative employer
--              weekly new-job posting limit (maximum 5 new job posts per week).
--
-- Rules:
-- 1. Weekly boundary: Monday 00:00:00 to next Monday 00:00:00 in Asia/Manila timezone.
-- 2. Only NEW job records count (created_at).
-- 3. Editing/updating/closing/reopening existing jobs does NOT consume a slot.
-- 4. Server-authoritative: enforced via create_employer_job RPC and BEFORE INSERT trigger.
-- 5. Race condition protected: transactional advisory lock on employer ID.
-- 6. Stable error code: WEEKLY_JOB_POST_LIMIT_REACHED.
-- ==============================================================================

-- Drop any accidental overload with arguments to preserve clean zero-arg signature
DROP FUNCTION IF EXISTS public.get_employer_weekly_job_usage(UUID);

-- ------------------------------------------------------------------------------
-- 1. Canonical Read-Only Helper: get_employer_weekly_job_usage()
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

  -- B. Check Caller Role & Authority
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

ALTER FUNCTION public.get_employer_weekly_job_usage() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_employer_weekly_job_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_employer_weekly_job_usage() TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 2. Authoritative Atomic RPC: create_employer_job(JSONB)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_employer_job(
  p_job_data JSONB
)
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

  -- Job fields extracted from p_job_data
  v_title TEXT;
  v_desc TEXT;
  v_job_category TEXT;
  v_job_subcategory TEXT;
  v_department TEXT;
  v_employment_type TEXT;
  v_work_setup TEXT;
  v_location TEXT;
  v_salary_range TEXT;
  v_required_skills TEXT;
  v_required_certifications TEXT;
  v_required_education TEXT;
  v_experience_required TEXT;
  v_number_of_openings INTEGER;
  v_min_match INTEGER;
  v_deadline DATE;

  v_new_job RECORD;
BEGIN
  -- A. Enforce Caller Authentication
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: Caller must be authenticated.';
  END IF;

  -- B. Enforce Active & Eligible Employer Authority
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = v_caller_id;

  IF NOT (public.is_platform_admin() OR (LOWER(COALESCE(v_caller_role, '')) = 'employer' AND public.is_employer_job_eligible(v_caller_id))) THEN
    RAISE EXCEPTION 'FORBIDDEN: Caller is not an authorized or verified employer.';
  END IF;

  -- C. Race-Condition Safety: Transactional Advisory Lock on Employer ID
  PERFORM pg_advisory_xact_lock(hashtext('employer_weekly_job_post_' || v_caller_id::text));

  -- D. Compute Asia/Manila Monday 00:00:00 Week Boundaries
  v_manila_now := timezone('Asia/Manila', now());
  v_manila_monday := date_trunc('week', v_manila_now);
  v_week_start := timezone('Asia/Manila', v_manila_monday);
  v_week_end := v_week_start + INTERVAL '7 days';

  -- E. Verify Current Usage < Weekly Limit (5)
  SELECT COUNT(*)::INTEGER INTO v_used_count
  FROM public.jobs
  WHERE employer_id = v_caller_id
    AND created_at >= v_week_start
    AND created_at < v_week_end;

  IF v_used_count >= v_weekly_limit THEN
    RAISE EXCEPTION 'WEEKLY_JOB_POST_LIMIT_REACHED: You have reached your weekly limit of 5 new job posts. You can create another job when your weekly posting window resets.';
  END IF;

  -- F. Validate and Extract Job Fields
  v_title := TRIM(p_job_data ->> 'title');
  IF v_title IS NULL OR v_title = '' THEN
    RAISE EXCEPTION 'INVALID_JOB_DATA: Job title is required.';
  END IF;

  v_desc := TRIM(p_job_data ->> 'description');
  IF v_desc IS NULL OR v_desc = '' THEN
    RAISE EXCEPTION 'INVALID_JOB_DATA: Job description is required.';
  END IF;

  v_min_match := COALESCE((p_job_data ->> 'minimum_match_percentage')::INTEGER, 70);
  IF v_min_match < 60 OR v_min_match > 90 THEN
    RAISE EXCEPTION 'INVALID_JOB_DATA: Minimum match percentage must be between 60 and 90.';
  END IF;

  v_job_category := NULLIF(TRIM(p_job_data ->> 'job_category'), '');
  v_job_subcategory := NULLIF(TRIM(p_job_data ->> 'job_subcategory'), '');
  v_department := NULLIF(TRIM(p_job_data ->> 'department'), '');
  v_employment_type := COALESCE(NULLIF(TRIM(p_job_data ->> 'employment_type'), ''), 'Full-time');
  v_work_setup := COALESCE(NULLIF(TRIM(p_job_data ->> 'work_setup'), ''), 'On-site');
  v_location := COALESCE(NULLIF(TRIM(p_job_data ->> 'location'), ''), 'Remote');
  v_salary_range := NULLIF(TRIM(p_job_data ->> 'salary_range'), '');
  v_required_skills := COALESCE(TRIM(p_job_data ->> 'required_skills'), '');
  v_required_certifications := NULLIF(TRIM(p_job_data ->> 'required_certifications'), '');
  v_required_education := NULLIF(TRIM(p_job_data ->> 'required_education'), '');
  v_experience_required := NULLIF(TRIM(p_job_data ->> 'experience_required'), '');
  v_number_of_openings := GREATEST(1, COALESCE((p_job_data ->> 'number_of_openings')::INTEGER, 1));

  IF p_job_data ->> 'deadline' IS NOT NULL AND TRIM(p_job_data ->> 'deadline') <> '' THEN
    BEGIN
      v_deadline := (p_job_data ->> 'deadline')::DATE;
    EXCEPTION WHEN OTHERS THEN
      v_deadline := NULL;
    END;
  ELSE
    v_deadline := NULL;
  END IF;

  -- G. Atomically Insert New Job Post
  INSERT INTO public.jobs (
    employer_id,
    title,
    job_category,
    job_subcategory,
    department,
    employment_type,
    work_setup,
    location,
    salary_range,
    required_skills,
    required_certifications,
    required_education,
    experience_required,
    number_of_openings,
    minimum_match_percentage,
    description,
    deadline,
    status,
    created_at,
    updated_at
  ) VALUES (
    v_caller_id,
    v_title,
    v_job_category,
    v_job_subcategory,
    v_department,
    v_employment_type,
    v_work_setup,
    v_location,
    v_salary_range,
    v_required_skills,
    v_required_certifications,
    v_required_education,
    v_experience_required,
    v_number_of_openings,
    v_min_match,
    v_desc,
    v_deadline,
    'pending_review',
    NOW(),
    NOW()
  )
  RETURNING * INTO v_new_job;

  -- Increment usage count for response
  v_used_count := v_used_count + 1;

  RETURN jsonb_build_object(
    'success', true,
    'job', to_jsonb(v_new_job),
    'usage', jsonb_build_object(
      'used_count', v_used_count,
      'weekly_limit', v_weekly_limit,
      'remaining_count', GREATEST(0, v_weekly_limit - v_used_count),
      'week_start', v_week_start,
      'week_end', v_week_end
    )
  );
END;
$$;

ALTER FUNCTION public.create_employer_job(JSONB) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_employer_job(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_employer_job(JSONB) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3. Defense-in-Depth BEFORE INSERT Trigger on public.jobs
--    Guarantees no direct client INSERT or raw API call can bypass the limit.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_employer_weekly_job_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_employer_id UUID := NEW.employer_id;
  v_weekly_limit CONSTANT INTEGER := 5;
  v_used_count INTEGER := 0;
  v_manila_now TIMESTAMP;
  v_manila_monday TIMESTAMP;
  v_week_start TIMESTAMPTZ;
  v_week_end TIMESTAMPTZ;
BEGIN
  -- Only enforce for non-admin employer job creation
  IF v_employer_id IS NOT NULL AND NOT public.is_platform_admin() THEN
    -- Serialize concurrent inserts for the same employer
    PERFORM pg_advisory_xact_lock(hashtext('employer_weekly_job_post_' || v_employer_id::text));

    -- Manila Monday boundaries
    v_manila_now := timezone('Asia/Manila', now());
    v_manila_monday := date_trunc('week', v_manila_now);
    v_week_start := timezone('Asia/Manila', v_manila_monday);
    v_week_end := v_week_start + INTERVAL '7 days';

    SELECT COUNT(*)::INTEGER INTO v_used_count
    FROM public.jobs
    WHERE employer_id = v_employer_id
      AND created_at >= v_week_start
      AND created_at < v_week_end;

    IF v_used_count >= v_weekly_limit THEN
      RAISE EXCEPTION 'WEEKLY_JOB_POST_LIMIT_REACHED: You have reached your weekly limit of 5 new job posts. You can create another job when your weekly posting window resets.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_employer_weekly_job_limit ON public.jobs;
CREATE TRIGGER trg_enforce_employer_weekly_job_limit
  BEFORE INSERT ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_employer_weekly_job_limit();

-- ------------------------------------------------------------------------------
-- 4. Reload PostgREST Schema Cache
-- ------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
