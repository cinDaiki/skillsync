import { useEffect, useState } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { fetchAdminApplications } from "../../services/adminService";
import ResumeViewerModal from "../../components/resume/ResumeViewerModal";
import { calculateJobFit } from "../../services/ai/jobFitEngine";
import { isHired, isRejected, isInterviewStage, isScreeningStatus } from "../../services/recruitmentStatus";

export default function AdminManageApplications() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [matchFilter, setMatchFilter] = useState("all");
  const [activeResumeViewer, setActiveResumeViewer] = useState(null);
  const [selectedAppDetails, setSelectedAppDetails] = useState(null);
  const [selectedAppTimeline, setSelectedAppTimeline] = useState(null);

  useEffect(() => {
    loadApplications();
  }, []);

  async function loadApplications() {
    setLoading(true);
    setLoadError("");
    try {
      const { data, error } = await fetchAdminApplications();
      if (error) {
        setLoadError("Could not retrieve job applications from database.");
        return;
      }
      setApplications(data || []);
    } catch (err) {
      console.error(err);
      setLoadError("Failed to synchronize application records.");
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateString) {
    if (!dateString) return "No date";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function formatDateTime(dateString) {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  // Real-time Skill Matching Algorithm via unified jobFitEngine
  function calculateMatchScore(candidateSkillsStr, jobSkillsStr) {
    const fit = calculateJobFit({ skills: candidateSkillsStr }, { required_skills: jobSkillsStr }, 0.70);
    return fit.jobFitScore;
  }

  function getMatchLabel(score) {
    if (score >= 80) return { label: "Expert Match", color: "#15803d", bg: "#e9fbef" };
    if (score >= 50) return { label: "Good Match", color: "#b45309", bg: "#fef3c7" };
    return { label: "Low Match", color: "#b91c1c", bg: "#fef2f2" };
  }

  function renderStageBadge(status) {
    const s = (status || "applied").toLowerCase();
    if (isHired(s) || s === "hired" || s === "accepted") {
      return (
        <span style={{ background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0", padding: "4px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: "700" }}>
          🎉 Hired
        </span>
      );
    }
    if (isRejected(s) || s === "rejected") {
      return (
        <span style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5", padding: "4px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: "700" }}>
          ❌ Rejected
        </span>
      );
    }
    if (isInterviewStage(s) || s.includes("interview")) {
      return (
        <span style={{ background: "#e0f2fe", color: "#0369a1", border: "1px solid #bae6fd", padding: "4px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: "700" }}>
          💬 Interview Phase
        </span>
      );
    }
    if (s === "shortlisted") {
      return (
        <span style={{ background: "#f3e8ff", color: "#6b21a8", border: "1px solid #e9d5ff", padding: "4px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: "700" }}>
          ⭐ Shortlisted
        </span>
      );
    }
    if (s === "reviewing") {
      return (
        <span style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a", padding: "4px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: "700" }}>
          🔍 Under Review
        </span>
      );
    }
    return (
      <span style={{ background: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1", padding: "4px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: "700" }}>
        📋 Applied
      </span>
    );
  }

  // Open Resume Preview Modal
  function handleOpenResume(app) {
    const appObject = {
      id: app.id,
      status: app.status,
      created_at: app.created_at,
      updated_at: app.updated_at,
      resume: app.resume_file_url ? {
        file_url: app.resume_file_url,
        file_name: app.resume_file_name,
        file_size: app.resume_file_size,
        created_at: app.resume_created_at,
      } : null,
      profiles: {
        full_name: app.applicant_name,
        email: app.applicant_email,
        skills: app.applicant_snapshot?.skills || "",
      },
      displayName: app.applicant_name || app.applicant_email || "Unnamed Candidate",
      jobs: {
        title: app.job_title,
        location: app.job_location,
        employment_type: app.job_employment_type,
      }
    };
    setActiveResumeViewer(appObject);
  }

  // Filter & Search Logic
  const filteredApplications = applications.filter((app) => {
    const applicantName = (app.applicant_name || "").toLowerCase();
    const jobTitle = (app.job_title || "").toLowerCase();
    const employerName = (app.employer_name || "").toLowerCase();
    const query = searchQuery.toLowerCase();

    const matchesSearch =
      applicantName.includes(query) ||
      jobTitle.includes(query) ||
      employerName.includes(query);

    let matchesStatus = true;
    if (statusFilter === "applied") {
      matchesStatus = isScreeningStatus(app.status) || app.status === "applied";
    } else if (statusFilter === "interview") {
      matchesStatus = isInterviewStage(app.status) || (app.status || "").includes("interview");
    } else if (statusFilter === "hired") {
      matchesStatus = isHired(app.status) || app.status === "hired";
    } else if (statusFilter === "rejected") {
      matchesStatus = isRejected(app.status) || app.status === "rejected";
    }

    // Calculate match score to filter on it
    const candidateSkills = app.applicant_snapshot?.skills || "";
    const jobSkills = app.job_required_skills || "";
    const score = calculateMatchScore(candidateSkills, jobSkills);

    let matchesMatch = true;
    if (matchFilter === "high") {
      matchesMatch = score >= 80;
    } else if (matchFilter === "medium") {
      matchesMatch = score >= 50 && score < 80;
    } else if (matchFilter === "low") {
      matchesMatch = score < 50;
    }

    return matchesSearch && matchesStatus && matchesMatch;
  });

  // Calculate statistics
  const totalApps = applications.length;
  const hiredCount = applications.filter((a) => isHired(a.status) || a.status === "hired").length;
  const interviewCount = applications.filter((a) => isInterviewStage(a.status) || (a.status || "").includes("interview")).length;
  const rejectedCount = applications.filter((a) => isRejected(a.status) || a.status === "rejected").length;
  const appliedCount = applications.filter((a) => isScreeningStatus(a.status) || a.status === "applied").length;

  return (
    <DashboardLayout
      role="admin"
      title="Application Monitoring"
      subtitle="Monitor recruitment progress, inspect application records, and audit hiring activity across the platform."
    >
      {/* METRIC PIPELINES */}
      <section className="overview-grid" style={{ marginBottom: "22px", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <article className="overview-card" style={{ borderLeft: "4px solid #58158f" }}>
          <span>↗</span>
          <div>
            <h3>{totalApps}</h3>
            <p>Total Submissions</p>
          </div>
        </article>
        <article className="overview-card" style={{ borderLeft: "4px solid #6366f1" }}>
          <span>📋</span>
          <div>
            <h3>{appliedCount}</h3>
            <p>Screening / Applied</p>
          </div>
        </article>
        <article className="overview-card" style={{ borderLeft: "4px solid #3b82f6" }}>
          <span>💬</span>
          <div>
            <h3>{interviewCount}</h3>
            <p>In Interview Phase</p>
          </div>
        </article>
        <article className="overview-card" style={{ borderLeft: "4px solid #10b981" }}>
          <span>✓</span>
          <div>
            <h3>{hiredCount}</h3>
            <p>Offers / Hired</p>
          </div>
        </article>
        <article className="overview-card" style={{ borderLeft: "4px solid #ef4444" }}>
          <span>×</span>
          <div>
            <h3>{rejectedCount}</h3>
            <p>Rejections Marked</p>
          </div>
        </article>
      </section>

      {/* PIPELINE PANEL */}
      <section className="dashboard-panel">
        <div className="panel-header" style={{ borderBottom: "none", marginBottom: "8px" }}>
          <div className="panel-header-content">
            <h2>Active Recruitment Funnel ({filteredApplications.length})</h2>
            <p>Read-only recruitment inspection and platform hiring audit view.</p>
          </div>
        </div>

        {/* SEARCH AND ADVANCED FILTERS */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr",
          gap: "12px",
          background: "#f9fafb",
          padding: "12px",
          borderRadius: "18px",
          border: "1px solid #f2f4f7",
          marginBottom: "20px"
        }}>
          <input
            type="text"
            placeholder="Search by candidate name, job title, or employer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              height: "44px",
              padding: "0 14px",
              fontSize: "14px",
              border: "1px solid #d0d5dd",
              borderRadius: "10px",
              outline: "none"
            }}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              height: "44px",
              padding: "0 10px",
              fontSize: "14px",
              border: "1px solid #d0d5dd",
              borderRadius: "10px",
              outline: "none",
              background: "#fff"
            }}
          >
            <option value="all">All Hiring Statuses</option>
            <option value="applied">Applied / Screening</option>
            <option value="interview">In Interview Phase</option>
            <option value="hired">Hired / Selected</option>
            <option value="rejected">Rejected / Closed</option>
          </select>
          <select
            value={matchFilter}
            onChange={(e) => setMatchFilter(e.target.value)}
            style={{
              height: "44px",
              padding: "0 10px",
              fontSize: "14px",
              border: "1px solid #d0d5dd",
              borderRadius: "10px",
              outline: "none",
              background: "#fff"
            }}
          >
            <option value="all">All Skill Matches</option>
            <option value="high">Expert Matches (80%+)</option>
            <option value="medium">Good Matches (50%-79%)</option>
            <option value="low">Low Matches (Below 50%)</option>
          </select>
        </div>

        {loadError && (
          <div className="profile-message" style={{ background: "#fff1f2", color: "#e11d48", borderColor: "#fecdd3", marginBottom: "20px" }}>
            {loadError}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: "80px 0", fontSize: "16px", color: "#667085" }}>
            Loading platform pipelines...
          </div>
        ) : filteredApplications.length === 0 ? (
          <div className="empty-state">
            <span>↗</span>
            <h3>No applications found</h3>
            <p>No submitted application matches the specified filter criteria.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{
              width: "100%",
              borderCollapse: "separate",
              borderSpacing: "0 8px",
              minWidth: "900px"
            }}>
              <thead>
                <tr style={{ color: "#667085", fontSize: "13px", fontWeight: "800", textAlign: "left" }}>
                  <th style={{ padding: "12px 16px" }}>Candidate & Role Details</th>
                  <th style={{ padding: "12px 16px" }}>Employer Organization</th>
                  <th style={{ padding: "12px 16px" }}>Applied Date</th>
                  <th style={{ padding: "12px 16px" }}>Skill-set Match Score</th>
                  <th style={{ padding: "12px 16px" }}>Current Recruitment Stage</th>
                  <th style={{ padding: "12px 16px", textAlign: "right" }}>Inspection</th>
                </tr>
              </thead>
              <tbody>
                {filteredApplications.map((app) => {
                  const candidateSkills = app.applicant_snapshot?.skills || "";
                  const jobSkills = app.job_required_skills || "";
                  const matchScore = calculateMatchScore(candidateSkills, jobSkills);
                  const matchDetails = getMatchLabel(matchScore);

                  return (
                    <tr key={app.id} className="application-vault-row" style={{
                      background: "#ffffff",
                      border: "1px solid #e7e2f2",
                      borderRadius: "16px",
                      boxShadow: "0 2px 4px rgba(0,0,0,0.01)",
                      transition: "0.2s"
                    }}>
                      {/* CANDIDATE & ROLE */}
                      <td style={{
                        padding: "16px",
                        borderTopLeftRadius: "16px",
                        borderBottomLeftRadius: "16px",
                        borderTop: "1px solid #e7e2f2",
                        borderBottom: "1px solid #e7e2f2",
                        borderLeft: "1px solid #e7e2f2"
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <div style={{
                            width: "40px",
                            height: "40px",
                            borderRadius: "10px",
                            background: "linear-gradient(135deg, #58158f, #f13093)",
                            color: "#ffffff",
                            display: "grid",
                            placeItems: "center",
                            fontSize: "16px",
                            fontWeight: "bold"
                          }}>
                            {(app.applicant_name || "A").charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <strong style={{ display: "block", fontSize: "14px", color: "#101828" }}>
                              {app.applicant_name || "Unnamed Candidate"}
                            </strong>
                            <span style={{ display: "block", fontSize: "12px", color: "#667085" }}>
                              Applied for <strong style={{ color: "#58158f" }}>{app.job_title || "Job role"}</strong>
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* EMPLOYER */}
                      <td style={{
                        padding: "16px",
                        borderTop: "1px solid #e7e2f2",
                        borderBottom: "1px solid #e7e2f2"
                      }}>
                        <div>
                          <strong style={{ display: "block", fontSize: "14px", color: "#344054" }}>
                            {app.employer_name || "Unnamed Recruiter"}
                          </strong>
                          <span style={{ fontSize: "12px", color: "#667085" }}>
                            {app.employer_email || "No email"}
                          </span>
                        </div>
                      </td>

                      {/* DATE */}
                      <td style={{
                        padding: "16px",
                        borderTop: "1px solid #e7e2f2",
                        borderBottom: "1px solid #e7e2f2",
                        fontSize: "13px",
                        color: "#475467"
                      }}>
                        {formatDate(app.created_at)}
                      </td>

                      {/* SKILL MATCH SCORE */}
                      <td style={{
                        padding: "16px",
                        borderTop: "1px solid #e7e2f2",
                        borderBottom: "1px solid #e7e2f2"
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div style={{ flex: 1, minWidth: "60px", background: "#f2f4f7", borderRadius: "10px", height: "8px", overflow: "hidden" }}>
                            <div style={{
                              width: `${matchScore}%`,
                              background: matchScore >= 80 ? "#10b981" : matchScore >= 50 ? "#f59e0b" : "#ef4444",
                              height: "100%",
                              borderRadius: "10px"
                            }} />
                          </div>
                          <div>
                            <span style={{
                              display: "inline-block",
                              fontSize: "11px",
                              fontWeight: "900",
                              padding: "3px 6px",
                              borderRadius: "5px",
                              background: matchDetails.bg,
                              color: matchDetails.color
                            }}>
                              {matchScore}% ({matchDetails.label})
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* READ-ONLY RECRUITMENT STAGE */}
                      <td style={{
                        padding: "16px",
                        borderTop: "1px solid #e7e2f2",
                        borderBottom: "1px solid #e7e2f2"
                      }}>
                        {renderStageBadge(app.status)}
                      </td>

                      {/* INSPECTION ACTIONS */}
                      <td style={{
                        padding: "16px",
                        borderTopRightRadius: "16px",
                        borderBottomRightRadius: "16px",
                        borderTop: "1px solid #e7e2f2",
                        borderBottom: "1px solid #e7e2f2",
                        borderRight: "1px solid #e7e2f2",
                        textAlign: "right"
                      }}>
                        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => setSelectedAppDetails(app)}
                            style={{
                              background: "#f8fafc",
                              color: "#1e293b",
                              border: "1px solid #cbd5e1",
                              padding: "6px 10px",
                              borderRadius: "6px",
                              fontSize: "12px",
                              fontWeight: "600",
                              cursor: "pointer"
                            }}
                          >
                            👁 View Details
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenResume(app)}
                            style={{
                              background: "#f1f5f9",
                              color: "#475569",
                              border: "1px solid #cbd5e1",
                              padding: "6px 10px",
                              borderRadius: "6px",
                              fontSize: "12px",
                              fontWeight: "600",
                              cursor: "pointer"
                            }}
                          >
                            📄 Resume
                          </button>

                          <button
                            type="button"
                            onClick={() => setSelectedAppTimeline(app)}
                            style={{
                              background: "#eff6ff",
                              color: "#1d4ed8",
                              border: "1px solid #bfdbfe",
                              padding: "6px 10px",
                              borderRadius: "6px",
                              fontSize: "12px",
                              fontWeight: "700",
                              cursor: "pointer"
                            }}
                          >
                            📜 Timeline
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 1. APPLICATION DETAILS MODAL */}
      {selectedAppDetails && (() => {
        const app = selectedAppDetails;
        const candidateSkills = app.applicant_snapshot?.skills || "";
        const jobSkills = app.job_required_skills || "";
        const matchScore = calculateMatchScore(candidateSkills, jobSkills);

        return (
          <div className="modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}>
            <div style={{ background: "#ffffff", borderRadius: "16px", maxWidth: "650px", width: "100%", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
              {/* Header */}
              <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "18px", color: "#0f172a" }}>📋 Application Record Details</h3>
                  <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#64748b" }}>Read-only platform application inspection</p>
                </div>
                <button type="button" onClick={() => setSelectedAppDetails(null)} style={{ background: "none", border: "none", fontSize: "22px", cursor: "pointer", color: "#64748b" }}>×</button>
              </div>

              {/* Body */}
              <div style={{ padding: "24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "18px" }}>
                {/* Status Bar */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderRadius: "10px", background: "#f8fafc", border: "1px solid #e2e8f0", flexWrap: "wrap", gap: "10px" }}>
                  <div>
                    <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "700", textTransform: "uppercase" }}>Recruitment Stage:</span>
                    <div style={{ marginTop: "4px" }}>
                      {renderStageBadge(app.status)}
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "700", textTransform: "uppercase" }}>Skill Match Score:</span>
                    <div style={{ marginTop: "4px", fontSize: "14px", fontWeight: "800", color: "#0f172a" }}>
                      {matchScore}%
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "700", textTransform: "uppercase" }}>Applied Date:</span>
                    <div style={{ marginTop: "4px", fontSize: "13px", fontWeight: "600", color: "#334155" }}>
                      {formatDate(app.created_at)}
                    </div>
                  </div>
                </div>

                {/* Candidate Info */}
                <div>
                  <h4 style={{ margin: "0 0 8px 0", fontSize: "14px", fontWeight: "700", color: "#1e293b" }}>👤 Candidate Information</h4>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "13px" }}>
                    <div><span style={{ color: "#64748b" }}>Name:</span> <strong style={{ color: "#0f172a" }}>{app.applicant_name || "Unnamed"}</strong></div>
                    <div><span style={{ color: "#64748b" }}>Email:</span> <strong style={{ color: "#0f172a" }}>{app.applicant_email || "Not specified"}</strong></div>
                  </div>
                  {candidateSkills && (
                    <div style={{ marginTop: "8px", fontSize: "13px" }}>
                      <span style={{ color: "#64748b" }}>Applicant Skills Snapshot:</span> <span style={{ color: "#334155" }}>{candidateSkills}</span>
                    </div>
                  )}
                </div>

                {/* Job & Employer Info */}
                <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "14px" }}>
                  <h4 style={{ margin: "0 0 8px 0", fontSize: "14px", fontWeight: "700", color: "#1e293b" }}>🏢 Job & Employer</h4>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "13px" }}>
                    <div><span style={{ color: "#64748b" }}>Position:</span> <strong style={{ color: "#0f172a" }}>{app.job_title || "Role"}</strong></div>
                    <div><span style={{ color: "#64748b" }}>Location:</span> <strong style={{ color: "#0f172a" }}>{app.job_location || "Not specified"}</strong></div>
                    <div><span style={{ color: "#64748b" }}>Employer:</span> <strong style={{ color: "#0f172a" }}>{app.employer_name || "Company"}</strong></div>
                    <div><span style={{ color: "#64748b" }}>Contact:</span> <strong style={{ color: "#0f172a" }}>{app.employer_email || "No email"}</strong></div>
                  </div>
                </div>

                {/* Decision / Outcome Info */}
                {(app.reject_reason || app.recruiter_notes) && (
                  <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "14px" }}>
                    <h4 style={{ margin: "0 0 8px 0", fontSize: "14px", fontWeight: "700", color: "#1e293b" }}>📝 Employer Feedback & Outcome Notes</h4>
                    {app.reject_reason && (
                      <p style={{ margin: "0 0 6px 0", fontSize: "13px", color: "#dc2626" }}>
                        <strong>Rejection Reason:</strong> {app.reject_reason}
                      </p>
                    )}
                    {app.recruiter_notes && (
                      <p style={{ margin: 0, fontSize: "13px", color: "#334155" }}>
                        <strong>Recruiter Notes:</strong> {app.recruiter_notes}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div style={{ padding: "16px 24px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between" }}>
                <button
                  type="button"
                  onClick={() => {
                    handleOpenResume(app);
                  }}
                  style={{ background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1", padding: "8px 14px", borderRadius: "8px", fontWeight: "600", cursor: "pointer" }}
                >
                  📄 View Resume
                </button>

                <button type="button" onClick={() => setSelectedAppDetails(null)} style={{ background: "#e2e8f0", color: "#334155", border: "none", padding: "8px 16px", borderRadius: "8px", fontWeight: "600", cursor: "pointer" }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 2. RECRUITMENT TIMELINE MODAL */}
      {selectedAppTimeline && (() => {
        const app = selectedAppTimeline;
        const status = (app.status || "").toLowerCase();
        const isHiredStatus = isHired(status);
        const isRejectedStatus = isRejected(status);
        const hasInterview = isInterviewStage(status) || isHiredStatus || isRejectedStatus;

        return (
          <div className="modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}>
            <div style={{ background: "#ffffff", borderRadius: "16px", maxWidth: "560px", width: "100%", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
              {/* Header */}
              <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "18px", color: "#0f172a" }}>📜 Recruitment Lifecycle Timeline</h3>
                  <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#64748b" }}>
                    Candidate: <strong>{app.applicant_name || "Candidate"}</strong> · Job: <strong>{app.job_title}</strong>
                  </p>
                </div>
                <button type="button" onClick={() => setSelectedAppTimeline(null)} style={{ background: "none", border: "none", fontSize: "22px", cursor: "pointer", color: "#64748b" }}>×</button>
              </div>

              {/* Timeline Body */}
              <div style={{ padding: "24px", overflowY: "auto" }}>
                <div style={{ borderLeft: "2px solid #e2e8f0", marginLeft: "14px", paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "24px" }}>
                  {/* Event 1: Applied */}
                  <div style={{ position: "relative" }}>
                    <div style={{ position: "absolute", left: "-29px", top: "0", width: "16px", height: "16px", borderRadius: "50%", background: "#10b981", border: "3px solid #fff", boxShadow: "0 0 0 1px #10b981" }} />
                    <strong style={{ fontSize: "14px", color: "#0f172a", display: "block" }}>1. Application Submitted</strong>
                    <span style={{ fontSize: "12px", color: "#64748b" }}>{formatDateTime(app.created_at)}</span>
                    <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#475569" }}>
                      Candidate submitted resume for {app.job_title || "the position"}.
                    </p>
                  </div>

                  {/* Event 2: Screening */}
                  <div style={{ position: "relative" }}>
                    <div style={{ position: "absolute", left: "-29px", top: "0", width: "16px", height: "16px", borderRadius: "50%", background: "#6366f1", border: "3px solid #fff", boxShadow: "0 0 0 1px #6366f1" }} />
                    <strong style={{ fontSize: "14px", color: "#0f172a", display: "block" }}>2. Screening & AI Job Fit</strong>
                    <span style={{ fontSize: "12px", color: "#64748b" }}>Completed at application time</span>
                    <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#475569" }}>
                      Candidate snapshot verified and evaluated against required skills.
                    </p>
                  </div>

                  {/* Event 3: Interview Phase */}
                  {hasInterview && (
                    <div style={{ position: "relative" }}>
                      <div style={{ position: "absolute", left: "-29px", top: "0", width: "16px", height: "16px", borderRadius: "50%", background: "#3b82f6", border: "3px solid #fff", boxShadow: "0 0 0 1px #3b82f6" }} />
                      <strong style={{ fontSize: "14px", color: "#0f172a", display: "block" }}>3. Interview Stage</strong>
                      <span style={{ fontSize: "12px", color: "#64748b" }}>Progressed by employer</span>
                      <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#475569" }}>
                        Candidate reached employer interview phase.
                      </p>
                    </div>
                  )}

                  {/* Event 4: Final Outcome */}
                  {(isHiredStatus || isRejectedStatus) && (
                    <div style={{ position: "relative" }}>
                      <div style={{ position: "absolute", left: "-29px", top: "0", width: "16px", height: "16px", borderRadius: "50%", background: isHiredStatus ? "#16a34a" : "#dc2626", border: "3px solid #fff", boxShadow: `0 0 0 1px ${isHiredStatus ? "#16a34a" : "#dc2626"}` }} />
                      <strong style={{ fontSize: "14px", color: isHiredStatus ? "#166534" : "#991b1b", display: "block" }}>
                        4. Final Recruitment Outcome: {isHiredStatus ? "Hired / Offer Accepted" : "Rejected / Closed"}
                      </strong>
                      <span style={{ fontSize: "12px", color: "#64748b" }}>
                        {app.updated_at ? formatDateTime(app.updated_at) : "Decision finalized"}
                      </span>
                      <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#475569" }}>
                        {isHiredStatus ? "Employer completed hiring and made official job offer." : `Application closed by employer.${app.reject_reason ? ` Reason: ${app.reject_reason}` : ""}`}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div style={{ padding: "16px 24px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setSelectedAppTimeline(null)} style={{ background: "#e2e8f0", color: "#334155", border: "none", padding: "8px 16px", borderRadius: "8px", fontWeight: "600", cursor: "pointer" }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* RESUME PREVIEW MODAL */}
      {activeResumeViewer && (
        <ResumeViewerModal
          applicant={activeResumeViewer}
          readOnly={true}
          context="admin"
          onClose={() => setActiveResumeViewer(null)}
        />
      )}
    </DashboardLayout>
  );
}
