/**
 * p04-graphBuilder.js
 * Converts the flat sections Map into a Document Structure Graph.
 *
 * The graph is a lightweight tree:
 *   Resume
 *     ├── Header (contact block)
 *     └── Section[]
 *           └── Entry[]  (individual experience/education items)
 *
 * Entry boundary detection uses MULTIPLE signals (architectural fix):
 *   - Date range on a line (DATE_RANGE regex)
 *   - Standalone 4-digit year (YEAR regex) — for gov/PH resume formats
 *   - Blank line followed by a non-bullet title-like line
 *   - Key-value prefix like "Degree:", "Position:", "Name:" on a new line
 *
 * This replaces the previous date-only boundary detection which failed for:
 *   - Projects (no dates)
 *   - Certifications (single-line, no structured date ranges)
 *   - Government education entries (uses "Year Graduated:" not date ranges)
 *
 * Outputs:
 *   ctx.graph — { header: Node, sections: SectionNode[] }
 */

import { parseDateRange } from '../utils/dateParser.js'
import { DATE_RANGE, YEAR } from '../utils/regexRegistry.js'

/**
 * @typedef {{ type: string, lines: string[], entries?: EntryNode[] }} SectionNode
 * @typedef {{ lines: string[], dateRange?: object, isCurrent?: boolean }} EntryNode
 */

// Section types where multi-signal entry splitting is applied
const MULTI_ENTRY_SECTIONS = new Set([
  'EXPERIENCE', 'EDUCATION', 'PROJECTS', 'CERTIFICATIONS',
  'ACHIEVEMENTS', 'VOLUNTEER', 'PUBLICATIONS',
])

/**
 * Determine if a line is a key-value field header (government/PH resume format).
 * Examples: "Degree: Bachelor of Science", "Position: Engineer"
 * @param {string} line
 * @returns {string|null} the field name if matched, null otherwise
 */
function getKeyValueField(line) {
  const m = line.match(/^(Degree|Position|Office|School|Company|Employer|Title|Project|Name|Certificate|Award)\s*:\s*.+$/i)
  return m ? m[1].toLowerCase() : null
}

/**
 * Determine if a line looks like a new entry's title.
 * A title line is:
 *   - Not a bullet point
 *   - Not starting with a digit (not a date)
 *   - Not a pure continuation sentence (doesn't start with lowercase)
 *   - Between 3 and 100 chars
 * @param {string} line
 * @returns {boolean}
 */
function isTitleLike(line) {
  return (
    line.length > 3 &&
    line.length < 100 &&
    !line.startsWith('-') &&
    !line.startsWith('•') &&
    !/^\d{4}/.test(line) &&     // doesn't start with year
    !/^[a-z]/.test(line)        // doesn't start with lowercase (not a continuation)
  )
}

/**
 * Split section lines into logical entries using multi-signal boundary detection.
 *
 * Boundary signals (any one triggers a new entry):
 *   1. Date range detected on a non-first line AND current entry has content
 *   2. Previous line was a date range → next title-like line is a new entry
 *   3. Blank line (empty line in normalized text) → next title-like line is new entry
 *   4. Key-value field prefix (Degree:, Position:) on a new line
 *   5. Standalone year on a line (Year Graduated: 2015) for gov resume format
 *
 * @param {string[]} lines
 * @param {string} sectionType
 * @returns {EntryNode[]}
 */
