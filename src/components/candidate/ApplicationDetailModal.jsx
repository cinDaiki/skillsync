import { useEffect, useRef } from "react";
import { getCandidateStageInfo } from "../../services/recruitmentStatus";
import "./ApplicationDetailModal.css";

function formatDate(dateString) {
  if (!dateString) return "No date";
  try {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "No date";
  }
}

export default function ApplicationDetailModal({
  application,
  interview,
  onClose,
  onAcceptInterview,
  onOpenResponseModal,
  onWithdraw,
}) {
  const dialogRef = useRef(null);
  const previouslyFocusedElementRef = useRef(null);

  // Focus Trapping, Escape key, and Focus Restoration
  useEffect(() => {
    previouslyFocusedElementRef.current = document.activeElement;

    // Auto-focus dialog on mount
    const timer = setTimeout(() => {
      if (dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) {
          focusable[0].focus();
        } else {
          dialogRef.current.focus();
        }
      }
    }, 50);

    function handleKeyDown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      // Trap Tab navigation inside modal
      if (e.key === "Tab" && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const focusable = Array.from(focusableElements).filter(
          (el) => !el.hasAttribute("disabled") && el.offsetParent !== null
        );

        if (focusable.length === 0) return;

        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];

        if (e.shiftKey) {
          // Shift + Tab: if on first element, cycle to last
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab: if on last element, cycle to first
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
      // Restore focus to previous element
      if (previouslyFocusedElementRef.current && typeof previouslyFocusedElementRef.current.focus === "function") {
        previouslyFocusedElementRef.current.focus();
      }
    };
  }, [onClose]);

  if (!application) return null;

  const job = application.jobs || {};
  const companyName = job.company_name || "Employer Company";
  const invStatus = interview ? interview.status : null;
  const stageInfo = getCandidateStageInfo(application.status, invStatus);
  const statusLower = String(application.status || "").toLowerCase();

  return (
    <div
      className="modal-backdrop app-detail-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-detail-title"
    >
      <div
        ref={dialogRef}
        tabIndex="-1"
        className="modal-dialog app-detail-modal-dialog"
      >
        {/* ── MODAL HEADER ── */}
        <div className="modal-header app-detail-modal-header">
          <div>
            <span className="app-detail-modal-kicker">Application Details</span>
            <h2 id="app-detail-title" className="app-detail-modal-title">
              {job.title || "Untitled Position"}
            </h2>
            <p className="app-detail-company">🏢 {companyName}</p>
          </div>
          <div className="app-detail-header-actions">
            <span className={`application-status-badge ${stageInfo.statusBadgeClass}`}>
              {stageInfo.statusBadgeText}
            </span>
            <button
              type="button"
              className="modal-close-btn"
              onClick={onClose}
              aria-label="Close modal"
            >
              ×
            </button>
          </div>
        </div>

        {/* ── MODAL BODY ── */}
        <div className="app-detail-modal-body">
          {/* 1. Overview Grid */}
          <div className="app-detail-overview-grid">
            <div className="app-detail-overview-item">
              <span>Application Reference</span>
              <strong>#{application.id.substring(0, 8).toUpperCase()}</strong>
            </div>
            <div className="app-detail-overview-item">
              <span>Applied Date</span>
              <strong>{formatDate(application.created_at)}</strong>
            </div>
            <div className="app-detail-overview-item">
              <span>Job Placement</span>
              <strong>{job.location || "Remote / Office"}</strong>
            </div>
            <div className="app-detail-overview-item">
              <span>Employment Class</span>
              <strong>{job.employment_type || "Full-Time"}</strong>
            </div>
          </div>

          {/* 2. Recruitment Progress Tracker */}
          <div className="app-detail-timeline-section">
            <h4 className="app-detail-section-title">📍 Recruitment Progress</h4>
            <div className="application-timeline-track">
              <div
                className="application-timeline-progress"
                style={{ width: stageInfo.percent }}
              />
              {stageInfo.steps.map((step, idx) => {
                const stepNum = idx + 1;
                const isCompleted = step.state === "completed";
                const isActive = step.state === "active";
                const isFailed = step.state === "failed";

                return (
                  <div
                    key={step.id}
                    className={`timeline-step ${isCompleted ? "completed" : ""} ${isActive ? "active" : ""} ${isFailed ? "failed" : ""}`}
                  >
                    <div className="timeline-step-circle">
                      {isCompleted ? "✓" : isFailed ? "✕" : isActive ? "●" : stepNum}
                    </div>
                    <span className="timeline-step-label">{step.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Stage Status Narrative / Banner */}
          {stageInfo.isHired && (
            <div className="cand-decision-banner hired">
              <h4>🎉 Congratulations! You Have Been Selected</h4>
              <p>
                You have been officially selected and hired for <strong>{job.title}</strong> at <strong>{companyName}</strong>!
              </p>
              <p className="next-steps">
                <strong>Next Steps:</strong> Check your registered email for onboarding information and official employment documents.
              </p>
            </div>
          )}

          {stageInfo.isRejected && (
            <div className="cand-decision-banner rejected">
              <h4>❌ Application Closed — Not Selected</h4>
              <p>
                Thank you for your interest and time in applying for <strong>{job.title}</strong> at <strong>{companyName}</strong>.
                The employer has completed this hiring cycle and decided to proceed with another applicant.
              </p>
            </div>
          )}

          {!stageInfo.isTerminal && (
            <div className="app-detail-status-note">
              <p>{stageInfo.statusMessage}</p>
            </div>
          )}

          {/* 4. Interview Section (rendered only when interview exists) */}
          {interview && (
            <div className={`app-detail-interview-card ${String(invStatus).toLowerCase()}`}>
              <div className="cand-interview-header">
                <h4>🗓️ Interview Details</h4>
                {invStatus === "PENDING_CONFIRMATION" && (
                  <span className="cand-inv-badge pending">🟡 Awaiting Confirmation</span>
                )}
                {invStatus === "CONFIRMED" && (
                  <span className="cand-inv-badge confirmed">🟢 Interview Confirmed</span>
                )}
                {invStatus === "RESCHEDULE_REQUESTED" && (
                  <span className="cand-inv-badge reschedule">🔄 Reschedule Requested</span>
                )}
                {invStatus === "DECLINED" && (
                  <span className="cand-inv-badge declined">🔴 Candidate Declined</span>
                )}
                {invStatus === "CANCELLED" && (
                  <span className="cand-inv-badge cancelled">⚫ Interview Cancelled</span>
                )}
                {invStatus === "COMPLETED" && (
                  <span className="cand-inv-badge completed">🔵 Interview Completed</span>
                )}
              </div>

              <div className="cand-interview-body">
                <div className="cand-inv-info-row">
                  <div>
                    <span>Scheduled Date & Time:</span>
                    <strong>📅 {interview.scheduled_date} at {interview.scheduled_time}</strong>
                  </div>
                  <div>
                    <span>Interview Mode:</span>
                    <strong>
                      {interview.interview_type === "ONLINE"
                        ? `💻 Online — ${interview.platform || "Google Meet"}`
                        : `🏢 Walk-in Interview`}
                    </strong>
                  </div>
                </div>

                {interview.interview_type === "ONLINE" && interview.meeting_url && (
                  <div className="cand-inv-link-box">
                    <span>Meeting Link:</span>
                    <a href={interview.meeting_url} target="_blank" rel="noreferrer">
                      {interview.meeting_url}
                    </a>
                  </div>
                )}

                {interview.interview_type === "WALK_IN" && (
                  <div className="cand-inv-walkin-box">
                    <p><strong>📍 Location:</strong> {interview.address || "Company Office"}</p>
                    {interview.contact_person && (
                      <p><strong>👤 Contact Person:</strong> {interview.contact_person}</p>
                    )}
                  </div>
                )}

                {interview.instructions && (
                  <p className="cand-inv-instructions">
                    📝 <strong>Instructions:</strong> {interview.instructions}
                  </p>
                )}

                {/* Candidate Action Buttons for Pending Confirmation */}
                {invStatus === "PENDING_CONFIRMATION" && (
                  <div className="cand-inv-action-toolbar">
                    <p className="toolbar-notice">
                      ⚠️ An employer has proposed an interview schedule. Please confirm whether you can attend.
                    </p>
                    <div className="toolbar-btns">
                      <button
                        type="button"
                        className="cand-btn accept"
                        onClick={() => onAcceptInterview(interview)}
                      >
                        ✓ Confirm Attendance
                      </button>
                      <button
                        type="button"
                        className="cand-btn reschedule"
                        onClick={() => onOpenResponseModal(interview, "RESCHEDULE")}
                      >
                        🔄 Request New Time
                      </button>
                      <button
                        type="button"
                        className="cand-btn decline"
                        onClick={() => onOpenResponseModal(interview, "DECLINE")}
                      >
                        ✕ Decline
                      </button>
                    </div>
                  </div>
                )}

                {/* Confirmed State */}
                {invStatus === "CONFIRMED" && (
                  <div className="cand-confirmed-box">
                    <p>
                      ✅ You have confirmed your attendance for this interview on {interview.scheduled_date} at {interview.scheduled_time}.
                    </p>
                    {interview.interview_type === "ONLINE" && interview.meeting_url && (
                      <a
                        href={interview.meeting_url}
                        target="_blank"
                        rel="noreferrer"
                        className="cand-join-btn"
                      >
                        🌐 Join Meeting Now
                      </a>
                    )}
                  </div>
                )}

                {/* Reschedule Requested State */}
                {invStatus === "RESCHEDULE_REQUESTED" && (
                  <div className="cand-reschedule-status-box">
                    <p>
                      🔄 Your reschedule request has been sent to the employer. Awaiting a revised proposal.
                    </p>
                    {interview.preferred_date && (
                      <p><strong>Preferred Date:</strong> {interview.preferred_date}</p>
                    )}
                    {interview.preferred_time_range && (
                      <p><strong>Preferred Time:</strong> {interview.preferred_time_range}</p>
                    )}
                  </div>
                )}

                {/* Declined State */}
                {invStatus === "DECLINED" && (
                  <div className="cand-declined-status-box">
                    <p>🔴 You declined this interview invitation.</p>
                  </div>
                )}

                {/* Cancelled State */}
                {invStatus === "CANCELLED" && (
                  <div className="cand-cancelled-status-box">
                    <p>⚫ This interview was cancelled by the employer.</p>
                  </div>
                )}

                {/* Completed State */}
                {invStatus === "COMPLETED" && (
                  <div className="cand-completed-status-box">
                    <p>🔵 Interview session completed. The employer is reviewing final decisions.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── MODAL FOOTER ── */}
        <div className="modal-footer app-detail-modal-footer">
          {stageInfo.canWithdraw && onWithdraw && (
            <button
              type="button"
              className="app-detail-withdraw-btn"
              onClick={() => onWithdraw(application.id)}
            >
              Withdraw Application
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
