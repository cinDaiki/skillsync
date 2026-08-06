/**
 * p05-sectionDetector.js
 * Identifies logical sections in a resume from normalized lines.
 * Config-driven: reads aliases from sectionAliases.json.
 * Supports English and Filipino aliases.
 *
 * Strategy:
 *   1. Build a flattened alias → sectionType lookup (case-insensitive)
 *   2. Scan normalizedLines for lines that look like section headers
 *   3. Group all subsequent lines under the detected section
 *
 * IMPORTANT DESIGN CONSTRAINT:
 *   We ONLY treat a line as a section header if it is an alias match.
 *   Structural heuristics (ALL_CAPS, Title Case) are used as SUPPLEMENTARY
 *   signals with strict guards to prevent company names, school names, and
 *   project names from being misclassified as sections.
 *
 * Outputs:
 *   ctx.sections — Map<SectionType, { label, rawLabel, lines: string[] }>
 *   ctx.sectionOrder — string[] ordered list of detected section types
 */

import sectionAliases from '../config/sectionAliases.json'

// ── Build alias lookup at module load (once) ────────────────────────────────
// Maps every alias (lowercase) → canonical section type string
const ALIAS_MAP = new Map()

Object.entries(sectionAliases).forEach(([sectionType, langs]) => {
  const allAliases = [...(langs.en || []), ...(langs.fil || [])]
  allAliases.forEach(alias => {
    ALIAS_MAP.set(alias.toLowerCase().trim(), sectionType)
  })
})

// Additional aliases for government / non-standard resume formats
const EXTRA_ALIASES = new Map([
  // Government-style headings
  ['educational background',    'EDUCATION'],
  ['academic background',       'EDUCATION'],
  ['educational attainment',    'EDUCATION'],
  ['education background',      'EDUCATION'],
  ['work experience',           'EXPERIENCE'],
  ['professional experience',   'EXPERIENCE'],
  ['employment history',        'EXPERIENCE'],
  ['employment record',         'EXPERIENCE'],
  ['job history',               'EXPERIENCE'],
  ['career history',            'EXPERIENCE'],
  ['personal data sheet',       'CONTACT'],
  ['personal information',      'CONTACT'],
  ['personal data',             'CONTACT'],
  ['bio data',                  'CONTACT'],
  ['civil service eligibility', 'CERTIFICATIONS'],
  ['eligibility',               'CERTIFICATIONS'],
  ['trainings & seminars',      'CERTIFICATIONS'],
  ['trainings and seminars',    'CERTIFICATIONS'],
  ['seminars & trainings',      'CERTIFICATIONS'],
  ['seminars and trainings',    'CERTIFICATIONS'],
  ['core skills',               'SKILLS'],
  ['core competencies',         'SKILLS'],
  ['key competencies',          'SKILLS'],
  ['technical skills',          'SKILLS'],
  ['work history',              'EXPERIENCE'],
  ['extracurricular activities','VOLUNTEER'],
  ['extracurricular',           'VOLUNTEER'],
  ['activities',                'VOLUNTEER'],
])

// Merge extra aliases into main map
EXTRA_ALIASES.forEach((type, alias) => {
  if (!ALIAS_MAP.has(alias)) ALIAS_MAP.set(alias, type)
})

// ── Patterns that DISQUALIFY a line from being a section header ──────────────
// These indicate the line is a content line, not a header.
const CONTENT_DISQUALIFIERS = [
  /\d{4}/,                          // contains a year (date line)
  /@/,                              // email address
  /\+?\d[\d\s\-().]{6,}/,          // phone number
  /linkedin\.com|github\.com/i,    // URLs
  /gpa|gwa\s*[:=]/i,               // GPA lines
  /grade|cum laude|honor/i,        // academic result lines
  /monthly salary/i,               // salary lines
  /\bph\b|\bcaveño\b/i,            // address abbreviations
  /bachelor|master|doctorate|diploma|certificate|bs |ba |ms |ma /i, // degree lines
  /university|college|institute|polytechnic|pamantasan/i,           // school names
  /inc\.|corp\.|co\.|ltd\.|llc\./i, // company names with suffixes
  /accenture|deloitte|kpmg|pwc|ey\b|ibm|google|amazon|microsoft|grab|globe|smart|pldt/i,
  /medical center|hospital|clinic/i,
  /^the /i,                         // articles suggest content, not headers
  /\bhim\b|\bher\b|\bshe\b|\bhe\b/, // pronouns suggest a summary/content line
]

/**
 * Check if a line is a strong alias match (authoritative).
 * @param {string} line
 * @returns {string|null} section type or null
 */
