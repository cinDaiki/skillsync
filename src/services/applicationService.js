import { supabase } from "./supabase.js";
import { getResume } from "./api.js";

function withTimeout(promise, ms = 6000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Request timed out")), ms)
    ),
  ]);
}

const SKIP_SNAPSHOT_SYNC_KEY = "skillsync_skip_snapshot_sync";

function parseSnapshot(raw) {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw;
}

export function emailToDisplayName(email) {
  if (!email) return "Unnamed Applicant";
  const local = email.split("@")[0] || "";
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || "Unnamed Applicant";
}

export function resolveApplicantIdentity(app) {
  const snapshot = parseSnapshot(app?.applicant_snapshot);
  const profile = app?.profiles || {};

  const email =
    profile.email?.trim() ||
    snapshot.email?.trim() ||
    app?.applicant_email?.trim() ||
    "";

  const fullName =
    profile.full_name?.trim() ||
    snapshot.full_name?.trim() ||
    "";

  const displayName = fullName || emailToDisplayName(email);
  const displayEmail = email || "No email";

  return {
    displayName,
    displayEmail,
    avatarLetter: displayName.charAt(0).toUpperCase(),
  };
}

export async function buildApplicantSnapshot(userId) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, contact_number, skills, education, work_experience, certifications, verification_status")
    .eq("id", userId)
    .maybeSingle();

  const { data: { session } } = await supabase.auth.getSession();
  const authEmail = session?.user?.id === userId ? session.user.email || "" : "";

  const { data: resume } = await getResume(userId);

  return {
    full_name: profile?.full_name?.trim() || "",
    email: profile?.email?.trim() || authEmail,
    contact_number: profile?.contact_number || "",
    skills: profile?.skills || "",
    education: profile?.education || null,
    work_experience: profile?.work_experience || null,
    certifications: profile?.certifications || null,
    verification_status: profile?.verification_status || null,
    resume: resume?.file_url
      ? {
          file_url: resume.file_url,
          file_name: resume.file_name || resume.name || "Resume",
          file_size: resume.file_size || null,
          created_at: resume.created_at || null,
        }
      : null,
  };
}

export async function syncApplicantSnapshot(userId) {
  if (!userId || sessionStorage.getItem(SKIP_SNAPSHOT_SYNC_KEY)) {
    return { error: null };
  }

  try {
    const snapshot = await buildApplicantSnapshot(userId);
    const { data: apps } = await supabase
      .from("applications")
      .select("id")
      .eq("applicant_id", userId);

    if (!apps?.length) return { error: null };

    for (const app of apps) {
      const { error } = await withTimeout(
        supabase
          .from("applications")
          .update({ applicant_snapshot: snapshot })
          .eq("id", app.id)
      );

      if (error) {
        const msg = (error.message || "").toLowerCase();
        if (
          msg.includes("applicant_snapshot") ||
          msg.includes("column") ||
          error.status === 400 ||
          error.code === "PGRST204"
        ) {
          sessionStorage.setItem(SKIP_SNAPSHOT_SYNC_KEY, "1");
          return { error: null };
        }
      }
    }

    return { error: null };
  } catch (err) {
    console.warn("Applicant snapshot sync skipped:", err.message);
    return { error: null };
  }
}

