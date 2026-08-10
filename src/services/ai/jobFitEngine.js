/**
 * jobFitEngine.js
 *
 * Single authoritative scoring engine for TWO-SIDED matching:
 *   1. Candidate -> Recommended Jobs
 *   2. Employer Job -> Recommended Candidates
 *
 * Job Fit Score Weights (Total 100%):
 *   - Required Skills:           35%
 *   - Transferable Skills:       15%
 *   - Education Compatibility:   15%
 *   - Experience Compatibility:  15%
 *   - Semantic Relevance:        10%
 *   - Credentials/Certifications: 10%
 *
 * Match Tiers:
 *   - 80–100% -> Strong Match
 *   - 60–79%  -> Good Match
 *   - 40–59%  -> Potential Match
 *   - 0–39%   -> Skills Gap
 */

import { normalizeSkillName } from '../normalization.js';
import { matchMicrocredentialsForMissingSkills } from '../microcredentialService.js';

// ── Controlled Transferable Skills Dictionary ────────────────────────────────
export const CONTROLLED_TRANSFERABLE_SKILLS = new Set([
  'communication',
  'customer service',
  'teamwork',
  'problem solving',
  'time management',
  'adaptability',
  'leadership',
  'organization',
  'attention to detail',
  'documentation',
  'interpersonal skills',
  'collaboration',
  'client relations',
  'work ethic',
  'critical thinking'
]);

// ── Initial Configurable Weights ─────────────────────────────────────────────
export const JOB_FIT_WEIGHTS = {
  requiredSkills: 0.35,
  transferableSkills: 0.15,
  educationCompatibility: 0.15,
  experienceCompatibility: 0.15,
  semanticRelevance: 0.10,
  credentialsScore: 0.10
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseSkillList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map(s => {
      if (s && typeof s === 'object') {
        return normalizeSkillName(s.normalized || s.canonicalName || s.name || '');
      }
      return normalizeSkillName(s);
    }).filter(Boolean);
  }
  if (typeof raw === 'string') {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return parseSkillList(arr);
    } catch {
      return raw.split(',').map(s => normalizeSkillName(s.trim())).filter(Boolean);
    }
  }
  return [];
}

function parseCertList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map(c => (typeof c === 'string' ? c.trim() : (c.name || '')).toLowerCase()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return parseCertList(arr);
    } catch {
      return raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    }
  }
  return [];
}

/**
 * Determine Job Fit Tier
 */
export function getJobFitTier(score) {
  if (score >= 80) return 'Strong Match';
  if (score >= 60) return 'Good Match';
  if (score >= 40) return 'Potential Match';
  return 'Skills Gap';
}

/**
 * Calculate Required & Transferable Skill Scores
 */
export function evaluateSkills(candidateSkillsRaw, jobRequiredSkillsRaw) {
  const candSkills = parseSkillList(candidateSkillsRaw);
  const reqSkills = parseSkillList(jobRequiredSkillsRaw);

  const matchedRequired = [];
  const missingRequired = [];
  const matchedTransferable = [];

  // Separate job's required skills into explicit vs transferable
  const explicitJobSkills = [];
  const transferableJobSkills = [];

  reqSkills.forEach(skill => {
    if (CONTROLLED_TRANSFERABLE_SKILLS.has(skill)) {
      transferableJobSkills.push(skill);
    } else {
      explicitJobSkills.push(skill);
    }
  });

  // Evaluate All Required Skills
  reqSkills.forEach(req => {
    const isMatched = candSkills.some(c => c.includes(req) || req.includes(c));
    if (isMatched) {
      matchedRequired.push(req);
    } else {
      missingRequired.push(req);
    }

    if (CONTROLLED_TRANSFERABLE_SKILLS.has(req)) {
      transferableJobSkills.push(req);
    } else {
      explicitJobSkills.push(req);
    }
  });

  // Evaluate Transferable Skills
  transferableJobSkills.forEach(trans => {
    const isMatched = candSkills.some(c => c.includes(trans) || trans.includes(c));
    if (isMatched && !matchedTransferable.includes(trans)) {
      matchedTransferable.push(trans);
    }
  });

  candSkills.forEach(c => {
    if (CONTROLLED_TRANSFERABLE_SKILLS.has(c) && !matchedTransferable.includes(c)) {
      matchedTransferable.push(c);
    }
  });

  // Calculate scores
  let requiredSkillsScore = 100;
  if (reqSkills.length > 0) {
    requiredSkillsScore = Math.round((matchedRequired.length / reqSkills.length) * 100);
  }

  let transferableSkillsScore = 100;
  if (transferableJobSkills.length > 0) {
    const matchedTrans = transferableJobSkills.filter(t => matchedTransferable.includes(t)).length;
    transferableSkillsScore = Math.round((matchedTrans / transferableJobSkills.length) * 100);
  } else if (matchedTransferable.length > 0) {
    transferableSkillsScore = Math.min(100, 50 + matchedTransferable.length * 20);
  } else {
    transferableSkillsScore = 70;
  }

  return {
    requiredSkillsScore,
    transferableSkillsScore,
    matchedSkills: matchedRequired,
    missingSkills: missingRequired,
    matchedTransferable
  };
}

