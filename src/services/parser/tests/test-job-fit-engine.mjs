/**
 * test-job-fit-engine.mjs
 *
 * Deterministic unit test suite for the unified Job Fit Scoring Engine (jobFitEngine.js).
 * Validates logical scoring behavior, two-sided candidate & employer ranking,
 * non-penalizing education compatibility, and transferable skills alignment.
 */

import { calculateJobFit, evaluateSkills, evaluateEducation, evaluateExperience, evaluateCredentials } from '../../ai/jobFitEngine.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

console.log('\n═════════════════════════════════════════════════════════════════');
console.log('JOB FIT SCORING ENGINE — DETERMINISTIC VALIDATION SUITE');
console.log('═════════════════════════════════════════════════════════════════\n');

// ── Test TC-C1: BSIT Graduate -> Web Developer ─────────────────────────────
console.log('Scenario TC-C1: BSIT Graduate -> Web Developer (Technical Match)');
const candidateC1 = {
  skills: ['React', 'JavaScript', 'HTML', 'CSS', 'Git', 'Node.js'],
  degree: 'Bachelor of Science in Information Technology',
  years_experience: 2,
  certifications: ['React Professional Certificate']
};
const jobC1 = {
  title: 'Web Developer',
  required_skills: 'React, JavaScript, HTML, CSS, Git',
  required_education: 'Bachelor of Science in Information Technology',
  experience_required: '1-2 years',
  required_certifications: ''
};
const resC1 = calculateJobFit(candidateC1, jobC1, 0.85);
console.log(`  Result Score: ${resC1.jobFitScore}% (${resC1.tier})`);
assert(resC1.jobFitScore >= 80, 'BSIT candidate with matching technical skills receives Strong Match (>= 80%)');
assert(resC1.breakdown.requiredSkillsScore === 100, 'Required skills score is 100%');
assert(resC1.breakdown.educationCompatibility === 100, 'Education compatibility is 100%');
assert(resC1.breakdown.experienceCompatibility === 100, 'Experience compatibility is 100%');

// ── Test TC-C2: BSIT Graduate -> IT Administrator ─────────────────────────
console.log('\nScenario TC-C2: BSIT Graduate -> IT Administrator (Infrastructure Match)');
const candidateC2 = {
  skills: ['Networking', 'Linux', 'Active Directory', 'System Administration', 'Troubleshooting'],
  degree: 'BS Information Technology',
  years_experience: 3,
  certifications: []
};
const jobC2 = {
  title: 'IT Administrator',
  required_skills: 'Networking, Linux, Active Directory, System Administration',
  required_education: 'BS IT or related',
  experience_required: '2 years',
  required_certifications: ''
};
const resC2 = calculateJobFit(candidateC2, jobC2, 0.80);
console.log(`  Result Score: ${resC2.jobFitScore}% (${resC2.tier})`);
assert(resC2.jobFitScore >= 70, 'IT Admin candidate with infrastructure skills receives Good/Strong Match (>= 70%)');
assert(resC2.breakdown.requiredSkillsScore === 100, 'Required skills score is 100%');

// ── Test TC-C3: BSIT Graduate -> Service Crew (Transferable Alignment) ─────
console.log('\nScenario TC-C3: BSIT Graduate -> Service Crew (Transferable Skills, Non-Penalizing Education)');
const candidateC3 = {
  skills: ['Customer Service', 'Communication', 'Teamwork', 'Problem Solving', 'JavaScript', 'React'],
  degree: 'Bachelor of Science in Information Technology',
  years_experience: 1,
  certifications: []
};
const jobC3 = {
  title: 'Service Crew',
  required_skills: 'Customer Service, Communication, Teamwork, Cash Handling',
  required_education: 'High School / Optional',
  experience_required: '0-1 year',
  required_certifications: 'Food Safety Certificate'
};
const resC3 = calculateJobFit(candidateC3, jobC3, 0.65);
console.log(`  Result Score: ${resC3.jobFitScore}% (${resC3.tier})`);
assert(resC3.jobFitScore >= 60, 'BSIT candidate with Customer Service & Communication receives Good Match (>= 60%)');
assert(resC3.breakdown.educationCompatibility === 100, 'Education compatibility is 100% (zero penalty for degree holder)');
assert(resC3.breakdown.experienceCompatibility === 100, 'Experience compatibility is 100% (0-1 yrs entry level)');
assert(resC3.recommendedMicrocredentials.length > 0, 'Targeted microcredential generated for Cash Handling / Food Safety');

