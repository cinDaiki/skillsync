-- ==============================================================================
-- SkillSync Phase 6B-1: Critical Authority & Privilege Hardening Migration
-- Migration: 20260825000000_phase_6_security_authority_hardening.sql
-- ==============================================================================
-- Remediates:
--  1. [CRIT-01] Privilege Escalation via profiles (Self-Admin, Self-Unsuspend, Direct verification_status mutation)
--  2. [CRIT-02] Unauthorized Execution of Legacy Admin SECURITY DEFINER RPCs
--  3. [HIGH-04] IDOR in submit_job_application RPC (Forced auth.uid() Derivation)
--  4. [HIGH-05] Arbitrary Notification Injection & Forged Cross-User / System Notifications
--  5. [INTEG-01] Immutable Identity Enforcement (id, email, created_at)
--  6. [AUTH-01] Server-Authoritative Identity Verification Submission (submit_identity_verification)
--  7. [AUTH-02] Server-Authoritative Email Identity Derivation on Profile Signup
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Standardize and Harden is_platform_admin() Helper
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, anon;


-- ------------------------------------------------------------------------------
-- 2. Server-Authoritative Identity Verification Submission RPC
--    Replaces direct client verification_status updates with a trusted RPC.
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

  IF (v_profile.is_suspended IS TRUE AND (v_profile.suspension_expires_at IS NULL OR v_profile.suspension_expires_at > now()))
     OR (v_profile.is_suspended IS NOT TRUE AND v_profile.suspension_expires_at IS NULL AND lower(coalesce(v_profile.verification_status, '')) = 'suspended')
  THEN
    RAISE EXCEPTION 'ACCOUNT_SUSPENDED: Suspended users cannot submit identity verification.';
  END IF;

  -- C. Update verification documents and transition status to Pending Verification
  UPDATE public.profiles
  SET
    id_image_url = COALESCE(p_id_image_url, id_image_url),
    selfie_image_url = COALESCE(p_selfie_image_url, selfie_image_url),
    verification_status = 'Pending Verification',
    verification_date = NOW(),
    updated_at = NOW()
  WHERE id = v_user_id;

  -- Also update employer_profiles if this is an employer account
  UPDATE public.employer_profiles
  SET
    id_image_url = COALESCE(p_id_image_url, id_image_url),
    selfie_image_url = COALESCE(p_selfie_image_url, selfie_image_url),
    verification_status = 'Pending Verification',
    updated_at = NOW()
  WHERE id = v_user_id;

  -- D. Send confirmation notification to user (Security Definer write with server-authored text)
  INSERT INTO public.notifications (
    user_id,
    title,
    message,
    type,
    is_read,
    created_at
  )
  VALUES (
    v_user_id,
    'Identity Verification Submitted',
    'Your verification documents have been uploaded and submitted for administrator review.',
    'system',
    false,
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'verification_status', 'Pending Verification',
    'submitted_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_identity_verification(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_identity_verification(text, text) TO authenticated;


-- ------------------------------------------------------------------------------
-- 3. Trigger-Based Column Protection on public.profiles
--    Guarantees that non-admin callers cannot mutate privileged columns:
--    - Immutable Identity: id, email, created_at
--    - Privilege: role ('admin' injection)
--    - Suspension: is_suspended, suspended_at, suspension_expires_at, suspension_reason_code
--    - Verification: verification_status (complete direct-write lockdown), verification_reason, verification_date
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_profile_security_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_admin boolean;
  v_auth_jwt_email text;
BEGIN
  -- Check if caller is platform administrator
  v_is_admin := public.is_platform_admin();

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
    -- If caller is NOT a platform administrator, block changes to protected columns
    IF NOT v_is_admin THEN
      -- 1. Immutable Identity Fields
      IF NEW.id <> OLD.id THEN
        RAISE EXCEPTION 'Forbidden: Cannot change user identity ID.';
      END IF;

      IF NEW.email IS DISTINCT FROM OLD.email THEN
        RAISE EXCEPTION 'Forbidden: Direct modification of profile email is not permitted.';
      END IF;

      IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Forbidden: Cannot modify account creation timestamp.';
      END IF;

      -- 2. Role Privilege Escalation (e.g. candidate -> admin)
      IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'Forbidden: You do not have permission to modify account role.';
      END IF;

      -- 3. Self-Unsuspension & Suspension Metadata Tampering
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

      -- 4. Complete Lockdown of verification_status (Zero direct client modification)
      -- Verification transitions must occur strictly through submit_identity_verification or admin RPCs.
      IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
        RAISE EXCEPTION 'Forbidden: You cannot directly modify account verification status.';
      END IF;

      -- 5. Verification Reason & Date Tampering
      IF NEW.verification_reason IS DISTINCT FROM OLD.verification_reason THEN
        RAISE EXCEPTION 'Forbidden: You do not have permission to modify verification reason.';
      END IF;

      IF NEW.verification_date IS DISTINCT FROM OLD.verification_date THEN
        RAISE EXCEPTION 'Forbidden: You do not have permission to modify verification date.';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_profile_security_integrity ON public.profiles;
CREATE TRIGGER trg_enforce_profile_security_integrity
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_security_integrity();


-- ------------------------------------------------------------------------------
-- 4. Harden admin_update_employer_verification RPC
-- ------------------------------------------------------------------------------
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
BEGIN
  -- Strict Admin Authorization Check
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden: Admin authorization required.';
  END IF;

  v_normalized_status := new_status;
  IF lower(v_normalized_status) = 'approved' THEN
    v_normalized_status := 'Approved';
  ELSIF lower(v_normalized_status) = 'rejected' THEN
    v_normalized_status := 'Rejected';
  ELSIF lower(v_normalized_status) = 'verified' THEN
    v_normalized_status := 'Verified';
  ELSE
    RAISE EXCEPTION 'Invalid verification status: %. Only Approved, Rejected, and Verified are permitted.', new_status;
  END IF;

  -- Update main profile
  UPDATE public.profiles
  SET
    verification_status = v_normalized_status,
    verification_reason = reason_note,
    verification_date = CASE WHEN v_normalized_status IN ('Approved', 'Verified') THEN NOW() ELSE verification_date END,
    updated_at = NOW()
  WHERE id = target_user_id;

  -- Update employer profile
  UPDATE public.employer_profiles
  SET
    verification_status = v_normalized_status,
    updated_at = NOW()
  WHERE id = target_user_id;

  -- Write authoritative audit record
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
    jsonb_build_object('verification_status', v_normalized_status)
  );

  -- Emit authoritative server-templated notification to the employer
  INSERT INTO public.notifications (
    user_id,
    title,
    message,
    type,
    is_read,
    created_at
  )
  VALUES (
    target_user_id,
    CASE
      WHEN v_normalized_status IN ('Approved', 'Verified') THEN 'Employer Account Verified'
      ELSE 'Employer Verification Update'
    END,
    CASE
      WHEN v_normalized_status IN ('Approved', 'Verified') THEN 'Your company verification has been approved by a platform administrator. Your job listings are now active.'
      ELSE COALESCE(reason_note, 'Your verification submission was reviewed and rejected. Please re-upload valid company documents.')
    END,
    'system',
    false,
    now()
  );
