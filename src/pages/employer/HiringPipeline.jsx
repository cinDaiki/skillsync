import { useState, useEffect } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { supabase } from "../../services/supabase";
import { fetchEmployerApplicants } from "../../services/applicationService";
import { fetchInterviewsForEmployer } from "../../services/interviewService";
import { isTerminalApplicationStatus } from "../../services/recruitmentStatus";
import AIMatchReport from "../../components/ai/AIMatchReport";
import ResumeViewerModal from "../../components/resume/ResumeViewerModal";
import "./HiringPipeline.css";

export default function HiringPipeline() {
  const [applicants, setApplicants] = useState([]);
  const [interviewsMap, setInterviewsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState("Hired");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterJob, setFilterJob] = useState("All");

  // Detail & History Modal states
  const [selectedApplicant, setSelectedApplicant] = useState(null);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [viewingResume, setViewingResume] = useState(null);
  const [historyModalInfo, setHistoryModalInfo] = useState(null);

  useEffect(() => {
    loadPipelineData();
  }, []);

  async function loadPipelineData() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    if (userId) {
      const { data: appsData } = await fetchEmployerApplicants(userId);
      const { data: invsData } = await fetchInterviewsForEmployer(userId);

      // Build interview mapping by application_id
      const invMap = {};
      if (invsData) {
        invsData.forEach((inv) => {
          if (inv.application_id) {
            invMap[inv.application_id] = inv;
          }
        });
      }

      setInterviewsMap(invMap);
      setApplicants(appsData || []);
    }
    setLoading(false);
  }

  const uniqueJobs = ["All", ...new Set(applicants.map(a => a.job_title).filter(Boolean))];

  // Filtering Logic
  const filteredApplicants = applicants.filter((app) => {
    const candidateName = (app.name || "").toLowerCase();
    const candidateEmail = (app.email || "").toLowerCase();
    const jobTitle = app.job_title || "";
    const query = searchQuery.toLowerCase().trim();

    const matchesSearch = !query || candidateName.includes(query) || candidateEmail.includes(query) || jobTitle.toLowerCase().includes(query);
    const matchesJob = filterJob === "All" || jobTitle === filterJob;

    const statusLower = (app.status || "").toLowerCase();
    let matchesTab = true;

    if (filterTab === "Hired") {
      matchesTab = statusLower === "hired" || statusLower === "accepted";
    } else if (filterTab === "Rejected") {
      matchesTab = statusLower === "rejected";
    } else if (filterTab === "Withdrawn") {
      matchesTab = statusLower === "withdrawn";
    } else if (filterTab === "Decision Pending") {
      matchesTab = statusLower === "shortlisted" || statusLower === "interview_scheduled" || statusLower === "interview_completed";
    } else if (filterTab === "Terminal History") {
      matchesTab = isTerminalApplicationStatus(statusLower);
    }

    return matchesSearch && matchesJob && matchesTab;
  });

  return (
    <DashboardLayout
      role="employer"
      title="🗂️ Hiring Pipeline & Recruitment History"
      subtitle="Track final hiring decisions, review recruitment outcomes, and audit recruitment history."
    >
        {/* TOP TOOLBAR & QUICK TABS */}
        <div className="hiring-pipeline-toolbar">
          <div className="pipeline-quick-tabs">
            <button
              type="button"
              className={`hp-tab-btn ${filterTab === "Hired" ? "active hired" : ""}`}
              onClick={() => setFilterTab("Hired")}
            >
              🎉 Hired ({applicants.filter(a => ["hired", "accepted"].includes((a.status || "").toLowerCase())).length})
            </button>

            <button
              type="button"
              className={`hp-tab-btn ${filterTab === "Rejected" ? "active rejected" : ""}`}
              onClick={() => setFilterTab("Rejected")}
            >
              ❌ Rejected ({applicants.filter(a => (a.status || "").toLowerCase() === "rejected").length})
            </button>

            <button
              type="button"
              className={`hp-tab-btn ${filterTab === "Decision Pending" ? "active" : ""}`}
              onClick={() => setFilterTab("Decision Pending")}
            >
              ⏳ Decision Pending ({applicants.filter(a => ["shortlisted", "interview_scheduled", "interview_completed"].includes((a.status || "").toLowerCase())).length})
            </button>

            <button
              type="button"
              className={`hp-tab-btn ${filterTab === "Terminal History" ? "active" : ""}`}
              onClick={() => setFilterTab("Terminal History")}
            >
              📁 All Terminal Archive ({applicants.filter(a => isTerminalApplicationStatus(a.status)).length})
            </button>

            <button
              type="button"
              className={`hp-tab-btn ${filterTab === "All" ? "active" : ""}`}
              onClick={() => setFilterTab("All")}
            >
              🌐 All Records ({applicants.length})
            </button>
          </div>

          <div className="pipeline-filter-row">
            <input
              type="text"
              className="hp-search-input"
              placeholder="🔍 Search applicant name, role, or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            <select className="hp-filter-select" value={filterJob} onChange={(e) => setFilterJob(e.target.value)}>
              {uniqueJobs.map((j) => (
                <option key={j} value={j}>{j === "All" ? "All Job Listings" : j}</option>
              ))}
            </select>
          </div>
        </div>

        {/* PIPELINE CARDS GRID */}
        {loading ? (
          <div className="empty-state">
            <h3>Loading hiring records...</h3>
          </div>
        ) : filteredApplicants.length === 0 ? (
          <div className="empty-state">
            <span>🗂️</span>
            <h3>No recruitment records found</h3>
            <p>Candidates will appear here once hiring decisions or terminal outcomes are recorded.</p>
          </div>
        ) : (
          <div className="pipeline-cards-grid">
            {filteredApplicants.map((app) => {
              const inv = interviewsMap[app.id];
              const statusLower = (app.status || "").toLowerCase();

              return (
                <div key={app.id} className={`hp-card ${statusLower}`}>
                  <div className="hp-card-header">
                    <div className="hp-candidate-meta">
                      <h4>{app.name || "Candidate"}</h4>
                      <p className="hp-email">{app.email || ""}</p>
                      <p className="hp-job-badge">💼 {app.job_title || "Position"}</p>
                    </div>

                    <span className={`hp-status-badge ${statusLower}`}>
                      {statusLower === "hired" || statusLower === "accepted"
                        ? "🎉 Hired"
                        : statusLower === "rejected"
                        ? "❌ Rejected"
                        : statusLower === "withdrawn"
                        ? "📁 Withdrawn"
                        : app.status}
                    </span>
                  </div>

                  <div className="hp-card-body">
                    <div className="hp-detail-grid">
                      <div className="hp-detail-item">
                        <span>Applied:</span>
                        <strong>{app.created_at ? new Date(app.created_at).toLocaleDateString() : "N/A"}</strong>
                      </div>

                      <div className="hp-detail-item">
                        <span>Interview:</span>
                        <strong>{inv?.scheduled_date || "N/A"}</strong>
                      </div>

                      <div className="hp-detail-item">
                        <span>Decision Date:</span>
                        <strong>{app.updated_at ? new Date(app.updated_at).toLocaleDateString() : "N/A"}</strong>
                      </div>

                      <div className="hp-detail-item">
                        <span>AI Match:</span>
                        <strong className="hp-score">{app.match_score ? `${app.match_score}%` : "N/A"}</strong>
                      </div>
                    </div>

                    {app.reject_reason && statusLower === "rejected" && (
                      <div className="hp-rejection-note">
                        <span>Reason:</span> {app.reject_reason}
                      </div>
                    )}
                  </div>

                  <div className="hp-card-actions">
                    <button
                      type="button"
                      className="hp-action-btn view"
                      onClick={() => {
                        setSelectedApplicant(app);
                        setShowMatchModal(true);
                      }}
                    >
                      👤 View Details
                    </button>

                    <button
                      type="button"
                      className="hp-action-btn history"
                      onClick={() => setHistoryModalInfo({ app, inv })}
                    >
                      📜 View Timeline
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* CHRONOLOGICAL TIMELINE MODAL */}
        {historyModalInfo && (
          <div className="modal-overlay">
            <div className="modal-card timeline-modal">
              <h3>📜 Recruitment History Timeline</h3>
              <p className="timeline-subtitle">
                Candidate: <strong>{historyModalInfo.app.name}</strong> for Position: <strong>{historyModalInfo.app.job_title}</strong>
              </p>

              <div className="timeline-steps">
                <div className="timeline-step completed">
                  <div className="step-icon">📋</div>
                  <div className="step-content">
                    <h4>1. Application Submitted</h4>
                    <p>Candidate submitted profile snapshot and resume.</p>
                    <span className="step-time">{new Date(historyModalInfo.app.created_at).toLocaleString()}</span>
                  </div>
                </div>

                <div className={`timeline-step ${historyModalInfo.app.status !== "applied" ? "completed" : "pending"}`}>
                  <div className="step-icon">👁️</div>
                  <div className="step-content">
                    <h4>2. Profile Reviewed & Evaluated</h4>
                    <p>Recruiter reviewed candidate skills and ATS match score ({historyModalInfo.app.match_score || "N/A"}%).</p>
                  </div>
                </div>

                {historyModalInfo.inv && (
                  <div className="timeline-step completed">
                    <div className="step-icon">📅</div>
                    <div className="step-content">
                      <h4>3. Interview Conducted ({historyModalInfo.inv.interview_type || "Online"})</h4>
                      <p>Scheduled: {historyModalInfo.inv.scheduled_date} at {historyModalInfo.inv.scheduled_time}. Status: {historyModalInfo.inv.status}</p>
                    </div>
                  </div>
                )}

                <div className={`timeline-step ${isTerminalApplicationStatus(historyModalInfo.app.status) ? "completed" : "active"}`}>
                  <div className="step-icon">
                    {historyModalInfo.app.status === "hired" ? "🎉" : historyModalInfo.app.status === "rejected" ? "❌" : "⏳"}
                  </div>
                  <div className="step-content">
                    <h4>4. Final Outcome: {(historyModalInfo.app.status || "").toUpperCase()}</h4>
                    <p>Recorded timestamp: {new Date(historyModalInfo.app.updated_at || historyModalInfo.app.created_at).toLocaleString()}</p>
                  </div>
                </div>
              </div>

              <div className="modal-actions" style={{ marginTop: "20px" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ background: "#e2e8f0", color: "#334155", border: "none", padding: "10px 18px", borderRadius: "8px" }}
                  onClick={() => setHistoryModalInfo(null)}
                >
                  Close Timeline
                </button>
              </div>
            </div>
          </div>
        )}

        {/* AI MATCH MODAL */}
        {showMatchModal && selectedApplicant && (
          <div className="modal-overlay">
            <div className="modal-card wide-modal">
              <AIMatchReport
                applicant={selectedApplicant}
                jobRequiredSkills={selectedApplicant.required_skills}
                jobRequiredCerts={selectedApplicant.required_certifications}
                onClose={() => setShowMatchModal(false)}
                onViewResume={(resumeUrl) => setViewingResume(resumeUrl)}
              />
            </div>
          </div>
        )}

        {/* RESUME VIEWER MODAL */}
        {viewingResume && (
          <ResumeViewerModal
            resumeUrl={viewingResume}
            candidateName={selectedApplicant?.name || "Candidate"}
            onClose={() => setViewingResume(null)}
          />
        )}
    </DashboardLayout>
  );
}
