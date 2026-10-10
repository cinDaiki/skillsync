import assert from "assert";
import {
  isAccountActive,
  isAccountSuspended,
  parseJsonField,
  formatFileSize,
  parseSkillsList,
  resolveCandidateSkills,
  resolveCandidateWorkExperience,
  resolveCandidateCertifications,
  resolveCandidateEducation,
  resolveCandidateResume,
  calculateAdminJobseekerSummary,
  mergeCandidateProfileData,
  getCandidateEducationSummary,
  getCandidateExperienceSummary,
  calculateProfileCompletion,
  isValidUuid,
  filterAuditLogsLocally,
} from "../src/services/adminService.js";

console.log("=== RUNNING ADMIN JOBSEEKER DATA FALLBACK & RECONCILIATION TESTS ===");

// ── Test 1: parseJsonField and formatFileSize ──
console.log("\n[Test 1] parseJsonField and formatFileSize");
assert.deepStrictEqual(parseJsonField(null, []), []);
assert.deepStrictEqual(parseJsonField(undefined, []), []);
assert.deepStrictEqual(parseJsonField([], []), []);
assert.deepStrictEqual(parseJsonField([{ a: 1 }], []), [{ a: 1 }]);
assert.deepStrictEqual(parseJsonField('{"key":"value"}', {}), { key: "value" });
assert.deepStrictEqual(parseJsonField('[{"title":"Dev"}]', []), [{ title: "Dev" }]);
assert.deepStrictEqual(parseJsonField("invalid json string", []), []);

assert.strictEqual(formatFileSize(0), "0.00 KB");
assert.strictEqual(formatFileSize(null), "0.00 KB");
assert.strictEqual(formatFileSize(1024), "1.0 KB");
assert.strictEqual(formatFileSize(2048), "2.0 KB");
assert.strictEqual(formatFileSize(1048576), "1.00 MB");
console.log("✓ parseJsonField and formatFileSize pass all edge cases");

// ── Test 2: parseSkillsList and resolveCandidateSkills (Empty Array Fallback) ──
console.log("\n[Test 2] resolveCandidateSkills (Empty Array Fallback)");
// 2A: Empty primary array must NOT hide populated fallback array
const emptyPrimarySkills = [];
const fallbackSkills = ["Python", "FastAPI", "PostgreSQL"];
const resolvedSkillsA = resolveCandidateSkills(emptyPrimarySkills, fallbackSkills);
assert.deepStrictEqual(
  resolvedSkillsA,
  fallbackSkills,
  "Empty primary skills array must fall back to candidate_profiles skills"
);

// 2B: Populated primary array takes precedence over fallback
const populatedPrimarySkills = ["Go", "Kubernetes"];
const resolvedSkillsB = resolveCandidateSkills(populatedPrimarySkills, fallbackSkills);
assert.deepStrictEqual(
  resolvedSkillsB,
  populatedPrimarySkills,
  "Populated primary skills must take precedence"
);

// 2C: Comma-separated string primary parsed properly
const commaPrimarySkills = "Vue.js, Nuxt, Tailwind";
const resolvedSkillsC = resolveCandidateSkills(commaPrimarySkills, []);
assert.deepStrictEqual(
  resolvedSkillsC,
  ["Vue.js", "Nuxt", "Tailwind"],
  "Comma-separated primary string must be parsed into array"
);

// 2D: Both empty returns empty array
assert.deepStrictEqual(resolveCandidateSkills([], []), []);
assert.deepStrictEqual(resolveCandidateSkills(null, null), []);
console.log("✓ resolveCandidateSkills handles empty-array fallbacks and string formats properly");

// ── Test 3: resolveCandidateWorkExperience (Empty Array Fallback) ──
console.log("\n[Test 3] resolveCandidateWorkExperience (Empty Array Fallback)");
// 3A: Empty primary work_experience with populated fallback candidate_profile experience
const emptyPrimaryExp = [];
const fallbackCpExp = {
  experience: [
    { title: "Staff Engineer", company: "Acme Corp", startDate: "2021", endDate: "2024" }
  ]
};
const resolvedExpA = resolveCandidateWorkExperience(emptyPrimaryExp, fallbackCpExp);
assert.strictEqual(resolvedExpA.length, 1);
assert.strictEqual(resolvedExpA[0].title, "Staff Engineer");

