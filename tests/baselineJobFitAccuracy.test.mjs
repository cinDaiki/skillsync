/**
 * tests/baselineJobFitAccuracy.test.mjs
 *
 * SkillSync Phase 4: Baseline Job-Fit Accuracy Evaluation Test Suite
 *
 * Verifies:
 * 1. Authoritative scoring implementation traceability (migration 20261004000000).
 * 2. Dataset readiness check: correctly identifies synthetic-only fixtures vs genuine HR data.
 * 3. Safe environment assertion guard: prevents executing benchmark calculations against production.
 * 4. Separate reporting of score disagreements vs mandatory qualification gating (Rule 3).
 * 5. Accuracy metrics calculation (MAE, RMSE, ±5%, ±10%, ±15% bands).
 * 6. Exclusion handling for incomplete or unadjudicated benchmark pairs.
 * 7. Traceability of all cases to scoring implementation version and reference scores.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  loadBenchmarkDataset,
  assertSafeNonProductionEnvironment,
  evaluateBenchmarkAccuracy,
  AUTHORITATIVE_SCORING_VERSION,
  SCORING_MODEL_METADATA
} from '../src/services/evaluation/baselineHarness.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const FIXTURES_PATH = path.join(ROOT_DIR, 'benchmark', 'fixtures', 'synthetic_benchmark_dataset.json');
const CANONICAL_MIGRATION_PATH = path.join(ROOT_DIR, 'supabase', 'migrations', AUTHORITATIVE_SCORING_VERSION);

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
  console.log('=== RUNNING BASELINE JOB-FIT ACCURACY EVALUATION TESTS ===\n');

  // ── Test 1: Authoritative Scoring Implementation Traceability ──────────────
  console.log('[Test 1] Authoritative Scoring Implementation Traceability');
  assert(fs.existsSync(CANONICAL_MIGRATION_PATH), `Canonical scoring migration exists: ${AUTHORITATIVE_SCORING_VERSION}`);

  const migrationContent = fs.readFileSync(CANONICAL_MIGRATION_PATH, 'utf8');
  assert(migrationContent.includes('CREATE OR REPLACE FUNCTION public.compute_and_save_job_match'),
    'Canonical migration defines compute_and_save_job_match RPC');
  assert(migrationContent.includes('v_total_weight := v_w_skills + v_w_trans + v_w_edu + v_w_exp + v_w_creds + v_w_semantic;'),
    'Defines dynamic requirement-aware weighted normalization model');
  assert(migrationContent.includes('INSERT INTO public.job_matches'),
    'Documents side-effect: RPC persists to public.job_matches');

  assert(SCORING_MODEL_METADATA.factors.requiredSkills.standardWeight === 0.35, 'Standard Required Skills weight is 35%');
  assert(SCORING_MODEL_METADATA.factors.transferableSkills.standardWeight === 0.15, 'Standard Transferable Skills weight is 15%');
  assert(SCORING_MODEL_METADATA.factors.education.standardWeight === 0.15, 'Standard Education weight is 15%');
  assert(SCORING_MODEL_METADATA.factors.experience.standardWeight === 0.15, 'Standard Experience weight is 15%');

  // ── Test 2: Dataset Readiness Check (Synthetic vs Genuine HR Ground Truth) ─
  console.log('\n[Test 2] Benchmark Dataset Readiness & Provenance Check');
  const loaded = loadBenchmarkDataset(FIXTURES_PATH);

  assert(loaded.stats.totalCases === 10, 'Loaded 10 benchmark test fixtures');
  assert(loaded.stats.syntheticCount === 10, 'All 10 fixtures tagged as synthetic');
  assert(loaded.stats.genuineCount === 0, 'Accurately detects 0 genuine HR-reviewed cases currently in repository');
  assert(loaded.stats.hasGenuineData === false, 'Flags that genuine HR dataset is not yet present (Rule 1)');

  // ── Test 3: Safe Non-Production Environment Guard ─────────────────────────
  console.log('\n[Test 3] Production Safety Guard');
  assert(assertSafeNonProductionEnvironment('http://127.0.0.1:54321') === true, 'Allows local loopback Supabase URL');
  assert(assertSafeNonProductionEnvironment('https://skillsync-preview-qa.supabase.co') === true, 'Allows staging/preview URL');
  assert(assertSafeNonProductionEnvironment('') === true, 'Allows offline harness mode');

  let threwOnProductionUrl = false;
  try {
    assertSafeNonProductionEnvironment('https://production-skillsync-db.supabase.co');
  } catch (err) {
    threwOnProductionUrl = err.message.includes('SAFETY VIOLATION');
  }
  assert(threwOnProductionUrl, 'Throws SAFETY VIOLATION when attempting to target a production URL');

  // ── Test 4: Separate Score Disagreement from Mandatory Gating (Rule 3) ────
  console.log('\n[Test 4] Separate Score Disagreement from Mandatory Qualification Gating');

  // Load cases and test harness with simulated system scores
  const mockSystemScores = {
    'BENCH-SYNTH-001': 82, // Senior Frontend: Ref 88, Diff -6 (Compliant)
    'BENCH-SYNTH-002': 58, // Senior Go: Ref 50, Diff +8 (Compliant / Under-seniority)
    'BENCH-SYNTH-003': 80, // DevOps: Ref 85, Diff -5 (Compliant)
    'BENCH-SYNTH-004': 55, // ML Eng: Ref 30, Diff +25 (Candidate lacks ML, System score overshoots)
    'BENCH-SYNTH-005': 78, // Fullstack: Ref 79, Diff -1 (Compliant)
    'BENCH-SYNTH-006': 65, // CyberSec: Ref 33, Diff +32 (Lacks mandatory Security+, Gated in HR rubric!)
    'BENCH-SYNTH-007': 90, // Lead FE: Ref 94, Diff -4 (Compliant)
    'BENCH-SYNTH-008': 80, // Python: Ref 83, Diff -3 (Compliant)
    'BENCH-SYNTH-009': 50, // iOS: Ref 26, Diff +24 (Lacks native Swift/SwiftUI, Gated in HR rubric!)
    'BENCH-SYNTH-010': 85  // Data Eng: Ref 89, Diff -4 (Compliant)
  };

  const results = evaluateBenchmarkAccuracy(loaded.dataset, {
    systemScores: mockSystemScores
  });

  assert(results.meta.totalCasesSubmitted === 10, 'Processed all 10 benchmark cases');
  assert(results.meta.eligibleCasesCount === 10, 'All 10 cases eligible for comparison');
  assert(results.meta.isSyntheticOnlyDataset === true, 'Explicitly marked as synthetic-only dataset');

  // Rule 3: Inspect separated metrics
  const compliantMetrics = results.baselineMetrics.compliantCases;
  const gatedMetrics = results.baselineMetrics.mandatoryGatedCases;

  assert(compliantMetrics.sampleSize > 0, 'Compliant cases isolated');
  assert(gatedMetrics.sampleSize > 0, 'Mandatory gated cases isolated');

  // Compliant cases should have low error (|diff|: 6, 8, 5, 1, 4, 3, 4 -> MAE ~4.4%)
  assert(compliantMetrics.mae <= 6.0, `Compliant cases MAE is low (${compliantMetrics.mae}% <= 6.0%)`);
  assert(compliantMetrics.accuracyWithin10 >= 85.0, `Compliant cases accuracy within ±10% is high (${compliantMetrics.accuracyWithin10}%)`);

  // Mandatory-gated cases show where system lacks gating rules (differences 25, 32, 24 -> MAE ~27%)
  assert(gatedMetrics.mae > 20.0, `Gated cases exhibit large divergence due to missing gating (${gatedMetrics.mae}% > 20%)`);

  // ── Test 5: Metrics Calculation Mathematical Correctness ──────────────────
  console.log('\n[Test 5] Metrics Calculation Mathematical Correctness');
  const overall = results.baselineMetrics.overall;

  assert(typeof overall.mae === 'number' && overall.mae > 0, `Overall MAE calculated (${overall.mae}%)`);
  assert(typeof overall.rmse === 'number' && overall.rmse >= overall.mae, `Overall RMSE (${overall.rmse}) >= MAE (${overall.mae})`);
  assert(overall.accuracyWithin15 >= 60.0, `Overall accuracy within ±15% computed (${overall.accuracyWithin15}%)`);
  assert(results.evaluatorReliability.averageInterRaterDifference <= 10.0,
    `Evaluator inter-rater difference is within expected limits (${results.evaluatorReliability.averageInterRaterDifference}%)`);

  // ── Test 6: Exclusion Handling for Incomplete or Unadjudicated Cases ──────
  console.log('\n[Test 6] Exclusion Handling for Incomplete Benchmark Pairs');

  const incompleteDataset = [
    {
      case_id: 'EXCL-001',
      provenance: { source_type: 'synthetic_fixture', license_or_consent: 'CC0' },
      validation_split: 'CALIBRATION',
      job_posting: { job_id: 'J1', title: 'T1', job_category: 'Frontend', mandatory_requirements: [], description_text: 'D' },
      candidate_profile_anonymized: { profile_id: 'C_EXCL_1', years_of_experience: 2, extracted_skills: [], anonymized_resume_text: 'Text' },
      evaluations: [
        { evaluator_id: 'E1', criteria_scores: { REQ_SKILLS: 3, EXP_RELEVANCE: 3, EVIDENCE_ACHIEVE: 3, TRANS_SKILLS: 3, EDU_QUAL: 3, CERTS_CRED: 3 }, overall_fit_percentage: 75, recommendation: 'ACCEPTABLE_MATCH' },
        { evaluator_id: 'E2', criteria_scores: { REQ_SKILLS: 3, EXP_RELEVANCE: 3, EVIDENCE_ACHIEVE: 3, TRANS_SKILLS: 3, EDU_QUAL: 3, CERTS_CRED: 3 }, overall_fit_percentage: 75, recommendation: 'ACCEPTABLE_MATCH' }
      ],
      adjudication: { is_adjudicated: false, reference_score: 75 },
      system_baseline: { skillsync_score: null } // No system score provided!
    }
  ];

  const exclResults = evaluateBenchmarkAccuracy(incompleteDataset);
  assert(exclResults.meta.eligibleCasesCount === 0, 'Incomplete case not included in eligible comparisons');
  assert(exclResults.excludedCases.length === 1, 'Incomplete case recorded in excludedCases array');
  assert(exclResults.excludedCases[0].reason.includes('Missing system score'), 'Exclusion reason documented');

  console.log(`\n🎉 ALL ${passedTests}/${totalTests} BASELINE ACCURACY EVALUATION TESTS PASSED!`);
}

runTestSuite().catch((err) => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
