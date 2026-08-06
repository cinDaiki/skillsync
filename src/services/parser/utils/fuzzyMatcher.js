/**
 * fuzzyMatcher.js
 * Levenshtein distance + Jaro-Winkler similarity for skill matching.
 * Used as tier-3 fallback when exact and alias lookups fail.
 */

/**
 * Compute Levenshtein edit distance between two strings.
 * Uses optimized single-row DP — O(min(a,b)) space.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} edit distance
 */
export function levenshtein(a, b) {
  if (a === b)          return 0
  if (a.length === 0)   return b.length
  if (b.length === 0)   return a.length

  // Ensure a is the shorter string for the row optimization
  if (a.length > b.length) { const t = a; a = b; b = t }

  const aLen = a.length
  const bLen = b.length
  let row = Array.from({ length: aLen + 1 }, (_, i) => i)

  for (let j = 1; j <= bLen; j++) {
    let prev = j
    for (let i = 1; i <= aLen; i++) {
      const val = a[i - 1] === b[j - 1]
        ? row[i - 1]
        : 1 + Math.min(row[i - 1], row[i], prev)
      row[i - 1] = prev
      prev = val
    }
    row[aLen] = prev
  }
  return row[aLen]
}

/**
 * Jaro similarity — good for short strings and transpositions.
 *
 * @param {string} s1
 * @param {string} s2
 * @returns {number} 0..1
 */
export function jaro(s1, s2) {
  if (s1 === s2) return 1
  const len1 = s1.length
  const len2 = s2.length
  if (len1 === 0 || len2 === 0) return 0

  const matchDistance = Math.floor(Math.max(len1, len2) / 2) - 1
  const s1Matches = new Array(len1).fill(false)
  const s2Matches = new Array(len2).fill(false)

  let matches = 0
  let transpositions = 0

  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDistance)
    const end   = Math.min(i + matchDistance + 1, len2)
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue
      s1Matches[i] = true
      s2Matches[j] = true
      matches++
      break
    }
  }

  if (matches === 0) return 0

  let k = 0
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue
    while (!s2Matches[k]) k++
    if (s1[i] !== s2[k]) transpositions++
    k++
  }

  return (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3
}

/**
 * Jaro-Winkler similarity — boosts score for common prefixes.
 *
 * @param {string} s1
 * @param {string} s2
 * @param {number} [p=0.1] prefix scale factor
 * @returns {number} 0..1
 */
export function jaroWinkler(s1, s2, p = 0.1) {
  const jaroSim = jaro(s1, s2)
  let l = 0
  const maxL = Math.min(4, Math.min(s1.length, s2.length))
  while (l < maxL && s1[l] === s2[l]) l++
  return jaroSim + l * p * (1 - jaroSim)
}

/**
 * Check if two skill strings are a fuzzy match.
 * Uses both Levenshtein and Jaro-Winkler for complementary coverage.
 *
 * Rules (from parserConfig.json):
 *   - Only attempt fuzzy for strings ≥ 7 chars (prevents false positives on short words)
 *   - Levenshtein distance ≤ 2
 *   - OR Jaro-Winkler ≥ 0.88
 *
 * @param {string} token        - raw token from resume
 * @param {string} candidate    - skill canonical or alias to compare
 * @param {number} [minLength=7]
 * @param {number} [maxDist=2]
 * @param {number} [jwThreshold=0.88]
 * @returns {{ match: boolean, score: number, method: string }}
 */
export function fuzzyMatch(token, candidate, minLength = 7, maxDist = 2, jwThreshold = 0.88) {
  const t = token.toLowerCase().trim()
  const c = candidate.toLowerCase().trim()

  if (t === c) return { match: true, score: 1.0, method: 'exact' }
  if (t.length < minLength || c.length < minLength) return { match: false, score: 0, method: 'skipped_short' }

  const jw = jaroWinkler(t, c)
  if (jw >= jwThreshold) return { match: true, score: jw, method: 'jaro-winkler' }

  const dist = levenshtein(t, c)
  if (dist <= maxDist) return { match: true, score: 1 - dist / Math.max(t.length, c.length), method: 'levenshtein' }

  return { match: false, score: jw, method: 'no-match' }
}
