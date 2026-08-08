import { useEffect, useState } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { supabase } from "../../services/supabase";
import { fetchAdminJobs, displayUserName } from "../../services/adminService";
import { parseJobRequirements } from "../../utils/jobRequirementsHelper";

export default function AdminManageJobs() {
  const [jobs, setJobs] = useState([]);
  const [loadError, setLoadError] = useState("");

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

  async function handleToggleStatus(jobId, currentStatus) {
    const newStatus = currentStatus === "closed" ? "open" : "closed";
    await supabase.from("jobs").update({ status: newStatus }).eq("id", jobId);
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, status: newStatus } : j))
    );
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

  return (
    <DashboardLayout
      role="admin"
      title="Manage Jobs"
      subtitle="Review and manage job posts created by employers."
    >
      <section className="dashboard-panel">
        <div className="panel-header admin-jobs-panel-header">
          <div className="panel-header-content">
            <h2>Employer Job Posts</h2>
          </div>
        </div>

        {loadError && <div className="profile-message">{loadError}</div>}

        {jobs.length === 0 && !loadError ? (
          <div className="empty-state">
            <span>▣</span>
            <h3>No job posts yet</h3>
            <p>Posted jobs from employers will be displayed here.</p>
          </div>
        ) : (
          <div className="admin-jobs-list">
            {jobs.map((job) => {
              const { applicationRequirements } = parseJobRequirements(job);

              return (
                <article className="admin-job-card" key={job.id}>
                  <div className="admin-job-top">
                    <div>
                      <h3>{job.title || "Untitled Job"}</h3>
                      <p>{job.description || "No description provided."}</p>
                    </div>
                    <span
                      className={`job-status-badge ${job.status === "closed" ? "closed" : "open"}`}
                    >
                      {job.status || "open"}
                    </span>
                  </div>
                  <div className="admin-job-details-grid">
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

                  <div className="admin-job-actions">
                    <button
                      type="button"
                      className="job-status-btn"
                      onClick={() => handleToggleStatus(job.id, job.status)}
                    >
                      {job.status === "closed" ? "Reopen Job" : "Close Job"}
                    </button>
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
      </section>
    </DashboardLayout>
  );
}
