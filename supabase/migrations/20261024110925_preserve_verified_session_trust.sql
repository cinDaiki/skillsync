-- Keep OTP-verified sessions valid without requiring a remembered device.
-- Preserve per-session identity checks and device revocation/expiry.
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

  -- OTP authorizes this session even when the user does not remember the device.
  -- Match BOTH JWT identities; never infer verification from a timestamp alone.
  -- Device-linked sessions still lose trust when the device expires or is revoked.
  IF EXISTS (
    SELECT 1 FROM public.verified_user_sessions s
    WHERE s.session_id = v_session_id
      AND s.user_id = v_user_id
      AND s.is_step_up_verified IS TRUE
      AND (s.device_id IS NULL OR EXISTS (
        SELECT 1 FROM public.trusted_devices d
        WHERE d.id = s.device_id AND d.user_id = v_user_id
          AND d.revoked_at IS NULL AND d.expires_at > NOW()
      ))
  ) THEN
    RETURN jsonb_build_object('is_trusted', TRUE, 'requires_otp', FALSE);
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


NOTIFY pgrst, 'reload schema';
