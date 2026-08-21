-- ==============================================================================
-- SkillSync Phase 1.5: Suspended Employer Job Activity & Application Safety Gate
-- Migration: 20260821000000_phase_1_5_employer_job_freeze.sql
-- ==============================================================================

-- 1. Security-Definer RPC: Get Suspended Employer IDs
-- Allows authenticated candidates to check which employer IDs are suspended
-- without exposing sensitive profile columns (email, phone, address, etc.)
CREATE OR REPLACE FUNCTION public.get_suspended_employer_ids(p_employer_ids uuid[])
RETURNS TABLE(id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id
  FROM public.profiles p
  WHERE p.id = ANY(p_employer_ids)
    AND (
      p.is_suspended IS TRUE
      OR lower(coalesce(p.verification_status, '')) = 'suspended'
    );
$$;

REVOKE ALL ON FUNCTION public.get_suspended_employer_ids(uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_suspended_employer_ids(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_suspended_employer_ids(uuid[]) TO authenticated;


-- 2. Security-Definer RPC: Get Available Open Jobs
-- Returns only candidate/public-safe columns for open jobs from Approved or Verified non-suspended employers.
-- Explicitly excludes internal administrative/moderation fields (rejection_reason, moderation_count, reviewed_by).
CREATE OR REPLACE FUNCTION public.get_available_jobs()
RETURNS TABLE (
  id uuid,
  employer_id uuid,
  title text,
  description text,
  department text,
  location text,
  work_setup text,
  employment_type text,
  salary_range text,
  required_skills text,
  required_certifications text,
  required_education text,
  experience_required text,
  number_of_openings integer,
  deadline date,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    j.id,
    j.employer_id,
    j.title,
    j.description,
    j.department,
    j.location,
    j.work_setup,
    j.employment_type,
    j.salary_range,
    j.required_skills,
    j.required_certifications,
    j.required_education,
    j.experience_required,
    j.number_of_openings,
    j.deadline,
    j.status,
    j.created_at,
    j.updated_at
  FROM public.jobs j
  JOIN public.profiles p ON p.id = j.employer_id
  WHERE j.status = 'open'
    AND p.is_suspended IS NOT TRUE
    AND lower(coalesce(p.verification_status, '')) IN ('approved', 'verified')
  ORDER BY j.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_available_jobs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_available_jobs() TO authenticated, anon;


-- 3. Security-Definer RPC: Submit Job Application (Authoritative Atomic Safety Gate)
-- Validates Candidate (auth, role, suspension, verification), Job (open, exists), and Employer (approved/verified, not suspended)
-- before performing the applications table insert.
CREATE OR REPLACE FUNCTION public.submit_job_application(
  p_job_id uuid,
  p_applicant_id uuid,
  p_applicant_snapshot jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job RECORD;
  v_employer RECORD;
  v_candidate RECORD;
  v_new_app RECORD;
BEGIN
  -- A. Validate Caller Authentication
  IF auth.uid() IS NULL OR auth.uid() != p_applicant_id THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: Caller must be an authenticated candidate matching applicant ID.';
  END IF;

  -- B. Validate Candidate Profile & Role
  SELECT * INTO v_candidate FROM public.profiles WHERE id = p_applicant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CANDIDATE_NOT_FOUND: Candidate profile not found.';
  END IF;

  IF lower(coalesce(v_candidate.role, '')) NOT IN ('candidate', 'job_seeker', 'jobseeker') THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ROLE: Only candidates and job seekers can submit job applications.';
  END IF;

  IF v_candidate.is_suspended IS TRUE THEN
    RAISE EXCEPTION 'ACCOUNT_SUSPENDED: Your account has been suspended by an administrator.';
  END IF;

  IF lower(coalesce(v_candidate.verification_status, '')) NOT IN ('verified', 'approved') THEN
    RAISE EXCEPTION 'IDENTITY_VERIFICATION_REQUIRED: Your identity must be verified before applying to jobs.';
  END IF;

  -- C. Validate Job Record
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id;
  IF NOT FOUND OR v_job.status != 'open' OR v_job.employer_id IS NULL THEN
    RAISE EXCEPTION 'JOB_UNAVAILABLE: This position is temporarily unavailable for applications.';
  END IF;

  -- D. Validate Employer Account Status
  SELECT * INTO v_employer FROM public.profiles WHERE id = v_job.employer_id;
  IF NOT FOUND
     OR v_employer.is_suspended IS TRUE
     OR lower(coalesce(v_employer.verification_status, '')) NOT IN ('approved', 'verified')
  THEN
    RAISE EXCEPTION 'JOB_UNAVAILABLE: This position is temporarily unavailable for applications.';
  END IF;

  -- E. Prevent Duplicate Application
  IF EXISTS (SELECT 1 FROM public.applications WHERE job_id = p_job_id AND applicant_id = p_applicant_id) THEN
    RAISE EXCEPTION 'DUPLICATE_APPLICATION: You have already applied for this position.';
  END IF;

  -- F. Atomic Insert into Applications Table
  INSERT INTO public.applications (
    job_id,
    applicant_id,
    status,
    applicant_snapshot,
    created_at
  )
  VALUES (
    p_job_id,
    p_applicant_id,
    'applied',
    p_applicant_snapshot,
    now()
  )
  RETURNING * INTO v_new_app;

  RETURN to_jsonb(v_new_app);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_job_application(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_job_application(uuid, uuid, jsonb) TO authenticated;
