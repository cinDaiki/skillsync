-- ==============================================================================
-- SkillSync Phase 6B-2: Recruitment & Workflow Server Enforcement Migration
-- Migration: 20260825010000_phase_6_recruitment_workflow_hardening.sql
-- ==============================================================================
-- Remediates:
--  1. [RECRUIT-01] Suspended Employer Direct jobs Mutation Lockdown & Ownership Immutability
--  2. [RECRUIT-02] Application Direct INSERT & Direct UPDATE Lockdown (Both Candidate & Employer)
--  3. [RECRUIT-03] Strict 4-Stage State Machine Enforcement & employer_update_application_stage RPC
--  4. [RECRUIT-04] Server-Authoritative Candidate Application Withdrawal & Suspension Lockdown
--  5. [RECRUIT-05] Application Immutable Identities (id, applicant_id, job_id, created_at)
--  6. [RECRUIT-06] Atomic Interview Scheduling RPC (schedule_job_interview) Requiring 'shortlisted' Stage
--  7. [RECRUIT-07] Interview Relational Identity Immutability & Role-Based Field Authority Trigger
--  8. [RECRUIT-08] candidate_respond_interview Hardening & Candidate Effective Suspension Gate
--  9. [RECRUIT-09] Interview Evaluations Direct-Write Lockdown & save_interview_evaluation Hardening
-- 10. [RECRUIT-10] Interview Evaluations Privacy & Relational Identity Immutability
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Jobs Mutation Lockdown & Ownership Immutability
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_jobs_security_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  v_is_admin := public.is_platform_admin();

  IF TG_OP = 'UPDATE' THEN
    IF NOT v_is_admin THEN
      -- A. Immutable job identity and ownership
      IF NEW.id <> OLD.id THEN
        RAISE EXCEPTION 'Forbidden: Cannot change job ID.';
      END IF;

      IF NEW.employer_id <> OLD.employer_id THEN
        RAISE EXCEPTION 'Forbidden: Cannot transfer job ownership.';
      END IF;

      IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Forbidden: Cannot modify job creation timestamp.';
      END IF;

      -- B. Active Employer gate (Suspended employers cannot update jobs)
      IF NOT public.is_employer_job_eligible(OLD.employer_id) THEN
        RAISE EXCEPTION 'Forbidden: Suspended employers cannot modify job listings.';
      END IF;
    END IF;

    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_jobs_security_integrity ON public.jobs;
CREATE TRIGGER trg_enforce_jobs_security_integrity
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_jobs_security_integrity();

-- Harden RLS policies for jobs UPDATE and DELETE
DROP POLICY IF EXISTS "Employers can manage their jobs" ON public.jobs;
DROP POLICY IF EXISTS "Employers can update their own jobs" ON public.jobs;
DROP POLICY IF EXISTS "Employers can delete own jobs" ON public.jobs;

CREATE POLICY "Employers can update their own jobs" ON public.jobs
  FOR UPDATE
  TO authenticated
  USING (
    public.is_platform_admin()
    OR (auth.uid() = employer_id AND public.is_employer_job_eligible(auth.uid()))
  )
  WITH CHECK (
    public.is_platform_admin()
    OR (auth.uid() = employer_id AND public.is_employer_job_eligible(auth.uid()))
  );

CREATE POLICY "Employers can delete own jobs" ON public.jobs
  FOR DELETE
  TO authenticated
  USING (
    public.is_platform_admin()
    OR (auth.uid() = employer_id AND public.is_employer_job_eligible(auth.uid()))
  );


-- ------------------------------------------------------------------------------
-- 2. Applications Table Integrity, Immutability & Complete Direct-Write Lockdown
-- ------------------------------------------------------------------------------

-- Revoke direct raw INSERT on applications (Must use submit_job_application RPC)
DROP POLICY IF EXISTS "Applicants can insert own applications" ON public.applications;

-- Revoke direct raw UPDATE on applications for both Candidates and Employers
-- (Stage transitions MUST go through employer_update_application_stage RPC or withdraw_job_application RPC)
DROP POLICY IF EXISTS "Applicants can update own application snapshot" ON public.applications;
DROP POLICY IF EXISTS "Employers can update application status for their jobs" ON public.applications;

