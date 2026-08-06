/**
 * src/services/parser/index.js
 *
 * Pipeline orchestrator — public entry point.
 *
 * Phase 2 pipeline:
 *   P02 Layout Analysis     ✅
 *   P03 Text Normalization  ✅
 *   P05 Section Detection   ✅
 *   P04 Document Graph      ✅
 *   P06 Field Extraction    ✅
 *   P07 Entity Detection    ✅
 *   P08 Skill Recognition   ✅  (from Phase 1, unchanged)
 *
 * Phases 3–6 will add:
 *   P09 Value Normalization
 *   P10 Confidence Fusion
 *   P12 ATS Scoring (separate engine)
 *   P13 Feedback Engine (separate engine)
 */

import { PARSER_VERSION, DICTIONARY_VERSION }  from './VERSION.js'
import { SKILL_MAP, ALL_SKILLS, DICTIONARY_STATS } from './skills/index.js'
import { fuzzyMatch }                           from './utils/fuzzyMatcher.js'
import { validateEmail, validatePhone, validateLinkedIn, validateGitHub } from './utils/contactValidator.js'
import { EMAIL, PHONE, LINKEDIN, GITHUB }       from './utils/regexRegistry.js'
import { analyzeLayout }                        from './pipeline/p02-layoutAnalyzer.js'
import { normalizeText }                        from './pipeline/p03-normalizer.js'
import { detectSections }                       from './pipeline/p05-sectionDetector.js'
import { buildGraph }                           from './pipeline/p04-graphBuilder.js'
import { extractFields }                        from './pipeline/p06-fieldExtractor.js'
import { detectEntities }                       from './pipeline/p07-entityDetector.js'
import parserConfig from './config/parserConfig.json'

// ── Skill Recognition (Phase 1, production-ready) ─────────────────────────────

/**
 * 3-tier skill matching: exact → synonym → fuzzy
 * Runs on normalized text for best coverage.
 *
 * @param {string} text
 * @returns {Array}
 */
export function recognizeSkills(text) {
  if (!text) return []
  const found = new Map()
  const { fuzzyMinLength = 7, fuzzyMatchThreshold = 0.88 } = parserConfig

  // Tokenize: test both individual segments and 2–3 word n-grams
  const tokens = new Set()
  text.split(/\n/).forEach(line => {
    line.split(/[,;|•·/\\()\[\]{}]+/).map(s => s.trim()).filter(Boolean).forEach(seg => {
      tokens.add(seg)
      const parts = seg.split(/\s+/)
      if (parts.length >= 2) {
        for (let i = 0; i < parts.length - 1; i++) {
          tokens.add(parts.slice(i, i + 2).join(' '))
          if (i < parts.length - 2) tokens.add(parts.slice(i, i + 3).join(' '))
        }
      }
    })
  })

  tokens.forEach(token => {
    if (!token || token.length < 2) return

    // Tier 1: exact / alias lookup (O(1))
    const entry = SKILL_MAP.get(token.toLowerCase())
    if (entry && !found.has(entry.canonical)) {
      const isExact = token.toLowerCase() === entry.canonical.toLowerCase()
      found.set(entry.canonical, {
        raw:            token,
        normalized:     entry.canonical,
        category:       entry.category,
        confidence:     isExact ? 0.99 : 0.95,
        method:         isExact ? 'exact' : 'alias',
        matchedPattern: token,
        reason:         `"${token}" → ${entry.canonical} via dictionary`,
      })
      return
    }

    // Tier 2: auto-synonym variants
    for (const variant of generateSynonymVariants(token)) {
      const e2 = SKILL_MAP.get(variant.toLowerCase())
      if (e2 && !found.has(e2.canonical)) {
        found.set(e2.canonical, {
          raw:            token,
          normalized:     e2.canonical,
          category:       e2.category,
          confidence:     0.90,
          method:         'synonym',
          matchedPattern: `${token} → ${variant}`,
          reason:         'Auto-synonym: suffix/space normalization',
        })
        return
      }
    }

    // Tier 3: fuzzy (only for longer tokens)
    if (token.length >= fuzzyMinLength) {
      let bestScore = 0
      let bestEntry = null
      let bestMethod = ''

      for (const skill of ALL_SKILLS) {
        const r = fuzzyMatch(token, skill.canonical, fuzzyMinLength, 2, fuzzyMatchThreshold)
        if (r.match && r.score > bestScore) {
          bestScore  = r.score
          bestEntry  = skill
          bestMethod = r.method
        }
      }

      if (bestEntry && !found.has(bestEntry.canonical)) {
        found.set(bestEntry.canonical, {
          raw:            token,
          normalized:     bestEntry.canonical,
          category:       bestEntry.category,
          confidence:     Math.round(bestScore * 0.80 * 100) / 100,
          method:         `fuzzy:${bestMethod}`,
          matchedPattern: token,
          reason:         `Fuzzy match (${Math.round(bestScore * 100)}% similarity)`,
        })
      }
    }
  })

  return Array.from(found.values()).sort((a, b) => b.confidence - a.confidence)
}

