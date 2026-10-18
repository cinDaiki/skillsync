/** Offline-only, read-only HR validation report generator.
 * Usage: node scripts/run_hr_fit_validation.mjs benchmark/fixtures/synthetic_benchmark_dataset.json
 * Never connects to Supabase. Never modifies matching weights or applicant records.
 */
import path from 'node:path';
import { loadBenchmarkDataset, evaluateBenchmarkAccuracy } from '../src/services/evaluation/baselineHarness.js';
import { summarizeHeldOutValidation } from '../src/services/evaluation/hrFitValidation.js';
import { analyzeRaterAgreement } from '../src/services/evaluation/rubricEngine.js';

const input=process.argv[2];
if (!input) {
  console.error('Usage: node scripts/run_hr_fit_validation.mjs <validated-benchmark.json>');
  process.exit(2);
}
const loaded=loadBenchmarkDataset(path.resolve(input));
// Fail closed on unresolved HR rater disagreement, even if a stale numeric
// adjudication.reference_score exists in the data file.
const unresolved = [];
const resolvedCases = loaded.dataset.filter(item => {
  const ratings = item.evaluations || [];
  if (ratings.length < 2) { unresolved.push(item.case_id); return false; }
  const agreement = analyzeRaterAgreement(ratings[0], ratings[1]);
  if (agreement.adjudicationRequired && item.adjudication?.is_adjudicated !== true) {
    unresolved.push(item.case_id);
    return false;
  }
  return true;
});
const evaluated=evaluateBenchmarkAccuracy(resolvedCases);
const report=summarizeHeldOutValidation(evaluated);
console.log(JSON.stringify({
  evaluationType:'Offline comparison of authoritative system scores vs independent HR rubric references',
  scoringImplementation:evaluated.meta.scoringImplementationVersion,
  source:loaded.stats,
  excludedUnadjudicatedCaseIds:unresolved,
  exclusions:evaluated.excludedCases,
  evaluatorReliability:evaluated.evaluatorReliability,
  results:report,
  limitations:[
    'Synthetic fixtures are not real-world accuracy evidence.',
    'Two independent HR assessments with adjudication are required for comparable references.',
    'Rater judgments can be subjective; this measures rubric agreement, not probability of hiring.',
    'Do not use protected traits, inferred personality, or unconsented applicant data.'
  ]
},null,2));
