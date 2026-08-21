import { supabase } from "./supabase.js";
import { normalizeSkillName, normalizeDegree } from "./normalization.js";
import { SEMANTIC_MATCHING_CONFIG } from "./ai/semanticMatchingConfig.js";
import { calculateJobFit } from "./ai/jobFitEngine.js";
import { fetchSuspendedEmployerIds, filterAvailableJobs } from "./jobAvailability.js";

/**
 * Normalizes an array or CSV string of skills into an array of lowercase strings
 */
export function parseAndNormalizeSkills(raw) {
  if (!raw) return [];
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      parsed = raw.split(",");
    }
  }
  if (Array.isArray(parsed)) {
    const normalized = parsed.map(s => {
      if (s && typeof s === "object") {
        return normalizeSkillName(s.normalized || s.canonicalName || s.name || "");
      }
      return normalizeSkillName(s);
    }).filter(Boolean);
    return Array.from(new Set(normalized));
  }
  return [];
}

/**
 * Single Authoritative Match Calculation wrapper around jobFitEngine.js
 */
export function calculateMatch(candidate = {}, job = {}) {
  const fitResult = calculateJobFit(candidate, job, 0.70);

  const recommendationStr = fitResult.strengths.length > 0
    ? `${fitResult.tier}: ${fitResult.strengths.join('; ')}`
    : `${fitResult.tier}: Alignment evaluated against role qualifications.`;

  return {
    match_score: fitResult.jobFitScore,
    match_status: fitResult.tier,
    skills_score: fitResult.breakdown.requiredSkillsScore,
    education_score: fitResult.breakdown.educationCompatibility,
    experience_score: fitResult.breakdown.experienceCompatibility,
    semantic_score: fitResult.breakdown.semanticRelevance,
    cert_bonus: fitResult.breakdown.credentialsScore || 0,
    matching_skills: fitResult.matchedSkills,
    missing_skills: fitResult.missingSkills,
    matched_certs: fitResult.matchedCertifications,
    recommended_courses: fitResult.recommendedMicrocredentials,
    micro_credentials: fitResult.recommendedMicrocredentials,
    match_reason: recommendationStr,
    breakdown: fitResult.breakdown,
    strengths: fitResult.strengths,
    gaps: fitResult.gaps
  };
}

/**
 * Notify High Match
 */
async function notifyHighMatch(candidateId, employerId, jobTitle, score) {
  if (score >= 80) {
    // Notify Job Seeker
    await supabase.from("notifications").insert([{
      user_id: candidateId,
      title: "🔥 High Match Job Found!",
      message: `You are a ${score}% match for ${jobTitle}. Check your recommendations!`,
      type: "job_match"
    }]);

    // Notify Employer
    await supabase.from("notifications").insert([{
      user_id: employerId,
      title: "✨ Top Candidate Found!",
      message: `A candidate matched ${score}% for your ${jobTitle} position.`,
      type: "job_match"
    }]);
  }
}

/**
 * Execute Match for a single Candidate against ALL active jobs
 */
