import { useEffect, useState } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import CandidateInterviewModal from "../../components/candidate/CandidateInterviewModal";
import { supabase } from "../../services/supabase";
import { fetchInterviewsForCandidate, respondToInterview } from "../../services/interviewService";
import { checkAndSendInterviewReminders } from "../../services/notificationService";
import { useModal } from "../../contexts/ModalContext";
import { useToast } from "../../contexts/ToastContext";
import "./Applications.css";

export default function Applications() {
  const [applications, setApplications] = useState([]);
  const [interviewsMap, setInterviewsMap] = useState({});
  const [filter, setFilter] = useState("All");
  const [expandedAppIds, setExpandedAppIds] = useState([]);
  const [withdrawing, setWithdrawing] = useState(false);

  // Candidate Response Modal state
  const [activeModalInterview, setActiveModalInterview] = useState(null);
  const [modalMode, setModalMode] = useState("DECLINE"); // 'DECLINE' or 'RESCHEDULE'
  
  const { confirm } = useModal();
  const toast = useToast();

  useEffect(() => {
    loadApplications();
  }, []);

  async function loadApplications() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Check & trigger interview reminders in background
    checkAndSendInterviewReminders(user.id).catch(console.warn);

    // 1. Fetch applications
    const { data: appsData, error: appsError } = await supabase
      .from("applications")
      .select("*")
      .eq("applicant_id", user.id)
      .order("created_at", { ascending: false });

    if (appsError) {
      console.warn("Failed to load applications:", appsError.message);
      return;
    }

    const apps = appsData || [];
    const jobIds = [...new Set(apps.map((a) => a.job_id).filter(Boolean))];

    let jobMap = {};
    if (jobIds.length > 0) {
      const { data: jobsData } = await supabase
        .from("jobs")
        .select("id, title, employment_type, location, required_skills, employer_id")
        .in("id", jobIds);
      
      const employerIds = [...new Set((jobsData || []).map(j => j.employer_id).filter(Boolean))];
      let empMap = {};
      if (employerIds.length > 0) {
        const { data: empProfiles } = await supabase
          .from("employer_profiles")
          .select("id, company_name, company_logo_url")
          .in("id", employerIds);
        (empProfiles || []).forEach(ep => {
          empMap[ep.id] = ep;
        });
      }

      (jobsData || []).forEach((j) => {
        jobMap[j.id] = {
          ...j,
          company_name: empMap[j.employer_id]?.company_name || "Employer Company",
          company_logo_url: empMap[j.employer_id]?.company_logo_url || null
        };
      });
    }

    const enriched = apps.map((app) => {
      let snapshot = {};
      if (app.applicant_snapshot) {
        if (typeof app.applicant_snapshot === "string") {
          try {
            snapshot = JSON.parse(app.applicant_snapshot);
          } catch {
            snapshot = {};
          }
        } else {
          snapshot = app.applicant_snapshot;
        }
      }

      return {
        ...app,
        jobs: jobMap[app.job_id] || null,
        parsedSnapshot: snapshot,
      };
    });

    setApplications(enriched);

    // 2. Fetch interviews for candidate
    await loadInterviews(user.id);
  }

  async function loadInterviews(userId) {
    const { data: interviewsData } = await fetchInterviewsForCandidate(userId);
    const map = {};
    (interviewsData || []).forEach(inv => {
      if (!map[inv.application_id]) {
        map[inv.application_id] = inv;
      }
    });
    setInterviewsMap(map);
  }

  // Handle Candidate Acceptance
  async function handleAcceptInterview(interview) {
    confirm({
      title: "Accept Interview Invitation",
      message: `Confirm attendance for "${interview.jobs?.title || "Job"}" on ${interview.scheduled_date} at ${interview.scheduled_time}?`,
      confirmText: "✓ Confirm Attendance",
      onConfirm: async () => {
        const { data: { user } } = await supabase.auth.getUser();
        const res = await respondToInterview({
          interviewId: interview.id,
          userId: user.id,
          response: "ACCEPTED"
        });

        if (res.error) {
          toast.error("Failed accepting interview: " + res.error.message);
        } else {
          toast.success("🟢 Interview Confirmed! Your confirmation has been sent to the employer.");
          await loadApplications();
        }
      }
    });
  }

  function openResponseModal(interview, mode) {
    setActiveModalInterview(interview);
    setModalMode(mode);
  }

  function closeResponseModal() {
    setActiveModalInterview(null);
  }

  async function handleModalSubmit({ response, message, preferredDate, preferredTimeRange }) {
    if (!activeModalInterview) return;
    const { data: { user } } = await supabase.auth.getUser();

    const res = await respondToInterview({
      interviewId: activeModalInterview.id,
      userId: user.id,
      response,
      message,
      preferredDate,
      preferredTimeRange,
    });

    if (res.error) {
      toast.error("Failed submitting response: " + res.error.message);
    } else {
      if (response === "DECLINED") {
        toast.success("Interview invitation declined.");
      } else if (response === "RESCHEDULE_REQUESTED") {
        toast.success("🔄 Reschedule request sent to the employer.");
      }
      closeResponseModal();
      await loadApplications();
    }
  }

  async function handleWithdraw(applicationId) {
    setWithdrawing(true);
    try {
      const { error } = await supabase
        .from("applications")
        .delete()
        .eq("id", applicationId);

      if (error) {
        toast.error("Failed to withdraw application: " + error.message);
        return;
      }

      setApplications((prev) => prev.filter((app) => app.id !== applicationId));
      toast.success("Application withdrawn.");
    } finally {
      setWithdrawing(false);
    }
  }

  function toggleExpand(appId) {
    setExpandedAppIds((prev) =>
      prev.includes(appId) ? prev.filter((id) => id !== appId) : [...prev, appId]
    );
  }

  function formatDate(dateString) {
    if (!dateString) return "No date";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function getStatusClass(status) {
    const s = String(status || "").toLowerCase();
    if (s === "accepted" || s === "hired" || s === "offer") return "accepted";
    if (s === "rejected" || s === "closed") return "rejected";
    if (s.includes("interview") || s === "shortlisted") return "pending";
    return "submitted";
  }

  function getTimelineProgress(appStatus, invStatus) {
    const s = String(appStatus || "").toLowerCase();
    if (s === "applied" || s === "submitted") return { stage: 1, percent: "0%" };
    if (s === "screening" || s === "reviewed") return { stage: 2, percent: "25%" };
    if (s === "shortlisted") return { stage: 3, percent: "50%" };
    if (s.includes("interview") || invStatus) return { stage: 4, percent: "75%" };
    if (s === "accepted" || s === "hired" || s === "offer" || s === "rejected" || s === "closed") {
      return { stage: 5, percent: "100%" };
    }
    return { stage: 1, percent: "0%" };
  }

  const activeStatuses = [
    "applied",
    "submitted",
    "screening",
    "reviewed",
    "interview",
    "interview scheduled",
    "shortlisted",
  ];

  const activeCount = applications.filter((a) =>
    activeStatuses.includes(String(a.status || "").toLowerCase())
  ).length;

  const completedCount = applications.length - activeCount;

  const filteredApps = applications.filter((app) => {
    if (filter === "All") return true;
    const status = String(app.status || "").toLowerCase();
    const isActive = activeStatuses.includes(status);
    if (filter === "Active") return isActive;
    if (filter === "Completed") return !isActive;
    return true;
  });

  return (
    <DashboardLayout
      role="candidate"
      title="Application Tracker"
      subtitle="Track recruitment pipelines, confirm interview invitations, and monitor hiring decisions."
    >
      <section className="dashboard-panel applications-page">
        <div className="applications-page-header">
          <div className="panel-header">
            <div>
              <h2>My Applications</h2>
              <p>
                Monitor your active progress, confirm upcoming interviews, check verified attachments, or manage
                withdrawals.
              </p>
            </div>
          </div>

          <div className="applications-summary">
            <article className="applications-summary-card">
              <span>Total</span>
              <strong>{applications.length}</strong>
            </article>
            <article className="applications-summary-card active">
              <span>Active</span>
              <strong>{activeCount}</strong>
            </article>
            <article className="applications-summary-card completed">
              <span>Decided</span>
              <strong>{completedCount}</strong>
            </article>
          </div>
        </div>

        <div className="applications-filters">
          <button
            type="button"
            className={`applications-filter-btn ${filter === "All" ? "active" : ""}`}
            onClick={() => setFilter("All")}
          >
            All Submissions
            <em>{applications.length}</em>
          </button>
          <button
            type="button"
            className={`applications-filter-btn ${filter === "Active" ? "active" : ""}`}
            onClick={() => setFilter("Active")}
          >
            Active Pipelines
            <em>{activeCount}</em>
          </button>
          <button
            type="button"
            className={`applications-filter-btn ${filter === "Completed" ? "active" : ""}`}
            onClick={() => setFilter("Completed")}
          >
            Completed / Decided
            <em>{completedCount}</em>
          </button>
        </div>

        {filteredApps.length === 0 ? (
          <div className="empty-state applications-empty">
            <span>▣</span>
            <h3>No applications listed</h3>
            <p>You do not have any applications matching the selected filter category.</p>
          </div>
        ) : (
          <div className="applications-list">
            {filteredApps.map((app) => {
              const activeInv = interviewsMap[app.id] || (app.interview_schedule?.date ? {
                id: `legacy-${app.id}`,
                status: app.interview_schedule?.status || "CONFIRMED",
                interview_type: app.interview_schedule?.type || "ONLINE",
                scheduled_date: app.interview_schedule?.date,
                scheduled_time: app.interview_schedule?.time,
                platform: app.interview_schedule?.platform || "Google Meet",
                meeting_url: app.interview_schedule?.link,
                instructions: app.interview_schedule?.notes,
                is_legacy: true
              } : null);

              const invStatus = activeInv ? activeInv.status : null;
              const { stage, percent } = getTimelineProgress(app.status, invStatus);
              const isExpanded = expandedAppIds.includes(app.id);
              const snapshot = app.parsedSnapshot || {};
              const hasResume = !!snapshot.resume;
              const hasProfile = !!snapshot.full_name;
              const statusLower = String(app.status || "").toLowerCase();
              const canWithdraw = statusLower === "applied";

              const companyName = app.jobs?.company_name || "Employer";
              const isDecisionPending = invStatus === "COMPLETED" && (statusLower === "interview" || statusLower === "shortlisted" || statusLower === "under review" || statusLower === "pending");

              return (
                <article className="application-card application-card-enhanced" key={app.id}>
                  <div className="application-top">
                    <div>
                      <h3>{app.jobs?.title || "Untitled Job Opening"}</h3>
                      <p className="app-company-name">🏢 {companyName} • Applied on {formatDate(app.created_at)}</p>
                    </div>
                    <span className={`application-status-badge ${getStatusClass(app.status)}`}>
                      {app.status ? app.status.toUpperCase() : "SUBMITTED"}
                    </span>
                  </div>

                  <div className="application-details-grid">
                    <div>
                      <span>Job Placement</span>
                      <strong>{app.jobs?.location || "Remote / Office"}</strong>
                    </div>
                    <div>
                      <span>Employment Class</span>
                      <strong>{app.jobs?.employment_type || "Full-Time"}</strong>
                    </div>
                    <div>
                      <span>Application Reference</span>
                      <strong className="application-ref">
                        #{app.id.substring(0, 8).toUpperCase()}
                      </strong>
                    </div>
                  </div>

                  {/* ── RECRUITMENT TIMELINE TRACKER ────────────────────────── */}
                  <div className="application-timeline-track">
                    <div
                      className="application-timeline-progress"
                      style={{ width: percent }}
                    />
                    <div className={`timeline-step ${stage >= 1 ? "completed" : ""} ${stage === 1 ? "active" : ""}`}>
                      <div className="timeline-step-circle">{stage > 1 ? "✓" : "1"}</div>
                      <span className="timeline-step-label">Applied</span>
                    </div>
                    <div className={`timeline-step ${stage >= 2 ? "completed" : ""} ${stage === 2 ? "active" : ""}`}>
                      <div className="timeline-step-circle">{stage > 2 ? "✓" : "2"}</div>
                      <span className="timeline-step-label">Reviewed</span>
                    </div>
                    <div className={`timeline-step ${stage >= 3 ? "completed" : ""} ${stage === 3 ? "active" : ""}`}>
                      <div className="timeline-step-circle">{stage > 3 ? "✓" : "3"}</div>
                      <span className="timeline-step-label">Shortlisted</span>
                    </div>
                    <div className={`timeline-step ${stage >= 4 ? "completed" : ""} ${stage === 4 ? "active" : ""}`}>
                      <div className="timeline-step-circle">{stage > 4 ? "✓" : "4"}</div>
                      <span className="timeline-step-label">Interview</span>
                    </div>
                    <div className={`timeline-step ${stage >= 5 ? "completed" : ""} ${stage === 5 ? "active" : ""}`}>
                      <div className="timeline-step-circle">
                        {statusLower === "rejected" ? "✗" : "✓"}
                      </div>
                      <span className="timeline-step-label">
                        {statusLower === "rejected" ? "Closed" : "Decision"}
                      </span>
                    </div>
                  </div>

                  {/* ── CANDIDATE INTERVIEW STATUS CARDS ─────────────────────── */}
                  {activeInv && (
                    <div className={`cand-interview-card ${invStatus.toLowerCase()}`}>
                      <div className="cand-interview-header">
                        <h4>🗓️ Interview Management</h4>
                        {invStatus === "PENDING_CONFIRMATION" && (
                          <span className="cand-inv-badge pending">🟡 Awaiting Interview Confirmation</span>
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
                            <strong>📅 {activeInv.scheduled_date} at {activeInv.scheduled_time}</strong>
                          </div>
                          <div>
                            <span>Interview Mode:</span>
                            <strong>{activeInv.interview_type === "ONLINE" ? `💻 Online — ${activeInv.platform || "Google Meet"}` : `🏢 Walk-in Interview`}</strong>
                          </div>
                        </div>

                        {activeInv.interview_type === "ONLINE" && activeInv.meeting_url && (
                          <div className="cand-inv-link-box">
                            <span>Meeting Link:</span>
                            <a href={activeInv.meeting_url} target="_blank" rel="noreferrer">
                              {activeInv.meeting_url}
                            </a>
                          </div>
                        )}

                        {activeInv.interview_type === "WALK_IN" && (
                          <div className="cand-inv-walkin-box">
                            <p><strong>📍 Location:</strong> {activeInv.address}</p>
                            <p><strong>👤 Contact Person:</strong> {activeInv.contact_person}</p>
                          </div>
                        )}

                        {activeInv.instructions && (
                          <p className="cand-inv-instructions">
                            📝 <strong>Instructions:</strong> {activeInv.instructions}
                          </p>
                        )}

                        {/* PENDING CONFIRMATION ACTION BUTTONS */}
                        {invStatus === "PENDING_CONFIRMATION" && (
                          <div className="cand-inv-action-toolbar">
                            <p className="toolbar-notice">An employer has proposed an interview schedule. Please confirm whether you can attend.</p>
                            <div className="toolbar-btns">
                              <button
                                type="button"
                                className="cand-btn accept"
                                onClick={() => handleAcceptInterview(activeInv)}
                              >
                                ✓ Accept Interview
                              </button>
                              <button
                                type="button"
                                className="cand-btn reschedule"
                                onClick={() => openResponseModal(activeInv, "RESCHEDULE")}
                              >
                                🔄 Request Another Time
                              </button>
                              <button
                                type="button"
                                className="cand-btn decline"
                                onClick={() => openResponseModal(activeInv, "DECLINE")}
                              >
                                ✕ Decline
                              </button>
                            </div>
                          </div>
                        )}

                        {/* CONFIRMED STATE */}
                        {invStatus === "CONFIRMED" && (
                          <div className="cand-confirmed-box">
                            <p>✅ You have confirmed your attendance for this interview on {activeInv.scheduled_date} at {activeInv.scheduled_time}.</p>
                            {activeInv.interview_type === "ONLINE" && activeInv.meeting_url && (
                              <a href={activeInv.meeting_url} target="_blank" rel="noreferrer" className="cand-join-btn">
                                🌐 Join Meeting Now
                              </a>
                            )}
                          </div>
                        )}

                        {/* RESCHEDULE REQUESTED STATE */}
                        {invStatus === "RESCHEDULE_REQUESTED" && (
                          <div className="cand-reschedule-status-box">
                            <p>🔄 Your reschedule request has been sent to the employer. Waiting for a revised proposal.</p>
                            {activeInv.preferred_date && <p><strong>Preferred Date:</strong> {activeInv.preferred_date}</p>}
                            {activeInv.preferred_time_range && <p><strong>Preferred Time:</strong> {activeInv.preferred_time_range}</p>}
                          </div>
                        )}

                        {/* CANCELLED STATE */}
                        {invStatus === "CANCELLED" && (
                          <div className="cand-cancelled-status-box" style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: "12px", borderRadius: "8px", color: "#991b1b", fontSize: "13px" }}>
                            <p style={{ margin: 0 }}>⚫ This interview schedule was cancelled by the employer. If the employer decides to interview you, they will issue a new invitation.</p>
                          </div>
                        )}

                        {/* DECLINED STATE */}
                        {invStatus === "DECLINED" && (
                          <div className="cand-declined-status-box" style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: "12px", borderRadius: "8px", color: "#991b1b", fontSize: "13px" }}>
                            <p style={{ margin: 0 }}>🔴 You declined this interview invitation.</p>
                          </div>
                        )}

                        {/* COMPLETED / DECISION PENDING STATE */}
                        {invStatus === "COMPLETED" && (
                          <div className="cand-completed-status-box">
                            {isDecisionPending ? (
                              <div className="cand-decision-pending-note">
                                <h5>🟣 Decision Pending</h5>
                                <p>Your interview session is finished and the employer is currently evaluating your profile to make a final hiring decision.</p>
                              </div>
                            ) : (
                              <p>🔵 Your interview session has been completed.</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── FINAL DECISION BANNERS (HIRED / REJECTED) ─────────────── */}
                  {statusLower === "hired" && (
                    <div className="cand-decision-banner hired">
                      <h4>🎉 Hired — Selected!</h4>
                      <p>
                        Congratulations! You have been officially selected and hired for <strong>{app.jobs?.title}</strong> at <strong>{companyName}</strong>!
                      </p>
                      <p className="next-steps">
                        <strong>Next Steps:</strong> Check your email inbox for onboarding instructions and formal employment contracts.
                      </p>
                    </div>
                  )}

                  {statusLower === "rejected" && (
                    <div className="cand-decision-banner rejected">
                      <h4>❌ Application Closed — Not Selected</h4>
                      <p>
                        Thank you for your interest and time interviewing for the <strong>{app.jobs?.title}</strong> position at <strong>{companyName}</strong>.
                        The employer has decided to proceed with another candidate at this time.
                      </p>
                    </div>
                  )}

                  {/* ATTACHMENTS & SNAPSHOT */}
                  <div className="application-attachments">
                    <span className={`attachment-chip ${hasResume ? "checked" : ""}`}>
                      Resume Uploaded
                    </span>
                    <span className={`attachment-chip ${hasProfile ? "checked" : ""}`}>
                      Profile Details Synced
                    </span>
                    <span className="attachment-chip checked">Professional Cover Letter</span>
                  </div>

                  <button
                    type="button"
                    className="application-detail-toggle"
                    onClick={() => toggleExpand(app.id)}
                  >
                    {isExpanded ? "Hide submission snapshot" : "View submission snapshot"}
                  </button>

                  {isExpanded && (
                    <div className="application-snapshot-panel">
                      <div className="application-snapshot-title">
                        Snapshot saved during application
                      </div>

                      <div className="application-snapshot-grid">
                        <div>
                          <span>Verified name</span>
                          <strong>{snapshot.full_name || "No name snapshot"}</strong>
                        </div>
                        <div>
                          <span>Contact no.</span>
                          <strong>{snapshot.contact_number || "No contact info"}</strong>
                        </div>
                      </div>

                      {snapshot.skills && (
                        <div className="application-snapshot-skills-wrap">
                          <span>Submitted skill tags</span>
                          <div className="application-snapshot-skills">
                            {snapshot.skills.split(",").map((skill) => (
                              <span key={skill} className="application-skill-badge">
                                {skill.trim()}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {snapshot.resume && (
                        <div className="application-snapshot-file">
                          <span>Linked file</span>
                          <a
                            href={snapshot.resume.file_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {snapshot.resume.file_name}
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  {canWithdraw && (
                    <div className="application-actions">
                      <button
                        type="button"
                        className="application-withdraw-btn"
                        onClick={() => {
                          confirm({
                            title: "Withdraw application?",
                            message: "This removes your submission from the employer's pipeline. You can apply again later if the job is still open.",
                            confirmText: "Withdraw",
                            isDestructive: true,
                            onConfirm: () => handleWithdraw(app.id)
                          });
                        }}
                      >
                        Withdraw submission
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Candidate Response Modal */}
      {activeModalInterview && (
        <CandidateInterviewModal
          interview={activeModalInterview}
          mode={modalMode}
          onClose={closeResponseModal}
          onSubmit={handleModalSubmit}
        />
      )}
    </DashboardLayout>
  );
}
