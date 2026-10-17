/**
 * src/services/resumeBuilderService.js
 *
 * Authoritative Canonical Resume Service for SkillSync Form-First Resume Builder.
 * Manages the structured resume data lifecycle:
 * 1. Single source of truth persistence (candidate_form_resumes with resilient fallbacks).
 * 2. Profile projections (profiles, candidate_profiles, resumes).
 * 3. Historical uploaded document preservation.
 * 4. Canonical text generation for AI embeddings and job matching.
 * 5. Factual professional summary generation (zero fabrication).
 * 6. Resume readiness / completeness metrics.
 */

import { supabase } from "./supabase.js";
import { normalizeSkillName, normalizeDegree } from "./normalization.js";
import { runMatchingForCandidate } from "./matchingEngine.js";
import { generateAndStoreResumeEmbedding } from "./ai/embeddingService.js";
import { runSemanticMatchingForCandidate } from "./ai/semanticMatchingService.js";
import { syncApplicantSnapshot } from "./applicationService.js";

export const RESUME_VERSION = 1;

export const EDUCATION_LEVEL_OPTIONS = [
  "No formal schooling to report",
  "Elementary education",
  "Junior High School",
  "Senior High School",
  "High school under the old curriculum",
  "Vocational or technical training (TESDA or equivalent)",
  "College/university undergraduate studies",
  "College/university graduate",
  "Postgraduate education",
  "Currently studying",
  "Other"
];

export const EDUCATION_STATUS_OPTIONS = [
  "Completed",
  "Currently Studying",
  "Attended but Did Not Complete"
];

export const WORK_TYPE_OPTIONS = [
  "Employment",
  "Internship / OJT",
  "Apprenticeship",
  "Practicum / Clinical Training",
  "Freelance / Self-employed",
  "Part-time",
  "Volunteer / Community Service",
  "Family Business / Informal Work",
  "Seasonal / Contract Work",
  "Other"
];

export const DEFAULT_RESUME_DATA = {
  version: RESUME_VERSION,
  updatedAt: null,
  personalDetails: {
    fullName: "",
    email: "",
    phone: "",
    city: "",
    region: "",
    linkedin: "",
    github: "",
    portfolio: "",
    otherLinks: []
  },
  education: {
    noFormalEducation: false,
    entries: []
  },
  skills: [],
  experience: {
    noExperience: false,
    entries: []
  },
  projectsAndCredentials: {
    projects: [],
    certifications: [],
    training: [],
    awards: []
  },
  summary: ""
};

/**
 * Concurrency tracking to prevent older save requests from overwriting newer edits.
 */
let _lastSaveSequence = 0;

/**
 * Calculates Resume Readiness (Section Completeness) out of 6 sections.
 * Distinct from ATS Compatibility and Job-Fit Score!
 */
export function calculateResumeReadiness(data) {
  if (!data) return { completedSections: 0, totalSections: 6, percentage: 0, details: {} };

  const personalComplete = Boolean(data.personalDetails?.fullName?.trim());
  const eduComplete = Boolean(
    data.education?.noFormalEducation ||
    (Array.isArray(data.education?.entries) && data.education.entries.length > 0)
  );
  const skillsComplete = Boolean(Array.isArray(data.skills) && data.skills.length > 0);
  const expComplete = Boolean(
    data.experience?.noExperience ||
    (Array.isArray(data.experience?.entries) && data.experience.entries.length > 0)
  );
  // Projects & Credentials is an optional section, considered complete once candidate visits or adds items
  const projComplete = Boolean(
    (data.projectsAndCredentials?.projects?.length > 0) ||
    (data.projectsAndCredentials?.certifications?.length > 0) ||
    (data.projectsAndCredentials?.training?.length > 0) ||
    (data.projectsAndCredentials?.awards?.length > 0) ||
    data._projectsSectionReviewed
  );
  const reviewComplete = personalComplete && eduComplete;

  const sections = [
    { id: "personal", label: "Personal Details", isComplete: personalComplete, required: true },
    { id: "education", label: "Education & Training", isComplete: eduComplete, required: true },
    { id: "skills", label: "Skills", isComplete: skillsComplete, required: false },
    { id: "experience", label: "Experience", isComplete: expComplete, required: false },
    { id: "projects", label: "Projects & Credentials", isComplete: projComplete, required: false },
    { id: "review", label: "Review Resume", isComplete: reviewComplete, required: true }
  ];

  const completedCount = sections.filter(s => s.isComplete).length;
  const percentage = Math.round((completedCount / sections.length) * 100);

  return {
    completedSections: completedCount,
    totalSections: sections.length,
    percentage,
    sections,
    canFinalize: personalComplete && eduComplete
  };
}

