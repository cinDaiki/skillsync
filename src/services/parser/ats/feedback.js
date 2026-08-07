/**
 * src/services/parser/ats/feedback.js
 * 
 * Processes raw rule results to categorize and generate a structured feedback report.
 */

export function generateFeedbackReport(ruleResults) {
  const critical = [];
  const recommended = [];
  const strengths = [];

  for (const rule of ruleResults) {
    if (rule.passed) {
      // It's a strength if it passed and carries significant weight
      if (rule.maxScore >= 10 && !rule.feedback) {
        strengths.push({
          id: rule.id,
          category: rule.category,
          message: `Excellent ${rule.id.replace('_', ' ')}.`
        });
      }
    } else if (rule.feedback) {
      // Failed rules. If they are highly weighted (>= 10), they are critical.
      const isCritical = rule.maxScore >= 10;
      const issue = {
        id: rule.id,
        category: rule.category,
        message: rule.feedback
      };

      if (isCritical) {
        critical.push(issue);
      } else {
        recommended.push(issue);
      }
    }
  }

  return {
    critical,
    recommended,
    strengths
  };
}
