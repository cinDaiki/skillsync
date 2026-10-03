-- ==============================================================================
-- SkillSync — Migration: Phase 4C Universal Job Category + Server-Authoritative Career Relevance
-- Timestamp: 2026-10-02 00:00:00 UTC
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. REFERENCE TABLES: job_categories and job_subcategories
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.job_categories (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.job_subcategories (
  key TEXT PRIMARY KEY,
  category_key TEXT NOT NULL REFERENCES public.job_categories(key) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS & Grants for reference tables (public read-only)
ALTER TABLE public.job_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_subcategories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view job_categories" ON public.job_categories;
CREATE POLICY "Public can view job_categories" ON public.job_categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public can view job_subcategories" ON public.job_subcategories;
CREATE POLICY "Public can view job_subcategories" ON public.job_subcategories FOR SELECT USING (true);

GRANT SELECT ON TABLE public.job_categories TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.job_subcategories TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.job_categories TO service_role;
GRANT ALL ON TABLE public.job_subcategories TO service_role;

-- ------------------------------------------------------------------------------
-- 2. SEED V1 TAXONOMY: 18 Categories & 97 Subcategories
-- ------------------------------------------------------------------------------

INSERT INTO public.job_categories (key, label, sort_order) VALUES
  ('it_software', 'IT & Software', 1),
  ('accounting_finance', 'Accounting & Finance', 2),
  ('healthcare', 'Healthcare', 3),
  ('administrative_va', 'Administrative & Virtual Assistant', 4),
  ('customer_service_bpo', 'Customer Service & BPO', 5),
  ('food_hospitality', 'Food & Hospitality', 6),
  ('retail_sales', 'Retail & Sales', 7),
  ('engineering', 'Engineering', 8),
  ('education', 'Education', 9),
  ('marketing', 'Marketing', 10),
  ('human_resources', 'Human Resources', 11),
  ('logistics_warehouse', 'Logistics & Warehouse', 12),
  ('manufacturing', 'Manufacturing', 13),
  ('construction', 'Construction', 14),
  ('creative_design', 'Creative & Design', 15),
  ('security', 'Security', 16),
  ('government_public_service', 'Government & Public Service', 17),
  ('other', 'Other', 18)
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, sort_order = EXCLUDED.sort_order;

INSERT INTO public.job_subcategories (key, category_key, label, sort_order) VALUES
  ('web_development', 'it_software', 'Web Development', 1),
  ('software_development', 'it_software', 'Software Development', 2),
  ('mobile_development', 'it_software', 'Mobile Development', 3),
  ('it_support_helpdesk', 'it_software', 'IT Support & Helpdesk', 4),
  ('systems_administration', 'it_software', 'Systems & Network Administration', 5),
  ('cloud_devops', 'it_software', 'Cloud & DevOps', 6),
  ('cybersecurity', 'it_software', 'Cybersecurity', 7),
  ('data_analytics', 'it_software', 'Data & Analytics', 8),
  ('database_administration', 'it_software', 'Database Administration', 9),
  ('qa_testing', 'it_software', 'QA & Software Testing', 10),
  ('ai_machine_learning', 'it_software', 'AI & Machine Learning', 11),
  ('general_accounting', 'accounting_finance', 'General Accounting', 1),
  ('bookkeeping', 'accounting_finance', 'Bookkeeping', 2),
  ('auditing_assurance', 'accounting_finance', 'Auditing & Assurance', 3),
  ('tax_compliance', 'accounting_finance', 'Tax Compliance', 4),
  ('payroll_administration', 'accounting_finance', 'Payroll Administration', 5),
  ('financial_analysis', 'accounting_finance', 'Financial Planning & Analysis', 6),
  ('banking_lending', 'accounting_finance', 'Banking & Lending', 7),
  ('clinical_nursing', 'healthcare', 'Clinical Nursing', 1),
  ('medical_technology', 'healthcare', 'Medical Technology & Laboratory', 2),
  ('pharmacy', 'healthcare', 'Pharmacy', 3),
  ('caregiving_elderly', 'healthcare', 'Caregiving & Patient Support', 4),
  ('healthcare_admin', 'healthcare', 'Healthcare Administration', 5),
  ('physical_therapy', 'healthcare', 'Physical Therapy & Rehabilitation', 6),
  ('dental_services', 'healthcare', 'Dental Care & Assistance', 7),
  ('virtual_assistance', 'administrative_va', 'General Virtual Assistance', 1),
  ('data_entry', 'administrative_va', 'Data Entry & Processing', 2),
  ('executive_assistance', 'administrative_va', 'Executive & Administrative Assistance', 3),
  ('office_administration', 'administrative_va', 'Office Administration & Facilities', 4),
  ('ecommerce_management', 'administrative_va', 'E-Commerce Virtual Assistance', 5),
  ('inbound_customer_care', 'customer_service_bpo', 'Inbound Customer Care', 1),
  ('technical_support_rep', 'customer_service_bpo', 'Technical Support Representation', 2),
  ('outbound_telesales', 'customer_service_bpo', 'Outbound Telesales & Retention', 3),
  ('chat_email_support', 'customer_service_bpo', 'Chat & Email Non-Voice Support', 4),
  ('bpo_quality_leadership', 'customer_service_bpo', 'BPO Quality & Team Leadership', 5),
  ('service_crew', 'food_hospitality', 'Fast Food & Service Crew', 1),
  ('cook_kitchen_prep', 'food_hospitality', 'Cook & Kitchen Preparation', 2),
  ('barista_bartending', 'food_hospitality', 'Barista & Beverage Preparation', 3),
  ('restaurant_operations', 'food_hospitality', 'Restaurant Supervision & Floor', 4),
  ('hotel_front_office', 'food_hospitality', 'Hotel Front Office & Concierge', 5),
  ('housekeeping', 'food_hospitality', 'Housekeeping & Facility Upkeep', 6),
  ('retail_cashier', 'retail_sales', 'Retail Cashiering', 1),
  ('store_associate', 'retail_sales', 'Store Sales Associate', 2),
  ('merchandising_display', 'retail_sales', 'Merchandising & Stock Management', 3),
  ('b2b_sales', 'retail_sales', 'B2B & Corporate Account Executive', 4),
  ('store_management', 'retail_sales', 'Retail Store Management', 5),
  ('civil_structural', 'engineering', 'Civil & Structural Engineering', 1),
  ('mechanical_engineering', 'engineering', 'Mechanical Engineering', 2),
  ('electrical_engineering', 'engineering', 'Electrical Engineering', 3),
  ('electronics_communications', 'engineering', 'Electronics & Communications Engineering', 4),
  ('industrial_systems', 'engineering', 'Industrial & Systems Engineering', 5),
  ('architecture_cad', 'engineering', 'Architectural Drafting & 3D CAD', 6),
  ('k12_teaching', 'education', 'Primary & Secondary Education (K-12)', 1),
  ('higher_education', 'education', 'College & University Instruction', 2),
  ('special_education', 'education', 'Special Education (SPED)', 3),
  ('esl_language_tutoring', 'education', 'ESL & Language Tutoring', 4),
  ('corporate_training', 'education', 'Corporate Training & Instructional Design', 5),
  ('digital_marketing', 'marketing', 'Digital Marketing & Performance Ads', 1),
  ('seo_sem', 'marketing', 'SEO & SEM Optimization', 2),
  ('social_media_mgmt', 'marketing', 'Social Media Management', 3),
  ('content_copywriting', 'marketing', 'Content Creation & Copywriting', 4),
  ('brand_strategy_pr', 'marketing', 'Brand Strategy & Public Relations', 5),
  ('talent_recruitment', 'human_resources', 'Talent Acquisition & Recruitment', 1),
  ('compensation_benefits', 'human_resources', 'Compensation & Benefits', 2),
  ('employee_relations', 'human_resources', 'Employee Relations & Labor Compliance', 3),
  ('hr_generalist', 'human_resources', 'HR Operations & Administration', 4),
  ('training_development', 'human_resources', 'Training & Organizational Development', 5),
  ('warehouse_inventory', 'logistics_warehouse', 'Warehouse & Inventory Operations', 1),
  ('forklift_material_handling', 'logistics_warehouse', 'Material Handling & Forklift', 2),
  ('shipping_receiving', 'logistics_warehouse', 'Shipping, Receiving & Dispatch', 3),
  ('supply_chain_planning', 'logistics_warehouse', 'Supply Chain & Procurement', 4),
  ('delivery_courier', 'logistics_warehouse', 'Delivery Operations & Courier', 5),
  ('assembly_line', 'manufacturing', 'Assembly Line Production', 1),
  ('machine_operation', 'manufacturing', 'Machine & Equipment Operation', 2),
  ('quality_control', 'manufacturing', 'Quality Control & Assurance', 3),
  ('production_planning', 'manufacturing', 'Production Scheduling & Planning', 4),
  ('safety_ehs', 'manufacturing', 'Environmental Health & Safety (EHS)', 5),
  ('site_supervision', 'construction', 'Site Supervision & Safety Inspection', 1),
  ('carpentry_masonry', 'construction', 'Carpentry, Masonry & Finishes', 2),
  ('plumbing_piping', 'construction', 'Plumbing & Piping', 3),
  ('electrical_installation', 'construction', 'Electrical Wiring & Installation', 4),
  ('heavy_equipment', 'construction', 'Heavy Equipment Operation', 5),
  ('ui_ux_design', 'creative_design', 'UI/UX & Product Design', 1),
  ('graphic_design', 'creative_design', 'Graphic Design & Illustration', 2),
  ('multimedia_video', 'creative_design', 'Video Editing & Motion Graphics', 3),
  ('photography', 'creative_design', 'Photography & Videography', 4),
  ('3d_animation', 'creative_design', '3D Modeling & Animation', 5),
  ('physical_guarding', 'security', 'Physical Security Guarding', 1),
  ('cctv_surveillance', 'security', 'CCTV & Electronic Surveillance', 2),
  ('vip_protection', 'security', 'VIP & Executive Protection', 3),
  ('loss_prevention', 'security', 'Loss Prevention & Asset Safety', 4),
  ('public_administration', 'government_public_service', 'Public Administration & Office Operations', 1),
  ('community_development', 'government_public_service', 'Community & Social Work', 2),
  ('emergency_response', 'government_public_service', 'Disaster Preparedness & Emergency Response', 3),
  ('regulatory_inspection', 'government_public_service', 'Regulatory Compliance & Standards Inspection', 4),
  ('general_services', 'other', 'General Specialized Services', 1),
  ('miscellaneous_technical', 'other', 'Miscellaneous Technical Services', 2)
ON CONFLICT (key) DO UPDATE SET category_key = EXCLUDED.category_key, label = EXCLUDED.label, sort_order = EXCLUDED.sort_order;

-- ------------------------------------------------------------------------------
-- 3. EXTEND public.jobs WITH NULLABLE CATEGORY COLUMNS & PROPER STATUS INDEX
-- ------------------------------------------------------------------------------

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS job_category TEXT REFERENCES public.job_categories(key) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS job_subcategory TEXT REFERENCES public.job_subcategories(key) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_status_category_subcategory 
  ON public.jobs (status, job_category, job_subcategory);

-- ------------------------------------------------------------------------------
-- 4. EXTEND public.candidate_profiles WITH CAREER PREFERENCES
-- ------------------------------------------------------------------------------

ALTER TABLE public.candidate_profiles
  ADD COLUMN IF NOT EXISTS preferred_categories TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS preferred_subcategories TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS preferred_roles TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS career_stage TEXT DEFAULT NULL;

-- Array constraints: max 3 preferred categories, max 6 preferred subcategories
ALTER TABLE public.candidate_profiles
  DROP CONSTRAINT IF EXISTS chk_pref_categories_limit;
ALTER TABLE public.candidate_profiles
  ADD CONSTRAINT chk_pref_categories_limit 
  CHECK (array_length(preferred_categories, 1) IS NULL OR array_length(preferred_categories, 1) <= 3);

ALTER TABLE public.candidate_profiles
  DROP CONSTRAINT IF EXISTS chk_pref_subcategories_limit;
ALTER TABLE public.candidate_profiles
  ADD CONSTRAINT chk_pref_subcategories_limit 
  CHECK (array_length(preferred_subcategories, 1) IS NULL OR array_length(preferred_subcategories, 1) <= 6);

-- GIN indexes for array containment & overlap filtering
CREATE INDEX IF NOT EXISTS idx_candidate_pref_categories 
  ON public.candidate_profiles USING gin (preferred_categories);

CREATE INDEX IF NOT EXISTS idx_candidate_pref_subcategories 
  ON public.candidate_profiles USING gin (preferred_subcategories);

-- ------------------------------------------------------------------------------
-- 5. EXTEND public.job_matches WITH CAREER RELEVANCE FIELDS
-- ------------------------------------------------------------------------------

ALTER TABLE public.job_matches
  ADD COLUMN IF NOT EXISTS career_relevance_score INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS career_relevance_breakdown JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS career_relevance_version INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS career_relevance_updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.job_matches
  DROP CONSTRAINT IF EXISTS chk_career_relevance_score_range;
ALTER TABLE public.job_matches
  ADD CONSTRAINT chk_career_relevance_score_range
  CHECK (career_relevance_score IS NULL OR (career_relevance_score >= 0 AND career_relevance_score <= 100));

CREATE INDEX IF NOT EXISTS idx_job_matches_user_relevance 
  ON public.job_matches (user_id, career_relevance_score DESC);

-- ------------------------------------------------------------------------------
-- 6. AUTHORITATIVE SERVER FUNCTION: compute_and_save_career_relevance
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

  -- Evidence Component Scores (0-100)
  v_score_skills INTEGER := 0;
  v_score_work INTEGER := 0;
  v_score_proj INTEGER := 0;
  v_score_pref INTEGER := 0;
  v_score_sem INTEGER := 0;
  v_score_edu INTEGER := 0;

  -- Active Weights (Sum to denominator)
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
  v_proj_score_cand INTEGER := 0;
  v_work_score_cand INTEGER := 0;
  v_pref_role_match BOOLEAN := FALSE;
  v_role_item TEXT;
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

  SELECT resume_embedding, extracted_skills, parsed_details
  INTO v_cand_resume
  FROM public.resumes
  WHERE applicant_id = v_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- Parse Candidate Skills
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

  -- Work experience
  IF v_cand_ext.work_experience IS NOT NULL AND jsonb_typeof(v_cand_ext.work_experience) = 'array' AND jsonb_array_length(v_cand_ext.work_experience) > 0 THEN
    v_work_exp := v_cand_ext.work_experience;
    v_has_work := TRUE;
  END IF;

  -- Projects / Portfolio
  IF v_cand_ext.portfolio_links IS NOT NULL AND jsonb_typeof(v_cand_ext.portfolio_links) = 'array' AND jsonb_array_length(v_cand_ext.portfolio_links) > 0 THEN
    v_projects := v_cand_ext.portfolio_links;
    v_has_proj := TRUE;
  END IF;

  -- Education
  v_cand_edu := LOWER(COALESCE(v_cand_prof.course, '') || ' ' || COALESCE(v_cand_prof.degree, ''));
  v_has_edu := (TRIM(v_cand_edu) <> '');

  -- Semantic Embeddings
  v_has_sem := (v_job.job_embedding IS NOT NULL AND v_cand_resume.resume_embedding IS NOT NULL);

  -- ============================================================================
  -- EVALUATE FACTOR 1: SKILLS-DOMAIN ALIGNMENT (30%)
  -- ============================================================================
  -- Distinguish domain-defining skills from generic/transferable skills.
  -- Generic skills NEVER establish domain relevance alone.
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
      -- Other defined categories: exclude generic skills and match non-generic skills
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
    -- No skills: exclude factor
    v_w_skills := 0.0;
  END IF;

  -- ============================================================================
  -- EVALUATE FACTOR 2: WORK-HISTORY DOMAIN (20%)
  -- ============================================================================
  -- Must evaluate title + duties. A vague title alone ("Staff") does not score 100.
  IF v_has_work THEN
    v_score_work := 0;
    FOR v_elem IN SELECT * FROM jsonb_array_elements(v_work_exp) LOOP
      v_title_str := LOWER(COALESCE(v_elem->>'title', ''));
      v_desc_str := LOWER(COALESCE(v_elem->>'description', '') || ' ' || COALESCE(v_elem->>'responsibilities', ''));
      v_work_score_cand := 0;

      IF v_job.job_category = 'it_software' THEN
        IF v_title_str ~* '(developer|software|engineer|programmer|web|coder|frontend|backend|fullstack)' THEN
          IF v_desc_str ~* '(code|system|app|software|web|react|database|api|develop|debug)' THEN
            v_work_score_cand := 95;
          ELSE
            v_work_score_cand := 60;
          END IF;
        ELSIF v_title_str ~* '(it|tech|support|network|system|helpdesk)' THEN
          v_work_score_cand := 80;
        ELSIF v_desc_str ~* '(code|developer|software|programming|system administration)' THEN
          v_work_score_cand := 70;
        END IF;
      ELSIF v_job.job_category = 'accounting_finance' THEN
        IF v_title_str ~* '(accountant|accounting|auditor|audit|bookkeeper|cpa|finance)' THEN
          IF v_desc_str ~* '(ledger|tax|reconciliation|financial|audit|balance|payroll|quickbooks)' THEN
            v_work_score_cand := 95;
          ELSE
            v_work_score_cand := 60;
          END IF;
        ELSIF v_desc_str ~* '(accounting|financial reports|bookkeeping|ledger|tax)' THEN
          v_work_score_cand := 70;
        END IF;
      ELSIF v_job.job_category = 'healthcare' THEN
        IF v_title_str ~* '(nurse|nursing|doctor|physician|caregiver|medical|clinical|phlebotomist)' THEN
          IF v_desc_str ~* '(patient|vital signs|triage|clinical|medication|care|hospital|clinic)' THEN
            v_work_score_cand := 95;
          ELSE
            v_work_score_cand := 60;
          END IF;
        ELSIF v_desc_str ~* '(patient care|hospital|clinical|triage)' THEN
          v_work_score_cand := 70;
        END IF;
      ELSIF v_job.job_category = 'administrative_va' THEN
        IF v_title_str ~* '(virtual assistant|va|administrative assistant|office clerk|executive assistant|data entry)' THEN
          IF v_desc_str ~* '(email|calendar|schedule|admin|spreadsheet|customer|travel|data)' THEN
            v_work_score_cand := 95;
          ELSE
            v_work_score_cand := 60;
          END IF;
        ELSIF v_desc_str ~* '(administrative support|virtual assistant|calendar management)' THEN
          v_work_score_cand := 70;
        END IF;
      ELSIF v_job.job_category = 'food_hospitality' THEN
        IF v_title_str ~* '(crew|server|cook|kitchen|barista|chef|cashier|waiter|hotel|hospitality)' THEN
          IF v_desc_str ~* '(food|beverage|cooking|kitchen|guest|counter|clean|serving)' THEN
            v_work_score_cand := 95;
          ELSE
            v_work_score_cand := 60;
          END IF;
        ELSIF v_desc_str ~* '(food service|cooking|kitchen prep|customer orders)' THEN
          v_work_score_cand := 70;
        END IF;
      ELSIF v_job.job_category IS NOT NULL THEN
        -- Generic category title check
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
    -- No work history: exclude factor (dynamic applicability)
    v_w_work := 0.0;
  END IF;

  -- ============================================================================
  -- EVALUATE FACTOR 3: PROJECTS / PORTFOLIO (20%)
  -- ============================================================================
  -- Project evidence must be verified from content (title/description/tech),
  -- NOT merely from possessing a raw URL.
  IF v_has_proj THEN
    v_score_proj := 0;
    FOR v_elem IN SELECT * FROM jsonb_array_elements(v_projects) LOOP
      v_title_str := LOWER(COALESCE(v_elem->>'title', COALESCE(v_elem->>'name', '')));
      v_desc_str := LOWER(COALESCE(v_elem->>'description', ''));
      v_tech_str := LOWER(COALESCE(v_elem->>'technologies', COALESCE(v_elem->>'skills', '')));
      v_proj_score_cand := 0;

      -- Check if project has verifiable domain content
      IF v_job.job_category = 'it_software' THEN
        IF (v_title_str || ' ' || v_desc_str || ' ' || v_tech_str) ~* '(web|app|react|node|javascript|python|sql|fullstack|frontend|backend|api|database|mobile|system|service)' THEN
          v_proj_score_cand := 95;
        END IF;
      ELSIF v_job.job_category = 'accounting_finance' THEN
        IF (v_title_str || ' ' || v_desc_str || ' ' || v_tech_str) ~* '(accounting|financial|quickbooks|xero|audit|ledger|tax|portfolio analysis|budget)' THEN
          v_proj_score_cand := 95;
        END IF;
      ELSIF v_job.job_category = 'creative_design' THEN
        IF (v_title_str || ' ' || v_desc_str || ' ' || v_tech_str) ~* '(design|ui|ux|figma|branding|logo|video|portfolio|graphics|illustration)' THEN
          v_proj_score_cand := 95;
        END IF;
      ELSIF v_job.job_category IS NOT NULL THEN
        IF (v_title_str || ' ' || v_desc_str || ' ' || v_tech_str) ~* v_job.job_category THEN
          v_proj_score_cand := 85;
        END IF;
      ELSE
        -- Legacy Uncategorized job: compare with job title
        IF v_job.title IS NOT NULL AND (v_title_str || ' ' || v_desc_str || ' ' || v_tech_str) ~* LOWER(v_job.title) THEN
          v_proj_score_cand := 85;
        END IF;
      END IF;

      -- If project has NO verifiable domain description but only generic text or raw URL
      IF v_proj_score_cand = 0 THEN
        IF (v_title_str <> '' OR v_desc_str <> '') THEN
          v_proj_score_cand := 40; -- General non-domain project
        ELSIF COALESCE(v_elem->>'url', '') <> '' THEN
          v_proj_score_cand := 20; -- Raw URL only with no inspectable domain content
        END IF;
      END IF;

      v_score_proj := GREATEST(v_score_proj, v_proj_score_cand);
    END LOOP;

    v_active_weight_sum := v_active_weight_sum + v_w_proj;
    v_weighted_sum := v_weighted_sum + (v_score_proj * v_w_proj);

    IF v_score_proj >= 75 THEN
      v_bullets := array_append(v_bullets, 'Demonstrated domain capability in project and portfolio work');
    ELSIF v_score_proj >= 40 THEN
      v_bullets := array_append(v_bullets, 'General practical project experience documented');
    END IF;
  ELSE
    -- No projects: exclude factor (dynamic applicability)
    v_w_proj := 0.0;
  END IF;

  -- ============================================================================
  -- EVALUATE FACTOR 4: CAREER PREFERENCES (15%)
  -- ============================================================================
  -- Exact subcategory: 100
  -- Preferred role match: 100
  -- Top-level category match: 75
  -- Job outside all declared preferences: 0
  -- No preferences declared: exclude factor
  -- Legacy Uncategorized: if role matches 100, else exclude
  IF v_has_pref THEN
    v_score_pref := 0;

    -- Check preferred roles match against job title
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
      -- Legacy job with no category: exclude preference factor if no role match
      v_w_pref := 0.0;
    ELSE
      -- Job is categorized, preferences exist, but job is outside all declared preferences
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
    -- No preferences configured: exclude factor (dynamic applicability)
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
    -- No embeddings: exclude factor (dynamic applicability)
    v_w_sem := 0.0;
  END IF;

  -- ============================================================================
  -- EVALUATE FACTOR 6: EDUCATION FIELD (5%)
  -- ============================================================================
  IF v_has_edu AND v_job.job_category IS NOT NULL THEN
    IF v_job.job_category = 'it_software' AND v_cand_edu ~* '(computer|information|software|cs|it|technology|programming|informatics)' THEN
      v_score_edu := 100;
    ELSIF v_job.job_category = 'accounting_finance' AND v_cand_edu ~* '(accountancy|accounting|finance|commerce|cpa|banking|economics)' THEN
      v_score_edu := 100;
    ELSIF v_job.job_category = 'healthcare' AND v_cand_edu ~* '(nursing|nurse|medical|health|pharmacy|biology|clinical|therapy)' THEN
      v_score_edu := 100;
    ELSIF v_job.job_category = 'engineering' AND v_cand_edu ~* '(engineering|civil|electrical|mechanical|electronics|industrial)' THEN
      v_score_edu := 100;
    ELSIF v_job.job_category = 'education' AND v_cand_edu ~* '(education|teaching|pedagogy|curriculum)' THEN
      v_score_edu := 100;
    ELSIF v_job.job_category = 'creative_design' AND v_cand_edu ~* '(fine arts|design|multimedia|animation|architecture)' THEN
      v_score_edu := 100;
    ELSE
      -- Unrelated degree major: scores 20 (5% weight means it never prevents career shift)
      v_score_edu := 20;
    END IF;

    v_active_weight_sum := v_active_weight_sum + v_w_edu;
    v_weighted_sum := v_weighted_sum + (v_score_edu * v_w_edu);
  ELSE
    -- No education course or job is uncategorized: exclude factor
    v_w_edu := 0.0;
  END IF;

  -- ============================================================================
  -- FINAL NORMALIZATION OVER APPLICABLE EVIDENCE
  -- ============================================================================
  IF v_active_weight_sum > 0.0 THEN
    v_final_relevance := LEAST(100, GREATEST(0, ROUND(v_weighted_sum / v_active_weight_sum)::INTEGER));
  ELSE
    v_final_relevance := 0;
  END IF;

  -- Tier derivation
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

  -- ============================================================================
  -- PERSIST AUTHORITATIVE RESULT INTO public.job_matches (UPSERT)
  -- ============================================================================
  INSERT INTO public.job_matches (
    user_id,
    job_id,
    employer_id,
    match_score,
    career_relevance_score,
    career_relevance_breakdown,
    career_relevance_version,
    career_relevance_updated_at,
    updated_at
  )
  VALUES (
    v_user_id,
    p_job_id,
    v_job.employer_id,
    0, -- placeholder if Job Fit not yet computed
    v_final_relevance,
    jsonb_build_object(
      'skillsScore', v_score_skills,
      'workHistoryScore', v_score_work,
      'projectsScore', v_score_proj,
      'preferencesScore', v_score_pref,
      'semanticScore', v_score_sem,
      'educationFieldScore', v_score_edu,
      'activeWeights', jsonb_build_object(
        'skills', v_w_skills,
        'workHistory', v_w_work,
        'projects', v_w_proj,
        'preferences', v_w_pref,
        'semantic', v_w_sem,
        'education', v_w_edu,
        'totalActive', v_active_weight_sum
      ),
      'domainSkills', to_jsonb(v_domain_skills),
      'tier', v_tier,
      'evidenceBullets', to_jsonb(v_bullets)
    ),
    1,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id, job_id)
  DO UPDATE SET
    career_relevance_score = EXCLUDED.career_relevance_score,
    career_relevance_breakdown = EXCLUDED.career_relevance_breakdown,
    career_relevance_version = EXCLUDED.career_relevance_version,
    career_relevance_updated_at = EXCLUDED.career_relevance_updated_at;

  RETURN jsonb_build_object(
    'success', true,
    'job_id', p_job_id,
    'user_id', v_user_id,
    'career_relevance_score', v_final_relevance,
    'tier', v_tier,
    'evidenceBullets', to_jsonb(v_bullets),
    'breakdown', jsonb_build_object(
      'skillsScore', v_score_skills,
      'workHistoryScore', v_score_work,
      'projectsScore', v_score_proj,
      'preferencesScore', v_score_pref,
      'semanticScore', v_score_sem,
      'educationFieldScore', v_score_edu,
      'domainSkills', to_jsonb(v_domain_skills),
      'activeWeights', jsonb_build_object(
        'skills', v_w_skills,
        'workHistory', v_w_work,
        'projects', v_w_proj,
        'preferences', v_w_pref,
        'semantic', v_w_sem,
        'education', v_w_edu,
        'totalActive', v_active_weight_sum
      )
    )
  );
END;
$$;

-- Grant execution to authenticated users and service_role
GRANT EXECUTE ON FUNCTION public.compute_and_save_career_relevance(UUID, UUID) TO authenticated, service_role;
