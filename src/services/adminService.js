import { supabase } from "./supabase.js";

function isJobSeeker(role) {
  return role === "candidate" || role === "job_seeker";
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

    console.log("[AdminService] employer_profiles data:", employerProfiles);
    console.log("[AdminService] employer_profiles error:", employerProfilesError);

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
          console.log("[AdminService] FINAL merged employer:", mergedEmployer);
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

export async function fetchAdminJobs() {
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "admin_get_all_jobs"
  );

  if (!rpcError && Array.isArray(rpcData)) {
    return {
      data: rpcData.map((job) => ({
        ...job,
        profiles: {
          full_name: job.employer_name,
          email: job.employer_email,
        },
      })),
      error: null,
    };
  }

  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false });

  return { data: data || [], error: rpcError || error };
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
 * Updates employer verification status with admin reason and audit log
 */
export async function updateEmployerVerification(userId, status, reasonNote = "") {
  console.log(`[AdminService] Diagnostic: Attempting updateEmployerVerification for Target User ID: ${userId}, Status: ${status}, Reason: "${reasonNote}"`);

  try {
    const { error: rpcError } = await supabase.rpc("admin_update_employer_verification", {
      target_user_id: userId,
      new_status: status,
      reason_note: reasonNote || null,
    });

    if (!rpcError) {
      console.log(`[AdminService] Diagnostic: RPC admin_update_employer_verification succeeded for ${userId}`);
      return { error: null };
    }

    console.warn("[AdminService] RPC admin_update_employer_verification returned error or 404:", {
      message: rpcError.message,
      code: rpcError.code,
      details: rpcError.details,
      hint: rpcError.hint,
      status: rpcError.status
    });

    // Direct table fallback for authenticated admin user
    const profileUpdates = {
      verification_status: status,
      updated_at: new Date().toISOString()
    };
    if (reasonNote) profileUpdates.verification_reason = reasonNote;

    console.log(`[AdminService] Diagnostic: Executing direct PATCH fallback on public.profiles for ID ${userId} with payload:`, profileUpdates);

    const { error: tableError } = await supabase
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
            error: new Error(`Unable to approve employer (${retryErr.message}). Please execute supabase/phase_8_4_moderation.sql in your Supabase SQL Editor.`)
          };
        }
      } else if (!tableError.message?.includes("fetch failed")) {
        return {
          error: new Error(`Unable to approve employer (${tableError.message || "HTTP 400 Bad Request"}). Please ensure supabase/phase_8_4_moderation.sql has been executed.`)
        };
      }
    }

    // Also update employer_profiles table
    const { error: empError } = await supabase
      .from("employer_profiles")
      .update({ verification_status: status, updated_at: new Date().toISOString() })
      .eq("id", userId);

    if (empError && !empError.message?.includes("fetch failed")) {
      console.warn("[AdminService] public.employer_profiles PATCH Update Warning:", empError);
    }

    return { error: null };
  } catch (err) {
    console.error("[AdminService] updateEmployerVerification exception:", err);
    return { error: new Error("Unable to approve employer. Verification service is currently unavailable.") };
  } finally {
    // Log audit trail
    await logAdminAction({
      action: status === "Approved" || status === "Verified" ? "EMPLOYER_APPROVED" : status === "Rejected" ? "EMPLOYER_REJECTED" : "EMPLOYER_SUSPENDED",
      targetType: "employer",
      targetId: userId,
      reason: reasonNote
    }).catch(() => {});
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
  } catch (err) {
    console.warn("[AdminService] moderateJobStatus offline mode fallback.");
  }

  // Audit log
  await logAdminAction({
    action: status === "open" ? "JOB_APPROVED" : status === "rejected" ? "JOB_REJECTED" : "JOB_SUSPENDED",
    targetType: "job",
    targetId: jobId,
    reason: reasonNote
  }).catch(() => {});

  return { error: null };
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

  await supabase.from("admin_audit_logs").insert([payload]).catch(() => {});
}

/**
 * Fetches admin audit logs
 */
export async function fetchAdminAuditLogs() {
  const { data, error } = await supabase
    .from("admin_audit_logs")
    .select("*, profiles:admin_id(full_name, email)")
    .order("created_at", { ascending: false });

  return { data: data || [], error };
}