export async function applyForJobWithSnapshot(jobId, applicantId) {
  let realJobId = jobId;
  let realApplicantId = applicantId;

  const { data: { session } } = await supabase.auth.getSession();
  const currentUserId = session?.user?.id || null;

  if (realJobId === currentUserId && realApplicantId && realApplicantId !== currentUserId) {
    realJobId = applicantId;
    realApplicantId = jobId;
  }
  if (!realApplicantId) {
    realApplicantId = currentUserId;
  }

  // Central Enforcement: Fetch candidate profile verification_status & is_suspended
  if (realApplicantId) {
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("verification_status, is_suspended")
      .eq("id", realApplicantId)
      .maybeSingle();

    if (profileErr) {
      console.warn("[ApplicationService] Profile fetch warning:", profileErr.message);
    }

    if (profile?.is_suspended) {
      const err = new Error("ACCOUNT_SUSPENDED: Your account has been suspended by an administrator. Application locked.");
      err.code = "ACCOUNT_SUSPENDED";
      return { data: null, error: err };
    }

    const vStatus = profile?.verification_status || "Pending Verification";
    const isVerified = vStatus === "Verified" || vStatus === "Approved";

    if (!isVerified) {
      const err = new Error(
        vStatus === "Under Review"
          ? "IDENTITY_VERIFICATION_REQUIRED: Your identity verification is under administrator review. You can apply once approved."
          : "IDENTITY_VERIFICATION_REQUIRED: Your identity must be verified before applying to jobs. Please complete ID verification in your Profile."
      );
      err.code = "IDENTITY_VERIFICATION_REQUIRED";
      err.verificationStatus = vStatus;
      return { data: null, error: err };
    }
  }

  const snapshot = await buildApplicantSnapshot(realApplicantId);

  const payload = {
    job_id: realJobId,
    applicant_id: realApplicantId,
    status: "applied",
    applicant_snapshot: snapshot,
  };

  let { data, error } = await supabase
    .from("applications")
    .insert([payload])
    .select()
    .maybeSingle();

  if (error?.message?.includes("applicant_snapshot")) {
    ({ data, error } = await supabase
      .from("applications")
      .insert([{
        job_id: realJobId,
        applicant_id: realApplicantId,
        status: "applied",
      }])
      .select()
      .maybeSingle());
  }

  return { data, error };
}

export function enrichApplicationRecord(app) {
  const snapshot = parseSnapshot(app?.applicant_snapshot);
  const snapshotResume = snapshot.resume || null;

  const profileFromJoin = app.profiles || null;
  const profileFromSnapshot =
    snapshot.full_name || snapshot.email
      ? {
          full_name: snapshot.full_name || "",
          email: snapshot.email || "",
          contact_number: snapshot.contact_number || "",
          skills: snapshot.skills || "",
          education: snapshot.education || null,
          work_experience: snapshot.work_experience || null,
          certifications: snapshot.certifications || null,
          verification_status: snapshot.verification_status || null,
        }
      : null;

  const profiles = profileFromJoin || profileFromSnapshot;

  // IMPORTANT: Prioritize submitted resume snapshot captured at application time over current candidate upload
  const resumeFromSnapshot = snapshotResume?.file_url
    ? {
        file_url: snapshotResume.file_url,
        file_name: snapshotResume.file_name || "Resume",
        file_size: snapshotResume.file_size || null,
        created_at: snapshotResume.created_at || null,
      }
    : null;
  const resumeFromJoin = app.resume?.file_url ? app.resume : null;
  const resume = resumeFromSnapshot || resumeFromJoin;

  const identity = resolveApplicantIdentity({
    ...app,
    applicant_snapshot: snapshot,
    profiles: profiles
      ? {
          ...profiles,
          full_name: profiles.full_name || snapshot.full_name || "",
          email: profiles.email || snapshot.email || "",
        }
      : profileFromSnapshot,
    resume,
  });

  return {
    ...app,
    profiles: {
      ...(profiles || {}),
      full_name: identity.displayName,
      email: identity.displayEmail,
    },
    resume,
    displayName: identity.displayName,
    displayEmail: identity.displayEmail,
    avatarLetter: identity.avatarLetter,
  };
}

