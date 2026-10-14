/**
 * tests/mandatoryGatingAndPilot.test.mjs
 *
 * SkillSync Phase 4.5: Mandatory Qualification Gating RFC & HR Pilot Test Suite
 *
 * Verifies:
 * 1. Candidate satisfying every mandatory requirement (MET -> ELIGIBLE, score preserved).
 * 2. Candidate explicitly lacking a mandatory requirement (NOT_MET -> INELIGIBLE, score capped <= 35%).
 * 3. Absence of evidence safety (UNKNOWN -> PENDING_VERIFICATION, no automatic rejection or cap).
 * 4. Parser extraction failure safety (parsing failure falls back to UNKNOWN, preventing employment errors).
 * 5. Candidate meeting mandatory requirements with low transferable skills (scores normally without cap).
 * 6. Missing preferred qualification (preferred omission never triggers gating or disqualification).
 * 7. Inconsistent or empty job requirements handling.
 * 8. Contradictory evidence handling.
 * 9. Pilot data entry template compliance with benchmarkSchema.js.
 * 10. Strict segregation of synthetic fixtures from genuine HR records.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  QUALIFICATION_STATES,
  evaluateMandatoryEligibility,
  simulateProposedGating,
  formatAndValidatePilotCase
} from '../src/services/evaluation/pilotDataEntry.js';
import { validateBenchmarkCase } from '../src/services/evaluation/benchmarkSchema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const TEMPLATE_PATH = path.join(ROOT_DIR, 'benchmark', 'templates', 'pilot_evaluation_entry_template.json');

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
  console.log('=== RUNNING MANDATORY GATING RFC & PILOT PREPARATION TESTS ===\n');

  // ── Test 1: Candidate Satisfying Every Mandatory Requirement ──────────────
  console.log('[Test 1] Candidate Satisfying All Mandatory Requirements (MET)');
  const allMetStates = {
    '5+ years professional frontend web development': QUALIFICATION_STATES.MET,
    'Expert proficiency in React and TypeScript': QUALIFICATION_STATES.MET,
    'Core Web Vitals performance optimization': QUALIFICATION_STATES.MET
  };

  const metEligibility = evaluateMandatoryEligibility(allMetStates);
  assert(metEligibility.status === 'ELIGIBLE', 'Status is ELIGIBLE');
  assert(metEligibility.eligible === true, 'Eligible flag is true');
  assert(metEligibility.unmetRequirements.length === 0, 'Zero unmet requirements');

  const metGating = simulateProposedGating(88, allMetStates);
  assert(metGating.displayedScore === 88, 'Raw score of 88% is preserved without penalty');
  assert(metGating.tier === 'Strong Match', 'Correctly assigned to Strong Match tier');
  assert(metGating.badge === null, 'No penalty badge displayed');

  // ── Test 2: Candidate Explicitly Lacking Mandatory Requirement ─────────────
  console.log('\n[Test 2] Candidate Explicitly Lacking Mandatory Requirement (NOT_MET)');
  const notMetStates = {
    'Active CompTIA Security+ or CISSP': QUALIFICATION_STATES.NOT_MET,
    '2+ years SOC experience': QUALIFICATION_STATES.MET
  };

  const notMetEligibility = evaluateMandatoryEligibility(notMetStates);
  assert(notMetEligibility.status === 'INELIGIBLE', 'Status is INELIGIBLE');
  assert(notMetEligibility.eligible === false, 'Eligible flag is false');
  assert(notMetEligibility.unmetRequirements.includes('Active CompTIA Security+ or CISSP'), 'Identifies missing requirement');

  const notMetGating = simulateProposedGating(74, notMetStates);
  assert(notMetGating.displayedScore <= 35, `Raw score of 74% is capped at <= 35% (${notMetGating.displayedScore}%)`);
  assert(notMetGating.tier === 'Skills Gap', 'Forces placement in Skills Gap tier');
  assert(notMetGating.badge === 'Mandatory Requirement Unmet', 'Displays Mandatory Requirement Unmet badge');

  // ── Test 3: Absence of Evidence Safety (UNKNOWN != NOT_MET) ───────────────
  console.log('\n[Test 3] Absence of Evidence Handling (UNKNOWN -> PENDING_VERIFICATION)');
  const unknownStates = {
    'Kubernetes production deployment': QUALIFICATION_STATES.UNKNOWN, // Unmentioned
    '3+ years Go experience': QUALIFICATION_STATES.MET
  };

  const unknownEligibility = evaluateMandatoryEligibility(unknownStates);
  assert(unknownEligibility.status === 'PENDING_VERIFICATION', 'Status is PENDING_VERIFICATION');
  assert(unknownEligibility.eligible === null, 'Eligible flag is indeterminate (null), NOT false');
  assert(unknownEligibility.action === 'REQUEST_VERIFICATION', 'Action is REQUEST_VERIFICATION');

  const unknownGating = simulateProposedGating(80, unknownStates);
  assert(unknownGating.displayedScore === 80, 'Score is NOT penalized or zeroed out for unmentioned item');
  assert(unknownGating.badge === 'Verification Required', 'Displays Verification Required badge');

  // ── Test 4: Parser Extraction Failure Safety (Parsing Bug != Rejection) ───
  console.log('\n[Test 4] Resume Extraction Failure Safety Guard');
  // Scenario: Candidate actually holds certification in document, but text extraction missed the token
  const simulatedExtractionFailure = {
    'AWS Solutions Architect Associate': QUALIFICATION_STATES.UNKNOWN // Missed token falls back to UNKNOWN
  };

  const parserFailureGating = simulateProposedGating(85, simulatedExtractionFailure);
  assert(parserFailureGating.displayedScore === 85, 'Candidate score preserved at 85% despite extraction gap');
  assert(parserFailureGating.tier === 'Strong Match', 'Candidate remains in Strong Match tier');
  assert(parserFailureGating.badge === 'Verification Required', 'Flags for human verification instead of automatic rejection');

  // ── Test 5: Candidate Meeting Mandatory Requirements with Low Transferable Skills
  console.log('\n[Test 5] Mandatory Met with Low Transferable Skills');
  const lowTransferableStates = {
    'Java Spring Boot experience': QUALIFICATION_STATES.MET,
    'SQL database querying': QUALIFICATION_STATES.MET
  };

  const lowTransferableGating = simulateProposedGating(55, lowTransferableStates);
  assert(lowTransferableGating.displayedScore === 55, 'Score of 55% preserved');
  assert(lowTransferableGating.tier === 'Potential Match', 'Placed in Potential Match based on score alone');
  assert(lowTransferableGating.badge === null, 'No gating badge applied when mandatory items are met');

  // ── Test 6: Missing Preferred Qualification Only (Non-Gating) ─────────────
  console.log('\n[Test 6] Missing Preferred Qualification Only (Non-Penalizing)');
  const preferredOnlyStates = {
    'Mandatory Core Requirement': QUALIFICATION_STATES.MET
    // Preferred qualification like GraphQL omitted completely
  };

  const preferredGating = simulateProposedGating(82, preferredOnlyStates);
  assert(preferredGating.displayedScore === 82, 'Score remains 82%');
  assert(preferredGating.eligibility.status === 'ELIGIBLE', 'Eligibility is ELIGIBLE');

  // ── Test 7: Empty or Inconsistent Job Requirements Handling ───────────────
  console.log('\n[Test 7] Empty or Inconsistent Job Requirements Handling');
  const emptyRequirements = {};
  const emptyGating = simulateProposedGating(70, emptyRequirements);
  assert(emptyGating.displayedScore === 70, 'Handles empty mandatory requirements gracefully');
  assert(emptyGating.eligibility.status === 'ELIGIBLE', 'Defaults to ELIGIBLE when no mandatory constraints specified');

  // ── Test 8: Contradictory Evidence & Seniority Boundary Handling ──────────
  console.log('\n[Test 8] Contradictory Evidence & Boundary Handling');
  // Scenario: Candidate claims 5 years in summary, but experience entries sum to only 1.5 years
  const contradictoryStates = {
    'Minimum 4 years verified experience': QUALIFICATION_STATES.NOT_MET // Audited as NOT_MET based on dates
  };
  const contradictoryGating = simulateProposedGating(68, contradictoryStates);
  assert(contradictoryGating.displayedScore <= 35, 'Affirmative date contradiction caps score');
  assert(contradictoryGating.eligibility.status === 'INELIGIBLE', 'Marked INELIGIBLE due to verified date failure');

  // ── Test 9: Pilot Evaluation Entry Template Schema Compliance ─────────────
  console.log('\n[Test 9] Pilot Evaluation Entry Template Schema Compliance');
  assert(fs.existsSync(TEMPLATE_PATH), 'Pilot entry template exists at benchmark/templates');

  const templateContent = JSON.parse(fs.readFileSync(TEMPLATE_PATH, 'utf8'));
  const templateValidation = validateBenchmarkCase(templateContent);
  assert(templateValidation.isValid === true,
    `Pilot entry template conforms to benchmarkSchema.js (Errors: ${templateValidation.errors.join(', ')})`);

  // Verify formatAndValidatePilotCase helper
  const formattedResult = formatAndValidatePilotCase(templateContent);
  assert(formattedResult.isValid === true, 'Helper validates template successfully');
  assert(formattedResult.formattedCase !== null, 'Helper returns formatted case object');

  // ── Test 10: Strict Segregation of Synthetic from Genuine Records ─────────
  console.log('\n[Test 10] Segregation of Synthetic Fixtures from Genuine HR Records');
  assert(templateContent.provenance.source_type === 'authorized_candidate_case',
    'Pilot template is configured for authorized_candidate_case records');

  // Attempt to submit an invalid provenance type
  const badProvCase = {
    ...templateContent,
    provenance: { source_type: 'unverified_third_party' }
  };
  const badProvValidation = validateBenchmarkCase(badProvCase);
  assert(badProvValidation.isValid === false, 'Rejects unapproved source_type');

  console.log(`\n🎉 ALL ${passedTests}/${totalTests} MANDATORY GATING RFC & PILOT PREPARATION TESTS PASSED!`);
}

runTestSuite().catch((err) => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
