/**
 * src/services/parser/ats/reportBuilder.js
 * 
 * Assembles the final structured ATS report.
 */

/**
 * Builds the final ATS report object.
 * 
 * @param {number} finalScore 0-100 score
 * @param {object} grade { min, message } based on score
 * @param {Array} ruleResults the raw results from scorer
 * @param {object} feedback { critical, recommended, strengths }
 * @param {object} parsedResume the original parsed resume
 * @param {object} [jobRequirements] optional job requirements for skill analysis
 * @returns {object} Final ATS Report
 */
export function buildReport(finalScore, grade, ruleResults, feedback, parsedResume, jobRequirements = null) {
  
  // Calculate confidence based on the parser's internal confidences
  // E.g., average confidence of name, contact fields, etc., or we can use a simpler metric.
  const nameConf = parsedResume.contact?.name?.confidence || 0;
  const emailConf = parsedResume.contact?.email?.confidence || 0;
  const confidenceScore = Math.round(((nameConf + emailConf) / 2) * 100) || 85; // fallback to 85%

  // Build skill analysis
  const skillAnalysis = {
    matched: [],
    missing: [],
    extra: []
  };

  const candidateSkills = (parsedResume.skills || []).map(s => s.normalized?.toLowerCase());

  if (jobRequirements && Array.isArray(jobRequirements.skills)) {
    const requiredSkills = jobRequirements.skills.map(s => s.toLowerCase());
    
    // Matched: Candidate has it AND Job requires it
    skillAnalysis.matched = (parsedResume.skills || []).filter(s => 
      requiredSkills.includes(s.normalized?.toLowerCase())
    );

    // Missing: Job requires it, candidate doesn't have it
    skillAnalysis.missing = jobRequirements.skills.filter(s => 
      !candidateSkills.includes(s.toLowerCase())
    );

    // Extra: Candidate has it, job doesn't explicitly require it
    skillAnalysis.extra = (parsedResume.skills || []).filter(s => 
      !requiredSkills.includes(s.normalized?.toLowerCase())
    );
  } else {
    // If no job requirements provided, all skills are "extra/additional" technically, 
    // but typically we just list them under matched/extra or leave empty.
    skillAnalysis.extra = parsedResume.skills || [];
  }

  return {
    score: finalScore,
    grade: Object.entries(grade).find(([k]) => k === 'message') ? grade : { message: grade.message, letter: grade.letter },
    confidenceScore,
    ruleResults: ruleResults.map(r => ({
      id: r.id,
      category: r.category,
      earned: r.earned,
      max: r.maxScore,
      passed: r.passed,
      feedback: r.feedback
    })),
    feedback,
    skillAnalysis
  };
}
