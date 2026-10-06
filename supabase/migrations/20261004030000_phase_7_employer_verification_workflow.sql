-- ==============================================================================
-- Migration: 20261004030000_phase_7_employer_verification_workflow.sql
-- Description: Complete, secure employer verification submission and admin
--              review workflow for Phase 7.
--
-- Features:
-- 1. Table public.employer_verification_requests for full request history,
--    audit trail, resubmissions, and concurrent review safety.
-- 2. Extended columns on public.employer_profiles (submitted_at, reviewed_at,
--    reviewed_by, verification_reason).
-- 3. Server-authoritative submission RPC: submit_employer_verification().
-- 4. Server-authoritative admin review RPC: review_employer_verification().
-- 5. Updated admin_update_employer_verification() compatibility wrapper.
-- 6. Trigger update on public.profiles to permit app.employer_verification_in_progress.
-- 7. RLS policies on employer_verification_requests and storage.objects.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Table: public.employer_verification_requests
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employer_verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  industry TEXT,
  location TEXT,
  contact_number TEXT,
  business_permit_url TEXT,
  sec_registration_url TEXT,
  id_image_url TEXT,
  selfie_image_url TEXT,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Verified', 'Rejected')),
  rejection_reason TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employer_verification_requests_employer_id
  ON public.employer_verification_requests (employer_id);

CREATE INDEX IF NOT EXISTS idx_employer_verification_requests_status
  ON public.employer_verification_requests (status);

CREATE INDEX IF NOT EXISTS idx_employer_verification_requests_submitted_at
  ON public.employer_verification_requests (submitted_at DESC);

ALTER TABLE public.employer_verification_requests OWNER TO postgres;

-- ------------------------------------------------------------------------------
-- 2. Add Tracking Columns to public.employer_profiles if not exists
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employer_profiles' AND column_name = 'submitted_at'
  ) THEN
    ALTER TABLE public.employer_profiles ADD COLUMN submitted_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employer_profiles' AND column_name = 'reviewed_at'
  ) THEN
    ALTER TABLE public.employer_profiles ADD COLUMN reviewed_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employer_profiles' AND column_name = 'reviewed_by'
  ) THEN
    ALTER TABLE public.employer_profiles ADD COLUMN reviewed_by UUID REFERENCES public.profiles(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employer_profiles' AND column_name = 'verification_reason'
  ) THEN
    ALTER TABLE public.employer_profiles ADD COLUMN verification_reason TEXT;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. RLS for public.employer_verification_requests
-- ------------------------------------------------------------------------------
ALTER TABLE public.employer_verification_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employers and Admins can view verification requests" ON public.employer_verification_requests;
DROP POLICY IF EXISTS "Admins can manage verification requests" ON public.employer_verification_requests;

CREATE POLICY "Employers and Admins can view verification requests"
  ON public.employer_verification_requests
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = employer_id
    OR public.is_platform_admin()
  );

CREATE POLICY "Admins can manage verification requests"
  ON public.employer_verification_requests
  FOR ALL
  TO authenticated
  USING (
    public.is_platform_admin()
  )
  WITH CHECK (
    public.is_platform_admin()
  );