END;
$$;


-- ------------------------------------------------------------------------------
-- 5. Harden Legacy Admin RPCs (Authorization Guards & Safe search_path)
-- ------------------------------------------------------------------------------

-- A. admin_delete_resume
CREATE OR REPLACE FUNCTION public.admin_delete_resume(user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden: Admin authorization required.';
  END IF;

  DELETE FROM public.resumes WHERE applicant_id = user_id;
  UPDATE public.applications
    SET applicant_snapshot = applicant_snapshot - 'resume'
    WHERE applicant_id = user_id;
END;
$$;

-- B. admin_delete_user
CREATE OR REPLACE FUNCTION public.admin_delete_user(user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden: Admin authorization required.';
  END IF;

  DELETE FROM public.resumes WHERE applicant_id = user_id;
  DELETE FROM public.applications WHERE applicant_id = user_id;
  DELETE FROM public.profiles WHERE id = user_id;
END;
$$;

-- C. admin_get_all_applications
CREATE OR REPLACE FUNCTION public.admin_get_all_applications()
RETURNS TABLE(
  id uuid, job_id uuid, applicant_id uuid, status text, created_at timestamptz,
  applicant_snapshot jsonb, job_title text, job_employment_type text, job_location text,
  job_required_skills text, job_employer_id uuid, employer_name text, employer_email text,
  applicant_name text, applicant_email text, resume_file_url text, resume_file_name text,
  resume_file_size bigint, resume_created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden: Admin authorization required.';
  END IF;

  RETURN QUERY
  SELECT a.id, a.job_id, a.applicant_id, a.status, a.created_at, a.applicant_snapshot,
    j.title, j.employment_type, j.location, j.required_skills, j.employer_id,
    emp.full_name, emp.email,
    COALESCE(p.full_name, a.applicant_snapshot->>'full_name'),
    COALESCE(p.email, a.applicant_snapshot->>'email'),
    COALESCE(r.file_url, a.applicant_snapshot->'resume'->>'file_url'),
    COALESCE(r.file_name, a.applicant_snapshot->'resume'->>'file_name'),
    COALESCE(r.file_size, (a.applicant_snapshot->'resume'->>'file_size')::bigint),
    COALESCE(r.created_at, (a.applicant_snapshot->'resume'->>'created_at')::timestamptz)
  FROM public.applications a
  JOIN public.jobs j ON j.id = a.job_id
  LEFT JOIN public.profiles p ON p.id = a.applicant_id
  LEFT JOIN public.profiles emp ON emp.id = j.employer_id
  LEFT JOIN public.resumes r ON r.applicant_id = a.applicant_id
  ORDER BY a.created_at DESC;
END;
$$;

-- D. admin_get_all_jobs
CREATE OR REPLACE FUNCTION public.admin_get_all_jobs()
RETURNS TABLE(
  id uuid, title text, description text, employment_type text, location text,
  required_skills text, status text, employer_id uuid, created_at timestamptz,
  employer_name text, employer_email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden: Admin authorization required.';
  END IF;

  RETURN QUERY
  SELECT j.id, j.title, j.description, j.employment_type, j.location,
    j.required_skills, j.status, j.employer_id, j.created_at,
    p.full_name AS employer_name, p.email AS employer_email
  FROM public.jobs j
  LEFT JOIN public.profiles p ON p.id = j.employer_id
  ORDER BY j.created_at DESC NULLS LAST;
END;
$$;

-- E. admin_get_all_profiles
CREATE OR REPLACE FUNCTION public.admin_get_all_profiles()
RETURNS SETOF public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden: Admin authorization required.';
  END IF;

  RETURN QUERY
  SELECT * FROM public.profiles ORDER BY created_at DESC NULLS LAST;
END;
$$;

-- F. admin_get_all_resumes
CREATE OR REPLACE FUNCTION public.admin_get_all_resumes()
RETURNS TABLE(
  applicant_id uuid, file_url text, file_name text, file_size bigint,
  created_at timestamptz, applicant_name text, applicant_email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden: Admin authorization required.';
  END IF;

  RETURN QUERY
  SELECT r.applicant_id, r.file_url, r.file_name, r.file_size, r.created_at,
    p.full_name AS applicant_name, p.email AS applicant_email
  FROM public.resumes r
  LEFT JOIN public.profiles p ON p.id = r.applicant_id
  ORDER BY r.created_at DESC NULLS LAST;
END;
$$;

-- G. admin_get_dashboard_stats
CREATE OR REPLACE FUNCTION public.admin_get_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden: Admin authorization required.';
  END IF;

  RETURN json_build_object(
    'job_seekers', (SELECT count(*)::int FROM public.profiles WHERE role IN ('candidate', 'job_seeker', 'jobseeker')),
    'employers',   (SELECT count(*)::int FROM public.profiles WHERE role = 'employer'),
    'total_jobs',  (SELECT count(*)::int FROM public.jobs),
    'open_jobs',   (SELECT count(*)::int FROM public.jobs WHERE status = 'open'),
    'closed_jobs', (SELECT count(*)::int FROM public.jobs WHERE status = 'closed'),
    'total_applications', (SELECT count(*)::int FROM public.applications)
  );
END;
$$;

-- H. admin_toggle_user_suspension (Legacy/Deprecated — Hardened in place)
CREATE OR REPLACE FUNCTION public.admin_toggle_user_suspension(user_id uuid, suspend_status boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden: Admin authorization required.';
  END IF;

  UPDATE public.profiles
  SET
    is_suspended = suspend_status,
    suspended_at = CASE WHEN suspend_status IS TRUE THEN NOW() ELSE NULL END,
    updated_at = NOW()
  WHERE id = user_id;
END;
$$;

-- I. admin_update_profile (Legacy/Deprecated — Hardened in place)
CREATE OR REPLACE FUNCTION public.admin_update_profile(
  user_id uuid, new_full_name text, new_email text, new_contact_number text,
  new_address text, new_skills text, new_role text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden: Admin authorization required.';
  END IF;

  UPDATE public.profiles SET
    full_name = new_full_name,
    email = new_email,
    contact_number = new_contact_number,
    address = new_address,
    skills = new_skills,
    role = new_role,
    updated_at = NOW()
  WHERE id = user_id;
END;
$$;


-- ------------------------------------------------------------------------------
-- 6. Revoke Insecure Grants on Admin Functions
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_delete_resume(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_all_applications() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_all_jobs() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_all_profiles() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_all_resumes() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_dashboard_stats() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_toggle_user_suspension(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_profile(uuid, text, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_employer_verification(uuid, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_delete_resume(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_all_applications() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_all_jobs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_all_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_all_resumes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_dashboard_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_toggle_user_suspension(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_profile(uuid, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_employer_verification(uuid, text, text) TO authenticated;


-- ------------------------------------------------------------------------------
-- 7. Harden submit_job_application RPC (Strict Caller Derivation & IDOR Protection)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_job_application(
  p_job_id uuid,
  p_applicant_id uuid,
  p_applicant_snapshot jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id uuid;
  v_job RECORD;
  v_employer RECORD;
  v_candidate RECORD;
  v_new_app RECORD;
BEGIN
  -- A. Derive and validate authenticated caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: Caller must be an authenticated user.';
  END IF;

  -- IDOR Protection: If caller explicitly passed applicant_id, ensure it strictly matches caller
  IF p_applicant_id IS NOT NULL AND p_applicant_id <> v_caller_id THEN
    RAISE EXCEPTION 'FORBIDDEN_IDOR: Cannot submit application on behalf of another candidate.';
  END IF;

  -- B. Validate Candidate Profile & Role
  SELECT * INTO v_candidate FROM public.profiles WHERE id = v_caller_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CANDIDATE_NOT_FOUND: Candidate profile not found.';
  END IF;

  IF lower(COALESCE(v_candidate.role, '')) NOT IN ('candidate', 'job_seeker', 'jobseeker') THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ROLE: Only candidates and job seekers can submit job applications.';
  END IF;

  -- Effective candidate suspension gate (Phase 4 / Phase 1.5)
  IF (v_candidate.is_suspended IS TRUE AND (v_candidate.suspension_expires_at IS NULL OR v_candidate.suspension_expires_at > now()))
     OR (v_candidate.is_suspended IS NOT TRUE AND v_candidate.suspension_expires_at IS NULL AND lower(COALESCE(v_candidate.verification_status, '')) = 'suspended')
  THEN
    RAISE EXCEPTION 'ACCOUNT_SUSPENDED: Your account has been suspended by an administrator.';
  END IF;

  IF lower(COALESCE(v_candidate.verification_status, '')) NOT IN ('verified', 'approved') THEN
    RAISE EXCEPTION 'IDENTITY_VERIFICATION_REQUIRED: Your identity must be verified before applying to jobs.';
  END IF;

  -- C. Validate Job Record
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id;
  IF NOT FOUND OR v_job.status != 'open' OR v_job.employer_id IS NULL THEN
    RAISE EXCEPTION 'JOB_UNAVAILABLE: This position is temporarily unavailable for applications.';
  END IF;

  -- D. Validate Employer Account Status (Effective Suspension Gate)
  SELECT * INTO v_employer FROM public.profiles WHERE id = v_job.employer_id;
  IF NOT FOUND
     OR (v_employer.is_suspended IS TRUE AND (v_employer.suspension_expires_at IS NULL OR v_employer.suspension_expires_at > now()))
     OR (v_employer.is_suspended IS NOT TRUE AND v_employer.suspension_expires_at IS NULL AND lower(COALESCE(v_employer.verification_status, '')) = 'suspended')
     OR lower(COALESCE(v_employer.verification_status, '')) NOT IN ('approved', 'verified')
  THEN
    RAISE EXCEPTION 'JOB_UNAVAILABLE: This position is temporarily unavailable for applications.';
  END IF;

  -- E. Prevent Duplicate Application
  IF EXISTS (SELECT 1 FROM public.applications WHERE job_id = p_job_id AND applicant_id = v_caller_id) THEN
    RAISE EXCEPTION 'DUPLICATE_APPLICATION: You have already applied for this position.';
  END IF;

  -- F. Atomic Insert into Applications Table
  INSERT INTO public.applications (
    job_id,
    applicant_id,
    status,
    applicant_snapshot,
    created_at
  )
  VALUES (
    p_job_id,
    v_caller_id,
    'applied',
    p_applicant_snapshot,
    now()
  )
  RETURNING * INTO v_new_app;

  RETURN to_jsonb(v_new_app);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_job_application(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_job_application(uuid, uuid, jsonb) TO authenticated;


-- ------------------------------------------------------------------------------
-- 8. Harden Notifications Table RLS Policy (Privilege Forgery & Message Impersonation Protection)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Authenticated users insert permitted notifications" ON public.notifications;

CREATE POLICY "Authenticated users insert permitted notifications" ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- 1. Platform Admin can insert administrative notifications
    public.is_platform_admin()
    -- 2. Normal users have ZERO direct cross-user INSERT authority.
    --    They may only insert non-privileged self-notifications where title/message/type cannot impersonate platform events.
    OR (
      auth.uid() = user_id
      AND lower(COALESCE(type, '')) IN ('announcement', 'job_match', 'general')
      AND lower(COALESCE(type, '')) NOT IN (
        'admin', 'system', 'verification', 'suspension',
        'appeal_approved', 'appeal_rejected', 'appeal_under_review',
        'account_verified', 'account_suspended', 'account_restored'
      )
      AND lower(COALESCE(title, '')) NOT LIKE '%appeal%'
      AND lower(COALESCE(title, '')) NOT LIKE '%suspens%'
      AND lower(COALESCE(title, '')) NOT LIKE '%verif%'
      AND lower(COALESCE(title, '')) NOT LIKE '%admin%'
      AND lower(COALESCE(title, '')) NOT LIKE '%restor%'
      AND lower(COALESCE(message, '')) NOT LIKE '%appeal%'
      AND lower(COALESCE(message, '')) NOT LIKE '%suspens%'
      AND lower(COALESCE(message, '')) NOT LIKE '%verif%'
      AND lower(COALESCE(message, '')) NOT LIKE '%admin%'
      AND lower(COALESCE(message, '')) NOT LIKE '%restor%'
    )
  );


-- ------------------------------------------------------------------------------
-- 9. Harden Admin Audit Logs Table RLS Policy
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.admin_audit_logs;
DROP POLICY IF EXISTS "Admins can insert audit logs" ON public.admin_audit_logs;

CREATE POLICY "Admins can insert audit logs" ON public.admin_audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_platform_admin()
  );
