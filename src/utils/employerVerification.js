import { isAccountSuspended } from "../services/adminService";
import { supabase } from "../services/supabase";

/**
 * Normalizes any verification status string into canonical TitleCase.
 *
 * @param {string|null|undefined} status
 * @returns {"Approved" | "Verified" | "Rejected" | "Pending" | "Suspended"}
 */
export function normalizeVerificationStatus(status) {
  if (!status || typeof status !== "string") {
    return "Pending";
  }

  const clean = status.trim().toLowerCase();

  if (clean === "approved") return "Approved";
  if (clean === "verified") return "Verified";
  if (clean === "rejected") return "Rejected";
  if (clean === "suspended") return "Suspended";
  if (clean === "pending" || clean === "pending verification" || clean === "under review") {
    return "Pending";
  }

  return "Pending";
}

/**
 * Predicate to check if a verification status represents an approved/verified employer.
 *
 * @param {string|null|undefined} status
 * @returns {boolean}
 */
export function isEmployerVerified(status) {
  const normalized = normalizeVerificationStatus(status);
  return normalized === "Approved" || normalized === "Verified";
}

/**
 * Evaluates the authoritative employer verification state across both profiles
 * and employer_profiles records, with account suspension taking absolute precedence.
 *
 * @param {object} params
 * @param {object|null} params.profile - Raw row from public.profiles
 * @param {object|null} [params.employerProfile] - Raw row from public.employer_profiles
 * @returns {{
 *   status: "Approved" | "Verified" | "Rejected" | "Pending" | "Suspended",
 *   rawStatus: string,
 *   isApproved: boolean,
 *   isPending: boolean,
 *   isRejected: boolean,
 *   isSuspended: boolean,
 *   canPostJob: boolean,
 *   bannerType: "approved" | "pending" | "rejected" | "suspended",
 *   badgeText: string,
 *   badgeClass: string,
 *   reason: string,
 *   message: string
 * }}
 */
export function getEmployerVerificationState({ profile, employerProfile } = {}) {
  // 1. Suspension Authority: Account suspension ALWAYS overrides verification
  if (profile && isAccountSuspended(profile)) {
    return {
      status: "Suspended",
      rawStatus: profile.verification_status || "Suspended",
      isApproved: false,
      isPending: false,
      isRejected: false,
      isSuspended: true,
      canPostJob: false,
      bannerType: "suspended",
      badgeText: "🔴 Suspended",
      badgeClass: "badge-suspended",
      reason: profile.verification_reason || profile.suspension_reason_code || "Account suspended by administrator.",
      message: "Your account is currently suspended. You cannot post or manage jobs."
    };
  }

  // 2. Canonical authority check: profiles.verification_status is backend authority,
  // with employer_profiles.verification_status as synchronized business view.
  const rawStatus = profile?.verification_status || employerProfile?.verification_status || "Pending";
  const normalized = normalizeVerificationStatus(rawStatus);

  if (normalized === "Approved" || normalized === "Verified") {
    return {
      status: normalized,
      rawStatus,
      isApproved: true,
      isPending: false,
      isRejected: false,
      isSuspended: false,
      canPostJob: true,
      bannerType: "approved",
      badgeText: "✓ Approved",
      badgeClass: "badge-approved",
      reason: "",
      message: "Your identity and business are verified. You can post jobs."
    };
  }

  if (normalized === "Rejected") {
    return {
      status: "Rejected",
      rawStatus,
      isApproved: false,
      isPending: false,
      isRejected: true,
      isSuspended: false,
      canPostJob: false,
      bannerType: "rejected",
      badgeText: "❌ Rejected",
      badgeClass: "badge-rejected",
      reason: profile?.verification_reason || employerProfile?.verification_reason || "Verification documents did not meet platform guidelines.",
      message: "Your verification documents were rejected. Please update your documents in Company Profile."
    };
  }

  // Default: Pending Administrator Review
  return {
    status: "Pending",
    rawStatus,
    isApproved: false,
    isPending: true,
    isRejected: false,
    isSuspended: false,
    canPostJob: false,
    bannerType: "pending",
    badgeText: "⏳ Pending Verification",
    badgeClass: "badge-pending",
    reason: "",
    message: "Your account is awaiting administrator review. You cannot publish jobs until approved."
  };
}

/**
 * Fetches fresh, authoritative verification state directly from Supabase for a given user ID.
 * Prevents stale state from caching or outdated AuthContext.
 *
 * @param {string} userId
 * @param {object} [client=supabase]
 * @returns {Promise<{
 *   profile: object|null,
 *   employerProfile: object|null,
 *   verificationState: ReturnType<typeof getEmployerVerificationState>,
 *   error: any
 * }>}
 */
export async function fetchAuthoritativeEmployerVerification(userId, client = supabase) {
  if (!userId) {
    return {
      profile: null,
      employerProfile: null,
      verificationState: getEmployerVerificationState(),
      error: new Error("User ID is required")
    };
  }

  try {
    const [profRes, empRes] = await Promise.all([
      client.from("profiles").select("*").eq("id", userId).maybeSingle(),
      client.from("employer_profiles").select("*").eq("id", userId).maybeSingle()
    ]);

    if (profRes.error) {
      console.error("[employerVerification] Error fetching profile:", profRes.error);
      return {
        profile: null,
        employerProfile: null,
        verificationState: getEmployerVerificationState(),
        error: profRes.error
      };
    }

    const profile = profRes.data || null;
    const employerProfile = empRes.data || null;
    const verificationState = getEmployerVerificationState({ profile, employerProfile });

    return {
      profile,
      employerProfile,
      verificationState,
      error: null
    };
  } catch (err) {
    console.error("[employerVerification] Exception fetching verification state:", err);
    return {
      profile: null,
      employerProfile: null,
      verificationState: getEmployerVerificationState(),
      error: err
    };
  }
}
