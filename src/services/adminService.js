import { supabase } from "./supabase.js";
import { addNotification } from "./notificationService.js";

function isJobSeeker(role) {
  const r = String(role || "").trim().toLowerCase();
  return r === "candidate" || r === "job_seeker" || r === "jobseeker";
}

/**
 * Authoritative effective suspension predicate for all SkillSync services, guards, and views.
 *
 * An account is effectively suspended when:
 * 1. `is_suspended === true` AND (`suspension_expires_at` is NULL OR `suspension_expires_at` > now)
 * 2. Legacy fallback: `verification_status` is 'Suspended' AND no modern expiry metadata is present.
 *
 * Expired temporary suspensions (`suspension_expires_at <= now`) evaluate to false (ACTIVE).
 *
 * @param {object|null} profile - User profile record
 * @param {Date|string|number} [now=new Date()] - Reference time for evaluation (defaults to current time)
 * @returns {boolean} true if account is currently suspended, false if active or expired
 */
export function isAccountSuspended(profile, now = new Date()) {
  if (!profile) return false;

  // Resolve valid reference date, safely ignoring array indices (0, 1, 2...) from Array.prototype.filter/map
  let nowDate;
  if (now instanceof Date && !isNaN(now.getTime())) {
    nowDate = now;
  } else if (typeof now === "string" && !isNaN(new Date(now).getTime())) {
    nowDate = new Date(now);
  } else if (typeof now === "number" && now > 1000000000000) {
    nowDate = new Date(now);
  } else {
    nowDate = new Date();
  }

  // Modern Phase 3/4 evaluation
  if (profile.is_suspended === true || profile.is_suspended === "true") {
    if (!profile.suspension_expires_at) {
      return true; // Indefinite suspension
    }
    const expDate = new Date(profile.suspension_expires_at);
    if (isNaN(expDate.getTime())) return true; // Malformed -> fallback safe block
    return expDate > nowDate; // True if future (still suspended), False if expired
  }

  // Legacy fallback: verification_status = 'Suspended' only when no modern expiry metadata is present
  if (
    !profile.suspension_expires_at &&
    typeof profile.verification_status === "string" &&
    profile.verification_status.trim().toLowerCase() === "suspended"
  ) {
    return true;
  }

  return false;
}

/**
 * Inverse active predicate for Admin views and business gates.
 * An account is active if it is NOT currently suspended (handles null / undefined / empty verification_status safely).
 */
export function isAccountActive(profile, now = new Date()) {
  return !isAccountSuspended(profile, now);
}

export const isSuspensionActive = isAccountSuspended;

/**
 * Normalized role classifier for Admin UI.
 * candidate / job_seeker / jobseeker -> 'Jobseeker'
 * employer -> 'Employer'
 * admin -> 'Admin'
 */
export function normalizeAdminRole(role) {
  const r = String(role || "").trim().toLowerCase();
  if (r === "candidate" || r === "job_seeker" || r === "jobseeker") {
    return "Jobseeker";
  }
  if (r === "employer") {
    return "Employer";
  }
  if (r === "admin") {
    return "Admin";
  }
  return r;
}

export async function fetchAdminProfiles() {
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "admin_get_all_profiles"
  );

  let profilesList = !rpcError && Array.isArray(rpcData) ? rpcData : null;

  if (!profilesList) {
    const { data } = await supabase.from("profiles").select("*");
    profilesList = data || [];
  }

  // Merge verification document paths from employer_profiles table to ensure admin visibility
  try {
    const { data: employerProfiles, error: employerProfilesError } = await supabase
      .from("employer_profiles")
      .select("id, id_image_url, selfie_image_url, business_permit_url, sec_registration_url, company_name, location, contact_number, verification_status");

    if (Array.isArray(employerProfiles) && employerProfiles.length > 0) {
      const empMap = new Map(employerProfiles.map((ep) => [ep.id, ep]));
      profilesList = profilesList.map((p) => {
        if (p.role === "employer") {
          const ep = empMap.get(p.id);
          const mergedEmployer = {
            ...p,
            id_image_url: ep ? (ep.id_image_url || p.id_image_url || null) : (p.id_image_url || null),
            selfie_image_url: ep ? (ep.selfie_image_url || p.selfie_image_url || null) : (p.selfie_image_url || null),
            business_permit_url: ep ? (ep.business_permit_url || null) : null,
            sec_registration_url: ep ? (ep.sec_registration_url || null) : null,
            company_name: ep ? (ep.company_name || p.company_name) : p.company_name,
            location: ep ? (ep.location || p.location) : p.location,
            contact_number: ep ? (ep.contact_number || p.contact_number) : p.contact_number,
            verification_status: ep ? (ep.verification_status || p.verification_status) : p.verification_status,
          };
          return mergedEmployer;
        }
        return p;
      });
    }
  } catch (err) {
    console.warn("[AdminService] Failed to merge employer_profiles:", err?.message);
  }

  return { data: profilesList, error: null };
}

/**
 * Server-side paginated query for Admin Jobseeker Management (ACTIVE accounts only)
 */
export async function fetchAdminJobseekers({ search = "", verificationStatus = "all", page = 1, pageSize = 10 } = {}) {
  try {
    // 1. Fetch all candidate profiles to ensure accurate, three-valued-logic-safe active separation
    let query = supabase
      .from("profiles")
      .select("*")
      .in("role", ["candidate", "job_seeker", "jobseeker"])
      .order("created_at", { ascending: false });

    const { data: allCandidates, error: fetchErr } = await query;

    if (fetchErr) {
      console.error("[AdminService] fetchAdminJobseekers error:", fetchErr);
      return { data: [], totalCount: 0, page, totalPages: 0, error: fetchErr };
    }

    const candidateList = allCandidates || [];

    // Global summary counts across all candidate records
    const summary = {
      total: candidateList.filter(isAccountActive).length,
      active: candidateList.filter(isAccountActive).length,
      suspended: candidateList.filter(isAccountSuspended).length,
      verified: candidateList.filter(p => isAccountActive(p) && (p.verification_status === "Verified" || p.verification_status === "Approved")).length,
      pending: candidateList.filter(p => isAccountActive(p) && (!p.verification_status || p.verification_status === "Pending" || p.verification_status === "Pending Verification" || p.verification_status === "Under Review")).length,
    };

    // 2. Strict Active-Only Filter
    let activeCandidates = candidateList.filter(isAccountActive);

    // 3. Search Filter
    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      activeCandidates = activeCandidates.filter((p) =>
        (p.full_name && p.full_name.toLowerCase().includes(term)) ||
        (p.email && p.email.toLowerCase().includes(term)) ||
        (p.address && p.address.toLowerCase().includes(term))
      );
    }

    // 4. Verification Status Filter
    if (verificationStatus !== "all" && verificationStatus !== "All") {
      if (verificationStatus === "verified") {
        activeCandidates = activeCandidates.filter((p) => p.verification_status === "Verified" || p.verification_status === "Approved");
      } else if (verificationStatus === "under_review") {
        activeCandidates = activeCandidates.filter((p) => p.verification_status === "Under Review");
      } else if (verificationStatus === "rejected") {
        activeCandidates = activeCandidates.filter((p) => p.verification_status === "Rejected");
      } else if (verificationStatus === "pending") {
        activeCandidates = activeCandidates.filter((p) => !p.verification_status || p.verification_status === "Pending" || p.verification_status === "Pending Verification");
      } else {
        activeCandidates = activeCandidates.filter((p) => p.verification_status === verificationStatus);
      }
    }

    const totalCount = activeCandidates.length;
    const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const from = (page - 1) * pageSize;
    let paginatedData = activeCandidates.slice(from, from + pageSize);

    // 5. Merge candidate_profiles table data if available
    if (paginatedData.length > 0) {
      const ids = paginatedData.map((p) => p.id);
      const { data: candProfiles } = await supabase
        .from("candidate_profiles")
        .select("*")
        .in("user_id", ids);

      if (Array.isArray(candProfiles) && candProfiles.length > 0) {
        const candMap = new Map(candProfiles.map((cp) => [cp.user_id, cp]));
        paginatedData = paginatedData.map((p) => {
          const cp = candMap.get(p.id);
          return {
            ...p,
            skills: cp?.skills || p.skills || [],
            experience: cp?.experience || p.work_experience || [],
            education: cp?.education || p.education || [],
            certifications: cp?.certifications || p.certifications || [],
            profile_completion: calculateProfileCompletion(p, cp),
          };
        });
      } else {
        paginatedData = paginatedData.map((p) => ({
          ...p,
          profile_completion: calculateProfileCompletion(p, null),
        }));
      }
    }

    return { data: paginatedData, totalCount, page, totalPages, summary, error: null };
  } catch (err) {
    console.error("[AdminService] fetchAdminJobseekers exception:", err);
    return { data: [], totalCount: 0, page: 1, totalPages: 0, error: err };
  }
}

