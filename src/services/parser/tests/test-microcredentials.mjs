import assert from 'assert';
import {
  matchMicrocredentialsForMissingSkills,
  normalizeSkillForCatalog,
  isValidCredentialUrl,
  CURATED_MICROCREDENTIALS
} from '../../microcredentialService.js';
import { calculateJobFit } from '../../ai/jobFitEngine.js';

console.log("=== RUNNING SKILLSYNC MULTI-SOURCE MICROCREDENTIALS TEST SUITE ===\n");

// ── TEST 1: No gaps (Zero skill gaps behavior) ──
console.log("--- TEST 1: Candidate has all required skills (No gaps) ---");
const test1Res = matchMicrocredentialsForMissingSkills([]);
assert.deepStrictEqual(test1Res, [], "Expected empty array when candidate has all skills");
console.log("✅ TEST 1 PASSED: Zero microcredentials recommended when no skills missing.");

// ── TEST 2: Sales gaps multi-gap matching ──
console.log("\n--- TEST 2: Sales gaps (Customer Service matched, missing Sales, Communication, Negotiation, Lead Gen, CRM) ---");
const salesMissing = ['Sales', 'Communication', 'Negotiation', 'Lead Generation', 'CRM'];
const test2Res = matchMicrocredentialsForMissingSkills(salesMissing);

assert(test2Res.length > 0, "Expected recommended credentials for sales gaps");
const salesProviders = test2Res.map(m => m.provider);
console.log(`   Found ${test2Res.length} recommendations from: ${salesProviders.join(', ')}`);
assert(salesProviders.some(p => p === 'HubSpot Academy' || p === 'Northwestern University'), "Expected top sales academy recommendations");
console.log("✅ TEST 2 PASSED: Sales skill gaps correctly mapped to high-value multi-gap credentials.");

// ── TEST 3: Multi-skill gap coverage per credential ──
console.log("\n--- TEST 3: Multi-skill credential coverage aggregation ---");
const multiGaps = ['Sales', 'Negotiation', 'Closing Sales', 'Upselling', 'CRM'];
const test3Res = matchMicrocredentialsForMissingSkills(multiGaps);
const topRec = test3Res[0];

assert(topRec.coverageCount >= 2, `Top recommendation should cover multiple missing skills, got ${topRec.coverageCount}`);
assert(Array.isArray(topRec.coveredSkills), "Recommendation must include list of covered missing skills");
console.log(`   Top credential '${topRec.title}' covers ${topRec.coverageCount} gaps: ${topRec.coveredSkills.join(' • ')}`);
console.log("✅ TEST 3 PASSED: One credential covers multiple related gaps without duplicate recommendations.");

// ── TEST 4: Verified URL validation & safety ──
console.log("\n--- TEST 4: Verified HTTPS URL validation ---");
assert.strictEqual(isValidCredentialUrl("https://academy.hubspot.com/courses/inbound-sales"), true);
assert.strictEqual(isValidCredentialUrl("https://www.coursera.org/learn/docker-fundamentals"), true);
assert.strictEqual(isValidCredentialUrl("https://www.tesda.gov.ph/"), true);
assert.strictEqual(isValidCredentialUrl("javascript:alert(1)"), false, "javascript: URL must be rejected");
assert.strictEqual(isValidCredentialUrl("data:text/html,bad"), false, "data: URL must be rejected");
assert.strictEqual(isValidCredentialUrl(""), false, "Empty URL must be rejected");
assert.strictEqual(isValidCredentialUrl(null), false, "Null URL must be rejected");
console.log("✅ TEST 4 PASSED: External URLs validated for HTTPS and dangerous schemes rejected.");

// ── TEST 5: Missing / Invalid URL fallback ──
console.log("\n--- TEST 5: Missing / Invalid URL graceful handling ---");
const customCatalogNoUrl = [
  { id: 'mc-nourl-1', title: 'Internal Workshop', provider: 'Company', skills: ['Teamwork'], officialUrl: '' }
];
const test5Res = matchMicrocredentialsForMissingSkills(['Teamwork'], customCatalogNoUrl);
assert.strictEqual(test5Res.length, 1);
assert.strictEqual(test5Res[0].url, null, "URL should be null when not provided, preventing broken buttons");
console.log("✅ TEST 5 PASSED: Missing URL handled cleanly without broken buttons.");

