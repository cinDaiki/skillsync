/**
 * dateParser.js
 * Recognizes 15+ resume date formats and normalizes them to
 * { month: number|null, year: number, isCurrent: boolean }.
 */

// ── Constants ──────────────────────────────────────────────────────────────

const MONTH_NAMES = {
  jan: 1, january: 1, ene: 1, enero: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4, abr: 4, abril: 4,
  may: 5,
  jun: 6, june: 6, hunyo: 6,
  jul: 7, july: 7, hulyo: 7,
  aug: 8, august: 8, agosto: 8,
  sep: 9, september: 9, sept: 9, setyembre: 9,
  oct: 10, october: 10, okt: 10, oktubre: 10,
  nov: 11, november: 11, nobyembre: 11,
  dec: 12, december: 12, dis: 12, disyembre: 12,
}

const CURRENT_KEYWORDS = new Set([
  'present', 'current', 'now', 'ongoing', 'till date', 'to date',
  'kasalukuyan', 'hanggang ngayon', 'ngayon',
])

/**
 * @typedef {{ month: number|null, year: number, isCurrent: boolean }} ParsedDate
 * @typedef {{ start: ParsedDate|null, end: ParsedDate|null }} DateRange
 */

// ── Precompiled Patterns (module-level, built once) ────────────────────────

// "Jan 2024", "January 2024", "Jan. 2024"
const MONTH_YEAR = /\b([a-z]+\.?)\s+(\d{4})\b/i

// "2024-01", "2024/01"
const YEAR_MONTH_NUMERIC = /\b(\d{4})[-/](\d{1,2})\b/

// "01/2024", "01-2024"
const MONTH_YEAR_NUMERIC = /\b(\d{1,2})[-/](\d{4})\b/

// "2022 – 2025", "2022-2025", "2022 to 2025"
const YEAR_RANGE = /\b(\d{4})\s*(?:–|-|to|until|–)\s*(\d{4}|present|current|now|kasalukuyan|ngayon)\b/i

// Standalone 4-digit year "2023"
const YEAR_ONLY = /\b(20\d{2}|19\d{2})\b/

// "Present", "Current" etc. as standalone
const CURRENT_ONLY = /\b(present|current|now|ongoing|kasalukuyan|hanggang ngayon|ngayon)\b/i

// ── Core Parsers ──────────────────────────────────────────────────────────

/**
 * Parse a single date expression from a string fragment.
 * @param {string} text
 * @returns {ParsedDate|null}
 */
export function parseDate(text) {
  if (!text) return null
  const t = text.trim()

  if (CURRENT_KEYWORDS.has(t.toLowerCase())) {
    return { month: null, year: new Date().getFullYear(), isCurrent: true }
  }

  let m

  // "January 2024"
  m = t.match(MONTH_YEAR)
  if (m) {
    const mo = MONTH_NAMES[m[1].toLowerCase().replace('.', '')]
    const yr = parseInt(m[2], 10)
    if (mo && yr >= 1950 && yr <= 2100) return { month: mo, year: yr, isCurrent: false }
  }

  // "2024-01"
  m = t.match(YEAR_MONTH_NUMERIC)
  if (m) {
    const yr = parseInt(m[1], 10)
    const mo = parseInt(m[2], 10)
    if (yr >= 1950 && yr <= 2100 && mo >= 1 && mo <= 12)
      return { month: mo, year: yr, isCurrent: false }
  }

  // "01/2024"
  m = t.match(MONTH_YEAR_NUMERIC)
  if (m) {
    const mo = parseInt(m[1], 10)
    const yr = parseInt(m[2], 10)
    if (yr >= 1950 && yr <= 2100 && mo >= 1 && mo <= 12)
      return { month: mo, year: yr, isCurrent: false }
  }

  // Year only
  m = t.match(YEAR_ONLY)
  if (m) {
    return { month: null, year: parseInt(m[1], 10), isCurrent: false }
  }

  // Current keyword
  m = t.match(CURRENT_ONLY)
  if (m) {
    return { month: null, year: new Date().getFullYear(), isCurrent: true }
  }

  return null
}

/**
 * Extract a date range from a text fragment.
 * Handles: "Jan 2022 – Present", "2020-2022", "March 2021 to Current"
 *
 * @param {string} text
 * @returns {DateRange|null}
 */
export function parseDateRange(text) {
  if (!text) return null
  const t = text.trim()

  // Simple year range: "2022 – 2025"
  const yr = t.match(YEAR_RANGE)
  if (yr) {
    const startYear = parseInt(yr[1], 10)
    const endRaw    = yr[2]
    const isCurrent = CURRENT_KEYWORDS.has(endRaw.toLowerCase())
    return {
      start: { month: null, year: startYear, isCurrent: false },
      end:   isCurrent
        ? { month: null, year: new Date().getFullYear(), isCurrent: true }
        : { month: null, year: parseInt(endRaw, 10), isCurrent: false },
    }
  }

  // Split on separators: "–", "–", "-", "to", "until", "|"
  const parts = t.split(/\s*(?:–|–|-|to|until)\s*/i)
  if (parts.length === 2) {
    const start = parseDate(parts[0].trim())
    const end   = parseDate(parts[1].trim())
    if (start && end) return { start, end }
    if (start && !end) return { start, end: null }
  }

  // Single date (open-ended or point-in-time)
  const single = parseDate(t)
  if (single) return { start: single, end: null }

  return null
}

/**
 * Calculate duration in years between two ParsedDates.
 * Returns a human-readable string like "2.5 years".
 *
 * @param {ParsedDate} start
 * @param {ParsedDate} end
 * @returns {string}
 */
export function calcDuration(start, end) {
  if (!start?.year) return 'Unknown'
  const startMs = new Date(start.year, (start.month ?? 1) - 1).getTime()
  const endMs   = end?.isCurrent || !end?.year
    ? Date.now()
    : new Date(end.year, (end.month ?? 12) - 1).getTime()
  const years = (endMs - startMs) / (1000 * 60 * 60 * 24 * 365.25)
  if (years < 0.1) return 'Less than 1 month'
  if (years < 1)   return `${Math.round(years * 12)} months`
  return `${Math.round(years * 10) / 10} years`
}

/**
 * Format a ParsedDate back to a human-readable string.
 * @param {ParsedDate} d
 * @returns {string}
 */
export function formatDate(d) {
  if (!d) return ''
  if (d.isCurrent) return 'Present'
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return d.month ? `${months[d.month - 1]} ${d.year}` : `${d.year}`
}
