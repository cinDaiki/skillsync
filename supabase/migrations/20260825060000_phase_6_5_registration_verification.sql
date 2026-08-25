-- ==============================================================================
-- SkillSync Phase 6.5: Registration Email OTP Architecture Migration
-- Migration: 20260825060000_phase_6_5_registration_verification.sql
-- ==============================================================================
-- Implements Pre-Account Creation Email Ownership Verification:
-- 1. registration_verification_challenges ledger
-- 2. State-machine lifecycle: INITIATED -> VERIFIED -> COMPLETION_LEASE -> ACCOUNT_CREATED -> CONSUMED
-- 3. Atomic rate-limiting (Email 60s cooldown, 5/hr cap; IP 15/hr cap; Global 100/5min cap)
-- 4. Superseded OTP invalidation (only newest active challenge per email is valid)
-- 5. Authoritative 256-bit Completion Token validation
-- 6. 120-Second Cross-API Concurrency Lease
-- 7. Direct Auth-User Challenge Association (raw_app_meta_data ->> 'registration_challenge_id')
-- 8. Immutable Frozen Profile Metadata (Prevents role/name tampering during retries)
-- 9. Strict Role Allowlist: 'candidate' and 'employer' ONLY. 'admin' strictly blocked.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Create registration_verification_challenges Ledger Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.registration_verification_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  otp_proof TEXT NOT NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  expires_at TIMESTAMPTZ NOT NULL,
  resend_available_at TIMESTAMPTZ NOT NULL,
  
  -- Stage 1: OTP Verification & Single-Use Completion Token Hash
  verified_at TIMESTAMPTZ NULL,
  completion_token_hash TEXT NULL,
  completion_token_expires_at TIMESTAMPTZ NULL,

  -- Stage 2: Frozen Completion Metadata & 120s Distributed Lease
  frozen_full_name TEXT NULL,
  frozen_role TEXT NULL,
  completion_started_at TIMESTAMPTZ NULL,
  completion_lease_id UUID NULL,
  completion_lease_expires_at TIMESTAMPTZ NULL,

  -- Stage 3: Authoritative Account Association & Final Consumption
  account_created_at TIMESTAMPTZ NULL,
  created_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  consumed_at TIMESTAMPTZ NULL,
  cancelled_at TIMESTAMPTZ NULL,

  -- Stage 4: Abuse Throttling & Privacy-Preserving Metadata
  source_ip_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 2. Indexes for Performance, Rate Limiting, and Active Lookups
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_reg_challenges_email_created 
  ON public.registration_verification_challenges (email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reg_challenges_ip_created 
  ON public.registration_verification_challenges (source_ip_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reg_challenges_global_rate 
  ON public.registration_verification_challenges (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reg_challenges_active_lookup 
  ON public.registration_verification_challenges (id, email)
  WHERE consumed_at IS NULL AND cancelled_at IS NULL;

-- ------------------------------------------------------------------------------
-- 3. Strict Row Level Security: 0 Direct Public/Anon Grants
-- ------------------------------------------------------------------------------
ALTER TABLE public.registration_verification_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.registration_verification_challenges FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.registration_verification_challenges TO service_role;

-- ------------------------------------------------------------------------------
-- 4. RPC: create_registration_verification_challenge
--    Atomically enforces rate limits, invalidates superseded challenges,
--    and registers the fresh 6-digit OTP challenge.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_registration_verification_challenge(
  p_challenge_id UUID,
  p_email TEXT,
  p_otp_proof TEXT,
  p_source_ip_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean_email TEXT;
  v_clean_ip_hash TEXT;
  v_global_count INT;
  v_email_cooldown_count INT;
  v_email_hourly_count INT;
  v_ip_hourly_count INT;
  v_is_existing_account BOOLEAN;
  v_ttl INTERVAL := INTERVAL '10 minutes';
  v_cooldown INTERVAL := INTERVAL '60 seconds';
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  -- A. Normalize inputs server-side
  v_clean_email := lower(trim(p_email));
  v_clean_ip_hash := trim(p_source_ip_hash);

  IF v_clean_email IS NULL OR v_clean_email = '' OR position('@' in v_clean_email) = 0 THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'INVALID_EMAIL');
  END IF;

  IF p_challenge_id IS NULL OR p_otp_proof IS NULL OR p_otp_proof = '' THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'INVALID_PARAMETERS');
  END IF;

  -- B. Deadlock-free ordered advisory locking across rate-limit dimensions
  -- Lock Order: Global -> Email -> IP Hash
  PERFORM pg_advisory_xact_lock(hashtext('reg_global_lock'));
  PERFORM pg_advisory_xact_lock(hashtext('reg_email_lock_' || v_clean_email));
  IF v_clean_ip_hash IS NOT NULL AND v_clean_ip_hash <> '' THEN
    PERFORM pg_advisory_xact_lock(hashtext('reg_ip_lock_' || v_clean_ip_hash));
  END IF;

  -- C. Atomic Rate Limit Check 1: Global Velocity Cap (Max 100 requests / 5 minutes)
  SELECT COUNT(*) INTO v_global_count
  FROM public.registration_verification_challenges
  WHERE created_at > v_now - INTERVAL '5 minutes';

  IF v_global_count >= 100 THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'GLOBAL_RATE_LIMIT_EXCEEDED');
  END IF;

  -- D. Atomic Rate Limit Check 2: Per-Email Cooldown (60 seconds)
  SELECT COUNT(*) INTO v_email_cooldown_count
  FROM public.registration_verification_challenges
  WHERE email = v_clean_email
    AND created_at > v_now - v_cooldown
    AND cancelled_at IS NULL;

  IF v_email_cooldown_count >= 1 THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'RESEND_COOLDOWN_ACTIVE',
      'retry_after_seconds', 60
    );
  END IF;

  -- E. Atomic Rate Limit Check 3: Per-Email Hourly Cap (Max 5 requests / hour)
  SELECT COUNT(*) INTO v_email_hourly_count
  FROM public.registration_verification_challenges
  WHERE email = v_clean_email
    AND created_at > v_now - INTERVAL '1 hour';

  IF v_email_hourly_count >= 5 THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'EMAIL_RATE_LIMIT_EXCEEDED');
  END IF;

  -- F. Atomic Rate Limit Check 4: Source IP Hourly Cap (Max 15 requests / hour)
  IF v_clean_ip_hash IS NOT NULL AND v_clean_ip_hash <> '' THEN
    SELECT COUNT(*) INTO v_ip_hourly_count
    FROM public.registration_verification_challenges
    WHERE source_ip_hash = v_clean_ip_hash
      AND created_at > v_now - INTERVAL '1 hour';

    IF v_ip_hourly_count >= 15 THEN
      RETURN jsonb_build_object('success', FALSE, 'error', 'IP_RATE_LIMIT_EXCEEDED');
    END IF;
  END IF;

  -- G. Check whether this email already has a completed account (for uniform enumeration defense)
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE lower(trim(email)) = v_clean_email
  ) INTO v_is_existing_account;

  -- H. Invalidate/Cancel any previous unverified challenges for this exact email
  UPDATE public.registration_verification_challenges
  SET cancelled_at = v_now
  WHERE email = v_clean_email
    AND verified_at IS NULL
    AND consumed_at IS NULL
    AND cancelled_at IS NULL
    AND expires_at > v_now;

  -- I. Insert fresh challenge
  INSERT INTO public.registration_verification_challenges (
    id,
    email,
    otp_proof,
    attempt_count,
    max_attempts,
    expires_at,
    resend_available_at,
    source_ip_hash,
    created_at
  ) VALUES (
    p_challenge_id,
    v_clean_email,
    p_otp_proof,
    0,
    5,
    v_now + v_ttl,
    v_now + v_cooldown,
    COALESCE(v_clean_ip_hash, 'unknown'),
    v_now
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'challenge_id', p_challenge_id,
    'cooldown_seconds', 60,
    'shadow_account', v_is_existing_account
  );
