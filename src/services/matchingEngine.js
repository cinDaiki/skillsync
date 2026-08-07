import { supabase } from "./supabase.js";
import { normalizeSkillName, normalizeDegree } from "./normalization.js";
import { SEMANTIC_MATCHING_CONFIG } from "./ai/semanticMatchingConfig.js";

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
    // Deduplicate array after normalization, handles both strings and rich objects
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
 * Generate Coursera recommendations for missing skills
 */
function getRecommendedCourses(missingSkills) {
  return missingSkills.slice(0, 5).map(skill => ({
    skill,
    provider: "Coursera",
    course: `${skill.charAt(0).toUpperCase() + skill.slice(1)} — Foundations & Masterclass`,
    link: `https://www.coursera.org/search?query=${encodeURIComponent(skill)}`
  }));
}

/**
 * Generate micro-credential recommendations for missing skills
 */
function getMicroCredentials(missingSkills) {
  const providers = ["Google", "Microsoft", "IBM", "Coursera", "LinkedIn Learning", "AWS", "Meta"];
  return missingSkills.slice(0, 4).map((skill, i) => ({
    skill,
    provider: providers[i % providers.length],
    badge: `${skill.charAt(0).toUpperCase() + skill.slice(1)} Professional Certificate`,
    link: `https://www.coursera.org/search?query=${encodeURIComponent(skill + " professional certificate")}`
  }));
}

/**
 * Parse certifications from candidate_profiles.certifications (JSONB array or CSV)
 */
function parseCertifications(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(c => (typeof c === "string" ? c : (c.name || "")).toLowerCase()).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.map(c => (typeof c === "string" ? c : (c.name || "")).toLowerCase()).filter(Boolean);
    } catch {
      return raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    }
  }
  return [];
}

/**
 * Core Algorithm: Compare a Candidate Profile against a Job Post
 * Weights: Skills 60% + Education 25% + Experience 15% + Certifications bonus up to +10 pts
 */
