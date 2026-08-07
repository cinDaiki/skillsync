/**
 * src/services/parser/ats/index.js
 * 
 * Public entry point for the ATS Scoring & Feedback Engine (Phase 4).
 */

import { ATS_CONFIG } from './atsConfig.js';
import { calculateRawScores, calculateFinalScore } from './scorer.js';
import { generateFeedbackReport } from './feedback.js';
import { buildReport } from './reportBuilder.js';

/**
 * Evaluates a parsed resume and generates an ATS score and feedback report.
 * 
 * @param {object} parsedResume - The structured resume output from the parser
 * @param {object} [options] - Optional settings (e.g., jobRequirements, custom config)
 * @returns {object} The full ATS report
 */
export function evaluateATS(parsedResume, options = {}) {
  const config = options.config || ATS_CONFIG;
  const jobRequirements = options.jobRequirements || null;

  if (!parsedResume) {
    throw new Error('evaluateATS requires a valid parsedResume object');
  }

  // 1. Run Scorer (P12)
  const { ruleResults, categoryTotals } = calculateRawScores(parsedResume, config);
  const finalScore = calculateFinalScore(categoryTotals, config);

  // Determine Letter Grade
  let gradeLetter = 'D';
  let gradeMessage = config.grades.D.message;
  for (const [letter, data] of Object.entries(config.grades)) {
    if (finalScore >= data.min) {
      gradeLetter = letter;
      gradeMessage = data.message;
      break; // grades are usually defined highest to lowest, wait, in atsConfig they are A, B, C, D so it works if ordered correctly. 
      // Actually object iteration order is insertion order, but let's be safe.
    }
  }

  // Actually, Object.entries might not guarantee order. Let's sort to be safe:
  const sortedGrades = Object.entries(config.grades).sort((a, b) => b[1].min - a[1].min);
  for (const [letter, data] of sortedGrades) {
    if (finalScore >= data.min) {
      gradeLetter = letter;
      gradeMessage = data.message;
      break;
    }
  }

  // 2. Run Feedback Engine (P13)
  const feedback = generateFeedbackReport(ruleResults);

  // 3. Assemble Final Report
  const gradeObj = { letter: gradeLetter, message: gradeMessage };
  return buildReport(finalScore, gradeObj, ruleResults, feedback, parsedResume, jobRequirements);
}
