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
 * Each Section's lines are split into Entries by detecting entry boundaries:
 *   - Date range on a line signals a new experience entry
 *   - Blank lines or ALL_CAPS sub-headings within a section
 *
 * Outputs:
 *   ctx.graph — { header: Node, sections: SectionNode[] }
 */

import { parseDateRange } from '../utils/dateParser.js'
import { DATE_RANGE }     from '../utils/regexRegistry.js'

/**
 * @typedef {{ type: string, lines: string[], entries?: EntryNode[] }} SectionNode
 * @typedef {{ lines: string[], dateRange?: object, isCurrent?: boolean }} EntryNode
 */

/**
 * Split section lines into logical entries.
 * An entry starts when we detect a date range or a title-like line
 * that is significantly different from previous lines.
 *
 * @param {string[]} lines
 * @param {string} sectionType
 * @returns {EntryNode[]}
 */
function splitIntoEntries(lines, sectionType) {
  if (lines.length === 0) return []

  const entries    = []
  let currentEntry = null

  const commit = () => {
    if (currentEntry && currentEntry.lines.length > 0) {
      entries.push(currentEntry)
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Reset regex lastIndex for global patterns
    DATE_RANGE.lastIndex = 0
    const hasDate = DATE_RANGE.test(line)
    DATE_RANGE.lastIndex = 0

    // For EXPERIENCE / EDUCATION / PROJECTS / CERTIFICATIONS:
    // A new entry starts when we see a line that contains a date range
    // OR a short all-caps line (sub-heading) after content has started
    if (['EXPERIENCE', 'EDUCATION', 'PROJECTS', 'CERTIFICATIONS', 'ACHIEVEMENTS', 'VOLUNTEER'].includes(sectionType)) {

      if (hasDate && currentEntry !== null) {
        // This line with a date likely belongs to the current entry header
        // (date ranges are part of the same entry as the title above them)
        currentEntry.lines.push(line)

        // Parse the date range for later use
        const dr = parseDateRange(line)
        if (dr) {
          currentEntry.dateRange = dr
          currentEntry.isCurrent = dr.end?.isCurrent ?? false
        }
        continue
      }

      // Detect new entry: title-like line (short, title-case or ALL-CAPS, no bullet)
      // after we already have content in the current entry
      const isTitleLike = (
        line.length > 3 &&
        line.length < 80 &&
        !line.startsWith('-') &&
        !line.startsWith('•') &&
        !/^\d/.test(line)
      )

      // Check if previous line was a date range (then this is a new entry's title)
      const prevLine = lines[i - 1] || ''
      DATE_RANGE.lastIndex = 0
      const prevHadDate = DATE_RANGE.test(prevLine)
      DATE_RANGE.lastIndex = 0

      if (isTitleLike && currentEntry !== null && currentEntry.lines.length >= 1 && (prevHadDate || currentEntry.lines.length > 3)) {
        commit()
        currentEntry = { lines: [line], dateRange: null, isCurrent: false }
        continue
      }

      if (currentEntry === null) {
        currentEntry = { lines: [], dateRange: null, isCurrent: false }
      }
      currentEntry.lines.push(line)

    } else {
      // SKILLS, LANGUAGES, SUMMARY — treat as single entry
      if (!currentEntry) currentEntry = { lines: [], dateRange: null, isCurrent: false }
      currentEntry.lines.push(line)
    }
  }

  commit()

  // If no entries were created (no date ranges detected), treat all lines as one entry
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
