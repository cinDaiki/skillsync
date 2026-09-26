-- ==============================================================================
-- SkillSync Recruitment Workflow V2: Phase 4A Authoritative Match Score Unification
-- Migration: 20260830000000_unify_job_match_scoring.sql
--
-- Scope:
--   1. Port the canonical 6-factor scoring engine from client (jobFitEngine.js)
--      into PostgreSQL server-authoritative functions:
--        - Required Skills (35%)
--        - Transferable Skills (15%)
--        - Education Compatibility (15%)
--        - Experience Compatibility (15%)
--        - Semantic Relevance (10%)
--        - Credentials / Certifications (10%)
--   2. Update compute_and_save_job_match(UUID) to persist the authoritative 6-factor
--      score into public.job_matches.match_score.
--   3. Create is_job_match_fresh(UUID, UUID) for Phase 4B freshness verification.
--   4. Preserve strict SECURITY DEFINER search_path and execution privileges.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Skill Name Normalization Helper
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_skill_name(p_skill TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_s TEXT;
BEGIN
  IF p_skill IS NULL OR TRIM(p_skill) = '' THEN
    RETURN '';
  END IF;
  v_s := LOWER(TRIM(p_skill));
  
  -- Standardize common file extensions / symbol variations
  v_s := REGEXP_REPLACE(v_s, '\.js$', 'js');
  v_s := REGEXP_REPLACE(v_s, '[\/\-\_\\]', ' ', 'g');
  v_s := REGEXP_REPLACE(v_s, '\s+', ' ', 'g');
  v_s := TRIM(v_s);

  -- Industry agnostic aliases (exact parity with normalization.js)
  IF v_s = 'ms office' THEN v_s := 'microsoft office';
  ELSIF v_s = 'java script' THEN v_s := 'javascript';
  ELSIF v_s = 'react js' THEN v_s := 'reactjs';
  ELSIF v_s = 'node js' THEN v_s := 'nodejs';
  ELSIF v_s = 'vue js' THEN v_s := 'vuejs';
  ELSIF v_s = 'angular js' THEN v_s := 'angularjs';
  END IF;

  RETURN v_s;
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. Safe Skill Matcher Helper
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_skill_match(p_cand_skill TEXT, p_req_skill TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  c TEXT := public.normalize_skill_name(p_cand_skill);
  r TEXT := public.normalize_skill_name(p_req_skill);
  c_clean TEXT;
  r_clean TEXT;
BEGIN
  IF c = '' OR r = '' THEN RETURN FALSE; END IF;
  IF c = r THEN RETURN TRUE; END IF;
  IF LENGTH(c) < 3 OR LENGTH(r) < 3 THEN RETURN FALSE; END IF;

  c_clean := REGEXP_REPLACE(c, '[\s\-_]', '', 'g');
  r_clean := REGEXP_REPLACE(r, '[\s\-_]', '', 'g');
  RETURN c_clean = r_clean;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. Education Compatibility Evaluator
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.evaluate_education_compatibility(
  p_cand_edu TEXT,
  p_job_edu TEXT,
  p_job_title TEXT,
  p_job_desc TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_cand TEXT := LOWER(COALESCE(p_cand_edu, ''));
  v_job_edu TEXT := LOWER(COALESCE(p_job_edu, ''));
  v_title TEXT := LOWER(COALESCE(p_job_title, ''));
  v_desc TEXT := LOWER(COALESCE(p_job_desc, ''));
  v_is_general_role BOOLEAN;
BEGIN
  -- Strip json bracket/formatting artifacts if any
  v_cand := TRIM(REGEXP_REPLACE(v_cand, '[\[\]\{\}\"]', '', 'g'));

  -- 1. No education requirement or general requirement -> 100%
  IF v_job_edu = '' OR v_job_edu = 'none' OR v_job_edu LIKE '%any%' OR v_job_edu LIKE '%high school%' OR v_job_edu LIKE '%optional%' THEN
    RETURN 100;
  END IF;

  -- 2. Candidate degree directly satisfies requirement
  IF v_cand <> '' AND (POSITION(v_job_edu IN v_cand) > 0 OR POSITION(v_cand IN v_job_edu) > 0) THEN
    RETURN 100;
  END IF;

  -- 3. Relevant degree match (IT/Software/Computer)
  IF (v_cand LIKE '%it%' OR v_cand LIKE '%computer%' OR v_cand LIKE '%software%') THEN
    IF (v_title LIKE '%developer%' OR v_title LIKE '%web%' OR v_title LIKE '%software%' OR v_title LIKE '%it%') THEN
      RETURN 100;
    END IF;
  END IF;

  -- 4. Non-penalizing: Candidate holds a degree applying to general / entry-level / service roles
  v_is_general_role := (
    v_title LIKE '%service%' OR v_title LIKE '%crew%' OR v_title LIKE '%support%' OR
    v_title LIKE '%assistant%' OR v_title LIKE '%cashier%' OR v_title LIKE '%clerk%' OR
    v_desc LIKE '%entry level%' OR v_job_edu NOT LIKE '%bachelor%'
  );

  IF v_cand <> '' AND v_is_general_role THEN
    RETURN 100;
  END IF;

  -- 5. Degree present but job requires specific specialized degree
  IF LENGTH(v_cand) > 3 THEN
    RETURN 70;
  END IF;

  -- 6. Minimum baseline when candidate education is unstated
  RETURN 50;
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. Experience Compatibility Evaluator
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.evaluate_experience_compatibility(
  p_cand_years NUMERIC,
  p_job_exp_req TEXT,
  p_job_title TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_cand_years NUMERIC := COALESCE(p_cand_years, 0);
  v_req_years NUMERIC := 0;
  v_matches TEXT[];
  v_title TEXT := LOWER(COALESCE(p_job_title, ''));
  v_is_entry_level BOOLEAN;
BEGIN
  IF p_job_exp_req IS NOT NULL AND p_job_exp_req <> '' THEN
    v_matches := REGEXP_MATCH(p_job_exp_req, '\d+');
    IF v_matches IS NOT NULL AND v_matches[1] IS NOT NULL THEN
      v_req_years := v_matches[1]::NUMERIC;
    END IF;
  END IF;

  v_is_entry_level := (
    v_req_years <= 1 OR
    v_title LIKE '%junior%' OR v_title LIKE '%entry%' OR v_title LIKE '%associate%' OR v_title LIKE '%crew%'
  );

  -- 1. Entry level job -> fresh grad (0 years) gets 100%
  IF v_is_entry_level AND v_cand_years >= 0 THEN
    RETURN 100;
  END IF;

  -- 2. Candidate meets or exceeds required years
  IF v_cand_years >= v_req_years THEN
    RETURN 100;
  END IF;

  -- 3. Candidate has partial experience -> scale proportionately
  IF v_req_years > 0 AND v_cand_years > 0 THEN
    RETURN ROUND((v_cand_years / v_req_years) * 100)::INTEGER;
  END IF;

  -- 4. No experience required specified -> 100%
  IF v_req_years = 0 THEN
    RETURN 100;
  END IF;

  -- 5. Entry baseline when 0 experience on record for higher role
  RETURN 40;
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. Credentials Compatibility Evaluator
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.evaluate_credentials_compatibility(
  p_cand_certs TEXT[],
  p_req_certs TEXT[],
  p_job_title TEXT,
  p_job_desc TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_cand_count INTEGER := COALESCE(array_length(p_cand_certs, 1), 0);
  v_req_count INTEGER := COALESCE(array_length(p_req_certs, 1), 0);
  v_title TEXT := LOWER(COALESCE(p_job_title, ''));
  v_desc TEXT := LOWER(COALESCE(p_job_desc, ''));
  v_match_count INTEGER := 0;
  v_rel_count INTEGER := 0;
  v_req TEXT;
  v_cand TEXT;
  v_word TEXT;
  v_words TEXT[];
  v_matched BOOLEAN;
  v_is_rel BOOLEAN;
BEGIN
  -- If employer specified required certifications
  IF v_req_count > 0 THEN
    FOREACH v_req IN ARRAY p_req_certs LOOP
      v_matched := FALSE;
      IF v_cand_count > 0 THEN
        FOREACH v_cand IN ARRAY p_cand_certs LOOP
          IF POSITION(v_req IN v_cand) > 0 OR POSITION(v_cand IN v_req) > 0 THEN
            v_matched := TRUE;
          END IF;
        END LOOP;
      END IF;
      IF v_matched THEN
        v_match_count := v_match_count + 1;
      END IF;
    END LOOP;
    RETURN ROUND((v_match_count::NUMERIC / v_req_count::NUMERIC) * 100)::INTEGER;
  END IF;

  -- Else: check if candidate certs are relevant to job title or description
  IF v_cand_count > 0 THEN
    FOREACH v_cand IN ARRAY p_cand_certs LOOP
      v_is_rel := FALSE;
      v_words := string_to_array(v_cand, ' ');
      IF v_words IS NOT NULL THEN
        FOREACH v_word IN ARRAY v_words LOOP
          IF LENGTH(v_word) > 3 AND (POSITION(v_word IN v_title) > 0 OR POSITION(v_word IN v_desc) > 0) THEN
            v_is_rel := TRUE;
          END IF;
        END LOOP;
      END IF;
      IF v_is_rel THEN
        v_rel_count := v_rel_count + 1;
      END IF;
    END LOOP;
    IF v_rel_count > 0 THEN
      RETURN LEAST(100, 70 + v_rel_count * 15)::INTEGER;
    END IF;
  END IF;

  -- Baseline when no certs required and none relevant
  RETURN 50;
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. Server-Authoritative 6-Factor Matching RPC
-- ------------------------------------------------------------------------------
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
  v_cand_ext RECORD;
  v_cand_resume RECORD;

  -- Controlled transferable skills dictionary (exact parity with jobFitEngine.js)
  v_controlled_transferable CONSTANT TEXT[] := ARRAY[
    'communication', 'customer service', 'teamwork', 'problem solving',
    'time management', 'adaptability', 'leadership', 'organization',
    'attention to detail', 'documentation', 'interpersonal skills',
    'collaboration', 'client relations', 'work ethic', 'critical thinking'
  ];

  -- Candidate evidence arrays
  v_cand_skills TEXT[] := '{}';
  v_cand_certs TEXT[] := '{}';
  v_cand_edu_str TEXT := '';
  v_cand_years NUMERIC := 0;

  -- Job requirements arrays
  v_req_skills TEXT[] := '{}';
  v_clean_req_certs TEXT[] := '{}';
  v_trans_job_skills TEXT[] := '{}';
  v_explicit_job_skills TEXT[] := '{}';

  -- Evaluation tracking
  v_matched_req_skills TEXT[] := '{}';
  v_missing_req_skills TEXT[] := '{}';
  v_matched_trans_skills TEXT[] := '{}';
  v_matched_certs TEXT[] := '{}';
  v_clean_certs_raw TEXT := '';

  -- Component scores (0-100)
  v_req_skill_score INTEGER := 100;
  v_trans_score INTEGER := 70;
  v_edu_score INTEGER := 50;
  v_exp_score INTEGER := 40;
  v_semantic_pct INTEGER := 0;
  v_creds_score INTEGER := 50;

  -- Vector similarity (0.0 to 1.0)
  v_vector_sim DOUBLE PRECISION := 0.0;

  -- Final weighted score & tier
  v_raw_score DOUBLE PRECISION := 0.0;
  v_final_score INTEGER := 0;
  v_match_status TEXT;

  -- Loop helpers
  v_item TEXT;
  v_skill TEXT;
  v_elem JSONB;
  v_matched BOOLEAN;
  v_matched_trans_in_job INTEGER := 0;
BEGIN
  -- A. Enforce Caller Authentication
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: Caller must be authenticated.';
  END IF;

  -- B. Enforce Active Candidate Gate
  IF NOT public.is_candidate_active(v_user_id) THEN
    RAISE EXCEPTION 'ACCOUNT_SUSPENDED: Suspended candidates cannot calculate match scores.';
  END IF;

  -- C. Fetch Job Ground Truth
  SELECT id, title, required_skills, required_education, experience_required,
         required_certifications, description, job_embedding, employer_id, status
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

  -- D. Fetch Candidate Ground Truth Across Profiles & Resumes
  SELECT id, skills, certifications, education, work_experience, full_name
  INTO v_cand_prof
  FROM public.profiles
  WHERE id = v_user_id;

  SELECT user_id, course, degree, education_level, skills, certifications, years_experience
  INTO v_cand_ext
  FROM public.candidate_profiles
  WHERE user_id = v_user_id;

  SELECT applicant_id, resume_embedding, extracted_skills
  INTO v_cand_resume
  FROM public.resumes
  WHERE applicant_id = v_user_id;

  -- ============================================================================
  -- 1. AGGREGATE CANDIDATE SKILL EVIDENCE
  -- ============================================================================
  -- From profiles.skills (comma-separated)
  IF v_cand_prof.skills IS NOT NULL AND TRIM(v_cand_prof.skills) <> '' THEN
    FOR v_item IN SELECT TRIM(s) FROM unnest(string_to_array(v_cand_prof.skills, ',')) AS s LOOP
      IF v_item <> '' THEN
        v_skill := public.normalize_skill_name(v_item);
        IF v_skill <> '' AND NOT (v_skill = ANY(v_cand_skills)) THEN
          v_cand_skills := array_append(v_cand_skills, v_skill);
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- From candidate_profiles.skills (JSONB array)
  IF v_cand_ext.skills IS NOT NULL AND jsonb_typeof(v_cand_ext.skills) = 'array' THEN
    FOR v_elem IN SELECT jsonb_array_elements(v_cand_ext.skills) LOOP
      v_item := TRIM(v_elem #>> '{}');
      IF v_item IS NOT NULL AND v_item <> '' THEN
        v_skill := public.normalize_skill_name(v_item);
        IF v_skill <> '' AND NOT (v_skill = ANY(v_cand_skills)) THEN
          v_cand_skills := array_append(v_cand_skills, v_skill);
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- From resumes.extracted_skills (comma-separated)
  IF v_cand_resume.extracted_skills IS NOT NULL AND TRIM(v_cand_resume.extracted_skills) <> '' THEN
    FOR v_item IN SELECT TRIM(s) FROM unnest(string_to_array(v_cand_resume.extracted_skills, ',')) AS s LOOP
      IF v_item <> '' THEN
        v_skill := public.normalize_skill_name(v_item);
        IF v_skill <> '' AND NOT (v_skill = ANY(v_cand_skills)) THEN
          v_cand_skills := array_append(v_cand_skills, v_skill);
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- ============================================================================
  -- 2. PARSE JOB REQUIRED SKILLS (EXPLICIT VS TRANSFERABLE)
  -- ============================================================================
  IF v_job.required_skills IS NOT NULL AND TRIM(v_job.required_skills) <> '' THEN
    FOR v_item IN SELECT TRIM(s) FROM unnest(string_to_array(v_job.required_skills, ',')) AS s LOOP
      IF v_item <> '' THEN
        v_skill := public.normalize_skill_name(v_item);
        IF v_skill <> '' THEN
          IF NOT (v_skill = ANY(v_req_skills)) THEN
            v_req_skills := array_append(v_req_skills, v_skill);
          END IF;
          IF v_skill = ANY(v_controlled_transferable) THEN
            IF NOT (v_skill = ANY(v_trans_job_skills)) THEN
              v_trans_job_skills := array_append(v_trans_job_skills, v_skill);
            END IF;
          ELSE
            IF NOT (v_skill = ANY(v_explicit_job_skills)) THEN
              v_explicit_job_skills := array_append(v_explicit_job_skills, v_skill);
            END IF;
          END IF;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- ============================================================================
  -- 3. FACTOR 1: REQUIRED SKILLS (35%)
  -- ============================================================================
  IF COALESCE(array_length(v_req_skills, 1), 0) > 0 THEN
    FOREACH v_skill IN ARRAY v_req_skills LOOP
      v_matched := FALSE;
      IF COALESCE(array_length(v_cand_skills, 1), 0) > 0 THEN
        FOREACH v_item IN ARRAY v_cand_skills LOOP
          IF public.is_skill_match(v_item, v_skill) THEN
            v_matched := TRUE;
          END IF;
        END LOOP;
      END IF;

      IF v_matched THEN
        v_matched_req_skills := array_append(v_matched_req_skills, v_skill);
      ELSE
        v_missing_req_skills := array_append(v_missing_req_skills, v_skill);
      END IF;
    END LOOP;

    v_req_skill_score := ROUND((COALESCE(array_length(v_matched_req_skills, 1), 0)::NUMERIC / array_length(v_req_skills, 1)::NUMERIC) * 100)::INTEGER;
  ELSE
    v_req_skill_score := 100;
  END IF;

  -- ============================================================================
  -- 4. FACTOR 2: TRANSFERABLE SKILLS (15%)
  -- ============================================================================
  -- Check transferable skills required by job
  IF COALESCE(array_length(v_trans_job_skills, 1), 0) > 0 THEN
    FOREACH v_skill IN ARRAY v_trans_job_skills LOOP
      v_matched := FALSE;
      IF COALESCE(array_length(v_cand_skills, 1), 0) > 0 THEN
        FOREACH v_item IN ARRAY v_cand_skills LOOP
          IF public.is_skill_match(v_item, v_skill) THEN
            v_matched := TRUE;
          END IF;
        END LOOP;
      END IF;
      IF v_matched THEN
        v_matched_trans_in_job := v_matched_trans_in_job + 1;
        IF NOT (v_skill = ANY(v_matched_trans_skills)) THEN
          v_matched_trans_skills := array_append(v_matched_trans_skills, v_skill);
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- Candidate also gets credit for holding transferable skills from dictionary
  IF COALESCE(array_length(v_cand_skills, 1), 0) > 0 THEN
    FOREACH v_skill IN ARRAY v_cand_skills LOOP
      IF (v_skill = ANY(v_controlled_transferable)) AND NOT (v_skill = ANY(v_matched_trans_skills)) THEN
        v_matched_trans_skills := array_append(v_matched_trans_skills, v_skill);
      END IF;
    END LOOP;
  END IF;

  IF COALESCE(array_length(v_trans_job_skills, 1), 0) > 0 THEN
    v_trans_score := ROUND((v_matched_trans_in_job::NUMERIC / array_length(v_trans_job_skills, 1)::NUMERIC) * 100)::INTEGER;
  ELSIF COALESCE(array_length(v_matched_trans_skills, 1), 0) > 0 THEN
    v_trans_score := LEAST(100, 50 + array_length(v_matched_trans_skills, 1) * 20);
  ELSE
    v_trans_score := 70;
  END IF;

  -- ============================================================================
  -- 5. FACTOR 3: EDUCATION COMPATIBILITY (15%)
  -- ============================================================================
  v_cand_edu_str := TRIM(CONCAT_WS(' ', v_cand_ext.course, v_cand_ext.degree, v_cand_ext.education_level));
  IF v_cand_edu_str = '' AND v_cand_prof.education IS NOT NULL AND jsonb_typeof(v_cand_prof.education) = 'array' THEN
    SELECT COALESCE(STRING_AGG(TRIM(CONCAT_WS(' ', elem->>'degree', elem->>'field', elem->>'course')), ' '), '')
    INTO v_cand_edu_str
    FROM jsonb_array_elements(v_cand_prof.education) AS elem;
    v_cand_edu_str := TRIM(COALESCE(v_cand_edu_str, ''));
  END IF;

  v_edu_score := public.evaluate_education_compatibility(
    v_cand_edu_str,
    v_job.required_education,
    v_job.title,
    v_job.description
  );

  -- ============================================================================
  -- 6. FACTOR 4: EXPERIENCE COMPATIBILITY (15%)
  -- ============================================================================
  v_cand_years := COALESCE(v_cand_ext.years_experience, 0);
  v_exp_score := public.evaluate_experience_compatibility(
    v_cand_years,
    v_job.experience_required,
    v_job.title
  );

  -- ============================================================================
  -- 7. FACTOR 5: SEMANTIC RELEVANCE (10%)
  -- ============================================================================
  IF v_job.job_embedding IS NOT NULL AND v_cand_resume.resume_embedding IS NOT NULL THEN
    v_vector_sim := CAST(1 - (v_job.job_embedding <=> v_cand_resume.resume_embedding) AS FLOAT);
    v_vector_sim := LEAST(1.0, GREATEST(0.0, v_vector_sim));
    v_semantic_pct := ROUND(v_vector_sim * 100)::INTEGER;
  ELSE
    v_vector_sim := 0.0;
    v_semantic_pct := 0;
  END IF;

  -- ============================================================================
  -- 8. FACTOR 6: CREDENTIALS / CERTIFICATIONS (10%)
  -- ============================================================================
  -- Parse candidate certs from candidate_profiles.certifications or profiles.certifications
  IF v_cand_ext.certifications IS NOT NULL AND jsonb_typeof(v_cand_ext.certifications) = 'array' THEN
    FOR v_elem IN SELECT jsonb_array_elements(v_cand_ext.certifications) LOOP
      v_item := LOWER(TRIM(COALESCE(v_elem ->> 'name', v_elem #>> '{}', '')));
      IF v_item <> '' AND NOT (v_item = ANY(v_cand_certs)) THEN
        v_cand_certs := array_append(v_cand_certs, v_item);
      END IF;
    END LOOP;
  END IF;

  IF v_cand_prof.certifications IS NOT NULL AND jsonb_typeof(v_cand_prof.certifications) = 'array' THEN
    FOR v_elem IN SELECT jsonb_array_elements(v_cand_prof.certifications) LOOP
      v_item := LOWER(TRIM(COALESCE(v_elem ->> 'name', v_elem #>> '{}', '')));
      IF v_item <> '' AND NOT (v_item = ANY(v_cand_certs)) THEN
        v_cand_certs := array_append(v_cand_certs, v_item);
      END IF;
    END LOOP;
  END IF;

  -- Strip encoded [DOCUMENT_REQUIREMENTS] from job required certifications
  v_clean_certs_raw := REGEXP_REPLACE(COALESCE(v_job.required_certifications, ''), '\[DOCUMENT_REQUIREMENTS\].*$', '');
  IF TRIM(v_clean_certs_raw) <> '' THEN
    FOR v_item IN SELECT LOWER(TRIM(s)) FROM unnest(string_to_array(v_clean_certs_raw, ',')) AS s LOOP
      IF v_item <> '' AND NOT (v_item = ANY(v_clean_req_certs)) THEN
        v_clean_req_certs := array_append(v_clean_req_certs, v_item);
      END IF;
    END LOOP;
  END IF;

  v_creds_score := public.evaluate_credentials_compatibility(
    v_cand_certs,
    v_clean_req_certs,
    v_job.title,
    v_job.description
  );

  -- Track matched certs
  IF COALESCE(array_length(v_clean_req_certs, 1), 0) > 0 THEN
    FOREACH v_item IN ARRAY v_clean_req_certs LOOP
      FOREACH v_skill IN ARRAY v_cand_certs LOOP
        IF (POSITION(v_item IN v_skill) > 0 OR POSITION(v_skill IN v_item) > 0) AND NOT (v_item = ANY(v_matched_certs)) THEN
          v_matched_certs := array_append(v_matched_certs, v_item);
        END IF;
      END LOOP;
    END LOOP;
  END IF;

  -- ============================================================================
  -- 9. CALCULATE UNIFIED AUTHORITATIVE JOB FIT SCORE
  -- ============================================================================
  v_raw_score :=
    (v_req_skill_score * 0.35) +
    (v_trans_score     * 0.15) +
    (v_edu_score       * 0.15) +
    (v_exp_score       * 0.15) +
    (v_semantic_pct    * 0.10) +
    (v_creds_score     * 0.10);

  v_final_score := LEAST(100, GREATEST(0, ROUND(v_raw_score)::INTEGER));

  -- Match Tier (exact parity with getJobFitTier in jobFitEngine.js)
  IF v_final_score >= 80 THEN
    v_match_status := 'Strong Match';
  ELSIF v_final_score >= 60 THEN
    v_match_status := 'Good Match';
  ELSIF v_final_score >= 40 THEN
    v_match_status := 'Potential Match';
  ELSE
    v_match_status := 'Skills Gap';
  END IF;

  -- ============================================================================
  -- 10. PERSIST AUTHORITATIVE RECORD INTO job_matches
  -- ============================================================================
  INSERT INTO public.job_matches (
    user_id,
    job_id,
    employer_id,
    match_score,
    skills_score,
    education_score,
    experience_score,
    semantic_score,
    match_status,
    matching_skills,
    missing_skills,
    matched_certs,
    match_type,
    updated_at
  )
  VALUES (
    v_user_id,
    p_job_id,
    v_job.employer_id,
    v_final_score,
    v_req_skill_score,
    v_edu_score,
    v_exp_score,
    v_semantic_pct,
    v_match_status,
    to_jsonb(v_matched_req_skills),
    to_jsonb(v_missing_req_skills),
    to_jsonb(v_matched_certs),
    'unified_6_factor',
    NOW()
  )
  ON CONFLICT (user_id, job_id)
  DO UPDATE SET
    employer_id      = EXCLUDED.employer_id,
    match_score      = EXCLUDED.match_score,
    skills_score     = EXCLUDED.skills_score,
    education_score  = EXCLUDED.education_score,
    experience_score = EXCLUDED.experience_score,
    semantic_score   = EXCLUDED.semantic_score,
    match_status     = EXCLUDED.match_status,
    matching_skills  = EXCLUDED.matching_skills,
    missing_skills   = EXCLUDED.missing_skills,
    matched_certs    = EXCLUDED.matched_certs,
    match_type       = EXCLUDED.match_type,
    updated_at       = NOW();

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'job_id', p_job_id,
    'match_score', v_final_score,
    'match_status', v_match_status,
    'breakdown', jsonb_build_object(
      'requiredSkillsScore', v_req_skill_score,
      'transferableSkillsScore', v_trans_score,
      'educationCompatibility', v_edu_score,
      'experienceCompatibility', v_exp_score,
      'semanticRelevance', v_semantic_pct,
      'credentialsScore', v_creds_score
    ),
    'vector_similarity', v_vector_sim,
    'matching_skills', v_matched_req_skills,
    'missing_skills', v_missing_req_skills,
    'matched_transferable', v_matched_trans_skills,
    'matched_certs', v_matched_certs
  );
END;
$$;

-- Function ownership & privilege hardening
ALTER FUNCTION public.compute_and_save_job_match(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.compute_and_save_job_match(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_and_save_job_match(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 7. Server-Authoritative Match Freshness Detection Helper
--    Returns TRUE if job_matches.updated_at is >= all underlying source entities
--    (jobs.updated_at, profiles.updated_at, candidate_profiles.updated_at, resumes.created_at)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_job_match_fresh(
  p_user_id UUID,
  p_job_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_match_updated TIMESTAMPTZ;
  v_job_updated TIMESTAMPTZ;
  v_prof_updated TIMESTAMPTZ;
  v_cand_prof_updated TIMESTAMPTZ;
  v_resume_created TIMESTAMPTZ;
BEGIN
  -- 1. Fetch match record timestamp
  SELECT updated_at INTO v_match_updated
  FROM public.job_matches
  WHERE user_id = p_user_id AND job_id = p_job_id;

  IF v_match_updated IS NULL THEN
    RETURN FALSE; -- No persisted match exists
  END IF;

  -- 2. Check Job Ground Truth Timestamp
  SELECT updated_at INTO v_job_updated
  FROM public.jobs
  WHERE id = p_job_id;

  IF v_job_updated IS NOT NULL AND v_match_updated < v_job_updated THEN
    RETURN FALSE; -- Job requirements have been modified since match computation
  END IF;

  -- 3. Check Main Profile Timestamp
  SELECT updated_at INTO v_prof_updated
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_prof_updated IS NOT NULL AND v_match_updated < v_prof_updated THEN
    RETURN FALSE; -- Main profile updated since match computation
  END IF;

  -- 4. Check Candidate Extended Profile Timestamp
  SELECT updated_at INTO v_cand_prof_updated
  FROM public.candidate_profiles
  WHERE user_id = p_user_id;

  IF v_cand_prof_updated IS NOT NULL AND v_match_updated < v_cand_prof_updated THEN
    RETURN FALSE; -- Candidate extended profile updated since match computation
  END IF;

  -- 5. Check Resume Creation Timestamp
  SELECT created_at INTO v_resume_created
  FROM public.resumes
  WHERE applicant_id = p_user_id;

  IF v_resume_created IS NOT NULL AND v_match_updated < v_resume_created THEN
    RETURN FALSE; -- New resume uploaded since match computation
  END IF;

  RETURN TRUE;
END;
$$;

ALTER FUNCTION public.is_job_match_fresh(UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_job_match_fresh(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_job_match_fresh(UUID, UUID) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 8. Reload PostgREST Schema Cache
-- ------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