function calculateProfileCompletion(profile, candidateProfile) {
  let score = 0;
  if (profile?.full_name) score += 20;
  if (profile?.email) score += 15;
  if (profile?.contact_number) score += 15;
  if (profile?.address || candidateProfile?.location) score += 15;

  const skills = candidateProfile?.skills || profile?.skills;
  if (Array.isArray(skills) ? skills.length > 0 : skills) score += 15;

  const exp = candidateProfile?.experience || profile?.work_experience;
  if (Array.isArray(exp) ? exp.length > 0 : exp) score += 10;

  const edu = candidateProfile?.education || profile?.education;
  if (Array.isArray(edu) ? edu.length > 0 : edu) score += 10;

  return Math.min(100, score);
}

/**
 * Server-side paginated query for Admin Employer Management (ACTIVE accounts only)
 */
export async function fetchAdminEmployers({ search = "", status = "All", page = 1, pageSize = 10 } = {}) {
  try {
    let query = supabase
      .from("profiles")
      .select("*")
      .eq("role", "employer")
      .order("created_at", { ascending: false });

    const { data: allEmployers, error: profileErr } = await query;

    if (profileErr) {
      console.error("[AdminService] fetchAdminEmployers error:", profileErr);
      return { data: [], totalCount: 0, page, totalPages: 0, error: profileErr };
    }

    let employersList = (allEmployers || []).filter(isAccountActive);

    // Merge employer_profiles details
    const empIds = employersList.map((p) => p.id);
    if (empIds.length > 0) {
      const { data: empProfiles } = await supabase
        .from("employer_profiles")
        .select("*")
        .in("id", empIds);

      const empMap = new Map((empProfiles || []).map((ep) => [ep.id, ep]));

      // Query job statistics per employer
      const { data: employerJobsData } = await supabase
        .from("jobs")
        .select("id, employer_id, status")
        .in("employer_id", empIds);

      const jobsMap = new Map();
      (employerJobsData || []).forEach((job) => {
        if (!jobsMap.has(job.employer_id)) {
          jobsMap.set(job.employer_id, { total: 0, open: 0, pending: 0, rejected: 0, closed: 0 });
        }
        const stats = jobsMap.get(job.employer_id);
        stats.total += 1;
        if (job.status === "open") stats.open += 1;
        else if (job.status === "pending_review") stats.pending += 1;
        else if (job.status === "rejected") stats.rejected += 1;
        else if (job.status === "closed") stats.closed += 1;
      });

      employersList = employersList.map((p) => {
        const ep = empMap.get(p.id);
        const stats = jobsMap.get(p.id) || { total: 0, open: 0, pending: 0, rejected: 0, closed: 0 };
        return {
          ...p,
          company_name: ep?.company_name || p.company_name || "Unnamed Company",
          industry: ep?.industry || "Not specified",
          company_size: ep?.company_size || "Not specified",
          location: ep?.location || p.location || "Not specified",
          website: ep?.website || "",
          contact_email: ep?.contact_email || p.email,
          contact_number: ep?.contact_number || p.contact_number || "",
          about: ep?.about || "",
          id_image_url: ep?.id_image_url || p.id_image_url || null,
          selfie_image_url: ep?.selfie_image_url || p.selfie_image_url || null,
          business_permit_url: ep?.business_permit_url || null,
          sec_registration_url: ep?.sec_registration_url || null,
          company_logo_url: ep?.company_logo_url || null,
          cover_photo_url: ep?.cover_photo_url || null,
          verification_status: ep?.verification_status || p.verification_status || "Pending",
          verification_reason: p.verification_reason || "",
          job_stats: stats,
        };
      });
    }

    // Apply Search
    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      employersList = employersList.filter((p) =>
        (p.full_name && p.full_name.toLowerCase().includes(term)) ||
        (p.email && p.email.toLowerCase().includes(term)) ||
        (p.company_name && p.company_name.toLowerCase().includes(term))
      );
    }

    // Apply Status Filter
    if (status !== "All" && status !== "all") {
      if (status === "Approved") {
        employersList = employersList.filter((p) => p.verification_status === "Approved" || p.verification_status === "Verified");
      } else if (status === "Pending") {
        employersList = employersList.filter((p) => !p.verification_status || p.verification_status === "Pending" || p.verification_status === "Pending Verification");
      } else if (status === "Rejected") {
        employersList = employersList.filter((p) => p.verification_status === "Rejected");
      } else {
        employersList = employersList.filter((p) => p.verification_status === status);
      }
    }

    const totalCount = employersList.length;
    const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const from = (page - 1) * pageSize;
    const paginatedData = employersList.slice(from, from + pageSize);

    return { data: paginatedData, totalCount, page, totalPages, error: null };
  } catch (err) {
    console.error("[AdminService] fetchAdminEmployers exception:", err);
    return { data: [], totalCount: 0, page: 1, totalPages: 0, error: err };
  }
}

/**
 * Controlled reason codes for administrative account suspensions
 */
export const SUSPENSION_REASON_CODES = {
  POLICY_VIOLATION: "policy_violation",
  SUSPICIOUS_ACTIVITY: "suspicious_activity",
  VERIFICATION_ISSUE: "verification_issue",
  ABUSIVE_BEHAVIOR: "abusive_behavior",
  FRAUDULENT_ACTIVITY: "fraudulent_activity",
  TERMS_VIOLATION: "terms_violation",
  OTHER: "other",
};

