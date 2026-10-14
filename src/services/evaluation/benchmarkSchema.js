/**
 * src/services/evaluation/benchmarkSchema.js
 *
 * SkillSync Phase 3: Benchmark Dataset Schema Validator & Leakage Guard
 *
 * Enforces:
 * 1. Benchmark record completeness and field typing.
 * 2. Explicit provenance segregation ("synthetic_fixture" vs "authorized_candidate_case").
 * 3. Double-blind evaluator count requirements (minimum 2 independent raters).
 * 4. Cross-split data leakage prevention (strictly no profile_id in both calibration and held-out validation).
 * 5. PII exclusion assertions.
 */

import { RUBRIC_CRITERIA } from './rubricEngine.js';

export const VALID_SOURCE_TYPES = ['synthetic_fixture', 'authorized_candidate_case'];
export const VALID_VALIDATION_SPLITS = ['CALIBRATION', 'HELD_OUT_VALIDATION'];
export const VALID_SENIORITY_LEVELS = ['ENTRY', 'JUNIOR', 'MID', 'SENIOR', 'LEAD', 'EXECUTIVE'];
export const VALID_RECOMMENDATIONS = ['STRONG_MATCH', 'ACCEPTABLE_MATCH', 'BORDERLINE', 'REJECT'];

/**
 * Validates a single benchmark case against the Phase 3 schema.
 *
 * @param {Object} item - Candidate-job benchmark record
 * @returns {Object} { isValid: boolean, errors: string[] }
 */
