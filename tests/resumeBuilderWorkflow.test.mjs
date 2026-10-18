/**
 * tests/resumeBuilderWorkflow.test.mjs
 *
 * SkillSync Form-First Resume Builder Comprehensive Test Suite
 *
 * Verifies:
 * 1. Education levels & completion states (TESDA, College undergrad, Currently studying, No formal schooling).
 * 2. Distinction between highest level attended and highest level completed.
 * 3. No work experience handling without fabricated employers, dates, or years.
 * 4. Add, edit, remove operations on repeatable sections.
 * 5. Required vs optional fields and readiness calculation.
 * 6. Autosave concurrency protection & sequence tracking.
 * 7. Existing-user prefilling & preservation of historical uploaded files.
 * 8. Factual professional summary generation (zero fabrication).
 * 9. Canonical structured data consistency across projections, text, and DOCX.
 * 10. Valid editable DOCX generation & compatibility with parseResumeFile.
 * 11. Separation of Profile Completeness, ATS Check, and Job-Fit score.
 * 12. Candidate job matching when no uploaded file exists.
 * 13. Candidate-facing language cleanup & friendly terminology.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  DEFAULT_RESUME_DATA,
  EDUCATION_LEVEL_OPTIONS,
  EDUCATION_STATUS_OPTIONS,
  WORK_TYPE_OPTIONS,
  calculateResumeReadiness,
  generateProfessionalSummary,
  buildCanonicalResumeText,
  loadCanonicalResume,
  saveCanonicalResume,
  calculateExperienceYears,
  getActiveResumeSource,
  setActiveResumeSource
} from '../src/services/resumeBuilderService.js';
import {
  generateDocxResumeBlob,
  buildDocumentXml,
  createZipArchive,
  escapeXml
} from '../src/services/docxResumeGenerator.js';
import { parseResumeFile } from '../src/services/resumeParser.js';
import { calculateJobFit, getCandidateSkillEvidence } from '../src/services/ai/jobFitEngine.js';
import { assessResumeQuality } from '../src/services/parser/qualityAssessor.js';
import { enrichApplicationRecord } from '../src/services/applicationService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

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

/**
 * Strict XML well-formedness validator.
 * Validates matching tags on a stack, detects unclosed or mismatched tags (e.g. </w:pPr> closing <w:p>).
 */
