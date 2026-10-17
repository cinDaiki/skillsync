/**
 * tests/resumeTemplateWorkflow.test.mjs
 *
 * SkillSync Phase 1: Downloadable Resume Template & Parser Compatibility Test Suite
 *
 * Verifies:
 * 1. Template assets exist in public/templates/ and have valid PKZIP headers.
 * 2. Parsing the completed sample resume (.docx) extracts contact, education,
 *    work experience, and recognized technical skills accurately.
 * 3. Blank template structure parses safely without hallucinating credentials.
 * 4. Deflated DOCX (standard Microsoft Word save format) parses via DecompressionStream.
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { parseResumeFile } from '../src/services/resumeParser.js';

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
  console.log('=== RUNNING RESUME TEMPLATE WORKFLOW & PARSER COMPATIBILITY TESTS ===\n');

  // ── Test 1: Template Assets Existence & Integrity ──────────────────────────
  console.log('[Test 1] Template Assets Existence & PKZIP Header Integrity');
  const templateDocxPath = path.join(TEMPLATES_DIR, 'SkillSync_ATS_Resume_Template.docx');
  const sampleDocxPath = path.join(TEMPLATES_DIR, 'SkillSync_Completed_Sample_Resume.docx');
  const guideTxtPath = path.join(TEMPLATES_DIR, 'SkillSync_Resume_Writing_Guide.txt');

  assert(fs.existsSync(templateDocxPath), 'Blank resume template .docx exists');
  assert(fs.existsSync(sampleDocxPath), 'Completed sample resume .docx exists');
  assert(fs.existsSync(guideTxtPath), 'Plain-text ATS writing guide exists');

  const templateBuf = fs.readFileSync(templateDocxPath);
  const sampleBuf = fs.readFileSync(sampleDocxPath);
  const guideText = fs.readFileSync(guideTxtPath, 'utf8');

  assert(templateBuf.length > 5000, `Template size (${templateBuf.length} bytes) is non-trivial`);
  assert(sampleBuf.length > 5000, `Sample resume size (${sampleBuf.length} bytes) is non-trivial`);
  assert(guideText.includes('SKILLSYNC ATS RESUME WRITING GUIDE'), 'Writing guide contains required heading');

  // Verify PKZIP Magic Bytes (0x50, 0x4B, 0x03, 0x04)
  assert(templateBuf[0] === 0x50 && templateBuf[1] === 0x4B && templateBuf[2] === 0x03 && templateBuf[3] === 0x04,
    'Template file has valid PKZIP header');
  assert(sampleBuf[0] === 0x50 && sampleBuf[1] === 0x4B && sampleBuf[2] === 0x03 && sampleBuf[3] === 0x04,
    'Sample file has valid PKZIP header');

  // ── Test 2: Parse Completed Fictional Sample Resume (.docx) ───────────────
  console.log('\n[Test 2] Parse Completed Fictional Sample Resume (.docx)');
  const sampleFile = new File([sampleBuf], 'SkillSync_Completed_Sample_Resume.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });

  const parsedSample = await parseResumeFile(sampleFile);

  assert(parsedSample.score >= 90, `Sample resume achieves high score (${parsedSample.score} >= 90)`);
  assert(parsedSample.completeness >= 90, `Sample resume achieves high completeness (${parsedSample.completeness} >= 90)`);

  // Contact Info
  assert(parsedSample.details.email === 'alex.rivera.dev@example.com',
    `Email extracted correctly: ${parsedSample.details.email}`);
  assert(parsedSample.details.phone && parsedSample.details.phone.includes('917 555 0192'),
    `Phone extracted correctly: ${parsedSample.details.phone}`);
  assert(parsedSample.details.linkedin && parsedSample.details.linkedin.includes('alexrivera-dev'),
    `LinkedIn extracted correctly: ${parsedSample.details.linkedin}`);
  assert(parsedSample.details.github && parsedSample.details.github.includes('alexrivera-dev'),
    `GitHub extracted correctly: ${parsedSample.details.github}`);

  // Sections
  assert(parsedSample.details.hasExperienceSection === true, 'Experience section recognized');
  assert(parsedSample.details.hasEducationSection === true, 'Education section recognized');
  assert(parsedSample.details.hasCertificationsSection === true, 'Certifications section recognized');
  assert(parsedSample.details.hasContact === true, 'Contact details recognized');
  assert(parsedSample.details.yearsOfExperience >= 5, `Years of experience detected (${parsedSample.details.yearsOfExperience} >= 5)`);

  // Skills
  const sampleSkills = parsedSample.skills.map(s => s.toLowerCase());
  const expectedSkills = ['react', 'node.js', 'typescript', 'python', 'postgresql', 'docker', 'aws', 'git', 'sql'];
  for (const expSkill of expectedSkills) {
    assert(sampleSkills.includes(expSkill), `Expected skill recognized: ${expSkill}`);
  }

  // ── Test 3: Blank Template Parsing Safety (No Invented Qualifications) ────
  console.log('\n[Test 3] Blank Template Safety (No Invented Qualifications)');
  const templateFile = new File([templateBuf], 'SkillSync_ATS_Resume_Template.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });

  const parsedTemplate = await parseResumeFile(templateFile);
  assert(parsedTemplate.details.hasExperienceSection === true, 'Blank template contains Experience section placeholder');
  assert(parsedTemplate.details.hasEducationSection === true, 'Blank template contains Education section placeholder');
  // Confirm email placeholder is not mistaken for a real person or active identity
  assert(parsedTemplate.details.email === 'your.email@example.com' || parsedTemplate.details.email === null,
    'Template placeholder email recognized safely');

  // ── Test 4: Deflated Word Document Parser Compatibility ──────────────────
  console.log('\n[Test 4] Deflated Word Document (Microsoft Word Native Save) Compatibility');
  // Build a test DOCX where word/document.xml is compressed using standard DEFLATE (method 8)
  const deflatedDocXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>MARIA SANTOS</w:t></w:r></w:p>
    <w:p><w:r><w:t>maria.santos@example.com | +63 918 111 2222 | linkedin.com/in/mariasantos</w:t></w:r></w:p>
    <w:p><w:r><w:t>PROFESSIONAL SUMMARY</w:t></w:r></w:p>
    <w:p><w:r><w:t>Software Engineer with 4 years of experience building applications in React, TypeScript, and Python.</w:t></w:r></w:p>
    <w:p><w:r><w:t>CORE SKILLS</w:t></w:r></w:p>
    <w:p><w:r><w:t>React, TypeScript, Python, PostgreSQL, Docker, AWS, Git</w:t></w:r></w:p>
    <w:p><w:r><w:t>WORK EXPERIENCE</w:t></w:r></w:p>
    <w:p><w:r><w:t>Software Engineer | TechPh Corp | 2021 - Present</w:t></w:r></w:p>
    <w:p><w:r><w:t>EDUCATION</w:t></w:r></w:p>
    <w:p><w:r><w:t>Bachelor of Science in Information Technology</w:t></w:r></w:p>
  </w:body>
</w:document>`;

  const deflatedBytes = zlib.deflateRawSync(Buffer.from(deflatedDocXml, 'utf8'));
  const fnBuf = Buffer.from('word/document.xml', 'utf8');
  const localHdr = Buffer.alloc(30 + fnBuf.length);
  localHdr.writeUInt32LE(0x04034b50, 0);
  localHdr.writeUInt16LE(20, 4);
  localHdr.writeUInt16LE(0, 6);
  localHdr.writeUInt16LE(8, 8); // Method 8: DEFLATE
  localHdr.writeUInt16LE(0, 10);
  localHdr.writeUInt16LE(0, 12);
  localHdr.writeUInt32LE(zlib.crc32(Buffer.from(deflatedDocXml, 'utf8')), 14);
  localHdr.writeUInt32LE(deflatedBytes.length, 18);
  localHdr.writeUInt32LE(Buffer.byteLength(deflatedDocXml, 'utf8'), 22);
  localHdr.writeUInt16LE(fnBuf.length, 26);
  localHdr.writeUInt16LE(0, 28);
  fnBuf.copy(localHdr, 30);

  const deflatedDocxBuffer = Buffer.concat([localHdr, deflatedBytes]);
  const deflatedFile = new File([deflatedDocxBuffer], 'Deflated_Resume.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });

  const parsedDeflated = await parseResumeFile(deflatedFile);
  assert(parsedDeflated.details.email === 'maria.santos@example.com',
    `Deflated docx extracted email: ${parsedDeflated.details.email}`);
  assert(parsedDeflated.details.hasExperienceSection === true, 'Deflated docx recognized experience section');
  assert(parsedDeflated.details.hasEducationSection === true, 'Deflated docx recognized education section');

  const deflatedSkills = parsedDeflated.skills.map(s => s.toLowerCase());
  assert(deflatedSkills.includes('react') && deflatedSkills.includes('typescript') && deflatedSkills.includes('python'),
    'Deflated docx recognized React, TypeScript, and Python skills');

  console.log(`\n🎉 ALL ${passedTests}/${totalTests} RESUME TEMPLATE & PARSER TESTS PASSED!`);
}

runTestSuite().catch((err) => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