/**
 * Generates an accurate, honest Professional Summary strictly from user-provided facts.
 * Never fabricates employers, technologies, degrees, years of experience, or credentials.
 */
export function generateProfessionalSummary(data) {
  if (!data) return "";

  const parts = [];

  // 1. Education clause (truthful distinction - zero fallback to completed)
  const eduEntries = data.education?.entries || [];
  const completedEdu = eduEntries.find(e => e.status === "Completed");
  const studyingEdu = eduEntries.find(e => e.status === "Currently Studying");
  const incompleteEdu = eduEntries.find(e => e.status === "Attended but Did Not Complete");

  if (completedEdu && completedEdu.courseOrProgram) {
    parts.push(`Graduate in ${completedEdu.courseOrProgram}`);
  } else if (studyingEdu && studyingEdu.courseOrProgram) {
    parts.push(`Student currently pursuing ${studyingEdu.courseOrProgram}`);
  } else if (incompleteEdu && incompleteEdu.courseOrProgram) {
    parts.push(`Academic background in ${incompleteEdu.courseOrProgram}`);
  } else if (completedEdu && completedEdu.level) {
    parts.push(`Graduate with ${completedEdu.level}`);
  } else if (studyingEdu && studyingEdu.level) {
    parts.push(`Student pursuing ${studyingEdu.level}`);
  } else if (incompleteEdu && incompleteEdu.level) {
    parts.push(`Foundational studies in ${incompleteEdu.level}`);
  }

  // 2. Experience clause
  const expEntries = data.experience?.entries || [];
  if (data.experience?.noExperience || expEntries.length === 0) {
    parts.push("motivated to begin a career and apply practical skills to organizational goals");
  } else {
    const roles = Array.from(new Set(expEntries.map(e => e.title).filter(Boolean)));
    if (roles.length > 0) {
      parts.push(`experienced as ${roles.slice(0, 2).join(" and ")}`);
    } else {
      parts.push("with professional and practical work experience");
    }
  }

  // 3. Core skills clause
  const skillsList = (data.skills || []).map(s => (typeof s === "string" ? s : s.name)).filter(Boolean);
  if (skillsList.length > 0) {
    const highlightedSkills = skillsList.slice(0, 6).join(", ");
    parts.push(`skilled in ${highlightedSkills}`);
  }

  // 4. Projects/Credentials clause
  const certCount = data.projectsAndCredentials?.certifications?.length || 0;
  const projCount = data.projectsAndCredentials?.projects?.length || 0;
  if (certCount > 0 && projCount > 0) {
    parts.push("complemented by demonstrated project experience and professional credentials");
  } else if (projCount > 0) {
    parts.push("with hands-on portfolio and project work");
  } else if (certCount > 0) {
    parts.push("with verified training and certifications");
  }

  if (parts.length === 0) {
    return "Dedicated professional seeking opportunities to contribute skills and collaborate with dynamic teams.";
  }

  const rawSentence = parts.join(", ");
  const capitalized = rawSentence.charAt(0).toUpperCase() + rawSentence.slice(1);
  return `${capitalized}. Committed to continuous learning, strong work ethic, and delivering quality results.`;
}

/**
 * Builds canonical resume text strictly from entered data for AI embeddings and ATS evaluation.
 */