export const SUSPENSION_REASON_OPTIONS = [
  { code: "policy_violation", label: "Policy Violation" },
  { code: "suspicious_activity", label: "Suspicious Activity" },
  { code: "verification_issue", label: "Verification Issue" },
  { code: "abusive_behavior", label: "Abusive Behavior" },
  { code: "fraudulent_activity", label: "Fraudulent Activity" },
  { code: "terms_violation", label: "Terms of Service Violation" },
  { code: "other", label: "Other / Administrative" },
];

export const VALID_SUSPENSION_REASON_CODES = new Set(
  SUSPENSION_REASON_OPTIONS.map((o) => o.code)
);

export const SUSPENSION_DURATION_PRESETS = [
  { code: "1_day", label: "1 Day", days: 1 },
  { code: "3_days", label: "3 Days", days: 3 },
  { code: "7_days", label: "7 Days", days: 7 },
  { code: "14_days", label: "14 Days", days: 14 },
  { code: "30_days", label: "30 Days", days: 30 },
  { code: "indefinite", label: "Indefinite", days: null },
  { code: "custom", label: "Custom Date & Time", days: null },
];

export function calculateSuspensionExpiry(presetCode = "indefinite", customDateTime = null, fromDate = new Date()) {
  const baseTime = fromDate instanceof Date ? fromDate : new Date(fromDate);

  if (presetCode === "indefinite" || !presetCode) {
    return { expiresAt: null };
  }

  if (presetCode === "custom") {
    if (!customDateTime) {
      return { expiresAt: null, error: "Custom suspension expiry date and time is required." };
    }
    const customDate = customDateTime instanceof Date ? customDateTime : new Date(customDateTime);
    if (isNaN(customDate.getTime())) {
      return { expiresAt: null, error: "Invalid custom expiry date format." };
    }
    if (customDate.getTime() <= baseTime.getTime()) {
      return { expiresAt: null, error: "Custom suspension expiry must be set to a future date and time." };
    }
    return { expiresAt: customDate.toISOString() };
  }

  const preset = SUSPENSION_DURATION_PRESETS.find((p) => p.code === presetCode);
  if (!preset || preset.days === null) {
    return { expiresAt: null, error: `Unrecognized suspension duration preset: "${presetCode}".` };
  }

  const targetDate = new Date(baseTime.getTime() + preset.days * 24 * 60 * 60 * 1000);
  return { expiresAt: targetDate.toISOString() };
}

export function formatSuspensionRemaining(expiresAt, now = new Date()) {
  if (!expiresAt) return "Indefinite";
  const exp = new Date(expiresAt);
  if (isNaN(exp.getTime())) return "Invalid date";
  const diffMs = exp.getTime() - (now instanceof Date ? now.getTime() : new Date(now).getTime());
  if (diffMs <= 0) return "Expired";

  const totalSec = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  if (mins > 0) {
    return `${mins}m`;
  }
  return `${totalSec}s`;
}

export function getPublicSuspensionMessage(reasonCode) {
  switch (reasonCode) {
    case "policy_violation":
      return "Your account was suspended because of a SkillSync policy violation.";
    case "suspicious_activity":
      return "Your account was suspended due to unusual account activity.";
    case "verification_issue":
      return "Your account was suspended because of an account verification issue.";
    case "abusive_behavior":
      return "Your account was suspended due to violations regarding inappropriate or abusive conduct.";
    case "fraudulent_activity":
      return "Your account was suspended due to concerns regarding account information or activity.";
    case "terms_violation":
      return "Your account was suspended for violating the SkillSync Terms of Service.";
    case "other":
    default:
      return "Your SkillSync account has been suspended by an administrator.";
  }
}

export function getSuspensionReasonLabel(reasonCode) {
  const match = SUSPENSION_REASON_OPTIONS.find((o) => o.code === reasonCode);
  if (match) return match.label;
  if (!reasonCode) return "Administrative suspension";
  return reasonCode;
}

/**
 * Server-side / unified query for Admin Suspended Accounts Page
 * Returns all suspended Jobseekers and Employers with global summary counts.
 */
