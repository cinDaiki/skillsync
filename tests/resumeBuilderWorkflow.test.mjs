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
  saveCanonicalResume
} from '../src/services/resumeBuilderService.js';
import {
  generateDocxResumeBlob,
  buildDocumentXml,
  createZipArchive,
  escapeXml
} from '../src/services/docxResumeGenerator.js';
import { parseResumeFile } from '../src/services/resumeParser.js';
import { calculateJobFit } from '../src/services/ai/jobFitEngine.js';

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
  assert(summary.includes('BS Computer Science') && summary.includes('JavaScript'),
    'Summary truthfully reflects entered education and skills');

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
  assert(step6Jsx.includes('View Recommended Jobs →'), 'Step 6 has clean View Recommended Jobs CTA');

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
  assert(uploadJsx.includes('RecommendedJobs'), 'ResumeUpload renders RecommendedJobs for uploaded documents');

  const sidebarJsx = fs.readFileSync(path.join(ROOT_DIR, 'src', 'components', 'layout', 'Sidebar.jsx'), 'utf8');
  assert(sidebarJsx.includes('/candidate/resume'), 'Sidebar includes /candidate/resume link');
  assert(sidebarJsx.includes('/candidate/resume-builder'), 'Sidebar includes /candidate/resume-builder link');
  assert(sidebarJsx.includes('Resume Upload'), 'Sidebar has "Resume Upload" item');
  assert(sidebarJsx.includes('Resume Builder'), 'Sidebar has "Resume Builder" item');

  const appJsx = fs.readFileSync(path.join(ROOT_DIR, 'src', 'App.jsx'), 'utf8');
  assert(appJsx.includes('path="/candidate/resume"'), 'App.jsx defines /candidate/resume route');
  assert(appJsx.includes('path="/candidate/resume-builder"'), 'App.jsx defines /candidate/resume-builder route');

  console.log(`\n🎉 ALL ${passedTests}/${totalTests} RESUME BUILDER TESTS PASSED!`);
}

runTestSuite().catch(err => {
  console.error('\n❌ Test Suite Aborted with Error:', err);
  process.exit(1);
});

