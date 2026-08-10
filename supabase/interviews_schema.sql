-- DDL Migration for Phase 10: SkillSync Interview Invitation & Candidate Confirmation Schema

-- 1. Create normalized public.interviews table
CREATE TABLE IF NOT EXISTS public.interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  employer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  
  -- State Machine Status: PENDING_CONFIRMATION, CONFIRMED, DECLINED, RESCHEDULE_REQUESTED, CANCELLED, COMPLETED
  status TEXT NOT NULL DEFAULT 'PENDING_CONFIRMATION' 
    CHECK (status IN ('PENDING_CONFIRMATION', 'CONFIRMED', 'DECLINED', 'RESCHEDULE_REQUESTED', 'CANCELLED', 'COMPLETED')),
  
  -- Interview Mode: ONLINE or WALK_IN
  interview_type TEXT NOT NULL DEFAULT 'ONLINE' 
    CHECK (interview_type IN ('ONLINE', 'WALK_IN')),
  
  scheduled_date TEXT NOT NULL,
  scheduled_time TEXT NOT NULL,
  
  -- Online fields
  platform TEXT DEFAULT 'Google Meet',
  meeting_url TEXT,
  
  -- Walk-in fields
  address TEXT,
  contact_person TEXT,
  
  -- Prep & Instructions
  instructions TEXT,
  
  -- Proposal Audit
  proposed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  proposed_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Candidate Response Fields
  candidate_response TEXT CHECK (candidate_response IN ('ACCEPTED', 'DECLINED', 'RESCHEDULE_REQUESTED')),
  candidate_response_at TIMESTAMPTZ,
  candidate_message TEXT,
  preferred_date TEXT,
  preferred_time_range TEXT,
  
  -- Lifecycle Timestamps
  confirmed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create public.interview_evaluations table for Private Recruiter Evaluations
-- Separated into its own table with strict RLS so candidate queries NEVER return private notes/ratings
CREATE TABLE IF NOT EXISTS public.interview_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID UNIQUE NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  employer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  evaluation_notes TEXT,
  technical_rating INTEGER CHECK (technical_rating >= 1 AND technical_rating <= 5),
  communication_rating INTEGER CHECK (communication_rating >= 1 AND communication_rating <= 5),
  overall_recommendation TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create Indexes for query optimization
CREATE INDEX IF NOT EXISTS idx_interviews_application_id ON public.interviews(application_id);
CREATE INDEX IF NOT EXISTS idx_interviews_employer_id ON public.interviews(employer_id);
CREATE INDEX IF NOT EXISTS idx_interviews_candidate_id ON public.interviews(candidate_id);
CREATE INDEX IF NOT EXISTS idx_interviews_job_id ON public.interviews(job_id);
CREATE INDEX IF NOT EXISTS idx_interviews_status ON public.interviews(status);
CREATE INDEX IF NOT EXISTS idx_interviews_scheduled_date ON public.interviews(scheduled_date);

CREATE INDEX IF NOT EXISTS idx_interview_evaluations_interview_id ON public.interview_evaluations(interview_id);
CREATE INDEX IF NOT EXISTS idx_interview_evaluations_employer_id ON public.interview_evaluations(employer_id);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_evaluations ENABLE ROW LEVEL SECURITY;

-- 5. RLS POLICIES FOR public.interviews

-- SELECT: Candidates and employers view their own interviews (admins view all)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'interviews' AND policyname = 'Users view relevant interviews'
  ) THEN
    CREATE POLICY "Users view relevant interviews" ON public.interviews
      FOR SELECT TO authenticated
      USING (
        auth.uid() = candidate_id 
        OR auth.uid() = employer_id 
        OR public.is_platform_admin()
      );
  END IF;
END $$;

-- INSERT: Employers and admins insert interviews
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'interviews' AND policyname = 'Employers insert interviews'
  ) THEN
    CREATE POLICY "Employers insert interviews" ON public.interviews
      FOR INSERT TO authenticated
      WITH CHECK (
        auth.uid() = employer_id 
        OR public.is_platform_admin()
      );
  END IF;
END $$;

-- UPDATE: Employers update employer-controlled interview details
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'interviews' AND policyname = 'Employers update own interviews'
  ) THEN
    CREATE POLICY "Employers update own interviews" ON public.interviews
      FOR UPDATE TO authenticated
      USING (
        auth.uid() = employer_id 
        OR public.is_platform_admin()
      )
      WITH CHECK (
        auth.uid() = employer_id 
        OR public.is_platform_admin()
      );
  END IF;
END $$;

-- UPDATE: Candidates update candidate response fields on their own interviews
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'interviews' AND policyname = 'Candidates respond to own interviews'
  ) THEN
    CREATE POLICY "Candidates respond to own interviews" ON public.interviews
      FOR UPDATE TO authenticated
      USING (
        auth.uid() = candidate_id
      )
      WITH CHECK (
        auth.uid() = candidate_id
      );
  END IF;
END $$;

-- DELETE: Employers and admins delete interviews
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'interviews' AND policyname = 'Employers delete own interviews'
  ) THEN
    CREATE POLICY "Employers delete own interviews" ON public.interviews
      FOR DELETE TO authenticated
      USING (
        auth.uid() = employer_id 
        OR public.is_platform_admin()
      );
  END IF;
