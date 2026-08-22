import { supabase } from "./supabase.js";
import {
  isAccountSuspended,
  getSuspensionReasonLabel,
  formatSuspensionRemaining,
  displayUserName,
  normalizeAdminRole,
} from "./adminService.js";

/**
 * SkillSync — Suspension Appeals Service (Phase 5)
 * Manages user appeal submission and administrator review workflows.
 */

export const APPEAL_STATUS_LABELS = {
  pending: "Pending Review",
  under_review: "Under Review",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

/**
 * Submits a suspension appeal via secure database RPC.
 * Server derives user_id, normalized role, and suspension snapshots.
 */
export async function submitSuspensionAppeal({ appealMessage, userEvidenceNote = "" }) {
  const trimmedMessage = (appealMessage || "").trim();
  const trimmedEvidence = (userEvidenceNote || "").trim();

  if (!trimmedMessage || trimmedMessage.length < 20) {
    return {
      data: null,
      error: new Error("Appeal message must be at least 20 characters explaining your case."),
    };
  }

  if (trimmedMessage.length > 2000) {
    return {
      data: null,
      error: new Error("Appeal message cannot exceed 2000 characters."),
    };
  }

  if (trimmedEvidence.length > 2000) {
    return {
      data: null,
      error: new Error("Additional information cannot exceed 2000 characters."),
    };
  }

  try {
    const { data, error } = await supabase.rpc("submit_suspension_appeal", {
      p_appeal_message: trimmedMessage,
      p_user_evidence_note: trimmedEvidence || null,
    });

    if (error) {
      return { data: null, error };
    }

    return { data, error: null };
  } catch (err) {
    console.error("[SuspensionAppealService] submitSuspensionAppeal exception:", err);
    return { data: null, error: err };
  }
}

/**
 * Fetches all appeals submitted by the current authenticated user.
 */
export async function fetchMySuspensionAppeals() {
  try {
    const { data, error } = await supabase
      .from("suspension_appeals")
      .select("*")
      .order("created_at", { ascending: false });

    return { data: data || [], error };
  } catch (err) {
    console.error("[SuspensionAppealService] fetchMySuspensionAppeals error:", err);
    return { data: [], error: err };
  }
}

/**
 * Fetches the appeal specifically tied to the user's current suspension instance.
 * Matches currentSuspendedAt against suspended_at_snapshot.
 */
export async function fetchMyCurrentSuspensionAppeal(currentSuspendedAt = null) {
  try {
    const { data: appeals, error } = await supabase
      .from("suspension_appeals")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return { data: null, error };
    }

    if (!appeals || appeals.length === 0) {
      return { data: null, error: null };
    }

    // If currentSuspendedAt is provided, strictly require matching instance snapshot
    if (currentSuspendedAt) {
      const match = appeals.find((a) => {
        if (!a.suspended_at_snapshot && !currentSuspendedAt) return true;
        if (!a.suspended_at_snapshot || !currentSuspendedAt) return false;
        return new Date(a.suspended_at_snapshot).getTime() === new Date(currentSuspendedAt).getTime();
      });
      return { data: match || null, error: null };
    }

    // Active appeal (pending or under_review) takes precedence
    const activeAppeal = appeals.find((a) => a.status === "pending" || a.status === "under_review");
    if (activeAppeal) {
      return { data: activeAppeal, error: null };
    }

    // Fall back to most recent appeal
    return { data: appeals[0] || null, error: null };
  } catch (err) {
    console.error("[SuspensionAppealService] fetchMyCurrentSuspensionAppeal error:", err);
    return { data: null, error: err };
  }
}

/**
 * Server-side / unified query for Admin Suspension Appeals Page
 * Returns paginated appeals with joined user information and global summary counts.
 */
