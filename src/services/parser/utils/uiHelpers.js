/**
 * src/services/parser/utils/uiHelpers.js
 * 
 * Reusable data transformation helpers for the Resume parser UI.
 * Keeps business logic decoupled from React rendering cycles.
 */

import { normalizeSkillName } from '../../normalization.js';

/**
 * Groups candidate skills by their category.
 * Handles both legacy flat string lists and rich skill objects.
 * 
 * @param {Array<string|object>} skills - Array of candidate skills
 * @returns {Record<string, Array<object>>} Category mapped to parsed skill objects
 */
export function groupSkillsByCategory(skills) {
  const groups = {};
  if (!Array.isArray(skills)) return groups;

  skills.forEach(skill => {
    if (typeof skill === 'string') {
      const category = 'General Skills';
      if (!groups[category]) groups[category] = [];
      groups[category].push({
        canonicalName: skill,
        category,
        confidenceScore: 100,
        occurrences: 1,
        raw: skill
      });
    } else if (skill && typeof skill === 'object') {
      const category = skill.category || 'Other / Generic';
      if (!groups[category]) groups[category] = [];
      groups[category].push({
        canonicalName: skill.canonicalName || skill.normalized || skill.name || 'Unknown',
        category,
        confidenceScore: skill.confidenceScore !== undefined 
          ? skill.confidenceScore 
          : (skill.confidence !== undefined ? Math.round(skill.confidence * 100) : 90),
        occurrences: skill.occurrences || 1,
        raw: skill.raw || ''
      });
    }
  });

  return groups;
}

/**
 * Maps ATS numerical scores (0-100) to qualitative rating classes and label strings.
 * 
 * @param {number} score 
 * @returns {{ label: string, class: string }}
 */
export function getScoreRating(score) {
  const s = Number(score) || 0;
  if (s >= 90) return { label: 'Excellent alignment', class: 'excellent' };
  if (s >= 75) return { label: 'Good alignment', class: 'good' };
  if (s >= 50) return { label: 'Fair alignment', class: 'fair' };
  return { label: 'Needs adjustments', class: 'poor' };
}

/**
 * Helper to measure rendering performance inside components.
 * Restricts logger outputs only to non-production DEV runs.
 * 
 * @param {string} label - Profiler label name
 * @param {number} startTime - performance.now() marker
 */
export function logPerfMetric(label, startTime) {
  // Check development env context
  const isDev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;
  if (isDev) {
    const elapsed = (performance.now() - startTime).toFixed(2);
    console.log(`[Perf] ${label} completed in ${elapsed}ms`);
  }
}
