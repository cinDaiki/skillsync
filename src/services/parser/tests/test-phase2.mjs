/**
 * Phase 2 Parser Validation Suite
 * ================================
 * A reusable, regression-preventing test harness for the SkillSync parser.
 *
 * Run:   node --experimental-vm-modules src/services/parser/tests/test-phase2.mjs
 * or:    node src/services/parser/tests/test-phase2.mjs  (Node ≥ 20 with --input-type=module)
 *
 * Outputs a per-resume accuracy report and an overall regression summary.
 */

import { createRequire }   from 'module'
import { fileURLToPath }   from 'url'
import path                from 'path'
import fs                  from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT      = path.resolve(__dirname, '../../../../')

// Pipeline stages (relative paths from this test file)
import { analyzeLayout }  from '../pipeline/p02-layoutAnalyzer.js'
import { normalizeText }  from '../pipeline/p03-normalizer.js'
import { detectSections } from '../pipeline/p05-sectionDetector.js'
import { buildGraph }     from '../pipeline/p04-graphBuilder.js'
import { extractFields }  from '../pipeline/p06-fieldExtractor.js'
import { detectEntities } from '../pipeline/p07-entityDetector.js'

// ── Pipeline runner (no bundler) ───────────────────────────────────────────────
function runPipeline(rawText, fileType = 'txt') {
  let ctx = { rawText, fileType }
  ctx = analyzeLayout(ctx)
  ctx = normalizeText(ctx)
  ctx = detectSections(ctx)
  ctx = buildGraph(ctx)
  ctx = extractFields(ctx)
  ctx = detectEntities(ctx)
  return ctx
}

// ── Expected output registry ───────────────────────────────────────────────────
// Each sample defines expected field values.
// Saved results serve as regression baselines.

const EXPECTED_DIR = path.join(__dirname, 'expected')
if (!fs.existsSync(EXPECTED_DIR)) fs.mkdirSync(EXPECTED_DIR, { recursive: true })

// ── Sample Resumes ─────────────────────────────────────────────────────────────

