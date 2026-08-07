/**
 * sourceCollector.js
 * Extracts searchable text blocks from pipeline context with source metadata.
 */

/** @typedef {{ source: string, text: string }} SourceBlock */

/**
 * @param {object} ctx Pipeline context after P07
 * @returns {SourceBlock[]}
 */
export function collectSourceBlocks(ctx) {
  /** @type {SourceBlock[]} */
  const blocks = []

  const push = (source, text) => {
    const value = (text || '').toString().trim()
    if (value) blocks.push({ source, text: value })
  }

  const skillsSection = ctx.sections?.get?.('SKILLS')
  if (skillsSection?.lines?.length) {
    push('Skills', skillsSection.lines.join('\n'))
  }

  if (ctx.summary) {
    push('Summary', ctx.summary)
  }

  if (Array.isArray(ctx.experience)) {
    const expText = ctx.experience.map(entry => {
      const parts = [
        entry.title?.normalized || entry.title?.raw,
        entry.company?.normalized || entry.company?.raw,
        ...(entry.responsibilities || []),
      ].filter(Boolean)
      return parts.join('\n')
    }).join('\n\n')
    push('Experience', expText)
  }

  if (Array.isArray(ctx.projects)) {
    const projText = ctx.projects.map(entry => {
      const parts = [
        entry.name?.normalized || entry.name?.raw,
        entry.description?.normalized || entry.description?.raw,
        ...(entry.responsibilities || []),
      ].filter(Boolean)
      return parts.join('\n')
    }).join('\n\n')
    push('Projects', projText)
  }

  if (Array.isArray(ctx.education)) {
    const eduText = ctx.education.map(entry => [
      entry.degree?.normalized || entry.degree?.raw,
      entry.institution?.normalized || entry.institution?.raw,
    ].filter(Boolean).join('\n')).join('\n\n')
    push('Education', eduText)
  }

  if (Array.isArray(ctx.certifications)) {
    const certText = ctx.certifications.map(entry =>
      entry.name?.normalized || entry.name?.raw || ''
    ).filter(Boolean).join('\n')
    push('Certification', certText)
  }

  if (blocks.length === 0 && ctx.normalizedText) {
    push('Skills', ctx.normalizedText)
  }

  return blocks
}
