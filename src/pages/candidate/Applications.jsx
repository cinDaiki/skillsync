import { useEffect, useState } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { supabase } from "../../services/supabase";
import { useModal } from "../../contexts/ModalContext";
import { useToast } from "../../contexts/ToastContext";
import "./Applications.css";

export default function Applications() {
  const [applications, setApplications] = useState([]);
  const [filter, setFilter] = useState("All");
  const [expandedAppIds, setExpandedAppIds] = useState([]);
  const [withdrawing, setWithdrawing] = useState(false);
  
  const { confirm } = useModal();
  const toast = useToast();

  useEffect(() => {
    loadApplications();
  }, []);

  async function loadApplications() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

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
        .select("id, title, employment_type, location, required_skills")
        .in("id", jobIds);
      (jobsData || []).forEach((j) => {
        jobMap[j.id] = j;
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

  function getTimelineProgress(status) {
    const s = String(status || "").toLowerCase();
    if (s === "applied" || s === "submitted") return { stage: 1, percent: "0%" };
    if (s === "screening" || s === "reviewed") return { stage: 2, percent: "25%" };
    if (s === "shortlisted") return { stage: 3, percent: "50%" };
    if (s.includes("interview")) return { stage: 4, percent: "75%" };
    if (
      s === "accepted" ||
      s === "hired" ||
      s === "offer" ||
      s === "rejected" ||
      s === "closed"
    ) {
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
      subtitle="Track recruitment pipelines and view background profile submissions."
    >
      <section className="dashboard-panel applications-page">
        <div className="applications-page-header">
          <div className="panel-header">
            <div>
              <h2>My Applications</h2>
              <p>
                Monitor your active progress, check verified attachments, or manage
                withdrawals when still in the applied stage.
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
              const { stage, percent } = getTimelineProgress(app.status);
              const isExpanded = expandedAppIds.includes(app.id);
              const snapshot = app.parsedSnapshot || {};
              const hasResume = !!snapshot.resume;
              const hasProfile = !!snapshot.full_name;
              const statusLower = String(app.status || "").toLowerCase();
              const canWithdraw = statusLower === "applied";

              return (
                <article className="application-card application-card-enhanced" key={app.id}>
                  <div className="application-top">
                    <div>
                      <h3>{app.jobs?.title || "Untitled Job Opening"}</h3>
                      <p>Applied on {formatDate(app.created_at)}</p>
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

                  <div className="application-timeline-track">
                    <div
                      className="application-timeline-progress"
                      style={{ width: percent }}
                    />
                    <div
                      className={`timeline-step ${stage >= 1 ? "completed" : ""} ${stage === 1 ? "active" : ""}`}
                    >
                      <div className="timeline-step-circle">{stage > 1 ? "✓" : "1"}</div>
                      <span className="timeline-step-label">Applied</span>
                    </div>
                    <div
                      className={`timeline-step ${stage >= 2 ? "completed" : ""} ${stage === 2 ? "active" : ""}`}
                    >
                      <div className="timeline-step-circle">{stage > 2 ? "✓" : "2"}</div>
                      <span className="timeline-step-label">Reviewed</span>
                    </div>
                    <div
                      className={`timeline-step ${stage >= 3 ? "completed" : ""} ${stage === 3 ? "active" : ""}`}
                    >
                      <div className="timeline-step-circle">{stage > 3 ? "✓" : "3"}</div>
                      <span className="timeline-step-label">Shortlisted</span>
                    </div>
                    <div
                      className={`timeline-step ${stage >= 4 ? "completed" : ""} ${stage === 4 ? "active" : ""}`}
                    >
                      <div className="timeline-step-circle">{stage > 4 ? "✓" : "4"}</div>
                      <span className="timeline-step-label">Interview</span>
                    </div>
                    <div
                      className={`timeline-step ${stage >= 5 ? "completed" : ""} ${stage === 5 ? "active" : ""}`}
                    >
                      <div className="timeline-step-circle">
                        {statusLower === "rejected" ? "✗" : "✓"}
                      </div>
                      <span className="timeline-step-label">
                        {statusLower === "rejected" ? "Closed" : "Decision"}
                      </span>
                    </div>
                  </div>

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
    </DashboardLayout>
  );
}
