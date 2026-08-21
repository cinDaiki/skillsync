SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';

CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "public";



CREATE OR REPLACE FUNCTION "public"."admin_delete_resume"("user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    BEGIN
      DELETE FROM public.resumes WHERE applicant_id = user_id;
      UPDATE public.applications
        SET applicant_snapshot = applicant_snapshot - 'resume'
        WHERE applicant_id = user_id;
    END;
    $$;


ALTER FUNCTION "public"."admin_delete_resume"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_delete_user"("user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    BEGIN
      DELETE FROM public.resumes WHERE applicant_id = user_id;
      DELETE FROM public.applications WHERE applicant_id = user_id;
      DELETE FROM public.profiles WHERE id = user_id;
    END;
    $$;


ALTER FUNCTION "public"."admin_delete_user"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_all_applications"() RETURNS TABLE("id" "uuid", "job_id" "uuid", "applicant_id" "uuid", "status" "text", "created_at" timestamp with time zone, "applicant_snapshot" "jsonb", "job_title" "text", "job_employment_type" "text", "job_location" "text", "job_required_skills" "text", "job_employer_id" "uuid", "employer_name" "text", "employer_email" "text", "applicant_name" "text", "applicant_email" "text", "resume_file_url" "text", "resume_file_name" "text", "resume_file_size" bigint, "resume_created_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
    $$;


ALTER FUNCTION "public"."admin_get_all_applications"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_all_jobs"() RETURNS TABLE("id" "uuid", "title" "text", "description" "text", "employment_type" "text", "location" "text", "required_skills" "text", "status" "text", "employer_id" "uuid", "created_at" timestamp with time zone, "employer_name" "text", "employer_email" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
      SELECT j.id, j.title, j.description, j.employment_type, j.location,
        j.required_skills, j.status, j.employer_id, j.created_at,
        p.full_name AS employer_name, p.email AS employer_email
      FROM jobs j LEFT JOIN profiles p ON p.id = j.employer_id
      ORDER BY j.created_at DESC NULLS LAST;
    $$;


ALTER FUNCTION "public"."admin_get_all_jobs"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "email" "text",
    "role" "text" DEFAULT 'candidate'::"text",
    "contact_number" "text",
    "address" "text",
    "skills" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "education" "jsonb" DEFAULT '[]'::"jsonb",
    "work_experience" "jsonb" DEFAULT '[]'::"jsonb",
    "certifications" "jsonb" DEFAULT '[]'::"jsonb",
    "portfolio_links" "jsonb" DEFAULT '[]'::"jsonb",
    "social_links" "jsonb" DEFAULT '[]'::"jsonb",
    "profile_picture_url" "text",
    "visibility" boolean DEFAULT true,
    "bookmarked_jobs" "jsonb" DEFAULT '[]'::"jsonb",
    "verification_status" "text" DEFAULT 'Pending Verification'::"text",
    "id_image_url" "text",
    "selfie_image_url" "text",
    "verification_date" timestamp with time zone,
    "is_suspended" boolean DEFAULT false,
    "verification_reason" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_all_profiles"() RETURNS SETOF "public"."profiles"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
      SELECT * FROM profiles ORDER BY created_at DESC NULLS LAST;
    $$;


ALTER FUNCTION "public"."admin_get_all_profiles"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_all_resumes"() RETURNS TABLE("applicant_id" "uuid", "file_url" "text", "file_name" "text", "file_size" bigint, "created_at" timestamp with time zone, "applicant_name" "text", "applicant_email" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
      SELECT r.applicant_id, r.file_url, r.file_name, r.file_size, r.created_at,
        p.full_name AS applicant_name, p.email AS applicant_email
      FROM public.resumes r
      LEFT JOIN public.profiles p ON p.id = r.applicant_id
      ORDER BY r.created_at DESC NULLS LAST;
    $$;


ALTER FUNCTION "public"."admin_get_all_resumes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_dashboard_stats"() RETURNS json
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
      SELECT json_build_object(
        'job_seekers', (SELECT count(*)::int FROM profiles WHERE role IN ('candidate', 'job_seeker')),
        'employers',   (SELECT count(*)::int FROM profiles WHERE role = 'employer'),
        'total_jobs',  (SELECT count(*)::int FROM jobs),
        'open_jobs',   (SELECT count(*)::int FROM jobs WHERE status = 'open'),
        'closed_jobs', (SELECT count(*)::int FROM jobs WHERE status = 'closed'),
        'total_applications', (SELECT count(*)::int FROM applications)
      );
    $$;


ALTER FUNCTION "public"."admin_get_dashboard_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_toggle_user_suspension"("user_id" "uuid", "suspend_status" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    BEGIN
      UPDATE public.profiles SET is_suspended = suspend_status WHERE id = user_id;
    END;
    $$;


ALTER FUNCTION "public"."admin_toggle_user_suspension"("user_id" "uuid", "suspend_status" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_employer_verification"("target_user_id" "uuid", "new_status" "text", "reason_note" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN

    -- Security check
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Forbidden: Admin authorization required.';
    END IF;

    -- Update main profile
    UPDATE public.profiles
    SET
        verification_status = new_status,
        verification_reason = reason_note,
        updated_at = NOW()
    WHERE id = target_user_id;

    -- Update employer profile
    UPDATE public.employer_profiles
    SET
        verification_status = new_status,
        updated_at = NOW()
    WHERE id = target_user_id;

    -- Write audit record
    INSERT INTO public.admin_audit_logs (
        admin_id,
        action,
        target_type,
        target_id,
        reason
    )
    VALUES (
        auth.uid(),
        CASE
            WHEN new_status IN ('Approved', 'Verified')
                THEN 'EMPLOYER_APPROVED'
            WHEN new_status = 'Rejected'
                THEN 'EMPLOYER_REJECTED'
            WHEN new_status = 'Suspended'
                THEN 'EMPLOYER_SUSPENDED'
            ELSE
                'EMPLOYER_STATUS_UPDATED'
        END,
        'employer',
        target_user_id,
        reason_note
    );

END;
$$;


ALTER FUNCTION "public"."admin_update_employer_verification"("target_user_id" "uuid", "new_status" "text", "reason_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_profile"("user_id" "uuid", "new_full_name" "text", "new_email" "text", "new_contact_number" "text", "new_address" "text", "new_skills" "text", "new_role" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    BEGIN
      UPDATE public.profiles SET
        full_name = new_full_name, email = new_email,
        contact_number = new_contact_number, address = new_address,
        skills = new_skills, role = new_role
      WHERE id = user_id;
    END;
    $$;


ALTER FUNCTION "public"."admin_update_profile"("user_id" "uuid", "new_full_name" "text", "new_email" "text", "new_contact_number" "text", "new_address" "text", "new_skills" "text", "new_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."candidate_respond_interview"("p_interview_id" "uuid", "p_response" "text", "p_message" "text" DEFAULT NULL::"text", "p_preferred_date" "text" DEFAULT NULL::"text", "p_preferred_time_range" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_cand_id UUID;
  v_app_id UUID;
  v_new_status TEXT;
BEGIN
  -- Verify interview ownership
  SELECT candidate_id, application_id INTO v_cand_id, v_app_id
  FROM public.interviews
  WHERE id = p_interview_id;

  IF v_cand_id IS NULL THEN
    RAISE EXCEPTION 'Interview record not found.';
  END IF;

  IF v_cand_id <> auth.uid() THEN
    RAISE EXCEPTION 'Forbidden: You can only respond to your own interview invitations.';
  END IF;

  -- Determine state transition
  IF p_response = 'ACCEPTED' THEN
    v_new_status := 'CONFIRMED';
  ELSIF p_response = 'DECLINED' THEN
    v_new_status := 'DECLINED';
  ELSIF p_response = 'RESCHEDULE_REQUESTED' THEN
    v_new_status := 'RESCHEDULE_REQUESTED';
  ELSE
    RAISE EXCEPTION 'Invalid response type. Must be ACCEPTED, DECLINED, or RESCHEDULE_REQUESTED.';
  END IF;

  -- Update interview state
  UPDATE public.interviews
  SET
    status = v_new_status,
    candidate_response = p_response,
    candidate_response_at = NOW(),
    candidate_message = p_message,
    preferred_date = p_preferred_date,
    preferred_time_range = p_preferred_time_range,
    confirmed_at = CASE WHEN p_response = 'ACCEPTED' THEN NOW() ELSE confirmed_at END,
    updated_at = NOW()
  WHERE id = p_interview_id;

  -- Update overall application stage
  UPDATE public.applications
  SET
    status = CASE
      WHEN p_response = 'ACCEPTED' THEN 'interview'
      WHEN p_response = 'DECLINED' THEN 'interview declined'
      WHEN p_response = 'RESCHEDULE_REQUESTED' THEN 'reschedule requested'
      ELSE status
    END
  WHERE id = v_app_id;
END;
$$;


ALTER FUNCTION "public"."candidate_respond_interview"("p_interview_id" "uuid", "p_response" "text", "p_message" "text", "p_preferred_date" "text", "p_preferred_time_range" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_employer_applicants"() RETURNS TABLE("id" "uuid", "job_id" "uuid", "applicant_id" "uuid", "status" "text", "created_at" timestamp with time zone, "applicant_snapshot" "jsonb", "job_title" "text", "employment_type" "text", "job_location" "text", "full_name" "text", "email" "text", "contact_number" "text", "skills" "text", "resume_file_url" "text", "resume_file_name" "text", "resume_file_size" bigint, "resume_created_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
      SELECT a.id, a.job_id, a.applicant_id, a.status, a.created_at, a.applicant_snapshot,
        j.title, j.employment_type, j.location,
        COALESCE(p.full_name, a.applicant_snapshot->>'full_name'),
        COALESCE(p.email, a.applicant_snapshot->>'email'),
        COALESCE(p.contact_number, a.applicant_snapshot->>'contact_number'),
        COALESCE(p.skills, a.applicant_snapshot->>'skills'),
        COALESCE(r.file_url, a.applicant_snapshot->'resume'->>'file_url'),
        COALESCE(r.file_name, a.applicant_snapshot->'resume'->>'file_name'),
        COALESCE(r.file_size, (a.applicant_snapshot->'resume'->>'file_size')::bigint),
        COALESCE(r.created_at, (a.applicant_snapshot->'resume'->>'created_at')::timestamptz)
      FROM applications a JOIN jobs j ON j.id = a.job_id
      LEFT JOIN profiles p ON p.id = a.applicant_id
      LEFT JOIN resumes r ON r.applicant_id = a.applicant_id
      WHERE j.employer_id = auth.uid()
      ORDER BY a.created_at DESC;
    $$;


ALTER FUNCTION "public"."get_employer_applicants"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    BEGIN
      INSERT INTO public.profiles (id, full_name, email, role)
      VALUES (
        NEW.id,
        NEW.raw_user_meta_data->>'full_name',
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'role', 'candidate')
      )
      ON CONFLICT (id) DO NOTHING;
      RETURN NEW;
    END;
    $$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_platform_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = auth.uid()
          AND role = 'admin'
    );
$$;


ALTER FUNCTION "public"."is_platform_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_candidates_for_job"("query_embedding" "public"."vector", "match_count" integer DEFAULT 100) RETURNS TABLE("applicant_id" "uuid", "similarity" double precision)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
    BEGIN
      RETURN QUERY
      SELECT  r.applicant_id,
              CAST(1 - (r.resume_embedding <=> query_embedding) AS FLOAT) AS similarity
      FROM    resumes r
      WHERE   r.resume_embedding IS NOT NULL
      ORDER BY r.resume_embedding <=> query_embedding
      LIMIT   match_count;
    END;
    $$;


ALTER FUNCTION "public"."match_candidates_for_job"("query_embedding" "public"."vector", "match_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_jobs_for_candidate"("query_embedding" "public"."vector", "match_count" integer DEFAULT 20) RETURNS TABLE("job_id" "uuid", "similarity" double precision)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
    BEGIN
      RETURN QUERY
      SELECT  j.id,
              CAST(1 - (j.job_embedding <=> query_embedding) AS FLOAT) AS similarity
      FROM    jobs j
      WHERE   j.job_embedding IS NOT NULL
        AND   j.status = 'open'
      ORDER BY j.job_embedding <=> query_embedding
      LIMIT   match_count;
    END;
    $$;


ALTER FUNCTION "public"."match_jobs_for_candidate"("query_embedding" "public"."vector", "match_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_interview_evaluation"("p_interview_id" "uuid", "p_notes" "text" DEFAULT NULL::"text", "p_tech_rating" integer DEFAULT NULL::integer, "p_comm_rating" integer DEFAULT NULL::integer, "p_recommendation" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_emp_id UUID;
  v_app_id UUID;
BEGIN
  SELECT employer_id, application_id INTO v_emp_id, v_app_id
  FROM public.interviews
  WHERE id = p_interview_id;

  IF v_emp_id IS NULL THEN
    RAISE EXCEPTION 'Interview record not found.';
  END IF;

  IF v_emp_id <> auth.uid() AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden: Only the assigned employer can save evaluations.';
  END IF;

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
    v_emp_id,
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
END;
$$;


ALTER FUNCTION "public"."save_interview_evaluation"("p_interview_id" "uuid", "p_notes" "text", "p_tech_rating" integer, "p_comm_rating" integer, "p_recommendation" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_id" "uuid",
    "action" "text" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" "uuid",
    "reason" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."admin_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."applications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid",
    "applicant_id" "uuid",
    "status" "text" DEFAULT 'Pending'::"text",
    "applicant_snapshot" "jsonb" DEFAULT '{}'::"jsonb",
    "supporting_files" "jsonb" DEFAULT '[]'::"jsonb",
    "interview_schedule" "jsonb" DEFAULT '{}'::"jsonb",
    "is_shortlisted" boolean DEFAULT false,
    "interview_date" timestamp with time zone,
    "interview_location" "text",
    "interview_link" "text",
    "reject_reason" "text",
    "match_score" integer,
    "recruiter_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."applications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."candidate_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "course" "text",
    "degree" "text",
    "education_level" "text",
    "skills" "jsonb" DEFAULT '[]'::"jsonb",
    "certifications" "jsonb" DEFAULT '[]'::"jsonb",
    "years_experience" numeric DEFAULT 0,
    "resume_version" integer DEFAULT 1,
    "last_resume_scan" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."candidate_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employer_profiles" (
    "id" "uuid" NOT NULL,
    "company_name" "text",
    "industry" "text",
    "company_size" "text",
    "location" "text",
    "website" "text",
    "contact_email" "text",
    "contact_number" "text",
    "about" "text",
    "verification_status" "text" DEFAULT 'Pending'::"text",
    "id_image_url" "text",
    "selfie_image_url" "text",
    "business_permit_url" "text",
    "sec_registration_url" "text",
    "company_logo_url" "text",
    "cover_photo_url" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."employer_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."interview_evaluations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "interview_id" "uuid" NOT NULL,
    "application_id" "uuid" NOT NULL,
    "employer_id" "uuid" NOT NULL,
    "evaluation_notes" "text",
    "technical_rating" integer,
    "communication_rating" integer,
    "overall_recommendation" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "interview_evaluations_communication_rating_check" CHECK ((("communication_rating" >= 1) AND ("communication_rating" <= 5))),
    CONSTRAINT "interview_evaluations_technical_rating_check" CHECK ((("technical_rating" >= 1) AND ("technical_rating" <= 5)))
);


ALTER TABLE "public"."interview_evaluations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."interviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "application_id" "uuid" NOT NULL,
    "employer_id" "uuid" NOT NULL,
    "candidate_id" "uuid" NOT NULL,
    "job_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'PENDING_CONFIRMATION'::"text" NOT NULL,
    "interview_type" "text" DEFAULT 'ONLINE'::"text" NOT NULL,
    "scheduled_date" "text" NOT NULL,
    "scheduled_time" "text" NOT NULL,
    "platform" "text" DEFAULT 'Google Meet'::"text",
    "meeting_url" "text",
    "address" "text",
    "contact_person" "text",
    "instructions" "text",
    "proposed_by" "uuid",
    "proposed_at" timestamp with time zone DEFAULT "now"(),
    "candidate_response" "text",
    "candidate_response_at" timestamp with time zone,
    "candidate_message" "text",
    "preferred_date" "text",
    "preferred_time_range" "text",
    "confirmed_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "interviews_candidate_response_check" CHECK (("candidate_response" = ANY (ARRAY['ACCEPTED'::"text", 'DECLINED'::"text", 'RESCHEDULE_REQUESTED'::"text"]))),
    CONSTRAINT "interviews_interview_type_check" CHECK (("interview_type" = ANY (ARRAY['ONLINE'::"text", 'WALK_IN'::"text"]))),
    CONSTRAINT "interviews_status_check" CHECK (("status" = ANY (ARRAY['PENDING_CONFIRMATION'::"text", 'CONFIRMED'::"text", 'DECLINED'::"text", 'RESCHEDULE_REQUESTED'::"text", 'CANCELLED'::"text", 'COMPLETED'::"text"])))
);


ALTER TABLE "public"."interviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_matches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "job_id" "uuid",
    "employer_id" "uuid",
    "match_score" numeric DEFAULT 0,
    "skills_score" numeric DEFAULT 0,
    "education_score" numeric DEFAULT 0,
    "experience_score" numeric DEFAULT 0,
    "match_status" "text" DEFAULT 'Recommended'::"text",
    "matching_skills" "jsonb" DEFAULT '[]'::"jsonb",
    "missing_skills" "jsonb" DEFAULT '[]'::"jsonb",
    "recommended_courses" "jsonb" DEFAULT '[]'::"jsonb",
    "micro_credentials" "jsonb" DEFAULT '[]'::"jsonb",
    "matched_certs" "jsonb" DEFAULT '[]'::"jsonb",
    "match_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "semantic_score" double precision,
    "strengths" "jsonb",
    "recommendations" "text",
    "match_type" "text" DEFAULT 'rule_based'::"text"
);


ALTER TABLE "public"."job_matches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employer_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "employment_type" "text",
    "location" "text",
    "required_skills" "text",
    "status" "text" DEFAULT 'open'::"text",
    "department" "text",
    "work_setup" "text",
    "required_certifications" "text",
    "required_education" "text",
    "experience_required" "text",
    "number_of_openings" integer DEFAULT 1,
    "salary_range" "text",
    "deadline" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "job_embedding" "public"."vector"(384),
    "embedding_generated_at" timestamp with time zone,
    "rejection_reason" "text"
);


ALTER TABLE "public"."jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "type" "text" NOT NULL,
    "is_read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."resumes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "applicant_id" "uuid",
    "file_url" "text",
    "file_name" "text",
    "file_size" bigint,
    "extracted_skills" "text",
    "resume_score" integer DEFAULT 0,
    "completeness" integer DEFAULT 0,
    "parsed_details" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "resume_embedding" "public"."vector"(384),
    "embedding_generated_at" timestamp with time zone
);


ALTER TABLE "public"."resumes" OWNER TO "postgres";


ALTER TABLE ONLY "public"."admin_audit_logs"
    ADD CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."applications"
    ADD CONSTRAINT "applications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."candidate_profiles"
    ADD CONSTRAINT "candidate_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employer_profiles"
    ADD CONSTRAINT "employer_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."interview_evaluations"
    ADD CONSTRAINT "interview_evaluations_interview_id_key" UNIQUE ("interview_id");



ALTER TABLE ONLY "public"."interview_evaluations"
    ADD CONSTRAINT "interview_evaluations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."interviews"
    ADD CONSTRAINT "interviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_matches"
    ADD CONSTRAINT "job_matches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resumes"
    ADD CONSTRAINT "resumes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."candidate_profiles"
    ADD CONSTRAINT "unique_candidate_user" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."job_matches"
    ADD CONSTRAINT "unique_user_job_match" UNIQUE ("user_id", "job_id");



CREATE INDEX "idx_interview_evaluations_employer_id" ON "public"."interview_evaluations" USING "btree" ("employer_id");



CREATE INDEX "idx_interview_evaluations_interview_id" ON "public"."interview_evaluations" USING "btree" ("interview_id");



CREATE INDEX "idx_interviews_application_id" ON "public"."interviews" USING "btree" ("application_id");



CREATE INDEX "idx_interviews_candidate_id" ON "public"."interviews" USING "btree" ("candidate_id");



CREATE INDEX "idx_interviews_employer_id" ON "public"."interviews" USING "btree" ("employer_id");



CREATE INDEX "idx_interviews_job_id" ON "public"."interviews" USING "btree" ("job_id");



CREATE INDEX "idx_interviews_scheduled_date" ON "public"."interviews" USING "btree" ("scheduled_date");



CREATE INDEX "idx_interviews_status" ON "public"."interviews" USING "btree" ("status");



CREATE INDEX "idx_job_embedding" ON "public"."jobs" USING "ivfflat" ("job_embedding" "public"."vector_cosine_ops") WITH ("lists"='10');



CREATE INDEX "idx_profiles_verification_status" ON "public"."profiles" USING "btree" ("verification_status");



CREATE INDEX "idx_resume_embedding" ON "public"."resumes" USING "ivfflat" ("resume_embedding" "public"."vector_cosine_ops") WITH ("lists"='10');



ALTER TABLE ONLY "public"."admin_audit_logs"
    ADD CONSTRAINT "admin_audit_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."applications"
    ADD CONSTRAINT "applications_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."applications"
    ADD CONSTRAINT "applications_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."candidate_profiles"
    ADD CONSTRAINT "candidate_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employer_profiles"
    ADD CONSTRAINT "employer_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."interview_evaluations"
    ADD CONSTRAINT "interview_evaluations_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."interview_evaluations"
    ADD CONSTRAINT "interview_evaluations_employer_id_fkey" FOREIGN KEY ("employer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."interview_evaluations"
    ADD CONSTRAINT "interview_evaluations_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."interviews"
    ADD CONSTRAINT "interviews_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."interviews"
    ADD CONSTRAINT "interviews_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."interviews"
    ADD CONSTRAINT "interviews_employer_id_fkey" FOREIGN KEY ("employer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."interviews"
    ADD CONSTRAINT "interviews_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."interviews"
    ADD CONSTRAINT "interviews_proposed_by_fkey" FOREIGN KEY ("proposed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."job_matches"
    ADD CONSTRAINT "job_matches_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_matches"
    ADD CONSTRAINT "job_matches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_employer_id_fkey" FOREIGN KEY ("employer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."resumes"
    ADD CONSTRAINT "resumes_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can delete profiles" ON "public"."profiles" FOR DELETE TO "authenticated" USING ("public"."is_platform_admin"());



CREATE POLICY "Admins can manage all jobs" ON "public"."jobs" TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());



CREATE POLICY "Admins can update all profiles" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());



CREATE POLICY "Admins can update employer profiles" ON "public"."employer_profiles" FOR UPDATE TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());



CREATE POLICY "Admins can view all applications" ON "public"."applications" FOR SELECT TO "authenticated" USING ("public"."is_platform_admin"());



CREATE POLICY "Admins can view all employer profiles" ON "public"."employer_profiles" FOR SELECT TO "authenticated" USING ("public"."is_platform_admin"());



CREATE POLICY "Admins can view all profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING ("public"."is_platform_admin"());



CREATE POLICY "Admins can view audit logs" ON "public"."admin_audit_logs" FOR SELECT TO "authenticated" USING ("public"."is_platform_admin"());



CREATE POLICY "Anyone can insert/update matches" ON "public"."job_matches" USING (true) WITH CHECK (true);



CREATE POLICY "Applicants can insert own applications" ON "public"."applications" FOR INSERT WITH CHECK (("auth"."uid"() = "applicant_id"));



CREATE POLICY "Applicants can update own application snapshot" ON "public"."applications" FOR UPDATE TO "authenticated" USING (("applicant_id" = "auth"."uid"())) WITH CHECK (("applicant_id" = "auth"."uid"()));



CREATE POLICY "Applicants can view own applications" ON "public"."applications" FOR SELECT USING (("auth"."uid"() = "applicant_id"));



CREATE POLICY "Authenticated users can insert audit logs" ON "public"."admin_audit_logs" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "admin_id") OR ("admin_id" IS NULL) OR "public"."is_platform_admin"()));



CREATE POLICY "Candidates respond to own interviews" ON "public"."interviews" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "candidate_id")) WITH CHECK (("auth"."uid"() = "candidate_id"));



CREATE POLICY "Employers can manage their jobs" ON "public"."jobs" USING (("auth"."uid"() = "employer_id")) WITH CHECK (("auth"."uid"() = "employer_id"));



CREATE POLICY "Employers can update application status for their jobs" ON "public"."applications" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."jobs"
  WHERE (("jobs"."id" = "applications"."job_id") AND ("jobs"."employer_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."jobs"
  WHERE (("jobs"."id" = "applications"."job_id") AND ("jobs"."employer_id" = "auth"."uid"())))));



