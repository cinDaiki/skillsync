-- ============================================================
-- SkillSync: Verification + Micro-Credentials + Bug Fixes
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Ensure profiles table has all verification columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'Pending Verification',
  ADD COLUMN IF NOT EXISTS id_image_url TEXT,
  ADD COLUMN IF NOT EXISTS selfie_image_url TEXT,
  ADD COLUMN IF NOT EXISTS verification_date TIMESTAMPTZ;

-- 2. Add micro_credentials and matched_certs to job_matches
ALTER TABLE public.job_matches
  ADD COLUMN IF NOT EXISTS micro_credentials JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS matched_certs JSONB DEFAULT '[]'::jsonb;

-- 3. Drop employer_id FK constraint from job_matches (causes insert failures
--    when employer has no matching profile row). Keep the column but remove FK.
ALTER TABLE public.job_matches
  DROP CONSTRAINT IF EXISTS job_matches_employer_id_fkey;

-- 4. Clear garbled/garbage skills from candidate_profiles so fresh matching runs cleanly.
--    Skills that are 3 chars or less are almost certainly garbled PDF tokens.
--    Users must re-upload their resume to regenerate clean skills.
UPDATE public.candidate_profiles
  SET skills = '[]'::jsonb
  WHERE skills IS NOT NULL
    AND skills::text NOT LIKE '%JavaScript%'
    AND skills::text NOT LIKE '%Python%'
    AND skills::text NOT LIKE '%Communication%'
    AND skills::text NOT LIKE '%Excel%'
    AND skills::text NOT LIKE '%SQL%'
    AND skills::text NOT LIKE '%Management%'
    AND jsonb_array_length(skills::jsonb) > 5
    AND (
      -- Detect garbled: if most entries are 3 chars or shorter it's junk
      (SELECT COUNT(*) FROM jsonb_array_elements_text(skills::jsonb) x WHERE length(x) <= 3) >
      (SELECT COUNT(*) FROM jsonb_array_elements_text(skills::jsonb) x WHERE length(x) > 3)
    );

-- 5. Clear stale job_matches so they get recalculated with clean skills
DELETE FROM public.job_matches
  WHERE user_id IN (
    SELECT user_id FROM public.candidate_profiles
    WHERE skills = '[]'::jsonb OR skills IS NULL
  );

-- 6. Verification status index for fast admin queries
CREATE INDEX IF NOT EXISTS idx_profiles_verification_status
  ON public.profiles(verification_status);

-- ============================================================
-- IMPORTANT: After running this SQL:
-- 1. Job seekers must re-upload their resume to get clean skills
-- 2. Matching will re-run automatically after re-upload
-- ============================================================

