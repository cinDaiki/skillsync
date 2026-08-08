import { useEffect, useState } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { useToast } from "../../contexts/ToastContext";
import { supabase } from "../../services/supabase";
import { fetchAdminJobs, displayUserName, moderateJobStatus } from "../../services/adminService";
import { parseJobRequirements } from "../../utils/jobRequirementsHelper";

export default function AdminManageJobs() {
  const toast = useToast();
  const [jobs, setJobs] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  // Moderation Modal State
  const [actionModal, setActionModal] = useState(null); // { job, targetStatus: 'open'|'rejected'|'suspended' }
  const [reasonInput, setReasonInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadJobs();
  }, []);

  async function loadJobs() {
    setLoadError("");
    const { data, error } = await fetchAdminJobs();
    if (error && (!data || data.length === 0)) {
      setLoadError(
        "Could not load jobs. Run supabase/admin_access.sql in your Supabase SQL Editor, then refresh."
      );
    }
    setJobs(data || []);
  }

  function handlePromptJobAction(job, targetStatus) {
    if (targetStatus === "open") {
      executeJobModeration(job.id, "open", "");
    } else {
      setActionModal({ job, targetStatus });
      setReasonInput("");
    }
  }

  async function executeJobModeration(jobId, newStatus, reason) {
    setSubmitting(true);
    const { error } = await moderateJobStatus(jobId, newStatus, reason);
    setSubmitting(false);

    if (error) {
      toast.error("Failed to update job status: " + error.message);
      return;
    }

    toast.success(`Job status updated to "${newStatus === 'open' ? 'Open & Published' : newStatus}".`);
    setActionModal(null);
    await loadJobs();
  }

  async function handleDelete(jobId) {
    if (!window.confirm("Are you sure you want to remove this job post?")) return;
    await supabase.from("jobs").delete().eq("id", jobId);
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
  }

  function formatDate(dateString) {
    if (!dateString) return "No date";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function getPostedBy(job) {
    const profile = job.profiles || {};
    if (profile.full_name || profile.email) {
      return displayUserName(profile);
    }
    if (job.employer_name || job.employer_email) {
      return displayUserName({
        full_name: job.employer_name,
        email: job.employer_email,
      });
    }
    return "Unknown";
  }

  const filteredJobs = jobs.filter((j) => {
    const status = j.status || "open";
    if (statusFilter === "All") return true;
    if (statusFilter === "pending_review") return status === "pending_review";
    return status === statusFilter;
  });

  return (
    <DashboardLayout
      role="admin"
      title="Manage Jobs"
      subtitle="Review and moderate job posts created by employers."
    >
      <section className="dashboard-panel">
        <div className="panel-header admin-jobs-panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <div className="panel-header-content">
            <h2>Employer Job Posts ({filteredJobs.length})</h2>
          </div>

          {/* Status Filter Tabs */}
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {[
              { id: "All", label: "All" },
              { id: "pending_review", label: "⏳ Pending Review" },
              { id: "open", label: "Open" },
              { id: "rejected", label: "Rejected" },
              { id: "suspended", label: "Suspended" },
              { id: "closed", label: "Closed" },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                style={{
                  padding: "6px 14px",
                  borderRadius: "20px",
                  fontSize: "12px",
                  fontWeight: "700",
                  border: statusFilter === tab.id ? "1px solid #58158f" : "1px solid #cbd5e1",
                  background: statusFilter === tab.id ? "#58158f" : "#fff",
                  color: statusFilter === tab.id ? "#fff" : "#475569",
                  cursor: "pointer"
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {loadError && <div className="profile-message">{loadError}</div>}

        {filteredJobs.length === 0 && !loadError ? (
          <div className="empty-state">
            <span>▣</span>
            <h3>No job posts found</h3>
            <p>No job listings match your selected filter criteria.</p>
          </div>
        ) : (
          <div className="admin-jobs-list">
            {filteredJobs.map((job) => {
              const { applicationRequirements } = parseJobRequirements(job);
              const status = job.status || "open";
              const isOpen = status === "open";

              return (
                <article className="admin-job-card" key={job.id} style={{ borderLeft: isOpen ? "4px solid #16a34a" : status === "pending_review" ? "4px solid #f59e0b" : status === "rejected" ? "4px solid #dc2626" : status === "suspended" ? "4px solid #450a0a" : "4px solid #64748b" }}>
                  <div className="admin-job-top">
                    <div>
                      <h3 style={{ margin: "0 0 4px 0" }}>{job.title || "Untitled Job"}</h3>
                      <p style={{ margin: 0, fontSize: "13px", color: "#475569" }}>{job.description || "No description provided."}</p>
                    </div>
                    <span
                      className={`job-status-badge ${status === "closed" ? "closed" : status === "pending_review" ? "pending" : isOpen ? "open" : "closed"}`}
                      style={
                        status === "pending_review" ? { background: "#fef3c7", color: "#b45309", border: "1px solid #fde68a" } :
                        status === "rejected" ? { background: "#fef2f2", color: "#b91c1c", border: "1px solid #fca5a5" } :
                        status === "suspended" ? { background: "#450a0a", color: "#ffffff", border: "1px solid #991b1b" } : {}
                      }
                    >
                      {status === "pending_review" ? "⏳ Pending Review" :
                       status === "rejected" ? "❌ Rejected" :
                       status === "suspended" ? "🚫 Suspended" :
                       status === "closed" ? "Closed" : "Open"}
                    </span>
                  </div>

                  <div className="admin-job-details-grid" style={{ marginTop: "12px" }}>
                    <div>
                      <span>Job Type</span>
                      <strong>{job.employment_type || "Not specified"}</strong>
                    </div>
                    <div>
                      <span>Location</span>
                      <strong>{job.location || "No location"}</strong>
                    </div>
                    <div>
                      <span>Required Skills</span>
                      <strong>{job.required_skills || "Not listed"}</strong>
                    </div>
                    <div>
                      <span>Posted By</span>
                      <strong>{getPostedBy(job)}</strong>
                    </div>
                    <div>
                      <span>Posted Date</span>
                      <strong>{formatDate(job.created_at)}</strong>
                    </div>
                  </div>

                  {/* Rejection / Suspension Note */}
                  {job.rejection_reason && (
                    <div style={{ marginTop: "10px", padding: "8px 12px", background: "#f8fafc", borderRadius: "6px", fontSize: "12px", color: "#dc2626", border: "1px solid #fee2e2" }}>
                      <strong>Rejection Note:</strong> {job.rejection_reason}
                    </div>
                  )}

                  {applicationRequirements.length > 0 && (
                    <div style={{ marginTop: "12px", background: "#f8fafc", padding: "10px 14px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                      <span style={{ fontSize: "11px", fontWeight: "700", color: "#475569", display: "block", marginBottom: "4px" }}>📋 Employer Application Requirements:</span>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {applicationRequirements.map((req, rIdx) => (
                          <span key={rIdx} style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: "600" }}>
                            ✓ {req}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Moderation Actions */}
                  <div className="admin-job-actions" style={{ display: "flex", gap: "8px", marginTop: "14px", flexWrap: "wrap" }}>
                    {!isOpen && (
                      <button
                        type="button"
                        className="job-edit-btn"
                        style={{ background: "#16a34a", color: "#fff", border: "none" }}
                        onClick={() => handlePromptJobAction(job, "open")}
                      >
                        ✓ Approve & Publish
                      </button>
                    )}

                    {status !== "rejected" && (
                      <button
                        type="button"
                        className="job-status-btn"
                        style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5" }}
                        onClick={() => handlePromptJobAction(job, "rejected")}
                      >
                        ❌ Reject Job
                      </button>
                    )}

                    {status !== "suspended" && (
                      <button
                        type="button"
                        className="job-status-btn"
                        style={{ background: "#450a0a", color: "#ffffff", border: "none" }}
                        onClick={() => handlePromptJobAction(job, "suspended")}
                      >
                        🚫 Suspend Job
                      </button>
                    )}

                    <button
                      type="button"
                      className="job-delete-btn"
                      onClick={() => handleDelete(job.id)}
                    >
                      Remove Job
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Action Reason Modal */}
        {actionModal && (
          <div className="modal-overlay" onClick={() => setActionModal(null)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "480px" }}>
              <div className="modal-header">
                <div>
                  <h3 style={{ margin: 0, fontSize: "18px", color: actionModal.targetStatus === "suspended" ? "#450a0a" : "#dc2626" }}>
                    {actionModal.targetStatus === "rejected" ? "❌ Reject Job Post" : "🚫 Suspend Job Post"}
                  </h3>
                  <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#64748b" }}>
                    Job Title: <strong>{actionModal.job.title}</strong>
                  </p>
                </div>
                <button className="modal-close-btn" onClick={() => setActionModal(null)}>×</button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!reasonInput.trim()) {
                    toast.error("Please enter a reason for this action.");
                    return;
                  }
                  executeJobModeration(actionModal.job.id, actionModal.targetStatus, reasonInput.trim());
                }}
                style={{ padding: "20px 0" }}
              >
                <label style={{ display: "block", marginBottom: "14px", fontSize: "13px", fontWeight: "700", color: "#1e293b" }}>
                  Reason for {actionModal.targetStatus.toLowerCase()} *
                  <textarea
                    rows={4}
                    placeholder="Enter official moderation reason for this decision..."
                    value={reasonInput}
                    onChange={(e) => setReasonInput(e.target.value)}
                    required
                    style={{ display: "block", width: "100%", marginTop: "6px", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                  />
                </label>

                <div className="modal-footer" style={{ display: "flex", justifyContent: "flex-end", gap: "12px", borderTop: "1px solid #e2e8f0", paddingTop: "16px" }}>
                  <button type="button" className="view-details-btn" onClick={() => setActionModal(null)}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="job-apply-primary"
                    disabled={submitting}
                    style={{ background: actionModal.targetStatus === "suspended" ? "#450a0a" : "#dc2626" }}
                  >
                    {submitting ? "Processing..." : `Confirm ${actionModal.targetStatus}`}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </section>
    </DashboardLayout>
  );
}