export function buildCanonicalResumeText(data) {
  if (!data) return "";

  const sections = [];

  // Personal
  const name = data.personalDetails?.fullName || "";
  const contact = [
    data.personalDetails?.email,
    data.personalDetails?.phone,
    data.personalDetails?.city || data.personalDetails?.region
  ].filter(Boolean).join(" | ");

  sections.push(`Candidate: ${name}\nContact: ${contact}`);

  // Summary
  if (data.summary?.trim()) {
    sections.push(`Summary: ${data.summary.trim()}`);
  }

  // Skills
  const skillNames = (data.skills || []).map(s => (typeof s === "string" ? s : s.name)).filter(Boolean);
  if (skillNames.length > 0) {
    sections.push(`Skills: ${skillNames.join(", ")}`);
  }

  // Education
  if (data.education?.noFormalEducation) {
    sections.push("Education: No formal schooling to report.");
  } else if (data.education?.entries?.length > 0) {
    const eduTexts = data.education.entries.map(e => {
      const dates = (e.startYear || e.endYear) ? ` (${e.startYear || ""} - ${e.endYear || "Present"})` : "";
      return `${e.level || "Education"}: ${e.institution || ""} ${e.courseOrProgram || ""} [Status: ${e.status || "Completed"}]${dates}`;
    });
    sections.push(`Education:\n${eduTexts.join("\n")}`);
  }

  // Experience
  if (data.experience?.noExperience) {
    sections.push("Experience: No formal work experience yet.");
  } else if (data.experience?.entries?.length > 0) {
    const expTexts = data.experience.entries.map(e => {
      const dates = (e.startDate || e.endDate) ? ` (${e.startDate || ""} - ${e.isCurrent ? "Present" : (e.endDate || "")})` : "";
      const resp = e.responsibilities ? ` Responsibilities: ${e.responsibilities}` : "";
      const ach = e.achievements ? ` Achievements: ${e.achievements}` : "";
      return `${e.title || "Position"} at ${e.organization || "Organization"} [${e.workType || "Employment"}]${dates}.${resp}${ach}`;
    });
    sections.push(`Experience:\n${expTexts.join("\n")}`);
  }

  // Projects & Credentials
  const p = data.projectsAndCredentials || {};
  if (p.projects?.length > 0) {
    const projTexts = p.projects.map(pr => `${pr.title}: ${pr.description || ""} ${pr.tools ? `(Tools: ${pr.tools})` : ""}`);
    sections.push(`Projects:\n${projTexts.join("\n")}`);
  }
  if (p.certifications?.length > 0) {
    const certTexts = p.certifications.map(c => `${c.name} by ${c.issuer || ""} (${c.issueDate || ""})`);
    sections.push(`Certifications:\n${certTexts.join("\n")}`);
  }
  if (p.training?.length > 0) {
    const trTexts = p.training.map(t => `${t.title} - ${t.provider || ""} (${t.dateOrYear || ""})`);
    sections.push(`Training:\n${trTexts.join("\n")}`);
  }
  if (p.awards?.length > 0) {
    const awTexts = p.awards.map(a => `${a.title} awarded by ${a.issuer || ""} (${a.year || ""})`);
    sections.push(`Awards:\n${awTexts.join("\n")}`);
  }

  return sections.join("\n\n");
}

/**
 * Loads canonical resume data for a candidate.
 * 1. Checks candidate_form_resumes table.
 * 2. If empty, safely prefills from profiles, candidate_profiles, and resumes.parsed_details.
 * 3. Preserves historical uploaded document metadata for non-intrusive display/download.
 */