export async function runMatchingForCandidate(userId) {
  try {
    console.log("Matching Started for candidate:", userId);

    const { data: profile } = await supabase.from("candidate_profiles").select("*").eq("user_id", userId).maybeSingle();
    if (!profile) {
      console.log("No candidate_profile found, aborting match.");
      return;
    }

    console.log("Candidate Skills", profile.skills);

    const { data: jobs } = await supabase.from("jobs").select("*").eq("status", "open");
    if (!jobs || jobs.length === 0) {
      console.log("No open jobs found.");
      return;
    }

    const employerIds = jobs.map((j) => j.employer_id).filter(Boolean);
    const suspendedSet = await fetchSuspendedEmployerIds(supabase, employerIds);
    const availableJobs = filterAvailableJobs(jobs, suspendedSet);
    if (availableJobs.length === 0) {
      console.log("No open jobs from non-suspended employers found.");
      return;
    }

    console.log("Jobs Found", availableJobs.length);

    const upserts = [];

    for (const job of availableJobs) {
      try {
        const matchResult = calculateMatch(profile, job);
        upserts.push({
          user_id: userId,
          job_id: job.id,
          // employer_id omitted — FK constraint may fail if employer has no profile row
          match_score: matchResult.match_score,
          skills_score: matchResult.skills_score,
          education_score: matchResult.education_score,
          experience_score: matchResult.experience_score,
          match_status: "Recommended",
          matching_skills: matchResult.matching_skills,
          missing_skills: matchResult.missing_skills,
          matched_certs: matchResult.matched_certs,
          recommended_courses: matchResult.recommended_courses,
          micro_credentials: matchResult.micro_credentials,
          match_reason: matchResult.match_reason,
          updated_at: new Date().toISOString()
        });
        // Fire notifications async
        notifyHighMatch(userId, job.employer_id, job.title, matchResult.match_score);
      } catch (jobErr) {
        console.warn(`Skipping job ${job.id} due to error:`, jobErr.message);
      }
    }

    if (upserts.length === 0) {
      console.log("No valid job matches to upsert.");
      return;
    }

    // Upsert — try with new columns first, fallback without if schema not updated
    const { error: upsertError } = await supabase
      .from("job_matches")
      .upsert(upserts, { onConflict: 'user_id,job_id' });

    if (upsertError) {
      console.warn("job_matches upsert failed, retrying without new columns:", upsertError.message);
      // Strip columns that may not exist yet
      const fallbackUpserts = upserts.map(({ micro_credentials, matched_certs, employer_id, ...rest }) => rest);
      const { error: retryError } = await supabase
        .from("job_matches")
        .upsert(fallbackUpserts, { onConflict: 'user_id,job_id' });
      if (retryError) {
        console.error("job_matches fallback upsert also failed:", retryError.message);
      } else {
        console.log(`Matching engine: saved ${fallbackUpserts.length} matches (fallback mode).`);
      }
    } else {
      console.log(`Matching engine ran for candidate ${userId}, saved ${upserts.length} matches.`);
    }
  } catch (err) {
    console.error("Matching engine error:", err);
  }
}

/**
 * Execute Match for a single Job against ALL candidates
 */
export async function runMatchingForJob(jobId) {
  try {
    const { data: job } = await supabase.from("jobs").select("*").eq("id", jobId).maybeSingle();
    if (!job) return;

    const { data: candidates } = await supabase.from("candidate_profiles").select("*");
    if (!candidates || candidates.length === 0) return;

    const upserts = [];

    for (const candidate of candidates) {
      try {
        const matchResult = calculateMatch(candidate, job);
        upserts.push({
          user_id: candidate.user_id,
          job_id: job.id,
          // employer_id omitted — FK constraint may fail if employer has no profile row
          match_score: matchResult.match_score,
          skills_score: matchResult.skills_score,
          education_score: matchResult.education_score,
          experience_score: matchResult.experience_score,
          match_status: "Recommended",
          matching_skills: matchResult.matching_skills,
          missing_skills: matchResult.missing_skills,
          matched_certs: matchResult.matched_certs,
          recommended_courses: matchResult.recommended_courses,
          micro_credentials: matchResult.micro_credentials,
          match_reason: matchResult.match_reason,
          updated_at: new Date().toISOString()
        });
        notifyHighMatch(candidate.user_id, job.employer_id, job.title, matchResult.match_score);
      } catch (candidateErr) {
        console.warn(`Skipping candidate ${candidate.user_id}:`, candidateErr.message);
      }
    }

    if (upserts.length === 0) return;

    const { error: upsertJobError } = await supabase
      .from("job_matches")
      .upsert(upserts, { onConflict: 'user_id,job_id' });

    if (upsertJobError) {
      console.warn("job upsert failed, trying fallback:", upsertJobError.message);
      const fallback = upserts.map(({ micro_credentials, matched_certs, employer_id, ...rest }) => rest);
      const { error: retryErr } = await supabase.from("job_matches").upsert(fallback, { onConflict: 'user_id,job_id' });
      if (retryErr) console.error("job_matches fallback (job) failed:", retryErr.message);
      else console.log(`Matched job ${jobId}: ${fallback.length} candidates (fallback).`);
    } else {
      console.log(`Matched job ${jobId}: ${upserts.length} candidates.`);
    }
  } catch (err) {
    console.error("Matching engine error:", err);
  }
}