// ── TEST 6: Unknown / unsupported skill behavior ──
console.log("\n--- TEST 6: Unknown skill with no catalog match ---");
const test6Res = matchMicrocredentialsForMissingSkills(['SomeUnsupportedQuantumSkillXYZ']);
assert.strictEqual(test6Res.length, 0, "Expected 0 microcredentials for unsupported skill");
console.log("✅ TEST 6 PASSED: Unsupported skill returns zero fake credentials.");

// ── TEST 7: Skill Alias & Canonicalization ──
console.log("\n--- TEST 7: Canonical Skill Alias Normalization ---");
assert.strictEqual(normalizeSkillForCatalog("MS Office"), "microsoft office");
assert.strictEqual(normalizeSkillForCatalog("Amazon Web Services"), "aws");
assert.strictEqual(normalizeSkillForCatalog("React.js"), "react");
assert.strictEqual(normalizeSkillForCatalog("Postgres"), "postgresql");
assert.strictEqual(normalizeSkillForCatalog("B2B Sales"), "sales");
assert.strictEqual(normalizeSkillForCatalog("Lead Gen"), "lead generation");

const test7Res = matchMicrocredentialsForMissingSkills(['MS Office', 'Amazon Web Services', 'React.js']);
assert(test7Res.length >= 2, "Aliases should map to canonical catalog entries");
const test7Titles = test7Res.map(r => r.title);
assert(test7Titles.some(t => t.includes('Microsoft Office') || t.includes('MOS')));
assert(test7Titles.some(t => t.includes('AWS') || t.includes('React')));
console.log("✅ TEST 7 PASSED: Skill aliases normalized to canonical catalog entries.");

// ── TEST 8: Duplicate catalog & skill input deduplication ──
console.log("\n--- TEST 8: Duplicate input deduplication ---");
const test8Res = matchMicrocredentialsForMissingSkills(['Docker', 'Docker', 'docker', 'DOCKER']);
assert.strictEqual(test8Res.length, 1, "Duplicate missing skills must return at most 1 credential");
console.log("✅ TEST 8 PASSED: Duplicate missing skills return exactly 1 unique credential.");

// ── TEST 9: Provider metadata & Multi-Source categorization ──
console.log("\n--- TEST 9: Provider metadata and multi-source types ---");
const tesdaItem = CURATED_MICROCREDENTIALS.find(c => c.sourceType === 'tesda');
assert(tesdaItem !== undefined, "Catalog must include TESDA qualifications");
assert.strictEqual(tesdaItem.provider, 'TESDA');
assert.strictEqual(tesdaItem.credentialType, 'competency_certificate');

const googleItem = CURATED_MICROCREDENTIALS.find(c => c.provider === 'Google');
assert(googleItem !== undefined, "Catalog must include Google Career Certificates");
assert.strictEqual(googleItem.sourceType, 'learning_platform');

const industryItem = CURATED_MICROCREDENTIALS.find(c => c.sourceType === 'industry_provider');
assert(industryItem !== undefined, "Catalog must include Industry Certification providers");

const openBadgeItem = CURATED_MICROCREDENTIALS.find(c => c.sourceType === 'open_badge');
assert(openBadgeItem !== undefined, "Catalog must include Open Badges providers");
console.log("✅ TEST 9 PASSED: Multi-source providers (TESDA, Google, Industry, Open Badges) correctly categorized.");

// ── TEST 10: Existing JobFitEngine Regression ──
console.log("\n--- TEST 10: Existing JobFitEngine integration regression ---");
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
const fitSkillNames = fitResult.recommendedMicrocredentials.map(r => r.skill_name || r.skill);
assert(fitSkillNames.some(s => s.toLowerCase() === 'docker'), "Missing Docker recommendation in fitResult");
assert(fitSkillNames.some(s => s.toLowerCase() === 'aws'), "Missing AWS recommendation in fitResult");
console.log("✅ TEST 10 PASSED: JobFitEngine integration executes cleanly and preserves regression compatibility.");

console.log("\n=== ALL 10 MICROCREDENTIALS TEST SUITE CASES PASSED SUCCESSFULLY ===");
