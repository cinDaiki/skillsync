/**
 * p02-layoutAnalyzer.js
 * Detects resume layout type from text structure patterns.
 * Cannot visually render PDFs, so uses heuristics on line characteristics.
 *
 * Outputs:
 *   ctx.lines        — all non-empty lines from rawText
 *   ctx.layoutType   — 'SINGLE_COLUMN' | 'TWO_COLUMN' | 'UNKNOWN'
 *   ctx.headerLines  — first block likely containing name + contact
 *   ctx.bodyLines    — remaining content lines
 *   ctx.language     — 'EN' | 'FIL' | 'MIXED'
 */

// Filipino keywords that indicate the language
const FILIPINO_SECTION_MARKERS = [
  'karanasan', 'edukasyon', 'kasanayan', 'pinag-aralan', 'layunin',
  'tungkol sa akin', 'mga proyekto', 'sertipiko', 'kasalukuyan',
  'wika', 'mga wika', 'tagumpay', 'kakayahan', 'pagsasanay',
]

/**
 * @param {object} ctx
 * @param {string} ctx.rawText
 * @returns {object} ctx with layout fields added
 */
export function analyzeLayout(ctx) {
  const { rawText } = ctx

  // Split into lines, preserve structure
  const allLines = rawText.split(/\r\n|\r|\n/)
  const lines = allLines.map(l => l.trimEnd()).filter(l => l.trim().length > 0)

  if (lines.length === 0) {
    return { ...ctx, lines: [], allLines, layoutType: 'UNKNOWN', headerLines: [], bodyLines: [], language: 'EN' }
  }

  // ── Language detection ──────────────────────────────────────────────────
  const lowerText = rawText.toLowerCase()
  const filCount  = FILIPINO_SECTION_MARKERS.filter(m => lowerText.includes(m)).length
  const language  = filCount >= 2 ? 'FIL' : filCount === 1 ? 'MIXED' : 'EN'

  // ── Layout detection ────────────────────────────────────────────────────
  // Heuristic: two-column layouts tend to have many short lines
  // because text from each column is extracted sequentially by PDF parsers
  const nonTrivialLines = lines.filter(l => l.trim().length > 3)
  const avgLineLen = nonTrivialLines.reduce((s, l) => s + l.trim().length, 0) / (nonTrivialLines.length || 1)
  const shortLineCount = nonTrivialLines.filter(l => l.trim().length < 45).length
  const shortLineRatio = shortLineCount / (nonTrivialLines.length || 1)

  // Two-column indicator: >60% short lines + avg length < 55
  // (Canva, Resume.io, Novoresume tend to produce this pattern)
  const layoutType = (shortLineRatio > 0.60 && avgLineLen < 55)
    ? 'TWO_COLUMN'
    : 'SINGLE_COLUMN'

  // ── Header detection ────────────────────────────────────────────────────
  // Header = the first cluster of lines containing contact-like content.
  // Typically: name (line 0-2), followed by email/phone/links.
  // We scan up to 20 lines to find where the "content" (bullet points, sections) starts.
  let headerEndIdx = 0

  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const l = lines[i].trim()

    // A line that is ALL_CAPS and short is almost certainly a section header,
    // even if it appears in the first 3 lines. Stop the header here.
    // (Handles: short resume where name + email + SKILLS are the first 3 lines)
    if (l === l.toUpperCase() && /^[A-Z]{2,}[\s&/]*[A-Z]*$/.test(l) && l.length <= 35 && i > 0) {
      break
    }

    // Contact-like content — keep expanding header
    if (/@/.test(l) || /\+?\d[\d\s\-().]{6,}/.test(l) ||
        /linkedin\.com|github\.com/i.test(l) || i < 2) {
      headerEndIdx = i + 1
      continue
    }

    // Bullet point means body has started
    if (/^[-•*]/.test(l)) {
      break
    }
  }

  // Ensure at least 2 lines in header (name + one contact line)
  headerEndIdx = Math.max(headerEndIdx, Math.min(2, lines.length))

  // ── Two-column line splitting ────────────────────────────────────────────
  // Some two-column PDF extractions put left+right column on the same line
  // separated by 3+ spaces. Split those into separate lines so section
  // detector and field extractor can process each column independently.
  const splitLines = []
  for (const line of lines) {
    // A significant whitespace gap (4+ spaces) between non-trivial content
    // indicates two-column merging regardless of the detected layoutType.
    // Split unconditionally — single-column resumes never have 4-space gaps mid-line.
    const gapMatch = line.match(/^(.{3,40})\s{4,}(.{3,}.*)$/)
    if (gapMatch) {
      splitLines.push(gapMatch[1].trimEnd())
      splitLines.push(gapMatch[2].trimStart())
    } else {
      splitLines.push(line)
    }
  }

  const headerEndIdxFinal = Math.max(headerEndIdx, Math.min(2, splitLines.length))
  const headerLinesFinal  = splitLines.slice(0, headerEndIdxFinal)
  const bodyLinesFinal    = splitLines.slice(headerEndIdxFinal)

  return {
    ...ctx,
    lines: splitLines,
    allLines,
    layoutType,
    headerLines: headerLinesFinal,
    bodyLines:   bodyLinesFinal,
    language,
  }
}
