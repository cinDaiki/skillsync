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
