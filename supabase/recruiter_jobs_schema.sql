-- Run in Supabase SQL Editor to support the advanced recruiter module features.

-- 1. Add fields to jobs table for salary range and deadline
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS salary_range text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS deadline date;

-- 2. Add recruiter_notes field to applications table
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS recruiter_notes text;
