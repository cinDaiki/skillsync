-- Migration: 20260823020000_harden_employer_verification_rpc.sql
-- Description: Harden admin_update_employer_verification to enforce valid verification statuses ('Pending', 'Approved', 'Verified', 'Rejected'), reject 'Suspended', and prevent verification-suspension coupling.

CREATE OR REPLACE FUNCTION "public"."admin_update_employer_verification"(
    "target_user_id" "uuid",
    "new_status" "text",
    "reason_note" "text" DEFAULT NULL::"text"
) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" = public, pg_temp
    AS $$
BEGIN
    -- 1. Security Check: Platform administrator authorization
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Forbidden: Admin authorization required.';
    END IF;

    -- 2. Validation Check: Strict verification statuses only (reject 'Suspended' and invalid values)
    IF new_status NOT IN ('Pending', 'Approved', 'Verified', 'Rejected') THEN
        RAISE EXCEPTION 'Invalid employer verification status: %. Allowed statuses: Pending, Approved, Verified, Rejected.', new_status;
    END IF;

    -- 3. Update main profile verification state (does NOT modify is_suspended or suspension lifecycle fields)
    UPDATE public.profiles
    SET
        verification_status = new_status,
        verification_reason = reason_note,
        updated_at = NOW()
    WHERE id = target_user_id;

    -- 4. Update employer profile verification state
    UPDATE public.employer_profiles
    SET
        verification_status = new_status,
        updated_at = NOW()
    WHERE id = target_user_id;

    -- 5. Write audit log for verification action (no suspension branch)
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
            WHEN new_status IN ('Approved', 'Verified') THEN 'EMPLOYER_APPROVED'
            WHEN new_status = 'Rejected' THEN 'EMPLOYER_REJECTED'
            ELSE 'EMPLOYER_STATUS_UPDATED'
        END,
        'employer',
        target_user_id,
        reason_note,
        jsonb_build_object('new_status', new_status)
    );
END;
$$;

ALTER FUNCTION "public"."admin_update_employer_verification"("target_user_id" "uuid", "new_status" "text", "reason_note" "text") OWNER TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."admin_update_employer_verification"("target_user_id" "uuid", "new_status" "text", "reason_note" "text") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."admin_update_employer_verification"("target_user_id" "uuid", "new_status" "text", "reason_note" "text") TO "service_role";
