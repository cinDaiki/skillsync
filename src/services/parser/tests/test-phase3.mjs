/**
 * Phase 3 Skill Recognition — Validation Suite
 * =============================================
 * Tests the P08 context-aware skill recognition engine.
 *
 * Run:  node src/services/parser/tests/test-phase3.mjs
 *
 * 8 scenarios, target: ≥ 90% assertion pass rate.
 * Phase 3 gate: this AND phase-2 regression must both pass.
 */

import { fileURLToPath } from 'url'
import path              from 'path'
import fs                from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

import { analyzeLayout }  from '../pipeline/p02-layoutAnalyzer.js'
import { normalizeText }  from '../pipeline/p03-normalizer.js'
import { detectSections } from '../pipeline/p05-sectionDetector.js'
import { buildGraph }     from '../pipeline/p04-graphBuilder.js'
import { extractFields }  from '../pipeline/p06-fieldExtractor.js'
import { detectEntities } from '../pipeline/p07-entityDetector.js'
import { recognizeSkills } from '../pipeline/p08-skillRecognizer.js'

// ── Full pipeline runner ────────────────────────────────────────────────────
function runPipeline(rawText, fileType = 'txt') {
  let ctx = { rawText, fileType }
  ctx = analyzeLayout(ctx)
  ctx = normalizeText(ctx)
  ctx = detectSections(ctx)
  ctx = buildGraph(ctx)
  ctx = extractFields(ctx)
  ctx = detectEntities(ctx)
  ctx = recognizeSkills(ctx)
  return ctx
}

// ── Assertion helpers ───────────────────────────────────────────────────────
function assert(label, value, predicate, detail = '') {
  const pass = predicate(value)
  return { label, pass, actual: value, detail: pass ? '' : detail || `got: ${JSON.stringify(value)}` }
}

function hasSkill(skills, name) {
  const n = name.toLowerCase()
  return skills.some(s =>
    s.normalized?.toLowerCase() === n ||
    s.canonicalName?.toLowerCase() === n ||
    s.raw?.toLowerCase() === n
  )
}

function getSkill(skills, name) {
  const n = name.toLowerCase()
  return skills.find(s =>
    s.normalized?.toLowerCase() === n ||
    s.canonicalName?.toLowerCase() === n
  ) || null
}

// ── Test Scenarios ──────────────────────────────────────────────────────────

