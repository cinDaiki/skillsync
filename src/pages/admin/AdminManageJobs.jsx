import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { useToast } from "../../contexts/ToastContext";
import { supabase } from "../../services/supabase";
import {
  fetchAdminJobs,
  moderateJobStatus,
  fetchJobReports,
  resolveJobReport,
} from "../../services/adminService";
import { parseJobRequirements } from "../../utils/jobRequirementsHelper";

export default function AdminManageJobs() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const getJobStatusFromParam = (params) => {
    const p = String(params.get("status") || params.get("filter") || "").trim().toLowerCase();
    if (p === "reported") return "reported";
    if (p === "open" || p === "active") return "open";
    if (p === "disabled" || p === "suspended") return "suspended";
    if (p === "closed") return "closed";
    if (p === "pending_review" || p === "pending") return "pending_review";
    if (p === "rejected") return "rejected";
    return "all";
  };

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(() => getJobStatusFromParam(searchParams));
  const [workSetupFilter, setWorkSetupFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Sync state if URL searchParams change
  useEffect(() => {
    const urlStatus = getJobStatusFromParam(searchParams);
    setStatusFilter(urlStatus);
  }, [searchParams]);

  const handleStatusFilterChange = (newStatus) => {
    setStatusFilter(newStatus);
    setPage(1);
    const newParams = new URLSearchParams(searchParams);
    if (newStatus && newStatus !== "all") {
      newParams.set("status", newStatus);
      newParams.delete("filter");
    } else {
      newParams.delete("status");
      newParams.delete("filter");
    }
    setSearchParams(newParams, { replace: true });
  };

  // Modals
  const [viewJobModal, setViewJobModal] = useState(null);
  const [viewEmployerModal, setViewEmployerModal] = useState(null);

  // Job Reports modal
  const [reportsModalJob, setReportsModalJob] = useState(null);
  const [jobReportsList, setJobReportsList] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);

  // Disable modal
  const [disableModalJob, setDisableModalJob] = useState(null);
  const [disableReasonPreset, setDisableReasonPreset] = useState("Policy violation");
  const [disableReasonDetails, setDisableReasonDetails] = useState("");

  // Legacy Rejection modal
  const [rejectionModalJob, setRejectionModalJob] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const [submitting, setSubmitting] = useState(false);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const res = await fetchAdminJobs({
      search,
      status: statusFilter,
      workSetup: workSetupFilter,
      page,
      pageSize,
    });

    if (res.error) {
      setLoadError("Could not load jobs. Please verify database connection and schema.");
    }
    setJobs(res.data || []);
    setTotalCount(res.totalCount || 0);
    setTotalPages(res.totalPages || 1);
    setLoading(false);
  }, [search, statusFilter, workSetupFilter, page, pageSize]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  // Load reports for specific job
  async function handleOpenReportsModal(job) {
    setReportsModalJob(job);
    setLoadingReports(true);
    const { data } = await fetchJobReports(job.id);
    setJobReportsList(data || []);
    setLoadingReports(false);
  }

  // Dismiss a specific report
  async function handleDismissReport(reportId) {
    setSubmitting(true);
    const { error } = await resolveJobReport(reportId, "dismissed", "Dismissed by administrator after review");
    setSubmitting(false);

    if (error) {
      toast.error("Failed to dismiss report: " + error.message);
      return;
    }

    toast.success("Job report dismissed.");
    if (reportsModalJob) {
      const { data } = await fetchJobReports(reportsModalJob.id);
      setJobReportsList(data || []);
    }
    loadJobs();
  }

  // Open disable modal
  function handleOpenDisableModal(job) {
    setDisableModalJob(job);
    setDisableReasonPreset("Policy violation");
    setDisableReasonDetails("");
  }

  // Confirm disable
  async function handleConfirmDisable() {
    if (!disableModalJob) return;
    const finalReason = disableReasonDetails.trim()
      ? `${disableReasonPreset}: ${disableReasonDetails.trim()}`
      : disableReasonPreset;

    setSubmitting(true);
    const { error } = await moderateJobStatus(disableModalJob.id, "suspended", finalReason);
    setSubmitting(false);

    if (error) {
      toast.error("Failed to disable job: " + error.message);
      return;
    }

    toast.success(`Job "${disableModalJob.title}" has been disabled and hidden from candidates.`);
    setDisableModalJob(null);
    if (reportsModalJob?.id === disableModalJob.id) {
      setReportsModalJob(null);
    }
    if (viewJobModal?.id === disableModalJob.id) {
      setViewJobModal(null);
    }
    loadJobs();
  }

  // Restore disabled job
  async function handleRestoreJob(job) {
    if (!window.confirm(`Restore job "${job.title}" back to active open status?`)) return;

    setSubmitting(true);
    const { error } = await moderateJobStatus(job.id, "open", "Restored to active by administrator");
    setSubmitting(false);

    if (error) {
      toast.error("Failed to restore job: " + error.message);
      return;
    }

    toast.success(`Job "${job.title}" has been restored and is active again!`);
    loadJobs();
  }

  // Close job
  async function handleCloseJob(job) {
    if (!window.confirm(`Close job listing "${job.title}"? Candidates will no longer be able to apply.`)) return;

    setSubmitting(true);
    const { error } = await moderateJobStatus(job.id, "closed", "Closed by administrator");
    setSubmitting(false);

    if (error) {
      toast.error("Failed to close job: " + error.message);
      return;
    }

    toast.success(`Job "${job.title}" has been closed.`);
    loadJobs();
  }

  // Legacy approval for pending_review jobs
  async function handleApproveJob(job) {
    setSubmitting(true);
    const { error } = await moderateJobStatus(job.id, "open", "Approved by administrator");
    setSubmitting(false);

    if (error) {
      toast.error("Failed to approve job: " + error.message);
      return;
    }

    toast.success(`Job "${job.title}" has been approved!`);
    if (viewJobModal?.id === job.id) setViewJobModal(null);
    loadJobs();
  }

  // Legacy reject for pending_review jobs
  function handleOpenRejectModal(job) {
    setRejectionModalJob(job);
    setRejectionReason("");
  }

  async function handleConfirmRejection() {
    if (!rejectionReason.trim()) {
      toast.error("Please enter a non-empty reason for rejecting this job posting.");
      return;
    }

    setSubmitting(true);
    const { error } = await moderateJobStatus(rejectionModalJob.id, "rejected", rejectionReason.trim());
    setSubmitting(false);

    if (error) {
      toast.error("Failed to reject job: " + error.message);
      return;
    }

    toast.success(`Job "${rejectionModalJob.title}" rejected with explanation recorded.`);
    setRejectionModalJob(null);
    if (viewJobModal?.id === rejectionModalJob.id) setViewJobModal(null);
    loadJobs();
  }

  async function handleAdminViewDoc(filePathOrUrl) {
    if (!filePathOrUrl) return;
    const { getPrivateDocumentSignedUrl } = await import("../../services/api");
    const { url, error } = await getPrivateDocumentSignedUrl(filePathOrUrl);
    if (error || !url) {
      toast.error("Could not load private document: " + (error?.message || "Access denied"));
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function formatDate(dateString) {
    if (!dateString) return "No date";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  const filterTabs = [
    { label: "All", value: "all" },
    { label: "Open", value: "open" },
    { label: "Reported", value: "reported" },
    { label: "Disabled", value: "suspended" },
    { label: "Closed", value: "closed" },
    { label: "Pending Review", value: "pending_review" },
  ];

  return (
    <DashboardLayout
      role="admin"
      title="Job Management"
      subtitle="Monitor and moderate job listings across SkillSync."
    >
      <div className="admin-page-container" style={{ padding: "24px" }}>
        {/* Header Summary Bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: "800", color: "#0f172a", margin: 0 }}>
              💼 Job Management
            </h1>
            <p style={{ color: "#64748b", fontSize: "14px", marginTop: "4px" }}>
              Monitor and moderate job listings across SkillSync.
            </p>
          </div>

          <div
            style={{
              background: "#f1f5f9",
              padding: "8px 16px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: "700",
              color: "#334155",
            }}
          >
            Total Listings: <span style={{ color: "#2563eb" }}>{totalCount}</span>
          </div>
        </div>

        {loadError && (
          <div
            style={{
              padding: "12px 16px",
              background: "#fee2e2",
              border: "1px solid #fca5a5",
              borderRadius: "8px",
              color: "#991b1b",
              fontSize: "13px",
              marginBottom: "16px",
            }}
          >
            {loadError}
          </div>
        )}

        {/* Filter Controls Bar */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
          {/* Status Tabs */}
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }} role="tablist" aria-label="Job moderation filters">
            {filterTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={statusFilter === tab.value}
                onClick={() => handleStatusFilterChange(tab.value)}
                style={{
                  padding: "8px 14px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: "700",
                  border: statusFilter === tab.value ? "none" : "1px solid #cbd5e1",
                  background: statusFilter === tab.value ? "#2563eb" : "#fff",
                  color: statusFilter === tab.value ? "#fff" : "#475569",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search & Secondary Filters */}
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="text"
              placeholder="🔍 Search title, company, or required skills..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              style={{
                flex: "1",
                minWidth: "240px",
                padding: "10px 14px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                fontSize: "14px",
                outline: "none",
              }}
            />

            <select
              value={workSetupFilter}
              onChange={(e) => {
                setWorkSetupFilter(e.target.value);
                setPage(1);
              }}
              style={{
                padding: "10px 14px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                fontSize: "14px",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              <option value="all">All Work Setups</option>
              <option value="On-site">On-site</option>
              <option value="Remote">Remote</option>
              <option value="Hybrid">Hybrid</option>
            </select>

            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              style={{
                padding: "10px 14px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                fontSize: "14px",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              <option value={10}>10 per page</option>
              <option value={20}>20 per page</option>
              <option value={50}>50 per page</option>
            </select>
          </div>
        </div>

        {/* Job Cards Grid */}
        {loading ? (
          <div
            style={{
              textAlign: "center",
              padding: "40px",
              color: "#64748b",
              background: "#fff",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
            }}
          >
            Loading job listings...
          </div>
        ) : jobs.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "40px",
              color: "#64748b",
              background: "#fff",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
            }}
          >
            {search.trim()
              ? `No job listings found matching "${search.trim()}".`
              : statusFilter === "reported"
              ? "No job listings currently flagged with reports."
              : statusFilter === "suspended"
              ? "No disabled job listings found."
              : statusFilter === "open"
              ? "No open job listings found."
              : statusFilter === "closed"
              ? "No closed job listings found."
              : statusFilter === "pending_review"
              ? "No job listings currently pending review."
              : "No job listings found matching filter criteria."}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: "16px" }}>
            {jobs.map((job) => {
              const emp = job.employer_info || {};
              const isOpen = job.status === "open";
              const isSuspended = job.status === "suspended";
              const isClosed = job.status === "closed";
              const isPending = job.status === "pending_review";
              const isRejected = job.status === "rejected";
              const hasReports = (job.pending_report_count || 0) > 0;

              return (
                <div
                  key={job.id}
                  style={{
                    background: "#fff",
                    borderRadius: "12px",
                    border: hasReports ? "2px solid #f87171" : isSuspended ? "1px solid #fecaca" : "1px solid #e2e8f0",
                    padding: "20px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    boxShadow: hasReports ? "0 4px 6px -1px rgba(239, 68, 68, 0.1)" : "0 1px 3px rgba(0,0,0,0.05)",
                  }}
                >
                  <div>
                    {/* Header with Title & Status Badges */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px", marginBottom: "8px" }}>
                      <h3 style={{ fontSize: "17px", fontWeight: "800", color: "#0f172a", margin: 0, lineHeight: 1.3 }}>
                        {job.title}
                      </h3>
                      <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                        {hasReports && (
                          <span
                            onClick={() => handleOpenReportsModal(job)}
                            style={{
                              padding: "3px 8px",
                              borderRadius: "12px",
                              fontSize: "11px",
                              fontWeight: "800",
                              background: "#fee2e2",
                              color: "#b91c1c",
                              border: "1px solid #fca5a5",
                              cursor: "pointer",
                            }}
                            title="Click to view reports"
                          >
                            🚩 {job.pending_report_count} Report{job.pending_report_count > 1 ? "s" : ""}
                          </span>
                        )}

                        <span
                          style={{
                            padding: "3px 10px",
                            borderRadius: "12px",
                            fontSize: "11px",
                            fontWeight: "700",
                            whiteSpace: "nowrap",
                            background: isOpen
                              ? "#dcfce7"
                              : isSuspended
                              ? "#450a0a"
                              : isPending
                              ? "#fef3c7"
                              : isRejected
                              ? "#fee2e2"
                              : "#f1f5f9",
                            color: isOpen
                              ? "#15803d"
                              : isSuspended
                              ? "#ffffff"
                              : isPending
                              ? "#b45309"
                              : isRejected
                              ? "#dc2626"
                              : "#475569",
                          }}
                        >
                          {isOpen
                            ? "✓ Open"
                            : isSuspended
                            ? "🚫 Disabled"
                            : isPending
                            ? "⏳ Pending Review"
                            : isRejected
                            ? "❌ Rejected"
                            : "Closed"}
                        </span>
                      </div>
                    </div>

                    <div style={{ fontSize: "14px", fontWeight: "700", color: "#2563eb", marginBottom: "8px" }}>
                      🏢 {emp.company_name || job.company_name || "Company"}
                    </div>

                    {/* Employer Context */}
                    <div style={{ fontSize: "12px", color: "#64748b", background: "#f8fafc", padding: "8px 12px", borderRadius: "6px", marginBottom: "12px" }}>
                      <div>👤 <strong>Poster:</strong> {emp.contact_name || job.employer_name || "Employer"}</div>
                      <div>✉ <strong>Email:</strong> {emp.contact_email || job.employer_email || "Not specified"}</div>
                    </div>

                    {/* Key Details */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", fontSize: "12px", color: "#475569", marginBottom: "12px" }}>
                      <div>📍 {job.location || emp.location || "Location unstated"}</div>
                      <div>🏠 {job.work_setup || job.employment_type || "Full-time"}</div>
                      <div>💰 {job.salary_range || "Salary unstated"}</div>
                      <div>⏳ {formatDate(job.created_at)}</div>
                    </div>

                    {/* Moderation / Rejection Reason Banner */}
                    {(isSuspended || isRejected) && job.rejection_reason && (
                      <div
                        style={{
                          background: "#fef2f2",
                          border: "1px solid #fca5a5",
                          borderRadius: "6px",
                          padding: "8px 10px",
                          fontSize: "12px",
                          color: "#991b1b",
                          marginBottom: "12px",
                        }}
                      >
                        <strong>Moderation Note:</strong> "{job.rejection_reason}"
                      </div>
                    )}
                  </div>

                  {/* Card Actions Toolbar */}
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", borderTop: "1px solid #f1f5f9", paddingTop: "12px", marginTop: "12px" }}>
                    <button
                      type="button"
                      onClick={() => setViewJobModal(job)}
                      style={{
                        flex: 1,
                        background: "#f1f5f9",
                        color: "#1e293b",
                        border: "1px solid #cbd5e1",
                        padding: "6px 8px",
                        borderRadius: "6px",
                        fontSize: "12px",
                        fontWeight: "600",
                        cursor: "pointer",
                      }}
                    >
                      📄 View Job
                    </button>

                    <button
                      type="button"
                      onClick={() => setViewEmployerModal(emp)}
                      style={{
                        flex: 1,
                        background: "#eff6ff",
                        color: "#1d4ed8",
                        border: "1px solid #bfdbfe",
                        padding: "6px 8px",
                        borderRadius: "6px",
                        fontSize: "12px",
                        fontWeight: "700",
                        cursor: "pointer",
                      }}
                    >
                      🏢 Employer
                    </button>

                    {/* View Reports Action (if reports exist) */}
                    {((job.total_report_count || 0) > 0 || hasReports) && (
                      <button
                        type="button"
                        onClick={() => handleOpenReportsModal(job)}
                        style={{
                          background: "#fef2f2",
                          color: "#b91c1c",
                          border: "1px solid #fecaca",
                          padding: "6px 10px",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: "700",
                          cursor: "pointer",
                        }}
                      >
                        🚩 Reports ({job.pending_report_count || 0})
                      </button>
                    )}

                    {/* Disable Job Action (Active/Open or Pending jobs) */}
                    {(isOpen || isPending) && (
                      <button
                        type="button"
                        onClick={() => handleOpenDisableModal(job)}
                        style={{
                          background: "#dc2626",
                          color: "#fff",
                          border: "none",
                          padding: "6px 10px",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: "700",
                          cursor: "pointer",
                        }}
                      >
                        🚫 Disable
                      </button>
                    )}

                    {/* Restore Job Action (Disabled/Suspended jobs) */}
                    {isSuspended && (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => handleRestoreJob(job)}
                        style={{
                          background: "#16a34a",
                          color: "#fff",
                          border: "none",
                          padding: "6px 10px",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: "700",
                          cursor: "pointer",
                        }}
                      >
                        ✅ Restore
                      </button>
                    )}

                    {/* Close Job Action (Open jobs) */}
                    {isOpen && (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => handleCloseJob(job)}
                        style={{
                          background: "#475569",
                          color: "#fff",
                          border: "none",
                          padding: "6px 10px",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: "700",
                          cursor: "pointer",
                        }}
                      >
                        📋 Close
                      </button>
                    )}

                    {/* Legacy Pending Review Actions */}
                    {isPending && (
                      <>
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => handleApproveJob(job)}
                          style={{
                            background: "#16a34a",
                            color: "#fff",
                            border: "none",
                            padding: "6px 10px",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: "700",
                            cursor: "pointer",
                          }}
                        >
                          ✓ Approve
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenRejectModal(job)}
                          style={{
                            background: "#991b1b",
                            color: "#fff",
                            border: "none",
                            padding: "6px 10px",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: "700",
                            cursor: "pointer",
                          }}
                        >
                          ❌ Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Server-Side Pagination Footer */}
        <div
          style={{
            padding: "14px 16px",
            background: "#f8fafc",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "13px",
            color: "#64748b",
            marginTop: "20px",
          }}
        >
          <div>
            Showing {jobs.length > 0 ? (page - 1) * pageSize + 1 : 0} to{" "}
            {Math.min(page * pageSize, totalCount)} of {totalCount} jobs
          </div>

          <div style={{ display: "flex", gap: "6px" }}>
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                background: page <= 1 ? "#f1f5f9" : "#fff",
                cursor: page <= 1 ? "not-allowed" : "pointer",
                fontSize: "13px",
              }}
            >
              ◀ Previous
            </button>

            <span style={{ padding: "6px 12px", fontWeight: "700", color: "#0f172a" }}>
              Page {page} of {totalPages}
            </span>

            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                background: page >= totalPages ? "#f1f5f9" : "#fff",
                cursor: page >= totalPages ? "not-allowed" : "pointer",
                fontSize: "13px",
              }}
            >
              Next ▶
            </button>
          </div>
        </div>
      </div>

      {/* ─── MODAL: DISABLE JOB (WITH REASON) ─── */}
      {disableModalJob && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.6)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1100,
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "16px",
              padding: "24px",
              maxWidth: "520px",
              width: "100%",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
            }}
          >
            <h3 style={{ fontSize: "18px", fontWeight: "800", color: "#dc2626", margin: 0 }}>
              🚫 Disable Job Listing
            </h3>
            <p style={{ color: "#475569", fontSize: "14px", marginTop: "6px" }}>
              Disabling will immediately hide <strong>"{disableModalJob.title}"</strong> from candidate searches and block new applications.
            </p>

            <div style={{ marginTop: "14px" }}>
              <label style={{ fontSize: "13px", fontWeight: "700", color: "#334155", display: "block", marginBottom: "6px" }}>
                Primary Reason *
              </label>
              <select
                value={disableReasonPreset}
                onChange={(e) => setDisableReasonPreset(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "14px",
                  marginBottom: "12px",
                  background: "#fff",
                }}
              >
                <option value="Policy violation">Policy violation</option>
                <option value="Misleading information">Misleading information</option>
                <option value="Fraud/scam concern">Fraud/scam concern</option>
                <option value="Repeated reports">Repeated reports</option>
                <option value="Inappropriate content">Inappropriate content</option>
                <option value="Other">Other</option>
              </select>

              <label style={{ fontSize: "13px", fontWeight: "700", color: "#334155", display: "block", marginBottom: "6px" }}>
                Moderation Notes / Explanation <span style={{ color: "#dc2626" }}>* (Required)</span>
              </label>
              <textarea
                rows={4}
                value={disableReasonDetails}
                onChange={(e) => setDisableReasonDetails(e.target.value)}
                placeholder="Explain the reason for disabling this job. This explanation will be recorded in the audit log and visible to the employer..."
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "14px",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}>
              <button
                type="button"
                onClick={() => setDisableModalJob(null)}
                style={{
                  background: "#f1f5f9",
                  color: "#334155",
                  border: "1px solid #cbd5e1",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={submitting || !disableReasonDetails.trim()}
                onClick={handleConfirmDisable}
                style={{
                  background: !disableReasonDetails.trim() ? "#cbd5e1" : "#dc2626",
                  color: "#fff",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: "700",
                  cursor: !disableReasonDetails.trim() ? "not-allowed" : "pointer",
                }}
              >
                {submitting ? "Disabling..." : "Confirm Disable"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: VIEW JOB REPORTS ─── */}
      {reportsModalJob && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.6)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1050,
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "16px",
              maxWidth: "680px",
              width: "100%",
              maxHeight: "85vh",
              overflowY: "auto",
              padding: "24px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
              <div>
                <h2 style={{ fontSize: "20px", fontWeight: "800", color: "#b91c1c", margin: 0 }}>
                  🚩 Candidate Abuse Reports
                </h2>
                <p style={{ color: "#475569", fontSize: "14px", marginTop: "4px" }}>
                  Reports filed for <strong>"{reportsModalJob.title}"</strong>
                </p>
              </div>

              <button
                type="button"
                onClick={() => setReportsModalJob(null)}
                style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#64748b" }}
              >
                ✕
              </button>
            </div>

            {loadingReports ? (
              <div style={{ padding: "30px", textAlign: "center", color: "#64748b" }}>Loading report history...</div>
            ) : jobReportsList.length === 0 ? (
              <div style={{ padding: "30px", textAlign: "center", color: "#64748b" }}>
                No active or pending reports found for this job listing.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
                {jobReportsList.map((rep) => {
                  const isPending = rep.status === "pending";
                  const reporterName = rep.reporter?.full_name || "Anonymous Candidate";
                  const reporterEmail = rep.reporter?.email || "Email protected";

                  return (
                    <div
                      key={rep.id}
                      style={{
                        padding: "14px 16px",
                        borderRadius: "10px",
                        border: isPending ? "1px solid #fecaca" : "1px solid #e2e8f0",
                        background: isPending ? "#fffbfb" : "#f8fafc",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                        <div>
                          <span
                            style={{
                              background: "#fee2e2",
                              color: "#991b1b",
                              padding: "2px 8px",
                              borderRadius: "6px",
                              fontSize: "12px",
                              fontWeight: "700",
                              textTransform: "capitalize",
                            }}
                          >
                            {rep.reason_code ? rep.reason_code.replace(/_/g, " ") : "Suspicious"}
                          </span>
                          <span style={{ fontSize: "12px", color: "#64748b", marginLeft: "10px" }}>
                            By {reporterName} ({reporterEmail})
                          </span>
                        </div>

                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: "700",
                            padding: "2px 8px",
                            borderRadius: "10px",
                            background: isPending ? "#fef3c7" : "#e2e8f0",
                            color: isPending ? "#92400e" : "#475569",
                          }}
                        >
                          {rep.status ? rep.status.toUpperCase() : "PENDING"}
                        </span>
                      </div>

                      {rep.details && (
                        <p style={{ fontSize: "13px", color: "#334155", margin: "8px 0 6px 0", background: "#fff", padding: "8px 10px", borderRadius: "6px", border: "1px solid #f1f5f9" }}>
                          "{rep.details}"
                        </p>
                      )}

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "10px" }}>
                        <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                          Filed: {formatDate(rep.created_at)}
                        </span>

                        {isPending && (
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button
                              type="button"
                              disabled={submitting}
                              onClick={() => handleDismissReport(rep.id)}
                              style={{
                                background: "#f1f5f9",
                                color: "#475569",
                                border: "1px solid #cbd5e1",
                                padding: "4px 10px",
                                borderRadius: "6px",
                                fontSize: "12px",
                                fontWeight: "600",
                                cursor: "pointer",
                              }}
                            >
                              Dismiss Report
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #e2e8f0", paddingTop: "16px" }}>
              <button
                type="button"
                onClick={() => handleOpenDisableModal(reportsModalJob)}
                style={{
                  background: "#dc2626",
                  color: "#fff",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: "700",
                  cursor: "pointer",
                }}
              >
                🚫 Disable Job Listing
              </button>

              <button
                type="button"
                onClick={() => setReportsModalJob(null)}
                style={{
                  background: "#f1f5f9",
                  color: "#334155",
                  border: "1px solid #cbd5e1",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: FULL JOB DETAILS ─── */}
      {viewJobModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.6)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "16px",
              maxWidth: "700px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: "24px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
              <div>
                <h2 style={{ fontSize: "22px", fontWeight: "800", color: "#0f172a", margin: 0 }}>
                  {viewJobModal.title}
                </h2>
                <span style={{ fontSize: "14px", fontWeight: "700", color: "#2563eb" }}>
                  🏢 {viewJobModal.employer_info?.company_name || viewJobModal.company_name}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setViewJobModal(null)}
                style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#64748b" }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px", padding: "12px", background: "#f8fafc", borderRadius: "8px", fontSize: "13px" }}>
              <div>Employment Type: <strong>{viewJobModal.employment_type || "Full-time"}</strong></div>
              <div>Work Setup: <strong>{viewJobModal.work_setup || "On-site"}</strong></div>
              <div>Location: <strong>{viewJobModal.location || "Not specified"}</strong></div>
              <div>Salary Range: <strong>{viewJobModal.salary_range || "Not specified"}</strong></div>
              <div>Experience Required: <strong>{viewJobModal.experience_required || "Not specified"}</strong></div>
              <div>Posted Date: <strong>{formatDate(viewJobModal.created_at)}</strong></div>
            </div>

            {viewJobModal.required_skills && (
              <div style={{ marginBottom: "16px" }}>
                <span style={{ fontSize: "12px", fontWeight: "800", textTransform: "uppercase", color: "#64748b", display: "block", marginBottom: "6px" }}>
                  Required Skills
                </span>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {(typeof viewJobModal.required_skills === "string" ? viewJobModal.required_skills.split(",") : viewJobModal.required_skills).map((sk, idx) => (
                    <span
                      key={idx}
                      style={{
                        background: "#e0f2fe",
                        color: "#0369a1",
                        padding: "4px 10px",
                        borderRadius: "6px",
                        fontSize: "12px",
                        fontWeight: "600",
                      }}
                    >
                      {typeof sk === "string" ? sk.trim() : sk}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginBottom: "20px" }}>
              <span style={{ fontSize: "12px", fontWeight: "800", textTransform: "uppercase", color: "#64748b", display: "block", marginBottom: "6px" }}>
                Job Description
              </span>
              <div
                style={{
                  fontSize: "14px",
                  color: "#334155",
                  background: "#fff",
                  padding: "12px",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  whiteSpace: "pre-wrap",
                  lineHeight: "1.5",
                }}
              >
                {viewJobModal.description}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid #e2e8f0", paddingTop: "16px" }}>
              {viewJobModal.status === "open" && (
                <button
                  type="button"
                  onClick={() => handleOpenDisableModal(viewJobModal)}
                  style={{
                    background: "#dc2626",
                    color: "#fff",
                    border: "none",
                    padding: "8px 16px",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: "700",
                    cursor: "pointer",
                  }}
                >
                  🚫 Disable Job
                </button>
              )}

              {viewJobModal.status === "suspended" && (
                <button
                  type="button"
                  onClick={() => handleRestoreJob(viewJobModal)}
                  style={{
                    background: "#16a34a",
                    color: "#fff",
                    border: "none",
                    padding: "8px 16px",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: "700",
                    cursor: "pointer",
                  }}
                >
                  ✅ Restore Job
                </button>
              )}

              {viewJobModal.status === "pending_review" && (
                <>
                  <button
                    type="button"
                    onClick={() => handleApproveJob(viewJobModal)}
                    style={{
                      background: "#16a34a",
                      color: "#fff",
                      border: "none",
                      padding: "8px 16px",
                      borderRadius: "8px",
                      fontSize: "13px",
                      fontWeight: "700",
                      cursor: "pointer",
                    }}
                  >
                    ✓ Approve Job
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenRejectModal(viewJobModal)}
                    style={{
                      background: "#dc2626",
                      color: "#fff",
                      border: "none",
                      padding: "8px 16px",
                      borderRadius: "8px",
                      fontSize: "13px",
                      fontWeight: "700",
                      cursor: "pointer",
                    }}
                  >
                    ❌ Reject Job
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => setViewJobModal(null)}
                style={{
                  background: "#f1f5f9",
                  color: "#334155",
                  border: "1px solid #cbd5e1",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: VIEW EMPLOYER DETAILS ─── */}
      {viewEmployerModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.6)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "16px",
              maxWidth: "600px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: "24px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
              <div>
                <h2 style={{ fontSize: "20px", fontWeight: "800", color: "#0f172a", margin: 0 }}>
                  {viewEmployerModal.company_name}
                </h2>
                <span style={{ fontSize: "13px", color: "#64748b" }}>
                  Status:{" "}
                  <strong
                    style={{
                      color:
                        viewEmployerModal.verification_status === "Approved" ||
                        viewEmployerModal.verification_status === "Verified"
                          ? "#16a34a"
                          : "#b45309",
                    }}
                  >
                    {viewEmployerModal.verification_status}
                  </strong>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setViewEmployerModal(null)}
                style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#64748b" }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px", padding: "12px", background: "#f8fafc", borderRadius: "8px", fontSize: "13px" }}>
              <div>Contact Name: <strong>{viewEmployerModal.contact_name}</strong></div>
              <div>Contact Email: <strong>{viewEmployerModal.contact_email}</strong></div>
              <div>Location: <strong>{viewEmployerModal.location}</strong></div>
              <div>Industry: <strong>{viewEmployerModal.industry}</strong></div>
            </div>

            {/* Document Links */}
            <div style={{ padding: "12px", background: "#f5ecff", borderRadius: "8px", border: "1px solid #e9d5ff", marginBottom: "16px" }}>
              <span style={{ fontSize: "12px", fontWeight: "800", color: "#58158f", display: "block", marginBottom: "8px" }}>
                Verification Document Links
              </span>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {viewEmployerModal.id_image_url && (
                  <button
                    type="button"
                    onClick={() => handleAdminViewDoc(viewEmployerModal.id_image_url)}
                    style={{
                      background: "#fff",
                      color: "#58158f",
                      border: "1px solid #d8b4fe",
                      padding: "4px 10px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: "700",
                      cursor: "pointer",
                    }}
                  >
                    🔒 Government ID
                  </button>
                )}
                {viewEmployerModal.selfie_image_url && (
                  <button
                    type="button"
                    onClick={() => handleAdminViewDoc(viewEmployerModal.selfie_image_url)}
                    style={{
                      background: "#fff",
                      color: "#58158f",
                      border: "1px solid #d8b4fe",
                      padding: "4px 10px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: "700",
                      cursor: "pointer",
                    }}
                  >
                    🔒 Selfie with ID
                  </button>
                )}
                {viewEmployerModal.business_permit_url && (
                  <button
                    type="button"
                    onClick={() => handleAdminViewDoc(viewEmployerModal.business_permit_url)}
                    style={{
                      background: "#fff",
                      color: "#58158f",
                      border: "1px solid #d8b4fe",
                      padding: "4px 10px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: "700",
                      cursor: "pointer",
                    }}
                  >
                    🔒 Business Permit
                  </button>
                )}
                {viewEmployerModal.sec_registration_url && (
                  <button
                    type="button"
                    onClick={() => handleAdminViewDoc(viewEmployerModal.sec_registration_url)}
                    style={{
                      background: "#fff",
                      color: "#58158f",
                      border: "1px solid #d8b4fe",
                      padding: "4px 10px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: "700",
                      cursor: "pointer",
                    }}
                  >
                    🔒 SEC Registration
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", borderTop: "1px solid #e2e8f0", paddingTop: "16px" }}>
              <button
                type="button"
                onClick={() => setViewEmployerModal(null)}
                style={{
                  background: "#f1f5f9",
                  color: "#334155",
                  border: "1px solid #cbd5e1",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                Close Employer Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: REJECT LEGACY PENDING JOB ─── */}
      {rejectionModalJob && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.6)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "16px",
              padding: "24px",
              maxWidth: "500px",
              width: "100%",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
            }}
          >
            <h3 style={{ fontSize: "18px", fontWeight: "800", color: "#dc2626", margin: 0 }}>
              Reject Job Posting
            </h3>
            <p style={{ color: "#475569", fontSize: "14px", marginTop: "6px" }}>
              Target Job: <strong>"{rejectionModalJob.title}"</strong>
            </p>

            <div style={{ marginTop: "12px" }}>
              <label style={{ fontSize: "13px", fontWeight: "700", color: "#334155", display: "block", marginBottom: "6px" }}>
                Reason for Rejection <span style={{ color: "#dc2626" }}>* (Required)</span>
              </label>
              <textarea
                rows={4}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explain why this job post was rejected..."
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "14px",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}>
              <button
                type="button"
                onClick={() => setRejectionModalJob(null)}
                style={{
                  background: "#f1f5f9",
                  color: "#334155",
                  border: "1px solid #cbd5e1",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={submitting || !rejectionReason.trim()}
                onClick={handleConfirmRejection}
                style={{
                  background: !rejectionReason.trim() ? "#cbd5e1" : "#dc2626",
                  color: "#fff",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: "700",
                  cursor: !rejectionReason.trim() ? "not-allowed" : "pointer",
                }}
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