END;
$$;

ALTER FUNCTION public.create_registration_verification_challenge(UUID, TEXT, TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_registration_verification_challenge(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_registration_verification_challenge(UUID, TEXT, TEXT, TEXT) TO service_role;

-- ------------------------------------------------------------------------------
-- 5. RPC: cancel_registration_verification_challenge
--    Rolls back challenge if Brevo transactional dispatch fails synchronously.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_registration_verification_challenge(
  p_challenge_id UUID,
  p_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean_email TEXT := lower(trim(p_email));
BEGIN
  UPDATE public.registration_verification_challenges
  SET cancelled_at = clock_timestamp()
  WHERE id = p_challenge_id
    AND email = v_clean_email
    AND consumed_at IS NULL
    AND cancelled_at IS NULL;

  RETURN jsonb_build_object('success', TRUE);
END;
$$;

ALTER FUNCTION public.cancel_registration_verification_challenge(UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.cancel_registration_verification_challenge(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_registration_verification_challenge(UUID, TEXT) TO service_role;

-- ------------------------------------------------------------------------------
-- 6. RPC: verify_registration_otp
--    Atomically validates 6-digit OTP proof and stores completion token hash.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_registration_otp(
  p_challenge_id UUID,
  p_email TEXT,
  p_submitted_otp_proof TEXT,
  p_token_hash TEXT,
  p_token_ttl_seconds INT DEFAULT 900
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean_email TEXT := lower(trim(p_email));
  v_challenge RECORD;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  -- A. Lock challenge row FOR UPDATE
  SELECT * INTO v_challenge
  FROM public.registration_verification_challenges
  WHERE id = p_challenge_id AND email = v_clean_email
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'CHALLENGE_NOT_FOUND');
  END IF;

  -- B. Check if already consumed or cancelled
  IF v_challenge.consumed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'CHALLENGE_ALREADY_CONSUMED');
  END IF;

  IF v_challenge.cancelled_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'CHALLENGE_CANCELLED_OR_SUPERSEDED');
  END IF;

  -- C. Check expiration and attempt limits
  IF v_challenge.expires_at <= v_now THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'CHALLENGE_EXPIRED');
  END IF;

  IF v_challenge.attempt_count >= v_challenge.max_attempts THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'CHALLENGE_LOCKED', 'remaining_attempts', 0);
  END IF;

  -- D. Validate submitted OTP HMAC proof
  IF v_challenge.otp_proof <> p_submitted_otp_proof THEN
    UPDATE public.registration_verification_challenges
    SET attempt_count = attempt_count + 1,
        expires_at = CASE WHEN attempt_count + 1 >= max_attempts THEN v_now ELSE expires_at END
    WHERE id = p_challenge_id;

    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'INVALID_OTP',
      'remaining_attempts', GREATEST(0, v_challenge.max_attempts - (v_challenge.attempt_count + 1))
    );
  END IF;

  -- E. Valid OTP: Mark verified and store completion token hash
  UPDATE public.registration_verification_challenges
  SET verified_at = v_now,
      completion_token_hash = p_token_hash,
      completion_token_expires_at = v_now + (p_token_ttl_seconds || ' seconds')::INTERVAL
  WHERE id = p_challenge_id;

  RETURN jsonb_build_object('success', TRUE, 'verified', TRUE);
