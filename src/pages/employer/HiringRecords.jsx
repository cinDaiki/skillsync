import { useState, useEffect } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { supabase } from "../../services/supabase";
import { fetchEmployerApplicants } from "../../services/applicationService";
import { fetchInterviewsForEmployer } from "../../services/interviewService";
import {
  isTerminalApplication,
  isHired,
  isRejected,
  deduplicateByApplicationId
} from "../../services/recruitmentStatus";
import AIMatchReport from "../../components/ai/AIMatchReport";
import ResumeViewerModal from "../../components/resume/ResumeViewerModal";
import "./HiringRecords.css";

export default function HiringRecords() {
  const [applicants, setApplicants] = useState([]);
  const [interviewsMap, setInterviewsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState("Hired");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterJob, setFilterJob] = useState("All");

  const [selectedApplicant, setSelectedApplicant] = useState(null);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [viewingResume, setViewingResume] = useState(null);
  const [historyModalInfo, setHistoryModalInfo] = useState(null);

  useEffect(() => {
    loadRecordsData();
  }, []);

  async function loadRecordsData() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    if (userId) {
      const { data: appsData } = await fetchEmployerApplicants(userId);
      const { data: invsData } = await fetchInterviewsForEmployer(userId);

      const invMap = {};
      if (invsData) {
        invsData.forEach((inv) => {
          if (inv.application_id && !invMap[inv.application_id]) {
            invMap[inv.application_id] = inv;
          }
        });
      }

      setInterviewsMap(invMap);
      const uniqueApps = deduplicateByApplicationId(appsData || []);
      setApplicants(uniqueApps);
    }
    setLoading(false);
  }

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

  const counts = {
    hired: baseFiltered.filter(a => isHired(a.status)).length,
    rejected: baseFiltered.filter(a => isRejected(a.status)).length,
    other: baseFiltered.filter(a => isTerminalApplication(a.status) && !isHired(a.status) && !isRejected(a.status)).length,
    all: baseFiltered.filter(a => isTerminalApplication(a.status)).length
  };

  const finalApplicants = baseFiltered.filter((app) => {
    if (!isTerminalApplication(app.status)) return false;
    if (filterTab === "Hired") return isHired(app.status);
    if (filterTab === "Rejected") return isRejected(app.status);
    if (filterTab === "Other Closed") return !isHired(app.status) && !isRejected(app.status);
    return true; // "All History"
  });

  const uniqueJobs = ["All", ...new Set(applicants.map(a => a.job_title || a.jobs?.title).filter(Boolean))];

  return (
    <DashboardLayout
      role="employer"
      title="📜 Historical Hiring Records"
      subtitle="Complete archive of past recruitment outcomes, hired candidates, and chronological application history."
    >
      <div className="hiring-records-toolbar">
        <div className="hr-quick-tabs">
          <button
            type="button"
            className={`hr-tab-btn ${filterTab === "Hired" ? "active hired" : ""}`}
            onClick={() => setFilterTab("Hired")}
          >
            🎉 Hired ({counts.hired})
          </button>

          <button
            type="button"
            className={`hr-tab-btn ${filterTab === "Rejected" ? "active rejected" : ""}`}
            onClick={() => setFilterTab("Rejected")}
          >
            ❌ Rejected ({counts.rejected})
          </button>

          <button
            type="button"
            className={`hr-tab-btn ${filterTab === "Other Closed" ? "active" : ""}`}
            onClick={() => setFilterTab("Other Closed")}
          >
            📁 Other Closed ({counts.other})
          </button>

          <button
            type="button"
            className={`hr-tab-btn ${filterTab === "All History" ? "active" : ""}`}
            onClick={() => setFilterTab("All History")}
          >
            🌐 All History ({counts.all})
          </button>
        </div>

        <div className="hr-filter-row">
          <input
            type="text"
            className="hr-search-input"
            placeholder="🔍 Search candidate name, role, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <select className="hr-job-select" value={filterJob} onChange={(e) => setFilterJob(e.target.value)}>
            {uniqueJobs.map((j) => (
              <option key={j} value={j}>{j === "All" ? "All Job Listings" : j}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="empty-state">
          <h3>Loading recruitment history...</h3>
        </div>
      ) : finalApplicants.length === 0 ? (
        <div className="empty-state">
          <span>📜</span>
          <h3>No recruitment records found</h3>
          <p>No historical applications match the selected <strong>{filterTab}</strong> tab and filters.</p>
        </div>
      ) : (
        <div className="records-cards-grid">
          {finalApplicants.map((app) => {
            const inv = interviewsMap[app.id];
            const candidateName = app.name || app.profiles?.full_name || "Candidate";
            const jobTitle = app.job_title || app.jobs?.title || "Position";
            const isAppHired = isHired(app.status);
            const isAppRejected = isRejected(app.status);

            return (
              <div key={app.id} className={`hr-card ${isAppHired ? "hired" : isAppRejected ? "rejected" : ""}`}>
                <div>
                  <div className="hr-card-header">
                    <div>
                      <h4 className="hr-candidate-name">{candidateName}</h4>
                      <p className="hr-job-title">💼 {jobTitle}</p>
                    </div>

                    <span className={isAppHired ? "hr-badge-hired" : isAppRejected ? "hr-badge-rejected" : "hr-badge-closed"}>
                      {isAppHired ? "🎉 Hired" : isAppRejected ? "❌ Rejected" : app.status}
                    </span>
                  </div>

                  <div className="hr-details-grid">
                    <div className="hr-detail-item">
                      <span>Applied</span>
                      <strong>{app.created_at ? new Date(app.created_at).toLocaleDateString() : "N/A"}</strong>
                    </div>

                    <div className="hr-detail-item">
                      <span>Interviewed</span>
                      <strong>{inv?.scheduled_date || "Yes"}</strong>
                    </div>

                    <div className="hr-detail-item">
                      <span>Decision Date</span>
                      <strong>{app.updated_at ? new Date(app.updated_at).toLocaleDateString() : "N/A"}</strong>
                    </div>

                    <div className="hr-detail-item">
                      <span>Match Score</span>
                      <strong>{app.match_score ? `${app.match_score}%` : "Evaluated"}</strong>
                    </div>
                  </div>
                </div>

                <div className="hr-card-actions">
                  <button
                    type="button"
                    className="hr-btn-timeline"
                    onClick={() => setHistoryModalInfo({ app, inv })}
                  >
                    📜 View Timeline
                  </button>

                  <button
                    type="button"
                    className="hr-btn-timeline"
                    onClick={() => {
                      setSelectedApplicant(app);
                      setShowMatchModal(true);
                    }}
                  >
                    👤 View Details
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

              <div className="timeline-step completed">
                <div className="step-icon">👁️</div>
                <div className="step-content">
                  <h4>2. Profile Reviewed & Evaluated</h4>
                  <p>Recruiter evaluated candidate skills alignment score ({historyModalInfo.app.match_score || "N/A"}%).</p>
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

              <div className="timeline-step completed">
                <div className="step-icon">
                  {isHired(historyModalInfo.app.status) ? "🎉" : isRejected(historyModalInfo.app.status) ? "❌" : "📁"}
                </div>
                <div className="step-content">
                  <h4>4. Final Decision Recorded: {(historyModalInfo.app.status || "").toUpperCase()}</h4>
                  <p>Timestamp: {new Date(historyModalInfo.app.updated_at || historyModalInfo.app.created_at).toLocaleString()}</p>
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