/**
 * Contextual Non-Penalizing Education Compatibility
 */
export function evaluateEducation(candidateEduRaw, jobEduRaw, jobTitleStr = '', jobDescStr = '') {
  const candEdu = (candidateEduRaw || '').toLowerCase();
  const jobEdu = (jobEduRaw || '').toLowerCase();
  const jobDesc = (jobDescStr || '').toLowerCase();
  const jobTitle = (jobTitleStr || '').toLowerCase();

  // 1. No education requirement or general requirement -> 100%
  if (!jobEdu || jobEdu === 'none' || jobEdu.includes('any') || jobEdu.includes('high school') || jobEdu.includes('optional')) {
    return 100;
  }

  // 2. Candidate degree directly satisfies requirement
  if (candEdu && (candEdu.includes(jobEdu) || jobEdu.includes(candEdu))) {
    return 100;
  }

  // 3. Relevant degree match
  if (candEdu.includes('it') || candEdu.includes('computer') || candEdu.includes('software')) {
    if (jobTitle.includes('developer') || jobTitle.includes('web') || jobTitle.includes('software') || jobTitle.includes('it')) {
      return 100;
    }
  }

  // 4. Non-penalizing: Candidate holds a degree applying to general / entry-level / service roles
  const isGeneralOrServiceRole = 
    jobTitle.includes('service') || jobTitle.includes('crew') || jobTitle.includes('support') || 
    jobTitle.includes('assistant') || jobTitle.includes('cashier') || jobTitle.includes('clerk') ||
    jobDesc.includes('entry level') || !jobEdu.includes('bachelor');

  if (candEdu && isGeneralOrServiceRole) {
    return 100; // Zero penalty for degree holders applying to entry/general roles
  }

  // 5. Degree present but job requires specific specialized degree
  if (candEdu && candEdu.length > 3) {
    return 70; // Partial match for having higher education
  }

  return 50; // Minimum baseline when candidate education is unstated
}

/**
 * Requirement-Aware Experience Compatibility
 */
export function evaluateExperience(candidateYearsRaw, jobExpReqRaw, jobTitleStr = '') {
  const candidateYears = Number(candidateYearsRaw) || 0;
  let requiredYears = 0;

  if (jobExpReqRaw) {
    const match = String(jobExpReqRaw).match(/\d+/);
    if (match) requiredYears = parseInt(match[0], 10);
  }

  const jobTitle = (jobTitleStr || '').toLowerCase();
  const isEntryLevelJob = requiredYears <= 1 || jobTitle.includes('junior') || jobTitle.includes('entry') || jobTitle.includes('associate') || jobTitle.includes('crew');

  // 1. Entry level job -> fresh grad (0 years) gets 100%
  if (isEntryLevelJob && candidateYears >= 0) {
    return 100;
  }

  // 2. Candidate meets or exceeds required years
  if (candidateYears >= requiredYears) {
    return 100;
  }

  // 3. Candidate has partial experience -> scale proportionately
  if (requiredYears > 0 && candidateYears > 0) {
    return Math.round((candidateYears / requiredYears) * 100);
  }

  // 4. No experience required specified -> 100%
  if (requiredYears === 0) {
    return 100;
  }

  return 40; // Entry baseline when 0 experience on record for higher role
}

/**
 * Relevant Certifications & Microcredentials Compatibility
 */
export function evaluateCredentials(candidateCertsRaw, jobReqCertsRaw, jobTitleStr = '', jobDescStr = '') {
  const candCerts = parseCertList(candidateCertsRaw);
  const reqCerts = parseCertList(jobReqCertsRaw);
  const jobTitle = (jobTitleStr || '').toLowerCase();
  const jobDesc = (jobDescStr || '').toLowerCase();

  const matchedCerts = [];
  const missingCerts = [];

  // Check required certs from employer
  reqCerts.forEach(req => {
    const isMatched = candCerts.some(c => c.includes(req) || req.includes(c));
    if (isMatched) {
      matchedCerts.push(req);
    } else {
      missingCerts.push(req);
    }
  });

  // Also check if candidate certs are relevant to job title or description
  candCerts.forEach(cert => {
    const certWords = cert.split(' ').filter(w => w.length > 3);
    const isRelevant = certWords.some(w => jobDesc.includes(w) || jobTitle.includes(w));
    if (isRelevant && !matchedCerts.includes(cert)) {
      matchedCerts.push(cert);
    }
  });

  let score = 50; // Baseline when no certs required
  if (reqCerts.length > 0) {
    const matchCount = reqCerts.filter(r => candCerts.some(c => c.includes(r) || r.includes(c))).length;
    score = Math.round((matchCount / reqCerts.length) * 100);
  } else if (matchedCerts.length > 0) {
    score = Math.min(100, 70 + matchedCerts.length * 15);
  }

  return {
    credentialsScore: score,
    matchedCerts,
    missingCerts
  };
}

