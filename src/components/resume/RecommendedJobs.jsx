import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { parseJobRequirements } from '../../utils/jobRequirementsHelper';
import { useToast } from '../../contexts/ToastContext';
import SkillGapAnalysis from '../candidate/SkillGapAnalysis';
import ImproveMatchModal from '../candidate/ImproveMatchModal';
import CandidateMatchStatusBanner from '../candidate/CandidateMatchStatusBanner';
import CareerRelevanceBadge from '../candidate/CareerRelevanceBadge';
import { getJobApplicationEligibility, recalculateAuthoritativeMatch } from '../../services/applicationService';
import { getCareerRelevanceTier, getCareerRelevanceEvidenceBullets, getCategoryLabel, getSubcategoryLabel } from '../../services/careerRelevanceService';

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
    <div className={`rec-job-score-badge ${tierClass}`} style={{ minWidth: "105px", boxSizing: "border-box" }}>
      <span style={{ fontSize: "9px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.04em", opacity: 0.85, marginBottom: "2px" }}>JOB FIT</span>
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
  verificationStatus = "Pending Verification",
  candidate = {},
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
  const [modalEligibility, setModalEligibility] = useState(null);
  const [modalEligibilityLoading, setModalEligibilityLoading] = useState(false);
  const [showImproveMatchModal, setShowImproveMatchModal] = useState(false);
  const [recalculatingMatch, setRecalculatingMatch] = useState(false);
  const isVerified = verificationStatus === "Verified" || verificationStatus === "Approved";

  React.useEffect(() => {
    if (!selectedJob?.id) {
      setModalEligibility(null);
      setModalEligibilityLoading(false);
      return;
    }
    let isCancelled = false;
    setModalEligibilityLoading(true);
    getJobApplicationEligibility(selectedJob.id).then((res) => {
      if (!isCancelled) {
        setModalEligibility(res);
        setModalEligibilityLoading(false);
      }
    });
    return () => { isCancelled = true; };
  }, [selectedJob?.id]);

  async function handleRecalculateMatch() {
    if (!selectedJob?.id || recalculatingMatch) return;
    setRecalculatingMatch(true);
    try {
      const res = await recalculateAuthoritativeMatch(selectedJob.id);
      if (res.success) {
        setModalEligibility(res.eligibility);
        setSelectedJob(prev => prev ? { ...prev, matchScore: res.matchScore } : null);
        toast.success(`Match recalculated! Current score: ${res.matchScore}%`);
      } else {
        toast.error("Recalculation failed: " + (res.error?.message || "Unknown error"));
      }
    } catch (err) {
      toast.error("Error recalculating match: " + err.message);
    } finally {
      setRecalculatingMatch(false);
    }
  }

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

  // ── TOP 10 HIGHEST MATCHES ONLY (P2 Specification) ─────────────────────────
  // Server-authoritative sort by matchScore DESC, secondary deterministic sort created_at DESC
  // Strictly capped at top 10 open jobs
  const top10SourceJobs = [...jobs]
    .sort((a, b) => {
      const scoreDiff = (b.matchScore ?? 0) - (a.matchScore ?? 0);
      if (scoreDiff !== 0) return scoreDiff;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    })
    .slice(0, 10);

  // Filter & Sort jobs within Top 10
  const filteredJobs = top10SourceJobs.filter((job) => {
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

    const threshold = job.minimum_match_percentage ?? 70;
    if ((job.matchScore || 0) < threshold) {
      if (toast) toast.error(`Your current match is ${job.matchScore || 0}%. This job requires at least ${threshold}%.`);
      return;
    }

    setConfirmApplyJob(job);
  };

  const handleConfirmApply = async () => {
    if (confirmApplyJob && onApply) {
      try {
        const res = await onApply(confirmApplyJob);
        if (res?.error) {
          if (res.error.code === "APPLICATION_THRESHOLD_NOT_MET") {
            if (toast) toast.error(res.error.message);
          } else if (res.error.code === "IDENTITY_VERIFICATION_REQUIRED") {
            if (toast) toast.error("Identity verification required to apply for jobs.");
          } else {
            if (toast) toast.error(res.error.message || "Failed to submit application.");
          }
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
          <h2 className="rec-jobs-title">🎯 Recommended Jobs — Top Matches For You</h2>
          <p className="rec-jobs-subtitle">
            Showing your top 10 highest-ranked job matches, sorted by authoritative match score.
            {top10SourceJobs.length > 0 && (
              <span style={{ display: "block", marginTop: "4px", color: "#4f46e5", fontWeight: "600", fontSize: "12px" }}>
                Best Available Match: <strong>{top10SourceJobs[0]?.matchScore ?? 0}%</strong>
                {" · "}
                Employer Requirement: <strong>{top10SourceJobs[0]?.minimum_match_percentage ?? 70}%</strong>
              </span>
            )}
            {lastUpdatedText && (
              <span style={{ display: "block", marginTop: "2px", color: "#16a34a", fontWeight: "600", fontSize: "12px" }}>
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
            Top {filteredJobs.length} Match{filteredJobs.length !== 1 ? 'es' : ''}
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
                    <div className="rec-job-card-badges-group" style={{ display: "flex", gap: "8px", alignItems: "stretch", flexShrink: 0 }}>
                      <MatchScoreBadge score={job.matchScore} matchStatus={job.matchStatus} />
                      <CareerRelevanceBadge
                        score={job.career_relevance_score ?? job.careerRelevanceScore}
                        breakdown={job.career_relevance_breakdown ?? job.careerRelevanceBreakdown}
                        jobCategory={job.job_category}
                      />
                    </div>
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
                    <div className="rec-score-pill" style={{ background: "#f5f3ff", borderColor: "#ddd6fe" }}>
                      <span style={{ color: "#6d28d9" }}>Career Relevance:</span>
                      <strong style={{ color: "#58158f" }}>
                        {(job.career_relevance_score !== null && job.career_relevance_score !== undefined)
                          ? `${job.career_relevance_score}%`
                          : job.job_category ? "Not yet available" : "Uncategorized"}
                      </strong>
                    </div>
                  </div>

                  {/* Footer Actions */}
                  {(() => {
                    const threshold = job.minimum_match_percentage ?? 70;
                    const isEligible = (job.matchScore || 0) >= threshold;

                    return (
                      <div className="rec-job-card-footer">
                        <button
                          type="button"
                          className="rec-job-btn secondary"
                          onClick={() => setSelectedJob(job)}
                        >
                          View Details
                        </button>
                        {!isEligible && !isApplied && (
                          <button
                            type="button"
                            className="rec-job-btn secondary"
                            style={{ background: "#f5f3ff", color: "#6d28d9", borderColor: "#c4b5fd", fontWeight: "700" }}
                            onClick={() => {
                              setSelectedJob(job);
                              setShowImproveMatchModal(true);
                            }}
                          >
                            Improve My Match
                          </button>
                        )}
                        <button
                          type="button"
                          className="rec-job-btn primary"
                          disabled={!isVerified || isApplied || isApplying || !isEligible}
                          onClick={() => handlePromptApply(job)}
                          style={(!isVerified || !isEligible) && !isApplied ? { opacity: 0.65, cursor: "not-allowed", background: !isEligible ? "#f43f5e" : "#94a3b8" } : {}}
                          title={!isEligible ? `Match score (${job.matchScore || 0}%) is below the required ${threshold}%` : ''}
                        >
                          {isApplied ? '✓ Applied' : isApplying ? 'Applying...' : !isVerified ? '🔒 Verification Required' : !isEligible ? 'Match Too Low to Apply' : 'Apply Now'}
                        </button>
                      </div>
                    );
                  })()}
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
                {/* ── AI JOB FIT SUMMARY ── */}
                <div className="rec-modal-section" style={{ marginTop: "16px" }}>
                  <h4>🎯 AI Job Fit Breakdown</h4>
                  <div className="rec-modal-score-banner" style={{ marginTop: "8px" }}>
                    <MatchScoreBadge score={selectedJob.matchScore} />
                    <div className="rec-modal-score-details">
                      <p><strong>Match Reason:</strong> {selectedJob.matchReason || 'Strong alignment with your profile.'}</p>
                    </div>
                  </div>

                  {/* ── APPLICATION ELIGIBILITY STATUS & IMPROVE MATCH GUIDANCE ── */}
                  <CandidateMatchStatusBanner
                    job={selectedJob}
                    eligibility={modalEligibility || {
                      matchScore: selectedJob.matchScore || 0,
                      requiredMatch: selectedJob.minimum_match_percentage ?? 70,
                      gap: Math.max(0, (selectedJob.minimum_match_percentage ?? 70) - (selectedJob.matchScore || 0)),
                      eligible: (selectedJob.matchScore || 0) >= (selectedJob.minimum_match_percentage ?? 70)
                    }}
                    eligibilityLoading={modalEligibilityLoading}
                    onOpenImproveMatch={() => setShowImproveMatchModal(true)}
                    onRecalculate={handleRecalculateMatch}
                    recalculating={recalculatingMatch}
                  />
                </div>

                {/* ── CAREER RELEVANCE & OCCUPATIONAL DOMAIN ── */}
                {(() => {
                  const relScore = selectedJob.career_relevance_score ?? selectedJob.careerRelevanceScore ?? null;
                  const breakdown = selectedJob.career_relevance_breakdown ?? selectedJob.careerRelevanceBreakdown ?? null;
                  const hasRelScore = relScore !== null && relScore !== undefined && !Number.isNaN(Number(relScore));
                  const tier = hasRelScore ? getCareerRelevanceTier(relScore) : null;
                  const bullets = getCareerRelevanceEvidenceBullets(breakdown, selectedJob.job_category);
                  const domainSkills = breakdown?.domainSkills || [];

                  return (
                    <div className="rec-modal-section" style={{ background: "#f8fafc", padding: "14px 18px", borderRadius: "10px", border: "1px solid #e2e8f0", marginTop: "16px" }}>
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
                            {selectedJob.job_category ? "Relevance: Not yet available" : "Uncategorized job"}
                          </span>
                        )}
                      </div>

                      {selectedJob.job_category ? (
                        <p style={{ fontSize: "12px", color: "#475569", margin: "0 0 8px 0" }}>
                          <strong>Role Domain:</strong> {getCategoryLabel(selectedJob.job_category)}
                          {selectedJob.job_subcategory ? ` · ${getSubcategoryLabel(selectedJob.job_category, selectedJob.job_subcategory)}` : ""}
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

                {/* ── AI SKILL GAP ANALYSIS & MICROCREDENTIAL RECOMMENDATIONS ── */}
                {(() => {
                  if (import.meta.env.VITE_DEBUG_SKILL_GAP === 'true') {
                    console.log('[SkillGapInput]', {
                      surface: 'recommended',
                      candidateSkills: candidate?.skills || [],
                      jobId: selectedJob?.id,
                      jobRequiredSkills: selectedJob?.required_skills || ''
                    });
                  }
                  return <SkillGapAnalysis job={selectedJob} candidate={candidate} />;
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
                {(() => {
                  const reqScore = typeof selectedJob.minimum_match_percentage === 'number' ? selectedJob.minimum_match_percentage : 70;
                  const isBelowThreshold = (selectedJob.matchScore || 0) < reqScore;
                  const isBlocked = !isVerified || applications.includes(selectedJob.id) || applyingJobId === selectedJob.id || isBelowThreshold;

                  return (
                    <button
                      type="button"
                      className="rec-job-btn primary"
                      disabled={isBlocked}
                      onClick={() => handlePromptApply(selectedJob)}
                      style={!isVerified || isBelowThreshold ? { opacity: 0.65, cursor: "not-allowed", background: "#94a3b8" } : {}}
                    >
                      {applications.includes(selectedJob.id)
                        ? '✓ Applied'
                        : !isVerified
                        ? '🔒 Verification Required'
                        : isBelowThreshold
                        ? 'Match Too Low to Apply'
                        : 'Apply Now'}
                    </button>
                  );
                })()}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Candidate Improve Match Guidance Modal ── */}
      <ImproveMatchModal
        isOpen={showImproveMatchModal}
        onClose={() => setShowImproveMatchModal(false)}
        job={selectedJob}
        eligibility={modalEligibility || {
          matchScore: selectedJob?.matchScore || 0,
          requiredMatch: selectedJob?.minimum_match_percentage ?? 70,
          gap: Math.max(0, (selectedJob?.minimum_match_percentage ?? 70) - (selectedJob?.matchScore || 0)),
          eligible: (selectedJob?.matchScore || 0) >= (selectedJob?.minimum_match_percentage ?? 70)
        }}
        onEligibilityUpdate={(updated) => {
          setModalEligibility(updated);
          setSelectedJob(prev => prev ? { ...prev, matchScore: updated.matchScore } : null);
        }}
      />

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
