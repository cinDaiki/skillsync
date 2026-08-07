/**
 * src/services/parser/ats/atsConfig.js
 * 
 * Default configuration for the ATS Scoring Engine.
 */

export const ATS_CONFIG = {
  // Category weighting for final score calculation
  categories: {
    completeness: { weight: 0.4, label: 'Completeness' },
    impact: { weight: 0.4, label: 'Impact & Content' },
    formatting: { weight: 0.2, label: 'Formatting & Length' }
  },

  // Scoring thresholds for assigning a final grade
  grades: {
    A: { min: 90, message: 'Excellent fit' },
    B: { min: 75, message: 'Good fit, minor improvements needed' },
    C: { min: 60, message: 'Average fit, missing some key elements' },
    D: { min: 0,  message: 'Needs significant improvement' }
  },

  // Target metrics for rules
  targets: {
    minWords: 200,
    maxWords: 1500,
    minExperienceBullets: 3,
    minSkills: 5,
    idealSkillDensityRatio: 0.05, // e.g., skills words / total words
    quantifiedMetricsRatio: 0.3 // 30% of experience bullets should have metrics
  }
}

export default ATS_CONFIG
