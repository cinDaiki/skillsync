-- ============================================================
-- SkillSync: Job Moderation Tracking Columns Schema Migration
-- Idempotent & Safe Schema Enhancement for jobs table
-- ============================================================

-- 1. Ensure jobs table contains moderation tracking fields
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS resubmitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moderation_count INT DEFAULT 0;

-- 2. Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
