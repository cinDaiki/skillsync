/**
 * p03-normalizer.js
 * Cleans and normalizes text before section detection.
 *
 * Actions:
 *   - Strip zero-width / invisible characters
 *   - Normalize unicode to NFC
 *   - Normalize bullet characters → "- "
 *   - Normalize smart quotes, em dashes
 *   - Merge soft-wrapped lines (continuation detection)
 *   - Collapse excessive whitespace
 *
 * Outputs:
 *   ctx.normalizedText   — cleaned full text
 *   ctx.normalizedLines  — cleaned lines array (trimmed, non-empty)
 */

// Bullet characters to normalize → "- "
const BULLET_RE = /^[\s]*[•◆▸▪■→✔✓▶◉○●►·‣⁃]\s*/gm

// Zero-width and invisible chars
const INVISIBLE_RE = /[\u200B\u200C\u200D\uFEFF\u00AD\u2060]/g

// Non-breaking space → regular space
const NBSP_RE = /\u00A0/g

// Multiple spaces (not newlines) → single space
const MULTI_SPACE_RE = /[ \t]{2,}/g

// 3+ consecutive newlines → 2
const MULTI_NL_RE = /\n{3,}/g

/**
 * @param {object} ctx
 * @param {string} ctx.rawText
 * @param {string[]} ctx.lines
 * @returns {object} ctx with normalizedText and normalizedLines
 */
export function normalizeText(ctx) {
  let text = ctx.rawText

  // 1. Remove invisible chars
  text = text.replace(INVISIBLE_RE, '')
  text = text.replace(NBSP_RE, ' ')

  // 2. Normalize unicode
  text = text.normalize('NFC')

  // 3. Normalize bullet chars → "- "
  text = text.replace(BULLET_RE, (match) => {
    const indent = match.match(/^(\s*)/)[1]
    return indent + '- '
  })

  // 4. Normalize smart quotes
  text = text.replace(/[\u2018\u2019\u0060\u00B4]/g, "'")
  text = text.replace(/[\u201C\u201D]/g, '"')

  // 5. Normalize em/en dashes used as separators in date ranges
  //    Preserve them as " - " so dateParser can find them
  text = text.replace(/\s*[\u2013\u2014]\s*/g, ' - ')

  // 6. Collapse multiple spaces (preserve newlines)
  text = text.replace(MULTI_SPACE_RE, ' ')

  // 7. Collapse excessive blank lines
  text = text.replace(MULTI_NL_RE, '\n\n')

  // 8. Merge soft-wrapped lines
  //    A line is a continuation if:
  //      - Current line doesn't end with sentence punctuation or a colon
  //      - Next line starts with a lowercase letter
  //      - Current line is at least 20 chars (not a header)
  const rawLines = text.split('\n')
  const merged   = []
  let skip = false

  for (let i = 0; i < rawLines.length; i++) {
    if (skip) { skip = false; continue }

    const curr = rawLines[i].trimEnd()
    const next = rawLines[i + 1]?.trim()

    const isContinuation = (
      curr.trim().length >= 20 &&
      next && next.length > 0 &&
      !/[.!?:,;]$/.test(curr.trim()) &&
      /^[a-z]/.test(next) &&
      // Next line is not a bullet point
      !/^[-•]/.test(next)
    )

    if (isContinuation) {
      merged.push(curr + ' ' + next)
      skip = true
    } else {
      merged.push(curr)
    }
  }

  const normalizedText  = merged.join('\n').trim()
  const normalizedLines = normalizedText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)

  return {
    ...ctx,
    normalizedText,
    normalizedLines,
  }
}
