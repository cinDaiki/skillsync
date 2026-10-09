import assert from "assert";
import {
  isAccountActive,
  isAccountSuspended,
  parseJsonField,
  formatFileSize,
  getCandidateEducationSummary,
  getCandidateExperienceSummary,
  calculateProfileCompletion,
} from "../src/services/adminService.js";

console.log("=== RUNNING ADMIN JOBSEEKER MANAGEMENT & USER DOSSIER TESTS ===");

// ── Test 1: parseJsonField ──
console.log("\n[Test 1] parseJsonField safe parsing");
assert.deepStrictEqual(parseJsonField(null, []), []);
assert.deepStrictEqual(parseJsonField(undefined, []), []);
assert.deepStrictEqual(parseJsonField([], []), []);
assert.deepStrictEqual(parseJsonField([{ a: 1 }], []), [{ a: 1 }]);
assert.deepStrictEqual(parseJsonField('{"key":"value"}', {}), { key: "value" });
assert.deepStrictEqual(parseJsonField('[{"title":"Dev"}]', []), [{ title: "Dev" }]);
assert.deepStrictEqual(parseJsonField("invalid json string", []), []);
console.log("✓ parseJsonField handles null, undefined, valid and invalid JSON safely");

// ── Test 2: formatFileSize ──
console.log("\n[Test 2] formatFileSize formatting");
assert.strictEqual(formatFileSize(0), "0.00 KB");
assert.strictEqual(formatFileSize(null), "0.00 KB");
assert.strictEqual(formatFileSize(1024), "1.0 KB");
assert.strictEqual(formatFileSize(2048), "2.0 KB");
assert.strictEqual(formatFileSize(1048576), "1.00 MB");
console.log("✓ formatFileSize formats byte values correctly");

// ── Test 3: getCandidateEducationSummary ──
console.log("\n[Test 3] getCandidateEducationSummary");
assert.strictEqual(
  getCandidateEducationSummary({ role: "employer" }),
  "N/A - Employer Account"
);
assert.strictEqual(
  getCandidateEducationSummary({ role: "admin" }),
  "N/A - Admin Account"
);

// Real candidate with education array
const candidateWithEdu = {
  role: "candidate",
  education: [
    { degree: "BS Computer Science", field: "Computer Science", school: "UP Diliman" }
  ]
};
assert.strictEqual(
  getCandidateEducationSummary(candidateWithEdu),
  "BS Computer Science in Computer Science (UP Diliman)"
);

// Real candidate with candidate_profile fallback
const candidateWithCpEdu = {
  role: "candidate",
  education: [],
  candidate_profile: { degree: "Master of Science", course: "Data Science" }
};
assert.strictEqual(
  getCandidateEducationSummary(candidateWithCpEdu),
  "Master of Science in Data Science"
);

// Real candidate with no education -> "Not provided" (NEVER hardcoded BSIT)
const candidateNoEdu = {
  role: "candidate",
  education: []
};
assert.strictEqual(
  getCandidateEducationSummary(candidateNoEdu),
  "Not provided"
);
assert.notStrictEqual(
  getCandidateEducationSummary(candidateNoEdu),
  "Bachelor of Science in Information Technology"
);
console.log("✓ getCandidateEducationSummary extracts actual education and returns 'Not provided' when empty");

// ── Test 4: getCandidateExperienceSummary ──
console.log("\n[Test 4] getCandidateExperienceSummary");
assert.strictEqual(
  getCandidateExperienceSummary({ role: "employer" }),
  "N/A - Employer Account"
);
assert.strictEqual(
  getCandidateExperienceSummary({ role: "admin" }),
  "N/A - Admin Account"
);

// Real candidate with work experience
const candidateWithExp = {
  role: "candidate",
  work_experience: [
    { title: "Frontend Engineer", company: "Acme Corp", startDate: "2021", endDate: "2024" }
  ]
};
assert.strictEqual(
  getCandidateExperienceSummary(candidateWithExp),
  "Frontend Engineer at Acme Corp (2021 - 2024)"
);

