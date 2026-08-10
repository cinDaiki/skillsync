/**
 * src/services/parser/index.js
 *
 * Pipeline orchestrator — public entry point.
 *
 * Phase 3 pipeline:
 *   P02 Layout Analysis     ✅
 *   P03 Text Normalization  ✅
 *   P05 Section Detection   ✅
 *   P04 Document Graph      ✅
 *   P06 Field Extraction    ✅
 *   P07 Entity Detection    ✅
 *   P08 Skill Recognition   ✅  (Phase 3 — context-aware, per-section, source-weighted)
 *
 * Phases 4–6 will add:
 *   P12 ATS Scoring (separate engine)
 *   P13 Feedback Engine (separate engine)
 */

import { PARSER_VERSION, DICTIONARY_VERSION } from './VERSION.js'
import { DICTIONARY_STATS }                   from './skills/index.js'
import { validateEmail, validatePhone, validateLinkedIn, validateGitHub } from './utils/contactValidator.js'
import { EMAIL, PHONE, LINKEDIN, GITHUB }     from './utils/regexRegistry.js'
import { analyzeLayout }                      from './pipeline/p02-layoutAnalyzer.js'
import { normalizeText }                      from './pipeline/p03-normalizer.js'
import { detectSections }                     from './pipeline/p05-sectionDetector.js'
import { buildGraph }                         from './pipeline/p04-graphBuilder.js'
import { extractFields }                      from './pipeline/p06-fieldExtractor.js'
import { detectEntities }                     from './pipeline/p07-entityDetector.js'
import { recognizeSkills }                    from './pipeline/p08-skillRecognizer.js'
import { evaluateATS }                        from './ats/index.js'

// ── Lightweight contact fallback (used if field extractor finds nothing) ──────

