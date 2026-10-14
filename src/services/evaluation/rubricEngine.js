/**
 * src/services/evaluation/rubricEngine.js
 *
 * SkillSync Phase 3: HR Evaluation Rubric & Benchmark Calculation Engine
 *
 * Implements:
 * 1. Criterion score validation and normalization against 5-level rubric anchors (0-4).
 * 2. Mandatory qualification gating (caps at 35% on failure, 50% on unverified).
 * 3. Overall candidate fit score calculation (0-100%).
 * 4. Inter-rater agreement analysis (divergence detection, adjudication triggering).
 * 5. Benchmark metric computation (MAE, RMSE, error bands) for Phase 4 baseline comparison.
 *
 * Note: This engine operates strictly on HR rubric definitions and is completely
 * decoupled from the production matching engine and database RPCs.
 */

export const RUBRIC_CRITERIA = {
  REQ_SKILLS: {
    key: 'REQ_SKILLS',
    name: 'Required Skills & Core Competencies',
    weight: 0.30,
    description: 'Mastery of core skills designated as mandatory by the job specification.'
  },
  EXP_RELEVANCE: {
    key: 'EXP_RELEVANCE',
    name: 'Relevant Work Experience',
    weight: 0.25,
    description: 'Duration, seniority, domain alignment, and operational scale of prior employment.'
  },
  EVIDENCE_ACHIEVE: {
    key: 'EVIDENCE_ACHIEVE',
    name: 'Job-Related Evidence & Achievements',
    weight: 0.15,
    description: 'Concrete accomplishments, metrics, production outcomes, and deliverables.'
  },
  TRANS_SKILLS: {
    key: 'TRANS_SKILLS',
    name: 'Transferable Skills & Problem Solving',
    weight: 0.15,
    description: 'Adjacent frameworks, versatility, analytical ability, problem-solving.'
  },
  EDU_QUAL: {
    key: 'EDU_QUAL',
    name: 'Education & Relevant Qualifications',
    weight: 0.10,
    description: 'Relevant degrees, accredited technical programs, or demonstrated equivalent mastery.'
  },
  CERTS_CRED: {
    key: 'CERTS_CRED',
    name: 'Certifications & Credentials',
    weight: 0.05,
    description: 'Professional licenses, accredited certifications, and domain badges.'
  }
};

export const RECOMMENDATION_THRESHOLDS = {
  STRONG_MATCH: 85,
  ACCEPTABLE_MATCH: 70,
  BORDERLINE: 55,
};

/**
 * Validates and calculates an evaluator's overall fit percentage from criterion scores.
 *
 * @param {Object} criteriaScores - Map of criterion keys to ratings (0-4)
 * @param {Object} options - Optional flags (e.g. mandatoryGatingStatus)
 * @returns {Object} { overallScore: number, recommendation: string, isGated: boolean, gatingReason: string|null }
 */
export function calculateEvaluatorScore(criteriaScores = {}, options = {}) {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [key, criterion] of Object.entries(RUBRIC_CRITERIA)) {
    const rawScore = criteriaScores[key];
    if (rawScore === undefined || rawScore === null || isNaN(rawScore)) {
      throw new Error(`Missing score for rubric criterion: ${key}`);
    }
    if (rawScore < 0 || rawScore > 4) {
      throw new Error(`Invalid score ${rawScore} for criterion ${key}. Must be between 0 and 4.`);
    }

    // Normalize 0-4 scale to 0.0-1.0
    const normalizedRatio = rawScore / 4;
    weightedSum += normalizedRatio * criterion.weight;
    totalWeight += criterion.weight;
  }

  // Raw overall percentage (0-100)
  let overallScore = Math.round((weightedSum / totalWeight) * 100);

  // Apply Mandatory Qualification Gating
  let isGated = false;
  let gatingReason = null;

  if (options.mandatoryGatingStatus === 'DEMONSTRABLY_LACKING') {
    isGated = true;
    gatingReason = 'Candidate demonstrably lacks one or more mandatory requirements.';
    overallScore = Math.min(overallScore, 35);
  } else if (options.mandatoryGatingStatus === 'INSUFFICIENT_EVIDENCE') {
    isGated = true;
    gatingReason = 'Insufficient evidence in resume to verify one or more mandatory requirements.';
    overallScore = Math.min(overallScore, 50);
  }

  // Derive recommendation tier
  let recommendation = 'REJECT';
  if (overallScore >= RECOMMENDATION_THRESHOLDS.STRONG_MATCH && !isGated) {
    recommendation = 'STRONG_MATCH';
  } else if (overallScore >= RECOMMENDATION_THRESHOLDS.ACCEPTABLE_MATCH && !isGated) {
    recommendation = 'ACCEPTABLE_MATCH';
  } else if (overallScore >= RECOMMENDATION_THRESHOLDS.BORDERLINE && options.mandatoryGatingStatus !== 'DEMONSTRABLY_LACKING') {
    recommendation = 'BORDERLINE';
  } else {
    recommendation = 'REJECT';
  }

  return {
    overallScore,
    recommendation,
    isGated,
    gatingReason
  };
}

/**
 * Analyzes agreement between two independent HR evaluations.
 * Flags whether senior adjudication is required.
 *
 * @param {Object} eval1 - First evaluation { overallScore, recommendation, criteriaScores }
 * @param {Object} eval2 - Second evaluation { overallScore, recommendation, criteriaScores }
 * @returns {Object} Agreement analysis and adjudication trigger status
 */
