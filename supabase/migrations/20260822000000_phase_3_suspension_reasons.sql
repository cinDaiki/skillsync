-- ============================================================================
-- Migration: 20260822000000_phase_3_suspension_reasons.sql
-- Description: Phase 3 Suspension Reasons & Controlled Reason Codes
-- ============================================================================

-- 1. Add current-state public-safe suspension metadata to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS suspension_reason_code text,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz;

-- 2. Add CHECK constraint for controlled reason codes while allowing NULL for active/legacy accounts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_suspension_reason_code_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_suspension_reason_code_check
      CHECK (
        suspension_reason_code IS NULL
        OR suspension_reason_code IN (
          'policy_violation',
          'suspicious_activity',
          'verification_issue',
          'abusive_behavior',
          'fraudulent_activity',
          'terms_violation',
          'other'
        )
      );
  END IF;
END $$;