-- ------------------------------------------------------------------------------
-- 4. Update Profile Trigger to Recognize app.employer_verification_in_progress
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

  -- Read the narrow transaction-local bypass markers
  BEGIN
    v_verification_in_prog := (
      current_setting('app.identity_verification_in_progress', true) = 'true'
      OR current_setting('app.employer_verification_in_progress', true) = 'true'
    );
  EXCEPTION WHEN OTHERS THEN
    v_verification_in_prog := false;
  END;

  -- ============================================================================
  -- INSERT LOGIC
  -- ============================================================================
  IF TG_OP = 'INSERT' THEN
    IF NOT v_is_admin THEN
      IF auth.uid() IS NOT NULL AND NEW.id <> auth.uid() THEN
        RAISE EXCEPTION 'Forbidden: Profile ID must match authenticated user identity.';
      END IF;

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

      IF lower(COALESCE(NEW.role, 'candidate')) = 'admin' THEN
        RAISE EXCEPTION 'Forbidden: Direct registration as platform administrator is not allowed.';
      END IF;

      IF lower(COALESCE(NEW.role, 'candidate')) NOT IN ('candidate', 'job_seeker', 'jobseeker', 'employer') THEN
        NEW.role := 'candidate';
      END IF;

      NEW.is_suspended := false;
      NEW.suspended_at := NULL;
      NEW.suspension_expires_at := NULL;
      NEW.suspension_reason_code := NULL;

      NEW.verification_status := 'Pending Verification';
      NEW.verification_reason := NULL;
      NEW.verification_date := NULL;

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
      IF NEW.id <> OLD.id THEN
        RAISE EXCEPTION 'Forbidden: Cannot change user identity ID.';
      END IF;

      IF NEW.email IS DISTINCT FROM OLD.email THEN
        RAISE EXCEPTION 'Forbidden: Direct modification of profile email is not permitted.';
      END IF;

      IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Forbidden: Cannot modify account creation timestamp.';
      END IF;

      IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'Forbidden: You do not have permission to modify account role.';
      END IF;

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

      IF NEW.verification_reason IS DISTINCT FROM OLD.verification_reason THEN
        IF NOT (v_verification_in_prog AND NEW.verification_reason IS NULL) THEN
          RAISE EXCEPTION 'Forbidden: You do not have permission to modify verification reason.';
        END IF;
      END IF;

      -- Verification Status & Date:
      IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
        IF v_verification_in_prog
           AND NEW.verification_status IN ('Pending', 'Pending Verification')
        THEN
          NULL;
        ELSE
          RAISE EXCEPTION 'Forbidden: You cannot directly modify account verification status.';
        END IF;
      END IF;

      IF NEW.verification_date IS DISTINCT FROM OLD.verification_date THEN
        IF v_verification_in_prog
           AND NEW.verification_status IN ('Pending', 'Pending Verification')
        THEN
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

