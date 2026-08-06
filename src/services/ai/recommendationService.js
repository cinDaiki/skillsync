/**
 * recommendationService.js
 *
 * Generates human-readable AI recommendation text based on match analysis.
 * Pure functions — no API calls, no async.
 */

/**
 * Generate an AI recommendation sentence based on overall match score,
 * missing skills, and job title.
 *
 * @param {number}   score         - overall hybrid match % (0–100)
 * @param {string[]} matchedSkills - skills the candidate has
 * @param {string[]} missingSkills - skills the candidate lacks
 * @param {string}   jobTitle      - name of the position
 * @returns {string}
 */
export function generateMatchRecommendation(score, matchedSkills, missingSkills, jobTitle) {
  const title = jobTitle || 'this position'
  const top3missing = missingSkills.slice(0, 3)

  if (score >= 90) {
    return `Excellent fit for ${title}. Your profile closely aligns with the job requirements${
      matchedSkills.length > 0
        ? ` — strong proficiency in ${matchedSkills.slice(0, 3).join(', ')}`
        : ''
    }. Highly recommended to apply immediately.`
  }

  if (score >= 80) {
    const gap = top3missing.length > 0
      ? ` Strengthening ${top3missing.join(' and ')} would make you an ideal candidate.`
      : ''
    return `Strong candidate for ${title}. Your skill set covers most requirements.${gap}`
  }

  if (score >= 65) {
    const gap = top3missing.length > 0
      ? ` Focus on closing gaps in: ${top3missing.join(', ')}.`
      : ''
    return `Good potential for ${title}. You meet the core requirements with room to grow.${gap}`
  }

  if (score >= 50) {
    const gap = top3missing.length > 0
      ? ` Key areas to develop: ${top3missing.join(', ')}.`
      : ''
    return `Partial match for ${title}. Consider upskilling before applying.${gap}`
  }

  const gap = top3missing.length > 0
    ? ` Priority skills to learn: ${top3missing.join(', ')}.`
    : ''
  return `This role requires skills not yet reflected in your profile.${gap} Completing the learning path below will significantly improve your compatibility.`
}

/**
 * Generate a short match tier label.
 *
 * @param {number} score
 * @returns {{ label: string, color: string, bg: string }}
 */
export function getMatchTier(score) {
  if (score >= 90) return { label: 'Excellent Match',  color: '#16a34a', bg: '#dcfce7' }
  if (score >= 80) return { label: 'Strong Match',     color: '#2563eb', bg: '#dbeafe' }
  if (score >= 65) return { label: 'Good Match',       color: '#7c3aed', bg: '#ede9fe' }
  if (score >= 50) return { label: 'Partial Match',    color: '#d97706', bg: '#fef3c7' }
  return              { label: 'Low Match',            color: '#dc2626', bg: '#fee2e2' }
}

/**
 * Generate employer-side candidate recommendation.
 *
 * @param {number}   score
 * @param {string[]} strengths
 * @param {string[]} gaps
 * @param {string}   candidateName
 * @returns {string}
 */
export function generateCandidateRecommendation(score, strengths, gaps, candidateName) {
  const name = candidateName || 'This candidate'
  const top3strengths = strengths.slice(0, 3)
  const top2gaps = gaps.slice(0, 2)

  if (score >= 85) {
    return `${name} is highly recommended for interview. ${
      top3strengths.length > 0 ? `Demonstrated strengths in ${top3strengths.join(', ')}.` : ''
    }`
  }

  if (score >= 70) {
    const gapNote = top2gaps.length > 0 ? ` May need training on ${top2gaps.join(' and ')}.` : ''
    return `${name} is a solid candidate worth interviewing.${gapNote}`
  }

  if (score >= 50) {
    return `${name} partially meets requirements. Review their full profile before deciding.`
  }

  return `${name}'s profile does not closely match the job requirements at this time.`
}
