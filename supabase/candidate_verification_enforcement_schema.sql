-- ============================================================
-- SkillSync: Candidate Identity Verification Schema Enhancement
-- Idempotent Migration File
-- ============================================================

-- 1. Ensure profiles table contains verification columns and moderation notes field
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'Pending Verification',
  ADD COLUMN IF NOT EXISTS id_image_url TEXT,
  ADD COLUMN IF NOT EXISTS selfie_image_url TEXT,
  ADD COLUMN IF NOT EXISTS verification_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_reason TEXT;

-- 2. Ensure index on verification_status for admin moderation performance
CREATE INDEX IF NOT EXISTS idx_profiles_verification_status
  ON public.profiles(verification_status);