END;
$$;

ALTER FUNCTION public.verify_registration_otp(UUID, TEXT, TEXT, TEXT, INT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.verify_registration_otp(UUID, TEXT, TEXT, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_registration_otp(UUID, TEXT, TEXT, TEXT, INT) TO service_role;

-- ------------------------------------------------------------------------------
-- 7. RPC: claim_registration_completion_lease
--    Grants 120-second lease to a worker, freezes full_name & role,
--    and enforces strict non-admin role allowlist.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_registration_completion_lease(
  p_challenge_id UUID,
  p_email TEXT,
  p_submitted_token_hash TEXT,
  p_full_name TEXT,
  p_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean_email TEXT := lower(trim(p_email));
  v_clean_role TEXT := lower(trim(p_role));
  v_clean_name TEXT := trim(p_full_name);
  v_challenge RECORD;
  v_lease_id UUID;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_lease_ttl INTERVAL := INTERVAL '120 seconds';
BEGIN
  -- A. Lock challenge row FOR UPDATE
  SELECT * INTO v_challenge
  FROM public.registration_verification_challenges
  WHERE id = p_challenge_id AND email = v_clean_email
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'CHALLENGE_NOT_FOUND');
  END IF;

  -- B. Check if already consumed
  IF v_challenge.consumed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', TRUE, 'already_consumed', TRUE);
  END IF;

  IF v_challenge.cancelled_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'CHALLENGE_CANCELLED');
  END IF;

  -- C. Validate completion token hash and token expiration
  IF v_challenge.completion_token_hash IS NULL 
     OR v_challenge.completion_token_hash <> p_submitted_token_hash 
     OR v_challenge.completion_token_expires_at <= v_now 
  THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'INVALID_OR_EXPIRED_COMPLETION_TOKEN');
  END IF;

  -- D. Check if an active unexpired lease is currently held by another worker
  IF v_challenge.completion_lease_expires_at IS NOT NULL 
     AND v_challenge.completion_lease_expires_at > v_now 
  THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'COMPLETION_IN_PROGRESS',
      'retry_after_seconds', GREATEST(1, EXTRACT(EPOCH FROM (v_challenge.completion_lease_expires_at - v_now))::INT)
    );
  END IF;

  -- E. Validate & Freeze Role and Full Name (First claim wins; retries retain frozen values)
  IF v_challenge.frozen_role IS NULL THEN
    IF v_clean_role NOT IN ('candidate', 'employer') THEN
      RETURN jsonb_build_object('success', FALSE, 'error', 'FORBIDDEN_ROLE');
    END IF;

    v_challenge.frozen_role := v_clean_role;
    v_challenge.frozen_full_name := COALESCE(v_clean_name, 'SkillSync User');
  END IF;

  -- F. Issue 120-second lease
  v_lease_id := gen_random_uuid();
  UPDATE public.registration_verification_challenges
  SET frozen_full_name = v_challenge.frozen_full_name,
      frozen_role = v_challenge.frozen_role,
      completion_lease_id = v_lease_id,
      completion_started_at = v_now,
      completion_lease_expires_at = v_now + v_lease_ttl
  WHERE id = p_challenge_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'lease_id', v_lease_id,
    'full_name', v_challenge.frozen_full_name,
    'role', v_challenge.frozen_role
  );