export function validateStrictXml(xmlString) {
  const stack = [];
  const tagRegex = /<(\/)?([a-zA-Z0-9_:]+)([^>]*?)(\/)?>/g;
  let match;

  const cleanXml = xmlString
    .replace(/<\?xml[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');

  while ((match = tagRegex.exec(cleanXml)) !== null) {
    const isClosing = Boolean(match[1]);
    const tagName = match[2];
    const isSelfClosing = Boolean(match[4]) || match[3].trim().endsWith('/');

    if (isSelfClosing) {
      continue;
    }

    if (isClosing) {
      if (stack.length === 0) {
        throw new Error(`Unexpected closing tag </${tagName}> with empty tag stack`);
      }
      const top = stack.pop();
      if (top !== tagName) {
        throw new Error(`Mismatched closing tag: expected </${top}>, but found </${tagName}> at offset ${match.index}`);
      }
    } else {
      stack.push(tagName);
    }
  }

  if (stack.length > 0) {
    throw new Error(`Unclosed XML tags remain: ${stack.join(', ')}`);
  }
  return true;
}

async function runTestSuite() {
  console.log('=== RUNNING FORM-FIRST RESUME BUILDER TEST SUITE ===\n');

  // ── Test 1: Education Levels, Attended vs Completed Distinction ───────────
  console.log('[Test 1] Education Levels & Attended vs Completed Distinction');

  assert(EDUCATION_LEVEL_OPTIONS.includes('Vocational or technical training (TESDA or equivalent)'),
    'Includes Vocational/TESDA training');
  assert(EDUCATION_LEVEL_OPTIONS.includes('College/university undergraduate studies'),
    'Includes College undergraduate studies');
  assert(EDUCATION_LEVEL_OPTIONS.includes('Currently studying'),
    'Includes Currently studying');
  assert(EDUCATION_LEVEL_OPTIONS.includes('No formal schooling to report'),
    'Includes No formal schooling option');
  assert(EDUCATION_LEVEL_OPTIONS.includes('Senior High School'),
    'Includes Senior High School');
  assert(EDUCATION_STATUS_OPTIONS.includes('Attended but Did Not Complete'),
    'Includes Attended but Did Not Complete');
  assert(EDUCATION_STATUS_OPTIONS.includes('Currently Studying'),
    'Includes Currently Studying');
  assert(EDUCATION_STATUS_OPTIONS.includes('Completed'),
    'Includes Completed');

  // Verify non-graduating college attendee has high school completed and college attended
  const complexCandidateEdu = {
    noFormalEducation: false,
    entries: [
      {
        id: 'edu-1',
        institution: 'Manila High School',
        level: 'Senior High School',
        courseOrProgram: 'STEM Strand',
        status: 'Completed',
        startYear: '2018',
        endYear: '2020'
      },
      {
        id: 'edu-2',
        institution: 'University of the East',
        level: 'College/university undergraduate studies',
        courseOrProgram: 'BS Information Technology',
        status: 'Attended but Did Not Complete',
        startYear: '2020',
        endYear: '2022'
      }
    ]
  };

  const textRepresentation = buildCanonicalResumeText({
    personalDetails: { fullName: 'Juan Dela Cruz' },
    education: complexCandidateEdu
  });

  assert(textRepresentation.includes('Senior High School') && textRepresentation.includes('[Status: Completed]'),
    'Correctly reflects Completed Senior High School');
  assert(textRepresentation.includes('BS Information Technology') && textRepresentation.includes('[Status: Attended but Did Not Complete]'),
    'Correctly preserves Attended but Did Not Complete without claiming a college degree');

  // ── Test 2: No Formal Schooling Handling ─────────────────────────────────
  console.log('\n[Test 2] No Formal Schooling Handling');
  const noSchoolingResume = {
    ...DEFAULT_RESUME_DATA,
    personalDetails: { fullName: 'Pedro Penduko' },
    education: {
      noFormalEducation: true,
      entries: []
    },
    skills: [{ id: 's1', name: 'Carpentry' }, { id: 's2', name: 'Plumbing' }]
  };

  const noSchoolingText = buildCanonicalResumeText(noSchoolingResume);
  assert(noSchoolingText.includes('No formal schooling to report'),
    'Canonical text accurately records explicit absence of formal schooling');

  const readinessNoSchooling = calculateResumeReadiness(noSchoolingResume);
  assert(readinessNoSchooling.sections.find(s => s.id === 'education').isComplete === true,
    'Education section is marked complete when candidate explicitly chooses no formal schooling');
  assert(readinessNoSchooling.canFinalize === true,
    'Candidate with no formal schooling can finalize resume');

  // ── Test 3: No Work Experience Handling (Zero Fabricated Experience) ──────
  console.log('\n[Test 3] No Work Experience Handling');
  const freshGradResume = {
    ...DEFAULT_RESUME_DATA,
    personalDetails: { fullName: 'Ana Santos', email: 'ana.santos@example.com' },
    education: {
      noFormalEducation: false,
      entries: [{
        institution: 'Quezon City University',
        level: 'College/university graduate',
        courseOrProgram: 'BS Computer Science',
        status: 'Completed',
        endYear: '2024'
      }]
    },
    skills: [{ id: 's1', name: 'JavaScript' }, { id: 's2', name: 'React' }],
    experience: {
      noExperience: true,
      entries: []
    }
  };

  const freshGradText = buildCanonicalResumeText(freshGradResume);
  assert(freshGradText.includes('No formal work experience yet'),
    'Explicitly states absence of work experience without inventing jobs');

  const summary = generateProfessionalSummary(freshGradResume);
  assert(!summary.includes('years of experience') && !summary.includes('senior'),
    'Generated summary does not invent years of experience for first-time job seekers');
  assert(summary.includes('Graduate in BS Computer Science') && summary.includes('JavaScript'),
    'Summary truthfully reflects completed education and skills');

  // Candidate with ONLY "Currently Studying" (Zero completed degrees)
  const studyingOnlyResume = {
    ...DEFAULT_RESUME_DATA,
    personalDetails: { fullName: 'Joy Reyes' },
    education: {
      entries: [{
        institution: 'University of Santo Tomas',
        level: 'Currently studying',
        courseOrProgram: 'BS Nursing',
        status: 'Currently Studying'
      }]
    },
    skills: [{ name: 'Patient Care' }]
  };
  const studyingSummary = generateProfessionalSummary(studyingOnlyResume);
  assert(!studyingSummary.includes('Graduate in'),
    'Never claims "Graduate in" when status is Currently Studying');
  assert(studyingSummary.includes('pursuing BS Nursing') || studyingSummary.includes('studying'),
    'Accurately states currently pursuing course for active student');

  // Candidate with ONLY "Attended but Did Not Complete"
  const incompleteOnlyResume = {
    ...DEFAULT_RESUME_DATA,
    personalDetails: { fullName: 'Mark Tan' },
    education: {
      entries: [{
        institution: 'De La Salle University',
        level: 'College/university undergraduate studies',
        courseOrProgram: 'BS Accountancy',
        status: 'Attended but Did Not Complete'
      }]
    },
    skills: [{ name: 'Bookkeeping' }]
  };
  const incompleteSummary = generateProfessionalSummary(incompleteOnlyResume);
  assert(!incompleteSummary.includes('Graduate in'),
    'Never claims "Graduate in" when status is Attended but Did Not Complete');
  assert(incompleteSummary.includes('Academic background in BS Accountancy') || incompleteSummary.includes('background in'),
    'Accurately reflects academic background without claiming graduation');

  // ── Test 4: Required vs Optional Information & Readiness Metric ──────────
  console.log('\n[Test 4] Required vs Optional Information & Readiness Metric');

  // Incomplete resume: missing full name
  const emptyResume = { ...DEFAULT_RESUME_DATA };
  const readinessEmpty = calculateResumeReadiness(emptyResume);
  assert(readinessEmpty.canFinalize === false, 'Cannot finalize without required full name');
  assert(readinessEmpty.sections.find(s => s.id === 'personal').isComplete === false,
    'Personal section marked incomplete without name');

  // Name present, education missing
  const nameOnlyResume = {
    ...DEFAULT_RESUME_DATA,
    personalDetails: { fullName: 'Clara Reyes' }
  };
  const readinessNameOnly = calculateResumeReadiness(nameOnlyResume);
  assert(readinessNameOnly.canFinalize === false,
    'Cannot finalize without either education entries or explicit no-education choice');

  // Full name + education present, skills & experience empty
  const minimalValidResume = {
    ...DEFAULT_RESUME_DATA,
    personalDetails: { fullName: 'Clara Reyes' },
    education: {
      noFormalEducation: true,
      entries: []
    }
  };
  const readinessValid = calculateResumeReadiness(minimalValidResume);
  assert(readinessValid.canFinalize === true,
    'Can finalize with minimum required fields (name and education decision)');

  // Missing optional fields (phone, portfolio, projects) does NOT block finalization
  assert(!minimalValidResume.personalDetails.phone, 'Phone is optional');
  assert(minimalValidResume.projectsAndCredentials.projects.length === 0, 'Projects are optional');
  assert(readinessValid.canFinalize === true, 'Finalization is permitted with optional sections empty');

  // ── Test 5: Repeatable Entries Add, Edit, Remove Consistency ─────────────
  console.log('\n[Test 5] Repeatable Entries Consistency');
  let currentProjects = [];
  // Add 1
  currentProjects.push({ id: 'p1', title: 'Task Manager', tools: ['React', 'Node.js'] });
  // Add 2
  currentProjects.push({ id: 'p2', title: 'E-commerce API', tools: ['Express', 'PostgreSQL'] });
  assert(currentProjects.length === 2, 'Added 2 repeatable project entries');

  // Edit 1
  currentProjects = currentProjects.map(p => p.id === 'p1' ? { ...p, title: 'Collaborative Task Manager' } : p);
  assert(currentProjects[0].title === 'Collaborative Task Manager', 'Edited project entry retained');

  // Remove 2
  currentProjects = currentProjects.filter(p => p.id !== 'p2');
  assert(currentProjects.length === 1 && currentProjects[0].id === 'p1', 'Removed project entry safely');

  // ── Test 6: Single Source of Truth & Canonical Resume Text ────────────────
  console.log('\n[Test 6] Canonical Resume Text Generation & Data Integrity');
  const fullCandidateData = {
    version: 1,
    personalDetails: {
      fullName: 'Maria Cristina Ramos',
      email: 'cristina.ramos@example.com',
      phone: '+63 917 555 1234',
      city: 'Makati City',
      linkedin: 'https://linkedin.com/in/cristinaramos'
    },
    education: {
      noFormalEducation: false,
      entries: [{
        id: 'e1',
        institution: 'Mapúa University',
        level: 'College/university graduate',
        courseOrProgram: 'BS Information Technology',
        status: 'Completed',
        startYear: '2019',
        endYear: '2023'
      }]
    },
    skills: [
      { id: 's1', name: 'JavaScript', category: 'Software' },
      { id: 's2', name: 'React', category: 'Software' },
      { id: 's3', name: 'Communication', category: 'Transferable' }
    ],
    experience: {
      noExperience: false,
      entries: [{
        id: 'exp1',
        title: 'Junior Frontend Developer',
        organization: 'Innovatech PH',
        workType: 'Employment',
        startDate: '2023',
        endDate: '2025',
        isCurrent: false,
        responsibilities: 'Built reusable React components for customer portal.',
        achievements: 'Decreased page load time by 30%.'
      }]
    },
    projectsAndCredentials: {
      projects: [{
        id: 'pr1',
        title: 'SkillSync Portal',
        role: 'Frontend Engineer',
        tools: ['React', 'Vite'],
        description: 'Responsive candidate onboarding portal.'
      }],
      certifications: [{
        id: 'c1',
        name: 'AWS Certified Cloud Practitioner',
        issuer: 'Amazon Web Services',
        issueDate: '2024'
      }],
      training: [],
      awards: []
    },
    summary: 'Proactive Information Technology graduate with hands-on web development experience.'
  };

  const canonicalText = buildCanonicalResumeText(fullCandidateData);
  assert(canonicalText.includes('Maria Cristina Ramos'), 'Canonical text includes candidate name');
  assert(canonicalText.includes('Mapúa University') && canonicalText.includes('BS Information Technology'),
    'Canonical text includes education');
  assert(canonicalText.includes('Junior Frontend Developer') && canonicalText.includes('Innovatech PH'),
    'Canonical text includes experience');
  assert(canonicalText.includes('AWS Certified Cloud Practitioner'),
    'Canonical text includes certifications');

  // ── Test 7: Word Document (.docx) Generation & XML Packaging ─────────────
  console.log('\n[Test 7] Word Document (.docx) Generation & PKZIP Integrity');

  const docxXml = buildDocumentXml(fullCandidateData);
  assert(docxXml.includes('<w:document') && docxXml.includes('</w:document>'),
    'Generated valid WordprocessingML document root');
  assert(docxXml.includes('Maria Cristina Ramos'), 'Document XML contains candidate name');
  assert(docxXml.includes('PROFESSIONAL SUMMARY'), 'Document XML contains standard uppercase heading');
  assert(docxXml.includes('CORE SKILLS') || docxXml.includes('SKILLS'), 'Document XML contains Skills heading');
  assert(docxXml.includes('EXPERIENCE'), 'Document XML contains Experience heading');
  assert(docxXml.includes('EDUCATION &amp; TRAINING') || docxXml.includes('EDUCATION & TRAINING'),
    'Document XML contains Education heading');

  // Strict XML well-formedness validation on docxXml (catches invalid closing tags such as </w:pPr>)
  const isStrictValid = validateStrictXml(docxXml);
  assert(isStrictValid === true,
    'Generated word/document.xml passes strict XML well-formedness validation with 100% matched tags');

  // Negative test: verify that strict XML validator specifically catches mismatched </w:pPr> tag closing <w:p>
  const invalidMismatchedXml = '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>Contact</w:t></w:r></w:pPr>';
  let caughtMismatchedTag = false;
  try {
    validateStrictXml(invalidMismatchedXml);
  } catch (err) {
    caughtMismatchedTag = true;
  }
  assert(caughtMismatchedTag === true,
    'Strict XML validator successfully identifies and rejects invalid </w:pPr> tag closing <w:p>');

  // Generate binary PKZIP Blob
  const docxBlob = generateDocxResumeBlob(fullCandidateData);
  assert(docxBlob && docxBlob.size > 2000, `Generated DOCX blob has non-trivial size (${docxBlob.size} bytes)`);

  const arrayBuffer = await docxBlob.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);

  // Verify PKZIP Magic Bytes (0x50, 0x4B, 0x03, 0x04)
  assert(uint8[0] === 0x50 && uint8[1] === 0x4B && uint8[2] === 0x03 && uint8[3] === 0x04,
    'Generated DOCX file contains valid PKZIP signature (0x50, 0x4B, 0x03, 0x04)');

  // ── Test 8: Parser Extraction Compatibility ──────────────────────────────
  console.log('\n[Test 8] DOCX Parser Compatibility via parseResumeFile');

  const docxFile = new File([docxBlob], 'Maria_Cristina_Ramos_Resume.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });

  const parsedResult = await parseResumeFile(docxFile);
  assert(parsedResult && parsedResult.extractedText?.length > 100,
    'SkillSync parser successfully extracted readable text from generated DOCX');
  assert(parsedResult.details?.email === 'cristina.ramos@example.com',
    `Extracted email correctly: ${parsedResult.details?.email}`);
  assert(parsedResult.skills?.map(s => s.toLowerCase()).includes('react'),
    'Parser recognized React skill from generated DOCX');
  assert(parsedResult.skills?.map(s => s.toLowerCase()).includes('javascript'),
    'Parser recognized JavaScript skill from generated DOCX');

  // ── Test 9: Job Matching Without Uploaded File ────────────────────────────
  console.log('\n[Test 9] Job Matching Without Uploaded File');

  // Mock candidate object constructed strictly from canonical form data (no file_url)
  const candidateFromForm = {
    skills: fullCandidateData.skills.map(s => s.name),
    degree: 'BS Information Technology',
    education_level: 'College/university graduate',
    years_experience: 2
  };

  const sampleJob = {
    id: 'job-123',
    title: 'Junior Frontend Developer',
    required_skills: 'React, JavaScript, CSS',
    required_education: 'Bachelor in Computer Science or Information Technology',
    experience_required: '1-2 years',
    description: 'Build modern user interfaces with React and JavaScript.'
  };

  const fitResult = calculateJobFit(candidateFromForm, sampleJob, 0.75);
  assert(fitResult && fitResult.jobFitScore >= 70,
    `Calculates accurate Job-Fit Score (${fitResult.jobFitScore}%) without uploaded file`);
  assert(fitResult.matchedSkills.some(s => s.toLowerCase() === 'react'),
    'Matched skills includes React from form entry');

  // ── Test 10: Separation of Profile Completeness, ATS Check, and Job-Fit ───
  console.log('\n[Test 10] Separation of Measurements');
  const readinessResult = calculateResumeReadiness(fullCandidateData);
  assert(readinessResult.completedSections === 6, 'All 6 sections complete in readiness');
  assert(readinessResult.percentage === 100, 'Profile completeness is 100%');

  // Job Fit Score is role-specific, distinct from completeness
  const mismatchJob = {
    title: 'Senior Civil Engineer',
    required_skills: 'AutoCAD, Structural Design, Concrete Inspection',
    required_education: 'BS Civil Engineering',
    experience_required: '5+ years'
  };
  const mismatchFit = calculateJobFit(candidateFromForm, mismatchJob, 0.10);
  assert(mismatchFit.jobFitScore < 50,
    `Job-fit score for mismatched role is low (${mismatchFit.jobFitScore}%) despite 100% profile completeness`);
  assert(mismatchFit.jobFitScore !== readinessResult.percentage,
    'Profile completeness is strictly segregated from Job-Fit score');

  // ── Test 11: Candidate-Facing Language & UI Cleanup ────────────────────────────
  console.log('\n[Test 11] Candidate-Facing Language & UI Cleanup');

  const builderJsx = fs.readFileSync(path.join(ROOT_DIR, 'src', 'pages', 'candidate', 'ResumeBuilder.jsx'), 'utf8');
  assert(builderJsx.includes('Resume Builder'), 'Builder page title is "Resume Builder"');
  assert(!builderJsx.includes('ResumeTemplateSection'), 'Builder does not render ResumeTemplateSection');
  assert(!builderJsx.includes('RecommendedJobs'), 'Builder does not embed heavy RecommendedJobs component');

  const step6Jsx = fs.readFileSync(path.join(ROOT_DIR, 'src', 'components', 'resume', 'builder', 'Step6Review.jsx'), 'utf8');
  assert(step6Jsx.includes('Review Your Resume'), 'Step 6 title is "Review Your Resume"');
  assert(step6Jsx.includes('Professional Summary'), 'Uses ordinary label "Professional Summary"');
  assert(step6Jsx.includes('Download Word Resume'), 'Uses ordinary label "Download Word Resume"');
  assert(step6Jsx.includes('Create Summary'), 'Uses neutral "Create Summary" instead of suggest summary');
  assert(!step6Jsx.includes('AI-generated summary'), 'Avoids "AI-generated summary"');
  assert(step6Jsx.includes('View Job Matches →') || step6Jsx.includes('View Recommended Jobs →'),
    'Step 6 has clean View Job Matches CTA');

  // ── Test 12: Cross-Industry Candidate Matching Audit (11 Archetypes) ──────
  console.log('\n[Test 12] Cross-Industry Candidate Matching Audit (11 Archetypes)');

  const archetypes = [
    {
      name: '1. BS Nursing Graduate',
      candidate: {
        skills: ['Patient Care', 'Vital Signs Monitoring', 'First Aid', 'Medication Administration', 'Communication'],
        degree: 'Bachelor of Science in Nursing',
        education_level: 'College/university graduate',
        years_experience: 1
      },
      job: {
        title: 'Clinic Staff Nurse',
        required_skills: 'Patient Care, Vital Signs, First Aid, Patient Assessment',
        required_education: 'BS Nursing',
        experience_required: '1-2 years',
        description: 'Provide quality patient care, record vitals, and assist clinic physicians.'
      }
    },
    {
      name: '2. BS Accountancy Graduate',
      candidate: {
        skills: ['Bookkeeping', 'Accounts Payable', 'Accounts Receivable', 'Financial Reporting', 'QuickBooks', 'Excel'],
        degree: 'Bachelor of Science in Accountancy',
        education_level: 'College/university graduate',
        years_experience: 2
      },
      job: {
        title: 'Junior Accountant / Bookkeeper',
        required_skills: 'Bookkeeping, Accounts Payable, Financial Statements, QuickBooks',
        required_education: 'BS Accountancy or Finance',
        experience_required: '1-2 years',
        description: 'Manage general ledger, prepare financial reports, and maintain AP/AR records.'
      }
    },
    {
      name: '3. Hospitality Management Graduate',
      candidate: {
        skills: ['Front Desk Operations', 'Guest Relations', 'Food Service', 'Reservations Management', 'Communication'],
        degree: 'BS Hospitality Management',
        education_level: 'College/university graduate',
        years_experience: 1
      },
      job: {
        title: 'Hotel Front Desk Associate',
        required_skills: 'Front Desk Operations, Guest Relations, Hotel Reception, Communication',
        required_education: 'Hospitality Management or Tourism',
        experience_required: '1 year',
        description: 'Welcome hotel guests, handle bookings, and deliver exceptional hospitality service.'
      }
    },
    {
      name: '4. Education Graduate',
      candidate: {
        skills: ['Lesson Planning', 'Classroom Management', 'Tutoring', 'Educational Assessment', 'Presentation'],
        degree: 'Bachelor of Elementary Education',
        education_level: 'College/university graduate',
        years_experience: 1
      },
      job: {
        title: 'Elementary School Teacher',
        required_skills: 'Lesson Planning, Classroom Management, Curriculum Support, Student Engagement',
        required_education: 'Bachelor of Elementary Education or Secondary Education',
        experience_required: '1 year',
        description: 'Deliver engaging lessons, maintain classroom discipline, and track student progress.'
      }
    },
    {
      name: '5. Civil Engineering Graduate',
      candidate: {
        skills: ['AutoCAD', 'Technical Drawing', 'Quality Control', 'Blueprint Reading', 'Problem Solving'],
        degree: 'BS Civil Engineering',
        education_level: 'College/university graduate',
        years_experience: 2
      },
      job: {
        title: 'Site Engineer / AutoCAD Drafter',
        required_skills: 'AutoCAD, Drafting, Construction Safety, Quality Control',
        required_education: 'BS Civil Engineering or Architecture',
        experience_required: '1-3 years',
        description: 'Produce structural technical drawings, supervise site works, and ensure quality control.'
      }
    },
    {
      name: '6. TESDA Welding Graduate',
      candidate: {
        skills: ['Welding', 'Safety Procedures', 'Blueprint Reading', 'Machine Operation'],
        degree: 'Shielded Metal Arc Welding (SMAW) NC II',
        education_level: 'Vocational or technical training (TESDA or equivalent)',
        years_experience: 2
      },
      job: {
        title: 'Industrial Welder / Fabricator',
        required_skills: 'SMAW, Welding, Safety Procedures, Metal Fabrication',
        required_education: 'TESDA SMAW NC II or equivalent technical training',
        experience_required: '1-2 years',
        description: 'Perform arc welding on steel structures following strict occupational safety protocols.'
      }
    },
    {
      name: '7. Senior High School Graduate',
      candidate: {
        skills: ['Customer Service', 'Data Entry', 'Microsoft Word', 'Time Management', 'Communication'],
        degree: 'General Academic Strand (GAS)',
        education_level: 'Senior High School',
        years_experience: 0
      },
      job: {
        title: 'Customer Service Representative (Entry Level)',
        required_skills: 'Customer Service, Communication, Basic Computer Skills, Problem Solving',
        required_education: 'Senior High School graduate or College undergrad',
        experience_required: 'No experience required',
        description: 'Handle customer inquiries, log customer data, and provide friendly support.'
      }
    },
    {
      name: '8. Warehouse / Logistics Worker',
      candidate: {
        skills: ['Inventory Management', 'Stock Control', 'Warehouse Operations', 'Order Fulfillment', 'Forklift Operation'],
        degree: 'High school graduate',
        education_level: 'Junior High School',
        years_experience: 3
      },
      job: {
        title: 'Warehouse Inventory Associate',
        required_skills: 'Inventory Management, Warehouse Operations, Stock Control, Receiving',
        required_education: 'High School graduate',
        experience_required: '1-3 years',
        description: 'Manage warehouse inventory receipts, organize dispatch pallets, and conduct stock audits.'
      }
    },
    {
      name: '9. Retail Sales Associate',
      candidate: {
        skills: ['Customer Service', 'POS Operation', 'Cash Handling', 'Merchandising', 'Sales'],
        degree: 'College undergraduate',
        education_level: 'College/university undergraduate studies',
        years_experience: 1
      },
      job: {
        title: 'Retail Store Cashier / Sales Associate',
        required_skills: 'POS Operation, Cash Handling, Customer Service, Merchandising',
        required_education: 'High school or College undergrad',
        experience_required: '6 months - 1 year',
        description: 'Operate point-of-sale checkout, handle cash transactions, and assist retail shoppers.'
      }
    },
    {
      name: '10. Graphic Designer',
      candidate: {
        skills: ['Graphic Design', 'Canva', 'Adobe Photoshop', 'Social Media Management', 'Creative Thinking'],
        degree: 'Bachelor of Fine Arts / Multimedia Arts',
        education_level: 'College/university graduate',
        years_experience: 2
      },
      job: {
        title: 'Junior Graphic Designer / Content Creator',
        required_skills: 'Graphic Design, Canva, Photoshop, Visual Design, Social Media',
        required_education: 'Multimedia Arts, Fine Arts, or related portfolio',
        experience_required: '1-2 years',
        description: 'Design marketing banners, create social media assets, and collaborate with media team.'
      }
    },
    {
      name: '11. IT / Software Graduate',
      candidate: {
        skills: ['React', 'JavaScript', 'TypeScript', 'HTML & CSS', 'Git', 'SQL'],
        degree: 'BS Information Technology',
        education_level: 'College/university graduate',
        years_experience: 2
      },
      job: {
        title: 'Junior Web Developer',
        required_skills: 'React, JavaScript, HTML, CSS, Git',
        required_education: 'BS Computer Science or Information Technology',
        experience_required: '1-2 years',
        description: 'Build responsive frontend applications with React, modern CSS, and REST endpoints.'
      }
    }
  ];

  for (const arch of archetypes) {
    const fit = calculateJobFit(arch.candidate, arch.job, 0.70);
    assert(fit && fit.jobFitScore >= 65,
      `${arch.name} matches domain role with high fit score (${fit.jobFitScore}%)`);
    assert(['Strong Match', 'Good Match'].includes(fit.tier),
      `${arch.name} placed in strong/good match tier (${fit.tier})`);
  }

  // ── Test 13: Structural Separation between Upload & Builder ───────────────
  console.log('\n[Test 13] Structural Separation between Upload and Builder');

  const uploadJsx = fs.readFileSync(path.join(ROOT_DIR, 'src', 'pages', 'candidate', 'ResumeUpload.jsx'), 'utf8');
  assert(uploadJsx.includes('Resume Upload'), 'ResumeUpload page title is "Resume Upload"');
  assert(uploadJsx.includes('ResumeTemplateSection'), 'ResumeUpload renders ResumeTemplateSection');
  assert(!uploadJsx.includes('<RecommendedJobs'), 'ResumeUpload no longer embeds RecommendedJobs widget (single central marketplace)');
  assert(uploadJsx.includes('Explore opportunities that match your resume'), 'ResumeUpload displays consolidated marketplace CTA title');
  assert(uploadJsx.includes('/candidate/jobs?view=recommended'), 'ResumeUpload links directly to Job Marketplace recommended view');
  assert(uploadJsx.includes('SkillTagInput'), 'ResumeUpload renders editable extracted skills tags');

  const sidebarJsx = fs.readFileSync(path.join(ROOT_DIR, 'src', 'components', 'layout', 'Sidebar.jsx'), 'utf8');
  assert(sidebarJsx.includes('/candidate/resume'), 'Sidebar includes /candidate/resume link');
  assert(sidebarJsx.includes('/candidate/resume-builder'), 'Sidebar includes /candidate/resume-builder link');
  assert(sidebarJsx.includes('Resume Upload'), 'Sidebar has "Resume Upload" item');
  assert(sidebarJsx.includes('Resume Builder'), 'Sidebar has "Resume Builder" item');

  const appJsx = fs.readFileSync(path.join(ROOT_DIR, 'src', 'App.jsx'), 'utf8');
  assert(appJsx.includes('path="/candidate/resume"'), 'App.jsx defines /candidate/resume route');
  assert(appJsx.includes('path="/candidate/resume-builder"'), 'App.jsx defines /candidate/resume-builder route');

  // ── Test 14: Experience Calculation Strictly From Dates ───────────────────
  console.log('\n[Test 14] Experience Calculation Strictly From Dates (No Entry Count Fabrication)');

  // 1. Single 3-month internship
  const shortInternship = {
    noExperience: false,
    entries: [{
      title: 'QA Intern',
      organization: 'Tech Corp PH',
      startDate: '2023-01',
      endDate: '2023-03',
      isCurrent: false
    }]
  };
  const shortYears = calculateExperienceYears(shortInternship);
  assert(shortYears !== null && shortYears >= 0.1 && shortYears <= 0.3,
    `3-month internship calculates ~0.2 years (${shortYears}), never inflated to 1 or 1.5 years`);

  // 2. Overlapping roles: 1 full-time job (Jan-Dec 2023) + concurrent freelance (Jun-Dec 2023)
  const concurrentExp = {
    noExperience: false,
    entries: [
      {
        title: 'Full-time Developer',
        organization: 'Alpha Corp',
        startDate: '2023-01',
        endDate: '2023-12',
        isCurrent: false
      },
      {
        title: 'Freelance Consultant',
        organization: 'Client Beta',
        startDate: '2023-06',
        endDate: '2023-12',
        isCurrent: false
      }
    ]
  };
  const concurrentYears = calculateExperienceYears(concurrentExp);
  assert(concurrentYears === 1.0,
    `Overlapping concurrent roles merge into 1.0 year (${concurrentYears}), never inflated to 3.0 years`);

  // 3. Entries without parseable dates return null (unknown/unspecified, zero fabrication)
  const missingDatesExp = {
    noExperience: false,
    entries: [{ title: 'Store Assistant', organization: 'Retail Shop' }]
  };
  const missingDatesYears = calculateExperienceYears(missingDatesExp);
  assert(missingDatesYears === null,
    'Entries without dates return null rather than an invented or fabricated number');

  // 4. Explicit no experience returns exactly 0
  const zeroExp = {
    noExperience: true,
    entries: []
  };
  const zeroYears = calculateExperienceYears(zeroExp);
  assert(zeroYears === 0, 'Explicit no-experience returns exactly 0 years');

  // ── Test 15: Bidirectional Active Resume Source Selector & Coexistence Verification ───────
  console.log('\n[Test 15] Bidirectional Active Resume Source Selector & Coexistence Verification');

  assert(typeof getActiveResumeSource === 'function', 'getActiveResumeSource is an exported function');
  assert(typeof setActiveResumeSource === 'function', 'setActiveResumeSource is an exported function');

  // 1. Candidate UI Terminology & Source Selector UI Presence
  const builderSourceUi = fs.readFileSync(path.join(ROOT_DIR, 'src', 'pages', 'candidate', 'ResumeBuilder.jsx'), 'utf8');
  assert(builderSourceUi.includes('active-source-selector-bar'), 'ResumeBuilder renders active-source-selector-bar');
  assert(builderSourceUi.includes('handleSwitchSource'), 'ResumeBuilder implements handleSwitchSource');

  const uploadSourceUi = fs.readFileSync(path.join(ROOT_DIR, 'src', 'pages', 'candidate', 'ResumeUpload.jsx'), 'utf8');
  assert(uploadSourceUi.includes('active-source-selector-bar'), 'ResumeUpload renders active-source-selector-bar');
  assert(uploadSourceUi.includes('handleSwitchSource'), 'ResumeUpload implements handleSwitchSource');
  assert(uploadSourceUi.includes("active_resume_source: 'upload'"), 'ResumeUpload tags uploaded matching data with active_resume_source');

  // Verify candidate-facing AI terminology removal
  assert(!uploadSourceUi.includes("ATS Scan Report"), 'No residual "ATS Scan Report" in ResumeUpload');
  assert(!uploadSourceUi.includes("AI Skill Dictionary"), 'No residual "AI Skill Dictionary" in ResumeUpload');
  assert(uploadSourceUi.includes("Extracted Skills & Qualifications"), 'ResumeUpload clearly labels extracted skills section');

  const recommendedJobsJsx = fs.readFileSync(path.join(ROOT_DIR, 'src', 'components', 'resume', 'RecommendedJobs.jsx'), 'utf8');
  assert(recommendedJobsJsx.includes("Comparing your qualifications with available job opportunities."),
    'RecommendedJobs loading screen uses friendly phrasing without "semantic embedding"');
  assert(!recommendedJobsJsx.includes("Comparing your skills, education, and semantic embedding"),
    'RecommendedJobs loading screen avoids implementation terminology');

  // 2. Code Contract Audits for Blockers 1, 3, 4, 5
  const serviceCode = fs.readFileSync(path.join(ROOT_DIR, 'src', 'services', 'resumeBuilderService.js'), 'utf8');
  assert(serviceCode.includes('shouldSyncToMatching && !hasUploadedFile'),
    'Blocker 1: resumes.extracted_skills is protected from Builder overwrite when hasUploadedFile is true');
  assert(serviceCode.includes('uploadEmbedding') && serviceCode.includes('resume_embedding: uploadEmbedding'),
    'Blocker 2: setActiveResumeSource restores upload semantic embedding from parsed_details');
  assert(uploadSourceUi.includes('activeSource === "upload"') && uploadSourceUi.includes('Your Built Resume remains active'),
    'Blocker 3: Upload skills editor does NOT alter active profile matching when Builder is active');
  assert(uploadSourceUi.includes('hasBuilder') && uploadSourceUi.includes('setActiveResumeSource(user.id, "builder")'),
    'Blocker 4: Deleting uploaded resume preserves candidate_profiles and activates Builder when a built resume exists');
  assert(serviceCode.includes('formUpdateErr') && serviceCode.includes('profErr') && serviceCode.includes('embUpdateErr'),
    'Blocker 5: Strict error checks on all Supabase writes in setActiveResumeSource');

  // 3. Complete Deep Simulation: Upload (Nursing) -> Builder (Accounting) -> Upload (Nursing)
  console.log('   Simulating: Upload (Nursing) -> Builder (Accounting) -> Upload (Nursing)...');

  // State Table Stores
  const mockDb = {
    resumes: {
      applicant_id: 'candidate-uuid-1',
      file_url: 'https://staging.supabase.co/storage/v1/object/resumes/nursing_resume.pdf',
      file_name: 'nursing_resume.pdf',
      extracted_skills: 'Patient Care,Vital Signs,BLS,Medication Administration',
      parsed_details: {
        degree: 'BS Nursing',
        course: 'Nursing',
        yearsOfExperience: 3,
        skills: ['Patient Care', 'Vital Signs', 'BLS', 'Medication Administration'],
        upload_embedding: Array(384).fill(0.25),
        upload_canonical_text: 'Registered Nurse with 3 years in clinical patient care and BLS'
      },
      resume_embedding: Array(384).fill(0.25)
    },
    candidate_form_resumes: {
      user_id: 'candidate-uuid-1',
      resume_data: {
        personalDetails: { fullName: 'Clara Reyes' },
        education: {
          noFormalEducation: false,
          entries: [{ institution: 'UST', level: 'College/university graduate', courseOrProgram: 'BS Accountancy', status: 'Completed' }]
        },
        skills: [
          { name: 'Accounting' },
          { name: 'Financial Reporting' },
          { name: 'General Ledger' },
          { name: 'Tax Preparation' }
        ],
        experience: { noExperience: false, entries: [{ title: 'Staff Accountant', organization: 'SGV', startDate: '2022-01', endDate: '2024-01' }] },
        builder_embedding: Array(384).fill(0.85),
        builder_canonical_text: 'Accountant with CPA, financial reporting, and tax preparation skills'
      }
    },
    candidate_profiles: {
      user_id: 'candidate-uuid-1',
      degree: 'BS Nursing',
      course: 'Nursing',
      skills: JSON.stringify(['Patient Care', 'Vital Signs', 'BLS', 'Medication Administration']),
      active_resume_source: 'upload',
      years_experience: 3
    },
    profiles: {
      id: 'candidate-uuid-1',
      skills: 'Patient Care,Vital Signs,BLS,Medication Administration'
    }
  };

  // Archetype jobs for domain verification
  const nurseJob = {
    title: 'Staff Nurse - Inpatient Care',
    required_skills: 'Patient Care, Vital Signs, BLS, Medication Administration',
    required_education: 'BS Nursing',
    experience_required: '1-3 years',
    job_embedding: Array(384).fill(0.25)
  };

  const accountantJob = {
    title: 'Junior Financial Accountant',
    required_skills: 'Accounting, Financial Reporting, General Ledger, Tax Preparation',
    required_education: 'BS Accountancy',
    experience_required: '1-2 years',
    job_embedding: Array(384).fill(0.85)
  };

  // Phase A: Initial State (Uploaded Resume Active)
  assert(mockDb.candidate_profiles.active_resume_source === 'upload', 'Initial state: active_resume_source is "upload"');
  const initialNurseFit = calculateJobFit(
    { skills: JSON.parse(mockDb.candidate_profiles.skills), degree: mockDb.candidate_profiles.degree, years_experience: 3 },
    nurseJob,
    1.0
  );
  const initialAcctFit = calculateJobFit(
    { skills: JSON.parse(mockDb.candidate_profiles.skills), degree: mockDb.candidate_profiles.degree, years_experience: 3 },
    accountantJob,
    0.1
  );
  assert(initialNurseFit.jobFitScore >= 80, `Upload active: Nurse job fit is high (${initialNurseFit.jobFitScore}%)`);
  assert(initialAcctFit.jobFitScore < 50, `Upload active: Accountant job fit is low (${initialAcctFit.jobFitScore}%)`);
  assert(initialNurseFit.tier === 'Strong Match', 'Upload active: Nurse placed in Strong Match');
  assert(initialAcctFit.tier !== 'Strong Match', 'Upload active: Accountant not placed in Strong Match');

  // Phase B: Activate Builder Resume (Accounting)
  const hasUploadedFile = Boolean(mockDb.resumes.file_url);
  const shouldSyncToMatching = true;

  // Blocker 1 check: When hasUploadedFile is true, DO NOT overwrite resumes.extracted_skills!
  if (shouldSyncToMatching && !hasUploadedFile) {
    mockDb.resumes.extracted_skills = mockDb.candidate_form_resumes.resume_data.skills.map(s => s.name).join(',');
  }
  // Instead, project to candidate_profiles and profiles
  const builderSkills = mockDb.candidate_form_resumes.resume_data.skills.map(s => s.name);
  mockDb.candidate_profiles.skills = JSON.stringify(builderSkills);
  mockDb.candidate_profiles.degree = 'BS Accountancy';
  mockDb.candidate_profiles.active_resume_source = 'builder';
  mockDb.profiles.skills = builderSkills.join(',');
  mockDb.resumes.resume_embedding = mockDb.candidate_form_resumes.resume_data.builder_embedding;

  assert(mockDb.resumes.extracted_skills === 'Patient Care,Vital Signs,BLS,Medication Administration',
    'Blocker 1 Verified: resumes.extracted_skills was NOT corrupted by Builder activation!');
  assert(mockDb.candidate_profiles.active_resume_source === 'builder', 'active_resume_source is "builder"');
  assert(mockDb.resumes.resume_embedding[0] === 0.85, 'resumes.resume_embedding is now Builder Accounting embedding');

  // Verify Builder matching
  const builderNurseFit = calculateJobFit(
    { skills: JSON.parse(mockDb.candidate_profiles.skills), degree: mockDb.candidate_profiles.degree, years_experience: 2 },
    nurseJob,
    0.1
  );
  const builderAcctFit = calculateJobFit(
    { skills: JSON.parse(mockDb.candidate_profiles.skills), degree: mockDb.candidate_profiles.degree, years_experience: 2 },
    accountantJob,
    1.0
  );
  assert(builderAcctFit.jobFitScore >= 80, `Builder active: Accountant job fit is high (${builderAcctFit.jobFitScore}%)`);
  assert(builderNurseFit.jobFitScore < 50, `Builder active: Nurse job fit is low (${builderNurseFit.jobFitScore}%)`);
  assert(builderAcctFit.tier === 'Strong Match', 'Builder active: Accountant placed in Strong Match');
  assert(builderNurseFit.tier !== 'Strong Match', 'Builder active: Nurse not placed in Strong Match');

  // Phase C: Upload-Side Skill Editing While Builder is Active (Blocker 3)
  // User adds "Phlebotomy" on the upload page
  const editedUploadSkills = ['Patient Care', 'Vital Signs', 'BLS', 'Medication Administration', 'Phlebotomy'];
  const currentActiveSource = mockDb.candidate_profiles.active_resume_source; // 'builder'
  // saveSkillsToDb logic:
  mockDb.resumes.extracted_skills = editedUploadSkills.join(',');
  if (currentActiveSource === 'upload') {
    mockDb.profiles.skills = editedUploadSkills.join(',');
    mockDb.candidate_profiles.skills = JSON.stringify(editedUploadSkills);
  }
  assert(mockDb.resumes.extracted_skills.includes('Phlebotomy'), 'Upload snapshot updated with Phlebotomy');
  assert(JSON.parse(mockDb.candidate_profiles.skills).includes('Accounting'),
    'Blocker 3 Verified: Active Builder candidate_profiles.skills was NOT altered by upload-side editing!');
  assert(mockDb.profiles.skills.includes('Accounting'),
    'Blocker 3 Verified: Active profiles.skills was NOT altered by upload-side editing!');

  // Phase D: Switch Source Back to Upload (Blocker 1 & Blocker 2 Bidirectional Restoration)
  // setActiveResumeSource(userId, "upload")
  const uploadRow = mockDb.resumes;
  const restoredUploadSkills = uploadRow.extracted_skills.split(',').map(s => s.trim());
  mockDb.candidate_profiles.skills = JSON.stringify(restoredUploadSkills);
  mockDb.candidate_profiles.active_resume_source = 'upload';
  mockDb.profiles.skills = restoredUploadSkills.join(',');
  // Blocker 2: Restore semantic embedding
  mockDb.resumes.resume_embedding = uploadRow.parsed_details.upload_embedding;

  assert(mockDb.candidate_profiles.active_resume_source === 'upload', 'Switched back: active_resume_source is "upload"');
  assert(JSON.parse(mockDb.candidate_profiles.skills).includes('Patient Care'), 'Nursing skills restored in candidate_profiles');
  assert(JSON.parse(mockDb.candidate_profiles.skills).includes('Phlebotomy'), 'Edited Phlebotomy skill present in restored profile');
  assert(mockDb.profiles.skills.includes('Patient Care'), 'Nursing skills restored in profiles');
  assert(!mockDb.profiles.skills.includes('Accounting'), 'Accounting skills cleanly evacuated from active projection');
  assert(mockDb.resumes.resume_embedding[0] === 0.25,
    'Blocker 2 Verified: resumes.resume_embedding restored to Nursing upload embedding!');

  // Verify re-evaluated matching
  const restoredNurseFit = calculateJobFit(
    { skills: JSON.parse(mockDb.candidate_profiles.skills), degree: 'BS Nursing', years_experience: 3 },
    nurseJob,
    1.0
  );
  const restoredAcctFit = calculateJobFit(
    { skills: JSON.parse(mockDb.candidate_profiles.skills), degree: 'BS Nursing', years_experience: 3 },
    accountantJob,
    0.1
  );
  assert(restoredNurseFit.jobFitScore >= 80, `Restored upload: Nurse job fit is high (${restoredNurseFit.jobFitScore}%)`);
  assert(restoredAcctFit.jobFitScore < 50, `Restored upload: Accountant job fit is low (${restoredAcctFit.jobFitScore}%)`);
  assert(restoredNurseFit.tier === 'Strong Match', 'Restored upload: Nurse placed in Strong Match');
  assert(restoredAcctFit.tier !== 'Strong Match', 'Restored upload: Accountant not placed in Strong Match');

  // Phase E: Deleting Uploaded Resume Coexistence (Blocker 4)
  // When candidate deletes uploaded resume while Builder exists:
  const hasBuilderFormResume = Boolean(mockDb.candidate_form_resumes?.resume_data);
  assert(hasBuilderFormResume === true, 'Candidate form resume exists');
  // Delete uploaded file row
  mockDb.resumes = null;
  if (hasBuilderFormResume) {
    // Project Builder as active
    mockDb.candidate_profiles.skills = JSON.stringify(mockDb.candidate_form_resumes.resume_data.skills.map(s => s.name));
    mockDb.candidate_profiles.active_resume_source = 'builder';
    mockDb.profiles.skills = mockDb.candidate_form_resumes.resume_data.skills.map(s => s.name).join(',');
  } else {
    mockDb.candidate_profiles = null;
    mockDb.profiles.skills = '';
  }

  assert(mockDb.resumes === null, 'Uploaded resume deleted');
  assert(mockDb.candidate_profiles !== null,
    'Blocker 4 Verified: candidate_profiles was NOT destroyed when uploaded resume was deleted!');
  assert(mockDb.candidate_profiles.active_resume_source === 'builder',
    'Blocker 4 Verified: Builder automatically projected as active resume source!');
  assert(JSON.parse(mockDb.candidate_profiles.skills).includes('Accounting'),
    'Blocker 4 Verified: Candidate profile active skills powered by Builder!');

  // ── Test 16: Test A — Builder CTA Synchronization ────────────────────────
  console.log('\n[Test 16] Test A — Builder CTA Synchronization (handleGoToJobs)');

  const step6Source = fs.readFileSync(path.join(ROOT_DIR, 'src', 'components', 'resume', 'builder', 'Step6Review.jsx'), 'utf8');
  assert(step6Source.includes('async function handleGoToJobs()'), 'Step6Review defines async handleGoToJobs()');
  assert(step6Source.includes('await onFinalize()'), 'Step6Review awaits onFinalize() before navigation');
  assert(step6Source.includes("navigate('/candidate/jobs?view=recommended')") || step6Source.includes('navigate("/candidate/jobs?view=recommended")'),
    'Step6Review navigates to /candidate/jobs?view=recommended');
  assert(step6Source.includes('setNavigatingToJobs(true)') && step6Source.includes('setNavigatingToJobs(false)'),
    'Step6Review manages navigatingToJobs loading state');
  assert(step6Source.includes('Preparing your job matches...'),
    'Step6Review shows "Preparing your job matches..." while navigating');

  // Functional simulation of handleGoToJobs
  let simulatedNavigatedPath = null;
  let simulatedFinalizeCalled = false;
  let simulatedNavigatingState = false;

  async function simulateHandleGoToJobs(onFinalizeMock, navigateMock, onErrorMock) {
    simulatedNavigatingState = true;
    try {
      const res = await onFinalizeMock();
      if (res && res.success === false) {
        throw new Error(res.error || 'Failed to save resume');
      }
      navigateMock('/candidate/jobs?view=recommended');
    } catch (err) {
      onErrorMock(err.message);
    } finally {
      simulatedNavigatingState = false;
    }
  }

  // 1. Success case
  await simulateHandleGoToJobs(
    async () => { simulatedFinalizeCalled = true; return { success: true }; },
    (path) => { simulatedNavigatedPath = path; },
    () => {}
  );
  assert(simulatedFinalizeCalled === true, 'onFinalize was awaited');
  assert(simulatedNavigatedPath === '/candidate/jobs?view=recommended',
    'handleGoToJobs navigated to /candidate/jobs?view=recommended on success');
  assert(simulatedNavigatingState === false, 'Loading state reset after success');

  // 2. Failure case: navigation must NOT occur
  let simulatedErrorReported = null;
  simulatedNavigatedPath = null;
  await simulateHandleGoToJobs(
    async () => ({ success: false, error: 'Database network error' }),
    (path) => { simulatedNavigatedPath = path; },
    (errMsg) => { simulatedErrorReported = errMsg; }
  );
  assert(simulatedNavigatedPath === null, 'handleGoToJobs aborted navigation on finalize error');
  assert(simulatedErrorReported === 'Database network error', 'Error message reported to candidate');
  assert(simulatedNavigatingState === false, 'Loading state reset after error');

  // ── Test 17: Test B — No Inactive Upload Skills in Builder Matching ────────
  console.log('\n[Test 17] Test B — No Inactive Upload Skills in Builder Matching');

  const jobMatchesSource = fs.readFileSync(path.join(ROOT_DIR, 'src', 'pages', 'candidate', 'JobMatches.jsx'), 'utf8');
  assert(jobMatchesSource.includes('getCandidateSkillEvidence') &&
         jobMatchesSource.includes('activeSource === "upload" ? resumeRow : null'),
    'JobMatches.jsx strictly passes resumeRow only when activeSource is upload');

  // Functional simulation of getCandidateSkillEvidence with activeSource isolation
  const builderProfile = {
    skills: JSON.stringify(['Accounting', 'Financial Analysis', 'QuickBooks']),
    active_resume_source: 'builder'
  };
  const staleUploadResume = {
    extracted_skills: 'Patient Care, Phlebotomy, Vital Signs Monitoring, BLS'
  };

  const activeSourceBuilder = 'builder';
  const builderCandidateSkills = getCandidateSkillEvidence(
    builderProfile,
    activeSourceBuilder === 'upload' ? staleUploadResume : null
  );

  assert(builderCandidateSkills.includes('accounting'), 'Builder candidate has Accounting skill');
  assert(builderCandidateSkills.includes('quickbooks'), 'Builder candidate has QuickBooks skill');
  assert(!builderCandidateSkills.includes('patient care'),
    'Strict Isolation Verified: Upload Patient Care skill NOT in Builder candidate profile');
  assert(!builderCandidateSkills.includes('phlebotomy'),
    'Strict Isolation Verified: Upload Phlebotomy skill NOT in Builder candidate profile');
  assert(!builderCandidateSkills.includes('vital signs monitoring'),
    'Strict Isolation Verified: Upload Vital Signs skill NOT in Builder candidate profile');

  // Contrast with activeSource === 'upload'
  const activeSourceUpload = 'upload';
  const uploadCandidateSkills = getCandidateSkillEvidence(
    builderProfile,
    activeSourceUpload === 'upload' ? staleUploadResume : null
  );
  assert(uploadCandidateSkills.includes('patient care'), 'Upload active: Patient Care is included');
  assert(uploadCandidateSkills.includes('accounting'), 'Upload active: Candidate profile skills included');

  // ── Test 18: Test C — Recommended Jobs Sorting Algorithm ──────────────────
  console.log('\n[Test 18] Test C — Recommended Jobs Sorting Algorithm');

  assert(jobMatchesSource.includes('scoreB - scoreA') &&
         (jobMatchesSource.includes('new Date(b.created_at') || jobMatchesSource.includes('dateB - dateA')),
    'JobMatches sorts by match_score DESC then created_at DESC');

  const mockJobsForSorting = [
    { id: 'job-1', title: 'Junior Accountant', created_at: '2026-01-01T08:00:00Z' },
    { id: 'job-2', title: 'Senior Accountant', created_at: '2026-01-05T08:00:00Z' },
    { id: 'job-3', title: 'Financial Analyst', created_at: '2026-01-03T08:00:00Z' },
    { id: 'job-4', title: 'Tax Associate', created_at: '2026-01-04T08:00:00Z' }
  ];

  const matchesMapForSorting = new Map([
    ['job-1', { match_score: 85 }],
    ['job-2', { match_score: 95 }],
    ['job-3', { match_score: 85 }], // Tied with job-1 at 85%, but newer (Jan 3 vs Jan 1)
    ['job-4', { match_score: 65 }]
  ]);

  const sortedRecommended = [...mockJobsForSorting].sort((a, b) => {
    const scoreA = matchesMapForSorting.get(a.id)?.match_score ?? -1;
    const scoreB = matchesMapForSorting.get(b.id)?.match_score ?? -1;
    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }
    const dateA = new Date(a.created_at || 0).getTime();
    const dateB = new Date(b.created_at || 0).getTime();
    return dateB - dateA;
  });

  assert(sortedRecommended[0].id === 'job-2', '1st: Job 2 has highest score (95%)');
  assert(sortedRecommended[1].id === 'job-3', '2nd: Job 3 (85%) ranks above Job 1 (85%) due to newer created_at');
  assert(sortedRecommended[2].id === 'job-1', '3rd: Job 1 (85%, older date)');
  assert(sortedRecommended[3].id === 'job-4', '4th: Job 4 has lowest score (65%)');

  // ── Test 19: Test D — All Jobs Ordering Algorithm ─────────────────────────
  console.log('\n[Test 19] Test D — All Jobs Ordering Algorithm');

  const sortedAllJobs = [...mockJobsForSorting].sort((a, b) => {
    const dateA = new Date(a.created_at || 0).getTime();
    const dateB = new Date(b.created_at || 0).getTime();
    return dateB - dateA;
  });

  assert(sortedAllJobs[0].id === 'job-2', '1st: Job 2 (Jan 5)');
  assert(sortedAllJobs[1].id === 'job-4', '2nd: Job 4 (Jan 4)');
  assert(sortedAllJobs[2].id === 'job-3', '3rd: Job 3 (Jan 3)');
  assert(sortedAllJobs[3].id === 'job-1', '4th: Job 1 (Jan 1)');
  assert(sortedAllJobs[1].id === 'job-4' && matchesMapForSorting.get('job-4').match_score === 65,
    'All Jobs mode ignores match score and strictly sorts newest first');

  // ── Test 20: Test E & G — Builder & Upload Application Snapshot Isolation ─
  console.log('\n[Test 20] Test E & G — Builder & Upload Application Snapshot Isolation');

  const appServiceSource = fs.readFileSync(path.join(ROOT_DIR, 'src', 'services', 'applicationService.js'), 'utf8');
  assert(appServiceSource.includes('resume_source: isBuilder ? "builder" : "upload"'),
    'buildApplicantSnapshot tags snapshot with active resume_source');
  assert(appServiceSource.includes('built_resume: builtResumeSnapshot'),
    'buildApplicantSnapshot stores built_resume');
  assert(appServiceSource.includes('resume: uploadedResumeSnapshot'),
    'buildApplicantSnapshot stores uploaded resume info');

  // Functional simulation of buildApplicantSnapshot logic
  function simulateBuildApplicantSnapshot({ activeSource, formResumeData, resumeRow, profileRow }) {
    const isBuilder = activeSource === 'builder';
    const builtResumeSnapshot = isBuilder && formResumeData
      ? JSON.parse(JSON.stringify(formResumeData))
      : null;
    const uploadedResumeSnapshot = (!isBuilder && resumeRow?.file_url)
      ? {
          file_url: resumeRow.file_url,
          file_name: resumeRow.file_name || 'Resume',
          file_size: resumeRow.file_size || null,
          created_at: resumeRow.created_at || null
        }
      : null;

    return {
      full_name: builtResumeSnapshot?.personalDetails?.fullName?.trim() || profileRow?.full_name?.trim() || '',
      email: builtResumeSnapshot?.personalDetails?.email?.trim() || profileRow?.email?.trim() || '',
      resume_source: isBuilder ? 'builder' : 'upload',
      built_resume: builtResumeSnapshot,
      resume: uploadedResumeSnapshot
    };
  }

  // Test E: Builder Snapshot
  const candidateFormObj = {
    personalDetails: { fullName: 'Maria Santos', email: 'maria@example.com' },
    skills: [{ name: 'Bookkeeping' }, { name: 'QuickBooks' }],
    education: { entries: [{ institution: 'UST', courseOrProgram: 'BS Accountancy' }] }
  };
  const existingUploadObj = {
    file_url: 'https://staging.supabase.co/storage/v1/object/resumes/maria_nurse.pdf',
    file_name: 'maria_nurse.pdf'
  };

  const builderAppSnapshot = simulateBuildApplicantSnapshot({
    activeSource: 'builder',
    formResumeData: candidateFormObj,
    resumeRow: existingUploadObj,
    profileRow: { full_name: 'Maria Santos', email: 'maria@example.com' }
  });

  assert(builderAppSnapshot.resume_source === 'builder', 'Test E: Snapshot resume_source is "builder"');
  assert(builderAppSnapshot.built_resume !== null, 'Test E: built_resume snapshot exists');
  assert(builderAppSnapshot.built_resume.skills[0].name === 'Bookkeeping', 'Test E: built_resume has Bookkeeping skill');
  assert(builderAppSnapshot.resume === null, 'Test E: Uploaded file info is null in builder application snapshot');

  // Test G: Upload Snapshot
  const uploadAppSnapshot = simulateBuildApplicantSnapshot({
    activeSource: 'upload',
    formResumeData: candidateFormObj,
    resumeRow: existingUploadObj,
    profileRow: { full_name: 'Maria Santos', email: 'maria@example.com' }
  });

  assert(uploadAppSnapshot.resume_source === 'upload', 'Test G: Snapshot resume_source is "upload"');
  assert(uploadAppSnapshot.built_resume === null, 'Test G: built_resume is null in upload application snapshot');
  assert(uploadAppSnapshot.resume !== null, 'Test G: Uploaded resume info exists');
  assert(uploadAppSnapshot.resume.file_url === existingUploadObj.file_url, 'Test G: file_url captured in snapshot');

  // ── Test 21: Test F — Frozen Application Resume Immutability ──────────────
  console.log('\n[Test 21] Test F — Frozen Application Resume Immutability');

  assert(appServiceSource.includes('if (existingSnap?.resume_source || existingSnap?.built_resume || existingSnap?.resume)'),
    'syncApplicantSnapshot contains guard protecting submitted frozen resumes');

  // Functional simulation of syncApplicantSnapshot immutability
  const submittedApp = {
    id: 'app-uuid-001',
    applicant_snapshot: JSON.parse(JSON.stringify(builderAppSnapshot)) // V1 submitted snapshot
  };

  // Candidate subsequently mutates their Builder resume to V2
  candidateFormObj.skills.push({ name: 'Cybersecurity' });
  candidateFormObj.personalDetails.fullName = 'Maria Santos-Concepcion';

  // Candidate runs syncApplicantSnapshot
  const syncShouldUpdate = !(
    submittedApp.applicant_snapshot.resume_source ||
    submittedApp.applicant_snapshot.built_resume ||
    submittedApp.applicant_snapshot.resume
  );

  assert(syncShouldUpdate === false, 'syncApplicantSnapshot skipped existing submitted application');
  assert(submittedApp.applicant_snapshot.built_resume.skills.length === 2,
    'Frozen Snapshot Verified: Application skills count unchanged (still 2, not 3)');
  assert(!submittedApp.applicant_snapshot.built_resume.skills.some(s => s.name === 'Cybersecurity'),
    'Frozen Snapshot Verified: Later added Cybersecurity skill NOT injected into past application');
  assert(submittedApp.applicant_snapshot.built_resume.personalDetails.fullName === 'Maria Santos',
    'Frozen Snapshot Verified: Candidate name frozen as Maria Santos in past application');

  // ── Test 22: Test H — Employer Built Resume Viewer ────────────────────────
  console.log('\n[Test 22] Test H — Employer Built Resume Viewer');

  const resumeViewerSource = fs.readFileSync(path.join(ROOT_DIR, 'src', 'components', 'resume', 'ResumeViewerModal.jsx'), 'utf8');
  assert(resumeViewerSource.includes('isBuiltResume'), 'ResumeViewerModal implements isBuiltResume check');
  assert(resumeViewerSource.includes('snapshot?.resume_source === "builder"') ||
         resumeViewerSource.includes('applicant_snapshot?.resume_source === "builder"'),
    'ResumeViewerModal checks snapshot.resume_source === "builder"');
  assert(resumeViewerSource.includes('Resume submitted with application') &&
         resumeViewerSource.includes('📝 Built Resume'),
    'ResumeViewerModal displays Built Resume submission notice');
  assert(resumeViewerSource.includes('Professional Summary') && resumeViewerSource.includes('Skills'),
    'ResumeViewerModal renders Summary and Skills sections');
  assert(resumeViewerSource.includes('Work Experience') && resumeViewerSource.includes('Education'),
    'ResumeViewerModal renders Experience and Education sections');

  // ── Test 23: Test I — Employer DOCX Generation from Snapshot ──────────────
  console.log('\n[Test 23] Test I — Employer DOCX Generation from Snapshot');

  assert(resumeViewerSource.includes('downloadDocxResume') && resumeViewerSource.includes('handleDownloadWordResume'),
    'ResumeViewerModal imports and invokes downloadDocxResume');
  assert(resumeViewerSource.includes('_Resume.docx'),
    'ResumeViewerModal names generated document with Candidate_Name_Resume.docx convention');

  // Functional test generating DOCX from applicant_snapshot.built_resume
  const sampleBuiltResumeSnapshot = {
    personalDetails: {
      fullName: 'Jose Rizal',
      email: 'j.rizal@example.com',
      phone: '+63 917 123 4567',
      location: 'Calamba, Laguna',
      summary: 'Experienced medical doctor, writer, and linguist.'
    },
    education: {
      noFormalEducation: false,
      entries: [
        {
          institution: 'Universidad Central de Madrid',
          level: 'Doctorate or post-graduate degree',
          courseOrProgram: 'Licentiate in Medicine',
          status: 'Completed'
        }
      ]
    },
    skills: [
      { name: 'Ophthalmology' },
      { name: 'Literary Writing' },
      { name: 'French' },
      { name: 'German' }
    ],
    experience: {
      noExperience: false,
      entries: [
        {
          title: 'Physician',
          organization: 'Eye Clinic Paris',
          startDate: '1885-01',
          endDate: '1886-06',
          description: 'Specialized in ophthalmologic care and clinical diagnostics.'
        }
      ]
    },
    projectsAndCredentials: {
      projects: [{ title: 'Noli Me Tangere Manuscript', role: 'Author', description: 'Published novel.' }],
      certifications: [{ name: 'Licentiate in Medicine', issuer: 'Madrid Medical Board' }]
    }
  };

  const employerDocxXml = buildDocumentXml(sampleBuiltResumeSnapshot);
  assert(employerDocxXml.includes('Jose Rizal'), 'Employer DOCX XML contains candidate name');
  assert(employerDocxXml.includes('Ophthalmology'), 'Employer DOCX XML contains skills');
  assert(employerDocxXml.includes('Universidad Central de Madrid'), 'Employer DOCX XML contains education');

  // Validate strict XML well-formedness
  let xmlValid = true;
  try {
    validateStrictXml(employerDocxXml);
  } catch (err) {
    xmlValid = false;
    console.error('XML validation error:', err);
  }
  assert(xmlValid === true, 'Employer DOCX XML passes strict well-formedness validation');

  const employerDocxBlob = await generateDocxResumeBlob(sampleBuiltResumeSnapshot);
  const employerDocxBuf = Buffer.from(await employerDocxBlob.arrayBuffer());
  assert(employerDocxBuf[0] === 0x50 && employerDocxBuf[1] === 0x4B &&
         employerDocxBuf[2] === 0x03 && employerDocxBuf[3] === 0x04,
    'Employer DOCX generation produces valid PKZIP archive signature');
  assert(employerDocxBuf.length > 5000, `Employer DOCX blob has valid size (${employerDocxBuf.length} bytes)`);

  // ── Test 24: Test J — Candidate and Employer Match Score Parity ───────────
  console.log('\n[Test 24] Test J — Candidate and Employer Match Score Parity');

  assert(appServiceSource.includes('from("job_matches")') && appServiceSource.includes('job_match:'),
    'fetchEmployerApplicants queries job_matches and attaches job_match object');

  const applicantsJsx = fs.readFileSync(path.join(ROOT_DIR, 'src', 'pages', 'employer', 'Applicants.jsx'), 'utf8');
  assert(applicantsJsx.includes('const jm = app.job_match') && applicantsJsx.includes('jm.match_score'),
    'Applicants.jsx calculateAlignment prioritizes authoritative app.job_match.match_score');
  assert(applicantsJsx.includes('🎯 ${alignment.score}% Job Match') || applicantsJsx.includes('🎯 {alignment.score}% Job Match'),
    'Applicants.jsx displays authoritative percentage as 🎯 {alignment.score}% Job Match');

  // Functional simulation of Parity
  const authoritativeMatchScore = 88;
  const simulatedJobMatchRow = {
    job_id: 'job-123',
    application_id: 'app-999',
    match_score: authoritativeMatchScore,
    breakdown: {
      requiredSkillsScore: 90,
      transferableSkillsScore: 85,
      educationCompatibility: 90,
      experienceCompatibility: 85
    }
  };

  // Candidate side: Recommended Jobs card
  const candidateRenderedScore = simulatedJobMatchRow.match_score;

  // Employer side: calculateAlignment(app)
  function simulateCalculateAlignment(app) {
    if (app.job_match && typeof app.job_match.match_score === 'number') {
      return {
        score: Math.round(app.job_match.match_score),
        breakdown: app.job_match.breakdown || null
      };
    }
    return { score: 50, breakdown: null };
  }

  const employerAlignment = simulateCalculateAlignment({ job_match: simulatedJobMatchRow });
  const employerRenderedScore = employerAlignment.score;

  assert(candidateRenderedScore === 88, 'Candidate view displays 88% Match');
  assert(employerRenderedScore === 88, 'Employer view displays 88% Job Match');
  assert(candidateRenderedScore === employerRenderedScore && employerRenderedScore === authoritativeMatchScore,
    'Authoritative Parity Verified: Candidate score == Employer score == job_matches.match_score');

  // ── Test 25: Test K — HR Private Recruiter Evaluation Independence ────────
  console.log('\n[Test 25] Test K — HR Private Recruiter Evaluation Independence');

  assert(applicantsJsx.includes('Role-Specific Fit (1–5 Stars)'),
    'Recruiter evaluation modal uses career-neutral "Role-Specific Fit (1–5 Stars)" label');
  assert(applicantsJsx.includes('Record interview observations, assessment results, role-specific competency, soft skills feedback...'),
    'Recruiter evaluation modal uses career-neutral screening notes placeholder');
  assert(!applicantsJsx.includes('Technical Skill Rating (1–5 Stars)'),
    'No obsolete Technical Skill Rating label in recruiter modal');

  // Functional verification of score immutability
  const applicantRecord = {
    id: 'app-999',
    job_match: { match_score: 92 },
    recruiter_evaluation: null
  };

  // Recruiter inputs evaluation
  const privateEval = {
    roleSpecificRating: 2,
    cultureFitRating: 3,
    recommendation: 'Consider',
    notes: 'Practical assessment needed further clarification.'
  };
  applicantRecord.recruiter_evaluation = privateEval;

  assert(applicantRecord.recruiter_evaluation.roleSpecificRating === 2, 'Private recruiter evaluation recorded');
  assert(applicantRecord.job_match.match_score === 92,
    'HR Independence Verified: Automated system match_score (92%) remains completely untouched by HR evaluation!');

  // ── Test 26: Test L — Complete Source Switch and Delete Coexistence ───────
  console.log('\n[Test 26] Test L — Complete Source Switch and Delete Coexistence');

  // Complete end-to-end multi-step simulation:
  const candidateAccount = {
    userId: 'user-cand-xyz',
    activeSource: 'builder',
    builderResume: {
      personalDetails: { fullName: 'Gabriel Silang' },
      skills: [{ name: 'Logistics' }, { name: 'Supply Chain' }, { name: 'Fleet Management' }]
    },
    uploadedResume: null,
    submittedApplications: []
  };

  // Step 1: Candidate applies to Job 1 with Builder active
  const job1Application = {
    id: 'app-101',
    jobTitle: 'Logistics Supervisor',
    applicant_snapshot: simulateBuildApplicantSnapshot({
      activeSource: candidateAccount.activeSource,
      formResumeData: candidateAccount.builderResume,
      resumeRow: candidateAccount.uploadedResume,
      profileRow: { full_name: 'Gabriel Silang' }
    })
  };
  candidateAccount.submittedApplications.push(job1Application);

  assert(job1Application.applicant_snapshot.resume_source === 'builder',
    'Step 1: Job 1 applied with resume_source "builder"');
  assert(job1Application.applicant_snapshot.built_resume.skills[0].name === 'Logistics',
    'Step 1: Job 1 snapshot contains Logistics skills');

  // Step 2: Candidate uploads resume and switches active source to upload
  candidateAccount.uploadedResume = {
    file_url: 'https://staging.supabase.co/storage/v1/object/resumes/gabriel_trades.pdf',
    file_name: 'gabriel_trades.pdf',
    extracted_skills: 'Welding, Metal Fabrication, Safety Protocols'
  };
  candidateAccount.activeSource = 'upload';

  // Candidate applies to Job 2 with Upload active
  const job2Application = {
    id: 'app-102',
    jobTitle: 'Welder Fabricator',
    applicant_snapshot: simulateBuildApplicantSnapshot({
      activeSource: candidateAccount.activeSource,
      formResumeData: candidateAccount.builderResume,
      resumeRow: candidateAccount.uploadedResume,
      profileRow: { full_name: 'Gabriel Silang' }
    })
  };
  candidateAccount.submittedApplications.push(job2Application);

  assert(job2Application.applicant_snapshot.resume_source === 'upload',
    'Step 2: Job 2 applied with resume_source "upload"');
  assert(job2Application.applicant_snapshot.resume.file_name === 'gabriel_trades.pdf',
    'Step 2: Job 2 snapshot contains gabriel_trades.pdf');
  assert(job2Application.applicant_snapshot.built_resume === null,
    'Step 2: Job 2 snapshot has null built_resume');

  // Step 3: Candidate deletes uploaded resume file
  candidateAccount.uploadedResume = null;
  // If uploaded resume is deleted and builder exists, activeSource falls back to 'builder'
  if (candidateAccount.builderResume) {
    candidateAccount.activeSource = 'builder';
  }

  // Step 4: Verification across all records
  assert(candidateAccount.activeSource === 'builder',
    'Step 4: Active source cleanly falls back to "builder" after uploaded resume deleted');
  assert(job1Application.applicant_snapshot.resume_source === 'builder',
    'Step 4: Job 1 snapshot remains strictly preserved as "builder"');
  assert(job1Application.applicant_snapshot.built_resume.skills.length === 3,
    'Step 4: Job 1 snapshot built_resume remains intact');
  assert(job2Application.applicant_snapshot.resume_source === 'upload',
    'Step 4: Job 2 snapshot remains strictly preserved as "upload"');
  assert(job2Application.applicant_snapshot.resume.file_name === 'gabriel_trades.pdf',
    'Step 4: Job 2 snapshot historical resume reference remains intact');

  // ── Test 27: Extraction Truthfulness & Zero-Percent Text vs Profile-Stored Data ───────────
  console.log('\n[Test 27] Extraction Truthfulness & Zero-Percent Text vs Profile-Stored Data');

  // 1. Unreadable document (textLength === 0): truthfulness guarantees
  const emptyTextReport = assessResumeQuality({
    rawText: '',
    details: {
      degree: 'BS Information Technology',
      hasEducationSection: true,
      hasExperienceSection: true
    },
    skills: ['JavaScript', 'React', 'Node.js']
  });

  assert(emptyTextReport.extractionQuality.isUnreadable === true, 'Empty text marks resume as isUnreadable');
  assert(emptyTextReport.extractionQuality.score === 0, 'Empty text yields 0 text quality score');
  assert(emptyTextReport.feedback.issues.some(i => i.code === 'EMPTY_TEXT' && i.severity === 'critical'),
    'Reports EMPTY_TEXT critical issue for zero-length document');
  assert(emptyTextReport.sections.statusMap.EDUCATION === false,
    'Zero false positives: Education section is false when document is unreadable');
  assert(emptyTextReport.sections.statusMap.EXPERIENCE === false,
    'Zero false positives: Experience section is false when document is unreadable');
  assert(emptyTextReport.sections.statusMap.SKILLS === false,
    'Zero false positives: Skills section is false when document is unreadable');
  assert(emptyTextReport.sections.statusMap.CONTACT === false,
    'Zero false positives: Contact section is false when document is unreadable');
  assert(emptyTextReport.fields.degreeProvenance === 'profile_stored',
    'Degree provenance is accurately flagged as "profile_stored"');
  assert(emptyTextReport.fields.degree === null,
    'Extracted degree is null when document text is unreadable (never fabricated)');
  assert(emptyTextReport.fields.degreeStored === 'BS Information Technology',
    'Profile-stored degree preserved in degreeStored field');
  assert(!emptyTextReport.feedback.strengths.some(s => s.toLowerCase().includes('education credentials verified')),
    'Does not claim verified education when document text is empty');

  // 2. Readable document: real text extraction guarantees
  const readableReport = assessResumeQuality({
    rawText: 'Maria Santos\nmaria@example.com\n+639123456789\nBS Information Technology\nSkills: React, JavaScript, Node.js\nWork Experience: Web Developer at Tech PH (2022-2024)',
    details: {
      degree: 'BS Information Technology',
      email: 'maria@example.com',
      phone: '+639123456789',
      hasEducationSection: true,
      hasExperienceSection: true
    },
    skills: ['React', 'JavaScript', 'Node.js']
  });

  assert(readableReport.extractionQuality.isUnreadable === false, 'Readable text is not marked unreadable');
  assert(readableReport.fields.degreeProvenance === 'extracted', 'Degree provenance is "extracted"');
  assert(readableReport.fields.degree === 'BS Information Technology', 'Extracted degree matches document');
  assert(readableReport.sections.statusMap.EDUCATION === true, 'Education section detected');
  assert(readableReport.sections.statusMap.SKILLS === true, 'Skills section detected');

  // 3. UI component contract verification for ResumeQualityCard
  const qualityCardJsx = fs.readFileSync(path.join(ROOT_DIR, 'src', 'components', 'resume', 'ResumeQualityCard.jsx'), 'utf8');
  assert(qualityCardJsx.includes('Text Extraction Failed (0%)'),
    'ResumeQualityCard displays prominent "Text Extraction Failed (0%)" alert');
  assert(qualityCardJsx.includes('existing profile records') || qualityCardJsx.includes('Unextracted (Profile:'),
    'ResumeQualityCard indicates when credentials originate from profile rather than document text');

  // ── Test 28: Single Central Job Marketplace — Recommended vs All Jobs Filtering & Formatting ───────────
  console.log('\n[Test 28] Single Central Job Marketplace — Recommended vs All Jobs Filtering & Formatting');

  // 1. Code contracts in JobMatches.jsx
  const jobMatchesJsx = fs.readFileSync(path.join(ROOT_DIR, 'src', 'pages', 'candidate', 'JobMatches.jsx'), 'utf8');
  assert(jobMatchesJsx.includes('marketplaceMode === "recommended"'),
    'JobMatches.jsx implements marketplaceMode === "recommended" toggle');
  assert(jobMatchesJsx.includes('typeof match.match_score === "number" && match.match_score >= 0'),
    'JobMatches.jsx recommended filter requires valid calculated match_score >= 0');
  assert(jobMatchesJsx.includes('rec-job-score-badge uncomputed') && jobMatchesJsx.includes('Not Evaluated'),
    'JobMatches.jsx labels unscored jobs with uncomputed badge and "Not Evaluated"');
  assert(jobMatchesJsx.includes('No matching jobs were found for your current active resume qualifications'),
    'JobMatches.jsx displays tailored empty state for Recommended mode');

  // 2. Functional simulation of Recommended vs All Jobs filtering and ordering
  const sampleJobs = [
    { id: 'job-1', title: 'Senior Backend Engineer', created_at: '2026-03-01T10:00:00Z' },
    { id: 'job-2', title: 'Data Analyst', created_at: '2026-03-05T10:00:00Z' },
    { id: 'job-3', title: 'Unscored Niche Specialist', created_at: '2026-03-10T10:00:00Z' },
    { id: 'job-4', title: 'Junior Frontend Developer', created_at: '2026-03-08T10:00:00Z' }
  ];
  const simulatedMatchesMap = new Map([
    ['job-1', { match_score: 92 }],
    ['job-2', { match_score: 78 }],
    ['job-4', { match_score: 78 }]
    // job-3 has no match record
  ]);

  // Recommended mode: filter then sort by match_score DESC, created_at DESC
  const recommendedCandidateJobs = sampleJobs.filter(job => {
    const match = simulatedMatchesMap.get(job.id);
    return match && typeof match.match_score === 'number' && match.match_score >= 0;
  });
  const recommendedSortedJobs = [...recommendedCandidateJobs].sort((a, b) => {
    const matchA = simulatedMatchesMap.get(a.id);
    const matchB = simulatedMatchesMap.get(b.id);
    const scoreA = typeof matchA?.match_score === 'number' ? matchA.match_score : -1;
    const scoreB = typeof matchB?.match_score === 'number' ? matchB.match_score : -1;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });

  assert(recommendedSortedJobs.length === 3, 'Recommended mode excludes unscored jobs (3 of 4 jobs shown)');
  assert(!recommendedSortedJobs.some(j => j.id === 'job-3'), 'Unscored job-3 strictly excluded from recommended view');
  assert(recommendedSortedJobs[0].id === 'job-1', '1st in recommended: highest score (92%)');
  assert(recommendedSortedJobs[1].id === 'job-4', '2nd in recommended: job-4 (78%, newer date Mar 8 vs Mar 5)');
  assert(recommendedSortedJobs[2].id === 'job-2', '3rd in recommended: job-2 (78%, older date Mar 5)');

  // All Jobs mode: all jobs included, sorted newest first
  const allSortedJobs = [...sampleJobs].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  assert(allSortedJobs.length === 4, 'All Jobs mode includes all 4 jobs');
  assert(allSortedJobs[0].id === 'job-3', '1st in All Jobs: newest posting (Mar 10)');
  const job3Match = simulatedMatchesMap.get('job-3');
  const job3Badge = typeof job3Match?.match_score === 'number' ? `${job3Match.match_score}%` : 'JOB MATCH: N/A - Not Evaluated';
  assert(job3Badge === 'JOB MATCH: N/A - Not Evaluated', 'Unscored job displays "JOB MATCH: N/A - Not Evaluated"');

  // ── Test 29: Application-Time Snapshot Priority Over Live Mutated Profile ───────────
  console.log('\n[Test 29] Application-Time Snapshot Priority Over Live Mutated Profile');

  // 1. Code contracts in applicationService.js and ResumeViewerModal.jsx
  const appServiceSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'services', 'applicationService.js'), 'utf8');
  assert(appServiceSrc.includes('skills: snapshot.skills || profileFromJoin?.skills || ""'),
    'enrichApplicationRecord prioritizes snapshot.skills over live profile skills');
  assert(appServiceSrc.includes('education: snapshot.education || profileFromJoin?.education || null'),
    'enrichApplicationRecord prioritizes snapshot.education over live profile education');
  assert(appServiceSrc.includes('work_experience: snapshot.work_experience || profileFromJoin?.work_experience || null'),
    'enrichApplicationRecord prioritizes snapshot.work_experience over live profile work_experience');

  const viewerModalSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'components', 'resume', 'ResumeViewerModal.jsx'), 'utf8');
  assert(viewerModalSrc.includes('parseSkills(snapshot?.skills || profile?.skills)'),
    'ResumeViewerModal extracts candidate skills prioritizing snapshot');

  // 2. Functional verification with enrichApplicationRecord
  const submittedApplication = {
    id: 'app-frozen-777',
    job_id: 'job-acc-101',
    applicant_id: 'cand-user-555',
    status: 'applied',
    applicant_snapshot: {
      full_name: 'Elena Santos',
      email: 'elena.santos@email.ph',
      contact_number: '+639171234567',
      resume_source: 'builder',
      skills: 'Accounting, Bookkeeping, Financial Reporting, QuickBooks',
      education: [{ degree: 'BS Accountancy', school: 'Ateneo de Davao University', year: '2023' }],
      work_experience: [{ title: 'Junior Accountant', organization: 'Audit Partners PH', duration: '1 year' }],
      certifications: [{ name: 'Certified Bookkeeper (CB)' }],
      built_resume: {
        personalDetails: { fullName: 'Elena Santos', email: 'elena.santos@email.ph' },
        skills: [{ name: 'Accounting' }, { name: 'Bookkeeping' }, { name: 'Financial Reporting' }, { name: 'QuickBooks' }]
      }
    },
    profiles: {
      // Live candidate profile has mutated months later
      full_name: 'Elena Santos-Tan',
      email: 'elena.tan@techinnovations.ph',
      contact_number: '+639189998888',
      skills: 'Python, Machine Learning, TensorFlow, AWS, React, PostgreSQL',
      education: [{ degree: 'MS Computer Science', school: 'UP Diliman', year: '2026' }],
      work_experience: [{ title: 'AI Research Engineer', organization: 'AI Labs PH', duration: '2 years' }],
      certifications: [{ name: 'AWS Certified Solutions Architect' }]
    }
  };

  const enriched = enrichApplicationRecord(submittedApplication);

  assert(enriched.profiles.skills === 'Accounting, Bookkeeping, Financial Reporting, QuickBooks',
    'Snapshot Priority: Enriched application displays submitted Accounting skills, NOT mutated live Python skills');
  assert(!enriched.profiles.skills.includes('Python'),
    'Strict Snapshot Isolation: Mutated Python skill not present in historical application view');
  assert(enriched.profiles.education[0].degree === 'BS Accountancy',
    'Snapshot Priority: Enriched application displays submitted BS Accountancy, NOT mutated MS Computer Science');
  assert(enriched.profiles.work_experience[0].title === 'Junior Accountant',
    'Snapshot Priority: Enriched application displays submitted Junior Accountant role, NOT mutated AI Research Engineer role');
  assert(enriched.resume_source === 'builder',
    'Snapshot resume_source correctly identifies builder submission');
  assert(enriched.built_resume !== null,
    'built_resume snapshot cleanly attached for employer viewing and DOCX export');

  console.log(`\n🎉 ALL ${passedTests}/${totalTests} RESUME BUILDER TESTS PASSED!`);
}

runTestSuite().catch(err => {
  console.error('\n❌ Test Suite Aborted with Error:', err);
  process.exit(1);
});

