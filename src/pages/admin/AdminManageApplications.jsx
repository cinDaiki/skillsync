import { useEffect, useState } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { supabase } from "../../services/supabase";
import { fetchAdminApplications } from "../../services/adminService";
import ResumeViewerModal from "../../components/resume/ResumeViewerModal";
import { calculateJobFit } from "../../services/ai/jobFitEngine";

export default function AdminManageApplications() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [matchFilter, setMatchFilter] = useState("all");
  const [activeResumeViewer, setActiveResumeViewer] = useState(null);
  const [toast, setToast] = useState({ text: "", type: "success" });
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadApplications();
  }, []);

  async function loadApplications() {
    setLoading(true);
    setLoadError("");
    try {
      const { data, error } = await fetchAdminApplications();
      if (error) {
        setLoadError("Could not retrieve job applications from Supabase database.");
        return;
      }
      setApplications(data || []);
    } catch (err) {
      console.error(err);
      setLoadError("Failed to synchronize with Supabase tables.");
    } finally {
      setLoading(false);
    }
  }

  function showToast(text, type = "success") {
    setToast({ text, type });
    setTimeout(() => setToast({ text: "", type: "success" }), 4000);
  }

  function formatDate(dateString) {
    if (!dateString) return "No date";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
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

  // Update application hiring status
  async function handleStatusChange(applicationId, nextStatus) {
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("applications")
        .update({ status: nextStatus })
        .eq("id", applicationId);

      if (error) {
        showToast(`Failed to update application: ${error.message}`, "error");
        return;
      }

      setApplications((prev) =>
        prev.map((app) => (app.id === applicationId ? { ...app, status: nextStatus } : app))
      );

      if (activeResumeViewer?.id === applicationId) {
        setActiveResumeViewer((prev) => ({ ...prev, status: nextStatus }));
      }

      showToast(`Hiring stage updated to "${nextStatus}" successfully.`);
    } catch (err) {
      console.error(err);
      showToast("An unexpected error occurred while saving status.", "error");
    } finally {
      setActionLoading(false);
    }
  }

  // Open Resume Preview Modal
  function handleOpenResume(app) {
    const appObject = {
      id: app.id,
      status: app.status,
      created_at: app.created_at,
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

    const matchesStatus =
      statusFilter === "all" || app.status === statusFilter;

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
  const hiredCount = applications.filter((a) => a.status === "hired").length;
  const interviewCount = applications.filter((a) => a.status === "interview").length;
  const rejectedCount = applications.filter((a) => a.status === "rejected").length;

  return (
    <DashboardLayout
      role="admin"
      title="Application Monitoring"
      subtitle="Track active recruitment pipelines, review real-time applicant skill alignment, and verify hiring updates."
    >
      {/* Toast Alert */}
      {toast.text && (
        <div style={{
          position: "fixed",
          top: "20px",
          right: "20px",
          zIndex: 1000,
          background: toast.type === "error" ? "#fff1f2" : "#e9fbef",
          color: toast.type === "error" ? "#e11d48" : "#15803d",
          border: `1px solid ${toast.type === "error" ? "#fecdd3" : "#a7f3d0"}`,
          borderRadius: "12px",
          padding: "12px 24px",
          fontWeight: "900",
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          display: "flex",
          alignItems: "center",
          gap: "8px"
        }}>
          <span>{toast.type === "error" ? "⚠️" : "✓"}</span> {toast.text}
        </div>
      )}

      {/* METRIC PIPELINES */}
      <section className="overview-grid" style={{ marginBottom: "22px", gridTemplateColumns: "repeat(4, 1fr)" }}>
        <article className="overview-card" style={{ borderLeft: "4px solid #58158f" }}>
          <span>↗</span>
          <div>
            <h3>{totalApps}</h3>
            <p>Total Submissions</p>
          </div>
        </article>
        <article className="overview-card" style={{ borderLeft: "4px solid #10b981" }}>
          <span>✓</span>
          <div>
            <h3>{hiredCount}</h3>
            <p>Offers Accepted</p>
          </div>
        </article>
        <article className="overview-card" style={{ borderLeft: "4px solid #3b82f6" }}>
          <span>💬</span>
          <div>
            <h3>{interviewCount}</h3>
            <p>In Interview Phase</p>
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
            <p>Monitor matches, inspect applicant profiles, and change recruitment status in real time.</p>
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
            placeholder="Search by candidate name, job title, or company..."
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
              outline: "none"
            }}
          >
            <option value="all">All Hiring Statuses</option>
            <option value="applied">Applied / Screened</option>
            <option value="interview">Interviewing</option>
            <option value="hired">Hired / Selected</option>
            <option value="rejected">Rejected / Passed</option>
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
              outline: "none"
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
                  <th style={{ padding: "12px 16px" }}>Recruitment Stage</th>
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

                      {/* RECRUITMENT STAGE */}
                      <td style={{
                        padding: "16px",
                        borderTop: "1px solid #e7e2f2",
                        borderBottom: "1px solid #e7e2f2"
                      }}>
                        <select
                          value={app.status || "applied"}
                          disabled={actionLoading}
                          onChange={(e) => handleStatusChange(app.id, e.target.value)}
                          style={{
                            height: "36px",
                            padding: "0 10px",
                            fontSize: "13px",
                            fontWeight: "800",
                            border: "1px solid #d0d5dd",
                            borderRadius: "8px",
                            outline: "none",
                            background: app.status === "hired" ? "#e9fbef" : app.status === "rejected" ? "#fff1f2" : app.status === "interview" ? "#eff6ff" : "#f9fafb",
                            color: app.status === "hired" ? "#15803d" : app.status === "rejected" ? "#e11d48" : app.status === "interview" ? "#1d4ed8" : "#374151"
                          }}
                        >
                          <option value="applied">Applied</option>
                          <option value="interview">Interview</option>
                          <option value="hired">Hired</option>
                          <option value="rejected">Rejected</option>
                        </select>
                      </td>

                      {/* INSPECTION */}
                      <td style={{
                        padding: "16px",
                        borderTopRightRadius: "16px",
                        borderBottomRightRadius: "16px",
                        borderTop: "1px solid #e7e2f2",
                        borderBottom: "1px solid #e7e2f2",
                        borderRight: "1px solid #e7e2f2",
                        textAlign: "right"
                      }}>
                        <button
                          type="button"
                          onClick={() => handleOpenResume(app)}
                          style={{
                            height: "36px",
                            padding: "0 14px",
                            borderRadius: "8px",
                            background: "linear-gradient(135deg, #58158f, #8b18ff)",
                            border: "none",
                            fontSize: "13px",
                            fontWeight: "800",
                            color: "#ffffff",
                            cursor: "pointer",
                            transition: "0.2s"
                          }}
                        >
                          {app.resume_file_url ? "View Resume" : "View Details"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* RESUME PREVIEW MODAL */}
      {activeResumeViewer && (
        <ResumeViewerModal
          applicant={activeResumeViewer}
          onClose={() => setActiveResumeViewer(null)}
          onAccept={(appId) => handleStatusChange(appId, "hired")}
          onReject={(appId) => handleStatusChange(appId, "rejected")}
        />
      )}
    </DashboardLayout>
  );
}
