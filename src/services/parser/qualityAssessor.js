/**
 * src/services/parser/qualityAssessor.js
 *
 * Phase 2 — Resume Quality and Extraction Validation Engine.
 *
 * Evaluates:
 * 1. Extraction Quality: Did SkillSync accurately extract readable text from the file?
 *    (checks text volume, character validity, section parsing fidelity, and skill grounding).
 * 2. Section Completeness: Identifies which standard sections are present and whether
 *    expected content within those sections was extracted.
 * 3. Skill Traceability: Verifies that every extracted skill traces to actual document text
 *    (preventing hallucinated or fabricated qualifications).
 * 4. Actionable User Feedback: Generates specific, understandable diagnostic messages
 *    (e.g., "Your education section could not be identified", "Text-poor document").
 * 5. Template Recommendation: Contextually recommends the Phase 1 standard template
 *    only when parsing quality is degraded or critical structure is missing.
 *
 * IMPORTANT DESIGN PRINCIPLE (Phase 2):
 * - Keeps Resume Quality, Extraction Quality, and Job-Fit Match Score strictly distinct.
 * - Never fabricates qualifications or replaces missing fields with assumed data.
 * - Does not block candidate uploads solely because an optional or non-traditional section is absent.
 */

/**
 * Assess extraction fidelity and resume completeness.
 *
 * @param {object} params
 * @param {string} params.rawText - The raw extracted text from the file
 * @param {object} params.details - Parsed details from resumeParser
 * @param {string[]} params.skills - List of detected skills
 * @param {object} [params.parsedPipeline] - Structured pipeline result (from runPipeline)
 * @param {string} [params.fileName] - Name of the uploaded file
 * @returns {object} Quality assessment report
 */