export async function loadCanonicalResume(userId) {
  if (!userId) return { resumeData: DEFAULT_RESUME_DATA, historicalResume: null };

  let formResumeData = null;
  let historicalResume = null;

  try {
    // 1. Check dedicated form resumes table
    const { data: formRow, error: formErr } = await supabase
      .from("candidate_form_resumes")
      .select("resume_data, version, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (!formErr && formRow?.resume_data && Object.keys(formRow.resume_data).length > 0) {
      formResumeData = formRow.resume_data;
    }
  } catch (_) {
    // Graceful fallback if table is newly added or query fails
  }

  // 2. Fetch existing profiles, candidate_profiles, and resumes records
  const [{ data: profileRow }, { data: candProfRow }, { data: resumeRow }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("candidate_profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("resumes").select("*").eq("applicant_id", userId).maybeSingle()
  ]);

  if (resumeRow?.file_url) {
    historicalResume = {
      id: resumeRow.id,
      file_url: resumeRow.file_url,
      file_name: resumeRow.file_name || "Uploaded Resume",
      file_size: resumeRow.file_size,
      created_at: resumeRow.created_at,
      resume_score: resumeRow.resume_score,
      qualityAssessment: resumeRow.parsed_details?.qualityAssessment || null
    };
  }

  // If no structured form resume was found in candidate_form_resumes, check resumes.parsed_details
  if (!formResumeData && resumeRow?.parsed_details?.form_resume) {
    formResumeData = resumeRow.parsed_details.form_resume;
  }

  // If still no form resume data exists, safely prefill from account profile & parsed resume details
  if (!formResumeData) {
    const rawSocial = typeof profileRow?.social_links === "string"
      ? JSON.parse(profileRow.social_links || "{}")
      : (profileRow?.social_links || {});
    const rawPortfolio = typeof profileRow?.portfolio_links === "string"
      ? JSON.parse(profileRow.portfolio_links || "{}")
      : (profileRow?.portfolio_links || {});

    // Skills
    let skillsList = [];
    if (profileRow?.skills) {
      skillsList = profileRow.skills.split(",").map(s => s.trim()).filter(Boolean);
    } else if (resumeRow?.extracted_skills) {
      skillsList = resumeRow.extracted_skills.split(",").map(s => s.trim()).filter(Boolean);
    }

    // Education entries
    let eduEntries = [];
    if (Array.isArray(profileRow?.education) && profileRow.education.length > 0) {
      eduEntries = profileRow.education.map((e, idx) => ({
        id: e.id || `edu-${idx}`,
        institution: e.school || e.institution || "",
        level: e.degree || e.level || "College/university graduate",
        courseOrProgram: e.field || e.course || "",
        status: e.status || "Completed",
        startYear: e.startYear || e.start_year || "",
        endYear: e.endYear || e.end_year || "",
        courseworkAndAchievements: e.achievements || ""
      }));
    } else if (candProfRow?.degree || candProfRow?.course) {
      eduEntries = [{
        id: "edu-0",
        institution: "University / Institution",
        level: candProfRow.education_level || candProfRow.degree || "College/university graduate",
        courseOrProgram: candProfRow.course || "",
        status: "Completed",
        startYear: "",
        endYear: "",
        courseworkAndAchievements: ""
      }];
    }

    // Experience entries
    let expEntries = [];
    if (Array.isArray(profileRow?.work_experience) && profileRow.work_experience.length > 0) {
      expEntries = profileRow.work_experience.map((w, idx) => ({
        id: w.id || `exp-${idx}`,
        title: w.position || w.title || "",
        organization: w.company || w.organization || "",
        workType: w.type || "Employment",
        startDate: w.startDate || w.start_date || "",
        endDate: w.endDate || w.end_date || "",
        isCurrent: Boolean(w.current),
        responsibilities: w.description || w.responsibilities || "",
        achievements: ""
      }));
    }

    // Certifications
    let certEntries = [];
    if (Array.isArray(profileRow?.certifications) && profileRow.certifications.length > 0) {
      certEntries = profileRow.certifications.map((c, idx) => ({
        id: c.id || `cert-${idx}`,
        name: typeof c === "string" ? c : (c.name || "Certification"),
        issuer: c.issuer || c.authority || "",
        issueDate: c.date || c.issue_date || "",
        credentialId: c.credential_id || ""
      }));
    }

    formResumeData = {
      ...DEFAULT_RESUME_DATA,
      personalDetails: {
        fullName: profileRow?.full_name || "",
        email: profileRow?.email || "",
        phone: profileRow?.contact_number || "",
        city: profileRow?.address || "",
        region: "",
        linkedin: rawSocial.linkedinUrl || rawSocial.linkedin || "",
        github: rawSocial.githubUrl || rawSocial.github || "",
        portfolio: rawPortfolio.portfolioUrl || rawPortfolio.portfolio || "",
        otherLinks: []
      },
      education: {
        noFormalEducation: eduEntries.length === 0 && Boolean(profileRow?.no_formal_education),
        entries: eduEntries
      },
      skills: skillsList.map((s, idx) => ({
        id: `skill-${idx}`,
        name: s,
        category: "Core Skills"
      })),
      experience: {
        noExperience: expEntries.length === 0 && Boolean(profileRow?.no_experience),
        entries: expEntries
      },
      projectsAndCredentials: {
        projects: [],
        certifications: certEntries,
        training: [],
        awards: []
      },
      summary: ""
    };
  }

  // Ensure all sections exist in the returned structure
  const mergedData = {
    ...DEFAULT_RESUME_DATA,
    ...formResumeData,
    personalDetails: { ...DEFAULT_RESUME_DATA.personalDetails, ...(formResumeData.personalDetails || {}) },
    education: { ...DEFAULT_RESUME_DATA.education, ...(formResumeData.education || {}) },
    skills: Array.isArray(formResumeData.skills) ? formResumeData.skills : [],
    experience: { ...DEFAULT_RESUME_DATA.experience, ...(formResumeData.experience || {}) },
    projectsAndCredentials: { ...DEFAULT_RESUME_DATA.projectsAndCredentials, ...(formResumeData.projectsAndCredentials || {}) }
  };

  return { resumeData: mergedData, historicalResume };
}

