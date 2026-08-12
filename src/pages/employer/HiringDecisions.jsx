import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { supabase } from "../../services/supabase";
import { fetchEmployerApplicants } from "../../services/applicationService";
import { fetchInterviewsForEmployer, makeHiringDecision } from "../../services/interviewService";
import { isDecisionPending, deduplicateByApplicationId } from "../../services/recruitmentStatus";
import AIMatchReport from "../../components/ai/AIMatchReport";
import ResumeViewerModal from "../../components/resume/ResumeViewerModal";
import { useToast } from "../../contexts/ToastContext";
import { useModal } from "../../contexts/ModalContext";
import "./HiringDecisions.css";

export default function HiringDecisions() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const { confirm } = useModal();

  const [applicants, setApplicants] = useState([]);
  const [interviewsMap, setInterviewsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedJob, setSelectedJob] = useState("All");
  const [currentUserId, setCurrentUserId] = useState(null);

  // Modals
  const [selectedApplicant, setSelectedApplicant] = useState(null);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [viewingResume, setViewingResume] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  useEffect(() => {
    loadDecisionData();
  }, []);

  async function loadDecisionData() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    setCurrentUserId(userId);

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

  // Filter candidates whose status is Decision Pending (interview_completed or linked completed interview)
  const pendingDecisionApplicants = applicants.filter(app => isDecisionPending(app.status, interviewsMap[app.id]?.status));

  const jobsList = ["All", ...new Set(pendingDecisionApplicants.map(a => a.job_title || a.jobs?.title).filter(Boolean))];

  const filteredApplicants = pendingDecisionApplicants.filter(app => {
    const candidateName = (app.name || app.profiles?.full_name || app.displayName || "").toLowerCase();
    const candidateEmail = (app.email || app.profiles?.email || app.displayEmail || "").toLowerCase();
    const jobTitle = (app.job_title || app.jobs?.title || "").toLowerCase();
    const query = searchQuery.toLowerCase().trim();

    const matchesSearch = !query || candidateName.includes(query) || candidateEmail.includes(query) || jobTitle.includes(query);
    const matchesJob = selectedJob === "All" || (app.job_title || app.jobs?.title) === selectedJob;

    return matchesSearch && matchesJob;
  });

  async function handleHireCandidate(app) {
    confirm({
      title: "🎉 Confirm Hiring Decision",
      message: `Are you sure you want to HIRE ${app.name || app.profiles?.full_name || "this candidate"} for "${app.job_title || app.jobs?.title || "Position"}"? This will officially accept their application, resolve their interview, and notify the candidate.`,
      confirmText: "🎉 Confirm & Hire Candidate",
      isDestructive: false,
      onConfirm: () => executeHiringAction(app, "HIRED")
    });
  }

  async function handleRejectCandidate(app) {
    confirm({
      title: "❌ Confirm Rejection Decision",
      message: `Are you sure you want to REJECT ${app.name || app.profiles?.full_name || "this candidate"} for "${app.job_title || app.jobs?.title || "Position"}"? This will update their application status to Rejected and notify the candidate.`,
      confirmText: "Reject Candidate",
      isDestructive: true,
      onConfirm: () => executeHiringAction(app, "REJECTED")
    });
  }

  async function executeHiringAction(app, decision) {
    if (!currentUserId || !app.id) return;
    setActionLoadingId(app.id);

    const { error } = await makeHiringDecision({
      applicationId: app.id,
      employerId: currentUserId,
      candidateId: app.applicant_id,
      decision: decision,
      rejectionReason: decision === "REJECTED" ? "Decided after interview evaluation." : ""
    });

    setActionLoadingId(null);

    if (error) {
      toast.error("Failed recording hiring decision: " + error.message);
    } else {
      toast.success(decision === "HIRED" ? "🎉 Candidate officially hired!" : "Application updated to Rejected.");
      await loadDecisionData();
      navigate("/employer/hiring-records");
    }
  }

  return (
    <DashboardLayout
      role="employer"
      title="⚖️ Post-Interview Hiring Decisions"
      subtitle="The official workspace for making final Hire or Reject decisions for candidates with completed interviews."
    >
      <div className="hiring-decisions-toolbar">
        <div className="decisions-job-selector-row">
          <span style={{ fontSize: "14px", fontWeight: "700", color: "#334155" }}>Filter by Job Listing:</span>
          {jobsList.map(job => (
            <button
              key={job}
              type="button"
              className={`job-pill-btn ${selectedJob === job ? "active" : ""}`}
              onClick={() => setSelectedJob(job)}
            >
              {job === "All" ? `All Positions (${pendingDecisionApplicants.length})` : `${job} (${pendingDecisionApplicants.filter(a => (a.job_title || a.jobs?.title) === job).length})`}
            </button>
          ))}
        </div>

        <input
          type="text"
          className="decisions-search-input"
          placeholder="🔍 Search candidate name, position, or email..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="empty-state">
          <h3>Loading candidates awaiting decision...</h3>
        </div>
      ) : filteredApplicants.length === 0 ? (
        <div className="empty-state">
          <span>⚖️</span>
          <h3>No candidates currently awaiting hiring decision</h3>
          <p>
            Candidates appear here once their interview session has been marked as <strong>Completed</strong> in the Interview Center.
          </p>
        </div>
      ) : (
        <div className="decisions-cards-grid">
          {filteredApplicants.map(app => {
            const inv = interviewsMap[app.id];
            const candidateName = app.name || app.profiles?.full_name || "Candidate";
            const jobTitle = app.job_title || app.jobs?.title || "Position";
            const isFocused = searchParams.get("application") === app.id;

            return (
              <div key={app.id} id={`app-card-${app.id}`} className={`hd-card ${isFocused ? "highlighted-card" : ""}`} style={isFocused ? { border: "2px solid #8b18ff", boxShadow: "0 0 12px rgba(139, 24, 255, 0.3)" } : {}}>
                <div>
                  <div className="hd-card-header">
                    <div>
                      <h4 className="hd-candidate-name">{candidateName}</h4>
                      <p className="hd-job-title">💼 {jobTitle}</p>
                    </div>
                    <span className="hd-status-badge">⏳ Awaiting Decision</span>
                  </div>

                  <div className="hd-detail-list">
                    <div className="hd-detail-row">
                      <span>Applied Date:</span>
                      <strong>{app.created_at ? new Date(app.created_at).toLocaleDateString() : "N/A"}</strong>
                    </div>

                    {inv && (
                      <div className="hd-detail-row">
                        <span>Interview Date:</span>
                        <strong>{inv.scheduled_date} ({inv.interview_type || "Walk-in"})</strong>
                      </div>
                    )}

                    <div className="hd-detail-row">
                      <span>ATS Criteria Match:</span>
                      <strong>{app.match_score ? `${app.match_score}%` : "Evaluated"}</strong>
                    </div>
                  </div>

                  {app.recruiter_notes && (
                    <div className="hd-recruiter-notes">
                      <strong>Recruiter Evaluation Notes:</strong> {app.recruiter_notes}
                    </div>
                  )}
                </div>

                <div className="hd-card-actions">
                  <div className="hd-action-row-secondary">
                    <button
                      type="button"
                      className="hd-sub-btn"
                      onClick={() => {
                        setSelectedApplicant(app);
                        setShowMatchModal(true);
                      }}
                    >
                      🤖 AI Report
                    </button>

                    {(app.resume_url || app.resume?.file_url) && (
                      <button
                        type="button"
                        className="hd-sub-btn"
                        onClick={() => setViewingResume(app.resume_url || app.resume?.file_url)}
                      >
                        📄 Resume
                      </button>
                    )}
                  </div>

                  <div className="hd-final-decision-row">
                    <button
                      type="button"
                      className="btn-hire-final"
                      disabled={actionLoadingId === app.id}
                      onClick={() => handleHireCandidate(app)}
                    >
                      {actionLoadingId === app.id ? "Processing..." : "🎉 Hire Candidate"}
                    </button>

                    <button
                      type="button"
                      className="btn-reject-final"
                      disabled={actionLoadingId === app.id}
                      onClick={() => handleRejectCandidate(app)}
                    >
                      {actionLoadingId === app.id ? "Processing..." : "❌ Reject"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
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
