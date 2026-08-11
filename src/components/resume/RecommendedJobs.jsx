import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { parseJobRequirements } from '../../utils/jobRequirementsHelper';
import { matchMicrocredentialsForMissingSkills } from '../../services/microcredentialService';
import { useToast } from '../../contexts/ToastContext';

/**
 * Match Score Badge with tier styling
 */
function MatchScoreBadge({ score, matchStatus }) {
  let tierClass = 'skills-gap';
  let tierLabel = matchStatus || 'Skills Gap';

  if (score >= 80) {
    tierClass = 'excellent';
    tierLabel = matchStatus || 'Strong Match';
  } else if (score >= 60) {
    tierClass = 'good';
    tierLabel = matchStatus || 'Good Match';
  } else if (score >= 40) {
    tierClass = 'partial';
    tierLabel = matchStatus || 'Potential Match';
  }

  return (
    <div className={`rec-job-score-badge ${tierClass}`}>
      <span className="rec-job-score-num">{score}% Job Fit</span>
      <span className="rec-job-score-label">{tierLabel}</span>
    </div>
  );
}

export default function RecommendedJobs({
  jobs = [],
  loading = false,
  matching = false,
  hasResume = false,
  verificationStatus = "Pending Verification",
  applications = [],
  onApply,
  applyingJobId = null,
  onRefresh = null,
  refreshing = false,
  evaluatedCount = 0,
  lastUpdatedText = ""
}) {
  const toast = useToast();
  const [selectedJob, setSelectedJob] = useState(null);
  const [confirmApplyJob, setConfirmApplyJob] = useState(null);
  const [refreshState, setRefreshState] = useState("default"); // "default" | "updating" | "updated"

  const isVerified = verificationStatus === "Verified" || verificationStatus === "Approved";

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [empTypeFilter, setEmpTypeFilter] = useState('all');
  const [workSetupFilter, setWorkSetupFilter] = useState('all');
  const [minScoreFilter, setMinScoreFilter] = useState(0);
  const [sortBy, setSortBy] = useState('best');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 6;

  const handleRefreshClick = async () => {
    if (!onRefresh || refreshing) return;
    setRefreshState("updating");
    try {
      await onRefresh();
      setRefreshState("updated");
      setCurrentPage(1);
      setTimeout(() => setRefreshState("default"), 2500);
    } catch {
      setRefreshState("default");
    }
  };

  // Filter & Sort jobs
  const filteredJobs = jobs.filter((job) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      (job.title || '').toLowerCase().includes(q) ||
      (job.company_name || '').toLowerCase().includes(q) ||
      (job.location || '').toLowerCase().includes(q) ||
      (job.required_skills || '').toLowerCase().includes(q);

    const matchesEmp =
      empTypeFilter === 'all' ||
      (job.employment_type || '').toLowerCase() === empTypeFilter.toLowerCase();

    const matchesSetup =
      workSetupFilter === 'all' ||
      (job.work_setup || '').toLowerCase() === workSetupFilter.toLowerCase();

    const matchesScore = (job.matchScore || 0) >= Number(minScoreFilter);

    return matchesSearch && matchesEmp && matchesSetup && matchesScore;
  }).sort((a, b) => {
    if (sortBy === 'newest') {
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    }
    return (b.matchScore || 0) - (a.matchScore || 0);
  });

  const totalPages = Math.ceil(filteredJobs.length / PAGE_SIZE) || 1;
  const paginatedJobs = filteredJobs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleFilterChange = (setter, val) => {
    setter(val);
    setCurrentPage(1);
  };

  const handlePromptApply = (job) => {
    if (!isVerified) {
      if (verificationStatus === "Under Review") {
        if (toast) toast.error("Your verification is under review. You can apply once the admin approves your identity.");
      } else {
        if (toast) toast.error("Your identity must be verified before you can apply. Please complete ID verification in your Profile.");
      }
      return;
    }
    setConfirmApplyJob(job);
  };

  const handleConfirmApply = async () => {
    if (confirmApplyJob && onApply) {
      try {
        const res = await onApply(confirmApplyJob);
        if (res?.error && res.error.code === "IDENTITY_VERIFICATION_REQUIRED") {
          if (toast) toast.error("Identity verification required to apply for jobs.");
        }
      } catch (err) {
        if (toast) toast.error(err?.message || "Failed to submit application.");
      }
    }
    setConfirmApplyJob(null);
    setSelectedJob(null);
  };

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

  return (
    <div className="rec-jobs-container">
      <div className="rec-jobs-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h2 className="rec-jobs-title">🎯 Recommended Jobs for You</h2>
          <p className="rec-jobs-subtitle">
            Matched against your parsed resume skills, experience, and AI semantic profile.
            {lastUpdatedText && (
              <span style={{ display: "block", marginTop: "4px", color: "#16a34a", fontWeight: "600", fontSize: "12px" }}>
                ✓ {lastUpdatedText}
              </span>
            )}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {onRefresh && (
            <button
              type="button"
              className="refresh-recommendations-btn"
              disabled={refreshing || loading || refreshState === "updating"}
              onClick={handleRefreshClick}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 16px",
                borderRadius: "8px",
                background: refreshState === "updated" ? "#dcfce7" : "#4f46e5",
                color: refreshState === "updated" ? "#15803d" : "#ffffff",
                border: refreshState === "updated" ? "1px solid #86efac" : "1px solid #4338ca",
                fontSize: "13px",
                fontWeight: "700",
                cursor: refreshing || loading || refreshState === "updating" ? "not-allowed" : "pointer",
                transition: "all 0.2s ease",
                opacity: refreshing || loading || refreshState === "updating" ? 0.7 : 1
              }}
            >
              {refreshState === "updating" || refreshing ? (
                <>⟳ Updating...</>
              ) : refreshState === "updated" ? (
                <>✓ Updated</>
              ) : (
                <>↻ Refresh Recommendations</>
              )}
            </button>
          )}

          <div className="rec-jobs-count-badge">
            {filteredJobs.length} Match{filteredJobs.length !== 1 ? 'es' : ''}
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="rec-jobs-filter-bar" style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "20px", background: "#f8fafc", padding: "14px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
        <input
          type="text"
          placeholder="🔍 Search title, company, location, skills..."
          value={searchQuery}
          onChange={(e) => handleFilterChange(setSearchQuery, e.target.value)}
          style={{ flex: "1 1 200px", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
        />
        <select
          value={empTypeFilter}
          onChange={(e) => handleFilterChange(setEmpTypeFilter, e.target.value)}
          style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px", background: "#fff" }}
        >
          <option value="all">All Employment Types</option>
          <option value="Full-time">Full-time</option>
          <option value="Part-time">Part-time</option>
          <option value="Contract">Contract</option>
          <option value="Internship">Internship</option>
        </select>
        <select
          value={workSetupFilter}
          onChange={(e) => handleFilterChange(setWorkSetupFilter, e.target.value)}
          style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px", background: "#fff" }}
        >
          <option value="all">All Work Setups</option>
          <option value="On-site">On-site</option>
          <option value="Remote">Remote</option>
          <option value="Hybrid">Hybrid</option>
        </select>
        <select
          value={minScoreFilter}
          onChange={(e) => handleFilterChange(setMinScoreFilter, Number(e.target.value))}
          style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px", background: "#fff" }}
        >
          <option value={0}>All Match Tiers</option>
          <option value={80}>80%+ Strong Match</option>
          <option value={60}>60%+ Good Match</option>
          <option value={40}>40%+ Potential Match</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px", background: "#fff" }}
        >
          <option value="best">Sort by Best Match</option>
          <option value="newest">Sort by Newest</option>
        </select>
      </div>

      {filteredJobs.length === 0 ? (
        <div className="rec-jobs-empty">
          <span className="rec-jobs-icon">🔍</span>
          <h3>No matching recommendations found</h3>
          <p>Try adjusting your search query or filter settings.</p>
        </div>
      ) : (
        <>
          <div className="rec-jobs-grid">
            {paginatedJobs.map((job, idx) => {
              const isApplied = applications.includes(job.id);
              const isApplying = applyingJobId === job.id;
              const matchedSkills = Array.isArray(job.matchedSkills) ? job.matchedSkills : [];
              const missingSkills = Array.isArray(job.missingSkills) ? job.missingSkills : [];
              const { applicationRequirements } = parseJobRequirements(job);

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
                        {/* Verified Employer Badge */}
                        {(job.employer_verification_status === "Approved" || job.employer_verification_status === "Verified" || job.verified_employer) && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "#dcfce7", color: "#15803d", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: "700", marginTop: "4px" }}>
                            ✓ Verified Employer
                          </span>
                        )}
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

                    {/* Employer Document Requirements Badges */}
                    {applicationRequirements.length > 0 && (
                      <div className="rec-job-skills-group" style={{ marginTop: "8px" }}>
                        <span className="rec-job-skills-label" style={{ color: "#1e1b4b" }}>📋 Document Requirements:</span>
                        <div className="rec-job-skills-list">
                          {applicationRequirements.slice(0, 4).map((req, rIdx) => (
                            <span key={`req-doc-${rIdx}`} className="rec-skill-tag" style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>
                              ✓ {req}
                            </span>
                          ))}
                          {applicationRequirements.length > 4 && (
                            <span className="rec-skill-tag-more">+{applicationRequirements.length - 4} more</span>
                          )}
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
                      disabled={!isVerified || isApplied || isApplying}
                      onClick={() => handlePromptApply(job)}
                      style={!isVerified ? { opacity: 0.65, cursor: "not-allowed", background: "#94a3b8" } : {}}
                    >
                      {isApplied ? '✓ Applied' : isApplying ? 'Applying...' : !isVerified ? '🔒 Verification Required' : 'Apply Now'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="rec-jobs-pagination" style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "12px", marginTop: "24px" }}>
              <button
                type="button"
                className="rec-job-btn secondary"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                style={{ padding: "6px 14px", fontSize: "13px" }}
              >
                ← Previous
              </button>
              <span style={{ fontSize: "13px", fontWeight: "600", color: "#475569" }}>
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                className="rec-job-btn secondary"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                style={{ padding: "6px 14px", fontSize: "13px" }}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {/* Detail Modal Overlay */}
      {selectedJob && (() => {
        const { cleanCertifications, applicationRequirements } = parseJobRequirements(selectedJob);

        return (
          <div className="rec-modal-overlay" onClick={() => setSelectedJob(null)}>
            <div className="rec-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "720px" }}>
              <div className="rec-modal-header">
                <div>
                  <h2>{selectedJob.title}</h2>
                  <p className="rec-modal-subtitle">
                    {[selectedJob.company_name || 'Employer', selectedJob.location, selectedJob.employment_type, selectedJob.work_setup]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <button type="button" className="rec-modal-close" onClick={() => setSelectedJob(null)}>×</button>
              </div>

              <div className="rec-modal-body">

                {/* Company & Job Overview Header */}
                <div style={{ background: "#f8fafc", padding: "14px 18px", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "16px" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", fontSize: "13px", color: "#334155" }}>
                    <span>📍 <strong>Location:</strong> {selectedJob.location || "Not specified"}</span>
                    <span>💼 <strong>Type:</strong> {selectedJob.employment_type || "Full-time"}</span>
                    <span>🏢 <strong>Setup:</strong> {selectedJob.work_setup || "On-site"}</span>
                    {selectedJob.salary_range && <span>💰 <strong>Salary:</strong> {selectedJob.salary_range}</span>}
                    {selectedJob.number_of_openings && <span>👥 <strong>Openings:</strong> {selectedJob.number_of_openings}</span>}
                  </div>
                </div>

                {selectedJob.description && (
                  <div className="rec-modal-section">
                    <h4>Job Description</h4>
                    <p style={{ whiteSpace: "pre-wrap", lineHeight: "1.6" }}>{selectedJob.description}</p>
                  </div>
                )}

                {/* ── JOB QUALIFICATIONS SECTION (Affects Job Fit) ── */}
                <div className="rec-modal-section" style={{ background: "#faf5ff", padding: "14px 18px", borderRadius: "10px", border: "1px solid #f3e8ff", marginTop: "16px" }}>
                  <h4 style={{ color: "#58158f", margin: "0 0 10px 0" }}>🎓 Job Qualifications</h4>
                  
                  {selectedJob.required_education && (
                    <p style={{ fontSize: "13px", margin: "0 0 6px 0" }}>
                      <strong>Education Required:</strong> {selectedJob.required_education}
                    </p>
                  )}
                  {selectedJob.experience_required && (
                    <p style={{ fontSize: "13px", margin: "0 0 6px 0" }}>
                      <strong>Experience Required:</strong> {selectedJob.experience_required}
                    </p>
                  )}
                  {selectedJob.required_skills && (
                    <div style={{ marginTop: "6px" }}>
                      <strong style={{ fontSize: "13px" }}>Required Skills:</strong>
                      <div className="rec-job-skills-list" style={{ marginTop: "4px" }}>
                        {selectedJob.required_skills.split(",").map((s) => (
                          <span key={s} className="rec-skill-tag matched">
                            ✓ {s.trim()}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {cleanCertifications && (
                    <div style={{ marginTop: "6px" }}>
                      <strong style={{ fontSize: "13px" }}>Required Certifications:</strong>
                      <p style={{ fontSize: "13px", margin: "2px 0 0 0", color: "#6b21a8" }}>{cleanCertifications}</p>
                    </div>
                  )}
                </div>

                {/* ── EMPLOYER APPLICATION DOCUMENT REQUIREMENTS ── */}
                <div className="rec-modal-section" style={{ background: "#f0f9ff", padding: "14px 18px", borderRadius: "10px", border: "1px solid #bae6fd", marginTop: "16px" }}>
                  <h4 style={{ color: "#0369a1", margin: "0 0 8px 0" }}>📋 Required Application Documents</h4>
                  <p style={{ fontSize: "12px", color: "#0284c7", margin: "0 0 10px 0" }}>
                    The employer requires applicants to prepare the following documents upon application:
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {applicationRequirements.map((req, rIdx) => (
                      <span key={`doc-${rIdx}`} style={{ background: "#ffffff", color: "#0369a1", border: "1px solid #7dd3fc", padding: "6px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: "700" }}>
                        ✓ {req}
                      </span>
                    ))}
                  </div>
                </div>

                {/* ── AI JOB FIT SUMMARY ── */}
                <div className="rec-modal-section" style={{ marginTop: "16px" }}>
                  <h4>🎯 AI Job Fit Breakdown</h4>
                  <div className="rec-modal-score-banner" style={{ marginTop: "8px" }}>
                    <MatchScoreBadge score={selectedJob.matchScore} />
                    <div className="rec-modal-score-details">
                      <p><strong>Match Reason:</strong> {selectedJob.matchReason || 'Strong alignment with your profile.'}</p>
                    </div>
                  </div>
                </div>

                {/* ── AI SKILL GAP ANALYSIS & MICROCREDENTIAL RECOMMENDATIONS ── */}
                {(() => {
                  const microList = (selectedJob.microCredentials && selectedJob.microCredentials.length > 0)
                    ? selectedJob.microCredentials
                    : matchMicrocredentialsForMissingSkills(selectedJob.missingSkills || []);

                  const matchedSkillsList = selectedJob.matchedSkills || [];
                  const missingSkillsList = selectedJob.missingSkills || [];

                  return (
                    <div className="rec-modal-section" style={{ marginTop: "16px", background: "#f8fafc", padding: "14px 18px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                      <h4 style={{ color: "#1e1b4b", margin: "0 0 10px 0" }}>🧠 Skill Gap Analysis & Microcredentials</h4>

                      {/* Skills You Have vs Skills You're Missing */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "10px" }}>
                        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "12px", borderRadius: "8px" }}>
                          <strong style={{ fontSize: "12px", color: "#15803d", display: "block", marginBottom: "6px" }}>
                            ✓ Skills You Have ({matchedSkillsList.length})
                          </strong>
                          {matchedSkillsList.length > 0 ? (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                              {matchedSkillsList.map(s => (
                                <span key={s} style={{ background: "#dcfce7", color: "#166534", fontSize: "11px", fontWeight: "600", padding: "3px 8px", borderRadius: "12px" }}>
                                  ✓ {s}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ fontSize: "12px", color: "#64748b" }}>No direct required skill matches identified.</span>
                          )}
                        </div>

                        <div style={{ background: "#fff1f2", border: "1px solid #fecdd3", padding: "12px", borderRadius: "8px" }}>
                          <strong style={{ fontSize: "12px", color: "#be123c", display: "block", marginBottom: "6px" }}>
                            ⚠ Skills You're Missing ({missingSkillsList.length})
                          </strong>
                          {missingSkillsList.length > 0 ? (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                              {missingSkillsList.map(s => (
                                <span key={s} style={{ background: "#ffe4e6", color: "#9f1239", fontSize: "11px", fontWeight: "600", padding: "3px 8px", borderRadius: "12px" }}>
                                  ⚠ {s}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ fontSize: "12px", color: "#15803d", fontWeight: "600" }}>✓ No skill gaps identified for this role!</span>
                          )}
                        </div>
                      </div>

                      {/* Recommended Microcredentials Cards */}
                      {microList.length > 0 ? (
                        <div style={{ marginTop: "14px" }}>
                          <strong style={{ fontSize: "13px", color: "#1e1b4b", display: "block", marginBottom: "8px" }}>
                            🎓 Recommended Learning Credentials to Bridge Skill Gaps:
                          </strong>
                          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                            {microList.map((mc, mIdx) => (
                              <div key={mc.id || mIdx} style={{ background: "#ffffff", border: "1px solid #cbd5e1", padding: "12px 14px", borderRadius: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                                  <div style={{ flex: 1 }}>
                                    <span style={{ fontSize: "11px", fontWeight: "700", color: "#6b21a8", background: "#f3e8ff", padding: "2px 8px", borderRadius: "4px", display: "inline-block", marginBottom: "4px" }}>
                                      Skill Addressed: {mc.skill_name || mc.skill}
                                    </span>
                                    <h5 style={{ margin: "2px 0 4px 0", fontSize: "14px", color: "#0f172a" }}>
                                      {mc.badge || "🎓"} {mc.title}
                                    </h5>
                                    <p style={{ margin: 0, fontSize: "12px", color: "#475569", lineHeight: "1.4" }}>
                                      {mc.description}
                                    </p>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", fontSize: "11px", color: "#64748b", marginTop: "6px" }}>
                                      <span>🏛️ Provider: <strong>{mc.provider}</strong></span>
                                      <span>📊 Level: <strong>{mc.level || 'Beginner'}</strong></span>
                                      {mc.duration && <span>⏱️ Duration: <strong>{mc.duration}</strong></span>}
                                    </div>
                                  </div>
                                  {mc.url && mc.url !== '#' && (
                                    <a
                                      href={mc.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="rec-job-btn primary"
                                      style={{ fontSize: "11px", padding: "6px 12px", textDecoration: "none", whiteSpace: "nowrap", alignSelf: "center" }}
                                    >
                                      View Credential ↗
                                    </a>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : missingSkillsList.length > 0 ? (
                        <p style={{ fontSize: "12px", color: "#64748b", fontStyle: "italic", marginTop: "12px", margin: "12px 0 0 0" }}>
                          No registered microcredential currently available for the missing skill(s).
                        </p>
                      ) : null}
                    </div>
                  );
                })()}

              </div>

              {!isVerified && (
                <div style={{ background: "#fffbeb", borderTop: "1px solid #fde68a", borderBottom: "1px solid #fde68a", padding: "10px 18px", color: "#92400e", fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                  <span>🔒 <strong>Identity Verification Required:</strong> Your account must be verified before applying to jobs.</span>
                  <Link to="/candidate/profile" style={{ color: "#b45309", fontWeight: "700", textDecoration: "underline" }}>
                    Complete Verification →
                  </Link>
                </div>
              )}

              <div className="rec-modal-footer">
                <button type="button" className="rec-job-btn secondary" onClick={() => setSelectedJob(null)}>
                  Close
                </button>
                <button
                  type="button"
                  className="rec-job-btn primary"
                  disabled={!isVerified || applications.includes(selectedJob.id) || applyingJobId === selectedJob.id}
                  onClick={() => handlePromptApply(selectedJob)}
                  style={!isVerified ? { opacity: 0.65, cursor: "not-allowed", background: "#94a3b8" } : {}}
                >
                  {applications.includes(selectedJob.id) ? '✓ Applied' : !isVerified ? '🔒 Verification Required' : 'Apply Now'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── PRE-APPLICATION REQUIREMENTS CONFIRMATION MODAL ── */}
      {confirmApplyJob && (() => {
        const { applicationRequirements } = parseJobRequirements(confirmApplyJob);

        return (
          <div className="rec-modal-overlay" onClick={() => setConfirmApplyJob(null)}>
            <div className="rec-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "520px" }}>
              <div className="rec-modal-header">
                <div>
                  <h3 style={{ margin: 0, fontSize: "18px", color: "#1e1b4b" }}>📋 Application Requirements Check</h3>
                  <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#64748b" }}>
                    Applying for <strong>{confirmApplyJob.title}</strong> at {confirmApplyJob.company_name || 'Employer'}
                  </p>
                </div>
                <button type="button" className="rec-modal-close" onClick={() => setConfirmApplyJob(null)}>×</button>
              </div>

              <div className="rec-modal-body" style={{ padding: "20px" }}>
                <p style={{ fontSize: "13px", color: "#334155", lineHeight: "1.5", margin: "0 0 14px 0" }}>
                  Please confirm that you have prepared the required documents specified by the employer:
                </p>

                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "14px", borderRadius: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
                  {applicationRequirements.map((req, rIdx) => (
                    <div key={rIdx} style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", color: "#1e293b", fontWeight: "600" }}>
                      <span style={{ color: "#16a34a", fontSize: "16px" }}>✓</span>
                      <span>{req}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rec-modal-footer" style={{ padding: "16px 20px" }}>
                <button type="button" className="rec-job-btn secondary" onClick={() => setConfirmApplyJob(null)}>
                  Cancel
                </button>
                <button type="button" className="rec-job-btn primary" onClick={handleConfirmApply}>
                  Confirm & Submit Application
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