/**
 * Parses user-provided date string into epoch milliseconds.
 * Supports "YYYY-MM-DD", "YYYY-MM", "YYYY", "Present", "Current", and standard date strings.
 */
export function parseDateToMs(dateStr, isEnd = false) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const trimmed = dateStr.trim();
  if (/^(present|current)$/i.test(trimmed)) {
    return Date.now();
  }

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d.getTime();
  }

  // YYYY-MM
  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    const [year, month] = trimmed.split("-").map(Number);
    if (isEnd) {
      return new Date(year, month, 0, 23, 59, 59, 999).getTime();
    } else {
      return new Date(year, month - 1, 1).getTime();
    }
  }

  // YYYY
  if (/^\d{4}$/.test(trimmed)) {
    const year = Number(trimmed);
    if (isEnd) {
      return new Date(year, 11, 31, 23, 59, 59, 999).getTime();
    } else {
      return new Date(year, 0, 1).getTime();
    }
  }

  const parsed = Date.parse(trimmed);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Calculates total years of experience strictly from dates by merging overlapping intervals.
 * Never fabricates years from the number of entries.
 * Returns:
 * - 0 if noExperience flag is true or no entries exist.
 * - null if entries exist but none have parseable dates (unknown/unspecified).
 * - number of years (rounded to 1 decimal place) if valid dates exist.
 */
export function calculateExperienceYears(experienceData) {
  if (!experienceData) return null;
  if (experienceData.noExperience === true) return 0;

  const entries = experienceData.entries || [];
  if (entries.length === 0) return 0;

  const intervals = [];
  let datesFound = 0;

  for (const item of entries) {
    const startMs = parseDateToMs(item.startDate, false);
    let endMs = null;
    if (item.isCurrent) {
      endMs = Date.now();
    } else if (item.endDate) {
      endMs = parseDateToMs(item.endDate, true);
    }

    if (startMs !== null) {
      datesFound++;
      const resolvedEnd = endMs !== null && endMs >= startMs ? endMs : startMs + (30 * 24 * 60 * 60 * 1000);
      intervals.push([startMs, resolvedEnd]);
    }
  }

  if (datesFound === 0) {
    return null;
  }

  // Sort by start date and merge overlapping or adjacent intervals
  intervals.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [start, end] of intervals) {
    if (merged.length === 0) {
      merged.push([start, end]);
    } else {
      const last = merged[merged.length - 1];
      if (start <= last[1]) {
        last[1] = Math.max(last[1], end);
      } else {
        merged.push([start, end]);
      }
    }
  }

  let totalMs = 0;
  for (const [start, end] of merged) {
    totalMs += (end - start);
  }

  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  const rawYears = totalMs / msPerYear;
  return Math.max(0, Math.round(rawYears * 10) / 10);
}

// Sequential queue state to eliminate autosave races
let _saveQueuePromise = Promise.resolve();
let _saveSequenceCounter = 0;

/**
 * Public wrapper ensuring all save requests execute sequentially.
 * Prevents race conditions where an older autosave finishes after a newer one.
 */
export function saveCanonicalResume(userId, resumeData, options = {}) {
  const sequence = ++_saveSequenceCounter;
  _saveQueuePromise = _saveQueuePromise
    .then(() => _executeSaveCanonicalResume(userId, resumeData, options, sequence))
    .catch(err => {
      console.error("[ResumeBuilder] Sequential save queue catch:", err);
      return { success: false, error: err?.message || "Internal save queue failure" };
    });
  return _saveQueuePromise;
}

/**
 * Core internal executor for saving canonical structured resume data and synchronizing projections.
 */
