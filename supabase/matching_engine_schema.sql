-- Matching Engine Schema
-- Run this in your Supabase SQL Editor

-- 1. Create candidate_profiles table to separate from auth profiles
CREATE TABLE IF NOT EXISTS public.candidate_profiles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  course text,
  degree text,
  education_level text,
  skills jsonb DEFAULT '[]'::jsonb,
  certifications jsonb DEFAULT '[]'::jsonb,
  years_experience numeric DEFAULT 0,
  resume_version integer DEFAULT 1,
  last_resume_scan timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT unique_candidate_user UNIQUE (user_id)
);

-- Enable RLS
ALTER TABLE public.candidate_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own candidate profile" ON public.candidate_profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own candidate profile" ON public.candidate_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own candidate profile" ON public.candidate_profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Employers can view candidate profiles" ON public.candidate_profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.employer_profiles WHERE id = auth.uid()
    )
  );

-- 2. Create job_matches table
CREATE TABLE IF NOT EXISTS public.job_matches (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  employer_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  match_score numeric DEFAULT 0,
  skills_score numeric DEFAULT 0,
  education_score numeric DEFAULT 0,
  experience_score numeric DEFAULT 0,
  match_status text DEFAULT 'Recommended', -- Recommended, Applied, Reviewed, Shortlisted, Interview, Rejected, Hired
  matching_skills jsonb DEFAULT '[]'::jsonb,
  missing_skills jsonb DEFAULT '[]'::jsonb,
  recommended_courses jsonb DEFAULT '[]'::jsonb,
  match_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT unique_user_job_match UNIQUE (user_id, job_id)
);

-- Enable RLS
ALTER TABLE public.job_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own matches" ON public.job_matches
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Employers can view matches for their jobs" ON public.job_matches
  FOR SELECT USING (auth.uid() = employer_id);

CREATE POLICY "Anyone can insert/update matches" ON public.job_matches
  FOR ALL USING (true) WITH CHECK (true); -- Because matching engine runs client-side right now

GRANT ALL ON public.candidate_profiles TO authenticated, anon;
GRANT ALL ON public.job_matches TO authenticated, anon;
