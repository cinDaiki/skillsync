import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { supabase } from "../../services/supabase";
import { fetchEmployerApplicants } from "../../services/applicationService";
import { fetchInterviewsForEmployer, makeHiringDecision } from "../../services/interviewService";
import { isDecisionPending, deduplicateByApplicationId } from "../../services/recruitmentStatus";
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
  const [evaluationsMap, setEvaluationsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedJob, setSelectedJob] = useState("All");
  const [currentUserId, setCurrentUserId] = useState(null);

  // Modals & Active Selections
  const [selectedResumeApp, setSelectedResumeApp] = useState(null);
  const [evaluationModalApp, setEvaluationModalApp] = useState(null);
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
      const { data: evalsData } = await supabase
        .from("interview_evaluations")
        .select("*")
        .eq("employer_id", userId);

      const invMap = {};
      if (invsData) {
        invsData.forEach((inv) => {
          if (inv.application_id && !invMap[inv.application_id]) {
            invMap[inv.application_id] = inv;
          }
        });
      }

      const evalMap = {};
      if (evalsData) {
        evalsData.forEach((ev) => {
          if (ev.application_id) evalMap[ev.application_id] = ev;
          if (ev.interview_id && !evalMap[ev.interview_id]) evalMap[ev.interview_id] = ev;
        });
      }

      setInterviewsMap(invMap);
      setEvaluationsMap(evalMap);
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
      // Optimistically remove from decision pending view
      setApplicants(prev => prev.filter(item => item.id !== app.id));
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
          <label>Filter Position:</label>
          <div className="job-pill-group">
            {jobsList.map(job => (
              <button
                key={job}
                type="button"
                className={`job-pill ${selectedJob === job ? "active" : ""}`}
                onClick={() => setSelectedJob(job)}
              >
                {job === "All" ? `All Positions (${pendingDecisionApplicants.length})` : job}
              </button>
            ))}
          </div>
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
            const ev = evaluationsMap[app.id] || evaluationsMap[inv?.id] || null;
            const candidateName = app.name || app.profiles?.full_name || app.displayName || "Candidate";
            const candidateEmail = app.email || app.profiles?.email || app.displayEmail || "";
            const jobTitle = app.job_title || app.jobs?.title || "Position";
            const isFocused = searchParams.get("application") === app.id;

            const recNotes = ev?.evaluation_notes || app.recruiter_notes;
            const techRating = ev?.technical_rating;
            const commRating = ev?.communication_rating;
            const recommendation = ev?.overall_recommendation;

            return (
              <div key={app.id} id={`app-card-${app.id}`} className={`hd-card ${isFocused ? "highlighted-card" : ""}`} style={isFocused ? { border: "2px solid #8b18ff", boxShadow: "0 0 12px rgba(139, 24, 255, 0.3)" } : {}}>
                <div>
                  <div className="hd-card-header">
                    <div>
                      <h4 className="hd-candidate-name">{candidateName}</h4>
                      {candidateEmail && <p className="hd-candidate-email">✉️ {candidateEmail}</p>}
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
                        <span>Interview Details:</span>
                        <strong>{inv.scheduled_date || "Completed"} ({inv.interview_type || "Walk-in"})</strong>
                      </div>
                    )}

                    <div className="hd-detail-row">
                      <span>ATS Match Score:</span>
                      <strong>{app.match_score ? `${app.match_score}%` : "Evaluated"}</strong>
                    </div>
                  </div>

                  {/* PROMINENT INTERVIEWER EVALUATION SECTION */}
                  <div className="hd-interviewer-evaluation-box" style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px", margin: "14px 0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <h5 style={{ margin: 0, fontSize: "13px", fontWeight: "800", color: "#334155", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        📝 Interviewer Evaluation
                      </h5>
                      {recommendation && (
                        <span style={{ fontSize: "11px", fontWeight: "700", background: recommendation.includes("RECOMMEND") ? "#dcfce7" : "#fee2e2", color: recommendation.includes("RECOMMEND") ? "#166534" : "#991b1b", padding: "2px 8px", borderRadius: "12px" }}>
                          {recommendation.replace("_", " ")}
                        </span>
                      )}
                    </div>

                    {recNotes ? (
                      <p style={{ margin: "4px 0 8px", fontSize: "13px", color: "#475569", fontStyle: "italic", lineHeight: "1.4" }}>
                        "{recNotes}"
                      </p>
                    ) : (
                      <p style={{ margin: "4px 0 8px", fontSize: "13px", color: "#94a3b8" }}>
                        No written recruiter evaluation notes provided.
                      </p>
                    )}

                    {(techRating || commRating) && (
                      <div style={{ display: "flex", gap: "12px", fontSize: "12px", color: "#64748b", marginTop: "6px" }}>
                        {techRating && <span>Technical: <strong>{"★".repeat(techRating)}{"☆".repeat(5-techRating)}</strong></span>}
                        {commRating && <span>Communication: <strong>{"★".repeat(commRating)}{"☆".repeat(5-commRating)}</strong></span>}
                      </div>
                    )}

                    {ev && (
                      <button
                        type="button"
                        style={{ marginTop: "8px", background: "none", border: "none", color: "#8b18ff", fontSize: "12px", fontWeight: "700", cursor: "pointer", padding: 0 }}
                        onClick={() => setEvaluationModalApp({ app, inv, ev })}
                      >
                        View Full Evaluation →
                      </button>
                    )}
                  </div>
                </div>

                <div className="hd-card-actions">
                  <div className="hd-action-row-secondary">
                    <button
                      type="button"
                      className="hd-sub-btn"
                      onClick={() => setSelectedResumeApp(app)}
                    >
                      📄 View Resume
                    </button>
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

      {/* FULL EVALUATION MODAL */}
      {evaluationModalApp && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>📝 Full Interview Evaluation</h3>
              <button type="button" className="modal-close-btn" onClick={() => setEvaluationModalApp(null)}>×</button>
            </div>
            <div className="modal-body-form" style={{ gap: "12px" }}>
              <p style={{ margin: 0, fontSize: "14px", fontWeight: "700" }}>
                Candidate: {evaluationModalApp.app.name || evaluationModalApp.app.profiles?.full_name || "Applicant"}
              </p>
              <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
                Position: {evaluationModalApp.app.job_title || evaluationModalApp.app.jobs?.title}
              </p>
              <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <strong>Recommendation:</strong> {evaluationModalApp.ev.overall_recommendation || "Evaluated"}
              </div>

              {evaluationModalApp.ev.evaluation_notes && (
                <div>
                  <strong style={{ fontSize: "13px" }}>Recruiter Evaluation Notes:</strong>
                  <p style={{ marginTop: "4px", fontSize: "13px", color: "#334155", background: "#fff", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e1" }}>
                    {evaluationModalApp.ev.evaluation_notes}
                  </p>
                </div>
              )}

              <div className="modal-footer-actions">
                <button type="button" className="btn-secondary" onClick={() => setEvaluationModalApp(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RESUME VIEWER MODAL */}
      {selectedResumeApp && (
        <ResumeViewerModal
          applicant={selectedResumeApp}
          onClose={() => setSelectedResumeApp(null)}
        />
      )}
    </DashboardLayout>
  );
}