export function calculateMatch(candidate, job) {
  // Parse raw skills JSON to support both flat strings and rich skill objects
  let candidateSkillsRaw = [];
  if (candidate.skills) {
    try {
      candidateSkillsRaw = JSON.parse(candidate.skills);
      if (!Array.isArray(candidateSkillsRaw)) candidateSkillsRaw = [candidate.skills];
    } catch {
      candidateSkillsRaw = String(candidate.skills).split(",").map(s => s.trim());
    }
  }

  const jobSkills = parseAndNormalizeSkills(job.required_skills);

  // 1. Skills Match (60 pts)
  const matchedSkills = [];
  const missingSkills = [];
  let totalSkillScore = 0;

  const policy = SEMANTIC_MATCHING_CONFIG.scoringPolicy || { minimumConfidenceWeight: 0.5, confidenceScaling: true };

  const getCandSkillName = (s) => {
    if (s && typeof s === "object") {
      return normalizeSkillName(s.normalized || s.canonicalName || s.name || "");
    }
    return normalizeSkillName(s);
  };

  if (jobSkills.length === 0) {
    // No skills required — auto-pass
  } else {
    jobSkills.forEach(req => {
      const reqNorm = normalizeSkillName(req);
      const match = candidateSkillsRaw.find(c => {
        const candName = getCandSkillName(c);
        return candName.includes(reqNorm) || reqNorm.includes(candName);
      });

      if (match) {
        matchedSkills.push(req);
        if (typeof match === "object") {
          const confidence = match.confidenceScore !== undefined 
            ? match.confidenceScore / 100 
            : (match.confidence !== undefined ? match.confidence : 1.0);
          
          if (policy.confidenceScaling) {
            const weight = policy.minimumConfidenceWeight + (1 - policy.minimumConfidenceWeight) * confidence;
            totalSkillScore += Math.max(policy.minimumConfidenceWeight, Math.min(1.0, weight));
          } else {
            totalSkillScore += policy.minimumConfidenceWeight;
          }
        } else {
          totalSkillScore += 1.0;
        }
      } else {
        missingSkills.push(req);
      }
    });
  }

  let skillsPct = 100;
  if (jobSkills.length > 0) {
    skillsPct = (totalSkillScore / jobSkills.length) * 100;
  }
  const skillsScore = skillsPct * 0.60;

  // 2. Education Match (25 pts)
  let eduPct = 0;
  const candidateEduRaw = [candidate.course, candidate.degree, candidate.education_level].filter(Boolean).join(" ");
  const candidateEdu = normalizeDegree(candidateEduRaw);
  const jobEdu = normalizeDegree(job.required_education);
  const jobDesc = (job.description || "").toLowerCase();

  if (!jobEdu || jobEdu === "none") {
    eduPct = 100;
  } else if (candidateEdu.includes(jobEdu) || jobEdu.includes(candidateEdu)) {
    eduPct = 100;
  } else if (candidateEdu.length > 3 && jobDesc.includes(candidateEdu)) {
    eduPct = 80;
  } else if (candidateEdu) {
    eduPct = 40;
  }
  const educationScore = eduPct * 0.25;

  // 3. Experience Match (15 pts)
  let expPct = 0;
  const candidateExp = Number(candidate.years_experience) || 0;
  let requiredExp = 0;
  if (job.experience_required) {
    const m = String(job.experience_required).match(/\d+/);
    if (m) requiredExp = parseInt(m[0], 10);
  }

  if (requiredExp === 0) {
    expPct = 100;
  } else if (candidateExp >= requiredExp) {
    expPct = 100;
  } else if (candidateExp > 0) {
    expPct = Math.round((candidateExp / requiredExp) * 100);
  }
  const experienceScore = expPct * 0.15;

  // 4. Certifications / Micro-Credentials Bonus (up to +10 pts)
  const candidateCerts = parseCertifications(candidate.certifications);
  const jobDescLower = jobDesc;
  const jobTitle = (job.title || "").toLowerCase();
  let certBonus = 0;
  let matchedCerts = [];

  if (candidateCerts.length > 0) {
    candidateCerts.forEach(cert => {
      // Check if cert is relevant to job title or description
      const certWords = cert.split(" ").filter(w => w.length > 3);
      const isRelevant = certWords.some(w => jobDescLower.includes(w) || jobTitle.includes(w) ||
        jobSkills.some(skill => skill.includes(w) || w.includes(skill)));
      if (isRelevant) matchedCerts.push(cert);
    });
    // Bonus: up to 10 pts based on relevant certs
    if (matchedCerts.length >= 3) certBonus = 10;
    else if (matchedCerts.length === 2) certBonus = 7;
    else if (matchedCerts.length === 1) certBonus = 4;
    else if (candidateCerts.length > 0) certBonus = 2; // Has certs even if not directly relevant
  }

  // Final Match Score (max 100)
  const rawScore = skillsScore + educationScore + experienceScore + certBonus;
  const matchScore = Math.min(100, Math.round(rawScore));

  // Generate Reason dynamically
  let reason = "";
  if (skillsPct >= 80) reason += `Strong skill alignment — ${matchedSkills.length}/${jobSkills.length} required skills matched. `;
  else if (skillsPct >= 50) reason += `Moderate skill match — ${matchedSkills.length}/${jobSkills.length} required skills present. `;
  else if (skillsPct > 0) reason += `Partial skill overlap — ${matchedSkills.length}/${jobSkills.length} skills matched. Consider upskilling in: ${missingSkills.slice(0, 3).join(", ")}. `;
  else reason += `Required skills not yet in profile — ${missingSkills.slice(0, 3).join(", ")} recommended. `;

  if (eduPct === 100) reason += "Education requirement fully satisfied. ";
  else if (eduPct >= 40) reason += "Some education alignment found. ";

  if (expPct === 100) reason += "Meets or exceeds experience requirement. ";
  else if (expPct > 0) reason += `Experience is ${candidateExp} year(s) vs ${requiredExp} required. `;
  else if (requiredExp > 0) reason += "No work experience on record — entry-level advantage possible. ";

  if (matchedCerts.length > 0) reason += `Relevant certification(s): ${matchedCerts.slice(0, 2).join(", ")} add credibility. `;

  const recommendedCourses = getRecommendedCourses(missingSkills);
  const microCredentials = getMicroCredentials(missingSkills);

  return {
    match_score: matchScore,
    skills_score: Math.round(skillsPct),
    education_score: Math.round(eduPct),
    experience_score: Math.round(expPct),
    cert_bonus: certBonus,
    matching_skills: matchedSkills,
    missing_skills: missingSkills,
    matched_certs: matchedCerts,
    recommended_courses: recommendedCourses,
    micro_credentials: microCredentials,
    match_reason: reason.trim()
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

    console.log("Jobs Found", jobs.length);

    const upserts = [];

    for (const job of jobs) {
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
