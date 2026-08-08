import React, { useState } from 'react';

/**
 * Match Score Badge with tier styling
 */
function MatchScoreBadge({ score }) {
  let tierClass = 'partial';
  let tierLabel = 'Partial Match';

  if (score >= 80) {
    tierClass = 'excellent';
    tierLabel = 'Excellent Match';
  } else if (score >= 65) {
    tierClass = 'good';
    tierLabel = 'Good Match';
  }

  return (
    <div className={`rec-job-score-badge ${tierClass}`}>
      <span className="rec-job-score-num">{score}%</span>
      <span className="rec-job-score-label">{tierLabel}</span>
    </div>
  );
}

export default function RecommendedJobs({
  jobs = [],
  loading = false,
  matching = false,
  hasResume = false,
  applications = [],
  onApply,
  applyingJobId = null
}) {
  const [selectedJob, setSelectedJob] = useState(null);

  // ── Render States ─────────────────────────────────────────────────────────

  if (!hasResume) {
    return (
      <div className="rec-jobs-container">
        <div className="rec-jobs-empty">
          <span className="rec-jobs-icon">📄</span>
          <h3>Upload a resume to receive job recommendations</h3>
          <p>SkillSync matches your skills, experience, and ATS profile against active employer job postings in real time.</p>
        </div>
      </div>
    );
  }

  if (matching || loading) {
    return (
      <div className="rec-jobs-container">
        <div className="rec-jobs-loading">
          <div className="rec-jobs-spinner" />
          <h3>Analyzing your resume and finding the best job matches...</h3>
          <p>Comparing your skills, education, and semantic embedding against active open positions.</p>
        </div>
      </div>
    );
  }

  if (!jobs || jobs.length === 0) {
    return (
      <div className="rec-jobs-container">
        <div className="rec-jobs-empty">
          <span className="rec-jobs-icon">🔍</span>
          <h3>No active job recommendations found</h3>
          <p>We analyzed your profile, but no active job openings currently match your resume strongly. Check back soon as employers post new roles!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rec-jobs-container">
      <div className="rec-jobs-header">
        <div>
          <h2 className="rec-jobs-title">🎯 Recommended Jobs for You</h2>
          <p className="rec-jobs-subtitle">
            Matched against your parsed resume skills, experience, and AI semantic profile.
          </p>
        </div>
        <div className="rec-jobs-count-badge">
          {jobs.length} Top Match{jobs.length > 1 ? 'es' : ''}
        </div>
      </div>

      <div className="rec-jobs-grid">
        {jobs.map((job, idx) => {
          const isApplied = applications.includes(job.id);
          const isApplying = applyingJobId === job.id;
          const matchedSkills = Array.isArray(job.matchedSkills) ? job.matchedSkills : [];
          const missingSkills = Array.isArray(job.missingSkills) ? job.missingSkills : [];

          return (
            <div key={job.id || idx} className="rec-job-card">
              <div className="rec-job-card-header">
                <div className="rec-job-title-group">
                  <span className="rec-job-rank">#{idx + 1}</span>
                  <div>
                    <h3 className="rec-job-title">{job.title}</h3>
                    <p className="rec-job-company">
                      {[job.company_name || 'Employer', job.location, job.employment_type, job.work_setup]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                </div>
                <MatchScoreBadge score={job.matchScore} />
              </div>

              {job.salary_range && (
                <div className="rec-job-salary">
                  💰 {job.salary_range}
                </div>
              )}

              {/* Skill Tags */}
              <div className="rec-job-skills-section">
                {matchedSkills.length > 0 && (
                  <div className="rec-job-skills-group">
                    <span className="rec-job-skills-label">Matched Skills:</span>
                    <div className="rec-job-skills-list">
                      {matchedSkills.slice(0, 6).map((skill) => (
                        <span key={skill} className="rec-skill-tag matched">
                          ✓ {skill}
                        </span>
                      ))}
                      {matchedSkills.length > 6 && (
                        <span className="rec-skill-tag-more">+{matchedSkills.length - 6} more</span>
                      )}
                    </div>
                  </div>
                )}

                {missingSkills.length > 0 && (
                  <div className="rec-job-skills-group">
                    <span className="rec-job-skills-label">Missing Skills:</span>
                    <div className="rec-job-skills-list">
                      {missingSkills.slice(0, 4).map((skill) => (
                        <span key={skill} className="rec-skill-tag missing">
                          ✗ {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Sub-scores breakdown */}
              <div className="rec-job-scores-row">
                <div className="rec-score-pill">
                  <span>Semantic Match:</span>
                  <strong>{job.semanticScore}%</strong>
                </div>
                <div className="rec-score-pill">
                  <span>Skills Alignment:</span>
                  <strong>{job.skillsScore}%</strong>
                </div>
                {job.educationScore !== undefined && (
                  <div className="rec-score-pill">
                    <span>Education:</span>
                    <strong>{job.educationScore}%</strong>
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="rec-job-card-footer">
                <button
                  type="button"
                  className="rec-job-btn secondary"
                  onClick={() => setSelectedJob(job)}
                >
                  View Details
                </button>
                <button
                  type="button"
                  className="rec-job-btn primary"
                  disabled={isApplied || isApplying}
                  onClick={() => onApply && onApply(job)}
                >
                  {isApplied ? '✓ Applied' : isApplying ? 'Applying...' : 'Apply Now'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail Modal Overlay */}
      {selectedJob && (
        <div className="rec-modal-overlay" onClick={() => setSelectedJob(null)}>
          <div className="rec-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="rec-modal-header">
              <div>
                <h2>{selectedJob.title}</h2>
                <p className="rec-modal-subtitle">
                  {[selectedJob.company_name, selectedJob.location, selectedJob.employment_type, selectedJob.work_setup]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <button type="button" className="rec-modal-close" onClick={() => setSelectedJob(null)}>×</button>
            </div>

            <div className="rec-modal-body">
              <div className="rec-modal-score-banner">
                <MatchScoreBadge score={selectedJob.matchScore} />
                <div className="rec-modal-score-details">
                  <p><strong>Match Summary:</strong> {selectedJob.matchReason || selectedJob.recommendations || 'Good alignment with your qualifications.'}</p>
                </div>
              </div>

              {selectedJob.description && (
                <div className="rec-modal-section">
                  <h4>Job Description</h4>
                  <p>{selectedJob.description}</p>
                </div>
              )}

              {selectedJob.required_skills && (
                <div className="rec-modal-section">
                  <h4>Required Skills</h4>
                  <p>{selectedJob.required_skills}</p>
                </div>
              )}

              {selectedJob.required_education && (
                <div className="rec-modal-section">
                  <h4>Required Education</h4>
                  <p>{selectedJob.required_education}</p>
                </div>
              )}

              {selectedJob.experience_required && (
                <div className="rec-modal-section">
                  <h4>Experience Required</h4>
                  <p>{selectedJob.experience_required}</p>
                </div>
              )}
            </div>

            <div className="rec-modal-footer">
              <button type="button" className="rec-job-btn secondary" onClick={() => setSelectedJob(null)}>
                Close
              </button>
              <button
                type="button"
                className="rec-job-btn primary"
                disabled={applications.includes(selectedJob.id) || applyingJobId === selectedJob.id}
                onClick={() => {
                  if (onApply) onApply(selectedJob);
                  setSelectedJob(null);
                }}
              >
                {applications.includes(selectedJob.id) ? '✓ Applied' : 'Apply for this Job'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