-- Trigger on public.applications to enforce relational immutability
CREATE OR REPLACE FUNCTION public.enforce_applications_security_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  v_is_admin := public.is_platform_admin();

  IF TG_OP = 'UPDATE' THEN
    IF NOT v_is_admin THEN
      -- Immutable application identities
      IF NEW.id <> OLD.id THEN
        RAISE EXCEPTION 'Forbidden: Cannot change application ID.';
      END IF;

      IF NEW.applicant_id <> OLD.applicant_id THEN
        RAISE EXCEPTION 'Forbidden: Cannot reassign applicant ID.';
      END IF;

      IF NEW.job_id <> OLD.job_id THEN
        RAISE EXCEPTION 'Forbidden: Cannot reassign job ID.';
      END IF;

      IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Forbidden: Cannot modify application creation timestamp.';
      END IF;
    END IF;

    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_applications_security_integrity ON public.applications;
CREATE TRIGGER trg_enforce_applications_security_integrity
  BEFORE UPDATE ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_applications_security_integrity();


-- ------------------------------------------------------------------------------
-- 3. Server-Authoritative Candidate Application Withdrawal RPC
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.withdraw_job_application(p_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id uuid;
  v_app RECORD;
  v_job RECORD;
  v_norm_status text;
BEGIN
  -- A. Derive and validate authenticated candidate
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: Caller must be authenticated.';
  END IF;

  -- B. Candidate Suspension Gate (Suspended candidates cannot perform recruitment mutations)
  IF NOT public.is_platform_admin() THEN
    IF EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = v_caller_id
        AND is_suspended IS TRUE
        AND (suspension_expires_at IS NULL OR suspension_expires_at > NOW())
    ) THEN
      RAISE EXCEPTION 'ACCOUNT_SUSPENDED: Suspended candidates cannot withdraw applications.';
    END IF;
  END IF;

  -- C. Fetch and lock application
  SELECT * INTO v_app FROM public.applications WHERE id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'APPLICATION_NOT_FOUND: Application not found.';
  END IF;

  IF v_app.applicant_id <> v_caller_id AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: You can only withdraw your own applications.';
  END IF;

  -- D. Validate status is not terminal
  v_norm_status := lower(trim(COALESCE(v_app.status, '')));
  IF v_norm_status IN ('hired', 'accepted', 'rejected', 'withdrawn', 'closed') THEN
    RAISE EXCEPTION 'TERMINAL_STATUS: Cannot withdraw an application that is already in a terminal state (%).', v_app.status;
  END IF;

  -- E. Update application to withdrawn
  UPDATE public.applications
  SET
    status = 'withdrawn',
    updated_at = NOW()
  WHERE id = p_application_id;

  -- F. Cancel any active interviews
  UPDATE public.interviews
  SET
    status = 'CANCELLED',
    cancelled_at = NOW(),
    updated_at = NOW()
  WHERE application_id = p_application_id
    AND status IN ('PENDING_CONFIRMATION', 'CONFIRMED', 'RESCHEDULE_REQUESTED');

  -- G. Notify employer (server-templated Definer write)
  SELECT * INTO v_job FROM public.jobs WHERE id = v_app.job_id;
  IF FOUND AND v_job.employer_id IS NOT NULL THEN
    INSERT INTO public.notifications (
      user_id,
      title,
      message,
      type,
      is_read,
      created_at
    )
    VALUES (
      v_job.employer_id,
      'Application Withdrawn',
      'A candidate has withdrawn their application for ' || COALESCE(v_job.title, 'your job listing') || '.',
      'application',
      false,
      now()
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'application_id', p_application_id,
    'status', 'withdrawn'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_job_application(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_job_application(uuid) TO authenticated;


-- ------------------------------------------------------------------------------
-- 4. Server-Authoritative Employer Pipeline Stage Transition RPC (Strict 4-Stage)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.employer_update_application_stage(
  p_application_id uuid,
  p_target_status text,
  p_reject_reason text DEFAULT NULL,
  p_recruiter_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_employer_id uuid;
  v_app RECORD;
  v_job RECORD;
  v_raw_curr text;
  v_norm_curr text;
  v_norm_target text;
BEGIN
  -- A. Derive and validate authenticated employer
  v_employer_id := auth.uid();
  IF v_employer_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: Caller must be authenticated.';
  END IF;

  -- B. Effective Employer Suspension Gate
  IF NOT public.is_platform_admin() THEN
    IF NOT public.is_employer_job_eligible(v_employer_id) THEN
      RAISE EXCEPTION 'ACCOUNT_SUSPENDED: Suspended employers cannot advance recruitment pipelines.';
    END IF;
  END IF;

  -- C. Fetch application and verify employer job ownership
  SELECT * INTO v_app FROM public.applications WHERE id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'APPLICATION_NOT_FOUND: Application not found.';
  END IF;

  SELECT * INTO v_job FROM public.jobs WHERE id = v_app.job_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND: Linked job listing not found.';
  END IF;

  IF v_job.employer_id <> v_employer_id AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: You do not own the job listing for this application.';
  END IF;

  -- D. Normalize current status & screening aliases
  v_raw_curr := lower(trim(COALESCE(v_app.status, 'applied')));
  IF v_raw_curr IN ('pending', 'submitted') THEN v_norm_curr := 'applied';
  ELSIF v_raw_curr IN ('under review', 'under_review') THEN v_norm_curr := 'reviewing';
  ELSIF v_raw_curr IN ('interview stage', 'interview') THEN v_norm_curr := 'interview_scheduled';
  ELSIF v_raw_curr = 'accepted' THEN v_norm_curr := 'hired';
  ELSE v_norm_curr := v_raw_curr;
  END IF;

  -- Normalize target status
  v_norm_target := lower(trim(COALESCE(p_target_status, '')));
  IF v_norm_target IN ('pending', 'submitted') THEN v_norm_target := 'applied';
  ELSIF v_norm_target IN ('under review', 'under_review') THEN v_norm_target := 'reviewing';
  ELSIF v_norm_target IN ('interview stage', 'interview') THEN v_norm_target := 'interview_scheduled';
  ELSIF v_norm_target = 'accepted' THEN v_norm_target := 'hired';
  END IF;

  -- E. Strict Terminal State Protection
  IF v_norm_curr IN ('hired', 'rejected', 'withdrawn', 'closed') THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: Cannot modify an application in terminal state (%).', v_app.status;
  END IF;

  -- F. Strict 4-Stage State Machine Progression Rules
  -- 1. Rejection is permitted from any non-terminal state
  IF v_norm_target = 'rejected' THEN
    -- Allowed
    NULL;
  -- 2. From initial Screening (applied / reviewing):
  ELSIF v_norm_curr IN ('applied', 'reviewing') THEN
    IF v_norm_target = 'reviewing' THEN
      -- Allowed
      NULL;
    ELSIF v_norm_target = 'shortlisted' THEN
      -- Allowed
      NULL;
    ELSIF v_norm_target = 'interview_scheduled' THEN
      RAISE EXCEPTION 'INVALID_TRANSITION: Candidate must be shortlisted before scheduling an interview (current status: %).', v_app.status;
    ELSIF v_norm_target IN ('interview_completed', 'hired') THEN
      RAISE EXCEPTION 'INVALID_TRANSITION: Cannot jump directly from screening (%) to % stage.', v_app.status, v_norm_target;
    ELSE
      RAISE EXCEPTION 'INVALID_TRANSITION: Unsupported target stage (%) from % stage.', p_target_status, v_app.status;
    END IF;
  -- 3. From Shortlisted:
  ELSIF v_norm_curr = 'shortlisted' THEN
    IF v_norm_target = 'interview_scheduled' THEN
      -- Allowed
      NULL;
    ELSIF v_norm_target = 'reviewing' THEN
      -- Moving back to screening
      NULL;
    ELSIF v_norm_target IN ('interview_completed', 'hired') THEN
      RAISE EXCEPTION 'INVALID_TRANSITION: Candidate must complete scheduled interview before moving to %.', v_norm_target;
    ELSE
      RAISE EXCEPTION 'INVALID_TRANSITION: Unsupported target stage (%) from shortlisted.', p_target_status;
    END IF;
  -- 4. From Interview Scheduled:
  ELSIF v_norm_curr = 'interview_scheduled' THEN
    IF v_norm_target = 'interview_completed' THEN
      -- Allowed
      NULL;
    ELSIF v_norm_target = 'hired' THEN
      RAISE EXCEPTION 'INVALID_TRANSITION: Cannot hire candidate directly from interview_scheduled without completing interview evaluation.';
    ELSE
      RAISE EXCEPTION 'INVALID_TRANSITION: Unsupported target stage (%) from interview_scheduled.', p_target_status;
    END IF;
  -- 5. From Decision Pending (interview_completed):
  ELSIF v_norm_curr = 'interview_completed' THEN
    IF v_norm_target = 'hired' THEN
      -- Allowed
      NULL;
    ELSE
      RAISE EXCEPTION 'INVALID_TRANSITION: Unsupported target stage (%) from interview_completed. Only hired or rejected is permitted.', p_target_status;
    END IF;
  ELSE
    RAISE EXCEPTION 'INVALID_TRANSITION: Unsupported current application state (%).', v_app.status;
  END IF;

  -- G. Apply Update
  UPDATE public.applications
  SET
    status = v_norm_target,
    reject_reason = CASE WHEN v_norm_target = 'rejected' THEN COALESCE(p_reject_reason, reject_reason) ELSE reject_reason END,
    recruiter_notes = COALESCE(p_recruiter_notes, recruiter_notes),
    updated_at = NOW()
  WHERE id = p_application_id;

  -- If hired or rejected, cleanly resolve any pending interviews
  IF v_norm_target IN ('hired', 'rejected') THEN
    UPDATE public.interviews
    SET
      status = CASE WHEN v_norm_target = 'hired' THEN 'COMPLETED' ELSE 'CANCELLED' END,
      completed_at = CASE WHEN v_norm_target = 'hired' THEN NOW() ELSE completed_at END,
      cancelled_at = CASE WHEN v_norm_target = 'rejected' THEN NOW() ELSE cancelled_at END,
      updated_at = NOW()
    WHERE application_id = p_application_id
      AND status IN ('PENDING_CONFIRMATION', 'CONFIRMED', 'RESCHEDULE_REQUESTED');
  END IF;

  -- H. Server-Templated Candidate Notification
  INSERT INTO public.notifications (
    user_id,
    title,
    message,
    type,
    is_read,
    created_at
  )
  VALUES (
    v_app.applicant_id,
    CASE
      WHEN v_norm_target = 'shortlisted' THEN '⭐ Application Shortlisted'
      WHEN v_norm_target = 'hired' THEN '🎉 Congratulations! You Have Been Hired'
      WHEN v_norm_target = 'rejected' THEN 'Application Status Update'
      ELSE 'Application Update'
    END,
    CASE
      WHEN v_norm_target = 'shortlisted' THEN 'Your application for "' || v_job.title || '" has been shortlisted by the employer!'
      WHEN v_norm_target = 'hired' THEN 'We are pleased to inform you that you have been selected for "' || v_job.title || '"!'
      WHEN v_norm_target = 'rejected' THEN 'Thank you for your interest in "' || v_job.title || '". The employer has decided not to proceed at this time.'
      ELSE 'Your application status for "' || v_job.title || '" is now: ' || v_norm_target || '.'
    END,
    'application',
    false,
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'application_id', p_application_id,
    'status', v_norm_target
  );
END;
$$;

REVOKE ALL ON FUNCTION public.employer_update_application_stage(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.employer_update_application_stage(uuid, text, text, text) TO authenticated;


-- ------------------------------------------------------------------------------
-- 5. Atomic Server-Authoritative Interview Scheduling RPC (schedule_job_interview)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.schedule_job_interview(
  p_application_id uuid,
  p_interview_type text DEFAULT 'ONLINE',
  p_scheduled_date text DEFAULT NULL,
  p_scheduled_time text DEFAULT NULL,
  p_platform text DEFAULT 'Google Meet',
  p_meeting_url text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_contact_person text DEFAULT NULL,
  p_instructions text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_employer_id uuid;
  v_app RECORD;
  v_job RECORD;
  v_norm_status text;
  v_interview_id uuid;
  v_details_msg text;
BEGIN
  -- A. Derive and validate authenticated employer
  v_employer_id := auth.uid();
  IF v_employer_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: Caller must be authenticated.';
  END IF;

  -- B. Effective Employer Suspension Gate
  IF NOT public.is_platform_admin() THEN
    IF NOT public.is_employer_job_eligible(v_employer_id) THEN
      RAISE EXCEPTION 'ACCOUNT_SUSPENDED: Suspended employers cannot schedule interviews.';
    END IF;
  END IF;

  -- C. Validate required schedule fields
  IF p_scheduled_date IS NULL OR trim(p_scheduled_date) = '' THEN
    RAISE EXCEPTION 'INVALID_SCHEDULE: Scheduled date is required.';
  END IF;
  IF p_scheduled_time IS NULL OR trim(p_scheduled_time) = '' THEN
    RAISE EXCEPTION 'INVALID_SCHEDULE: Scheduled time is required.';
  END IF;

  -- D. Lock application and verify ownership
  SELECT * INTO v_app FROM public.applications WHERE id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'APPLICATION_NOT_FOUND: Linked application record not found.';
  END IF;

  SELECT * INTO v_job FROM public.jobs WHERE id = v_app.job_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND: Linked job listing not found.';
  END IF;

  IF v_job.employer_id <> v_employer_id AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: You do not own the job listing for this application.';
  END IF;

  -- E. Strict Precondition: Must be in 'shortlisted' stage
  v_norm_status := lower(trim(COALESCE(v_app.status, 'applied')));
  IF v_norm_status IN ('pending', 'submitted') THEN v_norm_status := 'applied';
  ELSIF v_norm_status IN ('under review', 'under_review') THEN v_norm_status := 'reviewing';
  ELSIF v_norm_status IN ('interview stage', 'interview') THEN v_norm_status := 'interview_scheduled';
  ELSIF v_norm_status = 'accepted' THEN v_norm_status := 'hired';
  END IF;

  IF v_norm_status IN ('hired', 'rejected', 'withdrawn', 'closed') THEN
    RAISE EXCEPTION 'TERMINAL_APPLICATION: Cannot schedule interview for an application in terminal state (%).', v_app.status;
  END IF;

  IF v_norm_status <> 'shortlisted' AND v_norm_status <> 'interview_scheduled' THEN
    RAISE EXCEPTION 'INVALID_STAGE: Application must be in shortlisted stage before scheduling an interview (current status: %).', v_app.status;
  END IF;

  -- F. Atomically Insert Interview Record
  INSERT INTO public.interviews (
    application_id,
    employer_id,
    candidate_id,
    job_id,
    status,
    interview_type,
    scheduled_date,
    scheduled_time,
    platform,
    meeting_url,
    address,
    contact_person,
    instructions,
    proposed_by,
    proposed_at,
    created_at,
    updated_at
  )
  VALUES (
    p_application_id,
    v_employer_id,
    v_app.applicant_id,
    v_app.job_id,
    'PENDING_CONFIRMATION',
    COALESCE(p_interview_type, 'ONLINE'),
    p_scheduled_date,
    p_scheduled_time,
    CASE WHEN p_interview_type = 'ONLINE' THEN p_platform ELSE NULL END,
    CASE WHEN p_interview_type = 'ONLINE' THEN p_meeting_url ELSE NULL END,
    CASE WHEN p_interview_type = 'WALK_IN' THEN p_address ELSE NULL END,
    CASE WHEN p_interview_type = 'WALK_IN' THEN p_contact_person ELSE NULL END,
    p_instructions,
    v_employer_id,
    NOW(),
    NOW(),
    NOW()
  )
  RETURNING id INTO v_interview_id;

  -- G. Atomically Update Application Stage
  UPDATE public.applications
  SET
    status = 'interview_scheduled',
    interview_date = p_scheduled_date::timestamp with time zone,
    interview_location = CASE WHEN p_interview_type = 'ONLINE' THEN p_platform ELSE p_address END,
    interview_link = p_meeting_url,
    updated_at = NOW()
  WHERE id = p_application_id;

  -- H. Server-Templated Candidate Notification
  v_details_msg := CASE
    WHEN p_interview_type = 'ONLINE' THEN 'on ' || p_scheduled_date || ' at ' || p_scheduled_time || ' via ' || COALESCE(p_platform, 'online platform')
    ELSE 'on ' || p_scheduled_date || ' at ' || p_scheduled_time || ' at ' || COALESCE(p_address, 'specified address')
  END;

  INSERT INTO public.notifications (
    user_id,
    title,
    message,
    type,
    is_read,
    created_at
  )
  VALUES (
    v_app.applicant_id,
    '🗓️ Interview Invitation Received',
    'An employer has invited you to an interview for "' || COALESCE(v_job.title, 'Job Position') || '" ' || v_details_msg || '. Please confirm your availability.',
    'interview',
    false,
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'interview_id', v_interview_id,
    'application_id', p_application_id,
    'status', 'interview_scheduled'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.schedule_job_interview(uuid, text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_job_interview(uuid, text, text, text, text, text, text, text, text) TO authenticated;


-- ------------------------------------------------------------------------------
-- 6. Interviews Relational Integrity & Role-Based Field Authority Trigger
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_interviews_security_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  v_is_admin := public.is_platform_admin();

  IF TG_OP = 'UPDATE' THEN
    IF NOT v_is_admin THEN
      -- A. Relational identity immutability
      IF NEW.id <> OLD.id THEN
        RAISE EXCEPTION 'Forbidden: Cannot change interview ID.';
      END IF;

      IF NEW.application_id <> OLD.application_id THEN
        RAISE EXCEPTION 'Forbidden: Cannot reassign interview application ID.';
      END IF;

      IF NEW.employer_id <> OLD.employer_id THEN
        RAISE EXCEPTION 'Forbidden: Cannot reassign interview employer ID.';
      END IF;

      IF NEW.candidate_id <> OLD.candidate_id THEN
        RAISE EXCEPTION 'Forbidden: Cannot reassign interview candidate ID.';
      END IF;

      IF NEW.job_id <> OLD.job_id THEN
        RAISE EXCEPTION 'Forbidden: Cannot reassign interview job ID.';
      END IF;

      IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Forbidden: Cannot modify interview creation timestamp.';
      END IF;

      -- B. Role-Based Field Authority
      -- Candidate caller CANNOT modify employer scheduling fields
      IF auth.uid() = OLD.candidate_id THEN
        IF NEW.scheduled_date <> OLD.scheduled_date
           OR NEW.scheduled_time <> OLD.scheduled_time
           OR NEW.platform IS DISTINCT FROM OLD.platform
           OR NEW.meeting_url IS DISTINCT FROM OLD.meeting_url
           OR NEW.address IS DISTINCT FROM OLD.address
           OR NEW.contact_person IS DISTINCT FROM OLD.contact_person
           OR NEW.instructions IS DISTINCT FROM OLD.instructions THEN
          RAISE EXCEPTION 'Forbidden: Candidates cannot modify employer interview scheduling details.';
        END IF;
      END IF;

      -- Employer caller CANNOT forge candidate response fields directly
      IF auth.uid() = OLD.employer_id THEN
        IF NEW.candidate_response IS DISTINCT FROM OLD.candidate_response
           OR NEW.candidate_response_at IS DISTINCT FROM OLD.candidate_response_at
           OR NEW.candidate_message IS DISTINCT FROM OLD.candidate_message
           OR NEW.preferred_date IS DISTINCT FROM OLD.preferred_date
           OR NEW.preferred_time_range IS DISTINCT FROM OLD.preferred_time_range THEN
          RAISE EXCEPTION 'Forbidden: Employers cannot modify candidate response fields directly.';
        END IF;
      END IF;
    END IF;

    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_interviews_security_integrity ON public.interviews;
CREATE TRIGGER trg_enforce_interviews_security_integrity
  BEFORE UPDATE ON public.interviews
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_interviews_security_integrity();


-- ------------------------------------------------------------------------------
-- 7. Harden candidate_respond_interview RPC
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.candidate_respond_interview(
  p_interview_id uuid,
  p_response text,
  p_message text DEFAULT NULL,
  p_preferred_date text DEFAULT NULL,
  p_preferred_time_range text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cand_id uuid;
  v_app_id uuid;
  v_emp_id uuid;
  v_job_id uuid;
  v_new_status text;
  v_job RECORD;
  v_candidate RECORD;
BEGIN
  -- A. Derive and validate authenticated caller
  v_cand_id := auth.uid();
  IF v_cand_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: Caller must be authenticated.';
  END IF;

  -- B. Effective Candidate Suspension Gate
  SELECT * INTO v_candidate FROM public.profiles WHERE id = v_cand_id;
  IF FOUND AND v_candidate.is_suspended IS TRUE AND (v_candidate.suspension_expires_at IS NULL OR v_candidate.suspension_expires_at > NOW()) THEN
    RAISE EXCEPTION 'ACCOUNT_SUSPENDED: Suspended candidates cannot respond to interviews.';
  END IF;

  -- C. Verify interview ownership
  SELECT candidate_id, application_id, employer_id, job_id
  INTO v_cand_id, v_app_id, v_emp_id, v_job_id
  FROM public.interviews
  WHERE id = p_interview_id;

  IF v_cand_id IS NULL THEN
    RAISE EXCEPTION 'INTERVIEW_NOT_FOUND: Interview record not found.';
  END IF;

  IF v_cand_id <> auth.uid() AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: You can only respond to your own interview invitations.';
  END IF;

  -- D. Determine state transition
  IF upper(p_response) = 'ACCEPTED' THEN
    v_new_status := 'CONFIRMED';
  ELSIF upper(p_response) = 'DECLINED' THEN
    v_new_status := 'DECLINED';
  ELSIF upper(p_response) = 'RESCHEDULE_REQUESTED' THEN
    v_new_status := 'RESCHEDULE_REQUESTED';
  ELSE
    RAISE EXCEPTION 'INVALID_RESPONSE: Response must be ACCEPTED, DECLINED, or RESCHEDULE_REQUESTED.';
  END IF;

  -- E. Update interview state
  UPDATE public.interviews
  SET
    status = v_new_status,
    candidate_response = upper(p_response),
    candidate_response_at = NOW(),
    candidate_message = p_message,
    preferred_date = p_preferred_date,
    preferred_time_range = p_preferred_time_range,
    confirmed_at = CASE WHEN upper(p_response) = 'ACCEPTED' THEN NOW() ELSE confirmed_at END,
    updated_at = NOW()
  WHERE id = p_interview_id;

  -- F. Update overall application stage
  UPDATE public.applications
  SET
    status = CASE
      WHEN upper(p_response) = 'ACCEPTED' THEN 'interview_scheduled'
      WHEN upper(p_response) = 'DECLINED' THEN 'interview declined'
      WHEN upper(p_response) = 'RESCHEDULE_REQUESTED' THEN 'reschedule requested'
      ELSE status
    END,
    updated_at = NOW()
  WHERE id = v_app_id;

  -- G. Server-templated Employer Notification
  SELECT * INTO v_job FROM public.jobs WHERE id = v_job_id;
  INSERT INTO public.notifications (
    user_id,
    title,
    message,
    type,
    is_read,
    created_at
  )
  VALUES (
    v_emp_id,
    CASE
      WHEN upper(p_response) = 'ACCEPTED' THEN '🟢 Interview Confirmed'
      WHEN upper(p_response) = 'DECLINED' THEN '🔴 Interview Declined'
      ELSE '🟡 Interview Reschedule Requested'
    END,
    CASE
      WHEN upper(p_response) = 'ACCEPTED' THEN 'A candidate has confirmed the interview for ' || COALESCE(v_job.title, 'your position') || '.'
      WHEN upper(p_response) = 'DECLINED' THEN 'A candidate has declined the interview invitation for ' || COALESCE(v_job.title, 'your position') || '.'
      ELSE 'A candidate requested to reschedule the interview for ' || COALESCE(v_job.title, 'your position') || '.'
    END,
    'interview',
    false,
    now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.candidate_respond_interview(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.candidate_respond_interview(uuid, text, text, text, text) TO authenticated;


-- ------------------------------------------------------------------------------
-- 8. Interview Evaluations Direct-Write Lockdown & save_interview_evaluation Hardening
-- ------------------------------------------------------------------------------

-- Revoke direct INSERT and UPDATE on interview_evaluations for normal clients
DROP POLICY IF EXISTS "Employers insert private evaluations" ON public.interview_evaluations;
DROP POLICY IF EXISTS "Employers update private evaluations" ON public.interview_evaluations;

-- Immutability trigger on interview_evaluations
CREATE OR REPLACE FUNCTION public.enforce_evaluations_security_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  v_is_admin := public.is_platform_admin();

  IF TG_OP = 'UPDATE' THEN
    IF NOT v_is_admin THEN
      IF NEW.id <> OLD.id THEN
        RAISE EXCEPTION 'Forbidden: Cannot change evaluation ID.';
      END IF;

      IF NEW.interview_id <> OLD.interview_id THEN
        RAISE EXCEPTION 'Forbidden: Cannot reassign evaluation interview ID.';
      END IF;

      IF NEW.application_id <> OLD.application_id THEN
        RAISE EXCEPTION 'Forbidden: Cannot reassign evaluation application ID.';
      END IF;

      IF NEW.employer_id <> OLD.employer_id THEN
        RAISE EXCEPTION 'Forbidden: Cannot reassign evaluation employer ID.';
      END IF;

      IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Forbidden: Cannot modify evaluation creation timestamp.';
      END IF;
    END IF;

    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_evaluations_security_integrity ON public.interview_evaluations;
CREATE TRIGGER trg_enforce_evaluations_security_integrity
  BEFORE UPDATE ON public.interview_evaluations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_evaluations_security_integrity();

CREATE OR REPLACE FUNCTION public.save_interview_evaluation(
  p_interview_id uuid,
  p_notes text DEFAULT NULL,
  p_tech_rating integer DEFAULT NULL,
  p_comm_rating integer DEFAULT NULL,
  p_recommendation text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_emp_id uuid;
  v_app_id uuid;
  v_job_id uuid;
BEGIN
  -- A. Derive and validate authenticated caller
  v_emp_id := auth.uid();
  IF v_emp_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: Caller must be authenticated.';
  END IF;

  -- B. Effective Employer Suspension Gate
  IF NOT public.is_platform_admin() THEN
    IF NOT public.is_employer_job_eligible(v_emp_id) THEN
      RAISE EXCEPTION 'ACCOUNT_SUSPENDED: Suspended employers cannot save interview evaluations.';
    END IF;
  END IF;

  -- C. Validate interview ownership
  SELECT employer_id, application_id, job_id INTO v_emp_id, v_app_id, v_job_id
  FROM public.interviews
  WHERE id = p_interview_id;

  IF v_emp_id IS NULL THEN
    RAISE EXCEPTION 'INTERVIEW_NOT_FOUND: Interview record not found.';
  END IF;

  IF v_emp_id <> auth.uid() AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Only the assigned employer can save evaluations.';
  END IF;

  -- D. Upsert evaluation
  INSERT INTO public.interview_evaluations (
    interview_id,
    application_id,
    employer_id,
    evaluation_notes,
    technical_rating,
    communication_rating,
    overall_recommendation,
    updated_at
  )
  VALUES (
    p_interview_id,
    v_app_id,
    auth.uid(),
    p_notes,
    p_tech_rating,
    p_comm_rating,
    p_recommendation,
    NOW()
  )
  ON CONFLICT (interview_id) DO UPDATE SET
    evaluation_notes = EXCLUDED.evaluation_notes,
    technical_rating = EXCLUDED.technical_rating,
    communication_rating = EXCLUDED.communication_rating,
    overall_recommendation = EXCLUDED.overall_recommendation,
    updated_at = NOW();

  -- E. Automatically mark interview as COMPLETED and application as interview_completed
  UPDATE public.interviews
  SET
    status = 'COMPLETED',
    completed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_interview_id;

  UPDATE public.applications
  SET
    status = 'interview_completed',
    updated_at = NOW()
  WHERE id = v_app_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_interview_evaluation(uuid, text, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_interview_evaluation(uuid, text, integer, integer, text) TO authenticated;

-- Strict RLS for interview evaluations: Candidate can NEVER read private employer notes
DROP POLICY IF EXISTS "Employers view private evaluations" ON public.interview_evaluations;

CREATE POLICY "Employers view private evaluations" ON public.interview_evaluations
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR (auth.uid() = employer_id AND public.is_employer_job_eligible(auth.uid()))
  );