export function assessResumeQuality({
  rawText = '',
  details = {},
  skills = [],
  parsedPipeline = null,
  fileName = ''
}) {
  const text = (rawText || '').trim();
  const textLength = text.length;
  const words = text ? text.split(/\s+/).filter(Boolean) : [];
  const wordCount = words.length;

  const issues = [];
  const warnings = [];
  const strengths = [];

  // ── 1. Extraction Quality Assessment ───────────────────────────────────────
  // Evaluates whether the parser was able to extract legible, meaningful text.
  let isTextPoor = false;
  let isUnreadable = false;
  let textQualityScore = 100;

  if (textLength === 0) {
    isUnreadable = true;
    textQualityScore = 0;
    issues.push({
      code: 'EMPTY_TEXT',
      severity: 'critical',
      message: 'No readable text could be extracted from this file. The file may be an image-only scan, password-protected, or corrupted.'
    });
  } else if (textLength < 120 || wordCount < 25) {
    isTextPoor = true;
    textQualityScore = 30;
    issues.push({
      code: 'TEXT_POOR',
      severity: 'high',
      message: `Only ${wordCount} words could be extracted. The file may contain unparsed graphics, multi-column tables, or scanned content.`
    });
  } else if (wordCount < 60) {
    textQualityScore = 60;
    warnings.push({
      code: 'LOW_WORD_COUNT',
      message: `Document contains only ${wordCount} words. Standard professional resumes typically contain 200–600 words.`
    });
  }

  // Non-printable character ratio (detect corrupted binary or bad PDF encoding)
  if (textLength > 0) {
    const nonPrintableMatches = text.match(/[^\x20-\x7E\t\n\r\u00A0-\u024F]/g) || [];
    const nonPrintableRatio = nonPrintableMatches.length / textLength;
    if (nonPrintableRatio > 0.15) {
      textQualityScore = Math.max(10, textQualityScore - 40);
      issues.push({
        code: 'ENCODING_ARTIFACTS',
        severity: 'high',
        message: 'High proportion of non-standard or garbled characters detected. Text extraction may be incomplete.'
      });
    }
  }

  // ── 2. Section Identification & Content Verification ───────────────────────
  // Inspect section presence in both pipeline and text regex.
  const pipelineSections = parsedPipeline?.meta?.sectionOrder || [];
  const detectedSectionMap = {
    CONTACT: false,
    SUMMARY: false,
    SKILLS: false,
    EXPERIENCE: false,
    EDUCATION: false,
    PROJECTS: false,
    CERTIFICATIONS: false,
    ACHIEVEMENTS: false
  };

  // Only detect document sections if the document actually yielded readable text!
  if (!isUnreadable && textLength > 0) {
    detectedSectionMap.CONTACT = !!(details.hasContact || pipelineSections.includes('CONTACT'));
    detectedSectionMap.SUMMARY = !!(parsedPipeline?.summary || /summary|objective|profile|overview|about me|about/i.test(text));
    detectedSectionMap.SKILLS = !!(skills.length > 0 || pipelineSections.includes('SKILLS') || /skills|technologies|competencies/i.test(text));
    detectedSectionMap.EXPERIENCE = !!(
      details.hasExperienceSection ||
      pipelineSections.includes('EXPERIENCE') ||
      (parsedPipeline?.experience && parsedPipeline.experience.length > 0)
    );
    detectedSectionMap.EDUCATION = !!(
      details.hasEducationSection ||
      pipelineSections.includes('EDUCATION') ||
      (parsedPipeline?.education && parsedPipeline.education.length > 0)
    );
    detectedSectionMap.PROJECTS = !!(
      pipelineSections.includes('PROJECTS') ||
      (parsedPipeline?.projects && parsedPipeline.projects.length > 0) ||
      /projects|portfolio|case studies/i.test(text)
    );
    detectedSectionMap.CERTIFICATIONS = !!(
      details.hasCertificationsSection ||
      pipelineSections.includes('CERTIFICATIONS') ||
      (parsedPipeline?.certifications && parsedPipeline.certifications.length > 0)
    );
    detectedSectionMap.ACHIEVEMENTS = !!(
      pipelineSections.includes('ACHIEVEMENTS') ||
      /achievements|honors|awards|accomplishments/i.test(text)
    );
  }

  // ── 3. Field Extraction & Content Depth Verification ───────────────────────
  // Differentiate qualifications extracted from document text vs. profile stored/default data.
  const hasExtractedDegree = !isUnreadable && textLength > 0 && !!(details.degree || parsedPipeline?.education?.[0]?.degree?.normalized);
  const profileStoredDegree = details.degree || parsedPipeline?.education?.[0]?.degree?.normalized || null;
  const degreeProvenance = hasExtractedDegree
    ? 'extracted'
    : (profileStoredDegree ? 'profile_stored' : 'none');

  const fields = {
    email: !isUnreadable ? (details.email || parsedPipeline?.contact?.email?.normalized || null) : null,
    phone: !isUnreadable ? (details.phone || parsedPipeline?.contact?.phone?.normalized || null) : null,
    linkedin: !isUnreadable ? (details.linkedin || parsedPipeline?.contact?.linkedin?.normalized || null) : null,
    github: !isUnreadable ? (details.github || parsedPipeline?.contact?.github?.normalized || null) : null,
    name: !isUnreadable ? (parsedPipeline?.contact?.name?.normalized || null) : null,
    degree: hasExtractedDegree ? profileStoredDegree : null,
    degreeStored: profileStoredDegree,
    degreeProvenance,
    course: !isUnreadable ? (details.course || parsedPipeline?.education?.[0]?.major?.normalized || null) : null,
    yearsOfExperience: !isUnreadable ? (details.yearsOfExperience || parsedPipeline?.totalExpYears || 0) : 0,
    experienceEntriesCount: !isUnreadable ? (parsedPipeline?.experience?.length || (detectedSectionMap.EXPERIENCE ? 1 : 0)) : 0,
    educationEntriesCount: !isUnreadable ? (parsedPipeline?.education?.length || (hasExtractedDegree ? 1 : 0)) : 0,
  };

  // Section-specific diagnostics
  const sectionFeedback = [];

  // Contact checks
  if (!isUnreadable && fields.email && fields.phone) {
    strengths.push('Contact coordinates fully verified (email and phone number extracted).');
  } else if (!isUnreadable && fields.email) {
    warnings.push({
      code: 'MISSING_PHONE',
      message: 'Email address verified, but no valid phone number was found.'
    });
  } else if (!isUnreadable && fields.phone) {
    warnings.push({
      code: 'MISSING_EMAIL',
      message: 'Phone number verified, but no valid email address was found.'
    });
  } else if (!isUnreadable) {
    issues.push({
      code: 'MISSING_CONTACT',
      severity: 'high',
      message: 'No contact information (email or phone) could be extracted from your resume.'
    });
  }

  // Experience checks
  if (detectedSectionMap.EXPERIENCE && !isUnreadable) {
    if (fields.yearsOfExperience > 0) {
      strengths.push(`Work experience detected with estimated ${fields.yearsOfExperience}+ years of experience.`);
    } else {
      sectionFeedback.push({
        section: 'EXPERIENCE',
        status: 'partial',
        message: 'Work experience section detected, but specific dates or years of experience were not explicitly stated.'
      });
    }
  } else {
    sectionFeedback.push({
      section: 'EXPERIENCE',
      status: 'missing',
      message: isUnreadable
        ? 'No work experience could be extracted because the document text was unreadable.'
        : 'Your work experience or employment history section could not be identified.'
    });
    if (!isUnreadable) {
      warnings.push({
        code: 'NO_EXPERIENCE_SECTION',
        message: 'Work experience section not found. If you are an entry-level applicant, include internships, OJT, or capstone projects.'
      });
    }
  }

  // Education checks
  if (detectedSectionMap.EDUCATION && hasExtractedDegree && !isUnreadable) {
    strengths.push(`Education verified: ${fields.degree}${fields.course ? ` (${fields.course})` : ''}.`);
  } else if (detectedSectionMap.EDUCATION && !isUnreadable) {
    sectionFeedback.push({
      section: 'EDUCATION',
      status: 'partial',
      message: 'Education section found, but a standard degree title (e.g. Bachelor of Science) could not be extracted.'
    });
  } else {
    sectionFeedback.push({
      section: 'EDUCATION',
      status: 'missing',
      message: isUnreadable
        ? 'No education could be extracted because the document text was unreadable.'
        : (profileStoredDegree
            ? `Education was not extracted from document text (Profile contains: ${profileStoredDegree}).`
            : 'Your education section could not be identified.')
    });
    if (!isUnreadable) {
      warnings.push({
        code: 'NO_EDUCATION_SECTION',
        message: 'Education section not found in document text. Ensure degrees and colleges use standard naming.'
      });
    }
  }

  // Skills checks & Traceability Grounding
  const {
    verified: groundedSkills,
    unverified: ungroundedSkills,
    fidelityRatio
  } = verifySkillTraceability(skills, text, parsedPipeline);

  if (!isUnreadable && groundedSkills.length >= 8) {
    strengths.push(`Extracted ${groundedSkills.length} verified technical skills traceable to your document text.`);
  } else if (!isUnreadable && groundedSkills.length >= 3) {
    strengths.push(`Extracted ${groundedSkills.length} technical skills from your document.`);
  } else if (!isUnreadable && groundedSkills.length === 0) {
    issues.push({
      code: 'NO_SKILLS',
      severity: 'high',
      message: 'No technical or professional skills were recognized by the SkillSync dictionary.'
    });
  } else if (!isUnreadable) {
    warnings.push({
      code: 'FEW_SKILLS',
      message: `Only ${groundedSkills.length} skills were recognized. Adding standard industry terms will increase job match quality.`
    });
  }

  // ── 4. Compute Extraction Quality Score ─────────────────────────────────────
  // Extraction Quality evaluates how reliably SkillSync read the document.
  let extractionScore = textQualityScore;

  if (isUnreadable) {
    extractionScore = 0;
  } else {
    let deductions = 0;
    if (!fields.email && !fields.phone) deductions += 25;
    else if (!fields.email || !fields.phone) deductions += 10;

    if (!detectedSectionMap.EXPERIENCE) deductions += 20;
    if (!detectedSectionMap.EDUCATION) deductions += 15;
    if (groundedSkills.length === 0) deductions += 20;
    else if (groundedSkills.length < 3) deductions += 10;

    extractionScore = Math.max(10, Math.min(100, Math.round(textQualityScore - deductions)));
  }

  let extractionRating = 'EXCELLENT';
  if (extractionScore < 40 || isUnreadable) extractionRating = 'POOR';
  else if (extractionScore < 65 || isTextPoor) extractionRating = 'NEEDS_REVIEW';
  else if (extractionScore < 85) extractionRating = 'GOOD';

  // ── 5. Compute Resume Completeness Score ────────────────────────────────────
  // Resume Quality evaluates whether the document provides comprehensive information.
  let completenessScore = 0;
  if (!isUnreadable) {
    completenessScore = 15; // base for readable submission
    if (fields.email) completenessScore += 15;
    if (fields.phone) completenessScore += 10;
    if (detectedSectionMap.SUMMARY) completenessScore += 10;
    if (detectedSectionMap.EXPERIENCE) completenessScore += 20;
    if (detectedSectionMap.EDUCATION) completenessScore += 15;
    if (groundedSkills.length >= 5) completenessScore += 15;
    else if (groundedSkills.length > 0) completenessScore += 5;

    completenessScore = Math.min(100, completenessScore);
  }

  // ── 6. Contextual Template Recommendation ──────────────────────────────────
  // Offer the Phase 1 template when appropriate (low extraction score, poor text, or missing core sections).
  const isTemplateRecommended =
    isTextPoor ||
    isUnreadable ||
    extractionScore < 65 ||
    (!detectedSectionMap.EXPERIENCE && !detectedSectionMap.EDUCATION);

  let templateRecommendationReason = null;
  if (isUnreadable) {
    templateRecommendationReason = 'No text could be extracted from your file. Using our single-column ATS Word template ensures standard text readability.';
  } else if (isTextPoor) {
    templateRecommendationReason = 'Your file contains very little extractable text. Using our standard single-column template will ensure full parsing.';
  } else if (extractionScore < 65) {
    templateRecommendationReason = 'Key sections could not be identified cleanly. Our ATS template provides pre-formatted sections designed for parser compatibility.';
  }

  return {
    // ─ Core Assessment Metrics ─
    extractionQuality: {
      score: extractionScore,
      rating: extractionRating,
      isTextPoor,
      isUnreadable,
      textLength,
      wordCount,
    },
    resumeQuality: {
      completenessScore,
      rating: completenessScore >= 80 ? 'HIGH' : completenessScore >= 50 ? 'MODERATE' : 'INCOMPLETE',
    },
    // ─ Section & Field Completeness ─
    sections: {
      detected: Object.keys(detectedSectionMap).filter(k => detectedSectionMap[k]),
      missing: Object.keys(detectedSectionMap).filter(k => !detectedSectionMap[k]),
      statusMap: detectedSectionMap,
      details: sectionFeedback,
    },
    fields: {
      ...fields,
      groundedSkillsCount: groundedSkills.length,
      ungroundedSkillsCount: ungroundedSkills.length,
    },
    // ─ Traceability Provenance ─
    skillTraceability: {
      verified: groundedSkills,
      unverified: ungroundedSkills,
      fidelityRatio: skills.length > 0 ? (groundedSkills.length / skills.length) : 1,
    },
    // ─ User Feedback & Guidance ─
    feedback: {
      issues,      // Critical errors / blockers
      warnings,    // Actionable improvements
      strengths,   // What is already done well
    },
    // ─ Template Suggestion ─
    templateSuggestion: {
      recommended: isTemplateRecommended,
      reason: templateRecommendationReason,
      actionText: 'Download ATS Template (.docx)',
      downloadUrl: '/templates/SkillSync_ATS_Resume_Template.docx',
    }
  };
}

