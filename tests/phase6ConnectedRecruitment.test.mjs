/** Offline deterministic contract checks; NO Supabase client connection. */
import assert from 'node:assert/strict';
import {
  compareWorkPreferences, sharedPreferenceSnapshot, validatedWorkPreferences,
  linkedRecruitmentStage
} from '../src/services/alignment/workAlignment.js';
let passed=0;
function check(value, expected, label){assert.deepEqual(value,expected,label);passed++;console.log('✓',label)}
check(compareWorkPreferences().status,'not_assessed','Unstated preferences cannot be guessed');
check(compareWorkPreferences({work_setup:'Remote'},{}).status,'not_assessed','One-sided preference not assessed');
check(compareWorkPreferences({work_setup:'Remote'},{work_setup:'Hybrid'}).status,'needs_discussion','Explicit work setup mismatch');
check(compareWorkPreferences({work_setup:'Remote'},{work_setup:'Remote'}).status,'aligned','Remote aligned');
check(compareWorkPreferences({work_setup:'On-site'},{work_setup:'onsite'}).status,'aligned','On-site and onsite normalize');
check(compareWorkPreferences({work_setup:'Flexible'},{work_setup:'Hybrid'}).status,'aligned','Flexible preference accepts Hybrid');
check(compareWorkPreferences({work_schedule:'Day shift'},{work_schedule:'Night shift'}).status,'needs_discussion','Shift mismatch triggers discussion only');
check(compareWorkPreferences({travel_requirement:'None'},{travel_requirement:'Occasional'}).status,'needs_discussion','Travel mismatch triggers discussion only');
check(compareWorkPreferences({work_setup:'Remote',work_schedule:'Day shift'},{work_setup:'Remote'}).checkedCount,1,'Only mutually specified comparisons count');
check(compareWorkPreferences({work_setup:'Remote'},{work_setup:'Remote'}).total,3,'Always reports coverage denominator');
check(compareWorkPreferences({work_setup:'wat'},{work_setup:'wat'}).status,'not_assessed','Unsupported values not treated as evidence');
check(sharedPreferenceSnapshot({work_setup:'Remote',share_on_application:false}),null,'No employer sharing without active opt-in');
check(sharedPreferenceSnapshot({work_setup:'Remote',share_on_application:true}),{work_setup:'Remote'},'Explicit opt-in snapshots exact field');
check(sharedPreferenceSnapshot({work_setup:'wat',share_on_application:true}),null,'Do not snapshot unrecognized value');
check(sharedPreferenceSnapshot({work_setup:'Remote',foo:'private',share_on_application:true}),{work_setup:'Remote'},'Do not leak unrelated private details');
check(sharedPreferenceSnapshot({work_setup:'Remote',share_on_application:'true'}),null,'String is not consent');
check(validatedWorkPreferences({work_setup:'Remote',share_on_application:true}).work_setup,'Remote','Validated preference');
check(validatedWorkPreferences({share_on_application:'true'}).share_on_application,false,'Reject non-boolean consent');
assert.throws(()=>validatedWorkPreferences({work_setup:'imagined'}));passed++;console.log('✓','Unrecognized preference rejected');
check(linkedRecruitmentStage('applied').step,1,'Submitted at stage 1');
check(linkedRecruitmentStage('shortlisted').step,2,'Shortlist at stage 2');
check(linkedRecruitmentStage('applied','PENDING_CONFIRMATION').step,3,'Interview pending stage 3');
check(linkedRecruitmentStage('applied','RESCHEDULE_REQUESTED').label,'Reschedule requested','Reschedule action visible to both');
check(linkedRecruitmentStage('applied','COMPLETED').step,4,'Interview completed stage 4');
check(linkedRecruitmentStage('hired','COMPLETED').step,5,'Hired takes precedence');
check(linkedRecruitmentStage('rejected').complete,true,'Rejection is terminal');
check(linkedRecruitmentStage('withdrawn').label,'Closed','Withdrawn is terminal');

check(linkedRecruitmentStage('applied','DECLINED').label,'Interview declined','Declined interview has explicit status');
check(linkedRecruitmentStage('applied','CANCELLED').label,'Interview cancelled','Cancelled interview is visible');

console.log(`\nPHASE 6 OFFLINE TESTS: ${passed}/${passed} passed`);