CREATE POLICY "Employers can view applicant profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."applications" "a"
     JOIN "public"."jobs" "j" ON (("j"."id" = "a"."job_id")))
  WHERE (("a"."applicant_id" = "profiles"."id") AND ("j"."employer_id" = "auth"."uid"())))));



CREATE POLICY "Employers can view applicant resumes" ON "public"."resumes" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."applications" "a"
     JOIN "public"."jobs" "j" ON (("j"."id" = "a"."job_id")))
  WHERE (("a"."applicant_id" = "resumes"."applicant_id") AND ("j"."employer_id" = "auth"."uid"())))));



CREATE POLICY "Employers can view applications for their jobs" ON "public"."applications" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."jobs"
  WHERE (("jobs"."id" = "applications"."job_id") AND ("jobs"."employer_id" = "auth"."uid"())))));



CREATE POLICY "Employers can view candidate profiles" ON "public"."candidate_profiles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."employer_profiles"
  WHERE ("employer_profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Employers can view matches for their jobs" ON "public"."job_matches" FOR SELECT USING (("auth"."uid"() = "employer_id"));



CREATE POLICY "Employers delete own interviews" ON "public"."interviews" FOR DELETE TO "authenticated" USING ((("auth"."uid"() = "employer_id") OR "public"."is_platform_admin"()));



CREATE POLICY "Employers insert interviews" ON "public"."interviews" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "employer_id") OR "public"."is_platform_admin"()));



