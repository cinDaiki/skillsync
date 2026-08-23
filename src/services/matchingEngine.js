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
 * Execute Match for a single Candidate against ALL active jobs
 * Uses server-authoritative compute_and_save_job_match RPC.
 * Fails closed without direct table upsert fallbacks.
 */
export async function runMatchingForCandidate(userId) {
  try {
    console.log("Matching Started for candidate:", userId);

    const { data: profile } = await supabase.from("candidate_profiles").select("*").eq("user_id", userId).maybeSingle();
    if (!profile) {
      console.log("No candidate_profile found, aborting match.");
      return;
    }

    const { data: jobs } = await supabase.from("jobs").select("id, status, employer_id").eq("status", "open");
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

    console.log("Available Jobs for Server Matching:", availableJobs.length);

    let successCount = 0;
    for (const job of availableJobs) {
      try {
        const { data, error } = await supabase.rpc("compute_and_save_job_match", {
          p_job_id: job.id
        });
        if (!error && data?.success) {
          successCount++;
        } else if (error) {
          console.warn(`[MatchingEngine] compute_and_save_job_match failed for job ${job.id}:`, error.message);
        }
      } catch (jobErr) {
        console.warn(`[MatchingEngine] compute_and_save_job_match exception for job ${job.id}:`, jobErr.message);
      }
    }

    console.log(`Matching engine: computed and stored ${successCount} server-authoritative matches for candidate ${userId}.`);
  } catch (err) {
    console.error("Matching engine error:", err);
  }
}

/**
 * Execute Match for a single Job against ALL candidates
 * Employer matching is read-only / server-evaluated; employers do not directly mutate job_matches.
 */
export async function runMatchingForJob(jobId) {
  try {
    console.log(`Matching engine: candidate matching for job ${jobId} is handled server-side.`);
  } catch (err) {
    console.error("Matching engine error:", err);
  }
}