export async function fetchSuspendedAccounts({ search = "", roleFilter = "all", page = 1, pageSize = 10 } = {}) {
  try {
    // 1. Fetch all profiles
    const { data: allProfiles, error: profErr } = await supabase
      .from("profiles")
      .select("*")
      .order("updated_at", { ascending: false });

    if (profErr) {
      console.error("[AdminService] fetchSuspendedAccounts error:", profErr);
      return { data: [], totalCount: 0, page, totalPages: 0, summary: { total: 0, jobseekers: 0, employers: 0 }, error: profErr };
    }

    // 2. Filter strictly for currently effective suspended accounts, excluding admin accounts
    const allSuspended = (allProfiles || []).filter((p) => {
      const normRole = normalizeAdminRole(p.role);
      return (normRole === "Jobseeker" || normRole === "Employer") && isAccountSuspended(p);
    });

    // 3. GLOBAL summary counts (independent of search text, current tab, or current page)
    const summary = {
      total: allSuspended.length,
      jobseekers: allSuspended.filter((p) => normalizeAdminRole(p.role) === "Jobseeker").length,
      employers: allSuspended.filter((p) => normalizeAdminRole(p.role) === "Employer").length,
    };

    // 4. Load latest SUSPENSION audit events for suspended accounts (admin-only moderation notes)
    const suspendedIds = allSuspended.map((p) => p.id);
    let auditMap = new Map();
    if (suspendedIds.length > 0) {
      try {
        const { data: auditLogs } = await supabase
          .from("admin_audit_logs")
          .select("target_id, action, reason, metadata, created_at, admin_id")
          .in("target_id", suspendedIds)
          .in("action", ["CANDIDATE_SUSPENDED", "EMPLOYER_SUSPENDED"])
          .order("created_at", { ascending: false });

        (auditLogs || []).forEach((log) => {
          // Keep only the latest suspension event for each target_id
          if (!auditMap.has(log.target_id)) {
            auditMap.set(log.target_id, log);
          }
        });
      } catch (auditErr) {
        console.warn("[AdminService] Failed to load suspension audit logs:", auditErr?.message);
      }
    }

    // 5. Merge Employer Profiles & Job Stats for suspended employers
    const empIds = allSuspended.filter((p) => normalizeAdminRole(p.role) === "Employer").map((p) => p.id);
    let employerProfileMap = new Map();
    let jobsMap = new Map();

    if (empIds.length > 0) {
      const [empProfilesRes, jobsRes] = await Promise.all([
        supabase.from("employer_profiles").select("*").in("id", empIds),
        supabase.from("jobs").select("id, employer_id, status").in("employer_id", empIds),
      ]);

      (empProfilesRes.data || []).forEach((ep) => employerProfileMap.set(ep.id, ep));
      (jobsRes.data || []).forEach((j) => {
        if (!jobsMap.has(j.employer_id)) {
          jobsMap.set(j.employer_id, { total: 0, open: 0, pending: 0, closed: 0 });
        }
        const s = jobsMap.get(j.employer_id);
        s.total += 1;
        if (j.status === "open") s.open += 1;
        else if (j.status === "pending_review") s.pending += 1;
        else if (j.status === "closed") s.closed += 1;
      });
    }

    // Merge detailed attributes
    let enrichedList = allSuspended.map((p) => {
      const normRole = normalizeAdminRole(p.role);
      const latestAudit = auditMap.get(p.id);

      // Resolve reason code, timestamp, and expiry
      const reasonCode = p.suspension_reason_code || latestAudit?.metadata?.reason_code || (VALID_SUSPENSION_REASON_CODES.has(latestAudit?.reason) ? latestAudit.reason : null);
      const reasonLabel = getSuspensionReasonLabel(reasonCode);
      const suspendedAt = p.suspended_at || latestAudit?.metadata?.suspended_at || latestAudit?.created_at || null;
      const expiresAt = p.suspension_expires_at || latestAudit?.metadata?.suspension_expires_at || null;
      const durationRemaining = formatSuspensionRemaining(expiresAt);
      const isTemporary = Boolean(expiresAt);
      const internalAdminNote = latestAudit?.metadata?.internal_note || (!VALID_SUSPENSION_REASON_CODES.has(latestAudit?.reason) && latestAudit?.reason ? latestAudit.reason : null) || null;

      if (normRole === "Employer") {
        const ep = employerProfileMap.get(p.id);
        const stats = jobsMap.get(p.id) || { total: 0, open: 0, pending: 0, closed: 0 };
        return {
          ...p,
          normalizedRole: "Employer",
          company_name: ep?.company_name || p.company_name || "Unnamed Company",
          industry: ep?.industry || "Not specified",
          location: ep?.location || p.location || "Not specified",
          website: ep?.website || "",
          contact_number: ep?.contact_number || p.contact_number || "",
          verification_status: ep?.verification_status || p.verification_status || "Pending",
          verification_reason: p.verification_reason || "",
          suspension_reason_code: reasonCode,
          suspension_reason_label: reasonLabel,
          suspended_at: suspendedAt,
          suspension_expires_at: expiresAt,
          duration_remaining: durationRemaining,
          is_temporary: isTemporary,
          internal_admin_note: internalAdminNote,
          job_stats: stats,
        };
      }
      return {
        ...p,
        normalizedRole: "Jobseeker",
        verification_status: p.verification_status || "Pending",
        verification_reason: p.verification_reason || "",
        suspension_reason_code: reasonCode,
        suspension_reason_label: reasonLabel,
        suspended_at: suspendedAt,
        suspension_expires_at: expiresAt,
        duration_remaining: durationRemaining,
        is_temporary: isTemporary,
        internal_admin_note: internalAdminNote,
      };
    });

    // 6. Apply Tab / Role Filter
    if (roleFilter === "jobseekers") {
      enrichedList = enrichedList.filter((p) => p.normalizedRole === "Jobseeker");
    } else if (roleFilter === "employers") {
      enrichedList = enrichedList.filter((p) => p.normalizedRole === "Employer");
    }

    // 7. Apply Search Filter
    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      enrichedList = enrichedList.filter((p) =>
        (p.full_name && p.full_name.toLowerCase().includes(term)) ||
        (p.email && p.email.toLowerCase().includes(term)) ||
        (p.company_name && p.company_name.toLowerCase().includes(term)) ||
        (p.address && p.address.toLowerCase().includes(term))
      );
    }

    // 8. Paginate
    const totalCount = enrichedList.length;
    const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const from = (page - 1) * pageSize;
    const paginatedData = enrichedList.slice(from, from + pageSize);

    return {
      data: paginatedData,
      totalCount,
      page,
      totalPages,
      summary,
      error: null,
    };
  } catch (err) {
    console.error("[AdminService] fetchSuspendedAccounts exception:", err);
    return {
      data: [],
      totalCount: 0,
      page: 1,
      totalPages: 0,
      summary: { total: 0, jobseekers: 0, employers: 0 },
      error: err,
    };
  }
}

/**
 * Fetch all jobs posted by a specific employer
 */
export async function fetchEmployerJobs(employerId) {
  try {
    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .eq("employer_id", employerId)
      .order("created_at", { ascending: false });

    return { data: data || [], error };
  } catch (err) {
    console.error("[AdminService] fetchEmployerJobs error:", err);
    return { data: [], error: err };
  }
}

export async function fetchAdminDashboardStats() {
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "admin_get_dashboard_stats"
  );

  if (!rpcError && rpcData) {
    return {
      data: {
        jobSeekers: rpcData.job_seekers ?? 0,
        employers: rpcData.employers ?? 0,
        totalJobs: rpcData.total_jobs ?? 0,
        openJobs: rpcData.open_jobs ?? 0,
        closedJobs: rpcData.closed_jobs ?? 0,
        totalApplications: rpcData.total_applications ?? 0,
      },
      error: null,
    };
  }

  const { data: profiles } = await fetchAdminProfiles();
  const { data: jobs } = await supabase.from("jobs").select("*");
  const { data: applications } = await supabase.from("applications").select("*");

  const profileList = profiles || [];
  const jobList = jobs || [];

  return {
    data: {
      jobSeekers: profileList.filter((p) => isJobSeeker(p.role)).length,
      employers: profileList.filter((p) => p.role === "employer").length,
      totalJobs: jobList.length,
      openJobs: jobList.filter((j) => j.status === "open").length,
      closedJobs: jobList.filter((j) => j.status === "closed").length,
      totalApplications: (applications || []).length,
    },
    error: rpcError,
  };
}

/**
 * Server-side paginated query for Admin Job Moderation
 */
export async function fetchAdminJobs({ search = "", status = "all", workSetup = "all", page = 1, pageSize = 10 } = {}) {
  try {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("jobs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    if (search.trim()) {
      const term = `%${search.trim()}%`;
      query = query.or(`title.ilike.${term},description.ilike.${term},required_skills.ilike.${term}`);
    }

    if (status !== "all" && status !== "All") {
      if (status === "open" || status === "Open") {
        query = query.eq("status", "open");
      } else if (status === "pending_review" || status === "Pending Review") {
        query = query.eq("status", "pending_review");
      } else if (status === "rejected" || status === "Rejected") {
        query = query.eq("status", "rejected");
      } else if (status === "closed" || status === "Closed") {
        query = query.eq("status", "closed");
      } else {
        query = query.eq("status", status);
      }
    }

    if (workSetup !== "all" && workSetup !== "All") {
      query = query.ilike("work_setup", `%${workSetup}%`);
    }

    const { data: jobs, count, error: jobErr } = await query.range(from, to);

    if (jobErr) {
      console.error("[AdminService] fetchAdminJobs error:", jobErr);
      return { data: [], totalCount: 0, page, totalPages: 0, error: jobErr };
    }

    let jobsList = jobs || [];
    const empIds = Array.from(new Set(jobsList.map((j) => j.employer_id).filter(Boolean)));

    if (empIds.length > 0) {
      // Fetch employer profiles & auth profiles for company & contact details
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email, verification_status, contact_number, address")
        .in("id", empIds);

      const { data: empProfs } = await supabase
        .from("employer_profiles")
        .select("id, company_name, location, industry, company_size, website, id_image_url, selfie_image_url, business_permit_url, sec_registration_url, verification_status")
        .in("id", empIds);

      const profMap = new Map((profs || []).map((p) => [p.id, p]));
      const empProfMap = new Map((empProfs || []).map((ep) => [ep.id, ep]));

      // Also get job counts for employer card
      const { data: empJobs } = await supabase
        .from("jobs")
        .select("id, employer_id, status")
        .in("employer_id", empIds);

      const empStatsMap = new Map();
      (empJobs || []).forEach((j) => {
        if (!empStatsMap.has(j.employer_id)) {
          empStatsMap.set(j.employer_id, { total: 0, open: 0, pending: 0, rejected: 0, closed: 0 });
        }
        const st = empStatsMap.get(j.employer_id);
        st.total += 1;
        if (j.status === "open") st.open += 1;
        else if (j.status === "pending_review") st.pending += 1;
        else if (j.status === "rejected") st.rejected += 1;
        else if (j.status === "closed") st.closed += 1;
      });

      jobsList = jobsList.map((j) => {
        const p = profMap.get(j.employer_id);
        const ep = empProfMap.get(j.employer_id);
        const stats = empStatsMap.get(j.employer_id) || { total: 0, open: 0, pending: 0, rejected: 0, closed: 0 };

        return {
          ...j,
          profiles: p || null,
          employer_info: {
            id: j.employer_id,
            company_name: ep?.company_name || j.company_name || p?.full_name || "Company",
            contact_name: p ? displayUserName(p) : (j.employer_name || "Employer"),
            contact_email: p?.email || j.employer_email || "Not specified",
            location: ep?.location || j.location || p?.location || "Not specified",
            industry: ep?.industry || "Not specified",
            verification_status: ep?.verification_status || p?.verification_status || "Pending",
            id_image_url: ep?.id_image_url || null,
            selfie_image_url: ep?.selfie_image_url || null,
            business_permit_url: ep?.business_permit_url || null,
            sec_registration_url: ep?.sec_registration_url || null,
            job_stats: stats,
          },
        };
      });
    }

    const totalCount = count || jobsList.length;
    const totalPages = Math.ceil(totalCount / pageSize) || 1;

    return { data: jobsList, totalCount, page, totalPages, error: null };
  } catch (err) {
    console.error("[AdminService] fetchAdminJobs exception:", err);
    return { data: [], totalCount: 0, page: 1, totalPages: 0, error: err };
  }
}

