import assert from 'node:assert/strict';
import {
  readAuthoritativeJobMatch, qualificationTier, reviewSignal, workplaceAlignment,
  calculateValidationMetrics, summarizeHeldOutValidation
} from '../src/services/evaluation/hrFitValidation.js';

let assertions = 0;
function check(value, expected, label) { assert.deepEqual(value, expected, label); assertions++; }

check(readAuthoritativeJobMatch({ job_match: { match_score: 80 }, match_score: 20 }).score,80,'server match prioritized');
check(readAuthoritativeJobMatch({ match_score: 88 }).available,false,'unattributed number not trusted');
check(readAuthoritativeJobMatch({ job_match: { match_score: 0 } }).score,0,'zero is valid');
check(qualificationTier(80),'Strong match','strong tier');
check(qualificationTier(60),'Good match','good tier');
check(qualificationTier(40),'Potential match','potential tier');
check(qualificationTier(39),'Skills gap','gap tier');
check(qualificationTier(null),'Not evaluated','unknown tier');
check(reviewSignal(90,1).status,'disagreement','high system low HR');
check(reviewSignal(25,5).status,'disagreement','low system high HR');
check(reviewSignal(84,4).status,'broad_agreement','broad agreement');
check(reviewSignal(84,null).status,'awaiting_hr','no HR evidence');
check(reviewSignal(null,5).status,'not_evaluated','no match evidence');
check(workplaceAlignment().status,'not_assessed','no inferred culture');
check(workplaceAlignment({work_setup:'remote'},{work_setup:'remote'}).status,'aligned','explicit matching preferences');
check(workplaceAlignment({work_setup:'remote'},{work_setup:'on-site'}).status,'needs_discussion','explicit mismatch is discussion, not rejection');
const comparisons=[
  {caseId:'A',systemScore:90,referenceScore:90,mandatoryStatus:'COMPLIANT'},
  {caseId:'B',systemScore:85,referenceScore:20,mandatoryStatus:'DEMONSTRABLY_LACKING'},
  {caseId:'C',systemScore:20,referenceScore:88,mandatoryStatus:'COMPLIANT'},
  {caseId:'D',systemScore:30,referenceScore:20,mandatoryStatus:'COMPLIANT'},
  {caseId:'E',systemScore:90,referenceScore:90,mandatoryStatus:'INSUFFICIENT_EVIDENCE'}
];
const metrics=calculateValidationMetrics(comparisons);
check(metrics.confusion,{tp:1,fp:1,fn:1,tn:1},'confusion matrix');
check(metrics.evaluated,4,'unresolved mandatory excluded');
check(metrics.excluded,1,'excluded count');
check(metrics.byCategory.Uncategorized.evaluated,4,'category metrics reported');
check(metrics.precision,50,'precision');
check(metrics.recall,50,'recall');
check(metrics.f1,50,'f1');
check(calculateValidationMetrics([]).precision,null,'no fabricated zero percent');
const syn = comparisons.map(c=>({...c,isSynthetic:true,validationSplit:'HELD_OUT_VALIDATION'}));
const onlySynthetic=summarizeHeldOutValidation({comparisons:syn});
check(onlySynthetic.reportableAsRealWorldAccuracy,false,'synthetic not real');
check(onlySynthetic.status,'NO_GENUINE_VALIDATION_DATA','synthetic-only status');
const limited=summarizeHeldOutValidation({comparisons:[{...comparisons[0],isSynthetic:false,validationSplit:'HELD_OUT_VALIDATION'}]});
check(limited.status,'INSUFFICIENT_GENUINE_VALIDATION_DATA','small sample caution');
check(summarizeHeldOutValidation({ comparisons:[{...comparisons[0],isSynthetic:false,validationSplit:'CALIBRATION'}]}).heldOutGenuineMetrics.evaluated,0,'calibration never counted as held-out');
console.log(`HR FIT VALIDATION: ${assertions}/${assertions} assertions passed`);