END $$;

-- 6. RLS POLICIES FOR public.interview_evaluations (STRICT EMPLOYER-ONLY)
-- Candidates NEVER get SELECT, INSERT, or UPDATE permission on interview_evaluations!

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'interview_evaluations' AND policyname = 'Employers view private evaluations'
  ) THEN
    CREATE POLICY "Employers view private evaluations" ON public.interview_evaluations
      FOR SELECT TO authenticated
      USING (
        auth.uid() = employer_id 
        OR public.is_platform_admin()
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'interview_evaluations' AND policyname = 'Employers insert private evaluations'
  ) THEN
    CREATE POLICY "Employers insert private evaluations" ON public.interview_evaluations
      FOR INSERT TO authenticated
      WITH CHECK (
        auth.uid() = employer_id 
        OR public.is_platform_admin()
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'interview_evaluations' AND policyname = 'Employers update private evaluations'
  ) THEN
    CREATE POLICY "Employers update private evaluations" ON public.interview_evaluations
      FOR UPDATE TO authenticated
      USING (
        auth.uid() = employer_id 
        OR public.is_platform_admin()
      )
      WITH CHECK (
        auth.uid() = employer_id 
        OR public.is_platform_admin()
      );
  END IF;
END $$;

-- 7. SECURE RPC: Candidate Response Execution (Validates State Machine)
CREATE OR REPLACE FUNCTION public.candidate_respond_interview(
  p_interview_id UUID,
  p_response TEXT,
  p_message TEXT DEFAULT NULL,
  p_preferred_date TEXT DEFAULT NULL,
  p_preferred_time_range TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cand_id UUID;
  v_app_id UUID;
  v_new_status TEXT;
BEGIN
  -- Verify interview ownership
  SELECT candidate_id, application_id INTO v_cand_id, v_app_id
  FROM public.interviews
  WHERE id = p_interview_id;

  IF v_cand_id IS NULL THEN
    RAISE EXCEPTION 'Interview record not found.';
  END IF;

  IF v_cand_id <> auth.uid() THEN
    RAISE EXCEPTION 'Forbidden: You can only respond to your own interview invitations.';
  END IF;

  -- Determine state transition
  IF p_response = 'ACCEPTED' THEN
    v_new_status := 'CONFIRMED';
  ELSIF p_response = 'DECLINED' THEN
    v_new_status := 'DECLINED';
  ELSIF p_response = 'RESCHEDULE_REQUESTED' THEN
    v_new_status := 'RESCHEDULE_REQUESTED';
  ELSE
    RAISE EXCEPTION 'Invalid response type. Must be ACCEPTED, DECLINED, or RESCHEDULE_REQUESTED.';
  END IF;

  -- Update interview state
  UPDATE public.interviews
  SET
    status = v_new_status,
    candidate_response = p_response,
    candidate_response_at = NOW(),
    candidate_message = p_message,
    preferred_date = p_preferred_date,
    preferred_time_range = p_preferred_time_range,
    confirmed_at = CASE WHEN p_response = 'ACCEPTED' THEN NOW() ELSE confirmed_at END,
    updated_at = NOW()
  WHERE id = p_interview_id;

  -- Update overall application stage
  UPDATE public.applications
  SET
    status = CASE 
      WHEN p_response = 'ACCEPTED' THEN 'interview'
      WHEN p_response = 'DECLINED' THEN 'interview declined'
      WHEN p_response = 'RESCHEDULE_REQUESTED' THEN 'reschedule requested'
      ELSE status
    END
  WHERE id = v_app_id;
END;
$$;

-- 8. SECURE RPC: Employer Evaluation Submission
CREATE OR REPLACE FUNCTION public.save_interview_evaluation(
  p_interview_id UUID,
  p_notes TEXT DEFAULT NULL,
  p_tech_rating INT DEFAULT NULL,
  p_comm_rating INT DEFAULT NULL,
  p_recommendation TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp_id UUID;
  v_app_id UUID;
BEGIN
  SELECT employer_id, application_id INTO v_emp_id, v_app_id
  FROM public.interviews
  WHERE id = p_interview_id;

  IF v_emp_id IS NULL THEN
    RAISE EXCEPTION 'Interview record not found.';
  END IF;

  IF v_emp_id <> auth.uid() AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden: Only the assigned employer can save evaluations.';
  END IF;

  INSERT INTO public.interview_evaluations (
    interview_id,
    application_id,
    employer_id,
    evaluation_notes,
    technical_rating,
    communication_rating,
    overall_recommendation,
    updated_at
  )
  VALUES (
    p_interview_id,
    v_app_id,
    v_emp_id,
    p_notes,
    p_tech_rating,
    p_comm_rating,
    p_recommendation,
    NOW()
  )
  ON CONFLICT (interview_id) DO UPDATE SET
    evaluation_notes = EXCLUDED.evaluation_notes,
    technical_rating = EXCLUDED.technical_rating,
    communication_rating = EXCLUDED.communication_rating,
    overall_recommendation = EXCLUDED.overall_recommendation,
    updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.candidate_respond_interview(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_interview_evaluation(UUID, TEXT, INT, INT, TEXT) TO authenticated;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
