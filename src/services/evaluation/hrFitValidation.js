import { readJobMatchEvidence } from "../jobMatchEvidence.js";
/**
 * SkillSync — HR Job-Fit Validation (display + offline benchmarking only)
 * Never alters `job_matches`, hiring decisions, or private recruiter records.
 * Culture/personality cannot be inferred from resumes or job-fit scores.
 */

export const HR_FIT_VALIDATION_VERSION = 'hr-fit-validation-v1';
export const QUALIFICATION_THRESHOLD = 70;

const percent = x => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 100;

/** No client-estimated, semantic-only, or fabricated fallback percentages. */
export function readAuthoritativeJobMatch(application) {
  const match = readJobMatchEvidence(application);
  return { score: match.score, source: match.score === null ? 'unavailable' : match.historical ? 'application_snapshot' : 'job_matches', available: match.score !== null };
}

export function qualificationTier(score) {
  if (!percent(score)) return 'Not evaluated';
  if (score >= 80) return 'Strong match';
  if (score >= 60) return 'Good match';
  if (score >= 40) return 'Potential match';
  return 'Skills gap';
}

/**
 * Recruiter role fit stars are ordinal, NOT percentage ground truth.
 * This is an explanatory prompt for manual review, never an accuracy metric.
 */
export function reviewSignal(systemScore, roleRating) {
  if (!percent(systemScore)) {
    return { status: 'not_evaluated', title: 'System match unavailable', message: 'Compute the authoritative Job Match before comparing it with an HR assessment.' };
  }
  if (!Number.isInteger(roleRating) || roleRating < 1 || roleRating > 5) {
    return { status: 'awaiting_hr', title: 'HR review not yet provided', message: 'Role-specific evidence from an interview or work sample is needed to compare assessments.' };
  }
  if ((systemScore >= 80 && roleRating <= 2) || (systemScore < 40 && roleRating >= 4)) {
    return { status: 'disagreement', title: 'Review the difference', message: 'The system and recruiter signals differ. Check mandatory qualifications, the submitted resume, and the recruiter’s job-related evidence.' };
  }
  if ((systemScore >= 60 && roleRating >= 4) || (systemScore < 40 && roleRating <= 2)) {
    return { status: 'broad_agreement', title: 'Signals broadly align', message: 'The system and recruiter assessment point in a similar direction; this alone does not establish predictive accuracy.' };
  }
  return { status: 'needs_review', title: 'Further review may help', message: 'Evidence is mixed or intermediate. Treat the recruiter’s assessment as independent rather than changing the Job Match score.' };
}

/**
 * Workplace alignment may be described only when BOTH sides explicitly supplied
 * comparable preferences. We never use protected traits or inferred personality.
 */
export function workplaceAlignment(candidatePreferences = null, jobRequirements = null) {
  const c = candidatePreferences || {};
  const j = jobRequirements || {};
  const results = [];
  for (const field of ['work_setup', 'schedule', 'travel_requirement']) {
    const offered = typeof c[field] === 'string' ? c[field].trim().toLowerCase() : '';
    const required = typeof j[field] === 'string' ? j[field].trim().toLowerCase() : '';
    if (!offered || !required) continue;
    results.push({ field, aligned: offered === required });
  }
  if (!results.length) return { status: 'not_assessed', label: 'Not assessed', evidenceCount: 0 };
  if (results.some(x => !x.aligned)) return { status: 'needs_discussion', label: 'Needs discussion', evidenceCount: results.length, results };
  return { status: 'aligned', label: 'Working arrangements align', evidenceCount: results.length, results };
}

const round = n => Math.round(n * 100) / 100;
const safeRatio = (numerator, denominator) => denominator ? round(100 * numerator / denominator) : null;

/**
 * Offline evaluation of resolved independent HR reference scores, not star ratings.
 * Inputs must already have been validated against benchmarkSchema and benchmarkHarness.
 * Synthetic/consented records are NEVER silently mixed into real-world accuracy.
 */
export function calculateValidationMetrics(comparisons = [], { threshold = QUALIFICATION_THRESHOLD, byCategory = true } = {}) {
  if (!percent(threshold)) throw new Error('threshold must be a 0..100 percentage');
  const records = comparisons.filter(x => percent(x.systemScore) && percent(x.referenceScore) && x.mandatoryStatus !== 'INSUFFICIENT_EVIDENCE');
  let tp = 0, fp = 0, fn = 0, tn = 0, abs = 0, sq = 0;
  const disagreements = [];
  for (const r of records) {
    const predicted = r.systemScore >= threshold;
    const hrQualified = r.referenceScore >= threshold && r.mandatoryStatus !== 'DEMONSTRABLY_LACKING';
    if (predicted && hrQualified) tp++;
    else if (predicted && !hrQualified) fp++;
    else if (!predicted && hrQualified) fn++;
    else tn++;
    const diff = r.systemScore - r.referenceScore;
    abs += Math.abs(diff);
    sq += diff * diff;
    if (predicted !== hrQualified) disagreements.push({ caseId: r.caseId, jobId: r.jobId, category: r.category, type: predicted ? 'possible_false_positive' : 'possible_false_negative', absoluteError: round(Math.abs(diff)), mandatoryStatus: r.mandatoryStatus });
  }
  const categoryMetrics = {};
  if (byCategory) {
    const groups = new Map();
    for (const rec of records) {
      const name = rec.category || 'Uncategorized';
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(rec);
    }
    for (const [category, group] of groups) {
      categoryMetrics[category] = calculateValidationMetrics(group, {threshold, byCategory:false});
    }
  }
  return {
    evaluated: records.length,
    excluded: comparisons.length - records.length,
    byCategory: categoryMetrics,
    threshold,
    confusion: { tp, fp, fn, tn },
    precision: safeRatio(tp, tp + fp),
    recall: safeRatio(tp, tp + fn),
    f1: tp + fp + fn ? round(100 * 2 * tp / (2 * tp + fp + fn)) : null,
    mae: records.length ? round(abs / records.length) : null,
    rmse: records.length ? round(Math.sqrt(sq / records.length)) : null,
    disagreements
  };
}

export function summarizeHeldOutValidation(baselineResult, { minimumGenuineCases = 20 } = {}) {
  const comparisons = baselineResult?.comparisons || [];
  const synthetic = comparisons.filter(x => x.isSynthetic);
  const genuine = comparisons.filter(x => !x.isSynthetic && x.validationSplit === 'HELD_OUT_VALIDATION');
  const calibration = comparisons.filter(x => !x.isSynthetic && x.validationSplit === 'CALIBRATION');
  const testMetrics = calculateValidationMetrics(genuine);
  const reliable = testMetrics.evaluated >= minimumGenuineCases;
  return {
    status: !testMetrics.evaluated ? 'NO_GENUINE_VALIDATION_DATA' : reliable ? 'VALIDATION_SAMPLE_AVAILABLE' : 'INSUFFICIENT_GENUINE_VALIDATION_DATA',
    reportableAsRealWorldAccuracy: reliable,
    minimumGenuineCases,
    syntheticDiagnostics: calculateValidationMetrics(synthetic),
    calibrationDiagnostics: calculateValidationMetrics(calibration),
    heldOutGenuineMetrics: testMetrics,
    guidance: reliable
      ? 'Report these as held-out HR agreement metrics with sample size and limitations, not hiring prediction probabilities.'
      : 'Insufficient independent, consented HR-reviewed held-out cases. Do not claim proven real-world accuracy.'
  };
}