export function analyzeRaterAgreement(eval1, eval2) {
  if (!eval1 || !eval2) {
    throw new Error('Both evaluation 1 and evaluation 2 must be provided for agreement analysis.');
  }

  const score1 = Number(eval1.overall_fit_percentage ?? eval1.overallScore);
  const score2 = Number(eval2.overall_fit_percentage ?? eval2.overallScore);
  const diff = Math.abs(score1 - score2);

  const rec1 = eval1.recommendation;
  const rec2 = eval2.recommendation;

  // Criteria divergence breakdown
  const criteriaDifferences = {};
  for (const key of Object.keys(RUBRIC_CRITERIA)) {
    const s1 = eval1.criteria_scores?.[key] ?? 0;
    const s2 = eval2.criteria_scores?.[key] ?? 0;
    criteriaDifferences[key] = Math.abs(s1 - s2);
  }

  // Determine if adjudication is required:
  // 1. Score divergence > 15 percentage points
  // 2. Conflicting binary decision (one says REJECT, the other ACCEPTABLE or STRONG)
  const isOpposingDecision =
    (rec1 === 'REJECT' && (rec2 === 'ACCEPTABLE_MATCH' || rec2 === 'STRONG_MATCH')) ||
    (rec2 === 'REJECT' && (rec1 === 'ACCEPTABLE_MATCH' || rec1 === 'STRONG_MATCH'));

  const scoreDivergenceExceeded = diff > 15.0;
  const adjudicationRequired = scoreDivergenceExceeded || isOpposingDecision;

  let consensusScore = null;
  if (!adjudicationRequired) {
    consensusScore = Math.round((score1 + score2) / 2);
  }

  return {
    evaluator1Score: score1,
    evaluator2Score: score2,
    scoreDifference: Math.round(diff * 10) / 10,
    criteriaDifferences,
    isOpposingDecision,
    adjudicationRequired,
    consensusScore,
    adjudicationTriggers: [
      ...(scoreDivergenceExceeded ? [`Score difference of ${diff.toFixed(1)}% exceeds the 15.0% threshold.`] : []),
      ...(isOpposingDecision ? [`Conflicting recommendations: "${rec1}" vs "${rec2}".`] : [])
    ]
  };
}

/**
 * Resolves or confirms the final authoritative HR reference rating (H_i).
 *
 * @param {Object} benchmarkCase - BenchmarkCase object
 * @returns {number} Final HR reference score (0-100)
 */
export function resolveReferenceScore(benchmarkCase) {
  if (benchmarkCase.adjudication?.is_adjudicated && typeof benchmarkCase.adjudication.reference_score === 'number') {
    return benchmarkCase.adjudication.reference_score;
  }

  const evals = benchmarkCase.evaluations || [];
  if (evals.length >= 2) {
    const agreement = analyzeRaterAgreement(evals[0], evals[1]);
    if (agreement.adjudicationRequired) {
      if (typeof benchmarkCase.adjudication?.reference_score === 'number') {
        return benchmarkCase.adjudication.reference_score;
      }
      throw new Error(`Case ${benchmarkCase.case_id} requires adjudication before a reference score can be resolved.`);
    }
    return agreement.consensusScore;
  } else if (evals.length === 1) {
    return evals[0].overall_fit_percentage;
  }

  throw new Error(`Case ${benchmarkCase.case_id} does not contain valid evaluations.`);
}

/**
 * Computes comparative evaluation metrics between system scores (S_i) and HR reference scores (H_i).
 * Used by Phase 4 Baseline Study.
 *
 * @param {Array<{ systemScore: number, referenceScore: number, caseId?: string, category?: string }>} comparisons
 * @returns {Object} Metric summary (MAE, RMSE, error bands, sample size)
 */
export function computeBaselineMetrics(comparisons = []) {
  if (!comparisons || comparisons.length === 0) {
    return {
      sampleSize: 0,
      mae: 0,
      rmse: 0,
      accuracyWithin5: 0,
      accuracyWithin10: 0,
      accuracyWithin15: 0,
      meanSignedDifference: 0,
      categoryBreakdown: {}
    };
  }

  const n = comparisons.length;
  let totalAbsError = 0;
  let totalSqError = 0;
  let totalSignedDiff = 0;
  let within5Count = 0;
  let within10Count = 0;
  let within15Count = 0;

  const categoryMap = {};

  for (const comp of comparisons) {
    const s = Number(comp.systemScore);
    const h = Number(comp.referenceScore);
    const diff = s - h;
    const absDiff = Math.abs(diff);

    totalAbsError += absDiff;
    totalSqError += diff * diff;
    totalSignedDiff += diff;

    if (absDiff <= 5) within5Count++;
    if (absDiff <= 10) within10Count++;
    if (absDiff <= 15) within15Count++;

    const cat = comp.category || 'General';
    if (!categoryMap[cat]) {
      categoryMap[cat] = { count: 0, totalAbsError: 0 };
    }
    categoryMap[cat].count++;
    categoryMap[cat].totalAbsError += absDiff;
  }

  const mae = Math.round((totalAbsError / n) * 100) / 100;
  const rmse = Math.round(Math.sqrt(totalSqError / n) * 100) / 100;
  const meanSignedDiff = Math.round((totalSignedDiff / n) * 100) / 100;

  const categoryBreakdown = {};
  for (const [cat, data] of Object.entries(categoryMap)) {
    categoryBreakdown[cat] = {
      count: data.count,
      mae: Math.round((data.totalAbsError / data.count) * 100) / 100
    };
  }

  return {
    sampleSize: n,
    mae,
    rmse,
    accuracyWithin5: Math.round((within5Count / n) * 1000) / 10,
    accuracyWithin10: Math.round((within10Count / n) * 1000) / 10,
    accuracyWithin15: Math.round((within15Count / n) * 1000) / 10,
    meanSignedDifference: meanSignedDiff,
    categoryBreakdown
  };
}
