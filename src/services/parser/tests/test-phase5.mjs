/**
 * Phase 5 Semantic Integration — Validation Suite
 * ===============================================
 * Tests the confidence-weighted scoring, embedding text builders,
 * and backward compatibility layers.
 *
 * Run: node src/services/parser/tests/test-phase5.mjs
 */

import './setup.js';
import { parseSkills, getRuleBasedSkillScore } from '../../ai/semanticMatchingService.js';
import { parseAndNormalizeSkills, calculateMatch } from '../../matchingEngine.js';
import { EmbeddingProvider } from '../../ai/embeddingProvider.js';
import { SEMANTIC_MATCHING_CONFIG } from '../../ai/semanticMatchingConfig.js';

function assert(label, value, predicate, detail = '') {
  const pass = predicate(value);
  return { label, pass, actual: value, detail: pass ? '' : detail || `got: ${JSON.stringify(value)}` };
}

const TESTS = [
  // ── 1. Embedding Provider Abstraction ───────────────────────────────────────
  {
    name: 'Embedding Text Builder (Rich Skills vs Flat Skills)',
    run: () => {
      const mockResumeRich = {
        details: { degree: 'BSCS', course: 'Computer Science', yearsOfExperience: 3 },
        skills: ['React', 'Node.js'],
        parsed: {
          skills: [
            { canonicalName: 'React', category: 'Frontend', occurrences: 3, confidenceScore: 95 },
            { canonicalName: 'Node.js', category: 'Backend', occurrences: 1, confidenceScore: 80 }
          ]
        }
      };

      const richText = EmbeddingProvider.buildResumeText(mockResumeRich);
      
      const assertions = [
        assert('Contains rich React category', richText, t => t.includes('React (Frontend skill, 3 occurrence(s))')),
        assert('Contains rich Node.js occurrences', richText, t => t.includes('Node.js (Backend skill, 1 occurrence(s))')),
        assert('Does NOT contain ATS scores', richText, t => !t.includes('ats') && !t.includes('score')),
      ];

      return assertions;
    }
  },

  // ── 2. Backward Compatibility (Legacy flat strings vs Rich objects) ──────────
  {
    name: 'Backward Compatibility and Parsing Layer',
    run: () => {
      const flatSkillsJson = JSON.stringify(['React', 'Node.js']);
      const richSkillsJson = JSON.stringify([
        { canonicalName: 'React', confidenceScore: 90 },
        { normalized: 'Node.js', confidenceScore: 80 }
      ]);

      const parsedFlat = parseSkills(flatSkillsJson);
      const parsedRich = parseSkills(richSkillsJson);

      const parsedEngineFlat = parseAndNormalizeSkills(flatSkillsJson);
      const parsedEngineRich = parseAndNormalizeSkills(richSkillsJson);

      return [
        assert('parseSkills handles flat array', parsedFlat, arr => arr.includes('react') && arr.includes('nodejs')),
        assert('parseSkills handles rich array', parsedRich, arr => arr.includes('react') && arr.includes('nodejs')),
        assert('parseAndNormalizeSkills handles flat array', parsedEngineFlat, arr => arr.includes('react') && arr.includes('nodejs')),
        assert('parseAndNormalizeSkills handles rich array', parsedEngineRich, arr => arr.includes('react') && arr.includes('nodejs')),
      ];
    }
  },

  // ── 3. Confidence-Weighted Skill Scoring ─────────────────────────────────────
  {
    name: 'Confidence-Weighted Skill Scoring (Configurable Policy)',
    run: () => {
      const jobSkills = ['React', 'Node.js'];
      
      // Candidate 1: High confidence matched skills (1.0 weight)
      const highConfSkills = [
        { canonicalName: 'React', confidenceScore: 100 },
        { canonicalName: 'Node.js', confidenceScore: 100 }
      ];

      // Candidate 2: Low confidence matched skills (scales to minimumConfidenceWeight = 0.5)
      const lowConfSkills = [
        { canonicalName: 'React', confidenceScore: 0 },
        { canonicalName: 'Node.js', confidenceScore: 0 }
      ];

      // Retrieve config
      const config = SEMANTIC_MATCHING_CONFIG;

      const scoreHigh = getRuleBasedSkillScore(highConfSkills, jobSkills, config);
      const scoreLow = getRuleBasedSkillScore(lowConfSkills, jobSkills, config);

      return [
        assert('High confidence candidate scores 100%', scoreHigh.pct, p => p === 100),
        assert('Low confidence candidate scores 50% (min weight)', scoreLow.pct, p => p === 50, `Expected 50%, got: ${scoreLow.pct}`),
        assert('High confidence matched elements list correct', scoreHigh.matched, m => m.length === 2),
      ];
    }
  },

  // ── 4. Decoupled Ranking Scoring ─────────────────────────────────────────────
  {
    name: 'Decoupled Ranking Integration',
    run: () => {
      // Setup a mock candidate profile and job post
      const candidateProfile = {
        skills: JSON.stringify([
          { canonicalName: 'React', confidenceScore: 90 },
          { canonicalName: 'Node.js', confidenceScore: 80 }
        ]),
        course: 'Computer Science',
        degree: 'BSCS',
        years_experience: 5
      };

      const job = {
        required_skills: JSON.stringify(['React', 'Node.js', 'Python']),
        required_education: 'BSCS',
        experience_required: '3 years'
      };

      const matchResult = calculateMatch(candidateProfile, job);

      return [
        assert('Confidence-weighted match calculated in legacy engine', matchResult.skills_score, s => s > 0 && s < 100),
        assert('Cert bonus calculated', matchResult.cert_bonus, b => b === 0),
        assert('Experience score correct (100% since 5 >= 3)', matchResult.experience_score, e => e === 100),
      ];
    }
  }
];

function runAll() {
  console.log(`\n${'═'.repeat(65)}`);
  console.log('PHASE 5 SEMANTIC INTEGRATION — VALIDATION SUITE');
  console.log('─'.repeat(65));

  let totalPassed = 0;
  let totalAssertions = 0;
  let hasFailure = false;

  for (const t of TESTS) {
    console.log(`\nTest Case: ${t.name}`);
    console.log('─'.repeat(65));
    
    let assertions = [];
    try {
      assertions = t.run();
    } catch (e) {
      console.error(`❌ RUNTIME ERROR: ${e.message}`);
      console.error(e.stack);
      hasFailure = true;
      continue;
    }

    for (const r of assertions) {
      const icon = r.pass ? '  ✓' : '  ✗';
      console.log(`${icon} ${r.label}${r.detail ? `  → ${r.detail}` : ''}`);
      if (r.pass) totalPassed++;
      else hasFailure = true;
      totalAssertions++;
    }
  }

  const globalPct = totalAssertions > 0 ? Math.round((totalPassed / totalAssertions) * 100) : 0;

  console.log(`\n${'═'.repeat(65)}`);
  console.log(`  GLOBAL PHASE 5 ACCURACY: ${globalPct}%  (${totalPassed}/${totalAssertions} assertions passed)`);

  if (globalPct === 100 && !hasFailure) {
    console.log(`\n  ✅ Phase 5 PASSED — Semantic & Hybrid matching layers are fully validated`);
  } else {
    console.log(`\n  ❌ Phase 5 FAILED — Some assertions failed`);
    process.exit(1);
  }
  console.log('═'.repeat(65));
}

runAll();