function lookupAlias(line) {
  const t = line.trim().toLowerCase()
  if (ALIAS_MAP.has(t)) return ALIAS_MAP.get(t)

  // Without trailing colon or whitespace
  const noColon = t.replace(/:$/, '').trim()
  if (ALIAS_MAP.has(noColon)) return ALIAS_MAP.get(noColon)

  // Multi-word starting match (handles "Skills & Expertise" → SKILLS)
  for (const [alias, type] of ALIAS_MAP) {
    if (noColon === alias) return type
    // Allow "Professional Experience:" → EXPERIENCE
    if (noColon.startsWith(alias) && noColon.length - alias.length < 15) return type
    // Allow alias to be slightly longer (handles extra words after colon)
    if (alias.startsWith(noColon) && alias.length - noColon.length < 10) return type
  }

  return null
}

/**
 * Structural header detection — CONSERVATIVE.
 * Only fires when ALL conditions are met AND none of the disqualifiers apply.
 * Used as a supplementary pass for completely non-standard resumes.
 *
 * @param {string} line
 * @param {boolean} previousLineWasBlank — structural clue
 * @returns {boolean}
 */
function isStructuralHeader(line, previousLineWasBlank) {
  const t = line.trim()

  // Hard length limits
  if (!t || t.length < 3 || t.length > 35) return false

  // Must not start with a bullet or digit
  if (/^[-•*\d]/.test(t)) return false

  // Check all disqualifiers
  for (const pat of CONTENT_DISQUALIFIERS) {
    if (pat.test(t)) return false
  }

  // Must be preceded by a blank line (structural signal)
  if (!previousLineWasBlank) return false

  // Only 1–3 words (section headers are short)
  const wordCount = t.split(/\s+/).length
  if (wordCount > 3) return false

  // Must be ALL CAPS (most reliable non-alias heuristic)
  if (t === t.toUpperCase() && /[A-Z]{2,}/.test(t)) return true

  return false
}

// ── Government-format field extraction ────────────────────────────────────────

/**
 * Some government/civil service resumes use "Field: value" format.
 * Detect and handle those specially.
 * @param {string} line
 * @returns {{ field: string, value: string }|null}
 */
function extractKeyValueLine(line) {
  const m = line.match(/^([A-Z][a-zA-Z\s]+?):\s*(.+)$/)
  if (!m) return null
  return { field: m[1].trim(), value: m[2].trim() }
}

// ── Main stage ────────────────────────────────────────────────────────────────

/**
 * @param {object} ctx
 * @param {string[]} ctx.normalizedLines
 * @param {string[]} ctx.headerLines
 * @returns {object} ctx with sections Map
 */
export function detectSections(ctx) {
  const { normalizedLines, headerLines = [] } = ctx
  const headerSet = new Set(headerLines)

  const sections     = new Map()
  const sectionOrder = []

  // Seed with a CONTACT section from header lines
  if (headerLines.length > 0) {
    sections.set('CONTACT', {
      label:    'CONTACT',
      rawLabel: 'Header',
      lines:    [...headerLines],
    })
    sectionOrder.push('CONTACT')
  }

  let currentSection = null
  let currentLines   = []
  let currentLabel   = ''
  let prevLineBlank  = false

  const commit = () => {
    if (currentSection && currentLines.length > 0) {
      if (sections.has(currentSection)) {
        sections.get(currentSection).lines.push(...currentLines)
      } else {
        sections.set(currentSection, {
          label:    currentSection,
          rawLabel: currentLabel,
          lines:    [...currentLines],
        })
        sectionOrder.push(currentSection)
      }
    }
  }

  for (let i = 0; i < normalizedLines.length; i++) {
    const line = normalizedLines[i]

    // Skip blank-ish lines, track as blank signal
    if (!line.trim()) {
      prevLineBlank = true
      continue
    }

    // Skip lines already captured in the header
    if (headerSet.has(line) && !currentSection) {
      prevLineBlank = false
      continue
    }

    // ── Tier 1: Alias map (authoritative) ──────────────────────────────────
    const aliasMatch = lookupAlias(line)
    if (aliasMatch) {
      commit()
      currentSection = aliasMatch
      currentLabel   = line
      currentLines   = []
      prevLineBlank  = false
      continue
    }

    // ── Tier 2: ALL-CAPS structural header (conservative) ──────────────────
    if (isStructuralHeader(line, prevLineBlank)) {
      commit()
      // Use a safe sanitized version as the section key
      const sectionKey = line.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').replace(/_+/g, '_').slice(0, 30)
      currentSection = sectionKey
      currentLabel   = line
      currentLines   = []
      prevLineBlank  = false
      continue
    }

    // ── Regular content line ────────────────────────────────────────────────
    if (currentSection) {
      currentLines.push(line)
    } else {
      // Content before any recognized section → add to CONTACT
      if (sections.has('CONTACT')) {
        sections.get('CONTACT').lines.push(line)
      }
    }

    prevLineBlank = false
  }

  commit()

  return { ...ctx, sections, sectionOrder }
}
