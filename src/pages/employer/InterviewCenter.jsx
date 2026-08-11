import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { supabase } from "../../services/supabase";
import {
  fetchInterviewsForEmployer,
  completeInterview,
  cancelInterview,
  makeHiringDecision
} from "../../services/interviewService";
import { isActiveInterviewStatus } from "../../services/recruitmentStatus";
import "./InterviewCenter.css";

export default function InterviewCenter() {
  const navigate = useNavigate();

  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);

  // Hiring Decision Modal State
  const [decisionModalInfo, setDecisionModalInfo] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [submittingDecision, setSubmittingDecision] = useState(false);

  useEffect(() => {
    loadInterviews();
  }, []);

  async function loadInterviews() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    setCurrentUserId(userId);

    if (userId) {
      const { data } = await fetchInterviewsForEmployer(userId);
      setInterviews(data || []);
    }
    setLoading(false);
  }

  const now = new Date();

  // Helper to determine if interview is past confirmed awaiting completion
  function isPastAwaitingCompletion(inv) {
    if (inv.status !== "CONFIRMED" || !inv.scheduled_date) return false;
    const invTime = new Date(`${inv.scheduled_date}T${inv.scheduled_time || "23:59:59"}`);
    return invTime < now;
  }

  async function handleMarkCompleted(interviewId) {
    if (!currentUserId) return;
    setActionLoadingId(interviewId);
    await completeInterview({ interviewId, employerId: currentUserId });
    await loadInterviews();
    setActionLoadingId(null);
  }

  async function handleCancelInterview(interviewId) {
    if (!currentUserId) return;
    if (!window.confirm("Are you sure you want to cancel this interview session?")) return;
    setActionLoadingId(interviewId);
    await cancelInterview({ interviewId, userId: currentUserId, reason: "Cancelled by employer" });
    await loadInterviews();
    setActionLoadingId(null);
  }

  async function handleExecuteDecision(decision) {
    if (!decisionModalInfo) return;
    setSubmittingDecision(true);

    const { error } = await makeHiringDecision({
      applicationId: decisionModalInfo.application_id,
      employerId: currentUserId,
      candidateId: decisionModalInfo.candidate_id,
      decision: decision,
      rejectionReason: decision === "REJECTED" ? rejectionReason : ""
    });

    setSubmittingDecision(false);

    if (error) {
      alert(`Error recording decision: ${error.message}`);
    } else {
      setDecisionModalInfo(null);
      setRejectionReason("");
      navigate("/employer/hiring-pipeline");
    }
  }

  // Filter Logic
  const filteredInterviews = interviews.filter((inv) => {
    const candidateName = (inv.candidate_name || "").toLowerCase();
    const jobTitle = (inv.job_title || "").toLowerCase();
    const query = searchQuery.toLowerCase().trim();

    const matchesSearch = !query || candidateName.includes(query) || jobTitle.includes(query);

    let matchesTab = true;
    const statusUpper = (inv.status || "").toUpperCase();

    if (filterTab === "Pending") {
      matchesTab = statusUpper === "PENDING_CONFIRMATION" || statusUpper === "RESCHEDULE_REQUESTED";
    } else if (filterTab === "Confirmed") {
      matchesTab = statusUpper === "CONFIRMED" && !isPastAwaitingCompletion(inv);
    } else if (filterTab === "Past Awaiting") {
      matchesTab = isPastAwaitingCompletion(inv);
    } else if (filterTab === "Completed") {
      matchesTab = statusUpper === "COMPLETED";
    } else if (filterTab === "Cancelled") {
      matchesTab = statusUpper === "CANCELLED" || statusUpper === "DECLINED";
    }

    return matchesSearch && matchesTab;
  });

  return (
    <DashboardLayout
      role="employer"
      title="📅 Interview Center"
      subtitle="Manage interview invitations, schedules, confirmations, and completed candidate interviews."
    >
        {/* TOP TABS & SEARCH */}
        <div className="interview-center-toolbar">
          <div className="interview-quick-tabs">
            <button
              type="button"
              className={`ic-tab-btn ${filterTab === "All" ? "active" : ""}`}
              onClick={() => setFilterTab("All")}
            >
              🌐 All ({interviews.length})
            </button>
            <button
              type="button"
              className={`ic-tab-btn ${filterTab === "Pending" ? "active" : ""}`}
              onClick={() => setFilterTab("Pending")}
            >
              🟡 Pending ({interviews.filter(i => ["PENDING_CONFIRMATION", "RESCHEDULE_REQUESTED"].includes((i.status || "").toUpperCase())).length})
            </button>
            <button
              type="button"
              className={`ic-tab-btn ${filterTab === "Confirmed" ? "active" : ""}`}
              onClick={() => setFilterTab("Confirmed")}
            >
              🟢 Confirmed ({interviews.filter(i => i.status === "CONFIRMED" && !isPastAwaitingCompletion(i)).length})
            </button>
            <button
              type="button"
              className={`ic-tab-btn past ${filterTab === "Past Awaiting" ? "active" : ""}`}
              onClick={() => setFilterTab("Past Awaiting")}
            >
              ⏰ Past — Awaiting Completion ({interviews.filter(isPastAwaitingCompletion).length})
            </button>
            <button
              type="button"
              className={`ic-tab-btn ${filterTab === "Completed" ? "active" : ""}`}
              onClick={() => setFilterTab("Completed")}
            >
              ✓ Completed ({interviews.filter(i => (i.status || "").toUpperCase() === "COMPLETED").length})
            </button>
            <button
              type="button"
              className={`ic-tab-btn ${filterTab === "Cancelled" ? "active" : ""}`}
              onClick={() => setFilterTab("Cancelled")}
            >
              ⚫ Cancelled ({interviews.filter(i => ["CANCELLED", "DECLINED"].includes((i.status || "").toUpperCase())).length})
            </button>
          </div>

          <div className="interview-search-bar">
            <input
              type="text"
              className="ic-search-input"
              placeholder="🔍 Search candidate name or job title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* INTERVIEW CARDS GRID */}
        {loading ? (
          <div className="empty-state">
            <h3>Loading interview sessions...</h3>
          </div>
        ) : filteredInterviews.length === 0 ? (
          <div className="empty-state">
            <span>📅</span>
            <h3>No interviews match the selected view</h3>
            <p>Select a candidate from the Applicants Desk to invite them for an interview.</p>
          </div>
        ) : (
          <div className="interview-cards-grid">
            {filteredInterviews.map((inv) => {
              const isPast = isPastAwaitingCompletion(inv);
              const statusUpper = (inv.status || "").toUpperCase();

              return (
                <div key={inv.id} className={`ic-card ${isPast ? "past-awaiting" : statusUpper.toLowerCase()}`}>
                  <div className="ic-card-header">
                    <div className="ic-candidate-info">
                      <h4>{inv.candidate_name || "Candidate"}</h4>
                      <p className="ic-role">{inv.job_title || "Position"}</p>
                    </div>

                    <span className={`ic-status-badge ${isPast ? "past" : statusUpper.toLowerCase()}`}>
                      {isPast ? "⏰ Past — Awaiting Completion" : statusUpper}
                    </span>
                  </div>

                  <div className="ic-card-body">
                    <div className="ic-detail-row">
                      <span>📅 Date:</span>
                      <strong>{inv.scheduled_date || "TBD"}</strong>
                    </div>

                    <div className="ic-detail-row">
                      <span>⏰ Time:</span>
                      <strong>{inv.scheduled_time || "TBD"}</strong>
                    </div>

                    <div className="ic-detail-row">
                      <span>📍 Type:</span>
                      <strong>{inv.interview_type || "Online"}</strong>
                    </div>

                    {inv.meeting_url && (
                      <div className="ic-detail-row">
                        <span>🌐 Link:</span>
                        <a href={inv.meeting_url} target="_blank" rel="noreferrer" className="ic-link">
                          Join Meeting ↗
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="ic-card-actions">
                    {statusUpper === "CONFIRMED" && (
                      <button
                        type="button"
                        className="ic-action-btn complete"
                        disabled={actionLoadingId === inv.id}
                        onClick={() => handleMarkCompleted(inv.id)}
                      >
                        ✓ Mark Completed
                      </button>
                    )}

                    {statusUpper === "COMPLETED" && (
                      <button
                        type="button"
                        className="ic-action-btn decision"
                        onClick={() => setDecisionModalInfo(inv)}
                      >
                        🎯 Hiring Decision ➔
                      </button>
                    )}

                    {isActiveInterviewStatus(inv.status) && (
                      <button
                        type="button"
                        className="ic-action-btn cancel"
                        disabled={actionLoadingId === inv.id}
                        onClick={() => handleCancelInterview(inv.id)}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* DECISION MODAL FROM INTERVIEW CENTER */}
        {decisionModalInfo && (
          <div className="modal-overlay">
            <div className="modal-card decision-modal">
              <h3>🎯 Record Hiring Decision</h3>
              <p>
                Candidate: <strong>{decisionModalInfo.candidate_name}</strong> for position{" "}
                <strong>{decisionModalInfo.job_title}</strong>.
              </p>

              <div className="form-group" style={{ marginTop: "14px" }}>
                <label>Rejection Reason (Optional, sent if rejected):</label>
                <textarea
                  className="form-control"
                  rows={3}
                  placeholder="Provide constructive feedback if rejecting candidate..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                />
              </div>

              <div className="modal-actions" style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                <button
                  type="button"
                  className="btn-primary hire"
                  style={{ background: "#16a34a", color: "#fff", border: "none", padding: "10px 18px", borderRadius: "8px", fontWeight: "bold" }}
                  disabled={submittingDecision}
                  onClick={() => handleExecuteDecision("HIRED")}
                >
                  🎉 Hire Candidate
                </button>

                <button
                  type="button"
                  className="btn-primary reject"
                  style={{ background: "#dc2626", color: "#fff", border: "none", padding: "10px 18px", borderRadius: "8px", fontWeight: "bold" }}
                  disabled={submittingDecision}
                  onClick={() => handleExecuteDecision("REJECTED")}
                >
                  ❌ Reject Candidate
                </button>

                <button
                  type="button"
                  className="btn-secondary"
                  style={{ background: "#e2e8f0", color: "#334155", border: "none", padding: "10px 18px", borderRadius: "8px" }}
                  onClick={() => setDecisionModalInfo(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
    </DashboardLayout>
  );
}