async function _executeSaveCanonicalResume(userId, resumeData, options = {}, sequence = 1) {
  if (!userId || !resumeData) return { success: false, error: "Missing userId or resumeData" };

  const nowIso = new Date().toISOString();

  const preparedData = {
    ...resumeData,
    version: RESUME_VERSION,
    updatedAt: nowIso
  };

  try {
    // 1. Primary Save: candidate_form_resumes (persists full structured form data)
    const { error: formUpsertErr } = await supabase.from("candidate_form_resumes").upsert({
      user_id: userId,
      resume_data: preparedData,
      version: RESUME_VERSION,
      updated_at: nowIso
    }, { onConflict: "user_id" });

    if (formUpsertErr) {
      console.error("[ResumeBuilder] candidate_form_resumes upsert failed:", formUpsertErr);
      return { success: false, error: formUpsertErr.message || "Failed to persist resume form data" };
    }

    // 2. Fetch existing resume row to PRESERVE historical uploaded document
    const { data: existingResume, error: resumeFetchErr } = await supabase
      .from("resumes")
      .select("*")
      .eq("applicant_id", userId)
      .maybeSingle();

    if (resumeFetchErr) {
      console.error("[ResumeBuilder] resumes fetch error:", resumeFetchErr);
      return { success: false, error: resumeFetchErr.message || "Failed to query resume records" };
    }

    const skillsArray = (preparedData.skills || []).map(s => (typeof s === "string" ? s : s.name)).filter(Boolean);
    const skillsCsv = skillsArray.join(",");

    // Preserve existing parsed details, quality assessment, and historical uploaded file!
    const mergedParsedDetails = {
      ...(existingResume?.parsed_details || {}),
      form_resume: preparedData,
      form_resume_version: RESUME_VERSION,
      form_resume_updated_at: nowIso
    };

    const hasUploadedFile = Boolean(existingResume?.file_url);
    // Overwrite protection: do NOT overwrite active matching skills or profile unless finalized, explicitly activated, or no uploaded file exists
    const shouldSyncToMatching = options.setActiveForMatching === true || options.isFinalize === true || !hasUploadedFile;

    if (existingResume?.id) {
      const updatePayload = {
        parsed_details: mergedParsedDetails
      };
      if (shouldSyncToMatching) {
        updatePayload.extracted_skills = skillsCsv;
      }
      const { error: resumeUpdateErr } = await supabase
        .from("resumes")
        .update(updatePayload)
        .eq("applicant_id", userId);

      if (resumeUpdateErr) {
        console.error("[ResumeBuilder] resumes update failed:", resumeUpdateErr);
        return { success: false, error: resumeUpdateErr.message || "Failed to update resume record" };
      }
    } else {
      const { error: resumeInsertErr } = await supabase
        .from("resumes")
        .insert([{
          applicant_id: userId,
          file_url: null,
          file_name: null,
          file_size: null,
          extracted_skills: skillsCsv,
          resume_score: null, // Zero fabrication: null until actual assessment
          completeness: calculateResumeReadiness(preparedData).percentage,
          parsed_details: mergedParsedDetails
        }]);

      if (resumeInsertErr) {
        console.error("[ResumeBuilder] resumes insert failed:", resumeInsertErr);
        return { success: false, error: resumeInsertErr.message || "Failed to create resume record" };
      }
    }

    // 3. Project to public.profiles and candidate_profiles only when syncing to matching
    if (shouldSyncToMatching) {
      const eduList = (preparedData.education?.entries || []).map(e => ({
        school: e.institution,
        degree: e.level,
        field: e.courseOrProgram,
        start_year: e.startYear,
        end_year: e.endYear,
        status: e.status
      }));

      const expList = (preparedData.experience?.entries || []).map(e => ({
        company: e.organization,
        position: e.title,
        type: e.workType,
        start_date: e.startDate,
        end_date: e.endDate,
        current: e.isCurrent,
        description: e.responsibilities
      }));

      const certList = (preparedData.projectsAndCredentials?.certifications || []).map(c => ({
        name: c.name,
        issuer: c.issuer,
        date: c.issueDate,
        credential_id: c.credentialId
      }));

      // Blocker 5: Fetch existing profile to prevent wiping unspecified fields
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("full_name, contact_number, address")
        .eq("id", userId)
        .maybeSingle();

      const profileUpdate = {
        skills: skillsCsv,
        education: eduList,
        work_experience: expList,
        certifications: certList,
        updated_at: nowIso
      };

      if (preparedData.personalDetails?.fullName?.trim()) {
        profileUpdate.full_name = preparedData.personalDetails.fullName.trim();
      }
      if (preparedData.personalDetails?.phone?.trim()) {
        profileUpdate.contact_number = preparedData.personalDetails.phone.trim();
      }
      const candidateCity = (preparedData.personalDetails?.city || preparedData.personalDetails?.region)?.trim();
      if (candidateCity) {
        profileUpdate.address = candidateCity;
      }

      const { error: profUpdateErr } = await supabase
        .from("profiles")
        .update(profileUpdate)
        .eq("id", userId);

      if (profUpdateErr) {
        console.error("[ResumeBuilder] Failed updating profiles:", profUpdateErr);
        return { success: false, error: profUpdateErr.message || "Failed to update profile record" };
      }

      // Blocker 3: Calculate experience strictly from dates, merging overlapping periods
      const calculatedYears = calculateExperienceYears(preparedData.experience);

      const completedOrFirst = (preparedData.education?.entries || []).find(e => e.status === "Completed") ||
                               (preparedData.education?.entries || []).find(e => e.status === "Currently Studying") ||
                               (preparedData.education?.entries || [])[0] || {};

      const candProfilePayload = {
        user_id: userId,
        course: completedOrFirst.courseOrProgram || null,
        degree: completedOrFirst.level || null,
        education_level: completedOrFirst.level || null,
        skills: JSON.stringify(skillsArray),
        certifications: JSON.stringify(certList),
        years_experience: calculatedYears,
        active_resume_source: "builder",
        updated_at: nowIso
      };

      const { error: candProfErr } = await supabase
        .from("candidate_profiles")
        .upsert(candProfilePayload, { onConflict: "user_id" });

      if (candProfErr) {
        console.error("[ResumeBuilder] Failed updating candidate_profiles:", candProfErr);
        return { success: false, error: candProfErr.message || "Failed to update candidate profile" };
      }

      // 5. Asynchronous: build canonical resume text, generate embedding, run server matching
      ;(async () => {
        try {
          const canonicalText = buildCanonicalResumeText(preparedData);
          if (canonicalText.trim()) {
            const { embedding } = await generateAndStoreResumeEmbedding(userId, canonicalText);
            if (embedding && Array.isArray(embedding)) {
              await runSemanticMatchingForCandidate(userId, embedding);
            } else {
              await runMatchingForCandidate(userId);
            }
          } else {
            await runMatchingForCandidate(userId);
          }
        } catch (embErr) {
          console.warn("[ResumeBuilder] Non-critical matching sync notice:", embErr?.message);
          await runMatchingForCandidate(userId).catch(() => {});
        }
        syncApplicantSnapshot(userId).catch(() => {});
      })();
    }

    return { success: true, savedAt: nowIso, data: preparedData, sequence };
  } catch (err) {
    console.error("[ResumeBuilder] Failed saving canonical resume:", err);
    return { success: false, error: err.message || "Failed to save resume" };
  }
}