// 3B: Populated primary work_experience takes precedence
const populatedPrimaryExp = [
  { title: "Lead Dev", company: "Prime Tech", startDate: "2023", endDate: "Present" }
];
const resolvedExpB = resolveCandidateWorkExperience(populatedPrimaryExp, fallbackCpExp);
assert.deepStrictEqual(resolvedExpB, populatedPrimaryExp);

// 3C: Both empty returns empty array
assert.deepStrictEqual(resolveCandidateWorkExperience([], null), []);
console.log("✓ resolveCandidateWorkExperience prefers populated primary, falls back properly");

// ── Test 4: resolveCandidateCertifications (Empty Array Fallback) ──
console.log("\n[Test 4] resolveCandidateCertifications (Empty Array Fallback)");
const emptyPrimaryCerts = [];
const fallbackCerts = [{ name: "AWS Certified Solutions Architect", issuer: "Amazon" }];
const resolvedCertsA = resolveCandidateCertifications(emptyPrimaryCerts, fallbackCerts);
assert.deepStrictEqual(resolvedCertsA, fallbackCerts);

const populatedPrimaryCerts = [{ name: "CKA", issuer: "CNCF" }];
const resolvedCertsB = resolveCandidateCertifications(populatedPrimaryCerts, fallbackCerts);
assert.deepStrictEqual(resolvedCertsB, populatedPrimaryCerts);

assert.deepStrictEqual(resolveCandidateCertifications([], []), []);
console.log("✓ resolveCandidateCertifications correctly avoids empty-array suppression");

// ── Test 5: resolveCandidateEducation & getCandidateEducationSummary ──
console.log("\n[Test 5] resolveCandidateEducation and getCandidateEducationSummary");
// 5A: Empty profiles.education with populated candidate_profiles.degree and course
const emptyProfileEdu = [];
const cpWithDegreeCourse = {
  degree: "BS Computer Science",
  course: "Data Science & Artificial Intelligence",
  education_level: "Bachelor's Degree"
};
const normalizedEdu = resolveCandidateEducation(emptyProfileEdu, cpWithDegreeCourse);
assert.strictEqual(normalizedEdu.length, 1, "Should synthesize normalized education record");
assert.strictEqual(normalizedEdu[0].degree, "BS Computer Science");
assert.strictEqual(normalizedEdu[0].field, "Data Science & Artificial Intelligence");
assert.strictEqual(normalizedEdu[0].education_level, "Bachelor's Degree");

// Ensure education summary renders the actual data (NEVER 'Not provided' or hardcoded BSIT)
const candidateEduObj = {
  role: "candidate",
  education: emptyProfileEdu,
  candidate_profile: cpWithDegreeCourse
};
const eduSummary = getCandidateEducationSummary(candidateEduObj);
assert.strictEqual(
  eduSummary,
  "BS Computer Science in Data Science & Artificial Intelligence",
  "Summary must display real candidate degree and course"
);
assert.notStrictEqual(eduSummary, "Not provided");
assert.notStrictEqual(eduSummary, "Bachelor of Science in Information Technology");

// 5B: Populated primary education takes precedence
const populatedProfileEdu = [
  { degree: "Master of Science", field: "Computer Engineering", school: "UP Diliman" }
];
const resolvedEduB = resolveCandidateEducation(populatedProfileEdu, cpWithDegreeCourse);
assert.deepStrictEqual(resolvedEduB, populatedProfileEdu);
const eduSummaryB = getCandidateEducationSummary({ role: "candidate", education: populatedProfileEdu });
assert.strictEqual(eduSummaryB, "Master of Science in Computer Engineering (UP Diliman)");

// 5C: When neither source has education, return 'Not provided'
const noEduCandidate = { role: "candidate", education: [] };
assert.strictEqual(getCandidateEducationSummary(noEduCandidate), "Not provided");
assert.deepStrictEqual(resolveCandidateEducation([], null), []);

// 5D: Role checks
assert.strictEqual(getCandidateEducationSummary({ role: "employer" }), "N/A - Employer Account");
assert.strictEqual(getCandidateEducationSummary({ role: "admin" }), "N/A - Admin Account");
console.log("✓ resolveCandidateEducation normalizes scalar degree/course and respects precedence");