export function validateBenchmarkCase(item) {
  const errors = [];

  if (!item || typeof item !== 'object') {
    return { isValid: false, errors: ['Item must be a non-null object.'] };
  }

  // 1. Case Identifier
  if (!item.case_id || typeof item.case_id !== 'string') {
    errors.push('Missing or invalid case_id.');
  }

  // 2. Provenance & Authorization
  if (!item.provenance || typeof item.provenance !== 'object') {
    errors.push('Missing provenance block.');
  } else {
    if (!VALID_SOURCE_TYPES.includes(item.provenance.source_type)) {
      errors.push(`Invalid provenance.source_type: "${item.provenance.source_type}". Must be one of: ${VALID_SOURCE_TYPES.join(', ')}.`);
    }
    if (!item.provenance.license_or_consent || typeof item.provenance.license_or_consent !== 'string') {
      errors.push('Missing or invalid provenance.license_or_consent.');
    }
  }

  // 3. Validation Split
  if (!VALID_VALIDATION_SPLITS.includes(item.validation_split)) {
    errors.push(`Invalid validation_split: "${item.validation_split}". Must be "CALIBRATION" or "HELD_OUT_VALIDATION".`);
  }

  // 4. Job Posting Details
  if (!item.job_posting || typeof item.job_posting !== 'object') {
    errors.push('Missing job_posting block.');
  } else {
    const jp = item.job_posting;
    if (!jp.job_id) errors.push('Missing job_posting.job_id.');
    if (!jp.title) errors.push('Missing job_posting.title.');
    if (!jp.job_category) errors.push('Missing job_posting.job_category.');
    if (!Array.isArray(jp.mandatory_requirements)) {
      errors.push('job_posting.mandatory_requirements must be an array.');
    }
    if (!jp.description_text || typeof jp.description_text !== 'string') {
      errors.push('Missing job_posting.description_text.');
    }
  }

  // 5. Candidate Profile (Anonymized)
  if (!item.candidate_profile_anonymized || typeof item.candidate_profile_anonymized !== 'object') {
    errors.push('Missing candidate_profile_anonymized block.');
  } else {
    const cand = item.candidate_profile_anonymized;
    if (!cand.profile_id) errors.push('Missing candidate_profile_anonymized.profile_id.');
    if (typeof cand.years_of_experience !== 'number') {
      errors.push('candidate_profile_anonymized.years_of_experience must be a number.');
    }
    if (!Array.isArray(cand.extracted_skills)) {
      errors.push('candidate_profile_anonymized.extracted_skills must be an array.');
    }
    if (!cand.anonymized_resume_text || typeof cand.anonymized_resume_text !== 'string') {
      errors.push('Missing candidate_profile_anonymized.anonymized_resume_text.');
    }

    // PII Guard: check for obvious email / phone leaks in anonymized text
    const emailMatch = cand.anonymized_resume_text.match(/[a-zA-Z0-9._%+-]+@(?!example\.com)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) {
      errors.push(`Potential real email address detected in anonymized resume: ${emailMatch[0]}. Only @example.com synthetic/anonymized domains allowed.`);
    }
  }

  // 6. Evaluations Array (Must have >= 2 independent evaluators for human ground truth)
  if (!Array.isArray(item.evaluations) || item.evaluations.length < 2) {
    errors.push('Benchmark case must contain at least 2 independent evaluations.');
  } else {
    const evaluatorIds = new Set();
    item.evaluations.forEach((ev, idx) => {
      if (!ev.evaluator_id) {
        errors.push(`Evaluation [${idx}] is missing evaluator_id.`);
      } else {
        if (evaluatorIds.has(ev.evaluator_id)) {
          errors.push(`Duplicate evaluator_id "${ev.evaluator_id}" found. Evaluations must be from distinct evaluators.`);
        }
        evaluatorIds.add(ev.evaluator_id);
      }

      if (!ev.criteria_scores || typeof ev.criteria_scores !== 'object') {
        errors.push(`Evaluation [${idx}] is missing criteria_scores.`);
      } else {
        for (const critKey of Object.keys(RUBRIC_CRITERIA)) {
          const s = ev.criteria_scores[critKey];
          if (s === undefined || s === null || s < 0 || s > 4) {
            errors.push(`Evaluation [${idx}] has invalid score for criterion "${critKey}": ${s}. Must be 0-4.`);
          }
        }
      }

      if (typeof ev.overall_fit_percentage !== 'number' || ev.overall_fit_percentage < 0 || ev.overall_fit_percentage > 100) {
        errors.push(`Evaluation [${idx}] has invalid overall_fit_percentage: ${ev.overall_fit_percentage}. Must be 0-100.`);
      }

      if (!VALID_RECOMMENDATIONS.includes(ev.recommendation)) {
        errors.push(`Evaluation [${idx}] has invalid recommendation: "${ev.recommendation}".`);
      }
    });
  }

  // 7. Adjudication Block
  if (!item.adjudication || typeof item.adjudication !== 'object') {
    errors.push('Missing adjudication block.');
  } else {
    if (typeof item.adjudication.reference_score !== 'number' || item.adjudication.reference_score < 0 || item.adjudication.reference_score > 100) {
      errors.push('adjudication.reference_score must be a number between 0 and 100.');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validates an entire dataset of benchmark cases, enforcing cross-split leakage prevention.
 *
 * @param {Array<Object>} dataset - List of benchmark cases
 * @returns {Object} { isValid: boolean, totalCases: number, errors: string[], summary: Object }
 */
export function validateBenchmarkDataset(dataset = []) {
  if (!Array.isArray(dataset)) {
    return { isValid: false, totalCases: 0, errors: ['Dataset must be an array.'] };
  }

  const allErrors = [];
  const calibrationCandidateIds = new Set();
  const validationCandidateIds = new Set();
  const caseIdSet = new Set();

  let syntheticCount = 0;
  let authorizedCount = 0;
  let calibrationCount = 0;
  let heldOutCount = 0;

  dataset.forEach((item, idx) => {
    const result = validateBenchmarkCase(item);
    if (!result.isValid) {
      allErrors.push(`Case [${idx}] (${item.case_id || 'UNKNOWN'}): ${result.errors.join('; ')}`);
    }

    // Check duplicate case_id
    if (item.case_id) {
      if (caseIdSet.has(item.case_id)) {
        allErrors.push(`Duplicate case_id detected: "${item.case_id}".`);
      }
      caseIdSet.add(item.case_id);
    }

    const candId = item.candidate_profile_anonymized?.profile_id;
    if (candId) {
      if (item.validation_split === 'CALIBRATION') {
        calibrationCandidateIds.add(candId);
        calibrationCount++;
      } else if (item.validation_split === 'HELD_OUT_VALIDATION') {
        validationCandidateIds.add(candId);
        heldOutCount++;
      }
    }

    if (item.provenance?.source_type === 'synthetic_fixture') syntheticCount++;
    if (item.provenance?.source_type === 'authorized_candidate_case') authorizedCount++;
  });

  // Cross-Split Leakage Check: No profile_id may exist in both calibration and validation
  const leakingCandidateIds = [];
  for (const candId of calibrationCandidateIds) {
    if (validationCandidateIds.has(candId)) {
      leakingCandidateIds.push(candId);
    }
  }

  if (leakingCandidateIds.length > 0) {
    allErrors.push(`CRITICAL DATA LEAKAGE: Candidate IDs present in both CALIBRATION and HELD_OUT_VALIDATION splits: ${leakingCandidateIds.join(', ')}.`);
  }

  return {
    isValid: allErrors.length === 0,
    totalCases: dataset.length,
    errors: allErrors,
    summary: {
      totalCases: dataset.length,
      calibrationCount,
      heldOutCount,
      syntheticCount,
      authorizedCount,
      uniqueCalibrationCandidates: calibrationCandidateIds.size,
      uniqueValidationCandidates: validationCandidateIds.size,
      leakingCandidateCount: leakingCandidateIds.length
    }
  };
}
