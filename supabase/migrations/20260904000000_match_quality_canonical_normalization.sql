-- ==============================================================================
-- SkillSync Recruitment Workflow V2: Phase 4B Match Quality Canonical Normalization
-- Migration: 20260904000000_match_quality_canonical_normalization.sql
--
-- Scope:
--   1. Centralized skill parsing and decomposition (commas, newlines, semicolons, bullets, compound phrases, legacy strings).
--   2. Authoritative skill normalization and alias parity (HTML5 <-> HTML, CSS3 <-> CSS, ReactJS <-> React, NodeJS <-> Node, Basic SQL <-> SQL, Git/GitHub).
--   3. Conservative skill family matching (SQL family: MySQL, PostgreSQL; Office family: Word, Excel).
--   4. Document requirement delimiter standardization (||DOC_REQ: and legacy [DOCUMENT_REQUIREMENTS] stripped).
--   5. Certification qualification prose filtering so general descriptions never activate credentials penalty.
--   6. Parity between client-side explanations and server-authoritative compute_and_save_job_match.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Skill Name Normalization Helper with Conservative Aliases
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
  
  -- Standardize dots, slashes, dashes, underscores
  v_s := REGEXP_REPLACE(v_s, '\.js$', '');
  v_s := REGEXP_REPLACE(v_s, '[\/\-\_\\]', ' ', 'g');
  v_s := REGEXP_REPLACE(v_s, '\s+', ' ', 'g');
  v_s := TRIM(v_s);

  -- Canonical alias normalization
  IF v_s = 'html5' THEN v_s := 'html';
  ELSIF v_s = 'css3' THEN v_s := 'css';
  ELSIF v_s = 'reactjs' OR v_s = 'react js' THEN v_s := 'react';
  ELSIF v_s = 'nodejs' OR v_s = 'node js' THEN v_s := 'node';
  ELSIF v_s = 'vuejs' OR v_s = 'vue js' THEN v_s := 'vue';
  ELSIF v_s = 'angularjs' OR v_s = 'angular js' THEN v_s := 'angular';
  ELSIF v_s = 'basic sql' THEN v_s := 'sql';
  ELSIF v_s = 'responsive web design' THEN v_s := 'responsive design';
  ELSIF v_s = 'ms office' THEN v_s := 'microsoft office';
  ELSIF v_s = 'ms word' THEN v_s := 'microsoft word';
  ELSIF v_s = 'ms excel' THEN v_s := 'microsoft excel';
  ELSIF v_s = 'git github' THEN v_s := 'git';
  ELSIF v_s = 'java script' THEN v_s := 'javascript';
  END IF;

  RETURN v_s;
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. Centralized Skill String Parsing Function
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.parse_skills_to_array(p_raw TEXT)
RETURNS TEXT[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_trimmed TEXT;
  v_res TEXT[] := '{}';
  v_item TEXT;
  v_cleaned TEXT;
  v_elem JSONB;
  v_has_delimiters BOOLEAN;
  v_dict_skills CONSTANT TEXT[] := ARRAY[
    'responsive web design', 'web development', 'software engineering',
    'problem solving', 'time management', 'customer service',
    'attention to detail', 'critical thinking', 'email management',
    'calendar management', 'data entry', 'microsoft office',
    'google workspace', 'internet research', 'administrative support',
    'rest api', 'front end', 'back end', 'full stack', 'graphic design',
    'technical support', 'project management', 'react native',
    'javascript', 'typescript', 'python', 'react', 'angular', 'vue',
    'node', 'html', 'css', 'git', 'github', 'sql', 'mysql', 'postgresql',
    'communication', 'teamwork', 'adaptability', 'leadership',
    'organization', 'documentation', 'collaboration', 'accounting',
    'bookkeeping', 'nursing', 'excel', 'word'
  ];
  v_dict_term TEXT;
  v_pos INTEGER;
  v_found_terms TEXT[] := '{}';
  v_found_pos INTEGER[] := '{}';
  v_i INTEGER;
  v_j INTEGER;
  v_temp_t TEXT;
  v_temp_p INTEGER;
BEGIN
  IF p_raw IS NULL OR TRIM(p_raw) = '' THEN
    RETURN '{}';
  END IF;

  v_trimmed := TRIM(p_raw);

  -- Check if JSON array format
  IF LEFT(v_trimmed, 1) = '[' AND RIGHT(v_trimmed, 1) = ']' THEN
    BEGIN
      FOR v_elem IN SELECT jsonb_array_elements_text(v_trimmed::jsonb) LOOP
        v_item := TRIM(v_elem #>> '{}');
        IF v_item <> '' AND NOT (v_item = ANY(v_res)) THEN
          v_res := array_append(v_res, v_item);
        END IF;
      END LOOP;
      IF array_length(v_res, 1) > 0 THEN
        RETURN v_res;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Fall through to plain text parsing
    END;
  END IF;

  -- Check if raw string contains explicit delimiters before applying decompositions
  v_has_delimiters := (v_trimmed ~ '[,\n\r;•|]');

  -- Safe decomposition of compound skill phrases
  v_cleaned := REGEXP_REPLACE(v_trimmed, '(?i)\bhtml\s*(&|\/)\s*css\b', 'HTML, CSS', 'g');
  v_cleaned := REGEXP_REPLACE(v_cleaned, '(?i)\bgit\s*(\/|&)\s*github\b', 'Git, GitHub', 'g');
  v_cleaned := REGEXP_REPLACE(v_cleaned, '(?i)\bbasic\s+sql\b', 'SQL', 'g');

  IF v_has_delimiters OR (v_cleaned ~ '[,\n\r;•|]') THEN
    FOR v_item IN SELECT TRIM(x) FROM regexp_split_to_table(v_cleaned, '[,\r\n;•|]+') AS x LOOP
      v_item := TRIM(REGEXP_REPLACE(v_item, '^[\s\-\*•\d\.\)]+', ''));
      IF v_item <> '' AND NOT (v_item = ANY(v_res)) THEN
        v_res := array_append(v_res, v_item);
      END IF;
    END LOOP;
    IF array_length(v_res, 1) > 0 THEN
      RETURN v_res;
    END IF;
  END IF;

  -- Legacy malformed un-delimited string fallback: scan for dictionary terms
  FOREACH v_dict_term IN ARRAY v_dict_skills LOOP
    v_pos := POSITION(v_dict_term IN LOWER(v_cleaned));
    IF v_pos > 0 THEN
      v_found_terms := array_append(v_found_terms, v_dict_term);
      v_found_pos := array_append(v_found_pos, v_pos);
    END IF;
  END LOOP;

  IF array_length(v_found_terms, 1) > 1 THEN
    -- Sort extracted terms by their appearance position in the string
    FOR v_i IN 1..array_length(v_found_pos, 1) - 1 LOOP
      FOR v_j IN (v_i + 1)..array_length(v_found_pos, 1) LOOP
        IF v_found_pos[v_i] > v_found_pos[v_j] THEN
          v_temp_p := v_found_pos[v_i];
          v_found_pos[v_i] := v_found_pos[v_j];
          v_found_pos[v_j] := v_temp_p;

          v_temp_t := v_found_terms[v_i];
          v_found_terms[v_i] := v_found_terms[v_j];
          v_found_terms[v_j] := v_temp_t;
        END IF;
      END LOOP;
    END LOOP;

    FOREACH v_dict_term IN ARRAY v_found_terms LOOP
      v_item := INITCAP(v_dict_term);
      IF LOWER(v_dict_term) = 'html' THEN v_item := 'HTML';
      ELSIF LOWER(v_dict_term) = 'css' THEN v_item := 'CSS';
      ELSIF LOWER(v_dict_term) = 'sql' THEN v_item := 'SQL';
      ELSIF LOWER(v_dict_term) = 'javascript' THEN v_item := 'JavaScript';
      ELSIF LOWER(v_dict_term) = 'typescript' THEN v_item := 'TypeScript';
      ELSIF LOWER(v_dict_term) = 'rest api' THEN v_item := 'REST API';
      ELSIF LOWER(v_dict_term) = 'github' THEN v_item := 'GitHub';
      ELSIF LOWER(v_dict_term) = 'mysql' THEN v_item := 'MySQL';
      ELSIF LOWER(v_dict_term) = 'postgresql' THEN v_item := 'PostgreSQL';
      END IF;

      IF NOT (v_item = ANY(v_res)) THEN
        v_res := array_append(v_res, v_item);
      END IF;
    END LOOP;
    RETURN v_res;
  END IF;

  RETURN ARRAY[v_trimmed];
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. Robust Skill Matcher Helper with Conservative Families
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

  -- Alphanumeric match
  c_clean := REGEXP_REPLACE(c, '[\s\-_]', '', 'g');
  r_clean := REGEXP_REPLACE(r, '[\s\-_]', '', 'g');
  IF c_clean = r_clean THEN RETURN TRUE; END IF;

  -- SQL Family: MySQL, PostgreSQL, SQLite, PL/SQL satisfy SQL requirement
  IF r = 'sql' AND (c = 'mysql' OR c = 'postgresql' OR c = 'postgres' OR c = 'sqlite' OR c = 'plsql' OR c = 'tsql') THEN
    RETURN TRUE;
  END IF;

  -- Git / GitHub equivalence
  IF (r = 'git' AND c = 'github') OR (r = 'github' AND c = 'git') THEN
    RETURN TRUE;
  END IF;

  -- HTML / CSS equivalence
  IF (r = 'html' AND c = 'html5') OR (r = 'html5' AND c = 'html') THEN
    RETURN TRUE;
  END IF;
  IF (r = 'css' AND c = 'css3') OR (r = 'css3' AND c = 'css') THEN
    RETURN TRUE;
  END IF;

  -- Responsive design
  IF (r = 'responsive design' OR r = 'responsive web design') AND 
     (c = 'responsive design' OR c = 'responsive web design') THEN
    RETURN TRUE;
  END IF;

  -- Office Suite Family
  IF r = 'microsoft office' AND (c = 'microsoft word' OR c = 'microsoft excel' OR c = 'ms office' OR c = 'excel' OR c = 'word') THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. Authoritative compute_and_save_job_match with Centralized Normalization
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
    FOREACH v_item IN ARRAY public.parse_skills_to_array(v_cand_prof.skills) LOOP
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
        FOREACH v_skill IN ARRAY public.parse_skills_to_array(v_item) LOOP
          v_skill := public.normalize_skill_name(v_skill);
          IF v_skill <> '' AND NOT (v_skill = ANY(v_cand_skills)) THEN
            v_cand_skills := array_append(v_cand_skills, v_skill);
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  IF v_cand_resume.extracted_skills IS NOT NULL AND TRIM(v_cand_resume.extracted_skills) <> '' THEN
    FOREACH v_item IN ARRAY public.parse_skills_to_array(v_cand_resume.extracted_skills) LOOP
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
    FOREACH v_item IN ARRAY public.parse_skills_to_array(v_job.required_skills) LOOP
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
    v_has_embeddings := FALSE;
    v_w_semantic := 0.0;
    v_vector_sim := 0.0;
    v_semantic_pct := 0;
  END IF;

  -- ============================================================================
  -- 8. FACTOR 6: CREDENTIALS (10% - APPLICABLE ONLY WHEN REAL CERTS REQUIRED)
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

  -- Strip encoded ||DOC_REQ: and [DOCUMENT_REQUIREMENTS] from job required certifications
  v_clean_certs_raw := REGEXP_REPLACE(COALESCE(v_job.required_certifications, ''), '(\|\|DOC_REQ:[\s\S]*$|\[DOCUMENT_REQUIREMENTS\][\s\S]*$)', '', 'g');
  
  IF TRIM(v_clean_certs_raw) <> '' THEN
    FOR v_item IN SELECT LOWER(TRIM(s)) FROM unnest(string_to_array(v_clean_certs_raw, ',')) AS s LOOP
      v_item := TRIM(v_item);
      -- Filter out empty items and general qualification prose
      IF v_item <> '' AND LENGTH(v_item) <= 60 AND NOT (
        v_item ~* '(fresh graduate|willing to work|bachelor|college|degree|years?\s+(of\s+)?experience|experience\s+in|good\s+communication|must\s+be|candidate\s+must|graduate\s+of|at\s+least|resume|transcript|diploma|government\s+id|clearance)'
      ) THEN
        IF NOT (v_item = ANY(v_clean_req_certs)) THEN
          v_clean_req_certs := array_append(v_clean_req_certs, v_item);
        END IF;
      END IF;
    END LOOP;
  END IF;

  IF COALESCE(array_length(v_clean_req_certs, 1), 0) > 0 THEN
    v_has_req_certs := TRUE;
    v_w_creds := 0.10;
  ELSE
    -- No legitimate certifications required by employer: do not penalize candidate
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

  -- Safeguard against division by zero
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
GRANT EXECUTE ON FUNCTION public.normalize_skill_name(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.parse_skills_to_array(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_skill_match(TEXT, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 5. Reload PostgREST Schema Cache
-- ------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