const SAMPLES = [

  // ───────────────────────────────────────────────────────
  // Sample 1: Software Developer — 2-page (your baseline)
  // ───────────────────────────────────────────────────────
  {
    id:       'rusty-uy-software-developer',
    label:    'Software Developer (2-page baseline)',
    fileType: 'txt',
    text: `Rusty Uy
rusty.uy@gmail.com | +63 917 888 0000
linkedin.com/in/rustyuy | github.com/rustyuy | https://rustyuy.dev

OBJECTIVE
Full-stack software developer with 4 years of professional experience building scalable
web applications. Passionate about clean code, modern architecture, and developer tooling.

WORK EXPERIENCE

Senior Full Stack Developer
TechCorp Philippines Inc.
June 2022 - Present
- Designed and built microservices architecture using Node.js and Docker
- Led migration from REST to GraphQL APIs, reducing response times by 35%
- Mentored 3 junior developers through pair programming and code reviews
- Implemented CI/CD pipelines using GitHub Actions and AWS CodePipeline

Full Stack Developer
Freelance
January 2021 - May 2022
- Developed 12+ client web applications using React.js and Laravel
- Integrated payment gateways including PayMaya and GCash APIs
- Maintained 99.9% uptime through proactive monitoring and alerting

Web Developer (OJT)
Accenture Philippines
June 2020 - December 2020
- Assisted in building internal HR portal using Angular and Spring Boot
- Wrote unit tests using JUnit and achieved 80%+ code coverage

EDUCATION

Bachelor of Science in Computer Science
De La Salle University Manila
June 2017 - March 2021
GPA: 3.75 / 4.0
Dean's List: 6 consecutive semesters

PROJECTS

SkillSync — AI Resume Parser & Job Matching Platform
- Full-stack platform connecting candidates with employers using AI-powered matching
- Tech: React.js, Node.js, Supabase, TensorFlow.js
- github.com/rustyuy/skillsync | https://skillsync.ph

Budget Tracker PWA
- Progressive web app for personal finance management
- Tech: Vue.js, Firebase, Chart.js
- https://budgetph.app

SKILLS
JavaScript, TypeScript, React.js, Vue.js, Node.js, Express.js, Laravel, PHP,
GraphQL, REST API, PostgreSQL, MongoDB, Redis, Docker, Kubernetes, AWS, CI/CD,
Git, GitHub, Linux, Agile, Scrum, TDD, Figma

CERTIFICATIONS
AWS Certified Developer - Associate, Amazon Web Services, 2023
Meta Front-End Developer Certificate, Coursera, 2022
`,
    expected: {
      contact: {
        name:      { contains: 'Rusty Uy' },
        email:     { equals: 'rusty.uy@gmail.com' },
        phone:     { exists: true },
        linkedin:  { contains: 'linkedin' },
        github:    { contains: 'github' },
        portfolio: { contains: 'rustyuy.dev' },
      },
      education: [
        {
          degree:      { contains: 'Computer Science' },
          institution: { contains: 'La Salle' },
          graduation:  { contains: '2021' },
          gpa:         { exists: true },
        },
      ],
      experience: [
        { title: { contains: 'Senior Full Stack Developer' }, isCurrent: true },
        { title: { contains: 'Full Stack Developer' },        isCurrent: false },
        { title: { contains: 'Web Developer' },               isCurrent: false },
      ],
      projects:   [{ name: { contains: 'SkillSync' } }, { name: { contains: 'Budget' } }],
      certifications: [{ name: { exists: true } }, { name: { exists: true } }],
      sections:   ['CONTACT', 'EXPERIENCE', 'EDUCATION', 'PROJECTS', 'SKILLS', 'CERTIFICATIONS'],
    },
  },

  // ───────────────────────────────────────────────────────
  // Sample 2: Fresh Graduate
  // ───────────────────────────────────────────────────────
  {
    id:       'fresh-graduate-it',
    label:    'Fresh Graduate (BS IT, no experience)',
    fileType: 'txt',
    text: `ANGELA MARIE REYES
angelareyes2024@gmail.com
09201234567
Cavite City, Cavite

EDUCATION
Bachelor of Science in Information Technology
Technological Institute of the Philippines
Graduated: June 2024
GWA: 1.45
Latin Honors: Cum Laude

SKILLS
HTML, CSS, JavaScript, React, Python, PHP, MySQL, Laravel, Figma, Git

PROJECTS
Campus Management System
- Web-based system for managing enrollment and grades
- Built with PHP, MySQL, Bootstrap
- github.com/angelareyes/campus-mgmt

E-Commerce Store
- Online store with cart and checkout functionality
- Built with React and Firebase
- https://angela-shop.netlify.app

CERTIFICATIONS
Google IT Support Professional Certificate - Coursera, 2024
Microsoft Technology Associate (MTA) - Microsoft, 2023
TESDA NC II in Computer Systems Servicing - 2022

EXTRACURRICULAR
President, Computer Science Society (2023 - 2024)
Volunteer, Code for the Philippines (2022)
`,
    expected: {
      contact: {
        name:  { contains: 'Angela' },
        email: { equals: 'angelareyes2024@gmail.com' },
        phone: { exists: true },
      },
      education: [
        {
          degree:      { contains: 'Information Technology' },
          institution: { contains: 'Technological Institute' },
          graduation:  { contains: '2024' },
          honors:      { contains: 'Cum Laude' },
        },
      ],
      experience:     [],
      projects:       [{ name: { exists: true } }, { name: { exists: true } }],
      certifications: [{ name: { exists: true } }, { name: { exists: true } }, { name: { exists: true } }],
      sections:       ['CONTACT', 'EDUCATION', 'SKILLS', 'PROJECTS', 'CERTIFICATIONS'],
    },
  },

  // ───────────────────────────────────────────────────────
  // Sample 3: Senior Software Engineer (executive style)
  // ───────────────────────────────────────────────────────
  {
    id:       'senior-software-engineer',
    label:    'Senior Software Engineer (10+ years)',
    fileType: 'txt',
    text: `PATRICK JOHN SANTOS
patricksantos@proton.me | +63 999 777 1234
linkedin.com/in/patricksantos | github.com/pjsantos

PROFESSIONAL PROFILE
Principal Software Engineer with 12 years of experience building distributed systems,
leading engineering teams, and delivering high-impact products for Fortune 500 companies.

EXPERIENCE

Principal Software Engineer
Grab Philippines
March 2019 - Present
- Architected the ride-matching engine serving 5M+ daily trips
- Led a team of 12 engineers across Manila, Jakarta, and Singapore
- Reduced infrastructure costs by $2M/year through cloud optimization

Senior Software Engineer
Globe Telecom
August 2015 - February 2019
- Built the GlobeOne app backend serving 8M active users
- Designed event-driven architecture using Apache Kafka and Redis
- Implemented OAuth 2.0 authentication and authorization system

Software Engineer
Sitel Philippines (now Synnex)
January 2012 - July 2015
- Developed enterprise CRM integrations using Salesforce API
- Created automated reporting pipeline saving 40 manual hours/week

EDUCATION
Master of Science in Computer Science
University of the Philippines Diliman
2014 - 2016

Bachelor of Science in Computer Engineering
Mapua University
2007 - 2011

SKILLS
Python, Go, Java, Kubernetes, Terraform, AWS, GCP, Kafka, Redis, PostgreSQL,
Microservices, System Design, CI/CD, Leadership, Agile, Docker

CERTIFICATIONS
Google Cloud Professional Architect, 2022
AWS Certified Solutions Architect - Professional, 2020
Certified Kubernetes Administrator (CKA), 2021
`,
    expected: {
      contact: {
        name:     { contains: 'Patrick' },
        email:    { equals: 'patricksantos@proton.me' },
        linkedin: { exists: true },
        github:   { exists: true },
      },
      education: [
        { degree: { contains: 'Computer Science' } },
        { degree: { contains: 'Computer Engineering' } },
      ],
      experience: [
        { title: { contains: 'Principal' }, isCurrent: true },
        { title: { contains: 'Senior' },    isCurrent: false },
        { title: { contains: 'Software' },  isCurrent: false },
      ],
      certifications: [{ name: { exists: true } }, { name: { exists: true } }, { name: { exists: true } }],
      sections:       ['CONTACT', 'EXPERIENCE', 'EDUCATION', 'SKILLS', 'CERTIFICATIONS'],
    },
  },

  // ───────────────────────────────────────────────────────
  // Sample 4: Two-Column / Canva-Style Resume (healthcare)
  // ───────────────────────────────────────────────────────
  {
    id:       'two-column-nurse',
    label:    'Two-Column Canva Style (Nurse)',
    fileType: 'txt',
    text: `ROSE ANNE GARCIA
REGISTERED NURSE

rosegarciarns@gmail.com      PRC License No. 123456
+63 917 222 3344             Quezon City, NCR
linkedin.com/in/rosegarcia

CORE SKILLS                  WORK HISTORY
Patient Care                 Staff Nurse
IV Therapy                   St. Luke's Medical Center
Wound Care                   March 2020 - Present
CPR / BLS                    - Monitors vital signs and
Vital Signs                    administers medications
Phlebotomy                   - Manages 12+ patients per shift
EHR / EMR
Triage                       Clinic Nurse
ACLS                         Family Wellness Clinic
                             June 2018 - February 2020
EDUCATION                    - Conducted health assessments
BS Nursing                   - Assisted in minor surgical
Our Lady of Fatima              procedures
University
2018

CERTIFICATIONS
BCLS - Philippine Heart Association, 2023
ACLS - Philippine Heart Association, 2022
`,
    expected: {
      contact: {
        name:  { contains: 'Rose' },
        email: { equals: 'rosegarciarns@gmail.com' },
        phone: { exists: true },
      },
      education: [
        { degree: { contains: 'Nursing' } },
      ],
      experience: [
        { title: { contains: 'Nurse' }, isCurrent: true },
      ],
      certifications: [{ name: { exists: true } }, { name: { exists: true } }],
    },
  },

  // ───────────────────────────────────────────────────────
  // Sample 5: Government-Style / Philippine Civil Service
  // ───────────────────────────────────────────────────────
  {
    id:       'gov-civil-service',
    label:    'Government / Civil Service Resume',
    fileType: 'txt',
    text: `PERSONAL DATA SHEET
Name: DELA TORRE, JOSE RIZAL M.
Position Applied: Administrative Officer IV
Date of Birth: January 15, 1985
Sex: Male
Email: jrdellatorre@deped.gov.ph
Contact No.: 0916-123-4567
Address: Taguig City, Metro Manila

EDUCATIONAL BACKGROUND
Degree: Master in Public Administration
School: Pamantasan ng Lungsod ng Maynila
Year Graduated: 2015

Degree: Bachelor of Science in Public Administration
School: University of the Philippines Manila
Year Graduated: 2007

WORK EXPERIENCE
Position: Education Program Specialist II (SG-16)
Office: DepEd Region IV-A
Inclusive Dates: March 2018 to Present
Monthly Salary: 40,208

Position: Administrative Officer III (SG-14)
Office: DepEd Division of Taguig
Inclusive Dates: June 2012 to February 2018

CIVIL SERVICE ELIGIBILITY
Career Service Professional - CSE, April 2008

TRAININGS & SEMINARS
Leadership and Management Development Training, 2022
Records Management Seminar, 2021
`,
    expected: {
      contact: {
        name:  { contains: 'Jose' },
        email: { equals: 'jrdellatorre@deped.gov.ph' },
        phone: { exists: true },
      },
      education: [
        { degree: { contains: 'Public Administration' } },
        { degree: { contains: 'Public Administration' } },
      ],
      experience: [
        { title: { contains: 'Specialist' }, isCurrent: true },
        { title: { contains: 'Administrative' }, isCurrent: false },
      ],
      certifications: [{ name: { exists: true } }, { name: { exists: true } }, { name: { exists: true } }],
    },
  },

]