// Real candidate with multiple work experiences
const candidateWithMultipleExp = {
  role: "candidate",
  work_experience: [
    { title: "Senior Lead", company: "Tech Inc", startDate: "2022", endDate: "Present" },
    { title: "Junior Dev", company: "StartCo", startDate: "2020", endDate: "2022" }
  ]
};
assert.strictEqual(
  getCandidateExperienceSummary(candidateWithMultipleExp),
  "Senior Lead at Tech Inc (2022 - Present) (+1 more)"
);

// Real candidate with years_experience fallback
const candidateWithCpYears = {
  role: "candidate",
  work_experience: [],
  candidate_profile: { years_experience: 3 }
};
assert.strictEqual(
  getCandidateExperienceSummary(candidateWithCpYears),
  "3 years experience"
);

// Real candidate with no experience -> "Not provided" (NEVER hardcoded Software Engineer 2+ years)
const candidateNoExp = {
  role: "candidate",
  work_experience: []
};
assert.strictEqual(
  getCandidateExperienceSummary(candidateNoExp),
  "Not provided"
);
assert.notStrictEqual(
  getCandidateExperienceSummary(candidateNoExp),
  "Software Engineer (2+ Years experience)"
);
console.log("✓ getCandidateExperienceSummary extracts actual experience and returns 'Not provided' when empty");

// ── Test 5: Summary counts logic ──
console.log("\n[Test 5] Summary Counts logic");
const sampleCandidateList = [
  { id: "1", role: "candidate", is_suspended: false, verification_status: "Verified" },
  { id: "2", role: "candidate", is_suspended: false, verification_status: "Pending Verification" },
  { id: "3", role: "candidate", is_suspended: false, verification_status: "Under Review" },
  { id: "4", role: "candidate", is_suspended: true,  verification_status: "Pending" },
  { id: "5", role: "candidate", is_suspended: true,  verification_status: "Suspended" },
];

const totalCount = sampleCandidateList.length;
const activeCount = sampleCandidateList.filter(isAccountActive).length;
const suspendedCount = sampleCandidateList.filter(isAccountSuspended).length;
const verifiedCount = sampleCandidateList.filter(p => p.verification_status === "Verified" || p.verification_status === "Approved").length;
const pendingCount = sampleCandidateList.filter(p => !p.verification_status || p.verification_status === "Pending" || p.verification_status === "Pending Verification" || p.verification_status === "Under Review").length;

assert.strictEqual(totalCount, 5, "Total candidates must be 5 (all accounts including suspended)");
assert.strictEqual(activeCount, 3, "Active accounts must be 3");
assert.strictEqual(suspendedCount, 2, "Suspended accounts must be 2");
assert.strictEqual(verifiedCount, 1, "Verified accounts must be 1");
assert.strictEqual(pendingCount, 3, "Pending accounts must be 3 (candidate 2, 3, 4)");
assert.notStrictEqual(totalCount, activeCount, "Total candidates must NOT be equal to active accounts when suspended exist");
console.log("✓ Summary counts correctly distinguish Total Candidates vs Active Accounts vs Suspended");

// ── Test 6: calculateProfileCompletion ──
console.log("\n[Test 6] calculateProfileCompletion");
const fullCandidate = {
  full_name: "Jane Doe",
  email: "jane@example.com",
  contact_number: "+639123456789",
  address: "Makati City",
  skills: "JavaScript, React",
  education: [{ degree: "BSCS", school: "UP" }],
  work_experience: [{ title: "Dev", company: "Acme" }],
  resume_url: "https://example.com/resume.pdf"
};
const fullScore = calculateProfileCompletion(fullCandidate);
assert.strictEqual(fullScore, 100, `Full profile should score 100, got ${fullScore}`);

const minimalCandidate = {
  full_name: "John Doe",
  email: "john@example.com"
};
const minimalScore = calculateProfileCompletion(minimalCandidate);
assert.strictEqual(minimalScore, 35, `Minimal profile should score 35 (20+15), got ${minimalScore}`);
console.log("✓ calculateProfileCompletion calculates score accurately");

console.log("\n🎉 ALL ADMIN JOBSEEKER MANAGEMENT UNIT TESTS PASSED!");
