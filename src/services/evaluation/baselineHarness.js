/**
 * src/services/evaluation/baselineHarness.js
 *
 * SkillSync Phase 4: Baseline Job-Fit Accuracy Evaluation Harness
 *
 * Implements:
 * 1. Safe loading and validation of benchmark datasets.
 * 2. Strict segregation of genuine HR cases from synthetic fixtures.
 * 3. Authoritative scoring path identification (migration 20261004000000_fix_compute_and_save_job_match_canonical.sql).
 * 4. Production safety guards ensuring experimental cases are never written to production.
 * 5. Mandatory qualification gating separation from formula score divergence (Rule 3).
 * 6. Comparative evaluation metrics calculation (MAE, RMSE, ±5%, ±10%, ±15% bands).
 */

import fs from 'fs';
import { validateBenchmarkDataset, validateBenchmarkCase } from './benchmarkSchema.js';
import {
  computeBaselineMetrics,
  analyzeRaterAgreement,
  resolveReferenceScore
} from './rubricEngine.js';

export const AUTHORITATIVE_SCORING_VERSION = '20261004000000_fix_compute_and_save_job_match_canonical.sql';

export const SCORING_MODEL_METADATA = {
  version: AUTHORITATIVE_SCORING_VERSION,
  canonicalFunction: 'public.compute_and_save_job_match(p_job_id UUID)',
  modelType: 'Dynamic Requirement-Aware Normalization (6-Factor)',
  factors: {
    requiredSkills: { standardWeight: 0.35, dynamic: false },
    transferableSkills: { standardWeight: 0.15, dynamic: false },
    education: { standardWeight: 0.15, dynamic: false },
    experience: { standardWeight: 0.15, dynamic: false },
    credentials: { standardWeight: 0.00, dynamic: true, conditionalWeight: 0.10 },
    semantic: { standardWeight: 0.00, dynamic: true, conditionalWeight: 0.20 }
  },
  persistsTo: 'public.job_matches',
  requiresAuth: true
};

/**
 * Loads and validates a benchmark dataset from a file or object.
 *
 * @param {string|Array<Object>} source - Filepath or JSON array
 * @returns {Object} { dataset, validation, stats }
 */
export function loadBenchmarkDataset(source) {
  let dataset = [];
  if (typeof source === 'string') {
    if (!fs.existsSync(source)) {
      throw new Error(`Benchmark dataset file not found: ${source}`);
    }
    const raw = fs.readFileSync(source, 'utf8');
    dataset = JSON.parse(raw);
  } else if (Array.isArray(source)) {
    dataset = source;
  } else {
    throw new Error('Invalid benchmark dataset source. Must be a filepath or array.');
  }

  const validation = validateBenchmarkDataset(dataset);
  if (!validation.isValid) {
    throw new Error(`Benchmark dataset validation failed:\n${validation.errors.join('\n')}`);
  }

  let genuineCount = 0;
  let syntheticCount = 0;
  let calibrationCount = 0;
  let heldOutCount = 0;

  dataset.forEach((item) => {
    if (item.provenance?.source_type === 'authorized_candidate_case') genuineCount++;
    if (item.provenance?.source_type === 'synthetic_fixture') syntheticCount++;
    if (item.validation_split === 'CALIBRATION') calibrationCount++;
    if (item.validation_split === 'HELD_OUT_VALIDATION') heldOutCount++;
  });

  return {
    dataset,
    validation,
    stats: {
      totalCases: dataset.length,
      genuineCount,
      syntheticCount,
      calibrationCount,
      heldOutCount,
      hasGenuineData: genuineCount > 0
    }
  };
}

/**
 * Executes a safety check against a target database environment.
 * Ensures that benchmark matches cannot be written to production.
 *
 * @param {string} supabaseUrl - Target database URL
 * @returns {boolean} True if safe non-production environment
 */
export function assertSafeNonProductionEnvironment(supabaseUrl) {
  if (!supabaseUrl) return true; // Offline / synthetic evaluation harness mode

  const isLocal = supabaseUrl.includes('127.0.0.1') || supabaseUrl.includes('localhost');
  const isPreviewOrStaging = supabaseUrl.includes('preview') || supabaseUrl.includes('staging');

  if (!isLocal && !isPreviewOrStaging) {
    throw new Error(
      `SAFETY VIOLATION: Refusing to execute benchmark RPC against potential production URL "${supabaseUrl}". ` +
      'Authoritative matching RPC modifies public.job_matches and must run only in an isolated local/staging environment.'
    );
  }

  return true;
}

