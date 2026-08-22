-- ==============================================================================
-- SkillSync Phase 4: Suspension Duration & Automatic Expiry
-- Migration: 20260823000000_phase_4_suspension_expiry.sql
-- ==============================================================================

-- 1. Add suspension_expires_at to profiles
-- NULL indicates an indefinite suspension. A future timestamp indicates a temporary suspension.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS suspension_expires_at timestamptz NULL;

-- 2. Add validation constraint for suspension expiry timestamp
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_suspension_expiry_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_suspension_expiry_check
      CHECK (
        suspension_expires_at IS NULL
        OR suspended_at IS NULL
        OR suspension_expires_at > suspended_at
      );
  END IF;
END $$;


-- 3. Update get_suspended_employer_ids RPC
-- Returns employer ID only if suspension is EFFECTIVELY ACTIVE (unexpired temporary or indefinite).
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
      -- Modern Phase 3/4 effective active suspension
      (p.is_suspended IS TRUE AND (p.suspension_expires_at IS NULL OR p.suspension_expires_at > now()))
      -- Legacy compatibility: verification_status='Suspended' with no modern expiry metadata
      OR (p.is_suspended IS NOT TRUE AND p.suspension_expires_at IS NULL AND lower(coalesce(p.verification_status, '')) = 'suspended')
    );
$$;

REVOKE ALL ON FUNCTION public.get_suspended_employer_ids(uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_suspended_employer_ids(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_suspended_employer_ids(uuid[]) TO authenticated;


-- 4. Update get_available_jobs RPC
-- Open jobs from an employer whose temporary suspension has expired become discoverable automatically.
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
    AND NOT (
      (p.is_suspended IS TRUE AND (p.suspension_expires_at IS NULL OR p.suspension_expires_at > now()))
      OR (p.is_suspended IS NOT TRUE AND p.suspension_expires_at IS NULL AND lower(coalesce(p.verification_status, '')) = 'suspended')
    )
    AND lower(coalesce(p.verification_status, '')) IN ('approved', 'verified')
  ORDER BY j.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_available_jobs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_available_jobs() TO authenticated, anon;


-- 5. Update submit_job_application RPC
-- Ensures candidate and employer are evaluated against effective suspension status at submission time.
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

  -- Effective candidate suspension gate
  IF (v_candidate.is_suspended IS TRUE AND (v_candidate.suspension_expires_at IS NULL OR v_candidate.suspension_expires_at > now()))
     OR (v_candidate.is_suspended IS NOT TRUE AND v_candidate.suspension_expires_at IS NULL AND lower(coalesce(v_candidate.verification_status, '')) = 'suspended')
  THEN
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

  -- D. Validate Employer Account Status (Effective Suspension Gate)
  SELECT * INTO v_employer FROM public.profiles WHERE id = v_job.employer_id;
  IF NOT FOUND
     OR (v_employer.is_suspended IS TRUE AND (v_employer.suspension_expires_at IS NULL OR v_employer.suspension_expires_at > now()))
     OR (v_employer.is_suspended IS NOT TRUE AND v_employer.suspension_expires_at IS NULL AND lower(coalesce(v_employer.verification_status, '')) = 'suspended')
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


-- 6. Security-Definer Helper: Check Employer Job Eligibility (Breaks RLS recursion cycle)
-- Evaluates whether target_employer_id is Approved/Verified and NOT effectively suspended.
-- Runs with search_path = public, pg_temp as SECURITY DEFINER to avoid circular RLS evaluation on profiles.
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

REVOKE ALL ON FUNCTION public.is_employer_job_eligible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_employer_job_eligible(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_employer_job_eligible(uuid) TO anon;


-- 7. Update Jobs RLS Policies using is_employer_job_eligible (Acyclic RLS)
-- Completely removes direct profiles SELECT from jobs RLS, breaking the recursion cycle.

DROP POLICY IF EXISTS "Public and candidates view open jobs" ON public.jobs;
DROP POLICY IF EXISTS "Public can view open jobs" ON public.jobs;
DROP POLICY IF EXISTS "Approved employers can insert pending_review jobs" ON public.jobs;
DROP POLICY IF EXISTS "Approved employers can insert jobs" ON public.jobs;
DROP POLICY IF EXISTS "Employers can insert jobs" ON public.jobs;

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


