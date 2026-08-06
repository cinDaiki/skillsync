-- Phase 1: Employer/Recruiter Module Enhancement Schema

-- 1. Create employer_profiles table
CREATE TABLE IF NOT EXISTS public.employer_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name text,
  industry text,
  company_size text,
  location text,
  website text,
  contact_email text,
  contact_number text,
  about text,
  verification_status text DEFAULT 'Pending',
  id_image_url text,
  selfie_image_url text,
  business_permit_url text,
  sec_registration_url text,
  company_logo_url text,
  cover_photo_url text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.employer_profiles ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own profile
CREATE POLICY "Users can view own employer profile"
  ON public.employer_profiles FOR SELECT
  USING (auth.uid() = id);

-- Allow users to insert their own profile
CREATE POLICY "Users can insert own employer profile"
  ON public.employer_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Allow users to update their own profile
CREATE POLICY "Users can update own employer profile"
  ON public.employer_profiles FOR UPDATE
  USING (auth.uid() = id);

-- 2. Extend jobs table
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS work_setup text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS required_certifications text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS required_education text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS experience_required text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS number_of_openings integer DEFAULT 1;

-- 3. Extend applications table
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS is_shortlisted boolean DEFAULT false;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS interview_date timestamp with time zone;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS interview_location text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS interview_link text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS reject_reason text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS match_score integer;

-- 4. Storage Buckets (if not exist)
INSERT INTO storage.buckets (id, name, public) VALUES ('company_branding', 'company_branding', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('employer_verification', 'employer_verification', false) ON CONFLICT (id) DO NOTHING;
