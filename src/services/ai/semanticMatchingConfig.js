/**
 * src/services/ai/semanticMatchingConfig.js
 * 
 * Configuration for Phase 5 Semantic Matching and Hybrid Ranking.
 */

export const SEMANTIC_MATCHING_CONFIG = {
  // Hybrid scoring weights used in the final ranking layer.
  // Must sum to 1.0 (recommended configuration).
  weights: {
    semantic: 0.50, // Weight for vector semantic similarity (0.0 - 1.0)
    skills: 0.30,   // Weight for rule-based matching skills (0.0 - 1.0)
    ats: 0.20       // Weight for resume ATS score (0.0 - 1.0)
  },

  // Configurable policy for candidate skill confidence scoring
  scoringPolicy: {
    // Skills with low-confidence matches will still count at least this much
    minimumConfidenceWeight: 0.50,
    
    // Scale the match contribution linearly between minimumConfidenceWeight and 1.0
    // based on candidate's skill detection confidence
    confidenceScaling: true
  }
};

export default SEMANTIC_MATCHING_CONFIG;
