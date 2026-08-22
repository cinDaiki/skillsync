/**
 * jobAvailability.js
 *
 * Centralized business logic for evaluating employer suspension and job availability.
 * Ensures strict consistency between Marketplace, Recommended Jobs, Semantic Matching,
 * Candidate Dashboard, and Application Submission.
 */

import { isAccountSuspended } from "./adminService.js";

/**
 * Checks whether an employer profile is currently effectively suspended.
 * Evaluates canonical `is_suspended`, `suspension_expires_at` (automatic expiry),
 * and legacy `verification_status: "Suspended"`.
 *
 * @param {object|null} profile - Employer profile record
 * @param {Date|string|number} [now=new Date()] - Reference time
 * @returns {boolean} true if employer is currently suspended, false otherwise
 */
export function isEmployerSuspended(profile, now = new Date()) {
  return isAccountSuspended(profile, now);
}

/**
 * Evaluates whether an open job is available for new candidate discovery and applications.
 *
 * @param {object|null} job - Job record
 * @param {object|null} employerProfile - Profile record of the employer who posted the job
 * @param {Date|string|number} [now=new Date()] - Reference time
 * @returns {boolean} true if job is open and employer is not suspended
 */
export function isJobAvailableForDiscovery(job, employerProfile, now = new Date()) {
  if (!job) return false;
  if (job.status !== "open") return false;
  if (isEmployerSuspended(employerProfile, now)) return false;
  return true;
}

/**
 * Batch-queries the database for suspended employer IDs from a list of candidate employer IDs.
 *
 * @param {object} supabaseClient - Supabase client instance
 * @param {string[]} employerIds - Array of employer user IDs
 * @returns {Promise<Set<string>>} Set of effectively suspended employer IDs
 */
export async function fetchSuspendedEmployerIds(supabaseClient, employerIds) {
  if (!supabaseClient || !employerIds || employerIds.length === 0) {
    return new Set();
  }
  const uniqueIds = [...new Set(employerIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Set();

  try {
    // 1. Try secure RPC first (bypasses candidate RLS restriction on profiles table)
    const { data: rpcData, error: rpcError } = await supabaseClient
      .rpc("get_suspended_employer_ids", { p_employer_ids: uniqueIds });

    if (!rpcError && Array.isArray(rpcData)) {
      return new Set(rpcData.map(r => (typeof r === 'object' && r ? r.id : r)));
    }

    // 2. Fallback to direct profiles table query
    const { data, error } = await supabaseClient
      .from("profiles")
      .select("id, is_suspended, verification_status, suspension_expires_at")
      .in("id", uniqueIds);

    if (error) {
      console.warn("[JobAvailability] fetchSuspendedEmployerIds query error:", error.message);
      return new Set();
    }

    const set = new Set();
    (data || []).forEach((p) => {
      if (isEmployerSuspended(p)) {
        set.add(p.id);
      }
    });

    return set;
  } catch (err) {
    console.error("[JobAvailability] fetchSuspendedEmployerIds unexpected error:", err);
    return new Set();
  }
}

/**
 * Checks whether an existing recruitment process is temporarily paused due to employer suspension.
 *
 * @param {object|null} employerProfile - Employer profile record
 * @param {Date|string|number} [now=new Date()] - Reference time
 * @returns {boolean} true if recruitment is paused
 */
export function isRecruitmentTemporarilyPaused(employerProfile, now = new Date()) {
  return isEmployerSuspended(employerProfile, now);
}

/**
 * Filters a list of jobs, retaining only open jobs from non-suspended employers.
 *
 * @param {Array<object>} jobs - List of job records
 * @param {Set<string>|Array<string>} suspendedEmployerIdSet - Set or array of suspended employer IDs
 * @returns {Array<object>} Filtered list of available jobs
 */
export function filterAvailableJobs(jobs, suspendedEmployerIdSet) {
  if (!Array.isArray(jobs)) return [];
  const set = suspendedEmployerIdSet instanceof Set
    ? suspendedEmployerIdSet
    : new Set(suspendedEmployerIdSet || []);

  return jobs.filter((job) => job && job.status === "open" && !set.has(job.employer_id));
}