CREATE POLICY "Employers insert private evaluations" ON "public"."interview_evaluations" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "employer_id") OR "public"."is_platform_admin"()));



CREATE POLICY "Employers update own interviews" ON "public"."interviews" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "employer_id") OR "public"."is_platform_admin"())) WITH CHECK ((("auth"."uid"() = "employer_id") OR "public"."is_platform_admin"()));



CREATE POLICY "Employers update private evaluations" ON "public"."interview_evaluations" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "employer_id") OR "public"."is_platform_admin"())) WITH CHECK ((("auth"."uid"() = "employer_id") OR "public"."is_platform_admin"()));



CREATE POLICY "Employers view private evaluations" ON "public"."interview_evaluations" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "employer_id") OR "public"."is_platform_admin"()));



CREATE POLICY "Public can view open jobs" ON "public"."jobs" FOR SELECT TO "authenticated", "anon" USING (("lower"(COALESCE("status", 'open'::"text")) = 'open'::"text"));



CREATE POLICY "Users can delete own notifications" ON "public"."notifications" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own resume" ON "public"."resumes" FOR DELETE USING (("auth"."uid"() = "applicant_id"));



CREATE POLICY "Users can insert notifications" ON "public"."notifications" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Users can insert own candidate profile" ON "public"."candidate_profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own employer profile" ON "public"."employer_profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert own resume" ON "public"."resumes" FOR INSERT WITH CHECK (("auth"."uid"() = "applicant_id"));



