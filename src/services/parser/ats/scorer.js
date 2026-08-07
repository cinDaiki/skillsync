/**
 * src/services/parser/ats/scorer.js
 * 
 * Runs the ATS rules against the parsed resume and aggregates scores by category.
 */

import { RULES } from './rules.js';

/**
 * Runs all rules on the parsed resume.
 * @param {object} parsedResume 
 * @param {object} config 
 * @returns {object} Raw results from each rule and category subtotals
 */
export function calculateRawScores(parsedResume, config) {
  const ruleResults = [];
  const categoryTotals = {
    completeness: { earned: 0, max: 0 },
    impact: { earned: 0, max: 0 },
    formatting: { earned: 0, max: 0 }
  };

  for (const rule of RULES) {
    const { score, passed, feedback } = rule.evaluate(parsedResume, config);
    
    // Ensure the score doesn't exceed the max (sanity check)
    const safeScore = Math.max(0, Math.min(score, rule.maxScore));

    ruleResults.push({
      id: rule.id,
      category: rule.category,
      maxScore: rule.maxScore,
      earned: safeScore,
      passed,
      feedback
    });

    if (categoryTotals[rule.category]) {
      categoryTotals[rule.category].earned += safeScore;
      categoryTotals[rule.category].max += rule.maxScore;
    }
  }

  return { ruleResults, categoryTotals };
}

/**
 * Normalizes the raw scores using category weights to produce a 0-100 final score.
 * @param {object} categoryTotals 
 * @param {object} config 
 * @returns {number} Final normalized score (0-100)
 */
export function calculateFinalScore(categoryTotals, config) {
  let finalScore = 0;
  let totalWeightUsed = 0;

  for (const [category, totals] of Object.entries(categoryTotals)) {
    if (totals.max > 0) {
      const categoryWeight = config.categories[category]?.weight || 0;
      const categoryPercent = totals.earned / totals.max;
      finalScore += categoryPercent * categoryWeight;
      totalWeightUsed += categoryWeight;
    }
  }

  // If some categories had 0 max score, normalize out of the available weights
  if (totalWeightUsed > 0 && totalWeightUsed < 1) {
    finalScore = finalScore / totalWeightUsed;
  }

  return Math.round(finalScore * 100);
}