export function filterJobSeekers(profiles) {
  return (profiles || []).filter((p) => isJobSeeker(p.role));
}

export function filterEmployers(profiles) {
  return (profiles || []).filter((p) => p.role === "employer");
}

export function displayUserName(user) {
  if (user?.full_name?.trim()) return user.full_name.trim();
  if (user?.email?.trim()) {
    const local = user.email.split("@")[0];
    return local.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return "Unnamed User";
}

export async function fetchAdminResumes() {
  const { data, error } = await supabase.rpc("admin_get_all_resumes");
  return { data: data || [], error };
}

export async function fetchAdminApplications() {
  const { data, error } = await supabase.rpc("admin_get_all_applications");
  return { data: data || [], error };
}

export async function toggleUserSuspension(userId, suspendStatus) {
  const { error } = await supabase.rpc("admin_toggle_user_suspension", {
    user_id: userId,
    suspend_status: suspendStatus,
  });
  return { error };
}

export async function deleteUser(userId) {
  const { error } = await supabase.rpc("admin_delete_user", {
    user_id: userId,
  });
  return { error };
}

export async function deleteResume(userId) {
  const { error } = await supabase.rpc("admin_delete_resume", {
    user_id: userId,
  });
  return { error };
}

export async function updateUserProfile(userId, { fullName, email, contactNumber, address, skills, role }) {
  const { error } = await supabase.rpc("admin_update_profile", {
    user_id: userId,
    new_full_name: fullName || "",
    new_email: email || "",
    new_contact_number: contactNumber || "",
    new_address: address || "",
    new_skills: Array.isArray(skills) ? skills.join(",") : skills || "",
    new_role: role || "candidate",
  });
  return { error };
}

/**
 * Approves or Rejects a candidate's identity verification with reason and audit log
 */
export async function updateCandidateVerification(userId, status, reasonNote = "") {
  if (!userId) return { error: new Error("Candidate user ID is required") };

  try {
    const isApproved = status === "Verified" || status === "Approved";
    const isRejected = status === "Rejected";

    const profileUpdates = {
      verification_status: status,
      updated_at: new Date().toISOString()
    };

    if (isRejected && reasonNote) {
      profileUpdates.verification_reason = reasonNote;
    } else if (isApproved) {
      profileUpdates.verification_reason = null;
      profileUpdates.verification_date = new Date().toISOString();
    }

    let { error: updateErr } = await supabase
      .from("profiles")
      .update(profileUpdates)
      .eq("id", userId);

    if (updateErr && updateErr.code === "42703") {
      const basicUpdates = {
        verification_status: status,
        updated_at: new Date().toISOString()
      };
      ({ error: updateErr } = await supabase
        .from("profiles")
        .update(basicUpdates)
        .eq("id", userId));
    }

    if (updateErr) {
      console.error("[AdminService] updateCandidateVerification error:", updateErr.message);
      return { error: updateErr };
    }

    // Send candidate notification
    try {
      if (isApproved) {
        await addNotification(
          userId,
          "✅ Identity Verified!",
          "Your identity verification submission has been approved by our administration team. You can now apply for verified jobs across SkillSync.",
          "verification"
        );
      } else if (isRejected) {
        await addNotification(
          userId,
          "❌ Verification Update",
          `Your identity verification was not approved.${reasonNote ? ` Reason: ${reasonNote}` : " Please review your documents and submit a clearer ID in your profile."}`,
          "verification"
        );
      }
    } catch (notifErr) {
      console.warn("[AdminService] Notification error:", notifErr?.message);
    }

    // Write audit log on successful completion
    try {
      await logAdminAction({
        action: (status === "Verified" || status === "Approved") ? "CANDIDATE_VERIFICATION_APPROVED" : "CANDIDATE_VERIFICATION_REJECTED",
        targetType: "candidate",
        targetId: userId,
        reason: reasonNote || null,
        metadata: { new_status: status }
      });
    } catch (auditErr) {
      console.warn("[AdminService] Audit log error:", auditErr?.message);
    }

    return { error: null };
  } catch (err) {
    console.error("[AdminService] updateCandidateVerification error:", err);
    return { error: err };
  }
}

/**
 * Suspends a candidate account with controlled reason code, duration/expiry, and audit log
 */
export async function suspendCandidateAccount(userId, reasonParam = "other") {
  if (!userId) return { error: new Error("Candidate user ID is required") };

  let reasonCode = "other";
  let internalNote = "";
  let durationPreset = "indefinite";
  let customDateTime = null;
  let explicitExpiresAt = undefined;

  if (typeof reasonParam === "object" && reasonParam !== null) {
    reasonCode = reasonParam.reasonCode || "other";
    internalNote = reasonParam.internalNote || "";
    durationPreset = reasonParam.durationPreset || (reasonParam.expiresAt ? "custom" : "indefinite");
    customDateTime = reasonParam.customDateTime || null;
    explicitExpiresAt = reasonParam.expiresAt;
  } else if (typeof reasonParam === "string" && reasonParam.trim()) {
    if (VALID_SUSPENSION_REASON_CODES.has(reasonParam.trim())) {
      reasonCode = reasonParam.trim();
    } else {
      reasonCode = "other";
      internalNote = reasonParam.trim();
    }
  }

  const validCode = VALID_SUSPENSION_REASON_CODES.has(reasonCode) ? reasonCode : "other";
  const trimmedNote = (internalNote || "").trim();
  const nowIso = new Date().toISOString();

  let finalExpiresAt = null;
  if (explicitExpiresAt !== undefined) {
    if (explicitExpiresAt) {
      const expDate = new Date(explicitExpiresAt);
      if (isNaN(expDate.getTime()) || expDate <= new Date()) {
        return { error: new Error("Suspension expiry must be a valid future date and time.") };
      }
      finalExpiresAt = expDate.toISOString();
    } else {
      finalExpiresAt = null;
    }
  } else {
    const calc = calculateSuspensionExpiry(durationPreset, customDateTime);
    if (calc.error) {
      return { error: new Error(calc.error) };
    }
    finalExpiresAt = calc.expiresAt;
  }

  try {
    const profileUpdates = {
      is_suspended: true,
      suspension_reason_code: validCode,
      suspended_at: nowIso,
      suspension_expires_at: finalExpiresAt,
      updated_at: nowIso,
    };

    let { error: updateErr } = await supabase
      .from("profiles")
      .update(profileUpdates)
      .eq("id", userId);

    if (updateErr && updateErr.code === "42703") {
      ({ error: updateErr } = await supabase
        .from("profiles")
        .update({ is_suspended: true, suspension_reason_code: validCode, suspended_at: nowIso, updated_at: nowIso })
        .eq("id", userId));
    }

    if (updateErr) {
      console.error("[AdminService] suspendCandidateAccount error:", updateErr);
      return { error: updateErr };
    }

    const durationInfo = finalExpiresAt ? ` until ${new Date(finalExpiresAt).toLocaleDateString()}` : "";
    try {
      await addNotification(
        userId,
        "🚫 Account Suspended",
        `Your SkillSync candidate account has been suspended${durationInfo}: ${getPublicSuspensionMessage(validCode)} Please contact support for more information.`,
        "system"
      );
    } catch (notifErr) {
      console.warn("[AdminService] Notification error:", notifErr?.message);
    }

    // Write audit log on successful completion
    try {
      await logAdminAction({
        action: "CANDIDATE_SUSPENDED",
        targetType: "candidate",
        targetId: userId,
        reason: validCode,
        metadata: {
          reason_code: validCode,
          internal_note: trimmedNote || null,
          suspended_at: nowIso,
          suspension_expires_at: finalExpiresAt,
          duration_preset: durationPreset,
        },
      });
    } catch (auditErr) {
      console.warn("[AdminService] Audit log error:", auditErr?.message);
    }

    return { error: null, expiresAt: finalExpiresAt };
  } catch (err) {
    console.error("[AdminService] suspendCandidateAccount error:", err);
    return { error: err };
  }
}

/**
 * Restores / Reactivates a suspended candidate account with audit log
 */
export async function restoreCandidateAccount(userId, reasonNote = "") {
  if (!userId) return { error: new Error("Candidate user ID is required") };
  const nowIso = new Date().toISOString();

  try {
    const profileUpdates = {
      is_suspended: false,
      suspension_reason_code: null,
      suspended_at: null,
      suspension_expires_at: null,
      updated_at: nowIso,
    };

    let { error: updateErr } = await supabase
      .from("profiles")
      .update(profileUpdates)
      .eq("id", userId);

    if (updateErr && updateErr.code === "42703") {
      ({ error: updateErr } = await supabase
        .from("profiles")
        .update({ is_suspended: false, updated_at: nowIso })
        .eq("id", userId));
    }

    if (updateErr) {
      console.error("[AdminService] restoreCandidateAccount error:", updateErr);
      return { error: updateErr };
    }

    // Legacy recovery: If verification_status was legacy 'Suspended', recover to 'Pending Verification'
    const { data: profile } = await supabase
      .from("profiles")
      .select("verification_status")
      .eq("id", userId)
      .maybeSingle();

    if (profile?.verification_status === "Suspended") {
      const { error: recovErr } = await supabase
        .from("profiles")
        .update({ verification_status: "Pending Verification", updated_at: nowIso })
        .eq("id", userId);
      if (recovErr) {
        console.warn("[AdminService] Legacy candidate recovery notice:", recovErr.message);
      }
    }

    try {
      await addNotification(
        userId,
        "✓ Account Restored",
        "Your SkillSync candidate account has been reactivated. You can now log in and continue your job search.",
        "system"
      );
    } catch (notifErr) {
      console.warn("[AdminService] Notification error:", notifErr?.message);
    }

    // Write audit log on successful completion
    try {
      await logAdminAction({
        action: "CANDIDATE_RESTORED",
        targetType: "candidate",
        targetId: userId,
        reason: reasonNote || "Account reactivated by administrator",
        metadata: { restored_at: nowIso },
      });
    } catch (auditErr) {
      console.warn("[AdminService] Audit log error:", auditErr?.message);
    }

    return { error: null };
  } catch (err) {
    console.error("[AdminService] restoreCandidateAccount error:", err);
    return { error: err };
  }
}

/**
 * Suspends an employer account with controlled reason code, duration/expiry, and audit log
 */
export async function suspendEmployerAccount(userId, reasonParam = "other") {
  if (!userId) return { error: new Error("Employer user ID is required") };

  let reasonCode = "other";
  let internalNote = "";
  let durationPreset = "indefinite";
  let customDateTime = null;
  let explicitExpiresAt = undefined;

  if (typeof reasonParam === "object" && reasonParam !== null) {
    reasonCode = reasonParam.reasonCode || "other";
    internalNote = reasonParam.internalNote || "";
    durationPreset = reasonParam.durationPreset || (reasonParam.expiresAt ? "custom" : "indefinite");
    customDateTime = reasonParam.customDateTime || null;
    explicitExpiresAt = reasonParam.expiresAt;
  } else if (typeof reasonParam === "string" && reasonParam.trim()) {
    if (VALID_SUSPENSION_REASON_CODES.has(reasonParam.trim())) {
      reasonCode = reasonParam.trim();
    } else {
      reasonCode = "other";
      internalNote = reasonParam.trim();
    }
  }

  const validCode = VALID_SUSPENSION_REASON_CODES.has(reasonCode) ? reasonCode : "other";
  const trimmedNote = (internalNote || "").trim();
  const nowIso = new Date().toISOString();

  let finalExpiresAt = null;
  if (explicitExpiresAt !== undefined) {
    if (explicitExpiresAt) {
      const expDate = new Date(explicitExpiresAt);
      if (isNaN(expDate.getTime()) || expDate <= new Date()) {
        return { error: new Error("Suspension expiry must be a valid future date and time.") };
      }
      finalExpiresAt = expDate.toISOString();
    } else {
      finalExpiresAt = null;
    }
  } else {
    const calc = calculateSuspensionExpiry(durationPreset, customDateTime);
    if (calc.error) {
      return { error: new Error(calc.error) };
    }
    finalExpiresAt = calc.expiresAt;
  }

  try {
    const profileUpdates = {
      is_suspended: true,
      suspension_reason_code: validCode,
      suspended_at: nowIso,
      suspension_expires_at: finalExpiresAt,
      updated_at: nowIso,
    };

    let { error: updateErr } = await supabase
      .from("profiles")
      .update(profileUpdates)
      .eq("id", userId);

    if (updateErr && updateErr.code === "42703") {
      ({ error: updateErr } = await supabase
        .from("profiles")
        .update({ is_suspended: true, suspension_reason_code: validCode, suspended_at: nowIso, updated_at: nowIso })
        .eq("id", userId));
    }

    if (updateErr) {
      console.error("[AdminService] suspendEmployerAccount error:", updateErr);
      return { error: updateErr };
    }

    const durationInfo = finalExpiresAt ? ` until ${new Date(finalExpiresAt).toLocaleDateString()}` : "";
    try {
      await addNotification(
        userId,
        "🚫 Account Suspended",
        `Your SkillSync employer account has been suspended${durationInfo}: ${getPublicSuspensionMessage(validCode)} Please contact support for more information.`,
        "system"
      );
    } catch (notifErr) {
      console.warn("[AdminService] Notification error:", notifErr?.message);
    }

    // Write audit log on successful completion
    try {
      await logAdminAction({
        action: "EMPLOYER_SUSPENDED",
        targetType: "employer",
        targetId: userId,
        reason: validCode,
        metadata: {
          reason_code: validCode,
          internal_note: trimmedNote || null,
          suspended_at: nowIso,
          suspension_expires_at: finalExpiresAt,
          duration_preset: durationPreset,
        },
      });
    } catch (auditErr) {
      console.warn("[AdminService] Audit log error:", auditErr?.message);
    }

    return { error: null, expiresAt: finalExpiresAt };
  } catch (err) {
    console.error("[AdminService] suspendEmployerAccount error:", err);
    return { error: err };
  }
}

/**
 * Restores / Reactivates a suspended employer account with audit log
 */
export async function restoreEmployerAccount(userId, reasonNote = "") {
  if (!userId) return { error: new Error("Employer user ID is required") };
  const nowIso = new Date().toISOString();

  try {
    const profileUpdates = {
      is_suspended: false,
      suspension_reason_code: null,
      suspended_at: null,
      suspension_expires_at: null,
      updated_at: nowIso,
    };

    let { error: updateErr } = await supabase
      .from("profiles")
      .update(profileUpdates)
      .eq("id", userId);

    if (updateErr && updateErr.code === "42703") {
      ({ error: updateErr } = await supabase
        .from("profiles")
        .update({ is_suspended: false, updated_at: nowIso })
        .eq("id", userId));
    }

    if (updateErr) {
      console.error("[AdminService] restoreEmployerAccount error:", updateErr);
      return { error: updateErr };
    }

    // Legacy recovery: If verification_status was legacy 'Suspended', recover to 'Pending'
    const { data: profile } = await supabase
      .from("profiles")
      .select("verification_status")
      .eq("id", userId)
      .maybeSingle();

    if (profile?.verification_status === "Suspended") {
      const { error: recovErr1 } = await supabase
        .from("profiles")
        .update({ verification_status: "Pending", updated_at: nowIso })
        .eq("id", userId);
      if (recovErr1) {
        console.warn("[AdminService] Legacy employer recovery notice:", recovErr1.message);
      }

      const { error: recovErr2 } = await supabase
        .from("employer_profiles")
        .update({ verification_status: "Pending", updated_at: nowIso })
        .eq("id", userId);
      if (recovErr2) {
        console.warn("[AdminService] Legacy employer_profiles recovery notice:", recovErr2.message);
      }
    }

    try {
      await addNotification(
        userId,
        "✓ Account Restored",
        "Your SkillSync employer account has been reactivated. You can now access your employer portal and job listings.",
        "system"
      );
    } catch (notifErr) {
      console.warn("[AdminService] Notification error:", notifErr?.message);
    }

    // Write audit log on successful completion
    try {
      await logAdminAction({
        action: "EMPLOYER_RESTORED",
        targetType: "employer",
        targetId: userId,
        reason: reasonNote || "Account reactivated by administrator",
        metadata: { restored_at: nowIso },
      });
    } catch (auditErr) {
      console.warn("[AdminService] Audit log error:", auditErr?.message);
    }

    return { error: null };
  } catch (err) {
    console.error("[AdminService] restoreEmployerAccount error:", err);
    return { error: err };
  }
}

/**
 * Updates permitted administrative contact/identity fields for a candidate
 */
export async function updateCandidateAdministrativeDetails(userId, { fullName, contactNumber, address }, reasonNote = "") {
  try {
    const payload = {
      full_name: (fullName || "").trim(),
      contact_number: (contactNumber || "").trim(),
      address: (address || "").trim(),
      updated_at: new Date().toISOString()
    };

    const { error: tableErr } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", userId);

    if (tableErr) return { error: tableErr };

    // Write audit log on successful completion
    try {
      await logAdminAction({
        action: "CANDIDATE_ADMIN_DETAILS_UPDATED",
        targetType: "candidate",
        targetId: userId,
        reason: reasonNote || "Administrative profile correction",
        metadata: { fullName, contactNumber, address }
      });
    } catch (e) {
      console.warn("[AdminService] Audit log error:", e?.message);
    }

    return { error: null };
  } catch (err) {
    console.error("[AdminService] updateCandidateAdministrativeDetails error:", err);
    return { error: err };
  }
}

export const ALLOWED_EMPLOYER_VERIFICATION_STATUSES = new Set(["Pending", "Approved", "Verified", "Rejected"]);

/**
 * Updates employer verification status with admin reason and audit log.
 * Independent of suspension state (does NOT modify is_suspended or suspension lifecycle fields).
 */
export async function updateEmployerVerification(userId, status, reasonNote = "") {
  if (!userId) return { error: new Error("Employer user ID is required") };

  if (!ALLOWED_EMPLOYER_VERIFICATION_STATUSES.has(status)) {
    return {
      error: new Error(`Invalid employer verification status: "${status}". Allowed statuses: Pending, Approved, Verified, Rejected.`)
    };
  }

  console.log(`[AdminService] Diagnostic: Attempting updateEmployerVerification for Target User ID: ${userId}, Status: ${status}, Reason: "${reasonNote}"`);

  try {
    const { error: rpcError } = await supabase.rpc("admin_update_employer_verification", {
      target_user_id: userId,
      new_status: status,
      reason_note: reasonNote || null,
    });

    if (!rpcError) {
      console.log(`[AdminService] Diagnostic: RPC admin_update_employer_verification succeeded for ${userId}`);
      // Note: The RPC already writes to admin_audit_logs internally.
      return { error: null };
    }

    console.warn("[AdminService] RPC admin_update_employer_verification returned error or 404:", {
      message: rpcError.message,
      code: rpcError.code,
      details: rpcError.details,
      hint: rpcError.hint,
      status: rpcError.status
    });

    // Direct table fallback for authenticated admin user (modifies ONLY verification fields)
    const profileUpdates = {
      verification_status: status,
      updated_at: new Date().toISOString()
    };
    if (reasonNote) profileUpdates.verification_reason = reasonNote;

    console.log(`[AdminService] Diagnostic: Executing direct PATCH fallback on public.profiles for ID ${userId} with payload:`, profileUpdates);

    let { error: tableError } = await supabase
      .from("profiles")
      .update(profileUpdates)
      .eq("id", userId);

    if (tableError) {
      console.error("[AdminService] Supabase public.profiles PATCH Direct Update Error:", {
        message: tableError.message,
        code: tableError.code,
        details: tableError.details,
        hint: tableError.hint,
        status: tableError.status
      });

      if (tableError.code === "42703") {
        // Column verification_reason does not exist on profiles table schema yet
        console.warn("[AdminService] Retrying profiles update without verification_reason column...");
        const { error: retryErr } = await supabase
          .from("profiles")
          .update({ verification_status: status, updated_at: new Date().toISOString() })
          .eq("id", userId);

        if (retryErr && !retryErr.message?.includes("fetch failed")) {
          console.error("[AdminService] Retry profiles update failed:", retryErr);
          return {
            error: new Error(`Unable to update employer verification (${retryErr.message}).`)
          };
        }
      } else if (!tableError.message?.includes("fetch failed")) {
        return {
          error: new Error(`Unable to update employer verification (${tableError.message || "HTTP 400 Bad Request"}).`)
        };
      }
    }

    // Also update employer_profiles table
    const { error: empError } = await supabase
      .from("employer_profiles")
      .update({ verification_status: status, updated_at: new Date().toISOString() })
      .eq("id", userId);

    if (empError && !empError.message?.includes("fetch failed")) {
      console.warn("[AdminService] public.employer_profiles PATCH Update Warning:", empError.message);
    }

    // Primary direct table fallback succeeded -> write audit event
    try {
      await logAdminAction({
        action: status === "Approved" || status === "Verified" ? "EMPLOYER_APPROVED" : status === "Rejected" ? "EMPLOYER_REJECTED" : "EMPLOYER_STATUS_UPDATED",
        targetType: "employer",
        targetId: userId,
        reason: reasonNote
      });
    } catch (auditErr) {
      console.warn("[AdminService] Audit log error:", auditErr?.message);
    }

    return { error: null };
  } catch (err) {
    console.error("[AdminService] updateEmployerVerification exception:", err);
    return { error: new Error(`Unable to update employer verification: ${err.message || "Please try again."}`) };
  }
}

/**
 * Moderates job status (approve to 'open', reject, or suspend)
 */
export async function moderateJobStatus(jobId, status, reasonNote = "") {
  try {
    const { error: rpcError } = await supabase.rpc("admin_moderate_job", {
      target_job_id: jobId,
      new_status: status,
      reason_note: reasonNote || null,
    });

    if (rpcError) {
      // Direct table fallback
      const { error: tableError } = await supabase
        .from("jobs")
        .update({
          status: status,
          rejection_reason: reasonNote || null,
          updated_at: new Date().toISOString()
        })
        .eq("id", jobId);

      if (tableError && !tableError.message?.includes("fetch failed")) return { error: tableError };
    }

    // Primary update succeeded -> log audit action
    try {
      await logAdminAction({
        action: status === "open" ? "JOB_APPROVED" : status === "rejected" ? "JOB_REJECTED" : "JOB_SUSPENDED",
        targetType: "job",
        targetId: jobId,
        reason: reasonNote
      });
    } catch (auditErr) {
      console.warn("[AdminService] Audit log error:", auditErr?.message);
    }

    return { error: null };
  } catch (err) {
    console.warn("[AdminService] moderateJobStatus offline mode fallback.");
    return { error: null };
  }
}

/**
 * Candidate Jobseeker reports suspicious / scam / fraudulent job
 */
export async function submitJobReport({ jobId, reporterId, reason, details }) {
  const payload = {
    job_id: jobId,
    reporter_id: reporterId,
    reason: reason || "Suspicious Job Posting",
    details: details || "",
    status: "pending",
    created_at: new Date().toISOString()
  };

  const { data, error } = await supabase.from("job_reports").insert([payload]).select();
  if (error) {
    console.warn("[JobReports] Supabase report insert error (falling back to local cache):", error.message);
    const existing = JSON.parse(localStorage.getItem("skillsync_job_reports") || "[]");
    existing.push({ ...payload, id: `local_report_${Date.now()}` });
    localStorage.setItem("skillsync_job_reports", JSON.stringify(existing));
    return { data: payload, error: null };
  }
  return { data: data ? data[0] : payload, error: null };
}

/**
 * Fetches all job reports for admin review
 */
export async function fetchJobReports() {
  const { data, error } = await supabase
    .from("job_reports")
    .select("*, jobs(title, employer_id, location, company_name), profiles:reporter_id(full_name, email)")
    .order("created_at", { ascending: false });

  if (error) {
    const local = JSON.parse(localStorage.getItem("skillsync_job_reports") || "[]");
    return { data: local, error: null };
  }
  return { data: data || [], error: null };
}

/**
 * Resolves job report
 */
export async function resolveJobReport(reportId, status, resolutionNote = "") {
  const { error } = await supabase
    .from("job_reports")
    .update({
      status,
      resolution_note: resolutionNote,
      resolved_at: new Date().toISOString()
    })
    .eq("id", reportId);

  return { error };
}

/**
 * Writes an administrative audit log entry
 */
export async function logAdminAction({ action, targetType, targetId, reason, metadata = {} }) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      admin_id: user?.id || null,
      action,
      target_type: targetType,
      target_id: targetId,
      reason: reason || null,
      metadata,
      created_at: new Date().toISOString()
    };

    const { error } = await supabase.from("admin_audit_logs").insert([payload]);
    if (error) {
      console.warn("[AdminService] Audit log insert notice:", error.message);
    }
  } catch (err) {
    console.warn("[AdminService] Audit log exception notice:", err.message);
  }
}

