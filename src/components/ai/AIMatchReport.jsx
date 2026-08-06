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

import { getMatchTier } from '../../services/ai/recommendationService'
import './AIMatchReport.css'

export default function AIMatchReport({
  job,
  matchScore      = 0,
  semanticScore   = 0,
  matchedSkills   = [],
  missingSkills   = [],
  recommendation  = '',
  educationMatch  = '',
  experienceYrs   = 0,
  onClose,
  onApply,
  applied         = false,
  mode            = 'candidate',
  candidateName   = '',
}) {
  const tier = getMatchTier(matchScore)

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
            <span className="ai-report-score-number">{matchScore}%</span>
            <span className="ai-report-score-label">Overall Match</span>
          </div>

          <div className="ai-report-progress-wrap">
            <div className="ai-report-progress-bar">
              <div
                className="ai-report-progress-fill"
                style={{ width: `${matchScore}%`, background: tier.color }}
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
          </div>
        </div>

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

        {/* ── Footer Actions ───────────────────────────────────────────── */}
        <div className="ai-report-footer">
          <button className="ai-report-btn-secondary" onClick={onClose}>
            Close
          </button>
          {mode === 'candidate' && onApply && (
            <button
              className="ai-report-btn-primary"
              onClick={onApply}
              disabled={applied}
            >
              {applied ? '✓ Applied' : 'Apply Now'}
            </button>
          )}
        </div>

      </div>
    </div>
  )
}
