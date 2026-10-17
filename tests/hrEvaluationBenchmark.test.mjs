/**
 * tests/hrEvaluationBenchmark.test.mjs
 *
 * SkillSync Phase 3: HR Evaluation Rubric & Benchmark Dataset Test Suite
 *
 * Verifies:
 * 1. Rubric score calculation, weights, and 5-level anchor normalization (0-4).
 * 2. Mandatory qualification gating (DEMONSTRABLY_LACKING caps at 35%, INSUFFICIENT_EVIDENCE caps at 50%).
 * 3. Handling of missing evidence vs demonstrated lack of qualification.
 * 4. Inter-rater agreement analysis and automated adjudication triggering (> 15% diff or opposing decisions).
 * 5. Authoritative HR reference score resolution (H_i).
 * 6. Benchmark schema validation for candidate-job evaluation records.
 * 7. Dataset cross-split leakage prevention (strictly no candidate overlap between calibration and validation).
 * 8. Explicit segregation of synthetic fixtures from genuine human ground truth.
 * 9. Phase 4 baseline evaluation metric calculation (MAE, RMSE, error bands).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  calculateEvaluatorScore,
  analyzeRaterAgreement,
  resolveReferenceScore,
  computeBaselineMetrics,
  RUBRIC_CRITERIA
} from '../src/services/evaluation/rubricEngine.js';
import {
  validateBenchmarkCase,
  validateBenchmarkDataset
} from '../src/services/evaluation/benchmarkSchema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const FIXTURES_PATH = path.join(ROOT_DIR, 'benchmark', 'fixtures', 'synthetic_benchmark_dataset.json');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    throw new Error(message);
  }
  passedTests++;
  console.log(`✓ PASS: ${message}`);
}

async function runTestSuite() {
  console.log('=== RUNNING HR EVALUATION RUBRIC & BENCHMARK DATASET TESTS ===\n');

  // ── Test 1: Rubric Criteria & Weight Normalization ────────────────────────
  console.log('[Test 1] Rubric Criteria Weights & Score Normalization');
  const totalWeight = Object.values(RUBRIC_CRITERIA).reduce((acc, c) => acc + c.weight, 0);
  assert(Math.abs(totalWeight - 1.0) < 0.0001, `Criterion weights sum to 1.0 (Sum: ${totalWeight})`);

  // Perfect 4/4 across all criteria
  const maxScoreResult = calculateEvaluatorScore({
    REQ_SKILLS: 4,
    EXP_RELEVANCE: 4,
    EVIDENCE_ACHIEVE: 4,
    TRANS_SKILLS: 4,
    EDU_QUAL: 4,
    CERTS_CRED: 4
  });
  assert(maxScoreResult.overallScore === 100, `Perfect 4/4 score produces 100% (${maxScoreResult.overallScore})`);
  assert(maxScoreResult.recommendation === 'STRONG_MATCH', 'Perfect score results in STRONG_MATCH recommendation');

  // Baseline 2/4 across all criteria
  const midScoreResult = calculateEvaluatorScore({
    REQ_SKILLS: 2,
    EXP_RELEVANCE: 2,
    EVIDENCE_ACHIEVE: 2,
    TRANS_SKILLS: 2,
    EDU_QUAL: 2,
    CERTS_CRED: 2
  });
  assert(midScoreResult.overallScore === 50, `Uniform 2/4 score produces 50% (${midScoreResult.overallScore})`);

  // Invalid score out-of-range exception handling
  let threwOutOfRange = false;
  try {
    calculateEvaluatorScore({ REQ_SKILLS: 5, EXP_RELEVANCE: 2, EVIDENCE_ACHIEVE: 2, TRANS_SKILLS: 2, EDU_QUAL: 2, CERTS_CRED: 2 });
  } catch (err) {
    threwOutOfRange = true;
  }
  assert(threwOutOfRange, 'Throws error when criterion score exceeds anchor maximum (> 4)');

  // ── Test 2: Mandatory Qualification Gating & Absence of Evidence ──────────
  console.log('\n[Test 2] Mandatory Qualification Gating & Absence of Evidence Rules');

  // Candidate with strong skills (raw ~85%) but DEMONSTRABLY_LACKING a mandatory requirement
  const gatedResult = calculateEvaluatorScore({
    REQ_SKILLS: 4,
    EXP_RELEVANCE: 4,
    EVIDENCE_ACHIEVE: 3,
    TRANS_SKILLS: 3,
    EDU_QUAL: 3,
    CERTS_CRED: 2
  }, { mandatoryGatingStatus: 'DEMONSTRABLY_LACKING' });

  assert(gatedResult.isGated === true, 'Mandatory gating flag is active');
  assert(gatedResult.overallScore <= 35, `Demonstrably lacking mandatory requirement caps score at <= 35% (${gatedResult.overallScore}%)`);
  assert(gatedResult.recommendation === 'REJECT', `Gated failure forces REJECT recommendation (${gatedResult.recommendation})`);

  // Candidate where evidence is simply INSUFFICIENT_EVIDENCE (unmentioned, unverified)
  const unverifiedResult = calculateEvaluatorScore({
    REQ_SKILLS: 4,
    EXP_RELEVANCE: 4,
    EVIDENCE_ACHIEVE: 3,
    TRANS_SKILLS: 3,
    EDU_QUAL: 3,
    CERTS_CRED: 2
  }, { mandatoryGatingStatus: 'INSUFFICIENT_EVIDENCE' });

  assert(unverifiedResult.isGated === true, 'Unverified evidence flag is active');
  assert(unverifiedResult.overallScore === 50, `Insufficient mandatory evidence caps score at exactly 50% pending review (${unverifiedResult.overallScore}%)`);

  // ── Test 3: Inter-Rater Agreement & Adjudication Triggering ────────────────
  console.log('\n[Test 3] Inter-Rater Agreement & Adjudication Triggering');

  // Evaluators in close consensus (85% vs 82%, diff 3% <= 15%)
  const consensusAgreement = analyzeRaterAgreement(
    { overall_fit_percentage: 85, recommendation: 'STRONG_MATCH' },
    { overall_fit_percentage: 82, recommendation: 'STRONG_MATCH' }
  );
  assert(consensusAgreement.adjudicationRequired === false, 'Consensus agreement does NOT trigger adjudication');
  assert(consensusAgreement.consensusScore === 84, `Consensus score is arithmetic mean (${consensusAgreement.consensusScore})`);

  // Evaluators diverging by > 15 percentage points (88% vs 65%, diff 23%)
  const divergentAgreement = analyzeRaterAgreement(
    { overall_fit_percentage: 88, recommendation: 'STRONG_MATCH' },
    { overall_fit_percentage: 65, recommendation: 'BORDERLINE' }
  );
  assert(divergentAgreement.adjudicationRequired === true, 'Score divergence > 15% triggers adjudication');
  assert(divergentAgreement.adjudicationTriggers.length > 0, 'Adjudication trigger reason is recorded');

  // Evaluators with opposing decisions (STRONG_MATCH vs REJECT)
  const opposingDecisionAgreement = analyzeRaterAgreement(
    { overall_fit_percentage: 72, recommendation: 'ACCEPTABLE_MATCH' },
    { overall_fit_percentage: 45, recommendation: 'REJECT' }
  );
  assert(opposingDecisionAgreement.adjudicationRequired === true, 'Opposing recommendations trigger adjudication');
  assert(opposingDecisionAgreement.isOpposingDecision === true, 'isOpposingDecision flag is set');

  // ── Test 4: Authoritative Reference Score Resolution ──────────────────────
  console.log('\n[Test 4] Authoritative Reference Score Resolution (H_i)');

  // Unadjudicated consensus case resolves to mean
  const unadjudicatedCase = {
    case_id: 'CASE-001',
    evaluations: [
      { overall_fit_percentage: 80, recommendation: 'ACCEPTABLE_MATCH' },
      { overall_fit_percentage: 76, recommendation: 'ACCEPTABLE_MATCH' }
    ],
    adjudication: { is_adjudicated: false, reference_score: 78 }
  };
  assert(resolveReferenceScore(unadjudicatedCase) === 78, 'Resolves reference score for consensus case');

  // Adjudicated case resolves to adjudicated reference score
  const adjudicatedCase = {
    case_id: 'CASE-002',
    evaluations: [
      { overall_fit_percentage: 90, recommendation: 'STRONG_MATCH' },
      { overall_fit_percentage: 60, recommendation: 'BORDERLINE' }
    ],
    adjudication: { is_adjudicated: true, reference_score: 75, adjudication_rationale: 'Resolved by senior HR.' }
  };
  assert(resolveReferenceScore(adjudicatedCase) === 75, 'Resolves binding reference score for adjudicated case');

  // ── Test 5: Benchmark Schema Validation ────────────────────────────────────
  console.log('\n[Test 5] Benchmark Schema & Fixture Validation');
  assert(fs.existsSync(FIXTURES_PATH), 'Synthetic benchmark dataset JSON fixture exists');

  const rawFixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));
  assert(Array.isArray(rawFixtures), 'Fixtures file contains an array of cases');
  assert(rawFixtures.length === 10, `Fixtures contain 10 benchmark cases (${rawFixtures.length})`);

  // Validate each individual case
  rawFixtures.forEach((caseItem, idx) => {
    const caseValidation = validateBenchmarkCase(caseItem);
    assert(caseValidation.isValid, `Case ${caseItem.case_id} [${idx}] passes schema validation (Errors: ${caseValidation.errors.join(', ')})`);
  });

  // Validate entire dataset (including provenance and cross-split metrics)
  const datasetValidation = validateBenchmarkDataset(rawFixtures);
  assert(datasetValidation.isValid, `Full benchmark dataset passes validation: ${datasetValidation.errors.join(', ')}`);
  assert(datasetValidation.summary.calibrationCount === 6, 'Contains exactly 6 calibration split cases');
  assert(datasetValidation.summary.heldOutCount === 4, 'Contains exactly 4 held-out validation cases');
  assert(datasetValidation.summary.syntheticCount === 10, 'All 10 cases explicitly tagged as synthetic fixtures');

  // ── Test 6: Cross-Split Data Leakage Prevention ────────────────────────────
  console.log('\n[Test 6] Cross-Split Data Leakage Prevention Guard');

  // Clean dataset has 0 leakage
  assert(datasetValidation.summary.leakingCandidateCount === 0, 'No candidate leakage in clean benchmark dataset');

  // Intentionally inject a leaking candidate present in BOTH calibration and held-out validation
  const leakingDataset = [
    {
      case_id: 'LEAK-001',
      provenance: { source_type: 'synthetic_fixture', license_or_consent: 'CC0' },
      validation_split: 'CALIBRATION',
      job_posting: { job_id: 'J1', title: 'T1', job_category: 'Frontend', mandatory_requirements: [], description_text: 'D' },
      candidate_profile_anonymized: { profile_id: 'LEAKING_CANDIDATE_XYZ', years_of_experience: 3, extracted_skills: [], anonymized_resume_text: 'Text' },
      evaluations: [
        { evaluator_id: 'E1', criteria_scores: { REQ_SKILLS: 3, EXP_RELEVANCE: 3, EVIDENCE_ACHIEVE: 3, TRANS_SKILLS: 3, EDU_QUAL: 3, CERTS_CRED: 3 }, overall_fit_percentage: 75, recommendation: 'ACCEPTABLE_MATCH' },
        { evaluator_id: 'E2', criteria_scores: { REQ_SKILLS: 3, EXP_RELEVANCE: 3, EVIDENCE_ACHIEVE: 3, TRANS_SKILLS: 3, EDU_QUAL: 3, CERTS_CRED: 3 }, overall_fit_percentage: 75, recommendation: 'ACCEPTABLE_MATCH' }
      ],
      adjudication: { is_adjudicated: false, reference_score: 75 }
    },
    {
      case_id: 'LEAK-002',
      provenance: { source_type: 'synthetic_fixture', license_or_consent: 'CC0' },
      validation_split: 'HELD_OUT_VALIDATION', // Same candidate in validation split!
      job_posting: { job_id: 'J2', title: 'T2', job_category: 'Frontend', mandatory_requirements: [], description_text: 'D' },
      candidate_profile_anonymized: { profile_id: 'LEAKING_CANDIDATE_XYZ', years_of_experience: 3, extracted_skills: [], anonymized_resume_text: 'Text' },
      evaluations: [
        { evaluator_id: 'E1', criteria_scores: { REQ_SKILLS: 3, EXP_RELEVANCE: 3, EVIDENCE_ACHIEVE: 3, TRANS_SKILLS: 3, EDU_QUAL: 3, CERTS_CRED: 3 }, overall_fit_percentage: 75, recommendation: 'ACCEPTABLE_MATCH' },
        { evaluator_id: 'E2', criteria_scores: { REQ_SKILLS: 3, EXP_RELEVANCE: 3, EVIDENCE_ACHIEVE: 3, TRANS_SKILLS: 3, EDU_QUAL: 3, CERTS_CRED: 3 }, overall_fit_percentage: 75, recommendation: 'ACCEPTABLE_MATCH' }
      ],
      adjudication: { is_adjudicated: false, reference_score: 75 }
    }
  ];

  const leakValidationResult = validateBenchmarkDataset(leakingDataset);
  assert(leakValidationResult.isValid === false, 'Validator catches cross-split data leakage');
  assert(leakValidationResult.errors.some(e => e.includes('CRITICAL DATA LEAKAGE')), 'Generates CRITICAL DATA LEAKAGE error message');

  // ── Test 7: Synthetic vs Genuine HR Ground Truth Segregation ──────────────
  console.log('\n[Test 7] Segregation of Synthetic Fixtures from Genuine HR Records');

  // Reject case with unverified or invalid source_type
  const invalidProvenanceCase = {
    ...rawFixtures[0],
    case_id: 'INVALID-PROV-001',
    provenance: { source_type: 'unverified_web_scraping', license_or_consent: 'None' }
  };
  const invalidProvResult = validateBenchmarkCase(invalidProvenanceCase);
  assert(invalidProvResult.isValid === false, 'Rejects case with unapproved source_type provenance');
  assert(invalidProvResult.errors.some(e => e.includes('Invalid provenance.source_type')), 'Flags invalid source_type');

  // ── Test 8: Phase 4 Baseline Comparative Metrics Calculation ──────────────
  console.log('\n[Test 8] Baseline Comparative Metrics (MAE, RMSE, Error Bands)');

  const mockComparisons = [
    { systemScore: 85, referenceScore: 88, category: 'Frontend' }, // diff -3
    { systemScore: 40, referenceScore: 50, category: 'Backend' },  // diff -10
    { systemScore: 82, referenceScore: 85, category: 'DevOps' },   // diff -3
    { systemScore: 35, referenceScore: 30, category: 'Data' },     // diff +5
    { systemScore: 70, referenceScore: 79, category: 'Fullstack' } // diff -9
  ];

  const metrics = computeBaselineMetrics(mockComparisons);

  // Expected MAE = (|3| + |10| + |3| + |5| + |9|) / 5 = 30 / 5 = 6.0
  assert(metrics.mae === 6.0, `MAE is correctly calculated as 6.0 (${metrics.mae})`);
  assert(metrics.sampleSize === 5, `Sample size matches 5 (${metrics.sampleSize})`);
  assert(metrics.accuracyWithin5 === 60.0, `Accuracy within ±5% is 60.0% (${metrics.accuracyWithin5}%)`); // 3 of 5
  assert(metrics.accuracyWithin10 === 100.0, `Accuracy within ±10% is 100.0% (${metrics.accuracyWithin10}%)`); // 5 of 5
  assert(metrics.accuracyWithin15 === 100.0, `Accuracy within ±15% is 100.0% (${metrics.accuracyWithin15}%)`);

  // RMSE = sqrt((9 + 100 + 9 + 25 + 81)/5) = sqrt(224/5) = sqrt(44.8) ≈ 6.69
  assert(Math.abs(metrics.rmse - 6.69) <= 0.05, `RMSE is correctly calculated (${metrics.rmse} ≈ 6.69)`);

  console.log(`\n🎉 ALL ${passedTests}/${totalTests} HR EVALUATION RUBRIC & BENCHMARK DATASET TESTS PASSED!`);
}

runTestSuite().catch((err) => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
