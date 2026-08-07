/**
 * tokenizer.js
 * Splits resume text into candidate skill tokens and n-grams for dictionary lookup.
 */

/**
 * @param {string} text
 * @param {import('../config/skillRecognitionConfig.js').default} config
 * @returns {string[]}
 */
export function tokenizeText(text, config) {
  if (!text?.trim()) return []

  const { delimiters, minTokenLength, maxNgramSize } = config.tokenization
  const delimiterPattern = new RegExp(
    `[${delimiters.map(d => d.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')).join('')}\\n]+`
  )

  const tokens = new Set()

  text.split('\n').forEach(line => {
    line.split(delimiterPattern)
      .map(segment => segment.trim())
      .filter(segment => segment.length >= minTokenLength)
      .forEach(segment => {
        tokens.add(segment)

        const parts = segment.split(/\s+/).filter(Boolean)
        if (parts.length >= 2) {
          for (let i = 0; i < parts.length; i++) {
            for (let size = 2; size <= Math.min(maxNgramSize, parts.length - i); size++) {
              tokens.add(parts.slice(i, i + size).join(' '))
            }
          }
        }
      })
  })

  return [...tokens]
}
