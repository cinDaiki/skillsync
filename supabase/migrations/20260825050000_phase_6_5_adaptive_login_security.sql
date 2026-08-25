-- ==============================================================================
-- SkillSync Phase 6.5 Migration: Adaptive Login Security Architecture
-- Migration: 20260825050000_phase_6_5_adaptive_login_security.sql
--
-- Implements server-authoritative Adaptive Email Step-Up Verification:
--   1. public.trusted_devices (Cryptographic hash ledger for recognized devices)
--   2. public.verified_user_sessions (GoTrue session authorization ledger)
--   3. public.login_verification_challenges (Single-use HMAC challenge ledger)
--   4. public.is_current_session_verified() (Security helper)
--   5. public.get_login_gate_status() (Pre-verification minimal routing RPC)
--   6. public.check_session_trust_status() (Pre-verification raw token trust check)
--   7. public.list_trusted_devices(), revoke_trusted_device(), revoke_all_trusted_devices()
--   8. public.create_login_verification_challenge() (Service-role serialized creation)
--   9. public.finalize_login_verification() (Service-role atomic verification)
--  10. public.cancel_login_verification_challenge() (Service-role rollback on send error)
--  11. trg_auth_user_password_changed (Global trust revocation on password reset)
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- ── 1. Create Tables in Exact Dependency Order ──────────────────────────────

-- Table 1: Trusted Devices
CREATE TABLE IF NOT EXISTS public.trusted_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_token_hash TEXT NOT NULL,
  user_agent_hash TEXT,
  device_name TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_device_token_hash UNIQUE (user_id, device_token_hash)
);

CREATE INDEX IF NOT EXISTS idx_trusted_devices_lookup 
  ON public.trusted_devices(user_id, device_token_hash) 
  WHERE revoked_at IS NULL;