// ── Test 6: getCandidateExperienceSummary ──
console.log("\n[Test 6] getCandidateExperienceSummary");
// 6A: Populated work experience
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

// 6B: Fallback to years_experience
const candidateWithYearsOnly = {
  role: "candidate",
  work_experience: [],
  candidate_profile: { years_experience: 4 }
};
assert.strictEqual(
  getCandidateExperienceSummary(candidateWithYearsOnly),
  "4 years experience"
);

// 6C: No experience returns 'Not provided' (NEVER hardcoded Software Engineer 2+ years)
const candidateNoExp = { role: "candidate", work_experience: [] };
assert.strictEqual(getCandidateExperienceSummary(candidateNoExp), "Not provided");
assert.notStrictEqual(
  getCandidateExperienceSummary(candidateNoExp),
  "Software Engineer (2+ Years experience)"
);
console.log("✓ getCandidateExperienceSummary extracts actual experience and handles fallbacks");

// ── Test 7: resolveCandidateResume (Preserving Legacy Resume URLs & Deterministic Selection) ──
console.log("\n[Test 7] resolveCandidateResume (Legacy Preservation & Deterministic Selection)");
// 7A: Legacy resume_url exists when NO matching resumes row exists
const legacyProfile = {
  id: "user-123",
  resume_url: "https://storage.supabase.co/resumes/legacy_cv_user123.pdf",
};
const resolvedLegacy = resolveCandidateResume(null, legacyProfile);
assert.strictEqual(
  resolvedLegacy.resume_url,
  "https://storage.supabase.co/resumes/legacy_cv_user123.pdf",
  "Must preserve legacy resume_url when no resumes row exists"
);
assert.ok(resolvedLegacy.resume, "Must construct a structured resume object for legacy resume");
assert.strictEqual(resolvedLegacy.resume.file_url, legacyProfile.resume_url);
assert.strictEqual(resolvedLegacy.resume.is_legacy, true);

// 7B: Matching resumes record exists -> prefer matching record
const modernResumeRow = {
  id: "res-456",
  applicant_id: "user-123",
  file_url: "https://storage.supabase.co/resumes/modern_cv_456.pdf",
  file_name: "Modern_CV.pdf",
  file_size: 204800,
  created_at: "2026-05-01T10:00:00Z"
};
const resolvedModern = resolveCandidateResume(modernResumeRow, legacyProfile);
assert.strictEqual(
  resolvedModern.resume_url,
  "https://storage.supabase.co/resumes/modern_cv_456.pdf",
  "Must prefer modern resume row over legacy URL"
);
assert.strictEqual(resolvedModern.resume.file_name, "Modern_CV.pdf");

// 7C: Multiple resumes for one candidate -> deterministically pick newest
const multipleResumes = [
  { id: "old-res", file_url: "https://storage.co/old.pdf", created_at: "2025-01-01T00:00:00Z" },
  { id: "new-res", file_url: "https://storage.co/new.pdf", created_at: "2026-08-01T00:00:00Z" },
  { id: "mid-res", file_url: "https://storage.co/mid.pdf", created_at: "2025-12-01T00:00:00Z" },
];
const resolvedMulti = resolveCandidateResume(multipleResumes, legacyProfile);
assert.strictEqual(
  resolvedMulti.resume.id,
  "new-res",
  "Must pick newest resume row deterministically"
);
assert.strictEqual(resolvedMulti.resume_url, "https://storage.co/new.pdf");

// 7D: Neither exists -> returns nulls
const noResume = resolveCandidateResume(null, { id: "user-no-res", resume_url: null });
assert.strictEqual(noResume.resume, null);
assert.strictEqual(noResume.resume_url, null);
console.log("✓ resolveCandidateResume preserves legacy URLs and deterministically selects newest row");

