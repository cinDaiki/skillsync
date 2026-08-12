import { useState, useEffect } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { supabase } from "../../services/supabase";
import { fetchEmployerApplicants } from "../../services/applicationService";
import { fetchInterviewsForEmployer } from "../../services/interviewService";
import {
  isTerminalApplication,
  isDecisionPending,
  isHired,
  isRejected,
  normalizeApplicationStatus
} from "../../services/recruitmentStatus";
import AIMatchReport from "../../components/ai/AIMatchReport";
import ResumeViewerModal from "../../components/resume/ResumeViewerModal";
import "./HiringPipeline.css";

function deduplicateByAppId(list) {
  if (!Array.isArray(list)) return [];
  const map = new Map();
  list.forEach(item => {
    if (item && item.id && !map.has(item.id)) {
      map.set(item.id, item);
    }
  });
  return Array.from(map.values());
}

export default function HiringPipeline() {
  const [applicants, setApplicants] = useState([]);
  const [interviewsMap, setInterviewsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState("Decision Pending");
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
          if (inv.application_id && !invMap[inv.application_id]) {
            invMap[inv.application_id] = inv;
          }
        });
      }

      setInterviewsMap(invMap);
      const uniqueApps = deduplicateByAppId(appsData || []);
      setApplicants(uniqueApps);

      // If any applicant has Decision Pending, default tab to Decision Pending, else Hired or All
      const hasPending = uniqueApps.some(a => isDecisionPending(a.status));
      const hasHired = uniqueApps.some(a => isHired(a.status));
      if (hasPending) setFilterTab("Decision Pending");
      else if (hasHired) setFilterTab("Hired");
      else setFilterTab("All");
    }
    setLoading(false);
  }

  const uniqueJobs = ["All", ...new Set(applicants.map(a => a.job_title || a.jobs?.title).filter(Boolean))];

  // Base filtering by Search and Job
  const baseFiltered = applicants.filter((app) => {
    const candidateName = (app.name || app.profiles?.full_name || app.displayName || "").toLowerCase();
    const candidateEmail = (app.email || app.profiles?.email || app.displayEmail || "").toLowerCase();
    const jobTitle = (app.job_title || app.jobs?.title || "").toLowerCase();
    const query = searchQuery.toLowerCase().trim();

    const matchesSearch = !query || candidateName.includes(query) || candidateEmail.includes(query) || jobTitle.includes(query);
    const matchesJob = filterJob === "All" || (app.job_title || app.jobs?.title) === filterJob;

    return matchesSearch && matchesJob;
  });

  // Calculate exact counts based on baseFiltered dataset
  const counts = {
    pending: baseFiltered.filter(a => isDecisionPending(a.status)).length,
    hired: baseFiltered.filter(a => isHired(a.status)).length,
    rejected: baseFiltered.filter(a => isRejected(a.status)).length,
    archive: baseFiltered.filter(a => isTerminalApplication(a.status) && !isHired(a.status) && !isRejected(a.status)).length,
    all: baseFiltered.length
  };

  // Final Tab Filtering
  const finalApplicants = baseFiltered.filter((app) => {
    if (filterTab === "Decision Pending") return isDecisionPending(app.status);
    if (filterTab === "Hired") return isHired(app.status);
    if (filterTab === "Rejected") return isRejected(app.status);
    if (filterTab === "Archive") return isTerminalApplication(app.status) && !isHired(app.status) && !isRejected(app.status);
    return true; // "All"
  });

  return (
    <DashboardLayout
      role="employer"
      title="🗂️ Hiring Pipeline & Recruitment History"
      subtitle="Track final hiring decisions, review recruitment outcomes, and audit recruitment history."
    >
      <div className="hiring-pipeline-toolbar">
        <div className="pipeline-quick-tabs">
          <button
            type="button"
            className={`hp-tab-btn ${filterTab === "Decision Pending" ? "active" : ""}`}
            onClick={() => setFilterTab("Decision Pending")}
          >
            ⏳ Decision Pending ({counts.pending})
          </button>

          <button
            type="button"
            className={`hp-tab-btn ${filterTab === "Hired" ? "active hired" : ""}`}
            onClick={() => setFilterTab("Hired")}
          >
            🎉 Hired ({counts.hired})
          </button>

          <button
            type="button"
            className={`hp-tab-btn ${filterTab === "Rejected" ? "active rejected" : ""}`}
            onClick={() => setFilterTab("Rejected")}
          >
            ❌ Rejected ({counts.rejected})
          </button>

          <button
            type="button"
            className={`hp-tab-btn ${filterTab === "Archive" ? "active" : ""}`}
            onClick={() => setFilterTab("Archive")}
          >
            📁 Archive ({counts.archive})
          </button>

          <button
            type="button"
            className={`hp-tab-btn ${filterTab === "All" ? "active" : ""}`}
            onClick={() => setFilterTab("All")}
          >
            🌐 All Records ({counts.all})
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
      ) : finalApplicants.length === 0 ? (
        <div className="empty-state">
          <span>🗂️</span>
          <h3>No recruitment records found</h3>
          <p>No candidates match the selected <strong>{filterTab}</strong> tab and filters.</p>
        </div>
      ) : (
        <div className="pipeline-cards-grid">
          {finalApplicants.map((app) => {
            const inv = interviewsMap[app.id];
            const normStatus = normalizeApplicationStatus(app.status);
            const isAppHired = isHired(app.status);
            const isAppRejected = isRejected(app.status);

            return (
              <div key={app.id} className={`hp-card ${normStatus}`}>
                <div className="hp-card-header">
                  <div className="hp-candidate-meta">
                    <h4>{app.name || app.profiles?.full_name || "Candidate"}</h4>
                    <p className="hp-email">{app.email || app.profiles?.email || ""}</p>
                    <p className="hp-job-badge">💼 {app.job_title || app.jobs?.title || "Position"}</p>
                  </div>

                  <span className={`hp-status-badge ${normStatus}`}>
                    {isAppHired
                      ? "🎉 Hired"
                      : isAppRejected
                      ? "❌ Rejected"
                      : isDecisionPending(app.status)
                      ? "⏳ Decision Pending"
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
                      <strong>{inv?.scheduled_date || "Completed"}</strong>
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

                  {app.reject_reason && isAppRejected && (
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
              Candidate: <strong>{historyModalInfo.app.name || historyModalInfo.app.profiles?.full_name}</strong> for Position: <strong>{historyModalInfo.app.job_title || historyModalInfo.app.jobs?.title}</strong>
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

              <div className={`timeline-step ${isTerminalApplication(historyModalInfo.app.status) ? "completed" : "active"}`}>
                <div className="step-icon">
                  {isHired(historyModalInfo.app.status) ? "🎉" : isRejected(historyModalInfo.app.status) ? "❌" : "⏳"}
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
          candidateName={selectedApplicant?.name || selectedApplicant?.profiles?.full_name || "Candidate"}
          onClose={() => setViewingResume(null)}
        />
      )}
    </DashboardLayout>
  );
}