const SCENARIOS = [

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 1: Senior Software Engineer — multi-section deduplication
  // Skill "React" appears in skills section + experience + projects
  // → should be deduplicated to 1 canonical, occurrences ≥ 2, sources.length ≥ 2
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'multi-section-dedup',
    label: 'Multi-section deduplication (React in 3 sections)',
    text: `Maria Santos
maria@example.com | +63 917 111 2222
linkedin.com/in/mariasantos

PROFESSIONAL SUMMARY
Senior engineer with 8 years building React applications and Node.js backends.

WORK EXPERIENCE

Senior Frontend Engineer
CloudTech Inc
March 2020 - Present
- Built React dashboards for 50,000+ daily users
- Architected TypeScript + Node.js microservices
- Set up Docker and Kubernetes deployment pipeline

Frontend Developer
Innovate PH
January 2018 - February 2020
- Developed React and Vue.js components
- Integrated REST APIs using JavaScript and Axios

PROJECTS

E-Commerce Platform
- Full-stack app using React, Node.js, and PostgreSQL
- Deployed on AWS with Docker containers

SKILLS
React, TypeScript, Node.js, Docker, Kubernetes, PostgreSQL, AWS, JavaScript, Vue.js, Git

CERTIFICATIONS
AWS Certified Developer, Amazon Web Services, 2022
`,
    assertions: ctx => [
      assert('React is detected', getSkill(ctx.skills, 'React'), s => s !== null, 'React should be found'),
      assert('React occurrences ≥ 2', getSkill(ctx.skills, 'React')?.occurrences, n => n >= 2, 'React appears in multiple sections'),
      assert('React sources.length ≥ 2', getSkill(ctx.skills, 'React')?.sources?.length, n => n >= 2, 'React found in Skills + at least one other section'),
      assert('Node.js is detected', ctx.skills, s => hasSkill(s, 'Node.js'), 'Node.js should be found'),
      assert('Docker is detected', ctx.skills, s => hasSkill(s, 'Docker'), 'Docker should be found'),
      assert('TypeScript is detected', ctx.skills, s => hasSkill(s, 'TypeScript'), 'TypeScript should be found'),
      assert('Total unique skills ≥ 8', ctx.skills.length, n => n >= 8, `Only ${ctx.skills?.length} skills found`),
      assert('No duplicate canonical names', ctx.skills,
        s => new Set(s.map(x => x.normalized?.toLowerCase())).size === s.length,
        'Duplicate canonical names found'),
      assert('skillRecognition meta present', ctx.skillRecognition, m => !!m && m.blockCount > 0, 'skillRecognition meta missing'),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 2: Fresh Graduate — skills from projects + certifications only
  // No SKILLS section — skills must be inferred from other sections
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'fresh-grad-no-skills-section',
    label: 'Fresh graduate — skills from projects + certs only (no SKILLS section)',
    text: `JUAN DELA CRUZ
juan@gmail.com
09112345678

EDUCATION
Bachelor of Science in Information Technology
Polytechnic University of the Philippines
Graduated: June 2024
GWA: 1.50

PROJECTS

Student Information System
- Web application built with PHP and MySQL
- Used Bootstrap for the frontend UI
- Hosted on Apache server
- github.com/juandc/student-sys

Mobile Expense Tracker
- Android application built with Kotlin and Firebase
- REST API integration using Retrofit
- github.com/juandc/expense-tracker

CERTIFICATIONS
Google IT Support Professional Certificate - Coursera, 2024
Oracle Certified Associate, Java SE 8 Programmer - Oracle, 2023
`,
    assertions: ctx => [
      assert('PHP detected (from projects)', ctx.skills, s => hasSkill(s, 'PHP'), 'PHP should be detected from project description'),
      assert('MySQL detected (from projects)', ctx.skills, s => hasSkill(s, 'MySQL'), 'MySQL should be detected'),
      assert('Kotlin detected (from projects)', ctx.skills, s => hasSkill(s, 'Kotlin'), 'Kotlin should be detected'),
      assert('Firebase detected (from projects)', ctx.skills, s => hasSkill(s, 'Firebase'), 'Firebase should be detected'),
      assert('At least 3 skills found without SKILLS section', ctx.skills.length, n => n >= 3, `Only ${ctx.skills?.length} found`),
      assert('Projects have techStack populated', ctx.projects, p => p?.some(proj => proj.techStack?.length > 0), 'No project has techStack'),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 3: Government resume — non-standard sections
  // Skills buried in experience responsibilities
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'gov-resume-skills',
    label: 'Government resume — skills in non-standard experience entries',
    text: `PERSONAL DATA SHEET
Name: MENDOZA, ANNA MARIE P.
Position Applied: Information Systems Analyst II
Email: amendoza@dict.gov.ph
Contact No.: 0916-555-1234

EDUCATIONAL BACKGROUND
Degree: Master of Science in Information Technology
School: University of Santo Tomas
Year Graduated: 2016

Degree: Bachelor of Science in Computer Science
School: De La Salle University
Year Graduated: 2010

WORK EXPERIENCE
Position: Information Systems Analyst II (SG-16)
Office: Department of Information and Communications Technology
Inclusive Dates: January 2018 to Present
- Developed web applications using PHP and MySQL for internal government systems
- Maintained Linux servers and managed PostgreSQL databases
- Created data analytics dashboards using Python and Excel

Position: Computer Programmer I (SG-11)
Office: National Computer Center
Inclusive Dates: June 2011 to December 2017
- Developed desktop applications using Java and Oracle Database
- Maintained existing systems coded in C++ and Visual Basic

CIVIL SERVICE ELIGIBILITY
Career Service Professional - CSE, March 2010
`,
    assertions: ctx => [
      assert('PHP detected from experience', ctx.skills, s => hasSkill(s, 'PHP'), 'PHP should be detected from experience bullets'),
      assert('MySQL detected from experience', ctx.skills, s => hasSkill(s, 'MySQL'), 'MySQL should be detected'),
      assert('Python detected from experience', ctx.skills, s => hasSkill(s, 'Python'), 'Python should be detected'),
      assert('Java detected from experience', ctx.skills, s => hasSkill(s, 'Java'), 'Java should be detected'),
      assert('At least 4 skills found', ctx.skills.length, n => n >= 4, `Only ${ctx.skills?.length} found`),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 4: Healthcare / Nurse — clinical terminology
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'healthcare-nurse',
    label: 'Healthcare / Nurse — clinical skill terminology',
    text: `GRACE ANNE VILLANUEVA
grace.rn@gmail.com | +63 917 888 4321
PRC License No.: 0987654

WORK EXPERIENCE

Staff Nurse
St. Luke's Medical Center, BGC
June 2021 - Present
- Patient care and medication administration for 15+ patients per shift
- IV Therapy and wound care management
- Vital signs monitoring and triage assessment
- Electronic health records (EHR) documentation
- CPR and BLS certified responder

Clinic Nurse
FamilyFirst Medical Clinic
January 2019 - May 2021
- Phlebotomy and specimen collection
- Assisted in ACLS procedures
- Health teaching and patient education

EDUCATION
Bachelor of Science in Nursing
Our Lady of Fatima University
2019

CERTIFICATIONS
Basic Life Support (BLS) - Philippine Heart Association, 2023
Advanced Cardiac Life Support (ACLS) - Philippine Heart Association, 2022
`,
    assertions: ctx => [
      assert('Patient Care detected', ctx.skills, s => hasSkill(s, 'Patient Care'), 'Patient Care should be detected'),
      assert('IV Therapy detected', ctx.skills, s => hasSkill(s, 'IV Therapy'), 'IV Therapy should be detected'),
      assert('Phlebotomy detected', ctx.skills, s => hasSkill(s, 'Phlebotomy'), 'Phlebotomy should be detected'),
      assert('CPR or BLS detected', ctx.skills, s => hasSkill(s, 'CPR') || hasSkill(s, 'BLS'), 'CPR/BLS should be detected'),
      assert('At least 4 clinical skills found', ctx.skills.length, n => n >= 4, `Only ${ctx.skills?.length} found`),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 5: Typos — fuzzy matching
  // "Javascrit" → JavaScript, "Phython" → Python, "Kubernets" → Kubernetes
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'typos-fuzzy',
    label: 'Typos — fuzzy matching recovery',
    text: `Carlo Reyes
carlo@test.ph

SKILLS
Javascrit, Phython, Kubernets, Reactjs, Node JS, PostgresQL, Doker
`,
    assertions: ctx => [
      assert('JavaScript recovered from "Javascrit"', ctx.skills, s => hasSkill(s, 'JavaScript'), '"Javascrit" should fuzzy-match to JavaScript'),
      assert('Python recovered from "Phython"', ctx.skills, s => hasSkill(s, 'Python'), '"Phython" should fuzzy-match to Python'),
      assert('Kubernetes recovered from "Kubernets"', ctx.skills, s => hasSkill(s, 'Kubernetes'), '"Kubernets" should fuzzy-match to Kubernetes'),
      assert('React recovered from "Reactjs"', ctx.skills, s => hasSkill(s, 'React'), '"Reactjs" should be aliased to React'),
      assert('Node.js recovered from "Node JS"', ctx.skills, s => hasSkill(s, 'Node.js'), '"Node JS" should be aliased to Node.js'),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 6: Synonyms / aliases — canonical normalization
  // "ReactJS" → React, "k8s" → Kubernetes, "Node JS" → Node.js, "JS" → JavaScript
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'synonyms-aliases',
    label: 'Synonyms and aliases — canonical normalization',
    text: `Ana Reyes
ana@company.ph

SKILLS
ReactJS, k8s, Vue JS, ExpressJS, TypeScript, Golang, Postgres, JS
`,
    assertions: ctx => [
      assert('ReactJS → React', ctx.skills, s => hasSkill(s, 'React'), '"ReactJS" should normalize to "React"'),
      assert('k8s → Kubernetes', ctx.skills, s => hasSkill(s, 'Kubernetes'), '"k8s" should normalize to "Kubernetes"'),
      assert('ExpressJS → Express', ctx.skills, s => hasSkill(s, 'Express') || hasSkill(s, 'Express.js'), '"ExpressJS" should normalize to Express'),
      assert('Golang → Go', ctx.skills, s => hasSkill(s, 'Go') || hasSkill(s, 'Golang'), '"Golang" should map to Go'),
      assert('TypeScript detected', ctx.skills, s => hasSkill(s, 'TypeScript'), 'TypeScript should be found'),
      assert('No "ReactJS" as canonical (should be "React")', ctx.skills,
        s => !s.some(x => x.normalized?.toLowerCase() === 'reactjs'),
        '"ReactJS" should not appear as a canonical name'),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 7: Duplicates — same skill listed 5× → occurrences: 5, 1 canonical
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'deduplication',
    label: 'Deduplication — same skill 5× → single canonical, occurrences counted',
    text: `Ben Cruz
ben@example.com

SUMMARY
Expert JavaScript developer with 7 years of JavaScript experience.

SKILLS
JavaScript, JavaScript, JavaScript, Python, Node.js

WORK EXPERIENCE

Developer
AcmeCorp
2020 - Present
- Wrote JavaScript code for all frontend modules
- Maintained JavaScript codebase

PROJECTS
JS Dashboard
- Built entirely in JavaScript
`,
    assertions: ctx => [
      assert('JavaScript appears exactly once in skills array', ctx.skills,
        s => s.filter(x => x.normalized?.toLowerCase() === 'javascript').length === 1,
        'JavaScript deduplicated to exactly 1 entry'),
      assert('JavaScript occurrences ≥ 3', getSkill(ctx.skills, 'JavaScript')?.occurrences, n => n >= 3,
        'occurrences should count all mentions across sections'),
      assert('Python still detected', ctx.skills, s => hasSkill(s, 'Python'), 'Python should be found'),
      assert('Node.js still detected', ctx.skills, s => hasSkill(s, 'Node.js'), 'Node.js should be found'),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 8: Messy single-line — all skills comma-separated in one line
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'messy-single-line',
    label: 'Messy single-line — comma-separated skills blob',
    text: `Dana Cruz
dana@email.ph

SKILLS
HTML, CSS, JavaScript, React.js, Node.js, Express.js, MongoDB, MySQL, Git, Docker, AWS, Python, Django, REST API, GraphQL, TypeScript, Linux, Figma, Agile, Scrum

EDUCATION
Bachelor of Science in Computer Science
Mapua University
2022
`,
    assertions: ctx => [
      assert('HTML detected', ctx.skills, s => hasSkill(s, 'HTML'), 'HTML should be detected'),
      assert('React.js detected', ctx.skills, s => hasSkill(s, 'React'), 'React.js should be detected'),
      assert('MongoDB detected', ctx.skills, s => hasSkill(s, 'MongoDB'), 'MongoDB should be detected'),
      assert('GraphQL detected', ctx.skills, s => hasSkill(s, 'GraphQL'), 'GraphQL should be detected'),
      assert('Django detected', ctx.skills, s => hasSkill(s, 'Django'), 'Django should be detected'),
      assert('Figma detected', ctx.skills, s => hasSkill(s, 'Figma'), 'Figma should be detected'),
      assert('Agile detected', ctx.skills, s => hasSkill(s, 'Agile'), 'Agile should be detected'),
      assert('At least 15 skills from single comma-separated line', ctx.skills.length, n => n >= 15,
        `Only ${ctx.skills?.length} found from ${20} listed`),
    ],
  },

]

// ── Test runner ──────────────────────────────────────────────────────────────

const EXPECTED_DIR = path.join(__dirname, 'expected')
if (!fs.existsSync(EXPECTED_DIR)) fs.mkdirSync(EXPECTED_DIR, { recursive: true })

const SAVE_FLAG = process.argv.includes('--save-baseline')

let totalPassed = 0
let totalTests  = 0
let hasFailure  = false

const summaryRows = []

for (const scenario of SCENARIOS) {
  let ctx
  try {
    ctx = runPipeline(scenario.text)
  } catch (err) {
    console.error(`\n❌ RUNTIME ERROR for [${scenario.id}]: ${err.message}`)
    console.error(err.stack)
    hasFailure = true
    continue
  }

  const results = scenario.assertions(ctx)
  const passed  = results.filter(r => r.pass).length
  const total   = results.length
  const pct     = Math.round((passed / total) * 100)
  const status  = pct >= 80 ? '✅' : '❌'

  const bar = p => '[' + '█'.repeat(Math.round(p / 5)) + '░'.repeat(20 - Math.round(p / 5)) + `] ${p}%`

  console.log(`\n${'═'.repeat(65)}`)
  console.log(`Scenario: ${scenario.label}`)
  console.log(`Skills detected: ${ctx.skills?.length ?? 0} | Sources scanned: ${ctx.skillRecognition?.blockCount ?? '?'}`)
  console.log('─'.repeat(65))

  for (const r of results) {
    const icon = r.pass ? '  ✓' : '  ✗'
    console.log(`${icon} ${r.label}${r.detail ? `  → ${r.detail}` : ''}`)
  }

  console.log('─'.repeat(65))
  console.log(`  ${bar(pct)}  (${passed}/${total})`)

  if (pct < 80) hasFailure = true

  totalPassed += passed
  totalTests  += total

  summaryRows.push({ id: scenario.id.padEnd(36), pct, status })

  // Save baseline snapshot
  if (SAVE_FLAG) {
    const snap = { id: scenario.id, savedAt: new Date().toISOString(), pct, passed, total }
    fs.writeFileSync(path.join(EXPECTED_DIR, `p3-${scenario.id}.json`), JSON.stringify(snap, null, 2))
    console.log(`  💾 Baseline saved to expected/p3-${scenario.id}.json`)
  }
}

// ── Final summary ─────────────────────────────────────────────────────────────
const globalPct = totalTests === 0 ? 0 : Math.round((totalPassed / totalTests) * 100)

console.log(`\n${'═'.repeat(65)}`)
console.log('PHASE 3 SKILL RECOGNITION — VALIDATION SUMMARY')
console.log('─'.repeat(65))
summaryRows.forEach(r => console.log(`  ${r.status} ${r.id} ${r.pct}%`))
console.log('─'.repeat(65))
console.log(`  GLOBAL ACCURACY: ${globalPct}%  (${totalPassed}/${totalTests} assertions passed)`)

if (globalPct >= 90 && !hasFailure) {
  console.log(`\n  ✅ Phase 3 PASSED — skill recognition is production-ready`)
} else if (globalPct >= 80) {
  console.log(`\n  ⚠️  Phase 3 score ${globalPct}% is below 90% target — review failures above`)
} else {
  console.log(`\n  ❌ Phase 3 FAILED — critical issues must be fixed before proceeding`)
}
console.log('═'.repeat(65))
