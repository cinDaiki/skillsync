// Presentation of server-owned results only. Never estimates a missing score.
export const MATCH_CALCULATION_VERSION = 'requirement-aware-6-factor-evidence-v1';
const validScore = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100;
const object = raw => {
  if (typeof raw !== 'string') return raw && typeof raw === 'object' ? raw : {};
  try { return JSON.parse(raw) || {}; } catch { return {}; }
};
const list = raw => Array.isArray(raw) ? raw.filter(x => typeof x === 'string') : [];

export function readJobMatchEvidence(application) {
  const snapshot = object(application?.applicant_snapshot);
  // Never attach a current calculation to a historical score, even if totals match.
  if (validScore(snapshot.application_time_match_score)) {
    return { score: snapshot.application_time_match_score, calculation: snapshot.application_time_match_calculation || null, historical: true };
  }
  if (validScore(application?.job_match?.match_score)) {
    return { score: application.job_match.match_score, calculation: application.job_match.match_calculation || null, historical: false };
  }
  if (application?.match_score_source === 'authoritative' && validScore(application.match_score)) {
    return { score: application.match_score, calculation: null, historical: true };
  }
  return { score: null, calculation: null, historical: false };
}

const factors = [
  ['skills', 'requiredSkillsScore', 'Required skills'],
  ['transferable', 'transferableSkillsScore', 'Transferable skills'],
  ['education', 'educationCompatibility', 'Education'],
  ['experience', 'experienceCompatibility', 'Experience'],
  ['credentials', 'credentialsScore', 'Certifications'],
  ['semantic', 'semanticRelevance', 'Resume and job context'],
];

export function explainJobMatch(raw, expectedScore) {
  const c = object(raw);
  if (c.version !== MATCH_CALCULATION_VERSION || !validScore(c.match_score) || c.match_score !== expectedScore) return null;
  const weights = c.applicable_weights || {};
  if (factors.some(([key, scoreKey]) => typeof weights[key] !== 'number' || !Number.isFinite(weights[key]) || weights[key] < 0 || !validScore(c.breakdown?.[scoreKey]))) return null;
  const totalWeight = factors.reduce((sum, [key]) => sum + weights[key], 0);
  if (typeof weights.total !== 'number' || !Number.isFinite(weights.total) || totalWeight <= 0 || Math.abs(totalWeight - weights.total) > 0.000001) return null;
  const rows = factors.map(([key, scoreKey, label]) => ({
    key, label, compatibility: c.breakdown[scoreKey], included: weights[key] > 0,
    points: c.breakdown[scoreKey] * weights[key] / totalWeight,
    maximum: 100 * weights[key] / totalWeight,
    ...factorEvidence(key, c),
  }));
  const total = rows.reduce((sum, row) => sum + row.points, 0);
  // PostgreSQL rounds float ties to even; decimal serialization and JS summation
  // can also differ at the last bit. Keep the server's rounded score authoritative.
  if (Math.abs(total - c.match_score) > 0.50000001) return null;
  return { rows, total, score: c.match_score, calculatedAt: c.calculated_at, version: c.version };
}

function factorEvidence(key, c) {
  const e = c.evidence || {};
  const found = list(c.matching_skills);
  const missing = list(c.missing_skills);
  const required = list(e.required_skills);
  const transferable = list(c.matched_transferable);
  switch (key) {
    case 'skills': return {
      basis: required.length ? `${found.length} of ${required.length} required skills matched using normalized skill names and aliases.` : 'No required skills listed; the existing rule awards full compatibility.',
      found, missing, source: 'Saved profile skills and extracted resume skills at calculation time',
    };
    case 'transferable': return {
      basis: list(e.required_transferable).length ? `${e.matched_required_transferable_count} of ${e.required_transferable.length} required transferable skills matched.` : transferable.length ? `No explicit transferable requirement. Existing rule: 50 baseline points plus 20 per recognized transferable skill, capped at 100, before conversion to contribution points.` : 'No explicit transferable requirement or recognized evidence. Existing rule assigns a 70/100 baseline; this is not a verified skill match.',
      found: transferable, source: 'Saved skill evidence and the controlled transferable-skills dictionary',
    };
    case 'education': return {
      basis: `Required: ${e.required_education || 'Not specified'}. Recorded education: ${e.candidate_education || 'Not provided'}. ${e.education_rule || ''}`,
      source: 'Candidate education record and job requirements at calculation time',
    };
    case 'experience': return {
      basis: `Required: ${e.experience_required || 'Not specified'}. Recorded experience: ${e.candidate_years ?? 'Not provided'} years. ${e.experience_rule || ''}`,
      source: 'Candidate profile experience and job requirements at calculation time',
    };
    case 'credentials': return {
      basis: list(e.required_certifications).length ? `${list(c.matched_certs).length} of ${e.required_certifications.length} required certifications matched by normalized name.` : 'No certifications required; excluded from the calculation.',
      found: list(c.matched_certs), missing: list(e.required_certifications).filter(x => !list(c.matched_certs).includes(x)), source: 'Saved certification records and employer requirements',
    };
    default: return {
      basis: c.applicable_weights.semantic > 0 ? 'Resume and job embeddings compared using cosine similarity, limited to 0–1 and rounded to a 0–100 compatibility value before conversion to contribution points. This is text similarity, not verified qualification evidence.' : 'Resume or job embedding unavailable; excluded without assigning a zero compatibility score.',
      source: 'Resume and job embeddings at calculation time',
    };
  }
}

export const formatMatchPoints = n => Number(n.toFixed(2)).toString();