export async function fetchAdminSuspensionAppeals({
  statusFilter = "all", // 'all' | 'pending' | 'under_review' | 'resolved'
  search = "",
  page = 1,
  pageSize = 10,
} = {}) {
  try {
    // 1. Fetch appeals and profiles
    const [appealsRes, profilesRes, employerProfilesRes] = await Promise.all([
      supabase.from("suspension_appeals").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("*"),
      supabase.from("employer_profiles").select("id, company_name, industry"),
    ]);

    if (appealsRes.error) {
      console.error("[SuspensionAppealService] fetchAdminSuspensionAppeals error:", appealsRes.error);
      return {
        data: [],
        totalCount: 0,
        page,
        totalPages: 0,
        summary: { total: 0, pending: 0, under_review: 0, approved: 0, rejected: 0 },
        error: appealsRes.error,
      };
    }

    const allAppeals = appealsRes.data || [];
    const profilesMap = new Map((profilesRes.data || []).map((p) => [p.id, p]));
    const empProfilesMap = new Map((employerProfilesRes.data || []).map((ep) => [ep.id, ep]));

    // 2. Global summary metrics (independent of search text or current tab)
    const summary = {
      total: allAppeals.length,
      pending: allAppeals.filter((a) => a.status === "pending").length,
      under_review: allAppeals.filter((a) => a.status === "under_review").length,
      approved: allAppeals.filter((a) => a.status === "approved").length,
      rejected: allAppeals.filter((a) => a.status === "rejected").length,
    };

    // 3. Enrich appeals with user profiles & current suspension state
    let enriched = allAppeals.map((appeal) => {
      const userProfile = profilesMap.get(appeal.user_id) || {};
      const empProfile = empProfilesMap.get(appeal.user_id) || {};
      const isEmployer = appeal.account_role === "employer" || normalizeAdminRole(userProfile.role) === "Employer";

      const displayName = isEmployer
        ? empProfile.company_name || userProfile.company_name || userProfile.full_name || displayUserName(userProfile)
        : displayUserName(userProfile);

      const currentlySuspended = isAccountSuspended(userProfile);
      const isStale = Boolean(
        userProfile.suspended_at &&
        appeal.suspended_at_snapshot &&
        new Date(userProfile.suspended_at).getTime() !== new Date(appeal.suspended_at_snapshot).getTime()
      );

      const isNaturallyExpired = Boolean(
        appeal.suspension_expires_at_snapshot &&
        new Date(appeal.suspension_expires_at_snapshot) <= new Date() &&
        !currentlySuspended
      );

      const suspensionReasonLabel = getSuspensionReasonLabel(
        appeal.suspension_reason_code_snapshot || userProfile.suspension_reason_code
      );

      return {
        ...appeal,
        userProfile,
        displayName,
        email: userProfile.email || "No email",
        isEmployer,
        currentlySuspended,
        isStale,
        isNaturallyExpired,
        suspensionReasonLabel,
        formattedCreatedAt: appeal.created_at
          ? new Date(appeal.created_at).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "—",
        formattedReviewedAt: appeal.reviewed_at
          ? new Date(appeal.reviewed_at).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : null,
        durationRemaining: appeal.suspension_expires_at_snapshot
          ? formatSuspensionRemaining(appeal.suspension_expires_at_snapshot)
          : "Indefinite",
      };
    });

    // 4. Tab Filtering
    if (statusFilter === "pending") {
      enriched = enriched.filter((a) => a.status === "pending");
    } else if (statusFilter === "under_review") {
      enriched = enriched.filter((a) => a.status === "under_review");
    } else if (statusFilter === "resolved") {
      enriched = enriched.filter((a) => a.status === "approved" || a.status === "rejected" || a.status === "cancelled");
    }

    // 5. Search Filtering
    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      enriched = enriched.filter(
        (a) =>
          a.displayName.toLowerCase().includes(term) ||
          a.email.toLowerCase().includes(term) ||
          a.appeal_message.toLowerCase().includes(term)
      );
    }

    // 6. Paginate
    const totalCount = enriched.length;
    const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const from = (page - 1) * pageSize;
    const paginatedData = enriched.slice(from, from + pageSize);

    return {
      data: paginatedData,
      totalCount,
      page,
      totalPages,
      summary,
      error: null,
    };
  } catch (err) {
    console.error("[SuspensionAppealService] fetchAdminSuspensionAppeals exception:", err);
    return {
      data: [],
      totalCount: 0,
      page: 1,
      totalPages: 0,
      summary: { total: 0, pending: 0, under_review: 0, approved: 0, rejected: 0 },
      error: err,
    };
  }
}

/**
 * Fetches appeal details and admin review history for an appeal.
 */
export async function getAdminSuspensionAppealDetails(appealId) {
  if (!appealId) return { data: null, error: new Error("Appeal ID is required") };

  try {
    const [appealRes, reviewsRes] = await Promise.all([
      supabase.from("suspension_appeals").select("*").eq("id", appealId).single(),
      supabase
        .from("suspension_appeal_reviews")
        .select("*")
        .eq("appeal_id", appealId)
        .order("created_at", { ascending: false }),
    ]);

    if (appealRes.error) {
      return { data: null, error: appealRes.error };
    }

    const appeal = appealRes.data;
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", appeal.user_id).single();

    return {
      data: {
        ...appeal,
        userProfile: profile || null,
        reviewHistory: reviewsRes.data || [],
      },
      error: null,
    };
  } catch (err) {
    console.error("[SuspensionAppealService] getAdminSuspensionAppealDetails error:", err);
    return { data: null, error: err };
  }
}

/**
 * Submits an administrative appeal review decision via transactional RPC.
 * Enforces row-locking, stale appeal protection, and atomic profile restoration.
 */
export async function reviewSuspensionAppeal(appealId, { decision, publicResponse = "", internalNote = "" }) {
  if (!appealId) return { data: null, error: new Error("Appeal ID is required") };
  if (!decision || !["under_review", "approved", "rejected"].includes(decision)) {
    return { data: null, error: new Error("Invalid decision. Must be 'under_review', 'approved', or 'rejected'.") };
  }

  try {
    const { data, error } = await supabase.rpc("admin_review_suspension_appeal", {
      p_appeal_id: appealId,
      p_decision: decision,
      p_public_response: publicResponse.trim() || null,
      p_internal_note: internalNote.trim() || null,
    });

    if (error) {
      return { data: null, error };
    }

    return { data, error: null };
  } catch (err) {
    console.error("[SuspensionAppealService] reviewSuspensionAppeal exception:", err);
    return { data: null, error: err };
  }
}