/**
 * Retrieves which resume source is actively used for matching: 'upload' | 'builder'.
 */
export async function getActiveResumeSource(userId) {
  if (!userId) return { success: false, source: "upload" };
  try {
    const { data: candProf, error } = await supabase
      .from("candidate_profiles")
      .select("active_resume_source")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.warn("[ResumeBuilder] getActiveResumeSource query notice:", error.message);
    }

    if (candProf?.active_resume_source && ["upload", "builder"].includes(candProf.active_resume_source)) {
      return { success: true, source: candProf.active_resume_source };
    }

    // Fallback: check if uploaded file exists in resumes table
    const { data: resumeRow } = await supabase
      .from("resumes")
      .select("file_url")
      .eq("applicant_id", userId)
      .maybeSingle();

    const fallbackSource = resumeRow?.file_url ? "upload" : "builder";
    return { success: true, source: fallbackSource };
  } catch (err) {
    console.warn("[ResumeBuilder] getActiveResumeSource fallback:", err?.message);
    return { success: true, source: "upload" };
  }
}

/**
 * Sets which resume source is actively used for job matching: 'builder' | 'upload'.
 * Fully bidirectional:
 * - When source === 'builder': projects candidate_form_resumes to candidate_profiles & profiles, sets active_resume_source = 'builder'
 * - When source === 'upload': projects resumes (parsed_details + extracted_skills) to candidate_profiles & profiles, sets active_resume_source = 'upload'
 */
