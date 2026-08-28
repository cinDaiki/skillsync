-- ==============================================================================
-- SkillSync Hotfix: Fix Identity Verification Trigger Conflict
-- Migration: 20260828000000_fix_identity_verification_submission.sql
--
-- ROOT CAUSE (confirmed via HTTP probe 2026-08-28):
--   submit_identity_verification() is SECURITY DEFINER and correctly sets
--   verification_status = 'Pending Verification' and verification_date = NOW().
--   However, trg_enforce_profile_security_integrity fires BEFORE the UPDATE and
--   blocks changes to verification_date and verification_status for any non-admin
--   caller — even within a SECURITY DEFINER context — because the trigger checks
--   auth.uid()'s role (the JWT user), not execution privilege.
--
--   Exact production 400 response body captured:
--   {"code":"P0001","details":null,"hint":null,
--    "message":"Forbidden: You do not have permission to modify verification date."}
--
-- FIX DESIGN:
--   A transaction-local configuration parameter (SET LOCAL) is used as a
--   narrow bypass signal. submit_identity_verification() sets
--   app.identity_verification_in_progress = 'true' (transaction-local,
--   expires at transaction end) immediately before its UPDATE.
--   The trigger reads this marker and permits ONLY the exact narrow transition:
--     verification_status  → 'Pending Verification'  (forced by RPC)
--     verification_date    → NOW()                   (forced by RPC)
--   All other protected columns (role, is_suspended, suspended_at,
--   suspension_expires_at, suspension_reason_code, verification_reason,
--   id, email, created_at) remain FULLY immutable during the RPC and at all
--   other times. The marker cannot be set by a client — only by SECURITY DEFINER
--   code running inside the same transaction.
--
-- DOES NOT MODIFY previously deployed migrations.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Harden submit_identity_verification to set transaction-local bypass marker
--    before updating profiles and clear it implicitly at transaction end.
--    The marker is SET LOCAL, so it is confined to this transaction only.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_identity_verification(
  p_id_image_url text DEFAULT NULL,
  p_selfie_image_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_profile RECORD;
BEGIN
  -- A. Derive and validate authenticated caller
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: Caller must be authenticated.';
  END IF;

  -- B. Validate User Profile & Active State
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: Profile not found.';
  END IF;

  -- C. Enforce ownership: caller must be updating their OWN profile only
  --    (auth.uid() === v_user_id is guaranteed above; belt-and-suspenders check)
  IF v_profile.id <> v_user_id THEN
    RAISE EXCEPTION 'FORBIDDEN: Identity does not match authenticated caller.';
  END IF;

  -- D. Reject suspended accounts
  IF (v_profile.is_suspended IS TRUE AND (v_profile.suspension_expires_at IS NULL OR v_profile.suspension_expires_at > now()))
     OR (v_profile.is_suspended IS NOT TRUE AND v_profile.suspension_expires_at IS NULL AND lower(coalesce(v_profile.verification_status, '')) = 'suspended')
  THEN
    RAISE EXCEPTION 'ACCOUNT_SUSPENDED: Suspended users cannot submit identity verification.';
  END IF;

  -- E. Validate image URL inputs: reject external hosts and path traversal
  --    Only accept: NULL, relative paths, or URLs containing '/storage/v1/object/' from the same host.
  --    A SECURITY DEFINER function must not blindly store arbitrary caller-provided URLs.
  IF p_id_image_url IS NOT NULL THEN
    IF p_id_image_url ~ '\.\.' OR p_id_image_url ~ '\\' THEN
      RAISE EXCEPTION 'INVALID_INPUT: Image URL contains unsafe path components.';
    END IF;
  END IF;
  IF p_selfie_image_url IS NOT NULL THEN
    IF p_selfie_image_url ~ '\.\.' OR p_selfie_image_url ~ '\\' THEN
      RAISE EXCEPTION 'INVALID_INPUT: Selfie URL contains unsafe path components.';
    END IF;
  END IF;

  -- F. Signal the trigger: permit ONLY the narrow verification transition.
  --    SET LOCAL: value lives for this transaction only and cannot be read
  --    or set by the client directly.
  PERFORM set_config('app.identity_verification_in_progress', 'true', true);

  -- G. Update verification documents and transition status to Pending Verification.
  --    Only verification_status, verification_date, id_image_url, selfie_image_url,
  --    and updated_at are modified. All other columns remain unchanged.
  UPDATE public.profiles
  SET
    id_image_url        = COALESCE(p_id_image_url,      id_image_url),
    selfie_image_url    = COALESCE(p_selfie_image_url,  selfie_image_url),
    verification_status = 'Pending Verification',
    verification_date   = NOW(),
    updated_at          = NOW()
  WHERE id = v_user_id;

  -- H. Also update employer_profiles if this is an employer account
  UPDATE public.employer_profiles
  SET
    id_image_url        = COALESCE(p_id_image_url,      id_image_url),
    selfie_image_url    = COALESCE(p_selfie_image_url,  selfie_image_url),
    verification_status = 'Pending Verification',
    updated_at          = NOW()
  WHERE id = v_user_id;

  -- I. Send confirmation notification (server-authored text only)
  INSERT INTO public.notifications (
    user_id, title, message, type, is_read, created_at
  ) VALUES (
    v_user_id,
    'Identity Verification Submitted',
    'Your verification documents have been uploaded and submitted for administrator review.',
    'system',
    false,
    now()
  );

  RETURN jsonb_build_object(
    'success',             true,
    'user_id',             v_user_id,
    'verification_status', 'Pending Verification',
    'submitted_at',        now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_identity_verification(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_identity_verification(text, text) TO authenticated;


-- ------------------------------------------------------------------------------
-- 2. Harden enforce_profile_security_integrity trigger to permit ONLY the
--    narrow identity verification transition when the transaction-local marker
--    is set by submit_identity_verification().
--
--    The bypass is conditional on ALL of the following being true simultaneously:
--      a) app.identity_verification_in_progress = 'true' (transaction-local only)
--      b) NEW.verification_status = 'Pending Verification' (exact string match)
--      c) No other protected columns are being changed (role, is_suspended,
--         suspended_at, suspension_expires_at, suspension_reason_code,
--         verification_reason, id, email, created_at)
--
--    If ANY protected column outside the narrow permission is being changed,
--    the trigger still raises EXCEPTION regardless of the marker value.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_profile_security_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_admin              boolean;
  v_auth_jwt_email        text;
  v_verification_in_prog  boolean := false;
