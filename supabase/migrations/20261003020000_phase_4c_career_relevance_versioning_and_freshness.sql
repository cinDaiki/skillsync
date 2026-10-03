-- ==============================================================================
-- Migration: 20261003020000_phase_4c_career_relevance_versioning_and_freshness.sql
-- Description: Phase 4C Career Relevance Versioning & Freshness Synchronization
--              1. Increments authoritative Career Relevance algorithm version to 2.
--              2. Preserves approved Phase 4C weights strictly:
--                 Skills 30%, Work 20%, Projects 20%, Prefs 15%, Semantic 10%, Edu 5%.
--              3. Preserves approved 4-tier legend strictly:
--                 80-100 Highly Related, 60-79 Related, 40-59 Adjacent, 0-39 Outside Primary Field.
--              4. Implements public.refresh_candidate_career_relevance(UUID) to
--                 automatically invalidate and recompute stale (v1/null) scores.
--              5. Synchronizes compute_and_save_job_match to compute Career Relevance
--                 alongside Job Fit without modifying Job Fit formulas.
--              6. Does NOT touch Production.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. AUTHORITATIVE SERVER FUNCTION: compute_and_save_career_relevance (VERSION 2)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.compute_and_save_career_relevance(
  p_job_id UUID,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := COALESCE(p_user_id, auth.uid());
  v_job RECORD;
  v_cand_prof RECORD;
  v_cand_ext RECORD;
  v_cand_resume RECORD;

  -- Algorithm version constant
  v_cr_version CONSTANT INTEGER := 2;

  -- Evidence Component Scores (0-100)
  v_score_skills INTEGER := 0;
  v_score_work INTEGER := 0;
  v_score_proj INTEGER := 0;
  v_score_pref INTEGER := 0;
  v_score_sem INTEGER := 0;
  v_score_edu INTEGER := 0;

  -- Active Weights (Sum to denominator) - Approved Phase 4C Contract
  v_w_skills DOUBLE PRECISION := 0.30;
  v_w_work DOUBLE PRECISION := 0.20;
  v_w_proj DOUBLE PRECISION := 0.20;
  v_w_pref DOUBLE PRECISION := 0.15;
  v_w_sem DOUBLE PRECISION := 0.10;
  v_w_edu DOUBLE PRECISION := 0.05;
  v_active_weight_sum DOUBLE PRECISION := 0.0;
  v_weighted_sum DOUBLE PRECISION := 0.0;
  v_final_relevance INTEGER := 0;
  v_tier TEXT := 'Outside Primary Field';

  -- Candidate data containers
  v_cand_skills TEXT[] := '{}';
  v_work_exp JSONB := '[]'::jsonb;
  v_projects JSONB := '[]'::jsonb;
  v_pref_cats TEXT[] := '{}';
  v_pref_subcats TEXT[] := '{}';
  v_pref_roles TEXT[] := '{}';
  v_cand_edu TEXT := '';

  -- Helpers
  v_elem JSONB;
  v_skill TEXT;
  v_item TEXT;
  v_domain_skills TEXT[] := '{}';
  v_matched_domain_count INTEGER := 0;
  v_vector_sim DOUBLE PRECISION := 0.0;
  v_bullets TEXT[] := '{}';
  v_has_work BOOLEAN := FALSE;
  v_has_proj BOOLEAN := FALSE;
  v_has_pref BOOLEAN := FALSE;
  v_has_edu BOOLEAN := FALSE;
  v_has_sem BOOLEAN := FALSE;

  v_title_str TEXT;
  v_desc_str TEXT;
  v_tech_str TEXT;
  v_proj_combined TEXT;
  v_resp_item TEXT;
  v_proj_score_cand INTEGER := 0;
  v_work_score_cand INTEGER := 0;
  v_pref_role_match BOOLEAN := FALSE;
  v_role_item TEXT;
  v_sub_elem JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: Caller must be authenticated or specify p_user_id.';
  END IF;

  -- 1. Fetch Job Record
  SELECT id, title, description, job_category, job_subcategory, required_skills, job_embedding, employer_id
  INTO v_job
  FROM public.jobs
  WHERE id = p_job_id;

  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND: Job % does not exist.', p_job_id;
  END IF;

  -- 2. Fetch Candidate Ground Truth Across Profiles
  SELECT id, skills, work_experience, portfolio_links, education
  INTO v_cand_ext
  FROM public.profiles
  WHERE id = v_user_id;

  SELECT course, degree, skills, preferred_categories, preferred_subcategories, preferred_roles
  INTO v_cand_prof
  FROM public.candidate_profiles
  WHERE user_id = v_user_id;

  -- Authoritative Resume Selection: latest resume for candidate
  SELECT resume_embedding, extracted_skills, parsed_details
  INTO v_cand_resume
  FROM public.resumes
  WHERE applicant_id = v_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- Parse Candidate Skills (Union profiles + candidate_profiles + resumes)
  IF v_cand_prof.skills IS NOT NULL THEN
    IF jsonb_typeof(v_cand_prof.skills) = 'array' THEN
      FOR v_elem IN SELECT jsonb_array_elements(v_cand_prof.skills) LOOP
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
    ELSIF jsonb_typeof(v_cand_prof.skills) = 'string' THEN
      FOREACH v_item IN ARRAY public.parse_skills_to_array(v_cand_prof.skills #>> '{}') LOOP
        v_skill := public.normalize_skill_name(v_item);
        IF v_skill <> '' AND NOT (v_skill = ANY(v_cand_skills)) THEN
          v_cand_skills := array_append(v_cand_skills, v_skill);
        END IF;
      END LOOP;
    END IF;
  END IF;

  IF v_cand_ext.skills IS NOT NULL AND TRIM(v_cand_ext.skills) <> '' THEN
    FOREACH v_item IN ARRAY public.parse_skills_to_array(v_cand_ext.skills) LOOP
      v_skill := public.normalize_skill_name(v_item);
      IF v_skill <> '' AND NOT (v_skill = ANY(v_cand_skills)) THEN
        v_cand_skills := array_append(v_cand_skills, v_skill);
      END IF;
    END LOOP;
  END IF;

  IF v_cand_resume.extracted_skills IS NOT NULL AND TRIM(v_cand_resume.extracted_skills) <> '' THEN
    FOREACH v_item IN ARRAY public.parse_skills_to_array(v_cand_resume.extracted_skills) LOOP
      v_skill := public.normalize_skill_name(v_item);
      IF v_skill <> '' AND NOT (v_skill = ANY(v_cand_skills)) THEN
        v_cand_skills := array_append(v_cand_skills, v_skill);
      END IF;
    END LOOP;
  END IF;

  -- Preferences
  IF v_cand_prof.preferred_categories IS NOT NULL THEN
    v_pref_cats := v_cand_prof.preferred_categories;
  END IF;
  IF v_cand_prof.preferred_subcategories IS NOT NULL THEN
    v_pref_subcats := v_cand_prof.preferred_subcategories;
  END IF;
  IF v_cand_prof.preferred_roles IS NOT NULL THEN
    v_pref_roles := v_cand_prof.preferred_roles;
  END IF;
  v_has_pref := (COALESCE(array_length(v_pref_cats, 1), 0) > 0 
                 OR COALESCE(array_length(v_pref_subcats, 1), 0) > 0 
                 OR COALESCE(array_length(v_pref_roles, 1), 0) > 0);

  -- Work Experience Evidence Precedence (Primary: profile, Fallback/Merge: resume parsed_details)
  IF v_cand_ext.work_experience IS NOT NULL 
     AND jsonb_typeof(v_cand_ext.work_experience) = 'array' 
     AND jsonb_array_length(v_cand_ext.work_experience) > 0 THEN
    v_work_exp := v_cand_ext.work_experience;
    v_has_work := TRUE;
  END IF;

  IF v_cand_resume.parsed_details IS NOT NULL 
     AND v_cand_resume.parsed_details->'experience' IS NOT NULL 
     AND jsonb_typeof(v_cand_resume.parsed_details->'experience') = 'array' 
     AND jsonb_array_length(v_cand_resume.parsed_details->'experience') > 0 THEN
    IF NOT v_has_work THEN
      v_work_exp := v_cand_resume.parsed_details->'experience';
      v_has_work := TRUE;
    ELSE
      FOR v_elem IN SELECT * FROM jsonb_array_elements(v_cand_resume.parsed_details->'experience') LOOP
        v_title_str := LOWER(COALESCE(v_elem->'title'->>'normalized', COALESCE(v_elem->'title'->>'raw', COALESCE(v_elem->>'title', ''))));
        IF v_title_str <> '' AND NOT (v_work_exp @> jsonb_build_array(v_elem)) THEN
          v_work_exp := v_work_exp || jsonb_build_array(v_elem);
        END IF;
      END LOOP;
    END IF;
  END IF;

  -- Projects / Portfolio Evidence Precedence (Primary: profile, Fallback/Merge: resume parsed_details)
  IF v_cand_ext.portfolio_links IS NOT NULL 
     AND jsonb_typeof(v_cand_ext.portfolio_links) = 'array' 
     AND jsonb_array_length(v_cand_ext.portfolio_links) > 0 THEN
    v_projects := v_cand_ext.portfolio_links;
    v_has_proj := TRUE;
  END IF;

  IF v_cand_resume.parsed_details IS NOT NULL 
     AND v_cand_resume.parsed_details->'projects' IS NOT NULL 
     AND jsonb_typeof(v_cand_resume.parsed_details->'projects') = 'array' 
     AND jsonb_array_length(v_cand_resume.parsed_details->'projects') > 0 THEN
    IF NOT v_has_proj THEN
      v_projects := v_cand_resume.parsed_details->'projects';
      v_has_proj := TRUE;
    ELSE
      FOR v_elem IN SELECT * FROM jsonb_array_elements(v_cand_resume.parsed_details->'projects') LOOP
        v_title_str := LOWER(COALESCE(v_elem->'title'->>'normalized', COALESCE(v_elem->'title'->>'raw', COALESCE(v_elem->'name'->>'normalized', COALESCE(v_elem->'name'->>'raw', COALESCE(v_elem->>'title', COALESCE(v_elem->>'name', '')))))));
        IF v_title_str <> '' AND NOT (v_projects @> jsonb_build_array(v_elem)) THEN
          v_projects := v_projects || jsonb_build_array(v_elem);
        END IF;
      END LOOP;
    END IF;
  END IF;

  -- Education
  v_cand_edu := LOWER(COALESCE(v_cand_prof.course, '') || ' ' || COALESCE(v_cand_prof.degree, ''));
  v_has_edu := (TRIM(v_cand_edu) <> '');

  -- Semantic Embeddings
  v_has_sem := (v_job.job_embedding IS NOT NULL AND v_cand_resume.resume_embedding IS NOT NULL);

  -- ============================================================================
  -- EVALUATE FACTOR 1: SKILLS-DOMAIN ALIGNMENT (30%)
  -- ============================================================================
  IF COALESCE(array_length(v_cand_skills, 1), 0) > 0 THEN
    IF v_job.job_category = 'it_software' THEN
      FOREACH v_skill IN ARRAY v_cand_skills LOOP
        IF v_skill = ANY(ARRAY[
          'html', 'css', 'javascript', 'typescript', 'react', 'reactjs', 'node', 'nodejs', 'sql', 'python',
          'git', 'github', 'php', 'laravel', 'flutter', 'dart', 'c#', 'java', 'docker', 'aws', 'rest api',
          'responsive design', 'vue', 'vuejs', 'angular', 'express', 'nextjs', 'vite', 'graphql',
          'mysql', 'postgresql', 'mongodb', 'sqlite', 'machine learning', 'tensorflow', 'pytorch',
          'power bi', 'tableau', 'kubernetes', 'azure', 'linux', 'hardware troubleshooting', 'network configuration',
          'cybersecurity', 'qa testing', 'automated testing'
        ]) THEN
          v_matched_domain_count := v_matched_domain_count + 1;
          v_domain_skills := array_append(v_domain_skills, v_skill);
        END IF;
      END LOOP;
    ELSIF v_job.job_category = 'accounting_finance' THEN
      FOREACH v_skill IN ARRAY v_cand_skills LOOP
        IF v_skill = ANY(ARRAY[
          'bookkeeping', 'quickbooks', 'xero', 'financial reporting', 'auditing', 'internal audit',
          'tax preparation', 'tax compliance', 'bir compliance', 'general ledger', 'accounts payable',
          'accounts receivable', 'payroll processing', 'bank reconciliation', 'financial analysis', 'gaap', 'ifrs'
        ]) THEN
          v_matched_domain_count := v_matched_domain_count + 1;
          v_domain_skills := array_append(v_domain_skills, v_skill);
        END IF;
      END LOOP;
    ELSIF v_job.job_category = 'healthcare' THEN
      FOREACH v_skill IN ARRAY v_cand_skills LOOP
        IF v_skill = ANY(ARRAY[
          'nursing', 'patient care', 'vital signs', 'iv therapy', 'wound care', 'phlebotomy',
          'medication administration', 'triage', 'bls', 'cpr', 'pharmacology', 'caregiving',
          'clinical laboratory', 'elderly care', 'physical therapy', 'dental care'
        ]) THEN
          v_matched_domain_count := v_matched_domain_count + 1;
          v_domain_skills := array_append(v_domain_skills, v_skill);
        END IF;
      END LOOP;
    ELSIF v_job.job_category = 'administrative_va' THEN
      FOREACH v_skill IN ARRAY v_cand_skills LOOP
        IF v_skill = ANY(ARRAY[
          'data entry', 'virtual assistance', 'administrative support', 'email management',
          'calendar management', 'google workspace', 'microsoft office', 'microsoft excel',
          'office administration', 'internet research', 'executive assistance', 'transcription', 'ecommerce management'
        ]) THEN
          v_matched_domain_count := v_matched_domain_count + 1;
          v_domain_skills := array_append(v_domain_skills, v_skill);
        END IF;
      END LOOP;
    ELSIF v_job.job_category = 'customer_service_bpo' THEN
      FOREACH v_skill IN ARRAY v_cand_skills LOOP
        IF v_skill = ANY(ARRAY[
          'customer service', 'call center', 'customer support', 'technical support', 'help desk',
          'telesales', 'zendesk', 'inbound customer care', 'chat support', 'email support', 'quality assurance'
        ]) THEN
          v_matched_domain_count := v_matched_domain_count + 1;
          v_domain_skills := array_append(v_domain_skills, v_skill);
        END IF;
      END LOOP;
    ELSIF v_job.job_category = 'food_hospitality' THEN
      FOREACH v_skill IN ARRAY v_cand_skills LOOP
        IF v_skill = ANY(ARRAY[
          'food handling', 'commercial cooking', 'food preparation', 'barista', 'cleaning and sanitation',
          'guest relations', 'cashiering', 'hotel front office', 'housekeeping', 'hospitality', 'restaurant operations'
        ]) THEN
          v_matched_domain_count := v_matched_domain_count + 1;
          v_domain_skills := array_append(v_domain_skills, v_skill);
        END IF;
      END LOOP;
    ELSIF v_job.job_category = 'retail_sales' THEN
      FOREACH v_skill IN ARRAY v_cand_skills LOOP
        IF v_skill = ANY(ARRAY[
          'retail cashiering', 'cashiering', 'store operations', 'merchandising', 'inventory management',
          'b2b sales', 'store sales', 'pos operations'
        ]) THEN
          v_matched_domain_count := v_matched_domain_count + 1;
          v_domain_skills := array_append(v_domain_skills, v_skill);
        END IF;
      END LOOP;
    ELSIF v_job.job_category = 'engineering' THEN
      FOREACH v_skill IN ARRAY v_cand_skills LOOP
        IF v_skill = ANY(ARRAY[
          'autocad', 'solidworks', 'civil engineering', 'structural engineering', 'electrical engineering',
          'mechanical engineering', 'plc', 'circuit design', 'revit'
        ]) THEN
          v_matched_domain_count := v_matched_domain_count + 1;
          v_domain_skills := array_append(v_domain_skills, v_skill);
        END IF;
      END LOOP;
    ELSIF v_job.job_category = 'marketing' THEN
      FOREACH v_skill IN ARRAY v_cand_skills LOOP
        IF v_skill = ANY(ARRAY[
          'digital marketing', 'seo', 'sem', 'social media marketing', 'copywriting', 'content strategy',
          'email marketing', 'brand management'
        ]) THEN
          v_matched_domain_count := v_matched_domain_count + 1;
          v_domain_skills := array_append(v_domain_skills, v_skill);
        END IF;
      END LOOP;
    ELSIF v_job.job_category = 'creative_design' THEN
      FOREACH v_skill IN ARRAY v_cand_skills LOOP
        IF v_skill = ANY(ARRAY[
          'ui/ux design', 'figma', 'graphic design', 'video editing', 'adobe photoshop', 'illustrator',
          'multimedia', 'animation'
        ]) THEN
          v_matched_domain_count := v_matched_domain_count + 1;
          v_domain_skills := array_append(v_domain_skills, v_skill);
        END IF;
      END LOOP;
    ELSIF v_job.job_category IS NOT NULL THEN
      FOREACH v_skill IN ARRAY v_cand_skills LOOP
        IF NOT (v_skill = ANY(ARRAY[
          'communication', 'teamwork', 'problem solving', 'time management', 'attention to detail',
          'organization', 'adaptability', 'leadership', 'critical thinking', 'work ethic', 'collaboration'
        ])) THEN
          v_matched_domain_count := v_matched_domain_count + 1;
          v_domain_skills := array_append(v_domain_skills, v_skill);
        END IF;
      END LOOP;
    ELSE
      -- Legacy Uncategorized Job: check candidate overlap with job required_skills directly
      IF v_job.required_skills IS NOT NULL AND TRIM(v_job.required_skills) <> '' THEN
        FOREACH v_item IN ARRAY public.parse_skills_to_array(v_job.required_skills) LOOP
          v_skill := public.normalize_skill_name(v_item);
          IF v_skill = ANY(v_cand_skills) AND NOT (v_skill = ANY(ARRAY[
            'communication', 'teamwork', 'problem solving', 'time management', 'attention to detail'
          ])) THEN
            v_matched_domain_count := v_matched_domain_count + 1;
            v_domain_skills := array_append(v_domain_skills, v_skill);
          END IF;
        END LOOP;
      END IF;
    END IF;

    -- Saturation threshold: 4 domain-defining skills = 100%
    v_score_skills := LEAST(100, ROUND((v_matched_domain_count::NUMERIC / 4.0) * 100)::INTEGER);
    v_active_weight_sum := v_active_weight_sum + v_w_skills;
    v_weighted_sum := v_weighted_sum + (v_score_skills * v_w_skills);

    IF v_score_skills >= 75 THEN
      v_bullets := array_append(v_bullets, 'Strong occupational skill domain evidence (' || v_matched_domain_count || ' core skills)');
    ELSIF v_score_skills >= 40 THEN
      v_bullets := array_append(v_bullets, 'Moderate skill domain overlap (' || v_matched_domain_count || ' domain skills)');
    END IF;
  ELSE
    v_w_skills := 0.0;
  END IF;

  -- ============================================================================
  -- EVALUATE FACTOR 2: WORK-HISTORY DOMAIN (20%)
  -- ============================================================================
  IF v_has_work THEN
    v_score_work := 0;
    FOR v_elem IN SELECT * FROM jsonb_array_elements(v_work_exp) LOOP
      v_title_str := LOWER(COALESCE(v_elem->'title'->>'normalized', COALESCE(v_elem->'title'->>'raw', COALESCE(v_elem->>'title', ''))));
      v_desc_str := LOWER(COALESCE(v_elem->'description'->>'normalized', COALESCE(v_elem->'description'->>'raw', COALESCE(v_elem->>'description', ''))));
      
      IF v_elem->'responsibilities' IS NOT NULL AND jsonb_typeof(v_elem->'responsibilities') = 'array' THEN
        FOR v_resp_item IN SELECT * FROM jsonb_array_elements_text(v_elem->'responsibilities') LOOP
          v_desc_str := v_desc_str || ' ' || LOWER(v_resp_item);
        END LOOP;
      ELSIF v_elem->>'responsibilities' IS NOT NULL THEN
        v_desc_str := v_desc_str || ' ' || LOWER(v_elem->>'responsibilities');
      END IF;

      v_work_score_cand := 0;

      IF v_job.job_category = 'it_software' THEN
        IF v_title_str ~* '(developer|software|engineer|programmer|web|coder|frontend|backend|fullstack|devops|data scientist|ai engineer|systems analyst)' THEN
          IF v_desc_str ~* '(code|system|app|software|web|react|database|api|develop|debug|programming|algorithm|cloud)' THEN
            v_work_score_cand := 95;
          ELSE
            v_work_score_cand := 60;
          END IF;
        ELSIF v_title_str ~* '(it|tech|support|network|system|helpdesk|hardware|administrator)' THEN
          v_work_score_cand := 80;
        ELSIF v_desc_str ~* '(code|developer|software|programming|system administration|hardware troubleshooting|database)' THEN
          v_work_score_cand := 70;
        END IF;
      ELSIF v_job.job_category = 'accounting_finance' THEN
        IF v_title_str ~* '(accountant|accounting|auditor|audit|bookkeeper|cpa|finance|financial analyst|controller)' THEN
          IF v_desc_str ~* '(ledger|tax|reconciliation|financial|audit|balance|payroll|quickbooks|gaap|bir compliance)' THEN
            v_work_score_cand := 95;
          ELSE
            v_work_score_cand := 60;
          END IF;
        ELSIF v_desc_str ~* '(accounting|financial reports|bookkeeping|general ledger|tax compliance)' THEN
          v_work_score_cand := 70;
        END IF;
      ELSIF v_job.job_category = 'healthcare' THEN
        IF v_title_str ~* '(nurse|nursing|doctor|physician|caregiver|medical|clinical|phlebotomist|therapist)' THEN
          IF v_desc_str ~* '(patient|vital signs|triage|clinical|medication|care|hospital|clinic|wound care)' THEN
            v_work_score_cand := 95;
          ELSE
            v_work_score_cand := 60;
          END IF;
        ELSIF v_desc_str ~* '(patient care|hospital|clinical|triage|vital signs)' THEN
          v_work_score_cand := 70;
        END IF;
      ELSIF v_job.job_category = 'administrative_va' THEN
        IF v_title_str ~* '(virtual assistant|va|administrative assistant|office clerk|executive assistant|data entry|encoder|data encoder|records clerk|inventory clerk|office administrator|clerk)' THEN
          IF v_desc_str ~* '(email|calendar|schedule|admin|spreadsheet|customer|travel|data|records|inventory|receiving|documents|reports|filing|clerical)' THEN
            v_work_score_cand := 95;
          ELSE
            v_work_score_cand := 60;
          END IF;
        ELSIF v_desc_str ~* '(administrative support|virtual assistant|calendar management|data entry|records management|record management|inventory records|receiving reports)' THEN
          v_work_score_cand := 70;
        END IF;
      ELSIF v_job.job_category = 'food_hospitality' THEN
        IF v_title_str ~* '(crew|server|cook|kitchen|barista|chef|cashier|waiter|waitress|hotel|hospitality|dining|food service|baker|pastry|restaurant|stockman)' THEN
          IF v_desc_str ~* '(food|beverage|cooking|kitchen|guest|counter|clean|serving|dining|baking|pastry|cakes|replenishment|store operations|restaurant)' THEN
            v_work_score_cand := 95;
          ELSE
            v_work_score_cand := 60;
          END IF;
        ELSIF v_desc_str ~* '(food service|cooking|kitchen prep|customer orders|dining supplies|pastry products|baked cakes)' THEN
          v_work_score_cand := 70;
        END IF;
      ELSIF v_job.job_category = 'retail_sales' THEN
        IF v_title_str ~* '(cashier|retail|sales|merchandiser|store associate|bagger|sales associate|shop assistant)' THEN
          IF v_desc_str ~* '(customer orders|packing|checkout|store|merchandise|pos|sales|retail|counter)' THEN
            v_work_score_cand := 95;
          ELSE
            v_work_score_cand := 60;
          END IF;
        ELSIF v_desc_str ~* '(customer orders|checkout efficiency|packing orders|merchandising)' THEN
          v_work_score_cand := 70;
        END IF;
      ELSIF v_job.job_category = 'logistics_supply_chain' THEN
        IF v_title_str ~* '(stockman|warehouse|receiving|inventory|forklift|dispatch|logistics|supply chain)' THEN
          IF v_desc_str ~* '(deliveries|inventory|warehouse|receiving|shipment|stock levels|replenishment)' THEN
            v_work_score_cand := 95;
          ELSE
            v_work_score_cand := 60;
          END IF;
        ELSIF v_desc_str ~* '(incoming deliveries|inventory transactions|warehouse staff|stock levels)' THEN
          v_work_score_cand := 70;
        END IF;
      ELSIF v_job.job_category IS NOT NULL THEN
        IF v_title_str ~* v_job.job_category THEN
          v_work_score_cand := 80;
        ELSIF v_desc_str ~* v_job.job_category THEN
          v_work_score_cand := 60;
        END IF;
      ELSE
        -- Legacy Uncategorized job: compare with job title and description
        IF v_job.title IS NOT NULL AND v_title_str ~* LOWER(v_job.title) THEN
          v_work_score_cand := 90;
        ELSIF v_job.description IS NOT NULL AND v_desc_str ~* LOWER(v_job.title) THEN
          v_work_score_cand := 65;
        END IF;
      END IF;

      -- Check for vague titles with no duties (e.g. "Staff", "Associate", "Employee")
      IF v_work_score_cand = 0 AND v_title_str ~* '(staff|associate|employee|intern|assistant)' THEN
        v_work_score_cand := 20;
      END IF;

      v_score_work := GREATEST(v_score_work, v_work_score_cand);
    END LOOP;

    v_active_weight_sum := v_active_weight_sum + v_w_work;
    v_weighted_sum := v_weighted_sum + (v_score_work * v_w_work);

    IF v_score_work >= 75 THEN
      v_bullets := array_append(v_bullets, 'Past occupational history aligns with role domain duties');
    ELSIF v_score_work >= 40 THEN
      v_bullets := array_append(v_bullets, 'Relevant responsibilities noted in previous work experience');
    END IF;
  ELSE
    v_w_work := 0.0;
  END IF;

  -- ============================================================================
  -- EVALUATE FACTOR 3: PROJECTS / PORTFOLIO (20%) - STRICT DOMAIN ALIGNMENT
  -- ============================================================================
  IF v_has_proj THEN
    v_score_proj := 0;
    FOR v_elem IN SELECT * FROM jsonb_array_elements(v_projects) LOOP
      v_title_str := LOWER(COALESCE(v_elem->'title'->>'normalized', COALESCE(v_elem->'title'->>'raw', COALESCE(v_elem->'name'->>'normalized', COALESCE(v_elem->'name'->>'raw', COALESCE(v_elem->>'title', COALESCE(v_elem->>'name', '')))))));
      v_desc_str := LOWER(COALESCE(v_elem->'description'->>'normalized', COALESCE(v_elem->'description'->>'raw', COALESCE(v_elem->>'description', ''))));
      
      v_tech_str := '';
      IF v_elem->'technologies' IS NOT NULL THEN
        IF jsonb_typeof(v_elem->'technologies') = 'array' THEN
          FOR v_sub_elem IN SELECT * FROM jsonb_array_elements(v_elem->'technologies') LOOP
            v_tech_str := v_tech_str || ' ' || LOWER(COALESCE(v_sub_elem->>'canonicalName', COALESCE(v_sub_elem->>'normalized', COALESCE(v_sub_elem->>'raw', v_sub_elem #>> '{}'))));
          END LOOP;
        ELSE
          v_tech_str := LOWER(v_elem->>'technologies');
        END IF;
      ELSIF v_elem->'techStack' IS NOT NULL THEN
        IF jsonb_typeof(v_elem->'techStack') = 'array' THEN
          FOR v_sub_elem IN SELECT * FROM jsonb_array_elements(v_elem->'techStack') LOOP
            v_tech_str := v_tech_str || ' ' || LOWER(COALESCE(v_sub_elem->>'canonicalName', COALESCE(v_sub_elem->>'normalized', COALESCE(v_sub_elem->>'raw', v_sub_elem #>> '{}'))));
          END LOOP;
        ELSE
          v_tech_str := LOWER(v_elem->>'techStack');
        END IF;
      ELSIF v_elem->'skills' IS NOT NULL THEN
        IF jsonb_typeof(v_elem->'skills') = 'array' THEN
          FOR v_sub_elem IN SELECT * FROM jsonb_array_elements(v_elem->'skills') LOOP
            v_tech_str := v_tech_str || ' ' || LOWER(COALESCE(v_sub_elem->>'canonicalName', COALESCE(v_sub_elem->>'normalized', COALESCE(v_sub_elem->>'raw', v_sub_elem #>> '{}'))));
          END LOOP;
        ELSE
          v_tech_str := LOWER(v_elem->>'skills');
        END IF;
      END IF;

      v_proj_combined := v_title_str || ' ' || v_desc_str || ' ' || v_tech_str;
      v_proj_score_cand := 0;

      IF v_job.job_category = 'it_software' THEN
        IF v_proj_combined ~* '(\yc#|\y(web|app|software|develop|system|code|react|node|javascript|typescript|python|sql|fullstack|frontend|backend|api|database|mobile|flutter|dart|java|html|css|vue|angular|cloud|devops|network|linux|git|docker)\y)' THEN
          v_proj_score_cand := 95;
        ELSIF v_proj_combined ~* '\y(tech|it|computer|digital|algorithm|automation)\y' THEN
          v_proj_score_cand := 70;
        END IF;
      ELSIF v_job.job_category = 'accounting_finance' THEN
        IF v_proj_combined ~* '\y(accounting|financial|quickbooks|xero|audit|ledger|tax|payroll|balance sheet|profit and loss|bookkeeping|bank reconciliation|gaap|budgeting)\y' THEN
          v_proj_score_cand := 95;
        ELSIF v_proj_combined ~* '\y(billing|invoicing|financial model|cost analysis|budget|finance)\y' THEN
          v_proj_score_cand := 70;
        END IF;
      ELSIF v_job.job_category = 'healthcare' THEN
        IF v_proj_combined ~* '\y(patient care|vital signs|nursing|clinical|hospital|clinic|triage|medical|phlebotomy|wound care|pharmacology|caregiving|bedside)\y' THEN
          v_proj_score_cand := 95;
        ELSIF v_proj_combined ~* '\y(healthcare|medical records|health system|patient management|clinic management|health tracker|health app|telemedicine|appointment system)\y' THEN
          v_proj_score_cand := 70;
        END IF;
      ELSIF v_job.job_category = 'administrative_va' THEN
        IF v_proj_combined ~* '\y(virtual assistant|executive assistant|calendar management|data entry|records management|inventory records|travel booking|spreadsheets|email management|office administration|transcription)\y' THEN
          v_proj_score_cand := 95;
        ELSIF v_proj_combined ~* '\y(data organization|record keeping|inventory tracker|document processing|clerical|office documents|spreadsheet model)\y' THEN
          v_proj_score_cand := 70;
        END IF;
      ELSIF v_job.job_category = 'food_hospitality' THEN
        IF v_proj_combined ~* '\y(food service|restaurant|kitchen|dining|baking|pastry|culinary|barista|cafe|menu design|catering|hotel management|food safety)\y' THEN
          v_proj_score_cand := 95;
        ELSIF v_proj_combined ~* '\y(restaurant pos|food ordering|dining management|hospitality|food prep)\y' THEN
          v_proj_score_cand := 70;
        END IF;
      ELSIF v_job.job_category = 'retail_sales' THEN
        IF v_proj_combined ~* '\y(retail|merchandising|store management|sales campaign|point of sale|pos|cashiering|inventory replenishment|e-commerce sales|customer checkout)\y' THEN
          v_proj_score_cand := 95;
        ELSIF v_proj_combined ~* '\y(sales|store associate|e-commerce|checkout|merchandise)\y' THEN
          v_proj_score_cand := 70;
        END IF;
      ELSIF v_job.job_category = 'customer_service_bpo' THEN
        IF v_proj_combined ~* '\y(customer support|call center|helpdesk|chat support|ticketing system|crm|zendesk|client relations|inbound calls)\y' THEN
          v_proj_score_cand := 95;
        ELSIF v_proj_combined ~* '\y(customer service|help desk|support ticket|client communication)\y' THEN
          v_proj_score_cand := 70;
        END IF;
      ELSIF v_job.job_category = 'creative_design' THEN
        IF v_proj_combined ~* '\y(design|ui|ux|figma|branding|logo|video|portfolio|graphics|illustration|photoshop|animation|web design)\y' THEN
          v_proj_score_cand := 95;
        ELSIF v_proj_combined ~* '\y(visual|creative|multimedia|art|layout)\y' THEN
          v_proj_score_cand := 70;
        END IF;
      ELSIF v_job.job_category = 'marketing' THEN
        IF v_proj_combined ~* '\y(marketing|campaign|seo|sem|social media|advertising|copywriting|content creation|brand strategy)\y' THEN
          v_proj_score_cand := 95;
        ELSIF v_proj_combined ~* '\y(promotion|content|audience|market analysis)\y' THEN
          v_proj_score_cand := 70;
        END IF;
      ELSIF v_job.job_category = 'engineering' THEN
        IF v_proj_combined ~* '\y(engineering|cad|solidworks|autocad|structural|mechanical|electrical|civil|circuit|robotics)\y' THEN
          v_proj_score_cand := 95;
        ELSIF v_proj_combined ~* '\y(blueprint|prototype|hardware design|schematic)\y' THEN
          v_proj_score_cand := 70;
        END IF;
      ELSIF v_job.job_category = 'education_training' THEN
        IF v_proj_combined ~* '\y(teaching|curriculum|lesson plan|instructional|tutoring|training module|classroom|pedagogy)\y' THEN
          v_proj_score_cand := 95;
        ELSIF v_proj_combined ~* '\y(education|learning material|training|student assessment)\y' THEN
          v_proj_score_cand := 70;
        END IF;
      ELSIF v_job.job_category = 'logistics_supply_chain' THEN
        IF v_proj_combined ~* '\y(supply chain|warehouse|logistics|inventory management|freight|dispatch|procurement|shipping)\y' THEN
          v_proj_score_cand := 95;
        ELSIF v_proj_combined ~* '\y(inventory|tracking system|deliveries|storage operations)\y' THEN
          v_proj_score_cand := 70;
        END IF;
      ELSIF v_job.job_category IS NOT NULL THEN
        IF v_proj_combined ~* ('\y' || REPLACE(v_job.job_category, '_', ' ') || '\y') THEN
          v_proj_score_cand := 80;
        END IF;
      ELSE
        -- Legacy Uncategorized job: compare with job title
        IF v_job.title IS NOT NULL AND v_proj_combined ~* ('\y' || LOWER(v_job.title) || '\y') THEN
          v_proj_score_cand := 80;
        END IF;
      END IF;

      -- If project does not match target occupational domain, it scores 0!
      v_score_proj := GREATEST(v_score_proj, v_proj_score_cand);
    END LOOP;

    v_active_weight_sum := v_active_weight_sum + v_w_proj;
    v_weighted_sum := v_weighted_sum + (v_score_proj * v_w_proj);

    IF v_score_proj >= 75 THEN
      v_bullets := array_append(v_bullets, 'Demonstrated domain capability in project and portfolio work');
    ELSIF v_score_proj >= 40 THEN
      v_bullets := array_append(v_bullets, 'Relevant practical project experience documented');
    END IF;
  ELSE
    v_w_proj := 0.0;
  END IF;

  -- ============================================================================
  -- EVALUATE FACTOR 4: CAREER PREFERENCES (15%)
  -- ============================================================================
  IF v_has_pref THEN
    v_score_pref := 0;

    IF COALESCE(array_length(v_pref_roles, 1), 0) > 0 AND v_job.title IS NOT NULL THEN
      FOREACH v_role_item IN ARRAY v_pref_roles LOOP
        IF TRIM(v_role_item) <> '' AND LOWER(v_job.title) ~* LOWER(TRIM(v_role_item)) THEN
          v_pref_role_match := TRUE;
        END IF;
      END LOOP;
    END IF;

    IF v_pref_role_match THEN
      v_score_pref := 100;
    ELSIF v_job.job_subcategory IS NOT NULL AND v_job.job_subcategory = ANY(v_pref_subcats) THEN
      v_score_pref := 100;
    ELSIF v_job.job_category IS NOT NULL AND v_job.job_category = ANY(v_pref_cats) THEN
      v_score_pref := 75;
    ELSIF v_job.job_category IS NULL THEN
      v_w_pref := 0.0;
    ELSE
      v_score_pref := 0;
    END IF;

    IF v_w_pref > 0.0 THEN
      v_active_weight_sum := v_active_weight_sum + v_w_pref;
      v_weighted_sum := v_weighted_sum + (v_score_pref * v_w_pref);

      IF v_score_pref >= 75 THEN
        v_bullets := array_append(v_bullets, 'Matches your configured career path preferences');
      END IF;
    END IF;
  ELSE
    v_w_pref := 0.0;
  END IF;

  -- ============================================================================
  -- EVALUATE FACTOR 5: SEMANTIC CAREER SIMILARITY (10%)
  -- ============================================================================
  IF v_has_sem THEN
    v_vector_sim := 1.0 - (v_job.job_embedding <=> v_cand_resume.resume_embedding);
    v_score_sem := LEAST(100, GREATEST(0, ROUND(v_vector_sim * 100)::INTEGER));

    v_active_weight_sum := v_active_weight_sum + v_w_sem;
    v_weighted_sum := v_weighted_sum + (v_score_sem * v_w_sem);

    IF v_score_sem >= 70 THEN
      v_bullets := array_append(v_bullets, 'Resume narrative exhibits strong semantic industry alignment');
    END IF;
  ELSE
    v_w_sem := 0.0;
  END IF;

  -- ============================================================================
  -- EVALUATE FACTOR 6: EDUCATION FIELD (5%)
  -- ============================================================================
  IF v_has_edu THEN
    v_score_edu := 0;

    IF v_job.job_category = 'it_software' THEN
      IF v_cand_edu ~* '(computer|information technology|software|cs|it|informatics|computer engineering)' THEN
        v_score_edu := 100;
      ELSE
        v_score_edu := 20;
      END IF;
    ELSIF v_job.job_category = 'accounting_finance' THEN
      IF v_cand_edu ~* '(account|finance|banking|commerce|business administration)' THEN
        v_score_edu := 100;
      ELSE
        v_score_edu := 20;
      END IF;
    ELSIF v_job.job_category = 'healthcare' THEN
      IF v_cand_edu ~* '(nursing|medical|health|pharmacy|physical therapy|clinical)' THEN
        v_score_edu := 100;
      ELSE
        v_score_edu := 20;
      END IF;
    ELSIF v_job.job_category = 'food_hospitality' THEN
      IF v_cand_edu ~* '(hospitality|hotel|restaurant|culinary|tourism)' THEN
        v_score_edu := 100;
      ELSE
        v_score_edu := 20;
      END IF;
    ELSIF v_job.job_category = 'administrative_va' THEN
      IF v_cand_edu ~* '(business|office|administration|secretarial|management|communication)' THEN
        v_score_edu := 100;
      ELSE
        v_score_edu := 20;
      END IF;
    ELSIF v_job.job_category IS NOT NULL THEN
      IF v_cand_edu ~* v_job.job_category THEN
        v_score_edu := 100;
      ELSE
        v_score_edu := 20;
      END IF;
    ELSE
      v_score_edu := 20;
    END IF;

    v_active_weight_sum := v_active_weight_sum + v_w_edu;
    v_weighted_sum := v_weighted_sum + (v_score_edu * v_w_edu);

    IF v_score_edu >= 80 THEN
      v_bullets := array_append(v_bullets, 'Educational degree in directly related field');
    END IF;
  ELSE
    v_w_edu := 0.0;
  END IF;

  -- ============================================================================
  -- NORMALIZE FINAL CAREER RELEVANCE
  -- ============================================================================
  IF v_active_weight_sum > 0.0 THEN
    v_final_relevance := ROUND(v_weighted_sum / v_active_weight_sum)::INTEGER;
  ELSE
    v_final_relevance := 0;
  END IF;

  v_final_relevance := LEAST(100, GREATEST(0, v_final_relevance));

  -- Assign Standard Tiers (Approved V1 Legend)
  IF v_final_relevance >= 80 THEN
    v_tier := 'Highly Related';
  ELSIF v_final_relevance >= 60 THEN
    v_tier := 'Related';
  ELSIF v_final_relevance >= 40 THEN
    v_tier := 'Adjacent';
  ELSE
    v_tier := 'Outside Primary Field';
  END IF;

  -- Fallback default explanation bullet if none triggered
  IF COALESCE(array_length(v_bullets, 1), 0) = 0 THEN
    IF v_final_relevance >= 60 THEN
      v_bullets := ARRAY['Career profile demonstrates relevant background for this role domain.'];
    ELSE
      v_bullets := ARRAY['Role is outside your primary career field, but general competencies apply.'];
    END IF;
  END IF;

  -- Authoritative Write to job_matches (VERSION 2)
  INSERT INTO public.job_matches (
    user_id,
    job_id,
    employer_id,
    match_score,
    career_relevance_score,
    career_relevance_breakdown,
    career_relevance_version,
    career_relevance_updated_at,
    created_at
  )
  VALUES (
    v_user_id,
    p_job_id,
    v_job.employer_id,
    (SELECT match_score FROM public.job_matches WHERE user_id = v_user_id AND job_id = p_job_id),
    v_final_relevance,
    jsonb_build_object(
      'tier', v_tier,
      'score', v_final_relevance,
      'skillsScore', v_score_skills,
      'workHistoryScore', v_score_work,
      'projectsScore', v_score_proj,
      'preferencesScore', v_score_pref,
      'semanticScore', v_score_sem,
      'educationFieldScore', v_score_edu,
      'domainSkills', v_domain_skills,
      'activeWeights', jsonb_build_object(
        'skills', v_w_skills,
        'workHistory', v_w_work,
        'projects', v_w_proj,
        'preferences', v_w_pref,
        'semantic', v_w_sem,
        'education', v_w_edu,
        'totalActive', ROUND(v_active_weight_sum::numeric, 2)
      ),
      'evidenceBullets', v_bullets
    ),
    v_cr_version,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id, job_id)
  DO UPDATE SET
    employer_id = COALESCE(EXCLUDED.employer_id, public.job_matches.employer_id),
    career_relevance_score = EXCLUDED.career_relevance_score,
    career_relevance_breakdown = EXCLUDED.career_relevance_breakdown,
    career_relevance_version = EXCLUDED.career_relevance_version,
    career_relevance_updated_at = EXCLUDED.career_relevance_updated_at,
    updated_at = NOW();

  RETURN jsonb_build_object(
    'success', TRUE,
    'user_id', v_user_id,
    'job_id', p_job_id,
    'career_relevance_score', v_final_relevance,
    'career_relevance_version', v_cr_version,
    'tier', v_tier,
    'evidenceBullets', v_bullets,
    'breakdown', jsonb_build_object(
      'skillsScore', v_score_skills,
      'workHistoryScore', v_score_work,
      'projectsScore', v_score_proj,
      'preferencesScore', v_score_pref,
      'semanticScore', v_score_sem,
      'educationFieldScore', v_score_edu,
      'domainSkills', v_domain_skills,
      'activeWeights', jsonb_build_object(
        'skills', v_w_skills,
        'workHistory', v_w_work,
        'projects', v_w_proj,
        'preferences', v_w_pref,
        'semantic', v_w_sem,
        'education', v_w_edu,
        'totalActive', ROUND(v_active_weight_sum::numeric, 2)
      )
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_and_save_career_relevance(UUID, UUID) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 2. AUTOMATIC CANDIDATE CAREER RELEVANCE REFRESH (INVALIDATES STALE v1/null)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.refresh_candidate_career_relevance(
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := COALESCE(p_user_id, auth.uid());
  v_job RECORD;
  v_refreshed_count INTEGER := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: Caller must be authenticated or specify p_user_id.';
  END IF;

  FOR v_job IN
    SELECT j.id
    FROM public.jobs j
    LEFT JOIN public.job_matches jm ON jm.job_id = j.id AND jm.user_id = v_user_id
    WHERE j.status = 'open'
      AND (
        jm.career_relevance_version IS NULL
        OR jm.career_relevance_version < 2
        OR jm.career_relevance_score IS NULL
      )
  LOOP
    BEGIN
      PERFORM public.compute_and_save_career_relevance(v_job.id, v_user_id);
      v_refreshed_count := v_refreshed_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Continue with other jobs if one fails
      NULL;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'refreshed_count', v_refreshed_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_candidate_career_relevance(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3. SYNCHRONIZE compute_and_save_job_match TO KEEP CAREER RELEVANCE FRESH
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
  v_total_weight DOUBLE PRECISION := 0.0;
  v_weighted_sum DOUBLE PRECISION := 0.0;
  v_final_score INTEGER := 0;
  v_match_status TEXT := 'Skills Gap';

  -- Helpers
  v_skill TEXT;
  v_req TEXT;
  v_elem JSONB;
  v_item TEXT;
  v_cert TEXT;
  v_vector_sim DOUBLE PRECISION := 0.0;
  v_req_years INTEGER := 0;
  v_is_entry BOOLEAN := FALSE;
  v_lower_job_title TEXT := '';
  v_lower_job_desc TEXT := '';
  v_lower_cand_edu TEXT := '';
  v_lower_job_edu TEXT := '';
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: Caller must be authenticated.';
  END IF;

  SELECT id, employer_id, title, description, required_skills, required_education, experience_required, required_certifications, job_embedding
  INTO v_job
  FROM public.jobs
  WHERE id = p_job_id;

  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND: Job % does not exist.', p_job_id;
  END IF;

  SELECT id, course, degree, education_level, years_experience, certifications, skills
  INTO v_cand_prof
  FROM public.candidate_profiles
  WHERE user_id = v_user_id;

  SELECT id, skills, certifications, education, years_experience
  INTO v_cand_ext
  FROM public.profiles
  WHERE id = v_user_id;

  SELECT resume_embedding, extracted_skills
  INTO v_cand_resume
  FROM public.resumes
  WHERE applicant_id = v_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- 1. Candidate Skills
  IF v_cand_prof.skills IS NOT NULL THEN
    IF jsonb_typeof(v_cand_prof.skills) = 'array' THEN
      FOR v_elem IN SELECT jsonb_array_elements(v_cand_prof.skills) LOOP
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
    ELSIF jsonb_typeof(v_cand_prof.skills) = 'string' THEN
      FOREACH v_item IN ARRAY public.parse_skills_to_array(v_cand_prof.skills #>> '{}') LOOP
        v_skill := public.normalize_skill_name(v_item);
        IF v_skill <> '' AND NOT (v_skill = ANY(v_cand_skills)) THEN
          v_cand_skills := array_append(v_cand_skills, v_skill);
        END IF;
      END LOOP;
    END IF;
  END IF;

  IF v_cand_ext.skills IS NOT NULL AND TRIM(v_cand_ext.skills) <> '' THEN
    FOREACH v_item IN ARRAY public.parse_skills_to_array(v_cand_ext.skills) LOOP
      v_skill := public.normalize_skill_name(v_item);
      IF v_skill <> '' AND NOT (v_skill = ANY(v_cand_skills)) THEN
        v_cand_skills := array_append(v_cand_skills, v_skill);
      END IF;
    END LOOP;
  END IF;

  IF v_cand_resume.extracted_skills IS NOT NULL AND TRIM(v_cand_resume.extracted_skills) <> '' THEN
    FOREACH v_item IN ARRAY public.parse_skills_to_array(v_cand_resume.extracted_skills) LOOP
      v_skill := public.normalize_skill_name(v_item);
      IF v_skill <> '' AND NOT (v_skill = ANY(v_cand_skills)) THEN
        v_cand_skills := array_append(v_cand_skills, v_skill);
      END IF;
    END LOOP;
  END IF;

  -- 2. Job Required Skills
  IF v_job.required_skills IS NOT NULL AND TRIM(v_job.required_skills) <> '' THEN
    FOREACH v_item IN ARRAY public.parse_skills_to_array(v_job.required_skills) LOOP
      v_skill := public.normalize_skill_name(v_item);
      IF v_skill <> '' AND NOT (v_skill = ANY(v_req_skills)) THEN
        v_req_skills := array_append(v_req_skills, v_skill);
        IF v_skill = ANY(v_controlled_transferable) THEN
          v_trans_job_skills := array_append(v_trans_job_skills, v_skill);
        ELSE
          v_explicit_job_skills := array_append(v_explicit_job_skills, v_skill);
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- Evaluate Explicit Skills
  IF array_length(v_req_skills, 1) IS NOT NULL AND array_length(v_req_skills, 1) > 0 THEN
    FOREACH v_req IN ARRAY v_req_skills LOOP
      IF public.is_skill_match(v_cand_skills, v_req) THEN
        v_matched_req_skills := array_append(v_matched_req_skills, v_req);
      ELSE
        v_missing_req_skills := array_append(v_missing_req_skills, v_req);
      END IF;
    END LOOP;
    v_req_skill_score := ROUND((COALESCE(array_length(v_matched_req_skills, 1), 0)::NUMERIC / array_length(v_req_skills, 1)::NUMERIC) * 100)::INTEGER;
  ELSE
    v_req_skill_score := 100;
  END IF;

  -- Evaluate Transferable Skills
  IF array_length(v_trans_job_skills, 1) IS NOT NULL AND array_length(v_trans_job_skills, 1) > 0 THEN
    FOREACH v_req IN ARRAY v_trans_job_skills LOOP
      IF public.is_skill_match(v_cand_skills, v_req) THEN
        v_matched_trans_skills := array_append(v_matched_trans_skills, v_req);
      END IF;
    END LOOP;
    v_trans_score := ROUND((COALESCE(array_length(v_matched_trans_skills, 1), 0)::NUMERIC / array_length(v_trans_job_skills, 1)::NUMERIC) * 100)::INTEGER;
  ELSE
    FOREACH v_skill IN ARRAY v_cand_skills LOOP
      IF v_skill = ANY(v_controlled_transferable) AND NOT (v_skill = ANY(v_matched_trans_skills)) THEN
        v_matched_trans_skills := array_append(v_matched_trans_skills, v_skill);
      END IF;
    END LOOP;
    IF COALESCE(array_length(v_matched_trans_skills, 1), 0) > 0 THEN
      v_trans_score := LEAST(100, 50 + (array_length(v_matched_trans_skills, 1) * 20));
    ELSE
      v_trans_score := 70;
    END IF;
  END IF;

  -- 3. Education Compatibility
  v_lower_job_title := LOWER(COALESCE(v_job.title, ''));
  v_lower_job_desc  := LOWER(COALESCE(v_job.description, ''));
  v_lower_job_edu   := LOWER(COALESCE(v_job.required_education, ''));
  v_lower_cand_edu  := LOWER(COALESCE(v_cand_prof.course, '') || ' ' || COALESCE(v_cand_prof.degree, '') || ' ' || COALESCE(v_cand_prof.education_level, '') || ' ' || COALESCE(v_cand_ext.education, ''));

  IF v_lower_job_edu = '' OR v_lower_job_edu = 'none' OR v_lower_job_edu ~* '(any|high school|optional)' THEN
    v_edu_score := 100;
  ELSIF (v_lower_job_title ~* '(service|crew|support|assistant|virtual assistant|cashier|clerk|receptionist)' 
         OR v_lower_job_desc ~* 'entry level' 
         OR NOT (v_lower_job_edu ~* 'bachelor')) THEN
    v_edu_score := 100;
  ELSIF v_lower_cand_edu <> '' AND (v_lower_cand_edu ~* v_lower_job_edu OR v_lower_job_edu ~* v_lower_cand_edu) THEN
    v_edu_score := 100;
  ELSIF (v_lower_cand_edu ~* '(it|computer|software|technology)' AND v_lower_job_title ~* '(developer|web|software|it|engineer)') THEN
    v_edu_score := 100;
  ELSIF v_lower_cand_edu <> '' AND LENGTH(TRIM(v_lower_cand_edu)) > 3 THEN
    v_edu_score := 70;
  ELSE
    v_edu_score := 50;
  END IF;

  -- 4. Experience Compatibility
  v_cand_years := COALESCE(v_cand_prof.years_experience, v_cand_ext.years_experience, 0);
  IF v_job.experience_required IS NOT NULL THEN
    BEGIN
      v_req_years := substring(v_job.experience_required from '\d+')::INTEGER;
    EXCEPTION WHEN OTHERS THEN
      v_req_years := 0;
    END;
  END IF;

  v_is_entry := (v_req_years <= 1 OR v_lower_job_title ~* '(junior|entry|associate|crew|assistant|virtual assistant|intern|clerk)');
  IF v_is_entry AND v_cand_years >= 0 THEN
    v_exp_score := 100;
  ELSIF v_cand_years >= v_req_years THEN
    v_exp_score := 100;
  ELSIF v_req_years > 0 AND v_cand_years > 0 THEN
    v_exp_score := ROUND((v_cand_years::NUMERIC / v_req_years::NUMERIC) * 100)::INTEGER;
  ELSIF v_req_years = 0 THEN
    v_exp_score := 100;
  ELSE
    v_exp_score := 40;
  END IF;

  -- 5. Certifications & Credentials
  v_clean_certs_raw := COALESCE(v_job.required_certifications, '');
  v_clean_certs_raw := regexp_replace(v_clean_certs_raw, '\|\|DOC_REQ:[\s\S]*$', '', 'g');
  v_clean_certs_raw := regexp_replace(v_clean_certs_raw, '\[DOCUMENT_REQUIREMENTS\][\s\S]*$', '', 'g');
  v_clean_certs_raw := TRIM(v_clean_certs_raw);

  IF v_clean_certs_raw <> '' AND v_clean_certs_raw <> '[]' THEN
    FOREACH v_item IN ARRAY public.parse_skills_to_array(v_clean_certs_raw) LOOP
      v_cert := LOWER(TRIM(v_item));
      IF v_cert <> '' AND LENGTH(v_cert) >= 3 
         AND NOT (v_cert ~* '(fresh graduate|willing to work|bachelor|related field|resume|valid government id)') THEN
        v_clean_req_certs := array_append(v_clean_req_certs, v_cert);
      END IF;
    END LOOP;
  END IF;

  IF array_length(v_clean_req_certs, 1) IS NOT NULL AND array_length(v_clean_req_certs, 1) > 0 THEN
    v_w_creds := 0.10;
    v_creds_score := 0;
  ELSE
    v_w_creds := 0.0;
    v_creds_score := 100;
  END IF;

  -- 6. Semantic Relevance
  IF v_job.job_embedding IS NOT NULL AND v_cand_resume.resume_embedding IS NOT NULL THEN
    v_vector_sim := 1.0 - (v_job.job_embedding <=> v_cand_resume.resume_embedding);
    v_semantic_pct := LEAST(100, GREATEST(0, ROUND(v_vector_sim * 100)::INTEGER));
    v_w_semantic := 0.10;
  ELSE
    v_semantic_pct := 0;
    v_w_semantic := 0.0;
  END IF;

  -- 7. Normalize Weighted Score
  v_total_weight := v_w_skills + v_w_trans + v_w_edu + v_w_exp + v_w_creds + v_w_semantic;
  IF v_total_weight <= 0.0 THEN
    v_total_weight := 1.0;
  END IF;

  v_weighted_sum := 
    (v_req_skill_score * v_w_skills) +
    (v_trans_score * v_w_trans) +
    (v_edu_score * v_w_edu) +
    (v_exp_score * v_w_exp) +
    (v_creds_score * v_w_creds) +
    (v_semantic_pct * v_w_semantic);

  v_final_score := LEAST(100, GREATEST(0, ROUND(v_weighted_sum / v_total_weight)::INTEGER));

  IF v_final_score >= 80 THEN
    v_match_status := 'Strong Match';
  ELSIF v_final_score >= 60 THEN
    v_match_status := 'Good Match';
  ELSIF v_final_score >= 40 THEN
    v_match_status := 'Potential Match';
  ELSE
    v_match_status := 'Skills Gap';
  END IF;

  -- Persist authoritative Job Fit
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

  -- Maintain Phase 4C Career Relevance synchronization on match computation
  BEGIN
    PERFORM public.compute_and_save_career_relevance(p_job_id, v_user_id);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

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
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_and_save_job_match(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 4. Reload PostgREST Schema Cache
-- ------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