/**
 * Verifies that extracted skills can be traced to actual document text,
 * either by direct substring match, boundary regex, or via parser aliases/provenance.
 */
export function verifySkillTraceability(skills = [], rawText = '', parsedPipeline = null) {
  const text = typeof rawText === 'string' ? rawText : '';
  const lowerText = text.toLowerCase();
  const groundedSkills = [];
  const ungroundedSkills = [];

  // Index pipeline skills by canonical, normalized, and lowercase names
  const pipelineSkillMap = new Map();
  if (parsedPipeline && Array.isArray(parsedPipeline.skills)) {
    for (const ps of parsedPipeline.skills) {
      const keys = [ps.canonicalName, ps.normalized, ps.name, ps.raw]
        .filter(Boolean)
        .map(k => String(k).toLowerCase());
      for (const k of keys) {
        if (!pipelineSkillMap.has(k)) {
          pipelineSkillMap.set(k, ps);
        }
      }
    }
  }

  for (const skill of skills) {
    const skillName = typeof skill === 'string' ? skill : skill.name || skill.normalized || '';
    if (!skillName) continue;

    const skillLower = skillName.toLowerCase();
    let isPresent = false;

    // 1. Direct or regex boundary match of the skill name in text
    if (skillName.length <= 2) {
      const escaped = skillName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      isPresent = new RegExp(`(?:^|[\\s,;/|\\(\\)])${escaped}(?:[\\s,;/|\\(\\)]|$)`, 'i').test(text);
    } else {
      isPresent = lowerText.includes(skillLower);
    }

    // 2. Check pipeline provenance (matched text, aliases, sources)
    if (!isPresent && pipelineSkillMap.has(skillLower)) {
      const ps = pipelineSkillMap.get(skillLower);

      // Check matchedText array or string
      if (Array.isArray(ps.matchedText)) {
        isPresent = ps.matchedText.some(mt => mt && lowerText.includes(String(mt).toLowerCase()));
      } else if (typeof ps.matchedText === 'string' && ps.matchedText.trim()) {
        isPresent = lowerText.includes(ps.matchedText.toLowerCase());
      }

      // Check aliasesMatched
      if (!isPresent && Array.isArray(ps.aliasesMatched)) {
        isPresent = ps.aliasesMatched.some(alias => alias && lowerText.includes(String(alias).toLowerCase()));
      }

      // Check raw token
      if (!isPresent && ps.raw && typeof ps.raw === 'string') {
        isPresent = lowerText.includes(ps.raw.toLowerCase());
      }

      // Check sources matchedText
      if (!isPresent && Array.isArray(ps.sources)) {
        isPresent = ps.sources.some(s => s.matchedText && lowerText.includes(String(s.matchedText).toLowerCase()));
      }

      // If parser matched it via verified boundary/exact method with positive occurrences
      if (!isPresent && ps.occurrences > 0 && ps.method && ps.method !== 'inferred') {
        isPresent = true;
      }
    }

    if (isPresent) {
      groundedSkills.push(skillName);
    } else {
      ungroundedSkills.push(skillName);
    }
  }

  const fidelityRatio = skills.length > 0 ? (groundedSkills.length / skills.length) : 1;

  return {
    verified: groundedSkills,
    unverified: ungroundedSkills,
    fidelityRatio,
  };
}
