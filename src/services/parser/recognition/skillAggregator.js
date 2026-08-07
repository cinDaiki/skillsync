/**
 * skillAggregator.js
 * Deduplicates skill hits, merges sources, and computes weighted confidence scores.
 */

/**
 * @typedef {object} RecognizedSkill
 * @property {string} canonicalName
 * @property {string[]} aliasesMatched
 * @property {string} category
 * @property {number} confidence
 * @property {number} occurrences
 * @property {Array<{ source: string, matchedText: string, method: string, weight: number, matchConfidence: number }>} sources
 * @property {string[]} matchedText
 */

/**
 * @param {Array<{ source: string, entry: object, method: string, matchedText: string, matchConfidence: number, isCanonical: boolean }>} hits
 * @param {object} config
 * @returns {RecognizedSkill[]}
 */
export function aggregateSkillHits(hits, config) {
  /** @type {Map<string, RecognizedSkill & { sourceTypes: Set<string>, aliasSet: Set<string>, textSet: Set<string> }>} */
  const grouped = new Map()

  for (const hit of hits) {
    const canonical = hit.entry.canonical
    const key = canonical.toLowerCase()

    if (!grouped.has(key)) {
      grouped.set(key, {
        canonicalName: canonical,
        category: hit.entry.category,
        aliasesMatched: [],
        confidence: 0,
        occurrences: 0,
        sources: [],
        matchedText: [],
        sourceTypes: new Set(),
        aliasSet: new Set(),
        textSet: new Set(),
      })
    }

    const agg = grouped.get(key)
    agg.occurrences += 1
    agg.textSet.add(hit.matchedText)

    if (!hit.isCanonical && hit.matchedText.toLowerCase() !== canonical.toLowerCase()) {
      agg.aliasSet.add(hit.matchedText)
    }

    if (!agg.sourceTypes.has(hit.source)) {
      agg.sourceTypes.add(hit.source)
      const methodKey = hit.method.startsWith('fuzzy') ? 'fuzzy' : hit.method
      const methodConfig = config.matchMethods[methodKey] || config.matchMethods.boundary

      agg.sources.push({
        source: hit.source,
        matchedText: hit.matchedText,
        method: hit.method,
        weight: config.sourceWeights[hit.source] || 0,
        matchConfidence: hit.matchConfidence,
        weightMultiplier: methodConfig.weightMultiplier ?? 1,
      })
    }
  }

  const results = []

  for (const agg of grouped.values()) {
    const confidence = Math.min(
      config.confidence.maxScore,
      agg.sources.reduce((sum, source) => {
        const multiplier = source.weightMultiplier ?? 1
        return sum + Math.round(source.weight * multiplier)
      }, 0)
    )

    if (confidence < config.confidence.minReportThreshold) continue

    results.push({
      canonicalName: agg.canonicalName,
      aliasesMatched: [...agg.aliasSet],
      category: agg.category,
      confidence,
      occurrences: agg.occurrences,
      sources: agg.sources.map(({ weightMultiplier, ...rest }) => rest),
      matchedText: [...agg.textSet],
    })
  }

  return results.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence
    return b.occurrences - a.occurrences
  })
}

/**
 * Converts Phase 3 skill objects to legacy pipeline shape (0–1 confidence).
 *
 * @param {RecognizedSkill} skill
 * @returns {object}
 */
export function toLegacySkillShape(skill) {
  const primary = skill.sources[0] || {}
  const legacyConfidence = Math.round((skill.confidence / 100) * 100) / 100

  return {
    raw: skill.matchedText[0] || skill.canonicalName,
    normalized: skill.canonicalName,
    category: skill.category,
    confidence: legacyConfidence,
    confidenceScore: skill.confidence,
    method: primary.method || 'dictionary',
    matchedPattern: primary.matchedText || skill.canonicalName,
    reason: `Detected in ${skill.sources.map(s => s.source).join(', ')} (${skill.occurrences} occurrence${skill.occurrences === 1 ? '' : 's'})`,
    canonicalName: skill.canonicalName,
    aliasesMatched: skill.aliasesMatched,
    occurrences: skill.occurrences,
    sources: skill.sources,
    matchedText: skill.matchedText,
  }
}