// ── Assertion engine ──────────────────────────────────────────────────────────

function assertValue(actual, assertion, fieldPath) {
  if (!assertion) return { pass: true, detail: 'no assertion' }

  if (assertion.equals !== undefined) {
    const pass = actual === assertion.equals
    return { pass, detail: pass ? actual : `expected "${assertion.equals}", got "${actual}"` }
  }

  if (assertion.contains !== undefined) {
    const haystack = (actual || '').toString().toLowerCase()
    const needle   = assertion.contains.toLowerCase()
    const pass     = haystack.includes(needle)
    return { pass, detail: pass ? actual : `expected contains "${assertion.contains}", got "${actual}"` }
  }

  if (assertion.exists !== undefined) {
    const pass = assertion.exists ? !!actual : !actual
    return { pass, detail: pass ? actual : `expected ${assertion.exists ? 'to exist' : 'to be empty'}, got "${actual}"` }
  }

  return { pass: true, detail: 'unknown assertion type' }
}

// ── Per-category scoring ──────────────────────────────────────────────────────

function scoreCategory(name, tests) {
  const passed = tests.filter(t => t.pass).length
  const total  = tests.length
  const pct    = total === 0 ? 100 : Math.round((passed / total) * 100)
  return { name, passed, total, pct, tests }
}