/**
 * Core Algorithm: Calculate Two-Sided Job Fit Score
 *
 * @param {object} candidate - { skills, course, degree, years_experience, certifications }
 * @param {object} job       - { title, required_skills, required_education, experience_required, required_certifications, description }
 * @param {number} semanticScoreNormalized - Cosine similarity (0.0 to 1.0) or percentage (0 to 100)
 * @param {object} weights   - Custom weights override (optional)
 * @returns {object} Full Job Fit Breakdown & Explanation
 */
export function calculateJobFit(candidate = {}, job = {}, semanticScoreNormalized = 0.70, weights = JOB_FIT_WEIGHTS) {
  const w = { ...JOB_FIT_WEIGHTS, ...weights };

  // Normalize semantic score to 0–100
  const semanticPct = semanticScoreNormalized > 1 
    ? Math.min(100, Math.max(0, semanticScoreNormalized))
    : Math.min(100, Math.max(0, Math.round(semanticScoreNormalized * 100)));

  // 1. Evaluate Skills (Required + Transferable)
  const skillsEval = evaluateSkills(candidate.skills, job.required_skills);

  // 2. Evaluate Education
  const candEduStr = [candidate.course, candidate.degree, candidate.education_level].filter(Boolean).join(' ');
  const eduScore = evaluateEducation(candEduStr, job.required_education, job.title, job.description);

  // 3. Evaluate Experience
  const expScore = evaluateExperience(candidate.years_experience, job.experience_required, job.title);

  // 4. Evaluate Credentials
  const credsEval = evaluateCredentials(candidate.certifications, job.required_certifications, job.title, job.description);

  // 5. Calculate Weighted Final Job Fit Score
  const rawScore = 
    (skillsEval.requiredSkillsScore * w.requiredSkills) +
    (skillsEval.transferableSkillsScore * w.transferableSkills) +
    (eduScore * w.educationCompatibility) +
    (expScore * w.experienceCompatibility) +
    (semanticPct * w.semanticRelevance) +
    (credsEval.credentialsScore * w.credentialsScore);

  const jobFitScore = Math.min(100, Math.max(0, Math.round(rawScore)));
  const tier = getJobFitTier(jobFitScore);

  // Generate Targeted Microcredentials for Missing Skills using Controlled Catalog
  const recommendedMicrocredentials = matchMicrocredentialsForMissingSkills(skillsEval.missingSkills);

  // Build Explainable Strengths & Gaps
  const strengths = [];
  const gaps = [];

  if (skillsEval.requiredSkillsScore >= 80) {
    strengths.push(`Strong required skill match (${skillsEval.matchedSkills.length} matched)`);
  } else if (skillsEval.requiredSkillsScore >= 50) {
    strengths.push(`Moderate required skill overlap (${skillsEval.matchedSkills.length} matched)`);
  } else if (skillsEval.missingSkills.length > 0) {
    gaps.push(`Missing core role skills: ${skillsEval.missingSkills.slice(0, 3).join(', ')}`);
  }

  if (skillsEval.matchedTransferable.length > 0) {
    strengths.push(`Transferable competencies present: ${skillsEval.matchedTransferable.slice(0, 3).join(', ')}`);
  }

  if (eduScore === 100) {
    strengths.push('Education background fully compatible with role');
  } else if (eduScore < 70) {
    gaps.push(`Role specifies ${job.required_education || 'specialized degree'}`);
  }

  if (expScore === 100) {
    strengths.push('Experience level satisfies job requirement');
  } else if (expScore < 70) {
    gaps.push(`Experience is ${candidate.years_experience || 0} yrs vs ${job.experience_required || 'specified'}`);
  }

  if (credsEval.matchedCerts.length > 0) {
    strengths.push(`Relevant certifications: ${credsEval.matchedCerts.join(', ')}`);
  }
  if (credsEval.missingCerts.length > 0) {
    gaps.push(`Missing required certification: ${credsEval.missingCerts.join(', ')}`);
  }

  return {
    jobFitScore,
    tier,
    breakdown: {
      requiredSkillsScore: skillsEval.requiredSkillsScore,
      transferableSkillsScore: skillsEval.transferableSkillsScore,
      educationCompatibility: eduScore,
      experienceCompatibility: expScore,
      semanticRelevance: semanticPct,
      credentialsScore: credsEval.credentialsScore
    },
    matchedSkills: skillsEval.matchedSkills,
    missingSkills: skillsEval.missingSkills,
    matchedTransferable: skillsEval.matchedTransferable,
    matchedCertifications: credsEval.matchedCerts,
    missingCertifications: credsEval.missingCerts,
    strengths,
    gaps,
    recommendedMicrocredentials
  };
}
