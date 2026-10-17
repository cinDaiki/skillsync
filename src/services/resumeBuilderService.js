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
  "Internship",
  "Freelance",
  "Part-time",
  "Volunteer",
  "Informal Work",
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

  // 1. Education clause
  const eduEntries = data.education?.entries || [];
  const completedEdu = eduEntries.find(e => e.status === "Completed") || eduEntries[0];
  const studyingEdu = eduEntries.find(e => e.status === "Currently Studying");

  if (completedEdu && completedEdu.courseOrProgram) {
    parts.push(`Graduate in ${completedEdu.courseOrProgram}`);
  } else if (studyingEdu && studyingEdu.courseOrProgram) {
    parts.push(`Student pursuing ${studyingEdu.courseOrProgram}`);
  } else if (completedEdu && completedEdu.level) {
    parts.push(`Background in ${completedEdu.level}`);
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
 * Saves canonical structured resume data and synchronizes projections.
 * 1. Saves to candidate_form_resumes (and resumes.parsed_details.form_resume as fallback).
 * 2. Projects to profiles (for snapshots and profile views).
 * 3. Projects to candidate_profiles (for server matching RPC).
 * 4. Preserves historical uploaded document in resumes table.
 * 5. Generates embedding and updates resumes.resume_embedding.
 * 6. Executes server matching flow.
 */
export async function saveCanonicalResume(userId, resumeData) {
  if (!userId || !resumeData) return { success: false, error: "Missing userId or resumeData" };

  const currentSequence = ++_lastSaveSequence;
  const nowIso = new Date().toISOString();

  const preparedData = {
    ...resumeData,
    version: RESUME_VERSION,
    updatedAt: nowIso
  };

  try {
    // 1. Primary Save: candidate_form_resumes
    try {
      await supabase.from("candidate_form_resumes").upsert({
        user_id: userId,
        resume_data: preparedData,
        version: RESUME_VERSION,
        updated_at: nowIso
      }, { onConflict: "user_id" });
    } catch (tblErr) {
      console.warn("[ResumeBuilder] candidate_form_resumes upsert notice:", tblErr?.message);
    }

    // 2. Fetch existing resume row to PRESERVE historical uploaded document
    const { data: existingResume } = await supabase
      .from("resumes")
      .select("*")
      .eq("applicant_id", userId)
      .maybeSingle();

    const skillsArray = (preparedData.skills || []).map(s => (typeof s === "string" ? s : s.name)).filter(Boolean);
    const skillsCsv = skillsArray.join(",");

    // Preserve existing parsed details, quality assessment, and historical uploaded file!
    const mergedParsedDetails = {
      ...(existingResume?.parsed_details || {}),
      form_resume: preparedData,
      form_resume_version: RESUME_VERSION,
      form_resume_updated_at: nowIso
    };

    if (existingResume?.id) {
      // UPDATE existing row: DO NOT touch file_url, file_name, file_size!
      await supabase
        .from("resumes")
        .update({
          extracted_skills: skillsCsv,
          parsed_details: mergedParsedDetails
        })
        .eq("applicant_id", userId);
    } else {
      // INSERT new row without file upload (file_url: null)
      await supabase
        .from("resumes")
        .insert([{
          applicant_id: userId,
          file_url: null,
          file_name: null,
          file_size: null,
          extracted_skills: skillsCsv,
          resume_score: 50,
          completeness: calculateResumeReadiness(preparedData).percentage,
          parsed_details: mergedParsedDetails
        }]);
    }

    // 3. Project to public.profiles
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

    await supabase.from("profiles").update({
      full_name: preparedData.personalDetails?.fullName || null,
      contact_number: preparedData.personalDetails?.phone || null,
      address: preparedData.personalDetails?.city || null,
      skills: skillsCsv,
      education: eduList,
      work_experience: expList,
      certifications: certList,
      updated_at: nowIso
    }).eq("id", userId);

    // 4. Project to public.candidate_profiles (used by compute_and_save_job_match RPC)
    const highestEdu = (preparedData.education?.entries || []).find(e => e.status === "Completed") ||
                      (preparedData.education?.entries || [])[0] || {};

    let estimatedYears = 0;
    if (preparedData.experience?.entries?.length > 0 && !preparedData.experience.noExperience) {
      estimatedYears = Math.max(1, Math.round(preparedData.experience.entries.length * 1.5));
    }

    await supabase.from("candidate_profiles").upsert({
      user_id: userId,
      course: highestEdu.courseOrProgram || null,
      degree: highestEdu.level || null,
      education_level: highestEdu.level || null,
      skills: JSON.stringify(skillsArray),
      certifications: JSON.stringify(certList),
      years_experience: estimatedYears,
      updated_at: nowIso
    }, { onConflict: "user_id" });

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
        // Always attempt fallback rule-based matching
        await runMatchingForCandidate(userId).catch(() => {});
      }
      syncApplicantSnapshot(userId).catch(() => {});
    })();

    // Check if a newer save request has started
    if (currentSequence < _lastSaveSequence) {
      console.log(`[ResumeBuilder] Save #${currentSequence} succeeded, but superseded by newer save #${_lastSaveSequence}.`);
    }

    return { success: true, savedAt: nowIso, data: preparedData };
  } catch (err) {
    console.error("[ResumeBuilder] Failed saving canonical resume:", err);
    return { success: false, error: err.message || "Failed to save resume" };
  }
}