function extractContactFallback(rawText) {
  EMAIL.lastIndex = PHONE.lastIndex = LINKEDIN.lastIndex = GITHUB.lastIndex = 0
  const emails    = rawText.match(EMAIL)    || []
  const phones    = rawText.match(PHONE)    || []
  const linkedins = rawText.match(LINKEDIN) || []
  const githubs   = rawText.match(GITHUB)   || []
  EMAIL.lastIndex = PHONE.lastIndex = LINKEDIN.lastIndex = GITHUB.lastIndex = 0

  const eV = validateEmail(emails[0] || null)
  const pV = validatePhone(phones[0] || null)
  const lV = validateLinkedIn(linkedins[0] || null)
  const gV = validateGitHub(githubs[0]   || null)

  const f = (raw, val, conf, reason) => ({ raw, normalized: val, confidence: conf, method: 'regex', reason })

  return {
    name:      { raw: null, normalized: null, confidence: 0, method: null, reason: 'Name not detected (fallback mode)' },
    email:     eV.valid ? f(emails[0], emails[0], 0.95, 'Email regex match') : { raw: null, normalized: null, confidence: 0, reason: eV.reason },
    phone:     pV.valid ? f(phones[0], pV.normalized, 0.93, 'Phone regex match') : { raw: null, normalized: null, confidence: 0, reason: pV.reason },
    linkedin:  lV.valid ? f(linkedins[0], lV.normalized, 0.99, 'LinkedIn URL') : { raw: null, normalized: null, confidence: 0, reason: lV.reason },
    github:    gV.valid ? f(githubs[0], gV.normalized, 0.99, 'GitHub URL') : { raw: null, normalized: null, confidence: 0, reason: gV.reason },
    portfolio: { raw: null, normalized: null, confidence: 0, reason: 'No portfolio URL (fallback)' },
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run the full parsing pipeline on extracted text.
 *
 * @param {{
 *   rawText:  string,
 *   fileType: string,
 *   includeAts?: boolean,
 *   jobRequirements?: object
 * }} input
 * @returns {Promise<object>} Structured resume output
 */
export async function runPipeline({ rawText, fileType, includeAts = false, jobRequirements = null }) {
  const t0 = Date.now()

  if (!rawText || rawText.trim().length === 0) {
    return {
      meta: {
        parserVersion:     PARSER_VERSION,
        dictionaryVersion: DICTIONARY_VERSION,
        parseTimestamp:    new Date().toISOString(),
        parseTimeMs:       0,
        language:          'EN',
        layout:            'UNKNOWN',
        skillRecognition:  { version: '3.0.0', blockCount: 0, rawHitCount: 0, uniqueSkills: 0 },
      },
      contact:        extractContactFallback(''),
      education:      [],
      experience:     [],
      projects:       [],
      certifications: [],
      skills:         [],
      summary:        null,
      totalExpYears:  0,
      _rawText:       rawText,
    }
  }

  // Chain pipeline stages with high-res performance timers
  const perfStart = performance.now();
  let ctx = { rawText, fileType };
  
  const tP02 = performance.now();
  ctx = analyzeLayout(ctx);    // P02 — layout + language detection
  const dP02 = performance.now() - tP02;

  const tP03 = performance.now();
  ctx = normalizeText(ctx);    // P03 — text cleaning
  const dP03 = performance.now() - tP03;

  const tP05 = performance.now();
  ctx = detectSections(ctx);   // P05 — section boundaries
  const dP05 = performance.now() - tP05;

  const tP04 = performance.now();
  ctx = buildGraph(ctx);       // P04 — document structure graph
  const dP04 = performance.now() - tP04;

  const tP06 = performance.now();
  ctx = extractFields(ctx);    // P06 — contact, education, experience, projects
  const dP06 = performance.now() - tP06;

  const tP07 = performance.now();
  ctx = detectEntities(ctx);   // P07 — name detection
  const dP07 = performance.now() - tP07;

  const tP08 = performance.now();
  ctx = recognizeSkills(ctx);  // P08 — context-aware skill recognition (Phase 3)
  const dP08 = performance.now() - tP08;

  // Use pipeline contact if found, otherwise fallback regex
  const hasContact = ctx.contact?.email?.normalized || ctx.contact?.phone?.normalized;
  const contact    = hasContact ? ctx.contact : extractContactFallback(rawText);

  const meta = {
    parserVersion:     PARSER_VERSION,
    dictionaryVersion: DICTIONARY_VERSION,
    parseTimestamp:    new Date().toISOString(),
    language:          ctx.language    || 'EN',
    layout:            ctx.layoutType  || 'UNKNOWN',
    parseTimeMs:       Math.round(performance.now() - perfStart),
    sectionOrder:      ctx.sectionOrder || [],
    dictionaryStats:   DICTIONARY_STATS,
    skillRecognition:  ctx.skillRecognition || {},
  };

  const result = {
    meta,
    contact,
    summary:        ctx.summary        || null,
    education:      ctx.education      || [],
    experience:     ctx.experience     || [],
    projects:       ctx.projects       || [],
    certifications: ctx.certifications || [],
    skills:         ctx.skills         || [],
    totalExpYears:  ctx.totalExpYears  || 0,
    _rawText:       rawText,
    _fileType:      fileType,
  };

  let dAts = 0;
  if (includeAts) {
    const tAts = performance.now();
    result.ats = evaluateATS(result, { jobRequirements });
    dAts = performance.now() - tAts;
  }

  const dTotal = performance.now() - perfStart;
  console.log(`[Perf-Pipeline] Pipeline breakdown:
    - P02 Layout Analysis: ${dP02.toFixed(2)}ms
    - P03 Text Normalization: ${dP03.toFixed(2)}ms
    - P05 Section Detection: ${dP05.toFixed(2)}ms
    - P04 Document Graph: ${dP04.toFixed(2)}ms
    - P06 Field Extraction: ${dP06.toFixed(2)}ms
    - P07 Entity Detection: ${dP07.toFixed(2)}ms
    - P08 Skill Recognition: ${dP08.toFixed(2)}ms
    - Phase 4 ATS Evaluation: ${dAts.toFixed(2)}ms
    - runPipeline() Total: ${dTotal.toFixed(2)}ms`);

  return result;
}