/**
 * Evaluates benchmark cases against HR reference ground truth.
 * Distinguishes between standard scoring divergence and mandatory qualification failures (Rule 3).
 *
 * @param {Array<Object>} cases - Array of BenchmarkCase items
 * @param {Object} options - Configuration options
 * @returns {Object} Comprehensive evaluation results
 */
export function evaluateBenchmarkAccuracy(cases = [], options = {}) {
  const eligibleComparisons = [];
  const excludedCases = [];
  const mandatoryGatedCases = [];
  const compliantCases = [];
  const evaluatorDifferences = [];

  let syntheticCasesCount = 0;
  let genuineCasesCount = 0;

  for (const item of cases) {
    const isSynthetic = item.provenance?.source_type === 'synthetic_fixture';
    if (isSynthetic) syntheticCasesCount++;
    else genuineCasesCount++;

    // Calculate evaluator agreement
    const evals = item.evaluations || [];
    if (evals.length >= 2) {
      const agreement = analyzeRaterAgreement(evals[0], evals[1]);
      evaluatorDifferences.push(agreement.scoreDifference);
    }

    // Resolve authoritative HR reference score
    let referenceScore = null;
    try {
      referenceScore = resolveReferenceScore(item);
    } catch (err) {
      excludedCases.push({
        case_id: item.case_id,
        reason: `Could not resolve reference score: ${err.message}`
      });
      continue;
    }

    // Determine system score (S_i)
    // In Phase 4, S_i is either provided in system_baseline.skillsync_score or simulated/provided via options
    let systemScore = item.system_baseline?.skillsync_score;
    if ((systemScore === null || systemScore === undefined) && options.systemScores?.[item.case_id] !== undefined) {
      systemScore = options.systemScores[item.case_id];
    }

    if (systemScore === null || systemScore === undefined) {
      excludedCases.push({
        case_id: item.case_id,
        reason: 'Missing system score (S_i). System score must be recorded before evaluation.'
      });
      continue;
    }

    // Determine mandatory gating status
    const mandatoryStatus =
      item.mandatory_gating_status ||
      (evals[0]?.recommendation === 'REJECT' && evals[1]?.recommendation === 'REJECT' && referenceScore <= 35 ? 'DEMONSTRABLY_LACKING' : 'COMPLIANT');

    const compRecord = {
      caseId: item.case_id,
      jobId: item.job_posting?.job_id,
      category: item.job_posting?.job_category || 'General',
      seniority: item.job_posting?.seniority_level || 'MID',
      systemScore,
      referenceScore,
      scoreDifference: systemScore - referenceScore,
      absoluteError: Math.abs(systemScore - referenceScore),
      mandatoryStatus,
      isSynthetic,
      validationSplit: item.validation_split
    };

    eligibleComparisons.push(compRecord);

    if (mandatoryStatus !== 'COMPLIANT') {
      mandatoryGatedCases.push(compRecord);
    } else {
      compliantCases.push(compRecord);
    }
  }

  // Compute metrics for all eligible cases
  const overallMetrics = computeBaselineMetrics(eligibleComparisons);

  // Compute metrics separately for compliant cases vs mandatory-gated cases (Rule 3)
  const compliantMetrics = computeBaselineMetrics(compliantCases);
  const gatedMetrics = computeBaselineMetrics(mandatoryGatedCases);

  // Evaluator Inter-Rater Reliability (IRR) metrics
  const avgEvaluatorDifference = evaluatorDifferences.length > 0
    ? Math.round((evaluatorDifferences.reduce((a, b) => a + b, 0) / evaluatorDifferences.length) * 10) / 10
    : 0;

  return {
    meta: {
      scoringImplementationVersion: AUTHORITATIVE_SCORING_VERSION,
      evaluatedAt: new Date().toISOString(),
      totalCasesSubmitted: cases.length,
      eligibleCasesCount: eligibleComparisons.length,
      excludedCasesCount: excludedCases.length,
      syntheticCasesCount,
      genuineCasesCount,
      isSyntheticOnlyDataset: genuineCasesCount === 0
    },
    evaluatorReliability: {
      averageInterRaterDifference: avgEvaluatorDifference,
      evaluatedCaseCount: evaluatorDifferences.length
    },
    baselineMetrics: {
      overall: overallMetrics,
      compliantCases: compliantMetrics,
      mandatoryGatedCases: gatedMetrics
    },
    comparisons: eligibleComparisons,
    excludedCases
  };
}
