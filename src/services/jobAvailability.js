/**
 * jobAvailability.js
 *
 * Centralized business logic for evaluating employer suspension and job availability.
 * Ensures strict consistency between Marketplace, Recommended Jobs, Semantic Matching,
 * Candidate Dashboard, and Application Submission.
 */

/**
 * Checks whether an employer profile is currently suspended.
 * Evaluates canonical `is_suspended` boolean and legacy `verification_status: "Suspended"`.
 *
 * @param {object|null} profile - Employer profile record
 * @returns {boolean} true if employer is suspended, false otherwise
 */
export function isEmployerSuspended(profile) {
  if (!profile) return false;
  return Boolean(
    profile.is_suspended === true ||
    profile.verification_status?.toLowerCase() === "suspended"
  );
}

/**
 * Evaluates whether an open job is available for new candidate discovery and applications.
 *
 * @param {object|null} job - Job record
 * @param {object|null} employerProfile - Profile record of the employer who posted the job
 * @returns {boolean} true if job is open and employer is not suspended
 */
export function isJobAvailableForDiscovery(job, employerProfile) {
  if (!job) return false;
  if (job.status !== "open") return false;
  if (isEmployerSuspended(employerProfile)) return false;
  return true;
}

/**
 * Batch-queries the database for suspended employer IDs from a list of candidate employer IDs.
 *
 * @param {object} supabaseClient - Supabase client instance
 * @param {string[]} employerIds - Array of employer user IDs
 * @returns {Promise<Set<string>>} Set of suspended employer IDs
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
      .select("id, is_suspended, verification_status")
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
 * @returns {boolean} true if recruitment is paused
 */
export function isRecruitmentTemporarilyPaused(employerProfile) {
  return isEmployerSuspended(employerProfile);
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