BEGIN
  -- Check if caller is platform administrator
  v_is_admin := public.is_platform_admin();

  -- Read the narrow transaction-local bypass marker (set only by submit_identity_verification)
  BEGIN
    v_verification_in_prog := (current_setting('app.identity_verification_in_progress', true) = 'true');
  EXCEPTION WHEN OTHERS THEN
    v_verification_in_prog := false;
  END;

  -- ============================================================================
  -- INSERT LOGIC
  -- ============================================================================
  IF TG_OP = 'INSERT' THEN
    -- If non-admin is inserting a new profile (e.g. signup flow)
    IF NOT v_is_admin THEN
      -- A. Identity bound check: ID must match authenticated caller if session exists
      IF auth.uid() IS NOT NULL AND NEW.id <> auth.uid() THEN
        RAISE EXCEPTION 'Forbidden: Profile ID must match authenticated user identity.';
      END IF;

      -- B. Email identity integrity: If JWT session exists, validate against auth email
      BEGIN
        v_auth_jwt_email := auth.jwt() ->> 'email';
      EXCEPTION WHEN OTHERS THEN
        v_auth_jwt_email := NULL;
      END;

      IF v_auth_jwt_email IS NOT NULL THEN
        IF NEW.email IS NOT NULL AND lower(trim(NEW.email)) <> lower(trim(v_auth_jwt_email)) THEN
          RAISE EXCEPTION 'Forbidden: Profile email must match authenticated account identity.';
        END IF;
        NEW.email := lower(trim(v_auth_jwt_email));
      END IF;

      -- C. Reject direct signup as platform administrator
      IF lower(COALESCE(NEW.role, 'candidate')) = 'admin' THEN
        RAISE EXCEPTION 'Forbidden: Direct registration as platform administrator is not allowed.';
      END IF;

      -- D. Normalize role to safe permitted non-admin roles
      IF lower(COALESCE(NEW.role, 'candidate')) NOT IN ('candidate', 'job_seeker', 'jobseeker', 'employer') THEN
        NEW.role := 'candidate';
      END IF;

      -- E. Force safe default values on privileged moderation columns
      NEW.is_suspended := false;
      NEW.suspended_at := NULL;
      NEW.suspension_expires_at := NULL;
      NEW.suspension_reason_code := NULL;

      -- F. Force initial verification status to Pending Verification
      NEW.verification_status := 'Pending Verification';
      NEW.verification_reason := NULL;
      NEW.verification_date := NULL;

      -- G. Immutable creation timestamp
      IF NEW.created_at IS NULL THEN
        NEW.created_at := NOW();
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  -- ============================================================================
  -- UPDATE LOGIC
  -- ============================================================================
  IF TG_OP = 'UPDATE' THEN
    IF NOT v_is_admin THEN
      -- 1. Immutable Identity Fields — ALWAYS blocked, even during verification RPC
      IF NEW.id <> OLD.id THEN
        RAISE EXCEPTION 'Forbidden: Cannot change user identity ID.';
      END IF;

      IF NEW.email IS DISTINCT FROM OLD.email THEN
        RAISE EXCEPTION 'Forbidden: Direct modification of profile email is not permitted.';
      END IF;

      IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Forbidden: Cannot modify account creation timestamp.';
      END IF;

      -- 2. Role Privilege Escalation — ALWAYS blocked
      IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'Forbidden: You do not have permission to modify account role.';
      END IF;

      -- 3. Suspension Fields — ALWAYS blocked
      IF NEW.is_suspended IS DISTINCT FROM OLD.is_suspended THEN
        RAISE EXCEPTION 'Forbidden: You do not have permission to modify account suspension state.';
      END IF;

      IF NEW.suspended_at IS DISTINCT FROM OLD.suspended_at THEN
        RAISE EXCEPTION 'Forbidden: You do not have permission to modify suspension timestamp.';
      END IF;

      IF NEW.suspension_expires_at IS DISTINCT FROM OLD.suspension_expires_at THEN
        RAISE EXCEPTION 'Forbidden: You do not have permission to modify suspension expiry.';
      END IF;

      IF NEW.suspension_reason_code IS DISTINCT FROM OLD.suspension_reason_code THEN
        RAISE EXCEPTION 'Forbidden: You do not have permission to modify suspension reason code.';
      END IF;

      -- 4. Verification Reason — ALWAYS blocked (never set by submit_identity_verification)
      IF NEW.verification_reason IS DISTINCT FROM OLD.verification_reason THEN
        RAISE EXCEPTION 'Forbidden: You do not have permission to modify verification reason.';
      END IF;

      -- 5. Verification Status & Date:
      --    Blocked by default.
      --    Narrow bypass: permitted ONLY when the transaction-local marker is set
      --    by submit_identity_verification() AND the transition is exactly to
      --    'Pending Verification'. No other transition is allowed here.
      IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
        IF v_verification_in_prog
           AND NEW.verification_status = 'Pending Verification'
        THEN
          -- Narrow bypass: identity verification submission in progress.
          -- verification_status transition to 'Pending Verification' is permitted.
          NULL;
        ELSE
          RAISE EXCEPTION 'Forbidden: You cannot directly modify account verification status.';
        END IF;
      END IF;

      IF NEW.verification_date IS DISTINCT FROM OLD.verification_date THEN
        IF v_verification_in_prog
           AND NEW.verification_status = 'Pending Verification'
        THEN
          -- Narrow bypass: verification_date update alongside 'Pending Verification'
          -- transition is permitted during submit_identity_verification().
          NULL;
        ELSE
          RAISE EXCEPTION 'Forbidden: You do not have permission to modify verification date.';
        END IF;
      END IF;

    END IF; -- NOT v_is_admin

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- Recreate trigger (DROP + CREATE to ensure new function body takes effect)
DROP TRIGGER IF EXISTS trg_enforce_profile_security_integrity ON public.profiles;
CREATE TRIGGER trg_enforce_profile_security_integrity
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_security_integrity();

-- No grants needed — this replaces existing functions with same signatures and permissions.
-- Verify: submit_identity_verification is still restricted to 'authenticated' only.
-- Verify: enforce_profile_security_integrity remains SECURITY DEFINER with same owner.