-- Table 2: Verified User Sessions
CREATE TABLE IF NOT EXISTS public.verified_user_sessions (
  session_id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_step_up_verified BOOLEAN NOT NULL DEFAULT FALSE,
  device_id UUID REFERENCES public.trusted_devices(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verified_sessions_auth 
  ON public.verified_user_sessions(session_id, user_id, is_step_up_verified);

-- Table 3: Login Verification Challenges
CREATE TABLE IF NOT EXISTS public.login_verification_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  otp_proof TEXT NOT NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  expires_at TIMESTAMPTZ NOT NULL,
  resend_available_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_challenge_per_session 
  ON public.login_verification_challenges(session_id) 
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_login_challenge_lookup 
  ON public.login_verification_challenges(id, user_id, session_id);

-- ── 2. Table RLS & Privilege Lockdown ───────────────────────────────────────

ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verified_user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_verification_challenges ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.trusted_devices FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.verified_user_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.login_verification_challenges FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.trusted_devices TO service_role;
GRANT ALL ON public.verified_user_sessions TO service_role;
GRANT ALL ON public.login_verification_challenges TO service_role;

-- ── 3. Helper Functions ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_current_session_verified()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_session_id UUID;
  v_user_id UUID := auth.uid();
  v_verified BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  BEGIN
    v_session_id := (auth.jwt() ->> 'session_id')::UUID;
  EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
  END;

  IF v_session_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT is_step_up_verified INTO v_verified
  FROM public.verified_user_sessions
  WHERE session_id = v_session_id
    AND user_id = v_user_id
    AND is_step_up_verified = TRUE;

  RETURN COALESCE(v_verified, FALSE);
END;
$$;

ALTER FUNCTION public.is_current_session_verified() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_current_session_verified() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_current_session_verified() TO authenticated, service_role;

-- ── 4. Public Pre-Verification Allowlist RPCs ────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_login_gate_status()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('authenticated', FALSE);
  END IF;

  SELECT role, is_suspended, suspension_expires_at, suspended_at
  INTO v_profile
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_profile.role IS NULL THEN
    RETURN jsonb_build_object(
      'authenticated', TRUE,
      'profile_exists', FALSE,
      'role', NULL,
      'is_suspended', FALSE,
      'suspension_expires_at', NULL
    );
  END IF;

  RETURN jsonb_build_object(
    'authenticated', TRUE,
    'profile_exists', TRUE,
    'role', v_profile.role,
    'is_suspended', COALESCE(v_profile.is_suspended, FALSE),
    'suspension_expires_at', v_profile.suspension_expires_at
  );
END;
$$;

ALTER FUNCTION public.get_login_gate_status() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_login_gate_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_login_gate_status() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.check_session_trust_status(p_device_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_session_id UUID;
  v_device_token_hash TEXT;
  v_device RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('is_trusted', FALSE, 'requires_otp', TRUE);
  END IF;

  BEGIN
    v_session_id := (auth.jwt() ->> 'session_id')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_session_id := NULL;
  END;

  IF v_session_id IS NULL THEN
    RETURN jsonb_build_object('is_trusted', FALSE, 'requires_otp', TRUE);
  END IF;

  IF p_device_token IS NOT NULL AND LENGTH(TRIM(p_device_token)) >= 32 THEN
    v_device_token_hash := encode(digest(TRIM(p_device_token)::bytea, 'sha256'::text), 'hex');

    SELECT id, expires_at INTO v_device
    FROM public.trusted_devices
    WHERE user_id = v_user_id
      AND device_token_hash = v_device_token_hash
      AND revoked_at IS NULL
      AND expires_at > NOW();

    IF v_device.id IS NOT NULL THEN
      -- Trusted Device Recognized: update last_seen_at (never extending absolute expires_at)
      UPDATE public.trusted_devices
      SET last_seen_at = NOW()
      WHERE id = v_device.id;

      -- Mark current session verified in ledger
      INSERT INTO public.verified_user_sessions (session_id, user_id, is_step_up_verified, device_id, verified_at)
      VALUES (v_session_id, v_user_id, TRUE, v_device.id, NOW())
      ON CONFLICT (session_id)
      DO UPDATE SET is_step_up_verified = TRUE, device_id = v_device.id, verified_at = NOW();

      RETURN jsonb_build_object('is_trusted', TRUE, 'requires_otp', FALSE);
    END IF;
  END IF;

  -- Device Untrusted / Missing / Expired
  INSERT INTO public.verified_user_sessions (session_id, user_id, is_step_up_verified, verified_at)
  VALUES (v_session_id, v_user_id, FALSE, NULL)
  ON CONFLICT (session_id)
  DO UPDATE SET is_step_up_verified = FALSE;

  RETURN jsonb_build_object('is_trusted', FALSE, 'requires_otp', TRUE);
END;
$$;

ALTER FUNCTION public.check_session_trust_status(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.check_session_trust_status(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_session_trust_status(TEXT) TO authenticated, service_role;

-- ── 5. Verified-Session Device Management RPCs ──────────────────────────────

CREATE OR REPLACE FUNCTION public.list_trusted_devices()
RETURNS TABLE (
  id UUID,
  device_name TEXT,
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_current BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF NOT public.is_current_session_verified() THEN
    RAISE EXCEPTION 'SESSION_STEP_UP_VERIFICATION_REQUIRED: Step-up verification required to access device management.';
  END IF;

  RETURN QUERY
  SELECT 
    d.id,
    d.device_name,
    d.first_seen_at,
    d.last_seen_at,
    d.expires_at,
    FALSE AS is_current
  FROM public.trusted_devices d
  WHERE d.user_id = auth.uid() AND d.revoked_at IS NULL AND d.expires_at > NOW()
  ORDER BY d.last_seen_at DESC;
END;
$$;

ALTER FUNCTION public.list_trusted_devices() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_trusted_devices() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_trusted_devices() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.revoke_trusted_device(p_device_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF NOT public.is_current_session_verified() THEN
    RAISE EXCEPTION 'SESSION_STEP_UP_VERIFICATION_REQUIRED: Step-up verification required to revoke trusted devices.';
  END IF;

  UPDATE public.trusted_devices
  SET revoked_at = NOW()
  WHERE id = p_device_id AND user_id = auth.uid();

  RETURN jsonb_build_object('success', TRUE);
END;
$$;

ALTER FUNCTION public.revoke_trusted_device(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.revoke_trusted_device(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_trusted_device(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.revoke_all_trusted_devices()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF NOT public.is_current_session_verified() THEN
    RAISE EXCEPTION 'SESSION_STEP_UP_VERIFICATION_REQUIRED: Step-up verification required to revoke all trusted devices.';
  END IF;

  UPDATE public.trusted_devices
  SET revoked_at = NOW()
  WHERE user_id = auth.uid() AND revoked_at IS NULL;

  RETURN jsonb_build_object('success', TRUE);
END;
$$;

ALTER FUNCTION public.revoke_all_trusted_devices() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.revoke_all_trusted_devices() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_all_trusted_devices() TO authenticated, service_role;

-- ── 6. Internal Service-Role-Only Challenge & Verification RPCs ──────────────

CREATE OR REPLACE FUNCTION public.create_login_verification_challenge(
  p_challenge_id UUID,
  p_user_id UUID,
  p_session_id UUID,
  p_otp_proof TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_active RECORD;
BEGIN
  -- 1. Explicit transaction-scoped advisory lock derived from session_id
  PERFORM pg_advisory_xact_lock(hashtextextended(p_session_id::TEXT, 0));

  -- 2. Check for active challenge in current session
  SELECT id, resend_available_at, expires_at INTO v_active
  FROM public.login_verification_challenges
  WHERE session_id = p_session_id AND consumed_at IS NULL;

  -- 3. Enforce 60-second cooldown
  IF v_active.id IS NOT NULL AND v_active.resend_available_at > NOW() THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'RESEND_COOLDOWN_ACTIVE',
      'retry_after_seconds', EXTRACT(EPOCH FROM (v_active.resend_available_at - NOW()))::INT
    );
  END IF;

  -- 4. Atomically consume previous active challenge if cooldown expired
  IF v_active.id IS NOT NULL THEN
    UPDATE public.login_verification_challenges
    SET consumed_at = NOW()
    WHERE id = v_active.id;
  END IF;

  -- 5. Insert new challenge using predetermined challenge_id
  INSERT INTO public.login_verification_challenges (
    id,
    user_id,
    session_id,
    otp_proof,
    attempt_count,
    max_attempts,
    expires_at,
    resend_available_at,
    created_at
  ) VALUES (
    p_challenge_id,
    p_user_id,
    p_session_id,
    p_otp_proof,
    0,
    5,
    NOW() + INTERVAL '10 minutes',
    NOW() + INTERVAL '60 seconds',
    NOW()
  );

  RETURN jsonb_build_object('success', TRUE, 'challenge_id', p_challenge_id);
END;
$$;

ALTER FUNCTION public.create_login_verification_challenge(UUID, UUID, UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_login_verification_challenge(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_login_verification_challenge(UUID, UUID, UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_login_verification(
  p_challenge_id UUID,
  p_user_id UUID,
  p_session_id UUID,
  p_submitted_otp_proof TEXT,
  p_remember_device BOOLEAN DEFAULT FALSE,
  p_raw_device_token TEXT DEFAULT NULL,
  p_device_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_challenge RECORD;
  v_is_admin BOOLEAN := FALSE;
  v_device_token_hash TEXT;
  v_ttl INTERVAL;
BEGIN
  -- 1. Lock challenge row to prevent concurrent race conditions
  SELECT * INTO v_challenge
  FROM public.login_verification_challenges
  WHERE id = p_challenge_id AND user_id = p_user_id AND session_id = p_session_id
  FOR UPDATE;

  IF v_challenge.id IS NULL OR v_challenge.consumed_at IS NOT NULL OR v_challenge.expires_at < NOW() THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'CHALLENGE_EXPIRED_OR_INVALID');
  END IF;

  IF v_challenge.attempt_count >= v_challenge.max_attempts THEN
    UPDATE public.login_verification_challenges SET consumed_at = NOW() WHERE id = v_challenge.id;
    RETURN jsonb_build_object('success', FALSE, 'error', 'MAX_ATTEMPTS_EXCEEDED');
  END IF;

  -- 2. Verify HMAC proof
  IF v_challenge.otp_proof != p_submitted_otp_proof THEN
    UPDATE public.login_verification_challenges
    SET 
      attempt_count = attempt_count + 1,
      consumed_at = CASE WHEN attempt_count + 1 >= max_attempts THEN NOW() ELSE NULL END
    WHERE id = v_challenge.id;

    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'INVALID_OTP',
      'remaining_attempts', v_challenge.max_attempts - (v_challenge.attempt_count + 1)
    );
  END IF;

  -- 3. Mark challenge consumed atomically
  UPDATE public.login_verification_challenges
  SET verified_at = NOW(), consumed_at = NOW()
  WHERE id = v_challenge.id;

  -- 4. Mark session verified in ledger
  INSERT INTO public.verified_user_sessions (session_id, user_id, is_step_up_verified, verified_at)
  VALUES (p_session_id, p_user_id, TRUE, NOW())
  ON CONFLICT (session_id)
  DO UPDATE SET is_step_up_verified = TRUE, verified_at = NOW();

  -- 5. Authoritatively determine Admin status using validated p_user_id (NOT ambient auth.uid)
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = 'admin'
  ) INTO v_is_admin;

  v_ttl := CASE WHEN v_is_admin THEN INTERVAL '14 days' ELSE INTERVAL '30 days' END;

  -- 6. Register/refresh trusted device if requested
  IF p_remember_device IS TRUE AND p_raw_device_token IS NOT NULL AND LENGTH(TRIM(p_raw_device_token)) >= 32 THEN
    v_device_token_hash := encode(digest(TRIM(p_raw_device_token)::bytea, 'sha256'::text), 'hex');

    INSERT INTO public.trusted_devices (
      user_id,
      device_token_hash,
      device_name,
      first_seen_at,
      last_seen_at,
      expires_at,
      revoked_at
    ) VALUES (
      p_user_id,
      v_device_token_hash,
      COALESCE(p_device_name, 'Web Browser'),
      NOW(),
      NOW(),
      NOW() + v_ttl,
      NULL
    )
    ON CONFLICT (user_id, device_token_hash)
    DO UPDATE SET last_seen_at = NOW(), expires_at = NOW() + v_ttl, revoked_at = NULL;
  END IF;

  RETURN jsonb_build_object('success', TRUE, 'verified', TRUE, 'is_admin', v_is_admin);
END;
$$;

ALTER FUNCTION public.finalize_login_verification(UUID, UUID, UUID, TEXT, BOOLEAN, TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.finalize_login_verification(UUID, UUID, UUID, TEXT, BOOLEAN, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_login_verification(UUID, UUID, UUID, TEXT, BOOLEAN, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.cancel_login_verification_challenge(
  p_challenge_id UUID,
  p_user_id UUID,
  p_session_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  UPDATE public.login_verification_challenges
  SET consumed_at = NOW()
  WHERE id = p_challenge_id 
    AND user_id = p_user_id 
    AND session_id = p_session_id 
    AND consumed_at IS NULL;
END;
$$;

ALTER FUNCTION public.cancel_login_verification_challenge(UUID, UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.cancel_login_verification_challenge(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_login_verification_challenge(UUID, UUID, UUID) TO service_role;

-- ── 7. Password Reset & Modification Revocation Trigger ─────────────────────

CREATE OR REPLACE FUNCTION public.handle_auth_user_password_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password THEN
    -- Revoke all active trusted devices for this user
    UPDATE public.trusted_devices 
    SET revoked_at = NOW() 
    WHERE user_id = NEW.id AND revoked_at IS NULL;

    -- Invalidate all active verified sessions for this user
    UPDATE public.verified_user_sessions 
    SET is_step_up_verified = FALSE 
    WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auth_user_password_changed ON auth.users;
CREATE TRIGGER trg_auth_user_password_changed
  AFTER UPDATE OF encrypted_password ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auth_user_password_change();