// ── Test TC-C4: Fresh Graduate -> Entry Level Job ──────────────────────────
console.log('\nScenario TC-C4: Fresh Graduate (0 Yrs) -> Entry Level Developer');
const candidateC4 = {
  skills: ['Java', 'Python', 'Git', 'Problem Solving'],
  degree: 'BS Computer Science',
  years_experience: 0,
  certifications: []
};
const jobC4 = {
  title: 'Junior Java Developer',
  required_skills: 'Java, Git',
  required_education: 'BS Computer Science',
  experience_required: '0-1 year',
  required_certifications: ''
};
const resC4 = calculateJobFit(candidateC4, jobC4, 0.75);
console.log(`  Result Score: ${resC4.jobFitScore}% (${resC4.tier})`);
assert(resC4.breakdown.experienceCompatibility === 100, 'Fresh graduate (0 yrs exp) receives 100% experience score for entry level role');

// ── Test TC-C5: Missing Required Certification ─────────────────────────────
console.log('\nScenario TC-C5: Missing Required Certification');
const candidateC5 = {
  skills: ['AWS', 'Cloud Architecture', 'Linux'],
  degree: 'BS IT',
  years_experience: 4,
  certifications: []
};
const jobC5 = {
  title: 'Cloud Architect',
  required_skills: 'AWS, Cloud Architecture, Linux',
  required_education: 'BS IT',
  experience_required: '3 years',
  required_certifications: 'AWS Certified Solutions Architect'
};
const resC5 = calculateJobFit(candidateC5, jobC5, 0.85);
console.log(`  Result Score: ${resC5.jobFitScore}% (${resC5.tier})`);
assert(resC5.missingCertifications.includes('aws certified solutions architect'), 'Missing certification detected');

// ── Test TC-E1: Employer Candidate Ranking (Web Developer) ──────────────────
console.log('\nScenario TC-E1: Employer Candidate Ranking (Web Developer)');
const devJob = {
  title: 'Web Developer',
  required_skills: 'React, JavaScript, HTML, CSS, Git',
  required_education: 'BS IT',
  experience_required: '1-2 years'
};
const candDevMatch = calculateJobFit(candidateC1, devJob, 0.85);
const candNonDevMatch = calculateJobFit({ skills: ['Nursing', 'Patient Care'], degree: 'BS Nursing', years_experience: 2 }, devJob, 0.30);
console.log(`  Dev Candidate Score: ${candDevMatch.jobFitScore}% vs Non-Dev Candidate Score: ${candNonDevMatch.jobFitScore}%`);
assert(candDevMatch.jobFitScore > candNonDevMatch.jobFitScore, 'Technically qualified candidate ranks above unrelated candidate');

// ── Edge Cases ─────────────────────────────────────────────────────────────
console.log('\nScenario Edge Cases: Null / Empty Fields & Unspecified Requirements');
const emptyRes = calculateJobFit({}, {}, 0.50);
assert(emptyRes.jobFitScore >= 0 && emptyRes.jobFitScore <= 100, 'Empty candidate/job objects produce valid bounded score');
assert(emptyRes.breakdown.educationCompatibility === 100, 'Unspecified education defaults to 100%');
assert(emptyRes.breakdown.experienceCompatibility === 100, 'Unspecified experience defaults to 100%');

console.log('\n═════════════════════════════════════════════════════════════════');
console.log(`SUMMARY: ${passed} assertions passed, ${failed} failed.`);
console.log('═════════════════════════════════════════════════════════════════\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
