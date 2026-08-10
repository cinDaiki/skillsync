import assert from 'assert';
import {
  matchMicrocredentialsForMissingSkills,
  normalizeSkillForCatalog,
  CURATED_MICROCREDENTIALS
} from '../../microcredentialService.js';
import { calculateJobFit } from '../../ai/jobFitEngine.js';

console.log("=== RUNNING MICROCREDENTIALS FEATURE TEST SUITE ===\n");

// TEST 1: Candidate has all job skills
console.log("--- TEST 1: Candidate has all required skills ---");
const test1Res = matchMicrocredentialsForMissingSkills([]);
assert.deepStrictEqual(test1Res, [], "Expected empty array when candidate has all skills");
console.log("✅ TEST 1 PASSED: Zero microcredentials recommended when no skills missing.");

// TEST 2: Candidate missing one skill (Docker)
console.log("\n--- TEST 2: Candidate missing 1 skill (Docker) ---");
const test2Res = matchMicrocredentialsForMissingSkills(['Docker']);
assert.strictEqual(test2Res.length, 1, "Expected 1 microcredential for Docker");
assert.strictEqual(test2Res[0].skill, 'Docker');
assert.strictEqual(test2Res[0].title, 'Docker & Container Fundamentals');
assert.strictEqual(test2Res[0].provider, 'Coursera');
assert.strictEqual(test2Res[0].url, 'https://www.coursera.org/learn/docker-fundamentals');
console.log("✅ TEST 2 PASSED: Docker skill correctly maps to controlled Coursera credential.");

// TEST 3: Candidate missing multiple skills (Docker, AWS, Python)
console.log("\n--- TEST 3: Candidate missing multiple skills (Docker, AWS, Python) ---");
const test3Res = matchMicrocredentialsForMissingSkills(['Docker', 'AWS', 'Python']);
assert.strictEqual(test3Res.length, 3, "Expected 3 microcredentials");
const titles = test3Res.map(m => m.title);
assert(titles.includes('Docker & Container Fundamentals'));
assert(titles.includes('AWS Cloud Practitioner Essentials'));
assert(titles.includes('Python for Data Science & AI'));
console.log("✅ TEST 3 PASSED: Multiple missing skills map to distinct credentials without duplicates.");

// TEST 4: Missing skill with NO catalog entry (UnicornJS)
console.log("\n--- TEST 4: Missing skill with no catalog entry ---");
const test4Res = matchMicrocredentialsForMissingSkills(['UnicornJS']);
assert.strictEqual(test4Res.length, 0, "Expected 0 microcredentials when skill not in catalog");
console.log("✅ TEST 4 PASSED: Missing skill displayed but no fake credential invented.");

// TEST 5: Skill Alias & Canonicalization (Amazon Web Services -> AWS, React.js -> React)
console.log("\n--- TEST 5: Canonical Skill Alias Normalization ---");
assert.strictEqual(normalizeSkillForCatalog("Amazon Web Services"), "aws");
assert.strictEqual(normalizeSkillForCatalog("React.js"), "react");
assert.strictEqual(normalizeSkillForCatalog("Postgres"), "postgresql");

const test5Res = matchMicrocredentialsForMissingSkills(['Amazon Web Services', 'React.js', 'Postgres']);
assert.strictEqual(test5Res.length, 3);
assert.strictEqual(test5Res[0].title, 'AWS Cloud Practitioner Essentials');
assert.strictEqual(test5Res[1].title, 'React Front-End Developer Certificate');
assert.strictEqual(test5Res[2].title, 'PostgreSQL Relational Database Administration');
console.log("✅ TEST 5 PASSED: Skill aliases normalized to canonical catalog entries.");

// TEST 6: JobFitEngine Integration Test
console.log("\n--- TEST 6: Integration with JobFitEngine ---");
const dummyCandidate = {
  skills: ['React', 'JavaScript', 'Node.js'],
  education: [],
  work_experience: [],
  certifications: [],
  years_experience: 2
};
const dummyJob = {
  required_skills: 'React, JavaScript, Node.js, Docker, AWS',
  required_education: 'Bachelor',
  experience_required: '2 years'
};

const fitResult = calculateJobFit(dummyCandidate, dummyJob);
assert(Array.isArray(fitResult.recommendedMicrocredentials));
assert.strictEqual(fitResult.recommendedMicrocredentials.length, 2); // Docker & AWS
assert.strictEqual(fitResult.recommendedMicrocredentials[0].skill_name, 'Docker');
assert.strictEqual(fitResult.recommendedMicrocredentials[1].skill_name, 'AWS');
console.log("✅ TEST 6 PASSED: jobFitEngine successfully computes controlled microcredentials for gap analysis.");

// TEST 7: Inactive catalog credentials are excluded
console.log("\n--- TEST 7: Inactive Catalog Items Filtering ---");
const customCatalogWithInactive = [
  { id: 'mc-inact-1', skill_name: 'Rust', canonical_skill: 'rust', title: 'Rust Master', is_active: false, credential_url: 'https://example.com/rust' }
];
const test7Res = matchMicrocredentialsForMissingSkills(['Rust'], customCatalogWithInactive);
assert.strictEqual(test7Res.length, 0, "Inactive catalog items must not be recommended");
console.log("✅ TEST 7 PASSED: Inactive catalog items correctly ignored.");

// TEST 8: Non-HTTPS or invalid URLs rejected
console.log("\n--- TEST 8: Invalid / Non-HTTPS URL Rejection ---");
const customCatalogInvalidUrl = [
  { id: 'mc-http-1', skill_name: 'Go', canonical_skill: 'go', title: 'Go Basics', is_active: true, credential_url: 'http://insecure-http.com/go' }
];
const test8Res = matchMicrocredentialsForMissingSkills(['Go'], customCatalogInvalidUrl);
assert.strictEqual(test8Res.length, 0, "Non-HTTPS URLs must be rejected");
console.log("✅ TEST 8 PASSED: Non-HTTPS URLs correctly rejected.");

// TEST 9: Duplicate missing skills deduplicated (max 1 per skill)
console.log("\n--- TEST 9: Duplicate Skill Deduplication ---");
const test9Res = matchMicrocredentialsForMissingSkills(['Docker', 'Docker', 'docker']);
assert.strictEqual(test9Res.length, 1, "Duplicate missing skills must return at most 1 credential");
console.log("✅ TEST 9 PASSED: Duplicate missing skills return exactly 1 credential.");

console.log("\n=== ALL MICROCREDENTIALS UNIT TESTS PASSED SUCCESSFULLY ===");
