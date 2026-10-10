/**
 * AIMatchReport.jsx
 *
 * Reusable modal showing the full AI Match Report for a candidate ↔ job pair.
 * Used by both AIJobMatches (candidate view) and Applicants (employer view).
 *
 * Props:
 *   job           {object}   – job row (title, company, etc.)
 *   matchScore    {number}   – overall hybrid % (0–100)
 *   semanticScore {number}   – cosine semantic % (0–100)
 *   matchedSkills {string[]} – skills the candidate has
 *   missingSkills {string[]} – skills the candidate lacks
 *   recommendation {string}  – AI recommendation text
 *   educationMatch {string}  – degree/education label
 *   experienceYrs  {number}  – years of experience
 *   onClose        {fn}      – close handler
 *   onApply        {fn}      – optional apply handler (candidate view)
 *   applied        {bool}    – whether already applied
 *   mode           {string}  – 'candidate' | 'employer'
 *   candidateName  {string}  – (employer view) candidate's name
 */

import { useState } from 'react'
import { getMatchTier } from '../../services/ai/recommendationService'
import CandidateMatchStatusBanner from '../candidate/CandidateMatchStatusBanner'
import ImproveMatchModal from '../candidate/ImproveMatchModal'
import { recalculateAuthoritativeMatch } from '../../services/applicationService'
import { getCareerRelevanceTier, getCareerRelevanceEvidenceBullets, getCategoryLabel, getSubcategoryLabel } from '../../services/careerRelevanceService'
import './AIMatchReport.css'