export async function setActiveResumeSource(userId, source) {
  if (!userId || !["builder", "upload"].includes(source)) {
    return { success: false, error: "Invalid userId or source" };
  }

  try {
    const nowIso = new Date().toISOString();

    if (source === "builder") {
      // 1. Fetch form builder data
      const { data: formRow, error: formErr } = await supabase
        .from("candidate_form_resumes")
        .select("resume_data")
        .eq("user_id", userId)
        .maybeSingle();

      if (formErr) {
        return { success: false, error: formErr.message };
      }

      if (!formRow?.resume_data) {
        return { success: false, error: "No built resume found. Please create a resume in the builder first." };
      }

      // Synchronize built resume data to matching engine & candidate_profiles
      const saveRes = await saveCanonicalResume(userId, formRow.resume_data, { setActiveForMatching: true, isFinalize: true });
      if (!saveRes.success) {
        return saveRes;
      }

      // Update candidate_form_resumes with explicit active_resume_source
      await supabase
        .from("candidate_form_resumes")
        .update({
          resume_data: {
            ...formRow.resume_data,
            active_resume_source: "builder"
          },
          updated_at: nowIso
        })
        .eq("user_id", userId);

      return { success: true, source: "builder" };
    } else {
      // 2. Switching back to uploaded resume
      const { data: resumeRow, error: resumeErr } = await supabase
        .from("resumes")
        .select("*")
        .eq("applicant_id", userId)
        .maybeSingle();

      if (resumeErr) {
        return { success: false, error: resumeErr.message };
      }

      if (!resumeRow || (!resumeRow.file_url && !resumeRow.extracted_skills)) {
        return { success: false, error: "No uploaded resume file found. Please upload a resume first." };
      }

      const parsed = resumeRow.parsed_details || {};
      const details = parsed.details || parsed;
      const skillsList = resumeRow.extracted_skills
        ? resumeRow.extracted_skills.split(",").map(s => s.trim()).filter(Boolean)
        : (parsed.skills || []);

      // Reconstruct candidate_profiles from uploaded resume
      const candProfilePayload = {
        user_id: userId,
        course: details.course || parsed.course || null,
        degree: details.degree || parsed.degree || null,
        education_level: details.degree || parsed.degree || null,
        skills: JSON.stringify(skillsList),
        certifications: JSON.stringify(details.certifications || parsed.certifications || []),
        years_experience: details.yearsOfExperience ?? parsed.yearsOfExperience ?? 0,
        active_resume_source: "upload",
        updated_at: nowIso
      };

      const { error: candErr } = await supabase
        .from("candidate_profiles")
        .upsert(candProfilePayload, { onConflict: "user_id" });

      if (candErr) {
        return { success: false, error: candErr.message };
      }

      // Re-project skills to profiles table
      const { error: profErr } = await supabase
        .from("profiles")
        .update({
          skills: skillsList.join(","),
          updated_at: nowIso
        })
        .eq("id", userId);

      if (profErr) {
        console.warn("[ResumeBuilder] Notice updating profiles on upload switch:", profErr.message);
      }

      // Record choice in candidate_form_resumes if row exists
      const { data: formRow } = await supabase
        .from("candidate_form_resumes")
        .select("resume_data")
        .eq("user_id", userId)
        .maybeSingle();

      if (formRow?.resume_data) {
        await supabase
          .from("candidate_form_resumes")
          .update({
            resume_data: {
              ...formRow.resume_data,
              active_resume_source: "upload"
            },
            updated_at: nowIso
          })
          .eq("user_id", userId);
      }

      // Re-run matching engine for uploaded resume
      try {
        await runMatchingForCandidate(userId);
        syncApplicantSnapshot(userId).catch(() => {});
      } catch (matchErr) {
        console.warn("[ResumeBuilder] Re-matching notice on source switch:", matchErr?.message);
      }

      return { success: true, source: "upload" };
    }
  } catch (err) {
    console.error("[ResumeBuilder] setActiveResumeSource failure:", err);
    return { success: false, error: err.message || "Failed to switch resume source" };
  }
}