END;
$$;

ALTER FUNCTION public.claim_registration_completion_lease(UUID, TEXT, TEXT, TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.claim_registration_completion_lease(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_registration_completion_lease(UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- ------------------------------------------------------------------------------
-- 8. RPC: resolve_registration_auth_user
--    Queries auth.users directly to verify server-controlled app_metadata binding.
--    Eliminates listUsers() scanning/pagination in crash-recovery scenarios.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_registration_auth_user(
  p_email TEXT,
  p_challenge_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_clean_email TEXT := lower(trim(p_email));
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(trim(email)) = v_clean_email
    AND raw_app_meta_data ->> 'registration_challenge_id' = p_challenge_id::text
  LIMIT 1;

  RETURN v_user_id;
END;
$$;

ALTER FUNCTION public.resolve_registration_auth_user(TEXT, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.resolve_registration_auth_user(TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_registration_auth_user(TEXT, UUID) TO service_role;

-- ------------------------------------------------------------------------------
-- 9. RPC: commit_registration_completion
--    Validates exact lease ownership, creates profile with frozen metadata,
--    and atomically consumes the registration challenge.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.commit_registration_completion(
  p_challenge_id UUID,
  p_lease_id UUID,
  p_created_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_challenge RECORD;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF p_created_user_id IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'INVALID_USER_ID');
  END IF;

  -- A. Lock challenge row FOR UPDATE
  SELECT * INTO v_challenge
  FROM public.registration_verification_challenges
  WHERE id = p_challenge_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'CHALLENGE_NOT_FOUND');
  END IF;

  -- B. Check if already consumed
  IF v_challenge.consumed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', TRUE, 'already_consumed', TRUE);
  END IF;

  -- C. Validate exact lease ownership
  IF v_challenge.completion_lease_id IS NULL 
     OR v_challenge.completion_lease_id <> p_lease_id 
     OR v_challenge.completion_lease_expires_at < v_now 
  THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'INVALID_OR_EXPIRED_LEASE');
  END IF;

  -- D. Authoritatively create/upsert public.profiles row with frozen metadata
  INSERT INTO public.profiles (
    id,
    full_name,
    email,
    role,
    verification_status,
    is_suspended,
    created_at
  ) VALUES (
    p_created_user_id,
    v_challenge.frozen_full_name,
    v_challenge.email,
    v_challenge.frozen_role,
    'Pending Verification',
    FALSE,
    v_now
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    role = EXCLUDED.role;

  -- E. Atomically consume the challenge
  UPDATE public.registration_verification_challenges
  SET created_user_id = p_created_user_id,
      account_created_at = v_now,
      consumed_at = v_now,
      completion_lease_id = NULL,
      completion_lease_expires_at = NULL
  WHERE id = p_challenge_id;

  RETURN jsonb_build_object('success', TRUE, 'registered', TRUE);
END;
$$;

ALTER FUNCTION public.commit_registration_completion(UUID, UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.commit_registration_completion(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_registration_completion(UUID, UUID, UUID) TO service_role;
