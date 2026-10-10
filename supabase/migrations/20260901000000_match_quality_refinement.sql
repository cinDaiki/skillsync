-- ==============================================================================
-- SkillSync Recruitment Workflow V2: Phase 4C Match Quality Refinement & Requirement-Aware Normalization
-- Migration: 20260901000000_match_quality_refinement.sql
--
-- Scope:
--   1. Requirement-Aware Scoring Principles:
--      - Criteria that a job does not require must NOT depress a candidate's score.
--      - Job requires no degree: Candidate receives 100% education compatibility.
--      - Job requires no certifications: Credential factor is excluded from denominator,
--        or evaluated as neutral/full compatibility.
--      - Entry-level / no experience required: Candidate with 0-1 years receives 100% experience.
--      - Semantic embedding missing: Technical absence is NOT treated as 0 relevance;
--        factor is excluded from denominator and remaining applicable weights normalized.
--   2. Requirement-Aware Normalization Model:
--      Final score = (Weighted Sum of APPLICABLE factors) / (Sum of APPLICABLE weights)
--   3. Maintains full server authority in compute_and_save_job_match.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Updated Education Compatibility Evaluator
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

  -- 2. General / entry-level / service / VA / support roles where degree is not strictly specialized
  v_is_general_role := (
    v_title LIKE '%service%' OR v_title LIKE '%crew%' OR v_title LIKE '%support%' OR
    v_title LIKE '%assistant%' OR v_title LIKE '%virtual assistant%' OR v_title LIKE '%cashier%' OR
    v_title LIKE '%clerk%' OR v_title LIKE '%receptionist%' OR v_desc LIKE '%entry level%' OR
    v_job_edu NOT LIKE '%bachelor%'
  );

  IF v_is_general_role THEN
    RETURN 100;
  END IF;

  -- 3. Candidate degree directly satisfies requirement
  IF v_cand <> '' AND (POSITION(v_job_edu IN v_cand) > 0 OR POSITION(v_cand IN v_job_edu) > 0) THEN
    RETURN 100;
  END IF;

  -- 4. Relevant technical / computer degree match for software/IT jobs
  IF (v_cand LIKE '%it%' OR v_cand LIKE '%computer%' OR v_cand LIKE '%software%' OR v_cand LIKE '%technology%') THEN
    IF (v_title LIKE '%developer%' OR v_title LIKE '%web%' OR v_title LIKE '%software%' OR v_title LIKE '%it%' OR v_title LIKE '%engineer%') THEN
      RETURN 100;
    END IF;
  END IF;

  -- 5. Candidate has a degree but job requires a specific specialized non-matching degree
  IF LENGTH(v_cand) > 3 THEN
    RETURN 70;
  END IF;

  -- 6. Unstated candidate education for specialized degree-required roles
  RETURN 50;
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. Updated Experience Compatibility Evaluator
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
    v_title LIKE '%junior%' OR v_title LIKE '%entry%' OR v_title LIKE '%associate%' OR
    v_title LIKE '%crew%' OR v_title LIKE '%assistant%' OR v_title LIKE '%virtual assistant%' OR
    v_title LIKE '%intern%' OR v_title LIKE '%clerk%'
  );

  -- 1. Entry level job -> fresh graduate / zero experience receives 100%
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

  -- 5. Entry baseline when 0 experience on record for higher/senior role
  RETURN 40;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. Updated Credentials Compatibility Evaluator
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
  -- If employer explicitly specified required certifications
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

  -- When no certifications are required by employer:
  -- Candidate certs can provide bonus relevance up to 100%
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

  -- Neutral 100% compatibility when no certification required
  RETURN 100;
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. Server-Authoritative Matching RPC with Requirement-Aware Normalization
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

  -- Controlled transferable skills dictionary
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
  v_edu_score INTEGER := 100;
  v_exp_score INTEGER := 100;
  v_semantic_pct INTEGER := 0;
  v_creds_score INTEGER := 100;

  -- Applicable Weights (Dynamic requirement-aware normalization)
  v_w_skills DOUBLE PRECISION := 0.35;
  v_w_trans DOUBLE PRECISION := 0.15;
  v_w_edu DOUBLE PRECISION := 0.15;
  v_w_exp DOUBLE PRECISION := 0.15;
  v_w_creds DOUBLE PRECISION := 0.0;
  v_w_semantic DOUBLE PRECISION := 0.0;
  v_total_weight DOUBLE PRECISION := 0.80;

  -- Vector similarity (0.0 to 1.0)
  v_vector_sim DOUBLE PRECISION := 0.0;
  v_has_embeddings BOOLEAN := FALSE;
  v_has_req_certs BOOLEAN := FALSE;

  -- Final weighted score & tier
  v_weighted_sum DOUBLE PRECISION := 0.0;
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
  -- 7. FACTOR 5: SEMANTIC RELEVANCE (10% - APPLICABLE ONLY WHEN EMBEDDINGS EXIST)
  -- ============================================================================
  IF v_job.job_embedding IS NOT NULL AND v_cand_resume.resume_embedding IS NOT NULL THEN
    v_has_embeddings := TRUE;
    v_w_semantic := 0.10;
    v_vector_sim := CAST(1 - (v_job.job_embedding <=> v_cand_resume.resume_embedding) AS FLOAT);
    v_vector_sim := LEAST(1.0, GREATEST(0.0, v_vector_sim));
    v_semantic_pct := ROUND(v_vector_sim * 100)::INTEGER;
  ELSE
    -- Missing technical vector is NOT penalizing
    v_has_embeddings := FALSE;
    v_w_semantic := 0.0;
    v_vector_sim := 0.0;
    v_semantic_pct := 0;
  END IF;

  -- ============================================================================
  -- 8. FACTOR 6: CREDENTIALS (10% - APPLICABLE ONLY WHEN EMPLOYER REQUIRES CERTS)
  -- ============================================================================
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

  IF COALESCE(array_length(v_clean_req_certs, 1), 0) > 0 THEN
    v_has_req_certs := TRUE;
    v_w_creds := 0.10;
  ELSE
    -- No certifications required by employer: do not penalize candidate
    v_has_req_certs := FALSE;
    v_w_creds := 0.0;
  END IF;

  v_creds_score := public.evaluate_credentials_compatibility(
    v_cand_certs,
    v_clean_req_certs,
    v_job.title,
    v_job.description
  );

  IF v_has_req_certs THEN
    FOREACH v_item IN ARRAY v_clean_req_certs LOOP
      FOREACH v_skill IN ARRAY v_cand_certs LOOP
        IF (POSITION(v_item IN v_skill) > 0 OR POSITION(v_skill IN v_item) > 0) AND NOT (v_item = ANY(v_matched_certs)) THEN
          v_matched_certs := array_append(v_matched_certs, v_item);
        END IF;
      END LOOP;
    END LOOP;
  END IF;

  -- ============================================================================
  -- 9. REQUIREMENT-AWARE NORMALIZATION MODEL
  --    Final score = (Weighted Sum of APPLICABLE factors) / (Sum of APPLICABLE weights)
  -- ============================================================================
  v_total_weight := v_w_skills + v_w_trans + v_w_edu + v_w_exp + v_w_creds + v_w_semantic;

  -- Safety safeguard against division by zero
  IF v_total_weight <= 0.0 THEN
    v_total_weight := 1.0;
  END IF;

  v_weighted_sum :=
    (v_req_skill_score * v_w_skills) +
    (v_trans_score     * v_w_trans) +
    (v_edu_score       * v_w_edu) +
    (v_exp_score       * v_w_exp) +
    (v_creds_score     * v_w_creds) +
    (v_semantic_pct    * v_w_semantic);

  v_final_score := LEAST(100, GREATEST(0, ROUND(v_weighted_sum / v_total_weight)::INTEGER));

  -- Match Tier
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
    'unified_6_factor_req_aware',
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
    'applicable_weights', jsonb_build_object(
      'skills', v_w_skills,
      'transferable', v_w_trans,
      'education', v_w_edu,
      'experience', v_w_exp,
      'credentials', v_w_creds,
      'semantic', v_w_semantic,
      'total', v_total_weight
    ),
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

ALTER FUNCTION public.compute_and_save_job_match(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.compute_and_save_job_match(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_and_save_job_match(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 5. Reload PostgREST Schema Cache
-- ------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