/**
 * Server-side paginated query for Admin Audit Logs with search & filters
 */
export async function fetchAdminAuditLogs({ search = "", actionType = "all", page = 1, pageSize = 10 } = {}) {
  try {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("admin_audit_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    if (search.trim()) {
      const term = `%${search.trim()}%`;
      query = query.or(`action.ilike.${term},target_type.ilike.${term},reason.ilike.${term}`);
    }

    if (actionType !== "all" && actionType !== "All") {
      query = query.eq("action", actionType);
    }

    const { data: logs, count, error: logErr } = await query.range(from, to);

    if (logErr) {
      console.error("[AdminService] fetchAdminAuditLogs error:", logErr);
      return { data: [], totalCount: 0, page, totalPages: 0, error: logErr };
    }

    let auditLogsList = logs || [];
    const adminIds = Array.from(new Set(auditLogsList.map((l) => l.admin_id).filter(Boolean)));

    if (adminIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", adminIds);

      const profMap = new Map((profs || []).map((p) => [p.id, p]));

      auditLogsList = auditLogsList.map((l) => {
        const p = profMap.get(l.admin_id);
        return {
          ...l,
          admin_email: l.metadata?.admin_email || p?.email || "system@skillsync.com",
          admin_name: p ? displayUserName(p) : "Admin User",
        };
      });
    }

    const totalCount = count || auditLogsList.length;
    const totalPages = Math.ceil(totalCount / pageSize) || 1;

    return { data: auditLogsList, totalCount, page, totalPages, error: null };
  } catch (err) {
    console.error("[AdminService] fetchAdminAuditLogs exception:", err);
    return { data: [], totalCount: 0, page: 1, totalPages: 0, error: err };
  }
}