export async function fetchEmployerApplicants(employerId) {
  try {
    const { data: jobs, error: jobsError } = await supabase
      .from("jobs")
      .select("id, title, employment_type, location, required_skills")
      .eq("employer_id", employerId);

    if (!jobsError && jobs && jobs.length > 0) {
      const jobIds = jobs.map((j) => j.id);
      const jobMap = Object.fromEntries(jobs.map((j) => [j.id, j]));

      const { data: appsData, error: appsError } = await supabase
        .from("applications")
        .select("*")
        .in("job_id", jobIds)
        .order("created_at", { ascending: false });

      if (!appsError && appsData) {
        const apps = appsData;
        const applicantIds = [...new Set(apps.map((a) => a.applicant_id).filter(Boolean))];
        let profileMap = {};
        let resumeMap = {};

        if (applicantIds.length > 0) {
          const { data: profilesData } = await supabase
            .from("profiles")
            .select("id, full_name, email, contact_number, address, skills, education, work_experience, certifications, verification_status")
            .in("id", applicantIds);
          (profilesData || []).forEach((p) => {
            profileMap[p.id] = p;
          });

          const { data: resumesData } = await supabase
            .from("resumes")
            .select("*")
            .in("applicant_id", applicantIds);
          (resumesData || []).forEach((r) => {
            resumeMap[r.applicant_id] = r;
          });
        }

        return {
          data: apps.map((app) =>
            enrichApplicationRecord({
              ...app,
              jobs: jobMap[app.job_id] || null,
              profiles: profileMap[app.applicant_id] || null,
              resume: resumeMap[app.applicant_id] || null,
              applicant_email: profileMap[app.applicant_id]?.email || null,
            })
          ),
          error: null,
        };
      }
    }
  } catch (err) {
    console.warn("Direct fetchEmployerApplicants fell back to RPC:", err.message);
  }

  // Fallback to secure RPC get_employer_applicants
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "get_employer_applicants"
  );

  if (!rpcError && Array.isArray(rpcData)) {
    return {
      data: rpcData.map((row) =>
        enrichApplicationRecord({
          id: row.id,
          job_id: row.job_id,
          applicant_id: row.applicant_id,
          status: row.status,
          created_at: row.created_at,
          updated_at: row.updated_at || null,
          match_score: row.match_score || null,
          recruiter_notes: row.recruiter_notes || null,
          reject_reason: row.reject_reason || null,
          applicant_snapshot: row.applicant_snapshot,
          jobs: {
            title: row.job_title,
            employment_type: row.employment_type,
            location: row.job_location,
          },
          profiles: {
            full_name: row.full_name,
            email: row.email,
            contact_number: row.contact_number,
            skills: row.skills,
          },
          resume: row.resume_file_url
            ? {
                file_url: row.resume_file_url,
                file_name: row.resume_file_name,
                file_size: row.resume_file_size,
                created_at: row.resume_created_at,
              }
            : null,
          applicant_email: row.email,
        })
      ),
      error: null,
    };
  }

  return { data: [], error: rpcError || null };
}

/**
 * Fetch a single application record for an employer by application.id
 * Enforces ownership: only returns data if the job belongs to employerId
 */
export async function fetchEmployerApplicantById(applicationId, employerId = null) {
  if (!applicationId) {
    return { data: null, error: new Error("Missing applicationId") };
  }

  try {
    let targetEmployerId = employerId;
    if (!targetEmployerId) {
      const { data: { session } } = await supabase.auth.getSession();
      targetEmployerId = session?.user?.id;
    }

    if (!targetEmployerId) {
      return { data: null, error: new Error("Unauthorized: No active session") };
    }

    const { data: appData, error: appError } = await supabase
      .from("applications")
      .select("*, jobs(id, title, employment_type, location, required_skills, employer_id)")
      .eq("id", applicationId)
      .maybeSingle();

    if (appError || !appData) {
      return { data: null, error: appError || new Error("Application not found") };
    }

    // Client-side defense + RLS alignment: Ensure job belongs to this employer
    if (appData.jobs?.employer_id !== targetEmployerId) {
      return { data: null, error: new Error("Unauthorized access to applicant record") };
    }

    let profile = null;
    let resume = null;

    if (appData.applicant_id) {
      const { data: profData } = await supabase
        .from("profiles")
        .select("id, full_name, email, contact_number, address, skills, education, work_experience, certifications, verification_status")
        .eq("id", appData.applicant_id)
        .maybeSingle();
      profile = profData;

      const { data: resumeData } = await supabase
        .from("resumes")
        .select("*")
        .eq("applicant_id", appData.applicant_id)
        .maybeSingle();
      resume = resumeData;
    }

    const enriched = enrichApplicationRecord({
      ...appData,
      profiles: profile,
      resume: resume,
      applicant_email: profile?.email || null,
    });

    return { data: enriched, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

export function normalizeApplicantRecord(app) {
  return enrichApplicationRecord(app);
}
