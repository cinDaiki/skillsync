-- Migration: 20260903000000_harmonize_employer_verification.sql
-- Description: Harmonize employer verification state across profiles and employer_profiles,
-- make is_employer_job_eligible case-insensitive, and allow case-insensitive inputs (including 'Pending')
-- in admin_update_employer_verification with atomic synchronization.

-- 1. Synchronize & Normalize existing status values in public.profiles (temporarily disable integrity trigger during migration)
ALTER TABLE public.profiles DISABLE TRIGGER trg_enforce_profile_security_integrity;

UPDATE public.profiles
SET verification_status = 'Approved'
WHERE lower(trim(verification_status)) = 'approved';

UPDATE public.profiles
SET verification_status = 'Verified'
WHERE lower(trim(verification_status)) = 'verified';

UPDATE public.profiles
SET verification_status = 'Rejected'
WHERE lower(trim(verification_status)) = 'rejected';

UPDATE public.profiles
SET verification_status = 'Pending'
WHERE lower(trim(verification_status)) IN ('pending', 'pending verification', 'under review')
  AND role = 'employer';

ALTER TABLE public.profiles ENABLE TRIGGER trg_enforce_profile_security_integrity;

-- 2. Synchronize & Normalize existing status values in public.employer_profiles
UPDATE public.employer_profiles
SET verification_status = 'Approved'
WHERE lower(trim(verification_status)) = 'approved';

UPDATE public.employer_profiles
SET verification_status = 'Verified'
WHERE lower(trim(verification_status)) = 'verified';

UPDATE public.employer_profiles
SET verification_status = 'Rejected'
WHERE lower(trim(verification_status)) = 'rejected';

UPDATE public.employer_profiles
SET verification_status = 'Pending'
WHERE lower(trim(verification_status)) IN ('pending', 'pending verification', 'under review');

-- 3. Case-Insensitive Employer Job Eligibility Helper
CREATE OR REPLACE FUNCTION public.is_employer_job_eligible(target_employer_id UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = target_employer_id
      AND role = 'employer'
      AND (
        is_suspended IS FALSE
        OR (
          suspension_expires_at IS NOT NULL
          AND suspension_expires_at <= NOW()
        )
      )
      AND lower(trim(coalesce(verification_status, ''))) IN ('approved', 'verified')
  );
$$;

ALTER FUNCTION public.is_employer_job_eligible(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_employer_job_eligible(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_employer_job_eligible(UUID) TO authenticated, anon, service_role;

-- 4. Authoritative & Synchronized admin_update_employer_verification RPC
CREATE OR REPLACE FUNCTION public.admin_update_employer_verification(
  target_user_id uuid,
  new_status text,
  reason_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_normalized_status text;
  v_lower text;
BEGIN
  -- Strict Admin Authorization Check
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden: Admin authorization required.';
  END IF;

  v_lower := lower(trim(coalesce(new_status, '')));
  IF v_lower IN ('approved') THEN
    v_normalized_status := 'Approved';
  ELSIF v_lower IN ('verified') THEN
    v_normalized_status := 'Verified';
  ELSIF v_lower IN ('rejected') THEN
    v_normalized_status := 'Rejected';
  ELSIF v_lower IN ('pending', 'pending verification', 'under review') THEN
    v_normalized_status := 'Pending';
  ELSE
    RAISE EXCEPTION 'Invalid verification status: %. Allowed statuses: Pending, Approved, Verified, Rejected.', new_status;
  END IF;

  -- 1. Update main profile (canonical security authority)
  UPDATE public.profiles
  SET
    verification_status = v_normalized_status,
    verification_reason = CASE WHEN v_normalized_status = 'Rejected' THEN reason_note ELSE NULL END,
    verification_date = CASE WHEN v_normalized_status IN ('Approved', 'Verified') THEN NOW() ELSE verification_date END,
    updated_at = NOW()
  WHERE id = target_user_id;

  -- 2. Synchronize employer_profiles table atomically
  INSERT INTO public.employer_profiles (id, verification_status, updated_at)
  VALUES (target_user_id, v_normalized_status, NOW())
  ON CONFLICT (id) DO UPDATE
  SET
    verification_status = v_normalized_status,
    updated_at = NOW();

  -- 3. Write authoritative audit log
  INSERT INTO public.admin_audit_logs (
    admin_id,
    action,
    target_type,
    target_id,
    reason,
    metadata
  )
  VALUES (
    auth.uid(),
    CASE
      WHEN v_normalized_status IN ('Approved', 'Verified') THEN 'EMPLOYER_APPROVED'
      WHEN v_normalized_status = 'Rejected' THEN 'EMPLOYER_REJECTED'
      ELSE 'EMPLOYER_STATUS_UPDATED'
    END,
    'employer',
    target_user_id,
    reason_note,
    jsonb_build_object('new_status', v_normalized_status, 'raw_input', new_status)
  );
END;
$$;

ALTER FUNCTION public.admin_update_employer_verification(uuid, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_update_employer_verification(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_employer_verification(uuid, text, text) TO authenticated, service_role;