// ── Report generation ─────────────────────────────────────────────────────────

function generateReport(sample, ctx, expected) {
  const report = {
    id:         sample.id,
    label:      sample.label,
    layout:     ctx.layoutType,
    language:   ctx.language,
    sections:   ctx.sectionOrder || [],
    categories: {},
    missing:    [],
    incorrect:  [],
    warnings:   [],
  }

  // ── Contact ──
  const contactTests = []
  const ec = expected.contact || {}

  const nameResult = assertValue(ctx.contact?.name?.normalized, ec.name, 'name')
  contactTests.push({ field: 'name', ...nameResult })
  if (!nameResult.pass) report.missing.push('Name')

  const emailResult = assertValue(ctx.contact?.email?.normalized, ec.email, 'email')
  contactTests.push({ field: 'email', ...emailResult })
  if (!emailResult.pass) report.missing.push('Email')

  const phoneResult = assertValue(ctx.contact?.phone?.normalized, ec.phone, 'phone')
  contactTests.push({ field: 'phone', ...phoneResult })
  if (!phoneResult.pass) report.missing.push('Phone')

  const liResult = assertValue(ctx.contact?.linkedin?.normalized, ec.linkedin, 'linkedin')
  if (ec.linkedin) { contactTests.push({ field: 'linkedin', ...liResult }); if (!liResult.pass) report.missing.push('LinkedIn') }

  const ghResult = assertValue(ctx.contact?.github?.normalized, ec.github, 'github')
  if (ec.github)   { contactTests.push({ field: 'github', ...ghResult }); if (!ghResult.pass) report.missing.push('GitHub') }

  const portResult = assertValue(ctx.contact?.portfolio?.normalized, ec.portfolio, 'portfolio')
  if (ec.portfolio) { contactTests.push({ field: 'portfolio', ...portResult }); if (!portResult.pass) report.missing.push('Portfolio URL') }

  report.categories.contact = scoreCategory('Contact', contactTests)

  // ── Education ──
  const eduTests = []
  const expectedEdu = expected.education || []

  expectedEdu.forEach((expEdu, i) => {
    const actual = ctx.education?.[i]
    if (!actual) {
      eduTests.push({ field: `education[${i}]`, pass: false, detail: 'entry not found' })
      report.missing.push(`Education entry ${i + 1}`)
      return
    }
    if (expEdu.degree)      { const r = assertValue(actual.degree?.raw,      expEdu.degree,      `edu[${i}].degree`);      eduTests.push({ field: `edu[${i}].degree`,      ...r }); if (!r.pass) report.incorrect.push(`Degree[${i}]: got "${actual.degree?.raw}"`) }
    if (expEdu.institution) { const r = assertValue(actual.institution?.raw, expEdu.institution, `edu[${i}].institution`); eduTests.push({ field: `edu[${i}].institution`, ...r }); if (!r.pass) report.missing.push(`Institution[${i}]`) }
    if (expEdu.graduation)  { const r = assertValue(actual.graduation?.raw,  expEdu.graduation,  `edu[${i}].graduation`);  eduTests.push({ field: `edu[${i}].graduation`,  ...r }); if (!r.pass) report.warnings.push(`Graduation year[${i}] confidence may be low`) }
    if (expEdu.gpa)         { const r = assertValue(actual.gpa?.raw,         expEdu.gpa,         `edu[${i}].gpa`);         eduTests.push({ field: `edu[${i}].gpa`,         ...r }); if (!r.pass) report.missing.push(`GPA[${i}]`) }
    if (expEdu.honors)      { const r = assertValue(actual.honors?.raw,      expEdu.honors,      `edu[${i}].honors`);      eduTests.push({ field: `edu[${i}].honors`,      ...r }); if (!r.pass) report.missing.push(`Honors[${i}]`) }
  })

  // Count check
  if (expected.education !== undefined) {
    const countResult = assertValue(ctx.education?.length, { equals: expectedEdu.length }, 'education.count')
    eduTests.push({ field: 'education.count', ...countResult })
  }

  report.categories.education = scoreCategory('Education', eduTests)

  // ── Experience ──
  const expTests = []
  const expectedExp = expected.experience || []

  if (expected.experience !== undefined) {
    const countR = assertValue(ctx.experience?.length, { equals: expectedExp.length }, 'experience.count')
    expTests.push({ field: 'experience.count', ...countR })
  }

  expectedExp.forEach((expE, i) => {
    const actual = ctx.experience?.[i]
    if (!actual) {
      expTests.push({ field: `exp[${i}]`, pass: false, detail: 'entry not found' })
      report.missing.push(`Experience entry ${i + 1}`)
      return
    }
    if (expE.title)     { const r = assertValue(actual.title?.raw,        expE.title,     `exp[${i}].title`);     expTests.push({ field: `exp[${i}].title`,     ...r }); if (!r.pass) report.incorrect.push(`Title[${i}]: got "${actual.title?.raw}"`) }
    if (expE.company)   { const r = assertValue(actual.company?.raw,      expE.company,   `exp[${i}].company`);   expTests.push({ field: `exp[${i}].company`,   ...r }) }
    if (expE.isCurrent !== undefined) {
      const r = assertValue(actual.isCurrent, { equals: expE.isCurrent }, `exp[${i}].isCurrent`)
      expTests.push({ field: `exp[${i}].isCurrent`, ...r })
    }
  })

  report.categories.experience = scoreCategory('Experience', expTests)

  // ── Projects ──
  const projTests = []
  const expectedProj = expected.projects || []

  if (expected.projects !== undefined) {
    projTests.push({ field: 'projects.count', ...assertValue(ctx.projects?.length, { equals: expectedProj.length }, 'projects.count') })
  }
  expectedProj.forEach((ep, i) => {
    const ap = ctx.projects?.[i]
    if (!ap) { projTests.push({ field: `proj[${i}]`, pass: false, detail: 'not found' }); return }
    if (ep.name) { const r = assertValue(ap.name?.raw, ep.name, `proj[${i}].name`); projTests.push({ field: `proj[${i}].name`, ...r }) }
  })

  report.categories.projects = scoreCategory('Projects', projTests)

  // ── Certifications ──
  const certTests = []
  const expectedCert = expected.certifications || []

  if (expected.certifications !== undefined) {
    certTests.push({ field: 'certs.count', ...assertValue(ctx.certifications?.length, { equals: expectedCert.length }, 'certs.count') })
  }
  expectedCert.forEach((ec2, i) => {
    const ac = ctx.certifications?.[i]
    if (!ac) { certTests.push({ field: `cert[${i}]`, pass: false, detail: 'not found' }); return }
    if (ec2.name) { const r = assertValue(ac.name?.raw, ec2.name, `cert[${i}].name`); certTests.push({ field: `cert[${i}].name`, ...r }) }
  })

  report.categories.certifications = scoreCategory('Certifications', certTests)

  // ── Section detection ──
  const secTests = []
  const expectedSec = expected.sections || []
  if (expectedSec.length > 0) {
    const detected  = new Set(ctx.sectionOrder || [])
    const found     = expectedSec.filter(s => detected.has(s))
    const notFound  = expectedSec.filter(s => !detected.has(s))
    secTests.push({ field: 'sections.detected', pass: found.length >= Math.ceil(expectedSec.length * 0.7), detail: `${found.length}/${expectedSec.length} detected` })
    if (notFound.length > 0) report.warnings.push(`Sections not detected: ${notFound.join(', ')}`)
  }

  report.categories.sections = scoreCategory('Section Detection', secTests)

  // ── Overall ──
  const allTests  = Object.values(report.categories).flatMap(c => c.tests)
  const allPassed = allTests.filter(t => t.pass).length
  const allTotal  = allTests.length
  report.overall  = { passed: allPassed, total: allTotal, pct: allTotal === 0 ? 100 : Math.round((allPassed / allTotal) * 100) }

  return report
}

