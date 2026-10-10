-- ==============================================================================
-- SkillSync Recruitment Workflow V2: Phase 4B Candidate Application Eligibility Enforcement
-- Migration: 20260831000000_candidate_application_match_eligibility.sql
--
-- Scope:
--   1. Create public.get_job_application_eligibility(UUID)
--      - Returns authoritative score, employer minimum threshold, and eligibility boolean
--      - Uses fresh persisted score if available, or computes on-demand
--   2. Update public.submit_job_application(UUID, UUID, JSONB)
--      - Always computes fresh authoritative match score via compute_and_save_job_match
--      - Enforces: authoritative_match_score >= job.minimum_match_percentage
--      - Rejects below-threshold attempts with APPLICATION_THRESHOLD_NOT_MET error
--      - Preserves all existing security gates (auth, role, suspension, verification,
--        job status, employer status, duplicate prevention)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Read-Only Authoritative Application Eligibility RPC
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_job_application_eligibility(
  p_job_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_job RECORD;
  v_employer RECORD;
  v_candidate RECORD;
  v_already_applied BOOLEAN := FALSE;
  v_is_fresh BOOLEAN := FALSE;
  v_match_score INTEGER := 0;
  v_match_status TEXT := 'Skills Gap';
  v_matching_skills JSONB := '[]'::jsonb;
  v_missing_skills JSONB := '[]'::jsonb;
  v_threshold INTEGER := 70;
  v_eligible BOOLEAN := FALSE;
  v_match_result JSONB;
BEGIN
  -- A. Derive and validate authenticated caller
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: Caller must be an authenticated user.';
  END IF;

  -- B. Validate Candidate Profile & Role
  SELECT id, role, is_suspended, suspension_expires_at, verification_status
  INTO v_candidate
  FROM public.profiles
  WHERE id = v_caller_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CANDIDATE_NOT_FOUND: Candidate profile not found.';
  END IF;

  IF LOWER(COALESCE(v_candidate.role, '')) NOT IN ('candidate', 'job_seeker', 'jobseeker') THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ROLE: Only candidates and job seekers can check job application eligibility.';
  END IF;

  IF NOT public.is_candidate_active(v_caller_id) THEN
    RAISE EXCEPTION 'ACCOUNT_SUSPENDED: Suspended candidates cannot evaluate job application eligibility.';
  END IF;

  -- C. Validate Job Listing
  SELECT id, status, employer_id, minimum_match_percentage
  INTO v_job
  FROM public.jobs
  WHERE id = p_job_id;

  IF NOT FOUND OR LOWER(COALESCE(v_job.status, 'open')) <> 'open' OR v_job.employer_id IS NULL THEN
    RAISE EXCEPTION 'JOB_UNAVAILABLE: This position is temporarily unavailable for applications.';
  END IF;

  -- D. Validate Employer Status
  IF NOT public.is_employer_job_eligible(v_job.employer_id) THEN
    RAISE EXCEPTION 'JOB_UNAVAILABLE: This position is temporarily unavailable for applications.';
  END IF;

  -- E. Check Duplicate Application Status
  SELECT EXISTS (
    SELECT 1 FROM public.applications
    WHERE job_id = p_job_id AND applicant_id = v_caller_id
  ) INTO v_already_applied;

  -- F. Resolve Authoritative Match Score (Fresh Cached vs On-Demand Recomputed)
  v_threshold := COALESCE(v_job.minimum_match_percentage, 70);
  v_is_fresh := public.is_job_match_fresh(v_caller_id, p_job_id);

  IF v_is_fresh THEN
    -- Reuse fresh persisted score
    SELECT
      match_score,
      match_status,
      matching_skills,
      missing_skills
    INTO
      v_match_score,
      v_match_status,
      v_matching_skills,
      v_missing_skills
    FROM public.job_matches
    WHERE user_id = v_caller_id AND job_id = p_job_id;
  END IF;

  -- Fallback to authoritative computation if absent, stale, or incomplete
  IF NOT v_is_fresh OR v_match_score IS NULL THEN
    v_match_result := public.compute_and_save_job_match(p_job_id);
    v_match_score := (v_match_result->>'match_score')::INTEGER;
    v_match_status := COALESCE(v_match_result->>'match_status', 'Skills Gap');
    v_matching_skills := COALESCE(v_match_result->'matching_skills', '[]'::jsonb);
    v_missing_skills := COALESCE(v_match_result->'missing_skills', '[]'::jsonb);
  END IF;

  v_eligible := (v_match_score >= v_threshold);

  RETURN jsonb_build_object(
    'job_id', p_job_id,
    'match_score', v_match_score,
    'minimum_match_percentage', v_threshold,
    'eligible', v_eligible,
    'already_applied', v_already_applied,
    'matching_skills', v_matching_skills,
    'missing_skills', v_missing_skills,
    'match_status', v_match_status
  );
END;
$$;

ALTER FUNCTION public.get_job_application_eligibility(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_job_application_eligibility(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_job_application_eligibility(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 2. Update submit_job_application RPC with Authoritative Match Threshold Gate
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_job_application(
  p_job_id uuid,
  p_applicant_id uuid,
  p_applicant_snapshot jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id uuid;
  v_job RECORD;
  v_employer RECORD;
  v_candidate RECORD;
  v_new_app RECORD;
  v_match_result JSONB;
  v_authoritative_score INTEGER := 0;
  v_threshold INTEGER := 70;
BEGIN
  -- A. Derive and validate authenticated caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: Caller must be an authenticated user.';
  END IF;

  -- IDOR Protection: If caller explicitly passed applicant_id, ensure it strictly matches caller
  IF p_applicant_id IS NOT NULL AND p_applicant_id <> v_caller_id THEN
    RAISE EXCEPTION 'FORBIDDEN_IDOR: Cannot submit application on behalf of another candidate.';
  END IF;

  -- B. Validate Candidate Profile & Role
  SELECT * INTO v_candidate FROM public.profiles WHERE id = v_caller_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CANDIDATE_NOT_FOUND: Candidate profile not found.';
  END IF;

  IF lower(COALESCE(v_candidate.role, '')) NOT IN ('candidate', 'job_seeker', 'jobseeker') THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ROLE: Only candidates and job seekers can submit job applications.';
  END IF;

  -- Effective candidate suspension gate (Phase 4 / Phase 1.5)
  IF (v_candidate.is_suspended IS TRUE AND (v_candidate.suspension_expires_at IS NULL OR v_candidate.suspension_expires_at > now()))
     OR (v_candidate.is_suspended IS NOT TRUE AND v_candidate.suspension_expires_at IS NULL AND lower(COALESCE(v_candidate.verification_status, '')) = 'suspended')
  THEN
    RAISE EXCEPTION 'ACCOUNT_SUSPENDED: Your account has been suspended by an administrator.';
  END IF;

  IF lower(COALESCE(v_candidate.verification_status, '')) NOT IN ('verified', 'approved') THEN
    RAISE EXCEPTION 'IDENTITY_VERIFICATION_REQUIRED: Your identity must be verified before applying to jobs.';
  END IF;

  -- C. Validate Job Record
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id;
  IF NOT FOUND OR v_job.status != 'open' OR v_job.employer_id IS NULL THEN
    RAISE EXCEPTION 'JOB_UNAVAILABLE: This position is temporarily unavailable for applications.';
  END IF;

  -- D. Validate Employer Account Status (Effective Suspension Gate)
  SELECT * INTO v_employer FROM public.profiles WHERE id = v_job.employer_id;
  IF NOT FOUND
     OR (v_employer.is_suspended IS TRUE AND (v_employer.suspension_expires_at IS NULL OR v_employer.suspension_expires_at > now()))
     OR (v_employer.is_suspended IS NOT TRUE AND v_employer.suspension_expires_at IS NULL AND lower(COALESCE(v_employer.verification_status, '')) = 'suspended')
     OR lower(COALESCE(v_employer.verification_status, '')) NOT IN ('approved', 'verified')
  THEN
    RAISE EXCEPTION 'JOB_UNAVAILABLE: This position is temporarily unavailable for applications.';
  END IF;

  -- E. Prevent Duplicate Application
  IF EXISTS (SELECT 1 FROM public.applications WHERE job_id = p_job_id AND applicant_id = v_caller_id) THEN
    RAISE EXCEPTION 'DUPLICATE_APPLICATION: You have already applied for this position.';
  END IF;

  -- F. Authoritative Match Score Recomputation & Employer Threshold Enforcement
  v_threshold := COALESCE(v_job.minimum_match_percentage, 70);

  -- Always recompute authoritative score on application submission to eliminate staleness / races
  v_match_result := public.compute_and_save_job_match(p_job_id);
  v_authoritative_score := (v_match_result->>'match_score')::INTEGER;

  IF v_authoritative_score < v_threshold THEN
    RAISE EXCEPTION 'APPLICATION_THRESHOLD_NOT_MET: Your current SkillSync match score is %. This employer requires at least %.',
      (v_authoritative_score || '%'), (v_threshold || '%');
  END IF;

  -- G. Atomic Insert into Applications Table
  INSERT INTO public.applications (
    job_id,
    applicant_id,
    status,
    applicant_snapshot,
    match_score,
    created_at,
    updated_at
  )
  VALUES (
    p_job_id,
    v_caller_id,
    'applied',
    p_applicant_snapshot,
    v_authoritative_score,
    now(),
    now()
  )
  RETURNING * INTO v_new_app;

  RETURN to_jsonb(v_new_app);
END;
$$;

ALTER FUNCTION public.submit_job_application(uuid, uuid, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.submit_job_application(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_job_application(uuid, uuid, jsonb) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3. Reload PostgREST Schema Cache
-- ------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
