-- Migration: Add active_resume_source to candidate_profiles
-- Feature: Form-First Resume Builder & Upload Separation
-- Approved Staging Project: zjzymrpifutqubffvhyt
-- Production: blekdvuovbfpuaepjvfq (ISOLATED)

ALTER TABLE public.candidate_profiles 
ADD COLUMN IF NOT EXISTS active_resume_source VARCHAR(20) DEFAULT 'upload' 
CHECK (active_resume_source IN ('upload', 'builder'));

COMMENT ON COLUMN public.candidate_profiles.active_resume_source IS 
'Identifies whether the candidate is currently using an uploaded resume file (upload) or the form-first resume builder (builder) for matching';