// ── Output formatter ──────────────────────────────────────────────────────────

function printReport(report) {
  const bar = (pct) => {
    const filled = Math.round(pct / 5)
    return '[' + '█'.repeat(filled) + '░'.repeat(20 - filled) + `] ${pct}%`
  }

  console.log(`\n${'═'.repeat(65)}`)
  console.log(`Resume: ${report.label}`)
  console.log(`Layout: ${report.layout}  |  Language: ${report.language}`)
  console.log(`Sections Detected: ${report.sections.join(', ')}`)
  console.log('─'.repeat(65))

  const cats = [
    ['Contact Accuracy',        report.categories.contact],
    ['Education Accuracy',      report.categories.education],
    ['Experience Accuracy',     report.categories.experience],
    ['Project Accuracy',        report.categories.projects],
    ['Certification Accuracy',  report.categories.certifications],
    ['Section Detection',       report.categories.sections],
  ]

  for (const [label, cat] of cats) {
    if (cat.total === 0) continue
    console.log(`  ${label.padEnd(26)}: ${bar(cat.pct)}  (${cat.passed}/${cat.total})`)
  }

  console.log('─'.repeat(65))
  console.log(`  Overall Parsing Accuracy : ${bar(report.overall.pct)}  (${report.overall.passed}/${report.overall.total})`)

  if (report.missing.length > 0) {
    console.log(`\n  Missing Fields:`)
    report.missing.forEach(m => console.log(`    ✗ ${m}`))
  }

  if (report.incorrect.length > 0) {
    console.log(`\n  Incorrect Fields:`)
    report.incorrect.forEach(i => console.log(`    ✗ ${i}`))
  }

  if (report.warnings.length > 0) {
    console.log(`\n  Warnings:`)
    report.warnings.forEach(w => console.log(`    ⚠ ${w}`))
  }
}

