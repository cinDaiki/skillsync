/**
 * jobQualityService.js
 *
 * Automated Job Posting Quality & Candidate Pool Readiness Insights for Employers.
 * Evaluates job description clarity, skill requirements balance, salary transparency,
 * and experience/education specification completeness.
 */

export function evaluateJobPostingQuality(job = {}) {
  let score = 100;
  const strengths = [];
  const warnings = [];
  const suggestions = [];

  // 1. Title Clarity
  if (!job.title || job.title.trim().length < 3) {
    score -= 20;
    warnings.push('Job title is unstated or too brief.');
    suggestions.push('Provide a standard role title (e.g. Senior Web Developer).');
  } else {
    strengths.push('Standard, clear job title.');
  }

  // 2. Description Completeness
  const descLen = (job.description || '').trim().length;
  if (descLen === 0) {
    score -= 25;
    warnings.push('Job description is missing.');
    suggestions.push('Add a detailed overview of responsibilities and working environment.');
  } else if (descLen < 100) {
    score -= 10;
    warnings.push('Job description is brief (under 100 characters).');
    suggestions.push('Expand job details to help candidates understand expectations.');
  } else {
    strengths.push('Detailed job description.');
  }

  // 3. Required Skills Balance
  const skillsList = job.required_skills
    ? (typeof job.required_skills === 'string' ? job.required_skills.split(',') : job.required_skills)
    : [];

  if (skillsList.length === 0) {
    score -= 20;
    warnings.push('No required skills specified.');
    suggestions.push('List 3–6 key skills to enable AI candidate matching.');
  } else if (skillsList.length > 8) {
    score -= 10;
    warnings.push(`High skill count (${skillsList.length} skills required).`);
    suggestions.push('Consider marking non-essential technical skills as preferred to broaden your candidate pool.');
  } else {
    strengths.push(`Balanced skill requirements (${skillsList.length} skills listed).`);
  }

  // 4. Salary Transparency
  if (!job.salary_range || job.salary_range.trim().length < 3) {
    score -= 10;
    warnings.push('Salary range not provided.');
    suggestions.push('Including a salary estimate increases candidate application rate by up to 30%.');
  } else {
    strengths.push('Transparent salary range included.');
  }

  // 5. Education & Experience Specification
  if (!job.required_education) {
    suggestions.push('Specify education requirement (or mark "Any / High School") to assist matching.');
  }
  if (!job.experience_required) {
    suggestions.push('Specify experience level (e.g. 1–2 years or Entry Level).');
  }

  const finalScore = Math.max(0, Math.min(100, score));
  let statusLabel = 'Excellent Quality';
  if (finalScore < 70) statusLabel = 'Needs Improvement';
  else if (finalScore < 85) statusLabel = 'Good Quality';

  return {
    qualityScore: finalScore,
    statusLabel,
    strengths,
    warnings,
    suggestions
  };
}
