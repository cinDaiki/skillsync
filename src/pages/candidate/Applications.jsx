import { useEffect, useState } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import CandidateInterviewModal from "../../components/candidate/CandidateInterviewModal";
import ApplicationDetailModal from "../../components/candidate/ApplicationDetailModal";
import { supabase } from "../../services/supabase";
import { fetchInterviewsForCandidate, respondToInterview } from "../../services/interviewService";
import { checkAndSendInterviewReminders } from "../../services/notificationService";
import { useModal } from "../../contexts/ModalContext";
import { useToast } from "../../contexts/ToastContext";
import {
  getCandidateStageInfo,
  deduplicateByApplicationId,
  isTerminalApplication,
} from "../../services/recruitmentStatus";
import { fetchSuspendedEmployerIds } from "../../services/jobAvailability";
import "./Applications.css";

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

export default function Applications() {
  const [applications, setApplications] = useState([]);
  const [interviewsMap, setInterviewsMap] = useState({});
  const [filter, setFilter] = useState("All"); // 'All' | 'Active' | 'Completed'
  const [withdrawing, setWithdrawing] = useState(false);

  // Application Details Modal state
  const [selectedAppForDetail, setSelectedAppForDetail] = useState(null);

  // Candidate Response Modal state (Reschedule / Decline)
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

    const rawApps = appsData || [];
    const dedupedApps = deduplicateByApplicationId(rawApps);
    const jobIds = [...new Set(dedupedApps.map((a) => a.job_id).filter(Boolean))];

    let jobMap = {};
    if (jobIds.length > 0) {
      const { data: jobsData } = await supabase
        .from("jobs")
        .select("id, title, employment_type, location, required_skills, employer_id")
        .in("id", jobIds);

      const employerIds = [...new Set((jobsData || []).map((j) => j.employer_id).filter(Boolean))];
      let empMap = {};
      let suspendedSet = new Set();
      if (employerIds.length > 0) {
        const [{ data: empProfiles }, suspendedEmployerSet] = await Promise.all([
          supabase
            .from("employer_profiles")
            .select("id, company_name, company_logo_url")
            .in("id", employerIds),
          fetchSuspendedEmployerIds(supabase, employerIds)
        ]);

        (empProfiles || []).forEach((ep) => {
          empMap[ep.id] = ep;
        });
        suspendedSet = suspendedEmployerSet;
      }

      (jobsData || []).forEach((j) => {
        jobMap[j.id] = {
          ...j,
          company_name: empMap[j.employer_id]?.company_name || "Employer Company",
          company_logo_url: empMap[j.employer_id]?.company_logo_url || null,
          is_employer_suspended: suspendedSet.has(j.employer_id),
        };
      });
    }

    const enriched = dedupedApps.map((app) => ({
      ...app,
      jobs: jobMap[app.job_id] || null,
      isEmployerSuspended: Boolean(jobMap[app.job_id]?.is_employer_suspended),
    }));

    setApplications(enriched);

    // Sync open details modal if currently displayed
    setSelectedAppForDetail((current) => {
      if (!current) return null;
      return enriched.find((a) => a.id === current.id) || null;
    });

    // 2. Fetch interviews for candidate
    await loadInterviews(user.id);
  }

  async function loadInterviews(userId) {
    const { data: interviewsData } = await fetchInterviewsForCandidate(userId);
    const map = {};
    (interviewsData || []).forEach((inv) => {
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
      message: `Confirm attendance for "${interview.jobs?.title || "Job Position"}" on ${interview.scheduled_date} at ${interview.scheduled_time}?`,
      confirmText: "✓ Confirm Attendance",
      onConfirm: async () => {
        const { data: { user } } = await supabase.auth.getUser();
        const res = await respondToInterview({
          interviewId: interview.id,
          userId: user.id,
          response: "ACCEPTED",
        });

        if (res.error) {
          toast.error("Failed accepting interview: " + res.error.message);
        } else {
          toast.success("🟢 Interview Confirmed! Your confirmation has been sent to the employer.");
          await loadApplications();
        }
      },
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
      if (selectedAppForDetail?.id === applicationId) {
        setSelectedAppForDetail(null);
      }
      toast.success("Application withdrawn.");
    } finally {
      setWithdrawing(false);
    }
  }

  // Filter calculations
  const activeApps = applications.filter((a) => !isTerminalApplication(a.status));
  const completedApps = applications.filter((a) => isTerminalApplication(a.status));

  const activeCount = activeApps.length;
  const completedCount = completedApps.length;

  const filteredApps = filter === "Active" ? activeApps : filter === "Completed" ? completedApps : applications;

  return (
    <DashboardLayout
      role="candidate"
      title="Application Tracker"
      subtitle="Track recruitment pipelines, confirm interview invitations, and monitor hiring decisions."
    >
      <section className="dashboard-panel applications-page">
        {/* ── CLEAN HEADER & FILTER TABS ────────────────────────────────── */}
        <div className="applications-page-header">
          <div className="panel-header">
            <div>
              <h2>My Applications</h2>
              <p>Track recruitment pipelines, confirm interview invitations, and monitor hiring decisions.</p>
            </div>
          </div>

          <div className="applications-filter-tabs">
            <button
              type="button"
              className={`applications-filter-tab ${filter === "All" ? "active" : ""}`}
              onClick={() => setFilter("All")}
            >
              All <span className="tab-count">{applications.length}</span>
            </button>
            <button
              type="button"
              className={`applications-filter-tab ${filter === "Active" ? "active" : ""}`}
              onClick={() => setFilter("Active")}
            >
              Active <span className="tab-count">{activeCount}</span>
            </button>
            <button
              type="button"
              className={`applications-filter-tab ${filter === "Completed" ? "active" : ""}`}
              onClick={() => setFilter("Completed")}
            >
              Completed <span className="tab-count">{completedCount}</span>
            </button>
          </div>
        </div>

        {/* ── APPLICATIONS LIST ────────────────────────────────────────── */}
        {filteredApps.length === 0 ? (
          <div className="empty-state applications-empty">
            <span>▣</span>
            <h3>No applications found</h3>
            <p>You do not have any applications in the &ldquo;{filter}&rdquo; category.</p>
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
                is_legacy: true,
              } : null);

              const invStatus = activeInv ? activeInv.status : null;
              const stageInfo = getCandidateStageInfo(app.status, invStatus);
              const companyName = app.jobs?.company_name || "Employer Company";
              const isTerminal = stageInfo.isTerminal;

              // ── TERMINAL / COMPLETED APPLICATION CARD ──
              if (isTerminal) {
                return (
                  <article className="application-card app-card-compact completed" key={app.id}>
                    <div className="app-card-top">
                      <div>
                        <h3 className="app-card-title">{app.jobs?.title || "Untitled Position"}</h3>
                        <p className="app-card-company">🏢 {companyName}</p>
                      </div>
                      <span className={`application-status-badge ${stageInfo.statusBadgeClass}`}>
                        {stageInfo.statusBadgeText}
                      </span>
                    </div>

                    <div className="app-card-meta-line">
                      <span>Applied {formatDate(app.created_at)}</span>
                      <span className="dot-divider">•</span>
                      <span>Decided {formatDate(app.updated_at || app.created_at)}</span>
                    </div>

                    <p className="app-card-outcome-text">{stageInfo.statusMessage}</p>

                    <div className="app-card-footer">
                      <button
                        type="button"
                        className="btn-view-app"
                        onClick={() => setSelectedAppForDetail(app)}
                      >
                        View Details
                      </button>
                    </div>
                  </article>
                );
              }

              // ── ACTIVE APPLICATION CARD ──
              return (
                <article className="application-card app-card-compact active" key={app.id}>
                  <div className="app-card-top">
                    <div>
                      <h3 className="app-card-title">{app.jobs?.title || "Untitled Position"}</h3>
                      <p className="app-card-company">🏢 {companyName}</p>
                    </div>
                    <span className={`application-status-badge ${stageInfo.statusBadgeClass}`}>
                      {stageInfo.statusBadgeText}
                    </span>
                  </div>

                  <div className="app-card-meta-line">
                    <span>📍 {app.jobs?.location || "Remote / Office"}</span>
                    <span className="dot-divider">•</span>
                    <span>{app.jobs?.employment_type || "Full-Time"}</span>
                    <span className="dot-divider">•</span>
                    <span>Applied {formatDate(app.created_at)}</span>
                  </div>

                  {/* Compact 5-Stage Progress Track */}
                  <div className="application-timeline-track">
                    <div
                      className="application-timeline-progress"
                      style={{ width: stageInfo.percent }}
                    />
                    {stageInfo.steps.map((step, idx) => {
                      const stepNum = idx + 1;
                      const isCompleted = step.state === "completed";
                      const isActive = step.state === "active";

                      return (
                        <div
                          key={step.id}
                          className={`timeline-step ${isCompleted ? "completed" : ""} ${isActive ? "active" : ""}`}
                        >
                          <div className="timeline-step-circle">
                            {isCompleted ? "✓" : isActive ? "●" : stepNum}
                          </div>
                          <span className="timeline-step-label">{step.label}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Action Indicator (if candidate action required) */}
                  {stageInfo.actionIndicator && (
                    <div className="app-card-action-indicator">
                      {stageInfo.actionIndicator}
                    </div>
                  )}

                  {/* Short Status Message */}
                  {!stageInfo.actionIndicator && (
                    <p className="app-card-status-text">{stageInfo.statusMessage}</p>
                  )}

                  {/* Recruitment Paused Notice */}
                  {app.isEmployerSuspended && (
                    <div
                      className="employer-paused-banner"
                      style={{
                        margin: "12px 0 6px",
                        padding: "10px 14px",
                        background: "#fffbeb",
                        border: "1px solid #fde68a",
                        borderRadius: "10px",
                        color: "#92400e",
                        fontSize: "13px",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "8px",
                      }}
                    >
                      <span style={{ fontSize: "15px", lineHeight: 1.2 }}>⚠️</span>
                      <div>
                        <strong style={{ display: "block", color: "#78350f" }}>Employer Temporarily Unavailable</strong>
                        <span style={{ fontSize: "12px", color: "#b45309" }}>
                          This recruitment process is temporarily paused. Your application and interview records are preserved.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Actions Toolbar */}
                  <div className="app-card-footer">
                    {stageInfo.canWithdraw && stageInfo.stage === 1 && (
                      <button
                        type="button"
                        className="btn-withdraw-app"
                        onClick={() => {
                          confirm({
                            title: "Withdraw application?",
                            message: "This removes your submission from the employer's pipeline. You can apply again later if the job is still open.",
                            confirmText: "Withdraw",
                            isDestructive: true,
                            onConfirm: () => handleWithdraw(app.id),
                          });
                        }}
                      >
                        Withdraw
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-view-app primary"
                      onClick={() => setSelectedAppForDetail(app)}
                    >
                      View Application
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ── APPLICATION DETAILS MODAL ──────────────────────────────────── */}
      {selectedAppForDetail && (
        <ApplicationDetailModal
          application={selectedAppForDetail}
          interview={interviewsMap[selectedAppForDetail.id]}
          onClose={() => setSelectedAppForDetail(null)}
          onAcceptInterview={handleAcceptInterview}
          onOpenResponseModal={openResponseModal}
          onWithdraw={(appId) => {
            confirm({
              title: "Withdraw application?",
              message: "This removes your submission from the employer's pipeline. You can apply again later if the job is still open.",
              confirmText: "Withdraw",
              isDestructive: true,
              onConfirm: () => handleWithdraw(appId),
            });
          }}
        />
      )}

      {/* ── CANDIDATE INTERVIEW RESPONSE MODAL (RESCHEDULE / DECLINE) ──── */}
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