// ── Regression baseline save/compare ─────────────────────────────────────────

function saveBaseline(report) {
  const file = path.join(EXPECTED_DIR, `${report.id}.json`)
  // Store flattened expected field values (not confidences — those change with parser tweaks)
  const snapshot = {
    id:        report.id,
    savedAt:   new Date().toISOString(),
    overall:   report.overall,
    categories: Object.fromEntries(
      Object.entries(report.categories).map(([k, v]) => [k, { pct: v.pct, passed: v.passed, total: v.total }])
    ),
  }
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2))
  return snapshot
}

function compareToBaseline(report) {
  const file = path.join(EXPECTED_DIR, `${report.id}.json`)
  if (!fs.existsSync(file)) return null

  const baseline = JSON.parse(fs.readFileSync(file, 'utf8'))
  const diffs    = []

  for (const [cat, cur] of Object.entries(report.categories)) {
    const base = baseline.categories?.[cat]
    if (!base) continue
    const delta = cur.pct - base.pct
    if (Math.abs(delta) >= 5) {
      diffs.push({ category: cat, baseline: base.pct, current: cur.pct, delta })
    }
  }

  return { baseline, diffs }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const SAVE_FLAG    = process.argv.includes('--save-baseline')
const IS_FIRST_RUN = !fs.existsSync(path.join(EXPECTED_DIR, `${SAMPLES[0].id}.json`))

const summaryRows = []
let totalPassed   = 0
let totalTests    = 0
let hasRegression = false

for (const sample of SAMPLES) {
  let ctx
  try {
    ctx = runPipeline(sample.text, sample.fileType)
  } catch (err) {
    console.error(`❌ RUNTIME ERROR for ${sample.id}: ${err.message}`)
    console.error(err.stack)
    hasRegression = true
    continue
  }

  const report = generateReport(sample, ctx, sample.expected)
  printReport(report)

  // Regression check
  const regResult = compareToBaseline(report)
  if (regResult && regResult.diffs.length > 0) {
    console.log(`\n  Regression vs Baseline:`)
    regResult.diffs.forEach(d => {
      const icon  = d.delta < 0 ? '🔻' : '🔺'
      const trend = d.delta < 0 ? 'REGRESSION' : 'IMPROVEMENT'
      console.log(`    ${icon} ${d.category}: ${d.baseline}% → ${d.current}% (${trend} ${Math.abs(d.delta)}%)`)
      if (d.delta < 0) hasRegression = true
    })
  } else if (!regResult) {
    console.log(`\n  ℹ️  No baseline yet. Run with --save-baseline to create one.`)
  }

  // Save baseline if requested or it's the first run
  if (SAVE_FLAG || IS_FIRST_RUN) {
    saveBaseline(report)
    console.log(`  💾 Baseline saved to expected/${report.id}.json`)
  }

  totalPassed += report.overall.passed
  totalTests  += report.overall.total
  summaryRows.push({
    id:      sample.id.padEnd(36),
    overall: report.overall.pct,
    status:  report.overall.pct >= 60 ? '✅' : '❌',
  })
}

// ── Final summary ─────────────────────────────────────────────────────────────
const globalPct = totalTests === 0 ? 0 : Math.round((totalPassed / totalTests) * 100)

console.log(`\n${'═'.repeat(65)}`)
console.log('PHASE 2 VALIDATION SUMMARY')
console.log('─'.repeat(65))
summaryRows.forEach(r => console.log(`  ${r.status} ${r.id} ${r.overall}%`))
console.log('─'.repeat(65))
console.log(`  GLOBAL ACCURACY: ${globalPct}%  (${totalPassed}/${totalTests} assertions passed)`)

if (hasRegression) {
  console.log(`\n  ❌ REGRESSIONS DETECTED — review before proceeding`)
} else if (globalPct >= 75) {
  console.log(`\n  ✅ Phase 2 PASSED — safe to proceed to Phase 3`)
} else {
  console.log(`\n  ⚠️  Phase 2 score is below threshold (75%) — fix issues before Phase 3`)
}

console.log('═'.repeat(65))
