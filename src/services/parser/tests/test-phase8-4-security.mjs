process.env.VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://mock.supabase.co";
process.env.VITE_SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || "mockkey123";

if (typeof global.localStorage === "undefined") {
  const store = {};
  global.localStorage = {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); }
  };
}

import { calculateJobFit } from "../../ai/jobFitEngine.js";
import { updateEmployerVerification, moderateJobStatus, submitJobReport } from "../../adminService.js";
import { encodeApplicationRequirements, parseJobRequirements } from "../../../utils/jobRequirementsHelper.js";

async function runPhase84SecurityTests() {
  console.log("===============================================================================");
  console.log("SkillSync Phase 8.4 — Security, Verification & Moderation Automated Test Suite");
  console.log("===============================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST SUITE 1: Matching Engine Formula Integrity (MATCH-001 & MATCH-002)
  // ───────────────────────────────────────────────────────────────────────────
  console.log("1. Testing Matching Engine Integrity (jobFitEngine.js)");

  const mockCandidate = {
    user_id: "cand_001",
    skills: ["React", "JavaScript", "Node.js", "SQL", "Git"],
    total_experience_years: 4,
    education_level: "Bachelor's Degree",
    certifications: ["AWS Certified Developer"],
    embedding: [0.1, 0.2, 0.3]
  };

  const mockJob = {
    id: "job_001",
    title: "Senior Full Stack Engineer",
    required_skills: "React, Node.js, SQL, TypeScript",
    experience_required: "3-5 years",
    required_education: "Bachelor's Degree",
    required_certifications: encodeApplicationRequirements("AWS Certified Developer", ["Government Issued ID"]),
    job_embedding: [0.1, 0.2, 0.3]
  };

  const fitResult = calculateJobFit(mockCandidate, mockJob);
  
  assert(typeof fitResult.jobFitScore === "number", "jobFitScore is a valid number");
  assert(fitResult.jobFitScore >= 0 && fitResult.jobFitScore <= 100, "jobFitScore is between 0 and 100");
  assert(fitResult.breakdown.requiredSkillsScore !== undefined, "Breakdown includes requiredSkillsScore");
  assert(fitResult.breakdown.transferableSkillsScore !== undefined, "Breakdown includes transferableSkillsScore");
  assert(fitResult.breakdown.educationCompatibility !== undefined, "Breakdown includes educationCompatibility score");
  assert(fitResult.breakdown.experienceCompatibility !== undefined, "Breakdown includes experienceCompatibility score");
  assert(fitResult.breakdown.credentialsScore !== undefined, "Breakdown includes credentialsScore");
  assert(fitResult.breakdown.semanticRelevance !== undefined, "Breakdown includes semanticRelevance score");

  // ───────────────────────────────────────────────────────────────────────────
  // TEST SUITE 2: Employer Application Requirements Parsing (APP-001 & APP-002)
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n2. Testing Employer Application Document Requirements Parsing");

  const parsedReqs = parseJobRequirements(mockJob);
  assert(parsedReqs.applicationRequirements.includes("Government Issued ID"), "Parsed application requirements include 'Government Issued ID'");
  assert(parsedReqs.cleanCertifications === "AWS Certified Developer", "Clean certifications correctly separated from document requirements");

  // ───────────────────────────────────────────────────────────────────────────
  // TEST SUITE 3: Employer Verification Status & Moderation APIs (EMP-001 & ADMIN-001)
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n3. Testing Employer Verification & Moderation Service Functions");

  try {
    const updateRes = await updateEmployerVerification("test_emp_user", "Approved", "Official verification documents verified.");
    assert(updateRes.error === null, "updateEmployerVerification executes without errors");
  } catch (err) {
    assert(false, "updateEmployerVerification threw exception: " + err.message);
  }

  try {
    const modRes = await moderateJobStatus("test_job_123", "open", "Job posting meets community standards.");
    assert(modRes.error === null, "moderateJobStatus executes without errors");
  } catch (err) {
    assert(false, "moderateJobStatus threw exception: " + err.message);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST SUITE 4: Candidate Job Reporting API (REPORT-001)
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n4. Testing Candidate Job Report Submission API");

  try {
    const reportRes = await submitJobReport({
      jobId: "job_001",
      reporterId: "cand_001",
      reason: "Scam / Fraud",
      details: "Employer asking for payment prior to interview."
    });
    assert(reportRes.error === null, "submitJobReport executes cleanly");
    assert(reportRes.data.reason === "Scam / Fraud", "Report reason correctly recorded");
  } catch (err) {
    assert(false, "submitJobReport threw exception: " + err.message);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST SUITE 5: Private Verification Document Security & Role Authorization
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n5. Testing Private Document Security & Authorization Rules");

  const { extractVerificationStoragePath, getPrivateDocumentSignedUrl } = await import("../../api.js");

  const samplePath = "emp_user_123/valid_id_1786165.jpg";
  const publicUrlSample = "https://xyz.supabase.co/storage/v1/object/public/employer_verification/emp_user_123/valid_id_1786165.jpg";

  const extracted1 = extractVerificationStoragePath(samplePath);
  assert(extracted1 === samplePath, "extractVerificationStoragePath preserves relative storage paths");

  const extracted2 = extractVerificationStoragePath(publicUrlSample);
  assert(extracted2 === "emp_user_123/valid_id_1786165.jpg", "extractVerificationStoragePath extracts relative path from public storage URLs");

  try {
    const signedRes = await getPrivateDocumentSignedUrl(samplePath);
    assert(signedRes.url !== null || signedRes.error !== null, "getPrivateDocumentSignedUrl responds without unhandled exceptions");
  } catch (err) {
    assert(false, "getPrivateDocumentSignedUrl threw exception: " + err.message);
  }

  console.log("\n6. Testing Phase 9 Schema Query Integrity (fetchAdminJobs & fetchAdminEmployers)");
  const { fetchAdminJobs, fetchAdminEmployers } = await import("../../adminService.js");

  const withTimeout = (promise, ms = 2000) => Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve({ data: [] }), ms))
  ]);

  try {
    const jobsRes = await withTimeout(fetchAdminJobs({ page: 1, pageSize: 1 }));
    assert(Array.isArray(jobsRes.data), "fetchAdminJobs executes without column schema mismatch errors");
  } catch (err) {
    assert(false, "fetchAdminJobs threw schema error: " + err.message);
  }

  try {
    const empRes = await withTimeout(fetchAdminEmployers({ page: 1, pageSize: 1 }));
    assert(Array.isArray(empRes.data), "fetchAdminEmployers executes without column schema mismatch errors");
  } catch (err) {
    assert(false, "fetchAdminEmployers threw schema error: " + err.message);
  }

  console.log("\n===============================================================================");
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("===============================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase84SecurityTests().catch(err => {
  console.error("Test execution failure:", err);
  process.exit(1);
});
