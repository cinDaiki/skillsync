-- ============================================================================
-- SKILLSYNC MIGRATION: PHASE 6B-3 RPC, AI MATCHING & STORAGE SECURITY HARDENING
-- File: supabase/migrations/20260825020000_phase_6_rpc_storage_hardening.sql
--
-- Security Objectives:
-- 1. Standardize ALL SECURITY DEFINER functions with SET search_path = public, pg_temp.
-- 2. Strictly minimize anon helper grants:
--    - is_employer_job_eligible(UUID) is the SINGLE helper granted to anon (needed for public job RLS).
--    - is_candidate_active(UUID) and is_platform_admin() are REVOKED from anon to prevent probing.
-- 3. Harden AI vector matching RPCs:
--    - match_jobs_for_candidate: exclude suspended employers and closed jobs.
--    - match_candidates_for_job: enforce active employer ownership and data minimization.
-- 4. Server-Authoritative Matching Computation & Write Lockdown:
--    - Direct INSERT/UPDATE/DELETE on job_matches is REVOKED from all normal clients.
--    - compute_and_save_job_match(p_job_id) derives scores strictly from database ground truth.
--      Browser clients cannot supply or forge match_score or component values.
-- 5. Storage bucket security & signed URL transition:
--    - resumes: private bucket; owner upload/delete; employer access gated by application relationship.
--    - verification-documents: highly sensitive private bucket; owner & admin only.
--    - company-assets: public read for branding; mutation owner-isolated.
--    - certificates: owner-isolated portfolio credentials.
-- 6. Column-level candidate profile data minimization:
--    - Revoke broad "Employers can view applicant profiles" direct table RLS policy on public.profiles.
--    - Employers access applicant profiles exclusively via get_employer_applicants / get_applicant_profile_safe.
-- 7. Zero RLS recursion: use STABLE SECURITY DEFINER helpers with pg_temp.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECTION 1: SEARCH_PATH STANDARDIZATION & SAFE HELPER GRANTS
-- ----------------------------------------------------------------------------

-- 1.1 Helper: is_platform_admin() (Authenticated & Admin only)
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$$;

ALTER FUNCTION public.is_platform_admin() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;

-- 1.2 Helper: is_employer_job_eligible(UUID) (Minimum needed for public job discovery)
CREATE OR REPLACE FUNCTION public.is_employer_job_eligible(target_employer_id UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = target_employer_id
      AND role = 'employer'
      AND (
        is_suspended IS FALSE
        OR (
          suspension_expires_at IS NOT NULL
          AND suspension_expires_at <= NOW()
        )
      )
      AND verification_status IN ('Approved', 'Verified')
  );
$$;

