/**
 * p07-entityDetector.js
 * Rule-Based Entity Detection — extracts the candidate's name.
 *
 * NOTE: This is NOT a trained NER model. It uses position + pattern heuristics.
 * The term "NER" is intentionally avoided throughout this file.
 *
 * Detects:
 *   - Candidate name (from header lines)
 *   - Enhances contact with name field
 *
 * Strategy for name:
 *   1. Look in the first 5 header lines
 *   2. Find a line that is 2–5 title-case words with no digits
 *   3. Exclude known section headers and common non-name patterns
 *   4. Assign confidence based on position (line 0–1 = high, line 2–4 = medium)
 *
 * Outputs:
 *   ctx.contact.name — name field added to existing contact object
 */

import sectionAliases from '../config/sectionAliases.json'

// ── Helper ────────────────────────────────────────────────────────────────────
function toTitleCase(str) {
  return str.replace(/\b([a-zA-Z])/g, c => c.toUpperCase())
}

// ── Build exclusion set from all known section aliases ────────────────────────
const SECTION_WORDS = new Set()
Object.values(sectionAliases).forEach(langs => {
  ;[...(langs.en || []), ...(langs.fil || [])].forEach(alias => {
    SECTION_WORDS.add(alias.toLowerCase().trim())
    // Also add individual words from multi-word aliases
    alias.toLowerCase().split(/\s+/).forEach(w => SECTION_WORDS.add(w))
  })
})

// Common words that appear in headers but are NOT names
const NON_NAME_PATTERNS = [
  /resume/i, /curriculum vitae/i, /cv\b/i,
  /profile/i, /portfolio/i, /contact/i,
  /page\s*\d/i, /\bme\b/i, /^dear\b/i,
  /@/, /http/, /\d{4}/, /linkedin|github/i,
]

// Job title keywords — lines that are job titles, not names
const JOB_TITLE_WORDS = new Set([
  'developer', 'engineer', 'designer', 'manager', 'analyst', 'specialist',
  'consultant', 'coordinator', 'administrator', 'assistant', 'officer',
  'director', 'supervisor', 'technician', 'programmer', 'architect',
  'nurse', 'teacher', 'professor', 'instructor', 'accountant', 'lawyer',
  'doctor', 'physician', 'intern', 'trainee', 'associate', 'lead', 'head',
])

/**
 * Check if a line looks like a person's name.
 * @param {string} line
 * @returns {{ isName: boolean, confidence: number }}
 */
function looksLikeName(line) {
  const t = line.trim()

  if (!t || t.length < 3 || t.length > 60)   return { isName: false, confidence: 0 }
  if (/\d/.test(t))                           return { isName: false, confidence: 0 }  // names don't have digits
  if (/[@,;:|()]/.test(t))                    return { isName: false, confidence: 0 }  // contact chars
  if (/^[-•]/.test(t))                        return { isName: false, confidence: 0 }  // bullet

  // Check against known non-name patterns
  for (const pat of NON_NAME_PATTERNS) {
    if (pat.test(t)) return { isName: false, confidence: 0 }
  }

  // Check if it's a section header word
  if (SECTION_WORDS.has(t.toLowerCase())) return { isName: false, confidence: 0 }

  const words = t.split(/\s+/)

  // Must be 2–5 words
  if (words.length < 2 || words.length > 5) return { isName: false, confidence: 0 }

  // Must not be all the same letter (like initials repeated)
  if (new Set(words.map(w => w[0].toUpperCase())).size === 1 && words.length === 1)
    return { isName: false, confidence: 0 }

  // Each word should start with a capital letter
  const allTitleCase = words.every(w => w && /^[A-ZÁÉÍÓÚÑÜ]/.test(w))
  if (!allTitleCase) return { isName: false, confidence: 0.55 }

  // Check if any word is a job title keyword
  const hasJobTitle = words.some(w => JOB_TITLE_WORDS.has(w.toLowerCase()))
  if (hasJobTitle) return { isName: false, confidence: 0 }

  // All checks passed
  return { isName: true, confidence: 0.88 }
}

/**
 * @param {object} ctx
 * @param {string[]} ctx.headerLines
 * @param {object} ctx.contact
 * @returns {object} ctx with ctx.contact.name added
 */
export function detectEntities(ctx) {
  const { headerLines = [], contact = {}, sections } = ctx

  let name = null
  let nameConfidence = 0

  // ── Check for government-format "Name: ..." in CONTACT section ────────────
  const contactLines = sections?.get('CONTACT')?.lines || []
  const allSearchLines = [...headerLines, ...contactLines].slice(0, 15)

  for (const line of allSearchLines) {
    // Pattern: "Name: DELA TORRE, JOSE RIZAL M."
    const govMatch = line.match(/^(?:Full\s+)?Name\s*:\s*(.+)$/i)
    if (govMatch) {
      const raw = govMatch[1].trim()
      // Reformat "DELA TORRE, JOSE RIZAL M." → "Jose Rizal M. Dela Torre"
      // or just normalize casing
      name           = toTitleCase(raw.replace(/^([A-Z\s]+),\s*(.+)$/, '$2 $1').trim())
      nameConfidence = 0.95
      break
    }
  }

  // ── Standard search in header lines ─────────────────────────────────────
  if (!name) {
    const searchLines = headerLines.slice(0, 8)
    for (let i = 0; i < searchLines.length; i++) {
      const line = searchLines[i].trim()
      if (!line) continue

      // Handle "DELA CRUZ, JUAN" format (last, first)
      const invertedMatch = line.match(/^([A-ZÁÉÍÓÚ]{2,}(?:\s+[A-ZÁÉÍÓÚ.]{1,})*),\s+([A-ZÁÉÍÓÚ][a-záéíóú]{1,}(?:\s+[A-ZÁÉÍÓÚ.][a-záéíóú]{0,}){0,3})$/)
      if (invertedMatch) {
        name = `${toTitleCase(invertedMatch[2])} ${toTitleCase(invertedMatch[1])}`
        nameConfidence = 0.88 + (i === 0 ? 0.06 : 0)
        break
      }

      const { isName, confidence } = looksLikeName(line)
      if (isName) {
        const positionBonus = i === 0 ? 0.08 : i === 1 ? 0.04 : 0
        name           = toTitleCase(line)
        nameConfidence = Math.min(0.97, confidence + positionBonus)
        break
      }
    }
  }

  const nameField = name
    ? {
        raw:            name,
        normalized:     name,
        confidence:     nameConfidence,
        method:         'rule-based entity detection',
        matchedPattern: 'Title-case / key-value pattern in header',
        reason:         `Detected name from header/contact block`,
      }
    : {
        raw:        null,
        normalized: null,
        confidence: 0,
        method:     'rule-based entity detection',
        reason:     'No name-like pattern found in header lines',
      }

  return { ...ctx, contact: { ...contact, name: nameField } }
}
