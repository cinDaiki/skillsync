/**
 * tests/resumeQualityValidation.test.mjs
 *
 * SkillSync Phase 2: Resume Quality and Extraction Validation Test Suite
 *
 * Verifies:
 * 1. Phase 1 Blank Template & Completed Fictional Sample extraction and quality.
 * 2. Missing sections handling without blocking uploads or inventing qualifications.
 * 3. Alternate section headings (including Filipino/regional aliases).
 * 4. Missing contact information and incomplete work history detection.
 * 5. Skill traceability: grounding in document text and preventing false positives/duplicates.
 * 6. Empty, text-poor, and malformed binary document handling.
 * 7. Compressed (DEFLATE) vs uncompressed (STORE) DOCX archives extraction parity.
 * 8. Separation of Resume Quality, Extraction Quality, and Job-Fit Accuracy.
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { parseResumeFile } from '../src/services/resumeParser.js';
import { assessResumeQuality } from '../src/services/parser/qualityAssessor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const TEMPLATES_DIR = path.resolve(ROOT_DIR, 'public', 'templates');

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
  console.log('=== RUNNING RESUME QUALITY & EXTRACTION VALIDATION TESTS ===\n');

  // ── Test 1: Completed Fictional Sample Resume (.docx) Quality Assessment ────
  console.log('[Test 1] Completed Fictional Sample Resume Quality & Extraction Fidelity');
  const sampleDocxPath = path.join(TEMPLATES_DIR, 'SkillSync_Completed_Sample_Resume.docx');
  assert(fs.existsSync(sampleDocxPath), 'Completed sample resume exists in templates');

  const sampleBuf = fs.readFileSync(sampleDocxPath);
  const sampleFile = new File([sampleBuf], 'SkillSync_Completed_Sample_Resume.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });

  const parsedSample = await parseResumeFile(sampleFile);
  const qSample = parsedSample.qualityAssessment;

  assert(qSample !== null && typeof qSample === 'object', 'Quality assessment attached to parsed result');
  assert(qSample.extractionQuality.score >= 85, `High extraction quality score (${qSample.extractionQuality.score} >= 85)`);
  assert(qSample.extractionQuality.rating === 'EXCELLENT', `Extraction quality rating is EXCELLENT (${qSample.extractionQuality.rating})`);
  assert(qSample.extractionQuality.isTextPoor === false, 'Text is not flagged as poor');
  assert(qSample.extractionQuality.wordCount > 150, `Word count is substantial (${qSample.extractionQuality.wordCount} words)`);

  // Sections verified
  assert(qSample.sections.detected.includes('CONTACT'), 'Contact section detected');
  assert(qSample.sections.detected.includes('EXPERIENCE'), 'Experience section detected');
  assert(qSample.sections.detected.includes('EDUCATION'), 'Education section detected');
  assert(qSample.sections.detected.includes('SKILLS'), 'Skills section detected');

  // Skill traceability
  assert(qSample.skillTraceability.fidelityRatio === 1, 'All recognized skills are 100% grounded in document text');
  assert(qSample.fields.groundedSkillsCount >= 10, `Grounded skills count is high (${qSample.fields.groundedSkillsCount})`);
  assert(qSample.templateSuggestion.recommended === false, 'Template is NOT recommended for high-quality completed sample');

  // ── Test 2: Blank Template Safety (No Invented Credentials) ────────────────
  console.log('\n[Test 2] Blank Template Extraction Safety (Zero Hallucinated Qualifications)');
  const templateDocxPath = path.join(TEMPLATES_DIR, 'SkillSync_ATS_Resume_Template.docx');
  const templateBuf = fs.readFileSync(templateDocxPath);
  const templateFile = new File([templateBuf], 'SkillSync_ATS_Resume_Template.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });

  const parsedTemplate = await parseResumeFile(templateFile);
  const qTemplate = parsedTemplate.qualityAssessment;

  assert(qTemplate !== null, 'Quality assessment present on blank template');
  // Confirm that blank template prompts are not interpreted as genuine candidate degree or employment
  assert(parsedTemplate.details.yearsOfExperience === 0, 'No invented years of experience on blank template');
  assert(!parsedTemplate.details.email || parsedTemplate.details.email === 'your.email@example.com',
    'No candidate identity hallucinated from blank placeholders');

  // ── Test 3: Missing Section Handling (Self-Taught Engineer without Education) ─
  console.log('\n[Test 3] Missing Section Handling (Self-Taught Developer without Education)');
  const noEduResumeText = `
JORDAN CRUZ
Senior Frontend Developer | Manila, Philippines | +63 917 111 2233 | jordan.cruz@example.com | linkedin.com/in/jordancruz

PROFESSIONAL SUMMARY
Passionate self-taught frontend engineer with 4 years of experience building modern React, TypeScript, and Tailwind CSS applications.

CORE SKILLS
JavaScript, TypeScript, React, Next.js, Redux, HTML, CSS, Tailwind CSS, Git, REST API

WORK EXPERIENCE
Frontend Engineer | Digital Innovations Inc. | Manila, Philippines
March 2021 - Present
• Engineered responsive web applications in React and TypeScript serving 100,000+ monthly active users.
• Improved application lighthouse performance score from 62 to 94.
• Collaborated in bi-weekly Agile Scrum sprints with product designers.
`.trim();

  const assessmentNoEdu = assessResumeQuality({
    rawText: noEduResumeText,
    details: {
      email: 'jordan.cruz@example.com',
      phone: '+63 917 111 2233',
      hasContact: true,
      hasExperienceSection: true,
      hasEducationSection: false, // Authentically false!
      hasCertificationsSection: false,
      degree: null, // No invented degree!
      course: null,
      yearsOfExperience: 4
    },
    skills: ['JavaScript', 'TypeScript', 'React', 'Next.js', 'Redux', 'HTML', 'CSS', 'Tailwind CSS', 'Git', 'REST API']
  });

  assert(assessmentNoEdu.sections.detected.includes('EXPERIENCE'), 'Experience section detected');
  assert(assessmentNoEdu.sections.detected.includes('SKILLS'), 'Skills section detected');
  assert(assessmentNoEdu.sections.missing.includes('EDUCATION'), 'Education correctly identified as missing');
  assert(assessmentNoEdu.fields.degree === null, 'Did NOT invent or assume a missing degree');
  assert(assessmentNoEdu.feedback.warnings.some(w => w.code === 'NO_EDUCATION_SECTION'),
    'Generated specific, actionable warning: education section not found');
  assert(assessmentNoEdu.extractionQuality.score > 60, 'Did NOT crash or zero out score for missing optional education');

  // ── Test 4: Alternate Section Headings (Filipino Aliases) ───────────────────
  console.log('\n[Test 4] Alternate Section Headings (Filipino Regional Aliases)');
  const filipinoResumeText = `
JUAN DELA CRUZ
Web Developer | juan@example.com | +63 918 333 4444

LAYUNIN
Maging mahusay na web developer gamit ang React at Node.js.

MGA KASANAYAN
JavaScript, React, Node.js, HTML, CSS, Git, PostgreSQL

KARANASAN SA TRABAHO
Junior Developer | Tech Pinoy Inc. | 2022 - Kasalukuyan
• Bumuo ng mga web page gamit ang React at CSS.

PINAG-ARALAN
Bachelor of Science in Information Technology
Pamantasan ng Lungsod ng Maynila | 2018 - 2022
`.trim();

  const assessmentFil = assessResumeQuality({
    rawText: filipinoResumeText,
    details: {
      email: 'juan@example.com',
      phone: '+63 918 333 4444',
      hasContact: true,
      hasExperienceSection: true,
      hasEducationSection: true,
      degree: 'Bachelor of Science in Information Technology',
      yearsOfExperience: 2
    },
    skills: ['JavaScript', 'React', 'Node.js', 'HTML', 'CSS', 'Git', 'PostgreSQL']
  });

  assert(assessmentFil.sections.detected.includes('EXPERIENCE'), 'Filipino experience alias recognized');
  assert(assessmentFil.sections.detected.includes('EDUCATION'), 'Filipino education alias recognized');
  assert(assessmentFil.sections.detected.includes('SKILLS'), 'Filipino skills alias recognized');
  assert(assessmentFil.fields.degree.includes('Information Technology'), 'Extracted degree from alternate format');
  assert(assessmentFil.extractionQuality.score >= 80, 'High extraction quality score for alternate aliases');

  // ── Test 5: Missing Contact Info & Incomplete Work History ─────────────────
  console.log('\n[Test 5] Missing Contact Info & Incomplete Work History Detection');
  const incompleteResumeText = `
ANONYMOUS APPLICANT
Software Developer

WORK EXPERIENCE
Software Developer at SomeCorp
Worked on various software features and bug fixes.
`.trim();

  const assessmentIncomplete = assessResumeQuality({
    rawText: incompleteResumeText,
    details: {
      email: null,
      phone: null,
      hasContact: false,
      hasExperienceSection: true,
      hasEducationSection: false,
      degree: null,
      yearsOfExperience: 0
    },
    skills: ['Software Developer']
  });

  assert(assessmentIncomplete.sections.missing.includes('EDUCATION'), 'Identifies missing education');
  assert(assessmentIncomplete.feedback.issues.some(i => i.code === 'MISSING_CONTACT'),
    'Flags missing contact information as an issue');
  assert(assessmentIncomplete.templateSuggestion.recommended === true,
    'Recommends template when contact and education are missing');

  // ── Test 6: Skill Grounding & False-Positive Prevention ───────────────────
  console.log('\n[Test 6] Skill Traceability & False-Positive Prevention');
  const focusedSkillText = `
DEVON VANCE
Full Stack Engineer | devon@example.com | +1 555 123 4567

EXPERIENCE
Developer working exclusively with Python, Django, and PostgreSQL.
`.trim();

  const candidateSkillsInput = ['Python', 'Django', 'PostgreSQL', 'Kubernetes', 'Rust', 'Ruby'];
  const assessmentTrace = assessResumeQuality({
    rawText: focusedSkillText,
    details: { email: 'devon@example.com', phone: '+1 555 123 4567', hasContact: true, hasExperienceSection: true },
    skills: candidateSkillsInput
  });

  assert(assessmentTrace.skillTraceability.verified.includes('Python'), 'Python verified in text');
  assert(assessmentTrace.skillTraceability.verified.includes('PostgreSQL'), 'PostgreSQL verified in text');
  assert(assessmentTrace.skillTraceability.unverified.includes('Kubernetes'), 'Kubernetes correctly identified as unverified');
  assert(assessmentTrace.skillTraceability.unverified.includes('Rust'), 'Rust correctly identified as unverified');
  assert(assessmentTrace.skillTraceability.fidelityRatio < 1.0, 'Fidelity ratio reflects ungrounded skills');

  // ── Test 7: Empty, Text-Poor, and Malformed Documents ──────────────────────
  console.log('\n[Test 7] Empty, Text-Poor, and Malformed Documents');

  // Empty Document
  const assessmentEmpty = assessResumeQuality({ rawText: '' });
  assert(assessmentEmpty.extractionQuality.isUnreadable === true, 'Empty text flagged as isUnreadable');
  assert(assessmentEmpty.extractionQuality.score === 0, 'Empty document receives 0 extraction score');
  assert(assessmentEmpty.templateSuggestion.recommended === true, 'Template recommended for empty text');
  assert(assessmentEmpty.feedback.issues.some(i => i.code === 'EMPTY_TEXT'), 'Generated critical EMPTY_TEXT issue');

  // Text-poor document (< 25 words)
  const textPoorResume = 'John Doe. Software Engineer. Call me at 555-0100.';
  const assessmentPoor = assessResumeQuality({ rawText: textPoorResume });
  assert(assessmentPoor.extractionQuality.isTextPoor === true, 'Short snippet flagged as isTextPoor');
  assert(assessmentPoor.extractionQuality.score <= 30, 'Text poor document receives low extraction score');
  assert(assessmentPoor.templateSuggestion.recommended === true, 'Template recommended for text-poor document');

  // Malformed document with high non-printable byte density
  const garbledText = 'R\x00e\x00s\x00u\x00m\x00e\x00 \x01\x02\x03\x04\x05\x06\x07\x08\x0e\x0f\x10\x11\x12\x13\x14';
  const assessmentGarbled = assessResumeQuality({ rawText: garbledText });
  assert(assessmentGarbled.feedback.issues.some(i => i.code === 'ENCODING_ARTIFACTS') || assessmentGarbled.extractionQuality.isTextPoor,
    'Encoding artifacts detected on garbled text');

  // ── Test 8: Compressed (DEFLATE) vs Uncompressed (STORE) DOCX Parity ──────
  console.log('\n[Test 8] Compressed (DEFLATE) vs Uncompressed (STORE) DOCX Extraction Parity');

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>ELENA ROXAS</w:t></w:r></w:p>
    <w:p><w:r><w:t>elena.roxas@example.com | +63 919 777 8888 | linkedin.com/in/elenaroxas</w:t></w:r></w:p>
    <w:p><w:r><w:t>PROFESSIONAL SUMMARY</w:t></w:r></w:p>
    <w:p><w:r><w:t>Backend Engineer with 3 years of experience in Java, Spring Boot, and MySQL.</w:t></w:r></w:p>
    <w:p><w:r><w:t>CORE SKILLS</w:t></w:r></w:p>
    <w:p><w:r><w:t>Java, Spring Boot, MySQL, Docker, Git, REST API</w:t></w:r></w:p>
    <w:p><w:r><w:t>WORK EXPERIENCE</w:t></w:r></w:p>
    <w:p><w:r><w:t>Backend Developer | FinTech Manila | 2022 - Present</w:t></w:r></w:p>
    <w:p><w:r><w:t>EDUCATION</w:t></w:r></w:p>
    <w:p><w:r><w:t>Bachelor of Science in Computer Engineering</w:t></w:r></w:p>
  </w:body>
</w:document>`;

  function buildTestDocx(xml, method) {
    const contentBuf = Buffer.from(xml, 'utf8');
    const compressed = method === 8 ? zlib.deflateRawSync(contentBuf) : contentBuf;
    const fnBuf = Buffer.from('word/document.xml', 'utf8');

    const localHdr = Buffer.alloc(30 + fnBuf.length);
    localHdr.writeUInt32LE(0x04034b50, 0);
    localHdr.writeUInt16LE(20, 4);
    localHdr.writeUInt16LE(0, 6);
    localHdr.writeUInt16LE(method, 8);
    localHdr.writeUInt16LE(0, 10);
    localHdr.writeUInt16LE(0, 12);
    localHdr.writeUInt32LE(zlib.crc32(contentBuf), 14);
    localHdr.writeUInt32LE(compressed.length, 18);
    localHdr.writeUInt32LE(contentBuf.length, 22);
    localHdr.writeUInt16LE(fnBuf.length, 26);
    localHdr.writeUInt16LE(0, 28);
    fnBuf.copy(localHdr, 30);

    return Buffer.concat([localHdr, compressed]);
  }

  const uncompressedDocx = buildTestDocx(docXml, 0); // Method 0: STORE
  const compressedDocx = buildTestDocx(docXml, 8);   // Method 8: DEFLATE

  const fileStored = new File([uncompressedDocx], 'Resume_Stored.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });
  const fileDeflated = new File([compressedDocx], 'Resume_Deflated.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });

  const parsedStored = await parseResumeFile(fileStored);
  const parsedDeflated = await parseResumeFile(fileDeflated);

  assert(parsedStored.details.email === 'elena.roxas@example.com', 'Uncompressed docx extracted email');
  assert(parsedDeflated.details.email === 'elena.roxas@example.com', 'Deflated docx extracted email');
  assert(parsedStored.skills.includes('Java') && parsedDeflated.skills.includes('Java'), 'Both methods extracted Java skill');
  assert(parsedStored.details.hasExperienceSection === true && parsedDeflated.details.hasExperienceSection === true,
    'Both methods recognized Experience section');
  assert(parsedStored.details.hasEducationSection === true && parsedDeflated.details.hasEducationSection === true,
    'Both methods recognized Education section');

  console.log(`\n🎉 ALL ${passedTests}/${totalTests} RESUME QUALITY & EXTRACTION VALIDATION TESTS PASSED!`);
}

runTestSuite().catch((err) => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