// ── Test 8: calculateAdminJobseekerSummary (Production Summary Helper) ──
console.log("\n[Test 8] calculateAdminJobseekerSummary (Production Summary Helper)");
const testCandidates = [
  // 1: Active, Verified
  { id: "c1", role: "candidate", is_suspended: false, verification_status: "Verified" },
  // 2: Active, Approved (canonical synonym for verified)
  { id: "c2", role: "candidate", is_suspended: false, verification_status: "Approved" },
  // 3: Active, Pending Verification
  { id: "c3", role: "candidate", is_suspended: false, verification_status: "Pending Verification" },
  // 4: Active, Under Review
  { id: "c4", role: "candidate", is_suspended: false, verification_status: "Under Review" },
  // 5: Active, null verification status (treated as pending)
  { id: "c5", role: "candidate", is_suspended: false, verification_status: null },
  // 6: Suspended indefinitely, Pending
  { id: "c6", role: "candidate", is_suspended: true, suspension_expires_at: null, verification_status: "Pending" },
  // 7: Suspended with active future expiry date
  { id: "c7", role: "candidate", is_suspended: true, suspension_expires_at: new Date(Date.now() + 86400000).toISOString(), verification_status: "Suspended" },
  // 8: Expired suspension (isAccountActive -> true)
  { id: "c8", role: "candidate", is_suspended: true, suspension_expires_at: new Date(Date.now() - 86400000).toISOString(), verification_status: "Verified" },
];

const summaryResult = calculateAdminJobseekerSummary(testCandidates);
assert.strictEqual(summaryResult.total, 8, "Total candidates must be 8");
assert.strictEqual(summaryResult.active, 6, "Active candidates must be 6 (c1..c5 plus expired c8)");
assert.strictEqual(summaryResult.suspended, 2, "Suspended candidates must be 2 (c6 and c7)");
assert.strictEqual(summaryResult.verified, 3, "Verified accounts must be 3 (c1, c2, c8)");
assert.strictEqual(summaryResult.pending, 4, "Pending accounts must be 4 (c3, c4, c5, c6)");

// Zero-candidate list edge case
const emptySummary = calculateAdminJobseekerSummary([]);
assert.deepStrictEqual(emptySummary, { total: 0, active: 0, suspended: 0, verified: 0, pending: 0 });
console.log("✓ calculateAdminJobseekerSummary exercises production logic and edge cases accurately");

// ── Test 9: mergeCandidateProfileData (Full Unified Merge) ──
console.log("\n[Test 9] mergeCandidateProfileData (Full Unified Merge)");
const rawCandidate = {
  id: "cand-full",
  full_name: "Alex Reyes",
  email: "alex@example.com",
  skills: [], // empty primary array
  education: [], // empty primary array
  work_experience: [], // empty primary array
  certifications: [], // empty primary array
  resume_url: "https://storage.co/legacy.pdf", // legacy resume
};

const rawCp = {
  degree: "BS Information Systems",
  course: "Enterprise Systems",
  education_level: "Bachelor's Degree",
  skills: ["SAP", "Python", "SQL"],
  certifications: [{ name: "SAP Certified Associate" }],
  years_experience: 3,
  career_stage: "Mid-Level",
  preferred_categories: ["Technology"],
  preferred_roles: ["Systems Analyst"],
};

const merged = mergeCandidateProfileData(rawCandidate, rawCp, null);
assert.strictEqual(merged.skills.length, 3, "Skills must be populated from candidate_profile");
assert.strictEqual(merged.education.length, 1, "Education must be normalized from degree/course");
assert.strictEqual(merged.education[0].degree, "BS Information Systems");
assert.strictEqual(merged.certifications.length, 1, "Certifications must be populated from candidate_profile");
assert.strictEqual(merged.resume_url, "https://storage.co/legacy.pdf", "Legacy resume_url must be preserved");
assert.ok(merged.resume, "Resume object must be constructed from legacy url");
assert.strictEqual(merged.career_stage, "Mid-Level");
assert.ok(merged.profile_completion > 50, "Profile completion must include normalized fields");
console.log("✓ mergeCandidateProfileData correctly integrates all fallback and normalization layers");