export default function AIMatchReport({
  job,
  matchScore               = 0,
  semanticScore            = 0,
  careerRelevanceScore     = null,
  careerRelevanceBreakdown = null,
  matchedSkills            = [],
  missingSkills            = [],
  recommendation           = '',
  educationMatch           = '',
  experienceYrs            = 0,
  onClose,
  onApply,
  applied                  = false,
  mode                     = 'candidate',
  candidateName            = '',
  onMatchUpdated,
}) {
  const [currentScore, setCurrentScore] = useState(matchScore)
  const [currentMatchedSkills, setCurrentMatchedSkills] = useState(matchedSkills)
  const [currentMissingSkills, setCurrentMissingSkills] = useState(missingSkills)
  const [showImproveModal, setShowImproveModal] = useState(false)
  const [recalculating, setRecalculating] = useState(false)

  const tier = getMatchTier(currentScore)
  const reqScore = typeof job?.minimum_match_percentage === 'number' ? job.minimum_match_percentage : 70
  const isEligible = currentScore >= reqScore

  async function handleRecalculate() {
    if (!job?.id || recalculating) return
    setRecalculating(true)
    try {
      const res = await recalculateAuthoritativeMatch(job.id)
      if (res.success) {
        setCurrentScore(res.matchScore)
        if (res.eligibility) {
          setCurrentMatchedSkills(res.eligibility.matchingSkills || [])
          setCurrentMissingSkills(res.eligibility.missingSkills || [])
        }
        if (onMatchUpdated) onMatchUpdated(job.id, res.matchScore)
      }
    } catch (err) {
      console.warn("Recalculate match error:", err)
    } finally {
      setRecalculating(false)
    }
  }

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onClose?.()
  }

  return (
    <div className="ai-report-overlay" onClick={handleOverlayClick}>
      <div className="ai-report-modal">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="ai-report-header">
          <div className="ai-report-title-row">
            <span className="ai-report-badge">🤖 AI Match Report</span>
            <button className="ai-report-close" onClick={onClose}>×</button>
          </div>
          <h2 className="ai-report-job-title">
            {mode === 'employer' && candidateName
              ? candidateName
              : (job?.title || 'Job Position')}
          </h2>
          {mode === 'candidate' && (
            <p className="ai-report-company">
              {job?.company_name || job?.location || ''}
            </p>
          )}
        </div>

        {/* ── Overall Score ───────────────────────────────────────────── */}
        <div className="ai-report-score-section">
          <div className="ai-report-score-main">
            <span className="ai-report-score-number">{currentScore}%</span>
            <span className="ai-report-score-label">Overall Match</span>
          </div>

          <div className="ai-report-progress-wrap">
            <div className="ai-report-progress-bar">
              <div
                className="ai-report-progress-fill"
                style={{ width: `${currentScore}%`, background: tier.color }}
              />
            </div>
            <span
              className="ai-report-tier-badge"
              style={{ color: tier.color, background: tier.bg }}
            >
              {tier.label}
            </span>
          </div>

          <div className="ai-report-sub-scores">
            <div className="ai-sub-score">
              <span className="ai-sub-score-val">{semanticScore}%</span>
              <span className="ai-sub-score-lbl">Semantic AI</span>
            </div>
            <div className="ai-sub-score">
              <span className="ai-sub-score-val">{matchedSkills.length}</span>
              <span className="ai-sub-score-lbl">Skills Matched</span>
            </div>
            <div className="ai-sub-score">
              <span className="ai-sub-score-val">{missingSkills.length}</span>
              <span className="ai-sub-score-lbl">Skill Gaps</span>
            </div>
            <div className="ai-sub-score">
              <span className="ai-sub-score-val">
                {(() => {
                  const rel = careerRelevanceScore ?? job?.career_relevance_score ?? job?.careerRelevanceScore;
                  return rel !== null && rel !== undefined && !Number.isNaN(Number(rel)) ? `${Math.round(Number(rel))}%` : (job?.job_category ? 'Pending' : 'N/A');
                })()}
              </span>
              <span className="ai-sub-score-lbl">Career Relevance</span>
            </div>
          </div>
        </div>

        {/* ── Eligibility Badge for Candidate ── */}
        {mode === 'candidate' && (() => {
          const reqScore = typeof job?.minimum_match_percentage === 'number' ? job.minimum_match_percentage : 70;
          const isEligible = matchScore >= reqScore;
          const gap = Math.max(0, reqScore - matchScore);
          return (
            <div style={{
              margin: "12px 0 16px 0",
              padding: "10px 14px",
              borderRadius: "8px",
              background: isEligible ? "#f0fdf4" : "#fef2f2",
              border: `1px solid ${isEligible ? "#bbf7d0" : "#fecaca"}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "13px"
            }}>
              <span style={{ fontWeight: "700", color: isEligible ? "#166534" : "#991b1b" }}>
                {isEligible ? "✓ Eligible to Apply" : "⚠ Below Minimum Requirement"}
              </span>
              <span style={{ color: isEligible ? "#15803d" : "#b91c1c" }}>
                Your Match: <strong>{matchScore}%</strong> · Required: <strong>{reqScore}%</strong>
                {!isEligible && ` (${gap}% needed)`}
              </span>
            </div>
          );
        })()}

        {/* ── Career Field & Occupational Alignment Section ── */}
        {(() => {
          const relScore = careerRelevanceScore ?? job?.career_relevance_score ?? job?.careerRelevanceScore ?? null;
          const breakdown = careerRelevanceBreakdown ?? job?.career_relevance_breakdown ?? job?.careerRelevanceBreakdown ?? null;
          const hasRelScore = relScore !== null && relScore !== undefined && !Number.isNaN(Number(relScore));
          const tier = hasRelScore ? getCareerRelevanceTier(relScore) : null;
          const bullets = getCareerRelevanceEvidenceBullets(breakdown, job?.job_category);
          const domainSkills = breakdown?.domainSkills || [];

          return (
            <div style={{
              margin: "16px 0",
              padding: "14px 18px",
              borderRadius: "10px",
              background: "#f8fafc",
              border: "1px solid #e2e8f0"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "8px" }}>
                <h4 style={{ color: "#1e1b4b", margin: 0, fontSize: "14px", fontWeight: "800" }}>
                  🧭 Career Field & Occupational Alignment
                </h4>
                {hasRelScore ? (
                  <span style={{
                    fontSize: "12px",
                    fontWeight: "800",
                    padding: "3px 10px",
                    borderRadius: "12px",
                    background: relScore >= 80 ? "#ecfdf5" : relScore >= 60 ? "#eff6ff" : relScore >= 40 ? "#fffbeb" : "#f1f5f9",
                    color: relScore >= 80 ? "#065f46" : relScore >= 60 ? "#1e40af" : relScore >= 40 ? "#92400e" : "#475569",
                    border: `1px solid ${relScore >= 80 ? "#a7f3d0" : relScore >= 60 ? "#bfdbfe" : relScore >= 40 ? "#fde68a" : "#cbd5e1"}`
                  }}>
                    {tier.icon} {tier.label} ({relScore}%)
                  </span>
                ) : (
                  <span style={{
                    fontSize: "11px",
                    fontWeight: "700",
                    padding: "3px 10px",
                    borderRadius: "12px",
                    background: "#f1f5f9",
                    color: "#64748b",
                    border: "1px solid #e2e8f0"
                  }}>
                    {job?.job_category ? "Relevance: Not yet available" : "Uncategorized job"}
                  </span>
                )}
              </div>

              {job?.job_category ? (
                <p style={{ fontSize: "12px", color: "#475569", margin: "0 0 8px 0" }}>
                  <strong>Role Domain:</strong> {getCategoryLabel(job.job_category)}
                  {job.job_subcategory ? ` · ${getSubcategoryLabel(job.job_category, job.job_subcategory)}` : ""}
                </p>
              ) : (
                <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 8px 0", fontStyle: "italic" }}>
                  This is a legacy or uncategorized job. Career relevance domain scoring is not applied.
                </p>
              )}

              {bullets.length > 0 && (
                <div style={{ margin: "8px 0 4px 0" }}>
                  <span style={{ fontSize: "12px", fontWeight: "700", color: "#334155", display: "block", marginBottom: "4px" }}>
                    Why:
                  </span>
                  {bullets.map((b, bIdx) => (
                    <div key={bIdx} style={{ fontSize: "12px", color: "#334155", display: "flex", alignItems: "flex-start", gap: "6px", marginBottom: "3px" }}>
                      <span style={{ color: "#4f46e5" }}>•</span>
                      <span>{b}</span>
                    </div>
                  ))}
                </div>
              )}

              {domainSkills.length > 0 && (
                <div style={{ marginTop: "8px" }}>
                  <span style={{ fontSize: "11px", fontWeight: "700", color: "#64748b" }}>Matched Domain Skills:</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "4px" }}>
                    {domainSkills.map((sk, sIdx) => (
                      <span key={sIdx} style={{ background: "#e0e7ff", color: "#3730a3", fontSize: "11px", fontWeight: "600", padding: "2px 8px", borderRadius: "8px" }}>
                        {sk}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Skills Grid ─────────────────────────────────────────────── */}
        <div className="ai-report-skills-grid">
          {/* Matching Skills */}
          <div className="ai-skills-col">
            <h4 className="ai-skills-col-title matched">
              ✓ Matching Skills
              <span className="ai-skills-count">{matchedSkills.length}</span>
            </h4>
            {matchedSkills.length > 0 ? (
              <ul className="ai-skills-list">
                {matchedSkills.map(skill => (
                  <li key={skill} className="ai-skill-item matched">
                    <span className="ai-skill-icon">✓</span>
                    {skill}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ai-skills-empty">No direct skill matches detected</p>
            )}
          </div>

          {/* Missing Skills */}
          <div className="ai-skills-col">
            <h4 className="ai-skills-col-title missing">
              ✗ Missing Skills
              <span className="ai-skills-count missing">{missingSkills.length}</span>
            </h4>
            {missingSkills.length > 0 ? (
              <ul className="ai-skills-list">
                {missingSkills.map(skill => (
                  <li key={skill} className="ai-skill-item missing">
                    <span className="ai-skill-icon">✗</span>
                    {skill}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ai-skills-empty" style={{ color: '#16a34a' }}>
                ✓ All required skills matched!
              </p>
            )}
          </div>
        </div>

        {/* ── Education & Experience ──────────────────────────────────── */}
        <div className="ai-report-meta-grid">
          <div className="ai-meta-item">
            <span className="ai-meta-icon">🎓</span>
            <div>
              <div className="ai-meta-label">Education</div>
              <div className="ai-meta-value">
                {educationMatch || (job?.required_education || 'Not specified')}
              </div>
            </div>
          </div>
          <div className="ai-meta-item">
            <span className="ai-meta-icon">💼</span>
            <div>
              <div className="ai-meta-label">Experience</div>
              <div className="ai-meta-value">
                {experienceYrs > 0
                  ? `${experienceYrs} year${experienceYrs !== 1 ? 's' : ''} detected`
                  : (job?.experience_required || 'Not specified')}
              </div>
            </div>
          </div>
        </div>

        {/* ── AI Recommendation ────────────────────────────────────────── */}
        {recommendation && (
          <div className="ai-report-recommendation">
            <h4>🤖 AI Recommendation</h4>
            <p>{recommendation}</p>
          </div>
        )}

        {/* ── Learning Path (candidate view, when there are gaps) ────── */}
        {mode === 'candidate' && missingSkills.length > 0 && (
          <div className="ai-report-learning">
            <h4>📚 Recommended Learning Path</h4>
            <div className="ai-learning-list">
              {missingSkills.slice(0, 4).map(skill => (
                <a
                  key={skill}
                  href={`https://www.coursera.org/search?query=${encodeURIComponent(skill)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ai-learning-item"
                >
                  <span className="ai-learning-skill">{skill}</span>
                  <span className="ai-learning-provider">Coursera →</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* ── Candidate Match Status & Improve Match Guidance ──────── */}
        {mode === 'candidate' && (
          <div style={{ marginTop: "16px", marginBottom: "8px" }}>
            <CandidateMatchStatusBanner
              job={job}
              eligibility={{
                matchScore: currentScore,
                requiredMatch: reqScore,
                gap: Math.max(0, reqScore - currentScore),
                eligible: isEligible,
                matchingSkills: currentMatchedSkills,
                missingSkills: currentMissingSkills
              }}
              onOpenImproveMatch={() => setShowImproveModal(true)}
              onRecalculate={handleRecalculate}
              recalculating={recalculating}
            />
          </div>
        )}

        {/* ── Footer Actions ───────────────────────────────────────────── */}
        <div className="ai-report-footer">
          <button className="ai-report-btn-secondary" onClick={onClose}>
            Close
          </button>
          {mode === 'candidate' && onApply && (
            <button
              className="ai-report-btn-primary"
              onClick={onApply}
              disabled={applied || !isEligible}
              style={!isEligible ? { opacity: 0.65, cursor: "not-allowed", background: "#94a3b8" } : {}}
            >
              {applied ? '✓ Applied' : !isEligible ? `Match Too Low (${currentScore}% / ${reqScore}% Req)` : 'Apply Now'}
            </button>
          )}
        </div>

      </div>

      {/* ── Improve Match Guidance Modal ── */}
      <ImproveMatchModal
        isOpen={showImproveModal}
        onClose={() => setShowImproveModal(false)}
        job={job}
        eligibility={{
          matchScore: currentScore,
          requiredMatch: reqScore,
          gap: Math.max(0, reqScore - currentScore),
          eligible: isEligible,
          matchingSkills: currentMatchedSkills,
          missingSkills: currentMissingSkills
        }}
        onEligibilityUpdate={(updated) => {
          setCurrentScore(updated.matchScore);
          setCurrentMatchedSkills(updated.matchingSkills || []);
          setCurrentMissingSkills(updated.missingSkills || []);
          if (onMatchUpdated) onMatchUpdated(job.id, updated.matchScore);
        }}
      />
    </div>
  )
}
