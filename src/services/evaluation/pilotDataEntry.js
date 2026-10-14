/**
 * src/services/evaluation/pilotDataEntry.js
 *
 * SkillSync Phase 4.5: Pilot Data Entry Helper & Gating Policy Simulator
 *
 * Implements:
 * 1. Qualification state verification: MET, NOT_MET, UNKNOWN.
 * 2. Mandatory gating policy simulation for RFC testing.
 * 3. Fallback logic: ensures missing evidence triggers UNKNOWN and human review, NOT automatic rejection.
 * 4. Helper for pilot case formatting and validation against benchmarkSchema.js.
 */

import { validateBenchmarkCase } from './benchmarkSchema.js';

export const QUALIFICATION_STATES = {
  MET: 'MET',
  NOT_MET: 'NOT_MET',
  UNKNOWN: 'UNKNOWN'
};

/**
 * Evaluates mandatory eligibility based on qualification states.
 *
 * @param {Record<string, 'MET' | 'NOT_MET' | 'UNKNOWN'>} requirementStates
 * @returns {Object} { status: 'ELIGIBLE' | 'INELIGIBLE' | 'PENDING_VERIFICATION', unmetRequirements: string[], unknownRequirements: string[] }
 */
export function evaluateMandatoryEligibility(requirementStates = {}) {
  const unmetRequirements = [];
  const unknownRequirements = [];

  for (const [req, state] of Object.entries(requirementStates)) {
    if (state === QUALIFICATION_STATES.NOT_MET) {
      unmetRequirements.push(req);
    } else if (state === QUALIFICATION_STATES.UNKNOWN) {
      unknownRequirements.push(req);
    }
  }

  if (unmetRequirements.length > 0) {
    return {
      status: 'INELIGIBLE',
      eligible: false,
      unmetRequirements,
      unknownRequirements,
      action: 'REJECT_OR_CAP',
      message: `Ineligible: Candidate does not satisfy mandatory requirement(s): ${unmetRequirements.join(', ')}.`
    };
  }

  if (unknownRequirements.length > 0) {
    return {
      status: 'PENDING_VERIFICATION',
      eligible: null, // Indeterminate pending verification
      unmetRequirements: [],
      unknownRequirements,
      action: 'REQUEST_VERIFICATION',
      message: `Pending Verification: Document does not mention ${unknownRequirements.join(', ')}. Human review or verification requested.`
    };
  }

  return {
    status: 'ELIGIBLE',
    eligible: true,
    unmetRequirements: [],
    unknownRequirements: [],
    action: 'NORMAL_SCORING',
    message: 'All mandatory requirements satisfied.'
  };
}

/**
 * Simulates the RFC's proposed gating effect on a raw match score.
 *
 * @param {number} rawScore - Raw calculated weighted match percentage (0-100)
 * @param {Record<string, 'MET' | 'NOT_MET' | 'UNKNOWN'>} requirementStates
 * @returns {Object} { displayedScore, tier, badge, eligibility }
 */
export function simulateProposedGating(rawScore, requirementStates = {}) {
  const eligibility = evaluateMandatoryEligibility(requirementStates);

  let displayedScore = rawScore;
  let tier = 'Potential Match';
  let badge = null;

  if (eligibility.status === 'INELIGIBLE') {
    // RFC Rule: Hard cap at 35% on affirmative NOT_MET
    displayedScore = Math.min(rawScore, 35);
    tier = 'Skills Gap';
    badge = 'Mandatory Requirement Unmet';
  } else if (eligibility.status === 'PENDING_VERIFICATION') {
    // RFC Rule: Preserve raw score with Verification Required flag; do NOT reject
    displayedScore = rawScore;
    tier = getTierName(rawScore);
    badge = 'Verification Required';
  } else {
    displayedScore = rawScore;
    tier = getTierName(rawScore);
    badge = null;
  }

  return {
    rawScore,
    displayedScore,
    tier,
    badge,
    eligibility
  };
}

function getTierName(score) {
  if (score >= 80) return 'Strong Match';
  if (score >= 60) return 'Good Match';
  if (score >= 40) return 'Potential Match';
  return 'Skills Gap';
}

export const APPLICATION_DECISION = {
  ADVANCE: 'ADVANCE',
  HOLD_FOR_REVIEW: 'HOLD_FOR_REVIEW',
  DISQUALIFIED: 'DISQUALIFIED'
};

/**
 * Resolves the 3-output evaluation model recommended for architectural independence:
 * Output 1: jobFitScore (continuous 0-100%, preserved without artificial caps)
 * Output 2: mandatoryEligibility (ELIGIBLE | INELIGIBLE | PENDING_VERIFICATION)
 * Output 3: applicationDecision (ADVANCE | HOLD_FOR_REVIEW | DISQUALIFIED)
 *
 * @param {number} rawScore - Numerical calculated match score (0-100)
 * @param {Record<string, 'MET' | 'NOT_MET' | 'UNKNOWN'>} requirementStates - Qualification states
 * @param {Object} [options]
 * @param {number} [options.minimumPassingScore=60] - Minimum match score required to advance eligible candidates
 * @returns {Object} { jobFitScore, tier, eligibility, decision, explanation }
 */
export function resolveThreeOutputAssessment(rawScore, requirementStates = {}, options = {}) {
  const { minimumPassingScore = 60 } = options;
  const eligibility = evaluateMandatoryEligibility(requirementStates);

  let decision;
  let explanation;

  if (eligibility.status === QUALIFICATION_STATES.NOT_MET || eligibility.status === 'INELIGIBLE') {
    decision = APPLICATION_DECISION.DISQUALIFIED;
    explanation = `Candidate does not satisfy non-negotiable mandatory requirement(s): ${eligibility.unmetRequirements.join(', ')}.`;
  } else if (eligibility.status === QUALIFICATION_STATES.UNKNOWN || eligibility.status === 'PENDING_VERIFICATION') {
    decision = APPLICATION_DECISION.HOLD_FOR_REVIEW;
    explanation = `Mandatory requirement verification needed for: ${eligibility.unknownRequirements.join(', ')}. Score preserved pending human review.`;
  } else {
    // ELIGIBLE
    if (rawScore >= minimumPassingScore) {
      decision = APPLICATION_DECISION.ADVANCE;
      explanation = `Candidate satisfies all mandatory requirements and meets/exceeds the job-fit threshold (${rawScore}% >= ${minimumPassingScore}%).`;
    } else {
      decision = APPLICATION_DECISION.DISQUALIFIED;
      explanation = `Candidate satisfies mandatory requirements but does not meet the job-fit score threshold (${rawScore}% < ${minimumPassingScore}%).`;
    }
  }

  return {
    jobFitScore: rawScore,
    tier: getTierName(rawScore),
    eligibility,
    decision,
    explanation
  };
}

/**
 * Validates and formats a newly entered pilot case.
 *
 * @param {Object} rawCase
 * @returns {Object} { isValid, errors, formattedCase }
 */
export function formatAndValidatePilotCase(rawCase) {
  const validation = validateBenchmarkCase(rawCase);
  return {
    isValid: validation.isValid,
    errors: validation.errors,
    formattedCase: validation.isValid ? rawCase : null
  };
}