function generateSynonymVariants(token) {
  const variants = []
  const t = token.trim()
  if (t.endsWith('.js'))           variants.push(t.slice(0, -3))
  if (t.endsWith('JS') && t.length > 4)  variants.push(t.slice(0, -2))
  if (t.endsWith(' JS') && t.length > 4) variants.push(t.slice(0, -3).trim())
  if (t.includes(' ')) variants.push(t.replace(/\s+/g, '.'))
  if (t.includes(' ')) variants.push(t.replace(/\s+/g, ''))
  const camel = t.replace(/([a-z])([A-Z])/g, '$1 $2')
  if (camel !== t) variants.push(camel)
  return variants
}

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
 * }} input
 * @returns {Promise<object>} Structured resume output
 */
export async function runPipeline({ rawText, fileType }) {
  const t0 = Date.now()

  if (!rawText || rawText.trim().length === 0) {
    return {
      meta: { parserVersion: PARSER_VERSION, dictionaryVersion: DICTIONARY_VERSION, parseTimestamp: new Date().toISOString(), parseTimeMs: 0, language: 'EN', layout: 'UNKNOWN' },
      contact: extractContactFallback(''), education: [], experience: [], projects: [],
      certifications: [], skills: [], summary: null, totalExpYears: 0, _rawText: rawText,
    }
  }

  // Chain pipeline stages
  let ctx = { rawText, fileType }
  ctx = analyzeLayout(ctx)    // P02 — layout + language detection
  ctx = normalizeText(ctx)    // P03 — text cleaning
  ctx = detectSections(ctx)   // P05 — section boundaries
  ctx = buildGraph(ctx)       // P04 — document structure graph
  ctx = extractFields(ctx)    // P06 — contact, education, experience, projects
  ctx = detectEntities(ctx)   // P07 — name detection

  // P08 — skill recognition on normalized text
  const skills = recognizeSkills(ctx.normalizedText || rawText)

  // Merge any skills found in project entries (populate techStack)
  if (ctx.projects) {
    ctx.projects = ctx.projects.map(proj => {
      if (!proj.description?.normalized) return proj
      const projSkills = recognizeSkills(proj.description.normalized)
      return { ...proj, techStack: projSkills }
    })
  }

  // Use pipeline contact if found, otherwise fallback regex
  const hasContact = ctx.contact?.email?.normalized || ctx.contact?.phone?.normalized
  const contact    = hasContact ? ctx.contact : extractContactFallback(rawText)

  const meta = {
    parserVersion:     PARSER_VERSION,
    dictionaryVersion: DICTIONARY_VERSION,
    parseTimestamp:    new Date().toISOString(),
    language:          ctx.language || 'EN',
    layout:            ctx.layoutType || 'UNKNOWN',
    parseTimeMs:       Date.now() - t0,
    sectionOrder:      ctx.sectionOrder || [],
    dictionaryStats:   DICTIONARY_STATS,
  }

  return {
    meta,
    contact,
    summary:        ctx.summary        || null,
    education:      ctx.education      || [],
    experience:     ctx.experience     || [],
    projects:       ctx.projects       || [],
    certifications: ctx.certifications || [],
    skills,
    totalExpYears:  ctx.totalExpYears  || 0,
    _rawText:       rawText,
    _fileType:      fileType,
  }
}
