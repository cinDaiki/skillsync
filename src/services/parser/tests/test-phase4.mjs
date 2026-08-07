/**
 * Phase 4 ATS Scoring Engine — Validation Suite
 * =============================================
 * Tests the P12 & P13 ATS scoring and feedback modules.
 *
 * Run: node src/services/parser/tests/test-phase4.mjs
 */

import { fileURLToPath } from 'url'
import path              from 'path'
import { runPipeline }   from '../index.js'
import fs                from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── Assertion helpers ───────────────────────────────────────────────────────
function assert(label, value, predicate, detail = '') {
  const pass = predicate(value)
  return { label, pass, actual: value, detail: pass ? '' : detail || `got: ${JSON.stringify(value)}` }
}

const SCENARIOS = [
  // ── 1. Perfect Resume ───────────────────────────────────────────────────────
  {
    id: 'ats-perfect',
    label: 'Perfect ATS Resume (Complete, Quantified, Optimal Length)',
    text: `JOHN DOE
john@example.com | +1 (123) 456-7890 | linkedin.com/in/johndoe

SUMMARY
A highly motivated and results-driven software engineer with 5 years of experience building scalable web applications. Passionate about cloud architecture and optimizing performance. I have successfully delivered multiple critical systems. ` + 'word '.repeat(200) + `

EXPERIENCE
Senior Developer
Tech Corp
2020 - Present
- Led a team of 5 engineers to deliver the product 2 months early
- Improved database query performance by 45% using Redis caching
- Increased revenue by $2 million through a new checkout flow
- Developed 10+ microservices in Node.js

EDUCATION
Bachelor of Science in Computer Science
University of Technology
2015 - 2019

SKILLS
JavaScript, TypeScript, React, Node.js, AWS, Kubernetes, PostgreSQL
`,
    assertions: (ctx) => {
      const ats = ctx.ats;
      return [
        assert('ATS object exists', ats, a => !!a, 'ATS object missing'),
        assert('High final score (>85)', ats.score, s => s > 85, `Score was ${ats?.score}`),
        assert('Grade is A or B', ats.grade.letter, l => ['A', 'B'].includes(l), `Grade was ${ats?.grade?.letter}`),
        assert('All completeness rules passed', ats.ruleResults, r => {
          const completeness = r.filter(x => x.category === 'completeness');
          return completeness.every(c => c.passed);
        }),
        assert('Quantified metrics passed', ats.ruleResults.find(r => r.id === 'quantified_metrics'), r => r.passed),
        assert('Action verbs passed', ats.ruleResults.find(r => r.id === 'action_verbs'), r => r.passed),
      ];
    }
  },

  // ── 2. Missing Contact & Summary (Edge Case) ─────────────────────────────────
  {
    id: 'ats-missing-basics',
    label: 'Missing Contact Info & Summary',
    text: `My Resume

EXPERIENCE
Developer
- I worked on the main website
- I helped fix bugs
- My duties included writing tests

SKILLS
HTML, CSS
`,
    assertions: (ctx) => {
      const ats = ctx.ats;
      return [
        assert('Low final score (<60)', ats.score, s => s < 60, `Score was ${ats?.score}`),
        assert('Email rule failed', ats.ruleResults.find(r => r.id === 'contact_email'), r => !r.passed),
        assert('Summary rule failed', ats.ruleResults.find(r => r.id === 'summary_presence'), r => !r.passed),
        assert('Action verbs failed', ats.ruleResults.find(r => r.id === 'action_verbs'), r => !r.passed),
        assert('Has critical feedback', ats.feedback.critical, f => f.length > 0),
      ];
    }
  },

  // ── 3. OCR Noise & Duplicated Sections ──────────────────────────────────────
  {
    id: 'ats-ocr-duplicates',
    label: 'OCR Noise and Duplicated Sections',
    text: `Jane Smith | jane@example.com
*&^%&*^$ OCR NOISE %&^%&^

EXPERIENCE
Manager
- Handled accounts

EXPERIENCE
Manager
- Handled accounts (Duplicate)

SKILLS
Management, Leadership, Excel, Word, PowerPoint

SKILLS
Management, Leadership (Duplicate)
` + 'word '.repeat(300), // bump length to pass optimal_length
    assertions: (ctx) => {
      const ats = ctx.ats;
      return [
        assert('Length rule passes despite noise', ats.ruleResults.find(r => r.id === 'optimal_length'), r => r.passed),
        assert('Quantified metrics failed (0%)', ats.ruleResults.find(r => r.id === 'quantified_metrics'), r => !r.passed),
        // Ensures the parser still survived and produced an ATS score
        assert('Valid score generated', ats.score, s => s >= 0 && s <= 100),
      ];
    }
  }
];

async function runTests() {
  console.log(`\n${'═'.repeat(65)}`)
  console.log('PHASE 4 ATS SCORING — VALIDATION SUITE')
  console.log('─'.repeat(65))

  let totalPassed = 0
  let totalAssertions = 0
  let hasFailure = false

  for (const scenario of SCENARIOS) {
    let ctx;
    try {
      ctx = await runPipeline({ rawText: scenario.text, fileType: 'txt', includeAts: true })
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

    console.log(`\nScenario: ${scenario.label}`)
    console.log(`Score: ${ctx.ats?.score} | Grade: ${ctx.ats?.grade?.letter}`)
    console.log('─'.repeat(65))

    for (const r of results) {
      const icon = r.pass ? '  ✓' : '  ✗'
      console.log(`${icon} ${r.label}${r.detail ? `  → ${r.detail}` : ''}`)
    }

    totalPassed += passed
    totalAssertions += total
    if (pct < 100) hasFailure = true
  }

  const globalPct = Math.round((totalPassed / totalAssertions) * 100)
  
  console.log(`\n${'═'.repeat(65)}`)
  console.log(`  GLOBAL ATS ACCURACY: ${globalPct}%  (${totalPassed}/${totalAssertions} assertions passed)`)
  
  if (globalPct === 100 && !hasFailure) {
    console.log(`\n  ✅ Phase 4 PASSED — ATS Scoring Engine is robust`)
  } else {
    console.log(`\n  ❌ Phase 4 FAILED — Please fix failing assertions`)
    process.exit(1)
  }
  console.log('═'.repeat(65))
}

runTests();