ALTER FUNCTION public.is_employer_job_eligible(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_employer_job_eligible(UUID) FROM PUBLIC;
-- Granted to anon specifically because public job discovery RLS evaluates this helper
GRANT EXECUTE ON FUNCTION public.is_employer_job_eligible(UUID) TO authenticated, anon, service_role;

-- 1.3 Helper: is_candidate_active(UUID) (Authenticated only — revoked from anon)
CREATE OR REPLACE FUNCTION public.is_candidate_active(p_candidate_id UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = p_candidate_id
      AND role = 'candidate'
      AND (
        is_suspended IS FALSE
        OR (
          suspension_expires_at IS NOT NULL
          AND suspension_expires_at <= NOW()
        )
      )
  );
$$;

ALTER FUNCTION public.is_candidate_active(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_candidate_active(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_candidate_active(UUID) TO authenticated, service_role;

-- 1.4 Admin Dashboard Stats RPC
CREATE OR REPLACE FUNCTION public.admin_get_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden: Admin authorization required.';
  END IF;

  RETURN json_build_object(
    'job_seekers', (SELECT count(*)::int FROM public.profiles WHERE role IN ('candidate', 'job_seeker')),
    'employers',   (SELECT count(*)::int FROM public.profiles WHERE role = 'employer'),
    'total_jobs',  (SELECT count(*)::int FROM public.jobs),
    'open_jobs',   (SELECT count(*)::int FROM public.jobs WHERE status = 'open'),
    'closed_jobs', (SELECT count(*)::int FROM public.jobs WHERE status = 'closed'),
    'total_applications', (SELECT count(*)::int FROM public.applications)
  );
END;
$$;

ALTER FUNCTION public.admin_get_dashboard_stats() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_get_dashboard_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_dashboard_stats() TO authenticated, service_role;

-- 1.5 Admin Get All Profiles RPC
CREATE OR REPLACE FUNCTION public.admin_get_all_profiles()
RETURNS SETOF public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden: Admin authorization required.';
  END IF;

  RETURN QUERY
  SELECT * FROM public.profiles ORDER BY created_at DESC NULLS LAST;
END;
$$;

ALTER FUNCTION public.admin_get_all_profiles() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_get_all_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_all_profiles() TO authenticated, service_role;

-- 1.6 Admin Get All Resumes RPC
CREATE OR REPLACE FUNCTION public.admin_get_all_resumes()
RETURNS TABLE(
  applicant_id UUID,
  file_url TEXT,
  file_name TEXT,
  file_size BIGINT,
  created_at TIMESTAMPTZ,
  applicant_name TEXT,
  applicant_email TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden: Admin authorization required.';
  END IF;

  RETURN QUERY
  SELECT r.applicant_id, r.file_url, r.file_name, r.file_size, r.created_at,
    p.full_name AS applicant_name, p.email AS applicant_email
  FROM public.resumes r
  LEFT JOIN public.profiles p ON p.id = r.applicant_id
  ORDER BY r.created_at DESC NULLS LAST;
END;
$$;

ALTER FUNCTION public.admin_get_all_resumes() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_get_all_resumes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_all_resumes() TO authenticated, service_role;

-- 1.7 Admin Get All Jobs RPC
CREATE OR REPLACE FUNCTION public.admin_get_all_jobs()
RETURNS TABLE(
  id UUID,
  title TEXT,
  description TEXT,
  employment_type TEXT,
  location TEXT,
  required_skills TEXT,
  status TEXT,
  employer_id UUID,
  created_at TIMESTAMPTZ,
  employer_name TEXT,
  employer_email TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden: Admin authorization required.';
  END IF;

  RETURN QUERY
  SELECT j.id, j.title, j.description, j.employment_type, j.location,
    j.required_skills, j.status, j.employer_id, j.created_at,
    p.full_name AS employer_name, p.email AS employer_email
  FROM public.jobs j
  LEFT JOIN public.profiles p ON p.id = j.employer_id
  ORDER BY j.created_at DESC NULLS LAST;
END;
$$;

ALTER FUNCTION public.admin_get_all_jobs() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_get_all_jobs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_all_jobs() TO authenticated, service_role;

-- 1.8 Admin Get All Applications RPC
CREATE OR REPLACE FUNCTION public.admin_get_all_applications()
RETURNS TABLE(
  id UUID,
  job_id UUID,
  applicant_id UUID,
  status TEXT,
  created_at TIMESTAMPTZ,
  applicant_snapshot JSONB,
  job_title TEXT,
  job_employment_type TEXT,
  job_location TEXT,
  job_required_skills TEXT,
  job_employer_id UUID,
  employer_name TEXT,
  employer_email TEXT,
  applicant_name TEXT,
  applicant_email TEXT,
  resume_file_url TEXT,
  resume_file_name TEXT,
  resume_file_size BIGINT,
  resume_created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden: Admin authorization required.';
  END IF;

  RETURN QUERY
  SELECT a.id, a.job_id, a.applicant_id, a.status, a.created_at, a.applicant_snapshot,
    j.title, j.employment_type, j.location, j.required_skills, j.employer_id,
    emp.full_name, emp.email,
    COALESCE(p.full_name, a.applicant_snapshot->>'full_name'),
    COALESCE(p.email, a.applicant_snapshot->>'email'),
    COALESCE(r.file_url, a.applicant_snapshot->'resume'->>'file_url'),
    COALESCE(r.file_name, a.applicant_snapshot->'resume'->>'file_name'),
    COALESCE(r.file_size, (a.applicant_snapshot->'resume'->>'file_size')::bigint),
    COALESCE(r.created_at, (a.applicant_snapshot->'resume'->>'created_at')::timestamptz)
  FROM public.applications a
  JOIN public.jobs j ON j.id = a.job_id
  LEFT JOIN public.profiles p ON p.id = a.applicant_id
  LEFT JOIN public.profiles emp ON emp.id = j.employer_id
  LEFT JOIN public.resumes r ON r.applicant_id = a.applicant_id
  ORDER BY a.created_at DESC;
END;
$$;

ALTER FUNCTION public.admin_get_all_applications() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_get_all_applications() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_all_applications() TO authenticated, service_role;

-- 1.9 Get Employer Applicants RPC (With Data Minimization & Hardened search_path)
CREATE OR REPLACE FUNCTION public.get_employer_applicants()
RETURNS TABLE(
  id UUID,
  job_id UUID,
  applicant_id UUID,
  status TEXT,
  created_at TIMESTAMPTZ,
  applicant_snapshot JSONB,
  job_title TEXT,
  employment_type TEXT,
  job_location TEXT,
  full_name TEXT,
  email TEXT,
  contact_number TEXT,
  skills TEXT,
  resume_file_url TEXT,
  resume_file_name TEXT,
  resume_file_size BIGINT,
  resume_created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.id, a.job_id, a.applicant_id, a.status, a.created_at, a.applicant_snapshot,
    j.title, j.employment_type, j.location,
    COALESCE(p.full_name, a.applicant_snapshot->>'full_name'),
    COALESCE(p.email, a.applicant_snapshot->>'email'),
    COALESCE(p.contact_number, a.applicant_snapshot->>'contact_number'),
    COALESCE(p.skills, a.applicant_snapshot->>'skills'),
    COALESCE(r.file_url, a.applicant_snapshot->'resume'->>'file_url'),
    COALESCE(r.file_name, a.applicant_snapshot->'resume'->>'file_name'),
    COALESCE(r.file_size, (a.applicant_snapshot->'resume'->>'file_size')::bigint),
    COALESCE(r.created_at, (a.applicant_snapshot->'resume'->>'created_at')::timestamptz)
  FROM public.applications a
  JOIN public.jobs j ON j.id = a.job_id
  LEFT JOIN public.profiles p ON p.id = a.applicant_id
  LEFT JOIN public.resumes r ON r.applicant_id = a.applicant_id
  WHERE (j.employer_id = auth.uid() AND public.is_employer_job_eligible(auth.uid()))
     OR public.is_platform_admin()
  ORDER BY a.created_at DESC;
$$;

ALTER FUNCTION public.get_employer_applicants() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_employer_applicants() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_employer_applicants() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- SECTION 2: AI VECTOR MATCHING RPCS HARDENING
-- ----------------------------------------------------------------------------

-- 2.1 match_jobs_for_candidate
CREATE OR REPLACE FUNCTION public.match_jobs_for_candidate(
  query_embedding public.vector,
  match_count integer DEFAULT 20
)
RETURNS TABLE(
  job_id UUID,
  similarity double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: Caller must be authenticated.';
  END IF;

  RETURN QUERY
  SELECT  j.id,
          CAST(1 - (j.job_embedding <=> query_embedding) AS FLOAT) AS similarity
  FROM    public.jobs j
  WHERE   j.job_embedding IS NOT NULL
    AND   LOWER(COALESCE(j.status, 'open')) = 'open'
    AND   public.is_employer_job_eligible(j.employer_id)
  ORDER BY j.job_embedding <=> query_embedding
  LIMIT   match_count;
END;
$$;

ALTER FUNCTION public.match_jobs_for_candidate(public.vector, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.match_jobs_for_candidate(public.vector, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_jobs_for_candidate(public.vector, integer) TO authenticated, service_role;

-- 2.2 match_candidates_for_job
CREATE OR REPLACE FUNCTION public.match_candidates_for_job(
  query_embedding public.vector,
  match_count integer DEFAULT 100,
  p_job_id UUID DEFAULT NULL
)
RETURNS TABLE(
  applicant_id UUID,
  similarity double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_is_admin BOOLEAN := public.is_platform_admin();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: Caller must be authenticated.';
  END IF;

  -- Caller must be active employer or admin
  IF NOT v_is_admin AND NOT public.is_employer_job_eligible(v_caller_id) THEN
    RAISE EXCEPTION 'ACCOUNT_SUSPENDED: Suspended employers cannot run candidate matching.';
  END IF;

  -- If job_id is provided, verify employer ownership
  IF p_job_id IS NOT NULL AND NOT v_is_admin THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.jobs
      WHERE id = p_job_id AND employer_id = v_caller_id
    ) THEN
      RAISE EXCEPTION 'FORBIDDEN: You do not own the specified job listing.';
    END IF;
  END IF;

  RETURN QUERY
  SELECT  r.applicant_id,
          CAST(1 - (r.resume_embedding <=> query_embedding) AS FLOAT) AS similarity
  FROM    public.resumes r
  JOIN    public.profiles p ON p.id = r.applicant_id
  WHERE   r.resume_embedding IS NOT NULL
    AND   p.is_suspended IS NOT TRUE
  ORDER BY r.resume_embedding <=> query_embedding
  LIMIT   match_count;
END;
$$;

ALTER FUNCTION public.match_candidates_for_job(public.vector, integer, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.match_candidates_for_job(public.vector, integer, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_candidates_for_job(public.vector, integer, UUID) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- SECTION 3: PUBLIC JOBS RLS POLICY & JOB_MATCHES SERVER-AUTHORITY
-- ----------------------------------------------------------------------------

-- 3.1 Public can view open jobs (excluding suspended employers)
DROP POLICY IF EXISTS "Public can view open jobs" ON public.jobs;
CREATE POLICY "Public can view open jobs"
ON public.jobs
FOR SELECT
TO authenticated, anon
USING (
  LOWER(COALESCE(status, 'open')) = 'open'
  AND public.is_employer_job_eligible(employer_id)
);

-- 3.2 job_matches Table Mutation Lockdown
-- Revoke direct mutation from normal clients to protect AI/system-generated scores
REVOKE INSERT, UPDATE, DELETE ON TABLE public.job_matches FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.job_matches TO authenticated, service_role;
GRANT ALL ON TABLE public.job_matches TO service_role;

-- Drop legacy / open policies
DROP POLICY IF EXISTS "Anyone can insert/update matches" ON public.job_matches;
DROP POLICY IF EXISTS "Employers can view matches for their jobs" ON public.job_matches;
DROP POLICY IF EXISTS "Users can view their own matches" ON public.job_matches;
DROP POLICY IF EXISTS "Users can manage own matches" ON public.job_matches;
DROP POLICY IF EXISTS "Service role manages matches" ON public.job_matches;
DROP POLICY IF EXISTS "Candidates can view own job matches" ON public.job_matches;
DROP POLICY IF EXISTS "Candidates can manage own job matches" ON public.job_matches;
DROP POLICY IF EXISTS "Employers can view matches for owned jobs" ON public.job_matches;

-- Read-only RLS policies on job_matches
CREATE POLICY "Candidates can view own job matches"
ON public.job_matches
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR public.is_platform_admin()
);

CREATE POLICY "Employers can view matches for owned jobs"
ON public.job_matches
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_matches.job_id
      AND j.employer_id = auth.uid()
  )
  AND public.is_employer_job_eligible(auth.uid())
);

-- 3.3 Server-Authoritative Matching Computation & Write RPC
-- Calculates match score strictly from database ground truth (profiles.skills, resumes.resume_embedding, jobs.required_skills)
CREATE OR REPLACE FUNCTION public.compute_and_save_job_match(
  p_job_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_job RECORD;
  v_cand_prof RECORD;
  v_cand_resume RECORD;
  v_vector_sim DOUBLE PRECISION := 0.0;
  v_skill_score INTEGER := 0;
  v_final_score INTEGER := 0;
  v_req_skills TEXT[];
  v_cand_skills TEXT[];
  v_matched_skills TEXT[] := '{}';
  v_missing_skills TEXT[] := '{}';
  v_skill TEXT;
  v_match_count INTEGER := 0;
  v_total_req INTEGER := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: Caller must be authenticated.';
  END IF;

  IF NOT public.is_candidate_active(v_user_id) THEN
    RAISE EXCEPTION 'ACCOUNT_SUSPENDED: Suspended candidates cannot calculate match scores.';
  END IF;

  SELECT id, title, required_skills, job_embedding, employer_id, status
  INTO v_job
  FROM public.jobs
  WHERE id = p_job_id;

  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND: Job listing does not exist.';
  END IF;

  IF LOWER(COALESCE(v_job.status, 'open')) <> 'open' THEN
    RAISE EXCEPTION 'JOB_CLOSED: Cannot match against a closed job listing.';
  END IF;

  IF NOT public.is_employer_job_eligible(v_job.employer_id) THEN
    RAISE EXCEPTION 'EMPLOYER_SUSPENDED: Job belongs to an ineligible employer.';
  END IF;

  -- 1. Fetch Candidate Database Truth
  SELECT id, skills, full_name INTO v_cand_prof
  FROM public.profiles
  WHERE id = v_user_id;

  SELECT applicant_id, resume_embedding, extracted_skills INTO v_cand_resume
  FROM public.resumes
  WHERE applicant_id = v_user_id;

  -- 2. Compute Vector Cosine Similarity (Server Authoritative)
  IF v_job.job_embedding IS NOT NULL AND v_cand_resume.resume_embedding IS NOT NULL THEN
    v_vector_sim := CAST(1 - (v_job.job_embedding <=> v_cand_resume.resume_embedding) AS FLOAT);
    v_vector_sim := LEAST(1.0, GREATEST(0.0, v_vector_sim));
  END IF;

  -- 3. Compute Skills Match Score (Server Authoritative)
  IF v_job.required_skills IS NOT NULL AND TRIM(v_job.required_skills) <> '' THEN
    SELECT array_agg(LOWER(TRIM(s))) INTO v_req_skills
    FROM unnest(string_to_array(v_job.required_skills, ',')) AS s
    WHERE TRIM(s) <> '';
    v_total_req := COALESCE(array_length(v_req_skills, 1), 0);
  END IF;

  IF v_cand_prof.skills IS NOT NULL AND TRIM(v_cand_prof.skills) <> '' THEN
    SELECT array_agg(LOWER(TRIM(s))) INTO v_cand_skills
    FROM unnest(string_to_array(v_cand_prof.skills, ',')) AS s
    WHERE TRIM(s) <> '';
  ELSE
    v_cand_skills := '{}';
  END IF;

  IF v_total_req > 0 THEN
    FOREACH v_skill IN ARRAY v_req_skills LOOP
      IF v_skill = ANY(v_cand_skills) THEN
        v_matched_skills := array_append(v_matched_skills, v_skill);
        v_match_count := v_match_count + 1;
      ELSE
        v_missing_skills := array_append(v_missing_skills, v_skill);
      END IF;
    END LOOP;
    v_skill_score := ROUND((v_match_count::NUMERIC / v_total_req::NUMERIC) * 100);
  ELSE
    v_skill_score := 100;
  END IF;

  -- 4. Calculate Final Authoritative Match Score (50% vector + 50% skill score, or 100% skill score if no vector)
  IF v_vector_sim > 0 THEN
    v_final_score := ROUND((v_vector_sim * 50.0) + (v_skill_score * 0.5));
  ELSE
    v_final_score := v_skill_score;
  END IF;

  v_final_score := LEAST(100, GREATEST(0, v_final_score));

  -- 5. Persist Trusted Database Record
  INSERT INTO public.job_matches (
    user_id,
    job_id,
    match_score,
    skills_score,
    match_status,
    matching_skills,
    missing_skills,
    updated_at
  )
  VALUES (
    v_user_id,
    p_job_id,
    v_final_score,
    v_skill_score,
    CASE WHEN v_final_score >= 80 THEN 'Recommended' WHEN v_final_score >= 50 THEN 'Potential' ELSE 'Low Match' END,
    to_jsonb(v_matched_skills),
    to_jsonb(v_missing_skills),
    NOW()
  )
  ON CONFLICT (user_id, job_id)
  DO UPDATE SET
    match_score = EXCLUDED.match_score,
    skills_score = EXCLUDED.skills_score,
    match_status = EXCLUDED.match_status,
    matching_skills = EXCLUDED.matching_skills,
    missing_skills = EXCLUDED.missing_skills,
    updated_at = NOW();

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'job_id', p_job_id,
    'match_score', v_final_score,
    'skills_score', v_skill_score,
    'vector_similarity', v_vector_sim,
    'matching_skills', v_matched_skills,
    'missing_skills', v_missing_skills
  );
END;
$$;

ALTER FUNCTION public.compute_and_save_job_match(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.compute_and_save_job_match(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_and_save_job_match(UUID) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- SECTION 4: SERVER-AUTHORITATIVE RESUME ACCESS & SIGNED URL AUTHORIZATION
-- ----------------------------------------------------------------------------

-- 4.1 Server-Authoritative Resume Access Authorization RPC
CREATE OR REPLACE FUNCTION public.create_applicant_resume_signed_url(
  p_application_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_is_admin BOOLEAN := public.is_platform_admin();
  v_app RECORD;
  v_resume_path TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: Caller must be authenticated.';
  END IF;

  SELECT a.id, a.applicant_id, a.job_id, a.applicant_snapshot, j.employer_id
  INTO v_app
  FROM public.applications a
  JOIN public.jobs j ON j.id = a.job_id
  WHERE a.id = p_application_id;

  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'APPLICATION_NOT_FOUND: Application not found.';
  END IF;

  -- Caller must be the employer who owns the job, or the candidate applicant, or admin
  IF NOT v_is_admin AND v_app.employer_id <> v_caller_id AND v_app.applicant_id <> v_caller_id THEN
    RAISE EXCEPTION 'FORBIDDEN: You do not have permission to access this applicant resume.';
  END IF;

  -- If employer, must be eligible
  IF NOT v_is_admin AND v_app.employer_id = v_caller_id THEN
    IF NOT public.is_employer_job_eligible(v_caller_id) THEN
      RAISE EXCEPTION 'ACCOUNT_SUSPENDED: Suspended employers cannot access applicant resumes.';
    END IF;
  END IF;

  -- Extract resume storage path from application snapshot or resumes table
  v_resume_path := v_app.applicant_snapshot->'resume'->>'file_url';
  IF v_resume_path IS NULL THEN
    SELECT file_url INTO v_resume_path
    FROM public.resumes
    WHERE applicant_id = v_app.applicant_id
    LIMIT 1;
  END IF;

  IF v_resume_path IS NULL THEN
    RAISE EXCEPTION 'RESUME_NOT_FOUND: No resume associated with this application.';
  END IF;

  RETURN jsonb_build_object(
    'application_id', v_app.id,
    'applicant_id', v_app.applicant_id,
    'storage_path', v_resume_path,
    'expires_in_seconds', 900
  );
END;
$$;

ALTER FUNCTION public.create_applicant_resume_signed_url(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_applicant_resume_signed_url(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_applicant_resume_signed_url(UUID) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- SECTION 5: CANDIDATE PROFILE DATA MINIMIZATION & DIRECT SELECT CLOSURE
-- ----------------------------------------------------------------------------

-- 5.1 Drop generic direct Employer SELECT on profiles to close column-level leakage
DROP POLICY IF EXISTS "Employers can view applicant profiles" ON public.profiles;

-- 5.2 Safe RPC: get_applicant_profile_safe
CREATE OR REPLACE FUNCTION public.get_applicant_profile_safe(
  p_applicant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_is_admin BOOLEAN := public.is_platform_admin();
  v_prof RECORD;
  v_has_relationship BOOLEAN := false;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: Caller must be authenticated.';
  END IF;

  -- Caller is the applicant themselves
  IF v_caller_id = p_applicant_id THEN
    v_has_relationship := true;
  END IF;

  -- Caller is an employer whose job the candidate applied to
  IF NOT v_has_relationship AND NOT v_is_admin THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.applications a
      JOIN public.jobs j ON j.id = a.job_id
      WHERE a.applicant_id = p_applicant_id
        AND j.employer_id = v_caller_id
        AND public.is_employer_job_eligible(v_caller_id)
    ) INTO v_has_relationship;
  END IF;

  IF NOT v_has_relationship AND NOT v_is_admin THEN
    RAISE EXCEPTION 'FORBIDDEN: You do not have permission to view this applicant profile.';
  END IF;

  SELECT id, full_name, email, contact_number, address, skills, education,
         work_experience, certifications, portfolio_links, social_links,
         profile_picture_url, created_at, updated_at
  INTO v_prof
  FROM public.profiles
  WHERE id = p_applicant_id;

  IF v_prof.id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', v_prof.id,
    'full_name', v_prof.full_name,
    'email', v_prof.email,
    'contact_number', v_prof.contact_number,
    'address', v_prof.address,
    'skills', v_prof.skills,
    'education', v_prof.education,
    'work_experience', v_prof.work_experience,
    'certifications', v_prof.certifications,
    'portfolio_links', v_prof.portfolio_links,
    'social_links', v_prof.social_links,
    'profile_picture_url', v_prof.profile_picture_url,
    'created_at', v_prof.created_at,
    'updated_at', v_prof.updated_at
  );
END;
$$;

ALTER FUNCTION public.get_applicant_profile_safe(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_applicant_profile_safe(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_applicant_profile_safe(UUID) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- SECTION 6: STORAGE BUCKET RLS POLICIES (CONDITIONAL DEFINITION)
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'objects'
  ) THEN
    -- Resumes Storage Policies
    DROP POLICY IF EXISTS "Resumes Owner Upload" ON storage.objects;
    DROP POLICY IF EXISTS "Resumes Owner & Linked Employer Select" ON storage.objects;
    DROP POLICY IF EXISTS "Resumes Owner Delete" ON storage.objects;

    CREATE POLICY "Resumes Owner Upload"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'resumes'
      AND (
        (storage.foldername(name))[1] = auth.uid()::text
        OR (storage.foldername(name))[1] = 'avatars'
        OR (storage.foldername(name))[1] = 'verifications'
        OR public.is_platform_admin()
      )
    );

    CREATE POLICY "Resumes Owner & Linked Employer Select"
    ON storage.objects FOR SELECT TO authenticated
    USING (
      bucket_id = 'resumes'
      AND (
        (storage.foldername(name))[1] = auth.uid()::text
        OR (storage.foldername(name))[1] = 'avatars'
        OR public.is_platform_admin()
        OR EXISTS (
          SELECT 1
          FROM public.applications a
          JOIN public.jobs j ON j.id = a.job_id
          WHERE a.applicant_id::text = (storage.foldername(name))[1]
            AND j.employer_id = auth.uid()
            AND public.is_employer_job_eligible(auth.uid())
        )
      )
    );

    CREATE POLICY "Resumes Owner Delete"
    ON storage.objects FOR DELETE TO authenticated
    USING (
      bucket_id = 'resumes'
      AND (
        (storage.foldername(name))[1] = auth.uid()::text
        OR public.is_platform_admin()
      )
    );

    -- Verification Documents Policies (Private: Owner & Admin Only)
    DROP POLICY IF EXISTS "Verification Docs Owner Upload" ON storage.objects;
    DROP POLICY IF EXISTS "Verification Docs Owner & Admin Select" ON storage.objects;
    DROP POLICY IF EXISTS "Verification Docs Owner Delete" ON storage.objects;

    CREATE POLICY "Verification Docs Owner Upload"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id IN ('employer_verification', 'verifications', 'verification-documents')
      AND (
        (storage.foldername(name))[1] = auth.uid()::text
        OR public.is_platform_admin()
      )
    );

    CREATE POLICY "Verification Docs Owner & Admin Select"
    ON storage.objects FOR SELECT TO authenticated
    USING (
      bucket_id IN ('employer_verification', 'verifications', 'verification-documents')
      AND (
        (storage.foldername(name))[1] = auth.uid()::text
        OR public.is_platform_admin()
      )
    );

    CREATE POLICY "Verification Docs Owner Delete"
    ON storage.objects FOR DELETE TO authenticated
    USING (
      bucket_id IN ('employer_verification', 'verifications', 'verification-documents')
      AND (
        (storage.foldername(name))[1] = auth.uid()::text
        OR public.is_platform_admin()
      )
    );

    -- Company Branding / Assets Policies (Public Read, Owner Isolated Write)
    DROP POLICY IF EXISTS "Company Assets Public Select" ON storage.objects;
    DROP POLICY IF EXISTS "Company Assets Owner Write" ON storage.objects;
    DROP POLICY IF EXISTS "Company Assets Owner Delete" ON storage.objects;

    CREATE POLICY "Company Assets Public Select"
    ON storage.objects FOR SELECT TO authenticated, anon
    USING (
      bucket_id IN ('company_branding', 'company-assets')
    );

    CREATE POLICY "Company Assets Owner Write"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id IN ('company_branding', 'company-assets')
      AND (
        (storage.foldername(name))[1] = auth.uid()::text
        OR public.is_platform_admin()
      )
    );

    CREATE POLICY "Company Assets Owner Delete"
    ON storage.objects FOR DELETE TO authenticated
    USING (
      bucket_id IN ('company_branding', 'company-assets')
      AND (
        (storage.foldername(name))[1] = auth.uid()::text
        OR public.is_platform_admin()
      )
    );

    -- Certificates Policies (Candidate-Owned)
    DROP POLICY IF EXISTS "Certificates Owner Write" ON storage.objects;
    DROP POLICY IF EXISTS "Certificates Owner & Employer Select" ON storage.objects;
    DROP POLICY IF EXISTS "Certificates Owner Delete" ON storage.objects;

    CREATE POLICY "Certificates Owner Write"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'certificates'
      AND (
        (storage.foldername(name))[1] = auth.uid()::text
        OR public.is_platform_admin()
      )
    );

    CREATE POLICY "Certificates Owner & Employer Select"
    ON storage.objects FOR SELECT TO authenticated
    USING (
      bucket_id = 'certificates'
      AND (
        (storage.foldername(name))[1] = auth.uid()::text
        OR public.is_platform_admin()
        OR EXISTS (
          SELECT 1
          FROM public.applications a
          JOIN public.jobs j ON j.id = a.job_id
          WHERE a.applicant_id::text = (storage.foldername(name))[1]
            AND j.employer_id = auth.uid()
            AND public.is_employer_job_eligible(auth.uid())
        )
      )
    );

    CREATE POLICY "Certificates Owner Delete"
    ON storage.objects FOR DELETE TO authenticated
    USING (
      bucket_id = 'certificates'
      AND (
        (storage.foldername(name))[1] = auth.uid()::text
        OR public.is_platform_admin()
      )
    );

  END IF;
END $$;