CREATE POLICY "Users can update own candidate profile" ON "public"."candidate_profiles" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own employer profile" ON "public"."employer_profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own notifications" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own resume" ON "public"."resumes" FOR UPDATE USING (("auth"."uid"() = "applicant_id"));



CREATE POLICY "Users can view own candidate profile" ON "public"."candidate_profiles" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own employer profile" ON "public"."employer_profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own notifications" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own resume" ON "public"."resumes" FOR SELECT USING (("auth"."uid"() = "applicant_id"));



CREATE POLICY "Users can view their own matches" ON "public"."job_matches" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users view relevant interviews" ON "public"."interviews" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "candidate_id") OR ("auth"."uid"() = "employer_id") OR "public"."is_platform_admin"()));



ALTER TABLE "public"."admin_audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."applications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."candidate_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employer_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."interview_evaluations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."interviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."job_matches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."resumes" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_delete_resume"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_delete_resume"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_delete_resume"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_delete_user"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_delete_user"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_delete_user"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_get_all_applications"() TO "anon";
GRANT ALL ON FUNCTION "public"."admin_get_all_applications"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_get_all_applications"() TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_get_all_jobs"() TO "anon";
GRANT ALL ON FUNCTION "public"."admin_get_all_jobs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_get_all_jobs"() TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_get_all_profiles"() TO "anon";
GRANT ALL ON FUNCTION "public"."admin_get_all_profiles"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_get_all_profiles"() TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_get_all_resumes"() TO "anon";
GRANT ALL ON FUNCTION "public"."admin_get_all_resumes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_get_all_resumes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_get_dashboard_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."admin_get_dashboard_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_get_dashboard_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_toggle_user_suspension"("user_id" "uuid", "suspend_status" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_toggle_user_suspension"("user_id" "uuid", "suspend_status" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_toggle_user_suspension"("user_id" "uuid", "suspend_status" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_update_employer_verification"("target_user_id" "uuid", "new_status" "text", "reason_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_update_employer_verification"("target_user_id" "uuid", "new_status" "text", "reason_note" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_update_profile"("user_id" "uuid", "new_full_name" "text", "new_email" "text", "new_contact_number" "text", "new_address" "text", "new_skills" "text", "new_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_update_profile"("user_id" "uuid", "new_full_name" "text", "new_email" "text", "new_contact_number" "text", "new_address" "text", "new_skills" "text", "new_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_update_profile"("user_id" "uuid", "new_full_name" "text", "new_email" "text", "new_contact_number" "text", "new_address" "text", "new_skills" "text", "new_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."candidate_respond_interview"("p_interview_id" "uuid", "p_response" "text", "p_message" "text", "p_preferred_date" "text", "p_preferred_time_range" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."candidate_respond_interview"("p_interview_id" "uuid", "p_response" "text", "p_message" "text", "p_preferred_date" "text", "p_preferred_time_range" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."candidate_respond_interview"("p_interview_id" "uuid", "p_response" "text", "p_message" "text", "p_preferred_date" "text", "p_preferred_time_range" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_employer_applicants"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_employer_applicants"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_employer_applicants"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."match_candidates_for_job"("query_embedding" "public"."vector", "match_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."match_candidates_for_job"("query_embedding" "public"."vector", "match_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_candidates_for_job"("query_embedding" "public"."vector", "match_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."match_jobs_for_candidate"("query_embedding" "public"."vector", "match_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."match_jobs_for_candidate"("query_embedding" "public"."vector", "match_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_jobs_for_candidate"("query_embedding" "public"."vector", "match_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."save_interview_evaluation"("p_interview_id" "uuid", "p_notes" "text", "p_tech_rating" integer, "p_comm_rating" integer, "p_recommendation" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."save_interview_evaluation"("p_interview_id" "uuid", "p_notes" "text", "p_tech_rating" integer, "p_comm_rating" integer, "p_recommendation" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_interview_evaluation"("p_interview_id" "uuid", "p_notes" "text", "p_tech_rating" integer, "p_comm_rating" integer, "p_recommendation" "text") TO "service_role";



GRANT ALL ON TABLE "public"."admin_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."admin_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."applications" TO "anon";
GRANT ALL ON TABLE "public"."applications" TO "authenticated";
GRANT ALL ON TABLE "public"."applications" TO "service_role";



GRANT ALL ON TABLE "public"."candidate_profiles" TO "anon";
GRANT ALL ON TABLE "public"."candidate_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."candidate_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."employer_profiles" TO "anon";
GRANT ALL ON TABLE "public"."employer_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."employer_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."interview_evaluations" TO "anon";
GRANT ALL ON TABLE "public"."interview_evaluations" TO "authenticated";
GRANT ALL ON TABLE "public"."interview_evaluations" TO "service_role";



GRANT ALL ON TABLE "public"."interviews" TO "anon";
GRANT ALL ON TABLE "public"."interviews" TO "authenticated";
GRANT ALL ON TABLE "public"."interviews" TO "service_role";



GRANT ALL ON TABLE "public"."job_matches" TO "anon";
GRANT ALL ON TABLE "public"."job_matches" TO "authenticated";
GRANT ALL ON TABLE "public"."job_matches" TO "service_role";



GRANT ALL ON TABLE "public"."jobs" TO "anon";
GRANT ALL ON TABLE "public"."jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."jobs" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."resumes" TO "anon";
GRANT ALL ON TABLE "public"."resumes" TO "authenticated";
GRANT ALL ON TABLE "public"."resumes" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
