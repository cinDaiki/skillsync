/**
 * skillMatcher.js
 * 3-tier skill matching: exact → alias/synonym → fuzzy, plus boundary scanning.
 */

import { tokenizeText } from './tokenizer.js'
import { SKILL_MAP, ALL_SKILLS } from '../skills/index.js'
import { fuzzyMatch } from '../utils/fuzzyMatcher.js'

/** @typedef {{ canonical: string, category: string, weight: number, aliases: string[] }} SkillEntry */

/**
 * Precomputed search terms sorted longest-first to prefer specific matches.
 * @type {Array<{ term: string, entry: SkillEntry, isCanonical: boolean }>}
 */
const SEARCH_TERMS = []

ALL_SKILLS.forEach(entry => {
  SEARCH_TERMS.push({ term: entry.canonical, entry, isCanonical: true })
  ;(entry.aliases || []).forEach(alias => {
    SEARCH_TERMS.push({ term: alias, entry, isCanonical: false })
  })
})

SEARCH_TERMS.sort((a, b) => b.term.length - a.term.length)

const REGEX_CACHE = new Map()

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getBoundaryRegex(term) {
  const key = term.toLowerCase()
  if (REGEX_CACHE.has(key)) return REGEX_CACHE.get(key)

  const escaped = escapeRegex(term)
  const pattern = /[\w.+#-]/.test(term)
    ? new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, 'gi')
    : new RegExp(`(?<![A-Za-z])${escaped}(?![A-Za-z])`, 'gi')

  REGEX_CACHE.set(key, pattern)
  return pattern
}

/**
 * Auto-generate common spelling variants (Node JS → Node.js, ReactJS → React.js).
 * @param {string} token
 * @returns {string[]}
 */
export function generateSynonymVariants(token) {
  const variants = []
  const t = token.trim()
  if (!t) return variants

  if (t.endsWith('.js')) variants.push(t.slice(0, -3))
  if (t.endsWith('JS') && t.length > 4) variants.push(t.slice(0, -2))
  if (t.endsWith(' JS') && t.length > 4) variants.push(t.slice(0, -3).trim())
  if (t.includes(' ')) variants.push(t.replace(/\s+/g, '.'))
  if (t.includes(' ')) variants.push(t.replace(/\s+/g, ''))
  const camel = t.replace(/([a-z])([A-Z])/g, '$1 $2')
  if (camel !== t) variants.push(camel)

  return variants
}

/**
 * Match a single token against the skill dictionary.
 *
 * @param {string} token
 * @param {object} config
 * @returns {object|null}
 */
export function matchToken(token, config) {
  if (!token || token.length < config.tokenization.minTokenLength) return null

  const normalized = token.trim()
  const lower = normalized.toLowerCase()

  const direct = SKILL_MAP.get(lower)
  if (direct) {
    const isExact = lower === direct.canonical.toLowerCase()
    return {
      entry: direct,
      method: isExact ? 'exact' : 'alias',
      matchedText: normalized,
      matchConfidence: isExact
        ? config.matchMethods.exact.baseConfidence
        : config.matchMethods.alias.baseConfidence,
      isCanonical: isExact,
    }
  }

  if (config.features.synonymVariants) {
    for (const variant of generateSynonymVariants(normalized)) {
      const synonymEntry = SKILL_MAP.get(variant.toLowerCase())
      if (synonymEntry) {
        return {
          entry: synonymEntry,
          method: 'synonym',
          matchedText: normalized,
          matchConfidence: config.matchMethods.synonym.baseConfidence,
          isCanonical: false,
        }
      }
    }
  }

  if (!config.features.fuzzyMatching || !config.fuzzy.enabled) return null

  const minLen = normalized.length >= config.fuzzy.shortTokenMinLength
    ? config.fuzzy.minTokenLength
    : config.fuzzy.shortTokenMinLength

  if (normalized.length < minLen) return null

  let bestScore = 0
  let bestEntry = null
  let bestMethod = ''

  // Cap counts unique skills evaluated (not individual alias terms).
  // Python = skill #133, Kubernetes = skill #436 by term-count —
  // counting skills instead of terms keeps the full dictionary reachable.
  const maxSkills = ALL_SKILLS.length  // scan full dictionary; early-exit handles performance
  let skillsChecked = 0

  outer: for (const skill of ALL_SKILLS) {
    if (++skillsChecked > maxSkills) break outer
    const terms = [skill.canonical, ...(skill.aliases || [])]
    for (const term of terms) {
      if (term.length < minLen) continue
      const result = fuzzyMatch(
        normalized,
        term,
        minLen,
        config.fuzzy.maxLevenshteinDistance,
        config.fuzzy.jaroWinklerThreshold
      )
      if (result.match && result.score > bestScore) {
        bestScore  = result.score
        bestEntry  = skill
        bestMethod = result.method
        // Early exit: near-perfect match found — no need to scan further
        if (bestScore >= 0.99) break outer
      }
    }
  }

  if (!bestEntry) return null

  return {
    entry: bestEntry,
    method: `fuzzy:${bestMethod}`,
    matchedText: normalized,
    matchConfidence: Math.round(config.matchMethods.fuzzy.baseConfidence * bestScore * 100) / 100,
    isCanonical: false,
  }
}

/**
 * Scan prose text for dictionary terms using word-boundary regex.
 *
 * @param {string} text
 * @param {object} config
 * @param {(hit: object) => void} onMatch
 */
export function scanTextBoundaries(text, config, onMatch) {
  if (!text?.trim() || !config.boundaryScan.enabled) return

  const matchedSpans = []

  for (const { term, entry, isCanonical } of SEARCH_TERMS) {
    if (term.length < config.boundaryScan.minTermLength) continue

    const regex = getBoundaryRegex(term)
    regex.lastIndex = 0

    let match
    while ((match = regex.exec(text)) !== null) {
      const start = match.index
      const end = start + match[0].length

      const overlaps = matchedSpans.some(span =>
        !(end <= span.start || start >= span.end)
      )
      if (overlaps) continue

      matchedSpans.push({ start, end, canonical: entry.canonical })

      onMatch({
        entry,
        method: 'boundary',
        matchedText: match[0],
        matchConfidence: isCanonical
          ? config.matchMethods.boundary.baseConfidence
          : config.matchMethods.alias.baseConfidence,
        isCanonical,
      })
    }
  }
}

/**
 * Run token and boundary matching on a text block.
 *
 * @param {string} text
 * @param {string} source
 * @param {object} config
 * @returns {Array<{ source: string, entry: SkillEntry, method: string, matchedText: string, matchConfidence: number, isCanonical: boolean }>}
 */
export function findSkillsInText(text, source, config) {
  /** @type {Array<any>} */
  const hits = []
  const seen = new Set()

  const recordHit = (hit) => {
    const key = `${hit.entry.canonical.toLowerCase()}|${source}|${hit.matchedText.toLowerCase()}|${hit.method}`
    if (seen.has(key)) return
    seen.add(key)
    hits.push({ ...hit, source })
  }

  scanTextBoundaries(text, config, recordHit)

  for (const token of tokenizeText(text, config)) {
    const match = matchToken(token, config)
    if (match) recordHit(match)
  }

  return hits
}