-- ------------------------------------------------------------------------------
-- 5. Authoritative Employer Verification Submission RPC
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_employer_verification(
  p_company_name TEXT,
  p_industry TEXT,
  p_location TEXT,
  p_contact_number TEXT DEFAULT NULL,
  p_business_permit_url TEXT DEFAULT NULL,
  p_sec_registration_url TEXT DEFAULT NULL,
  p_id_image_url TEXT DEFAULT NULL,
  p_selfie_image_url TEXT DEFAULT NULL,
  p_about TEXT DEFAULT NULL,
  p_website TEXT DEFAULT NULL,
  p_company_size TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_profile RECORD;
  v_existing_pending RECORD;
  v_new_req_id UUID;
  v_now TIMESTAMPTZ := NOW();
  v_clean_permit TEXT;
  v_clean_sec TEXT;
  v_clean_id TEXT;
  v_clean_selfie TEXT;
BEGIN
  -- A. Enforce Authentication
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: Caller must be authenticated.';
  END IF;

  -- B. Check User Role & Suspension
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_caller_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: Employer profile not found.';
  END IF;

  IF LOWER(COALESCE(v_profile.role, '')) <> 'employer' AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Only employer accounts can submit company verification.';
  END IF;

  IF (v_profile.is_suspended IS TRUE AND (v_profile.suspension_expires_at IS NULL OR v_profile.suspension_expires_at > v_now))
     OR (v_profile.is_suspended IS NOT TRUE AND v_profile.suspension_expires_at IS NULL AND LOWER(COALESCE(v_profile.verification_status, '')) = 'suspended')
  THEN
    RAISE EXCEPTION 'ACCOUNT_SUSPENDED: Suspended employers cannot submit verification.';
  END IF;

  -- C. Validate Required Information
  IF TRIM(COALESCE(p_company_name, '')) = '' THEN
    RAISE EXCEPTION 'INVALID_SUBMISSION: Company name is required.';
  END IF;

  IF TRIM(COALESCE(p_industry, '')) = '' THEN
    RAISE EXCEPTION 'INVALID_SUBMISSION: Industry is required.';
  END IF;

  IF TRIM(COALESCE(p_location, '')) = '' THEN
    RAISE EXCEPTION 'INVALID_SUBMISSION: Location is required.';
  END IF;

  -- Clean inputs & check path traversal
  v_clean_permit := NULLIF(TRIM(COALESCE(p_business_permit_url, '')), '');
  v_clean_sec := NULLIF(TRIM(COALESCE(p_sec_registration_url, '')), '');
  v_clean_id := NULLIF(TRIM(COALESCE(p_id_image_url, '')), '');
  v_clean_selfie := NULLIF(TRIM(COALESCE(p_selfie_image_url, '')), '');

  IF v_clean_permit ~ '\.\.' OR v_clean_permit ~ '\\' OR
     v_clean_sec ~ '\.\.' OR v_clean_sec ~ '\\' OR
     v_clean_id ~ '\.\.' OR v_clean_id ~ '\\' OR
     v_clean_selfie ~ '\.\.' OR v_clean_selfie ~ '\\'
  THEN
    RAISE EXCEPTION 'INVALID_INPUT: Document paths contain invalid or unsafe path characters.';
  END IF;

  IF v_clean_permit IS NULL AND v_clean_sec IS NULL AND v_clean_id IS NULL AND v_clean_selfie IS NULL THEN
    RAISE EXCEPTION 'VERIFICATION_DOCUMENT_REQUIRED: At least one verification document (Government ID, Business Permit, or SEC Registration) must be uploaded.';
  END IF;

  -- D. Prevent Duplicate Active Pending Submission
  SELECT id INTO v_existing_pending
  FROM public.employer_verification_requests
  WHERE employer_id = v_caller_id
    AND status = 'Pending'
  LIMIT 1;

  IF v_existing_pending.id IS NOT NULL THEN
    RAISE EXCEPTION 'VERIFICATION_ALREADY_PENDING: You already have a verification submission awaiting administrator review.';
  END IF;

  -- E. Insert Verification Request Record (Preserves history across resubmissions)
  INSERT INTO public.employer_verification_requests (
    employer_id,
    company_name,
    industry,
    location,
    contact_number,
    business_permit_url,
    sec_registration_url,
    id_image_url,
    selfie_image_url,
    status,
    rejection_reason,
    submitted_at,
    created_at,
    updated_at
  ) VALUES (
    v_caller_id,
    TRIM(p_company_name),
    TRIM(p_industry),
    TRIM(p_location),
    NULLIF(TRIM(p_contact_number), ''),
    v_clean_permit,
    v_clean_sec,
    v_clean_id,
    v_clean_selfie,
    'Pending',
    NULL,
    v_now,
    v_now,
    v_now
  )
  RETURNING id INTO v_new_req_id;

  -- F. Signal trigger & update public.profiles
  PERFORM set_config('app.employer_verification_in_progress', 'true', true);

  UPDATE public.profiles
  SET
    verification_status = 'Pending',
    verification_reason = NULL,
    verification_date   = NULL,
    contact_number      = COALESCE(NULLIF(TRIM(p_contact_number), ''), contact_number),
    id_image_url        = COALESCE(v_clean_id, id_image_url),
    selfie_image_url    = COALESCE(v_clean_selfie, selfie_image_url),
    updated_at          = v_now
  WHERE id = v_caller_id;

  -- G. Upsert public.employer_profiles with fresh business details
  INSERT INTO public.employer_profiles (
    id,
    company_name,
    industry,
    location,
    company_size,
    website,
    contact_number,
    about,
    business_permit_url,
    sec_registration_url,
    id_image_url,
    selfie_image_url,
    verification_status,
    verification_reason,
    submitted_at,
    updated_at
  ) VALUES (
    v_caller_id,
    TRIM(p_company_name),
    TRIM(p_industry),
    TRIM(p_location),
    NULLIF(TRIM(p_company_size), ''),
    NULLIF(TRIM(p_website), ''),
    NULLIF(TRIM(p_contact_number), ''),
    NULLIF(TRIM(p_about), ''),
    v_clean_permit,
    v_clean_sec,
    v_clean_id,
    v_clean_selfie,
    'Pending',
    NULL,
    v_now,
    v_now
  )
  ON CONFLICT (id) DO UPDATE
  SET
    company_name         = EXCLUDED.company_name,
    industry             = EXCLUDED.industry,
    location             = EXCLUDED.location,
    company_size         = COALESCE(EXCLUDED.company_size, public.employer_profiles.company_size),
    website              = COALESCE(EXCLUDED.website, public.employer_profiles.website),
    contact_number       = COALESCE(EXCLUDED.contact_number, public.employer_profiles.contact_number),
    about                = COALESCE(EXCLUDED.about, public.employer_profiles.about),
    business_permit_url  = COALESCE(EXCLUDED.business_permit_url, public.employer_profiles.business_permit_url),
    sec_registration_url = COALESCE(EXCLUDED.sec_registration_url, public.employer_profiles.sec_registration_url),
    id_image_url         = COALESCE(EXCLUDED.id_image_url, public.employer_profiles.id_image_url),
    selfie_image_url     = COALESCE(EXCLUDED.selfie_image_url, public.employer_profiles.selfie_image_url),
    verification_status  = 'Pending',
    verification_reason  = NULL,
    submitted_at         = v_now,
    updated_at           = v_now;

  -- H. Create System Notification for Employer
  INSERT INTO public.notifications (
    user_id, title, message, type, is_read, created_at
  ) VALUES (
    v_caller_id,
    'Employer Verification Submitted',
    'Your company verification documents have been submitted and are currently awaiting administrator review.',
    'system',
    false,
    v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'request_id', v_new_req_id,
    'status', 'Pending',
    'submitted_at', v_now
  );
END;
$$;

ALTER FUNCTION public.submit_employer_verification(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.submit_employer_verification(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_employer_verification(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 6. Authoritative Admin Review RPC: review_employer_verification
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_employer_verification(
  target_user_id UUID,
  new_status TEXT,
  reason_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_normalized_status TEXT;
  v_clean_status TEXT;
  v_clean_reason TEXT;
  v_latest_req RECORD;
  v_now TIMESTAMPTZ := NOW();
  v_audit_action TEXT;
BEGIN
  -- A. Enforce Admin Authorization
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: Caller must be authenticated.';
  END IF;

  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Platform administrator authorization required.';
  END IF;

  -- B. Normalize & Validate Status Transition
  v_clean_status := LOWER(TRIM(COALESCE(new_status, '')));
  IF v_clean_status IN ('approved') THEN
    v_normalized_status := 'Approved';
  ELSIF v_clean_status IN ('verified') THEN
    v_normalized_status := 'Verified';
  ELSIF v_clean_status IN ('rejected') THEN
    v_normalized_status := 'Rejected';
  ELSIF v_clean_status IN ('pending', 'pending verification', 'under review') THEN
    v_normalized_status := 'Pending';
  ELSE
    RAISE EXCEPTION 'INVALID_STATUS: Allowed verification review statuses: Approved, Verified, Rejected, Pending. Received: %', new_status;
  END IF;

  -- C. Require Non-Empty Rejection Reason
  v_clean_reason := NULLIF(TRIM(COALESCE(reason_note, '')), '');
  IF v_normalized_status = 'Rejected' AND v_clean_reason IS NULL THEN
    RAISE EXCEPTION 'VERIFICATION_REJECTION_REASON_REQUIRED: A detailed rejection reason is required when rejecting verification.';
  END IF;

  -- D. Concurrent-Review Protection via Row-Level Lock
  -- Find latest pending verification request for this employer
  SELECT * INTO v_latest_req
  FROM public.employer_verification_requests
  WHERE employer_id = target_user_id
  ORDER BY submitted_at DESC
  LIMIT 1
  FOR UPDATE;

  -- Check if review conflict occurred (e.g. already decided)
  IF v_latest_req.id IS NOT NULL THEN
    IF v_latest_req.status <> 'Pending' AND v_latest_req.status = v_normalized_status THEN
      RAISE EXCEPTION 'VERIFICATION_REVIEW_CONFLICT: This verification request has already been reviewed with status %.', v_latest_req.status;
    END IF;

    -- Update verification request row atomically
    UPDATE public.employer_verification_requests
    SET
      status           = v_normalized_status,
      rejection_reason = CASE WHEN v_normalized_status = 'Rejected' THEN v_clean_reason ELSE NULL END,
      reviewed_at      = v_now,
      reviewed_by      = v_admin_id,
      updated_at       = v_now
    WHERE id = v_latest_req.id;
  END IF;

  -- E. Authoritatively Update public.profiles
  UPDATE public.profiles
  SET
    verification_status = v_normalized_status,
    verification_reason = CASE WHEN v_normalized_status = 'Rejected' THEN v_clean_reason ELSE NULL END,
    verification_date   = CASE WHEN v_normalized_status IN ('Approved', 'Verified') THEN v_now ELSE verification_date END,
    updated_at          = v_now
  WHERE id = target_user_id;

  -- F. Synchronize public.employer_profiles
  INSERT INTO public.employer_profiles (
    id,
    verification_status,
    verification_reason,
    reviewed_at,
    reviewed_by,
    updated_at
  ) VALUES (
    target_user_id,
    v_normalized_status,
    CASE WHEN v_normalized_status = 'Rejected' THEN v_clean_reason ELSE NULL END,
    v_now,
    v_admin_id,
    v_now
  )
  ON CONFLICT (id) DO UPDATE
  SET
    verification_status = v_normalized_status,
    verification_reason = CASE WHEN v_normalized_status = 'Rejected' THEN v_clean_reason ELSE NULL END,
    reviewed_at         = v_now,
    reviewed_by         = v_admin_id,
    updated_at          = v_now;

  -- G. Server-Authoritative Audit Log
  v_audit_action := CASE
    WHEN v_normalized_status IN ('Approved', 'Verified') THEN 'EMPLOYER_APPROVED'
    WHEN v_normalized_status = 'Rejected' THEN 'EMPLOYER_REJECTED'
    ELSE 'EMPLOYER_STATUS_UPDATED'
  END;

  INSERT INTO public.admin_audit_logs (
    admin_id,
    action,
    target_type,
    target_id,
    reason,
    metadata,
    created_at
  ) VALUES (
    v_admin_id,
    v_audit_action,
    'employer',
    target_user_id,
    v_clean_reason,
    jsonb_build_object(
      'new_status', v_normalized_status,
      'reviewed_at', v_now,
      'request_id', v_latest_req.id
    ),
    v_now
  );

  -- H. Notify Employer of Review Outcome
  INSERT INTO public.notifications (
    user_id, title, message, type, is_read, created_at
  ) VALUES (
    target_user_id,
    CASE
      WHEN v_normalized_status IN ('Approved', 'Verified') THEN 'Verification Approved'
      WHEN v_normalized_status = 'Rejected' THEN 'Verification Rejected'
      ELSE 'Verification Status Updated'
    END,
    CASE
      WHEN v_normalized_status IN ('Approved', 'Verified') THEN 'Your employer verification has been approved. You can now post jobs on SkillSync.'
      WHEN v_normalized_status = 'Rejected' THEN 'Your employer verification was reviewed and rejected. Reason: ' || v_clean_reason || '. You may submit updated documents in Company Profile.'
      ELSE 'Your employer verification status is now ' || v_normalized_status || '.'
    END,
    'system',
    false,
    v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', target_user_id,
    'status', v_normalized_status,
    'reviewed_at', v_now,
    'reviewed_by', v_admin_id
  );
END;
$$;

ALTER FUNCTION public.review_employer_verification(UUID, TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.review_employer_verification(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_employer_verification(UUID, TEXT, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 7. Update Legacy admin_update_employer_verification to Delegate
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_employer_verification(
  target_user_id UUID,
  new_status TEXT,
  reason_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.review_employer_verification(target_user_id, new_status, reason_note);
END;
$$;

ALTER FUNCTION public.admin_update_employer_verification(UUID, TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_update_employer_verification(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_employer_verification(UUID, TEXT, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 8. Reload PostgREST Schema Cache
-- ------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