// ── Test 10: calculateProfileCompletion ──
console.log("\n[Test 10] calculateProfileCompletion");
const fullCandidate = {
  full_name: "Jane Doe",
  email: "jane@example.com",
  contact_number: "+639123456789",
  address: "Makati City",
  skills: ["JavaScript", "React"],
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

// ── Test 11: Candidate-specific Audit Trail (UUID Target Filtering & Search Preservation) ──
console.log("\n[Test 11] Candidate-specific Audit Trail (UUID Target Filtering & Search Preservation)");

// 11A: isValidUuid unit checks
assert.strictEqual(isValidUuid("c39864d4-c9b0-466d-8bc3-3ff1ebfdf4c8"), true, "Valid lowercase UUID must return true");
assert.strictEqual(isValidUuid("C39864D4-C9B0-466D-8BC3-3FF1EBFDF4C8"), true, "Valid uppercase UUID must return true");
assert.strictEqual(isValidUuid("  c39864d4-c9b0-466d-8bc3-3ff1ebfdf4c8  "), true, "Valid trimmed UUID must return true");
assert.strictEqual(isValidUuid("c39864d4-c9b0"), false, "Truncated UUID must return false");
assert.strictEqual(isValidUuid("candidate@skillsync.com"), false, "Email string must return false");
assert.strictEqual(isValidUuid("USER_SUSPENDED"), false, "Action keyword must return false");
assert.strictEqual(isValidUuid(""), false, "Empty string must return false");
assert.strictEqual(isValidUuid(null), false, "Null value must return false");
assert.strictEqual(isValidUuid(undefined), false, "Undefined value must return false");

// 11B: Candidate-specific target_id filtering isolates matching candidate records
const candidateAId = "11111111-1111-4111-a111-111111111111";
const candidateBId = "22222222-2222-4222-b222-222222222222";
const jobId = "33333333-3333-4333-c333-333333333333";

const sampleLogs = [
  {
    id: "log-1",
    target_id: candidateAId,
    target_type: "candidate",
    action: "USER_SUSPENDED",
    reason: "Suspected multiple account abuse",
    created_at: "2026-10-01T10:00:00Z"
  },
  {
    id: "log-2",
    target_id: candidateBId,
    target_type: "candidate",
    action: "USER_SUSPENDED",
    reason: "Terms of service violation",
    created_at: "2026-10-02T10:00:00Z"
  },
  {
    id: "log-3",
    target_id: candidateAId,
    target_type: "candidate",
    action: "USER_UNSUSPENDED",
    reason: "Verification cleared upon review",
    created_at: "2026-10-03T10:00:00Z"
  },
  {
    id: "log-4",
    target_id: jobId,
    target_type: "job",
    action: "JOB_APPROVED",
    reason: "Compliant listing",
    created_at: "2026-10-04T10:00:00Z"
  }
];

// Searching candidateAId should find exactly log-1 and log-3, never log-2 (candidate B) or log-4
const candALogs = filterAuditLogsLocally(sampleLogs, candidateAId, "all");
assert.strictEqual(candALogs.length, 2, "Candidate A search must find exactly 2 records");
assert.deepStrictEqual(candALogs.map((l) => l.id), ["log-1", "log-3"], "Candidate A must not return candidate B or unrelated job records");

// 11C: Unknown candidate UUID must return empty array without pulling unrelated records
const unknownUuid = "99999999-9999-4999-a999-999999999999";
const unknownLogs = filterAuditLogsLocally(sampleLogs, unknownUuid, "all");
assert.strictEqual(unknownLogs.length, 0, "Unknown candidate UUID must not return unrelated records");

// 11D: General keyword search preserves action, target-type, and reason search
const suspendLogs = filterAuditLogsLocally(sampleLogs, "SUSPEND", "all");
assert.strictEqual(suspendLogs.length, 3, "Keyword 'SUSPEND' must match both USER_SUSPENDED and USER_UNSUSPENDED");

const reasonLogs = filterAuditLogsLocally(sampleLogs, "abuse", "all");
assert.strictEqual(reasonLogs.length, 1, "Reason keyword search must find log-1");
assert.strictEqual(reasonLogs[0].id, "log-1");

// 11E: Combined UUID search and actionType filter
const candASuspendedOnly = filterAuditLogsLocally(sampleLogs, candidateAId, "USER_SUSPENDED");
assert.strictEqual(candASuspendedOnly.length, 1);
assert.strictEqual(candASuspendedOnly[0].id, "log-1");

console.log("✓ Candidate-specific audit trail filtering safely isolates target records and preserves keyword searches");

// ── Test 12: User Dossier Work-History Data Regression Test ──
console.log("\n[Test 12] User Dossier Work-History Data Regression Test");

// 12A: Candidate whose work-history records exist only in candidate_profiles and years_experience is null
const candidateOnlyInCp = {
  id: "cand-cp-only",
  full_name: "Marcus Aurelius",
  role: "candidate",
  work_experience: [], // empty primary array
  experience: [], // empty legacy array
  years_experience: null, // null years in profile
};

const cpWithHistory = {
  user_id: "cand-cp-only",
  experience: [
    {
      title: "Senior Database Administrator",
      company: "Oracle Systems",
      startDate: "2020",
      endDate: "2024",
    },
    {
      title: "Database Analyst",
      company: "Data Corp",
      startDate: "2018",
      endDate: "2020",
    }
  ],
  years_experience: null, // null in candidate_profiles as well
};

const mergedDossier12A = mergeCandidateProfileData(candidateOnlyInCp, cpWithHistory, null);
assert.strictEqual(mergedDossier12A.work_experience.length, 2, "Work experience must be populated from candidate_profiles");
assert.strictEqual(mergedDossier12A.years_experience, null, "years_experience remains null");

const summary12A = getCandidateExperienceSummary(mergedDossier12A);
assert.strictEqual(
  summary12A,
  "Senior Database Administrator at Oracle Systems (2020 - 2024) (+1 more)",
  "Summary must accurately describe work history even when years_experience is null"
);

// 12B: Candidate whose work history is in candidate_profiles.work_experience with snake_case fields
const candidateWithSnakeCaseWork = {
  id: "cand-snake-work",
  full_name: "Elena Rostova",
  role: "candidate",
  work_experience: [],
  experience: [],
  years_experience: null,
};

const cpWithSnakeCaseWork = {
  user_id: "cand-snake-work",
  work_experience: [
    {
      job_title: "Cloud Infrastructure Architect",
      company_name: "AWS Enterprise",
      start_date: "2021",
      end_date: "Present",
    }
  ],
  years_experience: null,
};

const mergedDossier12B = mergeCandidateProfileData(candidateWithSnakeCaseWork, cpWithSnakeCaseWork, null);
assert.strictEqual(mergedDossier12B.work_experience.length, 1);
const summary12B = getCandidateExperienceSummary(mergedDossier12B);
assert.strictEqual(summary12B, "Cloud Infrastructure Architect at AWS Enterprise (2021 - Present)");

// 12C: Candidate where all supported sources are genuinely empty falls back to 'Not provided'
const genuinelyEmptyCandidate = {
  id: "cand-empty",
  full_name: "Empty Candidate",
  role: "candidate",
  work_experience: [],
  experience: [],
  years_experience: null,
};

const genuinelyEmptyCp = {
  user_id: "cand-empty",
  experience: [],
  work_experience: [],
  years_experience: null,
};

const mergedEmpty = mergeCandidateProfileData(genuinelyEmptyCandidate, genuinelyEmptyCp, null);
assert.strictEqual(mergedEmpty.work_experience.length, 0);
assert.strictEqual(
  getCandidateExperienceSummary(mergedEmpty),
  "Not provided",
  "Must preserve 'Not provided' fallback when all sources are genuinely empty"
);
assert.strictEqual(
  getCandidateExperienceSummary(genuinelyEmptyCandidate, genuinelyEmptyCp),
  "Not provided"
);

// 12D: Populated primary work_experience takes precedence over fallback candidate_profiles
const populatedPrimaryCand = {
  id: "cand-pop",
  full_name: "Primary Lead",
  role: "candidate",
  work_experience: [
    { title: "Principal Engineer", company: "Meta", startDate: "2023", endDate: "Present" }
  ],
  years_experience: 8,
};

const secondaryCp = {
  user_id: "cand-pop",
  experience: [
    { title: "Junior Dev", company: "Old Corp", startDate: "2015", endDate: "2017" }
  ],
  years_experience: 2,
};

const mergedPopulated = mergeCandidateProfileData(populatedPrimaryCand, secondaryCp, null);
assert.strictEqual(mergedPopulated.work_experience[0].title, "Principal Engineer", "Primary work experience must take precedence");
assert.strictEqual(getCandidateExperienceSummary(mergedPopulated), "Principal Engineer at Meta (2023 - Present)");

console.log("✓ User Dossier work-history fallback and summary precedence passed all regression tests");

console.log("\n🎉 ALL ADMIN JOBSEEKER DATA FALLBACK & RECONCILIATION UNIT TESTS PASSED!");