function splitIntoEntries(lines, sectionType) {
  if (lines.length === 0) return []

  if (!MULTI_ENTRY_SECTIONS.has(sectionType)) {
    // SKILLS, LANGUAGES, SUMMARY — single entry
    return [{ lines: [...lines], dateRange: null, isCurrent: false }]
  }

  const entries    = []
  let currentEntry = null
  let prevHadDate  = false

  const commit = () => {
    if (currentEntry && currentEntry.lines.length > 0) {
      entries.push(currentEntry)
    }
  }

  const newEntry = (firstLine) => {
    commit()
    currentEntry = { lines: [firstLine], dateRange: null, isCurrent: false }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // ── Signal 1: Date range detection ──────────────────────────────────────
    DATE_RANGE.lastIndex = 0
    const hasDate = DATE_RANGE.test(line)
    DATE_RANGE.lastIndex = 0

    if (hasDate && currentEntry !== null) {
      // Date line belongs to the current entry (it's part of its header)
      currentEntry.lines.push(line)
      const dr = parseDateRange(line)
      if (dr) {
        currentEntry.dateRange = dr
        currentEntry.isCurrent = dr.end?.isCurrent ?? false
      }
      prevHadDate = true
      continue
    }

    // ── Signal 2: Line after a date range → new entry boundary ───────────
    if (prevHadDate && isTitleLike(line) && currentEntry !== null) {
      newEntry(line)
      prevHadDate = false
      continue
    }

    // ── Signal 3: Key-value prefix (Degree:, Position:, etc.) ───────────
    const kvField = getKeyValueField(line)
    if (kvField && currentEntry !== null && currentEntry.lines.length > 0) {
      // Key-value fields signal new entries in gov/PH resumes
      // "Degree:" starts a new education entry, "Position:" a new experience entry
      if (kvField === 'degree' || kvField === 'position') {
        newEntry(line)
        prevHadDate = false
        continue
      }
    }

    // ── Signal 4: Standalone year line (gov format: "Year Graduated: 2007") ─
    // Only applies to EDUCATION — in EXPERIENCE, years appear in responsibility
    // bullets and should NOT trigger an entry boundary.
    YEAR.lastIndex = 0
    const hasYear = YEAR.test(line)
    YEAR.lastIndex = 0

    if (hasYear && currentEntry !== null && sectionType === 'EDUCATION') {
      // A year line belongs to the current entry (graduation year, etc.)
      currentEntry.lines.push(line)
      // Mark as a date boundary for next-line detection
      prevHadDate = true
      continue
    }

    // ── Default: accumulate into current entry ───────────────────────────
    if (currentEntry === null) {
      // First line always starts a new entry
      currentEntry = { lines: [line], dateRange: null, isCurrent: false }
    } else if (isTitleLike(line) && !prevHadDate) {
      // ── Signal 5: Non-date, non-bullet title-like line after content ─────
      // Only applies to PROJECTS and CERTIFICATIONS (which have no date ranges).
      // EXPERIENCE uses date-range signals (1+2) and key-value signals (3).
      // Thresholds differ: certs are single lines, projects have multi-line desc.
      const minLinesForSplit = sectionType === 'CERTIFICATIONS' ? 1 : 2
      if (
        currentEntry !== null &&
        currentEntry.lines.length >= minLinesForSplit &&
        (sectionType === 'PROJECTS' || sectionType === 'CERTIFICATIONS')
      ) {
        newEntry(line)
        prevHadDate = false
        continue
      }
      if (currentEntry === null) {
        currentEntry = { lines: [line], dateRange: null, isCurrent: false }
      } else {
        currentEntry.lines.push(line)
      }
    } else {
      currentEntry.lines.push(line)
    }

    prevHadDate = false
  }

  commit()

  // Fallback: if no entries were produced, wrap all lines as one entry
  if (entries.length === 0 && lines.length > 0) {
    entries.push({ lines: [...lines], dateRange: null, isCurrent: false })
  }

  return entries
}

/**
 * @param {object} ctx
 * @param {Map} ctx.sections
 * @param {string[]} ctx.headerLines
 * @returns {object} ctx with graph
 */
export function buildGraph(ctx) {
  const { sections, headerLines = [] } = ctx

  const graph = {
    header: {
      type:  'HEADER',
      lines: headerLines,
    },
    sections: [],
  }

  sections.forEach((section, sectionType) => {
    const entries = splitIntoEntries(section.lines, sectionType)

    graph.sections.push({
      type:     sectionType,
      rawLabel: section.rawLabel,
      lines:    section.lines,
      entries,
    })
  })

  return { ...ctx, graph }
}
