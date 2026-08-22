import { useEffect, useState, useCallback } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { useToast } from "../../contexts/ToastContext";
import { supabase } from "../../services/supabase";
import {
  fetchAdminEmployers,
  fetchEmployerJobs,
  displayUserName,
  updateEmployerVerification,
  suspendEmployerAccount,
  restoreEmployerAccount,
  isAccountSuspended,
  SUSPENSION_REASON_OPTIONS,
  SUSPENSION_DURATION_PRESETS,
} from "../../services/adminService";

export default function ManageEmployers() {
  const toast = useToast();
  const [employers, setEmployers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Modals state
  const [actionModal, setActionModal] = useState(null); // { employer, targetStatus }
  const [suspendReason, setSuspendReason] = useState("policy_violation");
  const [suspendDuration, setSuspendDuration] = useState("indefinite");
  const [customDateTimeInput, setCustomDateTimeInput] = useState("");
  const [confirmedCustomDateTime, setConfirmedCustomDateTime] = useState("");
  const [customDateError, setCustomDateError] = useState("");
  const [suspendNotes, setSuspendNotes] = useState("");
  const [restoreModalEmployer, setRestoreModalEmployer] = useState(null); // employer object
  const [viewDetailsModal, setViewDetailsModal] = useState(null); // employer object
  const [companyJobsModal, setCompanyJobsModal] = useState(null); // { employer, jobs: [], loading: boolean }
  const [reasonInput, setReasonInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleConfirmCustomDate = () => {
    if (!customDateTimeInput) {
      setCustomDateError("Please select an expiry date and time.");
      return;
    }
    const d = new Date(customDateTimeInput);
    if (isNaN(d.getTime())) {
      setCustomDateError("Invalid date and time.");
      return;
    }
    if (d <= new Date()) {
      setCustomDateError("Expiry date and time must be in the future.");
      return;
    }
    setConfirmedCustomDateTime(customDateTimeInput);
    setCustomDateError("");
  };

  const handleCustomInputChange = (val) => {
    setCustomDateTimeInput(val);
    setConfirmedCustomDateTime(""); // Invalidate previous confirmation on change
    setCustomDateError("");
  };

  const handleCancelCustomDate = () => {
    setCustomDateTimeInput("");
    setConfirmedCustomDateTime("");
    setCustomDateError("");
  };

  const loadEmployers = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const res = await fetchAdminEmployers({
      search,
      status: statusFilter,
      page,
      pageSize,
    });

    if (res.error) {
      setLoadError("Could not load employers. Please check database permissions or SQL Editor migrations.");
    }
    setEmployers(res.data || []);
    setTotalCount(res.totalCount || 0);
    setTotalPages(res.totalPages || 1);
    setLoading(false);
  }, [search, statusFilter, page, pageSize]);

  useEffect(() => {
    loadEmployers();
  }, [loadEmployers]);

  async function handleAdminViewDoc(filePathOrUrl) {
    if (!filePathOrUrl) return;
    console.log("[AdminService] Requesting signed URL for:", filePathOrUrl);
    const { getPrivateDocumentSignedUrl } = await import("../../services/api");
    const { url, error } = await getPrivateDocumentSignedUrl(filePathOrUrl);
    if (error || !url) {
      toast.error("Could not load private document: " + (error?.message || "Access denied"));
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function handlePromptAction(employer, targetStatus) {
    if (targetStatus === "Approved" || targetStatus === "Verified") {
      executeStatusUpdate(employer.id, "Approved", "");
    } else {
      setActionModal({ employer, targetStatus });
      setReasonInput("");
    }
  }

  async function executeStatusUpdate(userId, newStatus) {
    setSubmitting(true);
    let res;
    if (newStatus === "Suspended") {
      if (suspendDuration === "custom" && !confirmedCustomDateTime) {
        toast.error("Please confirm a valid custom suspension expiry date and time.");
        setSubmitting(false);
        return;
      }
      res = await suspendEmployerAccount(userId, {
        reasonCode: suspendReason,
        durationPreset: suspendDuration,
        customDateTime: confirmedCustomDateTime || null,
        internalNote: suspendNotes,
      });
    } else {
      res = await updateEmployerVerification(userId, newStatus, reasonInput.trim());
    }
    setSubmitting(false);

    if (res.error) {
      toast.error("Failed to update employer status: " + res.error.message);
      return;
    }

    if (newStatus === "Suspended") {
      toast.success("🚫 Employer account suspended.");
      setSuspendNotes("");
      setSuspendDuration("indefinite");
      setCustomDateTimeInput("");
      setConfirmedCustomDateTime("");
      setCustomDateError("");
    } else {
      toast.success(`Employer status updated to "${newStatus}".`);
      setReasonInput("");
    }
    setActionModal(null);
    loadEmployers();
  }

  async function handleConfirmRestore() {
    if (!restoreModalEmployer) return;
    setSubmitting(true);
    const { error } = await restoreEmployerAccount(restoreModalEmployer.id, "Account reactivated by administrator");
    setSubmitting(false);

    if (error) {
      toast.error(`Failed to restore employer: ${error.message}`);
      return;
    }

    toast.success("✅ Employer account restored successfully.");
    setRestoreModalEmployer(null);
    loadEmployers();
  }

  async function handleOpenCompanyJobs(employer) {
    setCompanyJobsModal({ employer, jobs: [], loading: true });
    const { data: jobs } = await fetchEmployerJobs(employer.id);
    setCompanyJobsModal({ employer, jobs, loading: false });
  }

  async function handleRemoveEmployer(userId) {
    if (!window.confirm("Are you sure you want to remove this employer account?")) return;
    try {
      await supabase.from("profiles").delete().eq("id", userId);
      await supabase.auth.admin.deleteUser(userId);
    } catch (e) {
      console.warn("[ManageEmployers] Remove employer warning:", e?.message);
    }
    loadEmployers();
  }

  function formatDate(dateString) {
    if (!dateString) return "No date";
    return new Date(dateString).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  return (
    <DashboardLayout
      role="admin"
      title="Employer Management"
      subtitle="Manage employer accounts, verification documents, company details, and job posting activity."
    >
      <div className="admin-page-container" style={{ padding: "24px" }}>
        {/* Header Summary & Actions */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: "800", color: "#0f172a", margin: 0 }}>
              🏢 Employer Management
            </h1>
            <p style={{ color: "#64748b", fontSize: "14px", marginTop: "4px" }}>
              Verify identity documents, manage status approvals, and audit company job listings.
            </p>
          </div>

          <div style={{ background: "#f1f5f9", padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: "700", color: "#334155" }}>
            Total Employers: <span style={{ color: "#2563eb" }}>{totalCount}</span>
          </div>
        </div>

        {loadError && (
          <div style={{ padding: "12px 16px", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: "8px", color: "#991b1b", fontSize: "13px", marginBottom: "16px" }}>
            {loadError}
          </div>
        )}

        {/* Filter Controls Bar */}
        <div style={{ display: "flex", gap: "12px", marginBottom: "20px", flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="text"
            placeholder="🔍 Search company name, contact, or email..."
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

          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {["All", "Pending", "Approved", "Rejected"].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => {
                  setStatusFilter(st);
                  setPage(1);
                }}
                style={{
                  padding: "8px 14px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: "700",
                  border: statusFilter === st ? "none" : "1px solid #cbd5e1",
                  background: statusFilter === st ? "#2563eb" : "#fff",
                  color: statusFilter === st ? "#fff" : "#475569",
                  cursor: "pointer",
                }}
              >
                {st}
              </button>
            ))}
          </div>

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

        {/* Employers List */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#64748b", background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
            Loading employer profiles...
          </div>
        ) : employers.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#64748b", background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
            No employer accounts found matching search or filter criteria.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {employers.map((employer) => {
              const isSuspended = isAccountSuspended(employer);
              const status = employer.verification_status || "Pending";
              const isApproved = status === "Approved" || status === "Verified";
              const docCount = [employer.id_image_url, employer.selfie_image_url, employer.business_permit_url, employer.sec_registration_url].filter(Boolean).length;
              const stats = employer.job_stats || { total: 0, open: 0, pending: 0, rejected: 0, closed: 0 };

              return (
                <div
                  key={employer.id}
                  style={{
                    background: "#fff",
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    padding: "20px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <h3 style={{ fontSize: "18px", fontWeight: "800", color: "#0f172a", margin: 0 }}>
                          {employer.company_name}
                        </h3>
                        <span
                          style={{
                            padding: "4px 10px",
                            borderRadius: "12px",
                            fontSize: "12px",
                            fontWeight: "700",
                            background: isSuspended ? "#fee2e2" : isApproved ? "#dcfce7" : status === "Rejected" ? "#fee2e2" : "#fef3c7",
                            color: isSuspended ? "#991b1b" : isApproved ? "#15803d" : status === "Rejected" ? "#dc2626" : "#b45309",
                            border: `1px solid ${isSuspended ? "#fca5a5" : isApproved ? "#bbf7d0" : status === "Rejected" ? "#fca5a5" : "#fde68a"}`
                          }}
                        >
                          {isSuspended ? "🔴 Suspended" : isApproved ? "✓ Approved" : status === "Rejected" ? "❌ Rejected" : "⏳ Pending Verification"}
                        </span>
                      </div>

                      <div style={{ color: "#64748b", fontSize: "13px", marginTop: "4px" }}>
                        Employer Contact: <strong>{displayUserName(employer)}</strong> ({employer.email})
                      </div>
                    </div>

                    {/* Job Posting Statistics Badge */}
                    <div style={{ background: "#f8fafc", padding: "8px 14px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "12px", color: "#334155" }}>
                      <span style={{ fontWeight: "800", color: "#0f172a", display: "block", marginBottom: "2px" }}>
                        💼 Job Statistics: {stats.total} Total Posted
                      </span>
                      <span style={{ color: "#16a34a", fontWeight: "700" }}>{stats.open} Active</span> •{" "}
                      <span style={{ color: "#d97706", fontWeight: "700" }}>{stats.pending} Pending</span> •{" "}
                      <span style={{ color: "#dc2626", fontWeight: "700" }}>{stats.rejected} Rejected</span>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", marginTop: "14px", fontSize: "13px", color: "#475569" }}>
                    <div>Industry: <strong>{employer.industry}</strong></div>
                    <div>Location: <strong>{employer.location}</strong></div>
                    <div>Phone: <strong>{employer.contact_number || "Not provided"}</strong></div>
                    <div>Registered: <strong>{formatDate(employer.created_at)}</strong></div>
                  </div>

                  {/* Verification Documents Review Section */}
                  {docCount > 0 && (
                    <div style={{ marginTop: "14px", padding: "12px 14px", background: "#f5ecff", borderRadius: "8px", border: "1px solid #e9d5ff" }}>
                      <span style={{ fontSize: "12px", fontWeight: "800", color: "#58158f", display: "block", marginBottom: "8px" }}>
                        🛡️ Employer Verification Documents ({docCount}/4 uploaded)
                      </span>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {employer.id_image_url && (
                          <button type="button" onClick={() => handleAdminViewDoc(employer.id_image_url)} style={{ background: "#fff", color: "#58158f", border: "1px solid #d8b4fe", padding: "5px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>
                            🔒 Government ID
                          </button>
                        )}
                        {employer.selfie_image_url && (
                          <button type="button" onClick={() => handleAdminViewDoc(employer.selfie_image_url)} style={{ background: "#fff", color: "#58158f", border: "1px solid #d8b4fe", padding: "5px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>
                            🔒 Selfie with ID
                          </button>
                        )}
                        {employer.business_permit_url && (
                          <button type="button" onClick={() => handleAdminViewDoc(employer.business_permit_url)} style={{ background: "#fff", color: "#58158f", border: "1px solid #d8b4fe", padding: "5px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>
                            🔒 Business Permit
                          </button>
                        )}
                        {employer.sec_registration_url && (
                          <button type="button" onClick={() => handleAdminViewDoc(employer.sec_registration_url)} style={{ background: "#fff", color: "#58158f", border: "1px solid #d8b4fe", padding: "5px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>
                            🔒 SEC Registration
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Actions Toolbar */}
                  <div style={{ display: "flex", gap: "8px", marginTop: "16px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => setViewDetailsModal(employer)}
                      style={{ background: "#f1f5f9", color: "#1e293b", border: "1px solid #cbd5e1", padding: "6px 12px", borderRadius: "6px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}
                    >
                      👁 View Details
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenCompanyJobs(employer)}
                      style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", padding: "6px 12px", borderRadius: "6px", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}
                    >
                      💼 View Company Jobs ({stats.total})
                    </button>

                    {!isSuspended && !isApproved && (
                      <button
                        type="button"
                        onClick={() => handlePromptAction(employer, "Approved")}
                        style={{ background: "#16a34a", color: "#fff", border: "none", padding: "6px 12px", borderRadius: "6px", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}
                      >
                        ✓ Approve Employer
                      </button>
                    )}

                    {!isSuspended && status !== "Rejected" && (
                      <button
                        type="button"
                        onClick={() => handlePromptAction(employer, "Rejected")}
                        style={{ background: "#dc2626", color: "#fff", border: "none", padding: "6px 12px", borderRadius: "6px", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}
                      >
                        ❌ Reject
                      </button>
                    )}

                    {isSuspended ? (
                      <button
                        type="button"
                        onClick={() => setRestoreModalEmployer(employer)}
                        style={{ background: "#16a34a", color: "#fff", border: "none", padding: "6px 12px", borderRadius: "6px", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}
                      >
                        ✓ Restore Account
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handlePromptAction(employer, "Suspended")}
                        style={{ background: "#475569", color: "#fff", border: "none", padding: "6px 12px", borderRadius: "6px", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}
                      >
                        🚫 Suspend Account
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Pagination Controls */}
            <div style={{ padding: "14px 16px", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px", color: "#64748b" }}>
              <div>
                Showing {employers.length > 0 ? (page - 1) * pageSize + 1 : 0} to {Math.min(page * pageSize, totalCount)} of {totalCount} employers
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
        )}
      </div>

      {/* Moderation Status Note Modal */}
      {actionModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15, 23, 42, 0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 }}>
          <div style={{ background: "#fff", borderRadius: "16px", padding: "24px", maxWidth: "500px", width: "90%", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
            <h3 style={{ fontSize: "18px", fontWeight: "800", color: "#0f172a", margin: 0 }}>
              {actionModal.targetStatus === "Rejected" ? "❌ Reject Employer Verification" : "🚫 Suspend Employer Account"}
            </h3>
            <p style={{ color: "#64748b", fontSize: "14px", marginTop: "6px" }}>
              {actionModal.targetStatus === "Rejected"
                ? `Provide feedback for rejecting ${actionModal.employer.company_name}:`
                : `Suspend ${actionModal.employer.company_name}. This will hide open jobs and pause recruitment workflows while keeping data intact.`}
            </p>

            {actionModal.targetStatus === "Suspended" ? (
              <>
                <div style={{ marginTop: "12px", marginBottom: "12px" }}>
                  <label style={{ fontSize: "12px", fontWeight: "700", color: "#334155", display: "block", marginBottom: "4px" }}>
                    Suspension Reason (Public / User-Facing Category): *
                  </label>
                  <select
                    value={suspendReason}
                    onChange={(e) => setSuspendReason(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px", background: "#fff" }}
                  >
                    {SUSPENSION_REASON_OPTIONS.map((opt) => (
                      <option key={opt.code} value={opt.code}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: "12px" }}>
                  <label style={{ fontSize: "12px", fontWeight: "700", color: "#334155", display: "block", marginBottom: "4px" }}>
                    Suspension Duration (Automatic Expiry): *
                  </label>
                  <select
                    value={suspendDuration}
                    onChange={(e) => setSuspendDuration(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px", background: "#fff" }}
                  >
                    {SUSPENSION_DURATION_PRESETS.map((preset) => (
                      <option key={preset.code} value={preset.code}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </div>

                {suspendDuration === "custom" && (
                  <div style={{ marginBottom: "12px", background: "#f8fafc", padding: "14px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
                    <label style={{ fontSize: "12px", fontWeight: "700", color: "#334155", display: "block", marginBottom: "6px" }}>
                      Select Expiry Date &amp; Time: *
                    </label>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                      <input
                        type="datetime-local"
                        value={customDateTimeInput}
                        min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                        onChange={(e) => handleCustomInputChange(e.target.value)}
                        style={{
                          flex: "1",
                          minWidth: "200px",
                          padding: "8px 12px",
                          borderRadius: "6px",
                          border: customDateError ? "1px solid #ef4444" : "1px solid #cbd5e1",
                          fontSize: "13px",
                          boxSizing: "border-box",
                          background: "#fff"
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleConfirmCustomDate}
                        disabled={!customDateTimeInput || confirmedCustomDateTime === customDateTimeInput}
                        style={{
                          background: confirmedCustomDateTime === customDateTimeInput ? "#16a34a" : "#2563eb",
                          color: "#fff",
                          border: "none",
                          padding: "8px 14px",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: "700",
                          cursor: (!customDateTimeInput || confirmedCustomDateTime === customDateTimeInput) ? "default" : "pointer",
                          whiteSpace: "nowrap",
                          opacity: !customDateTimeInput ? 0.6 : 1
                        }}
                      >
                        {confirmedCustomDateTime === customDateTimeInput ? "✓ Confirmed" : "Use This Date & Time"}
                      </button>
                      {customDateTimeInput && (
                        <button
                          type="button"
                          onClick={handleCancelCustomDate}
                          style={{
                            background: "#f1f5f9",
                            color: "#475569",
                            border: "1px solid #cbd5e1",
                            padding: "8px 10px",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: "600",
                            cursor: "pointer"
                          }}
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    {customDateError && (
                      <p style={{ margin: "6px 0 0", color: "#dc2626", fontSize: "12px", fontWeight: "600" }}>
                        ⚠️ {customDateError}
                      </p>
                    )}

                    {confirmedCustomDateTime && (
                      <div style={{ marginTop: "8px", padding: "8px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "6px", fontSize: "12px", color: "#166534" }}>
                        <strong>✓ Confirmed Custom Expiry:</strong> {new Date(confirmedCustomDateTime).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    )}
                    {!confirmedCustomDateTime && customDateTimeInput && !customDateError && (
                      <p style={{ margin: "6px 0 0", color: "#d97706", fontSize: "11px", fontWeight: "600" }}>
                        👉 Click &ldquo;Use This Date &amp; Time&rdquo; to confirm your selected expiry.
                      </p>
                    )}
                  </div>
                )}

                <div style={{ marginBottom: "14px" }}>
                  <label style={{ fontSize: "12px", fontWeight: "700", color: "#334155", display: "block", marginBottom: "4px" }}>
                    Internal Moderation Note (Admin Only — Private):
                  </label>
                  <textarea
                    rows={3}
                    value={suspendNotes}
                    onChange={(e) => setSuspendNotes(e.target.value)}
                    placeholder="Optional internal administrative notes (never visible to employer)..."
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px", boxSizing: "border-box" }}
                  />
                </div>
              </>
            ) : (
              <div style={{ marginTop: "12px", marginBottom: "14px" }}>
                <label style={{ fontSize: "12px", fontWeight: "700", color: "#334155", display: "block", marginBottom: "4px" }}>
                  Rejection Reason (Required Feedback to Employer): *
                </label>
                <textarea
                  rows={3}
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  placeholder="e.g. Business permit document is blurry or illegible. Please upload a clear valid copy."
                  style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px", outline: "none", boxSizing: "border-box" }}
                />
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}>
              <button
                type="button"
                onClick={() => {
                  setActionModal(null);
                  setReasonInput("");
                  setSuspendNotes("");
                  setSuspendDuration("indefinite");
                  setCustomDateTimeInput("");
                  setConfirmedCustomDateTime("");
                  setCustomDateError("");
                }}
                style={{ background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1", padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  submitting ||
                  (actionModal.targetStatus === "Rejected" && !reasonInput.trim()) ||
                  (actionModal.targetStatus === "Suspended" && suspendDuration === "custom" && !confirmedCustomDateTime)
                }
                onClick={() => executeStatusUpdate(actionModal.employer.id, actionModal.targetStatus)}
                style={{
                  background: (submitting || (actionModal.targetStatus === "Rejected" && !reasonInput.trim()) || (actionModal.targetStatus === "Suspended" && suspendDuration === "custom" && !confirmedCustomDateTime)) ? "#fca5a5" : "#dc2626",
                  color: "#fff",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: "700",
                  cursor: (submitting || (actionModal.targetStatus === "Rejected" && !reasonInput.trim()) || (actionModal.targetStatus === "Suspended" && suspendDuration === "custom" && !confirmedCustomDateTime)) ? "not-allowed" : "pointer"
                }}
              >
                {submitting ? "Updating..." : `Confirm ${actionModal.targetStatus}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Employer Account Confirmation Modal */}
      {restoreModalEmployer && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15, 23, 42, 0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 }}>
          <div style={{ background: "#fff", borderRadius: "16px", padding: "24px", maxWidth: "480px", width: "90%", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
            <h3 style={{ fontSize: "18px", fontWeight: "800", color: "#0f172a", margin: 0 }}>
              Restore Employer Account?
            </h3>
            <p style={{ color: "#475569", fontSize: "14px", marginTop: "8px", lineHeight: "1.5" }}>
              This employer (<strong>{restoreModalEmployer.company_name}</strong>) will regain access to SkillSync.
            </p>
            <p style={{ color: "#64748b", fontSize: "13px", marginTop: "4px" }}>
              Existing jobs, applications, interviews, and hiring records will remain unchanged.
            </p>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
              <button
                type="button"
                onClick={() => setRestoreModalEmployer(null)}
                style={{ background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1", padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirmRestore}
                style={{ background: "#16a34a", color: "#fff", border: "none", padding: "8px 18px", borderRadius: "8px", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}
              >
                {submitting ? "Restoring..." : "Restore Account"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Company Details Overview Modal */}
      {viewDetailsModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15, 23, 42, 0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000, padding: "20px" }}>
          <div style={{ background: "#fff", borderRadius: "16px", maxWidth: "600px", width: "100%", maxHeight: "90vh", overflowY: "auto", padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
              <div>
                <h2 style={{ fontSize: "20px", fontWeight: "800", color: "#0f172a", margin: 0 }}>
                  {viewDetailsModal.company_name}
                </h2>
                <span style={{ fontSize: "13px", color: "#64748b" }}>Registered {formatDate(viewDetailsModal.created_at)}</span>
              </div>
              <button type="button" onClick={() => setViewDetailsModal(null)} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#64748b" }}>
                ✕
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px", padding: "12px", background: "#f8fafc", borderRadius: "8px", fontSize: "13px" }}>
              <div>Industry: <strong>{viewDetailsModal.industry}</strong></div>
              <div>Company Size: <strong>{viewDetailsModal.company_size}</strong></div>
              <div>Location: <strong>{viewDetailsModal.location}</strong></div>
              <div>Website: <strong>{viewDetailsModal.website || "Not provided"}</strong></div>
              <div>Contact Name: <strong>{displayUserName(viewDetailsModal)}</strong></div>
              <div>Contact Email: <strong>{viewDetailsModal.contact_email || viewDetailsModal.email}</strong></div>
            </div>

            {viewDetailsModal.about && (
              <div style={{ marginBottom: "16px" }}>
                <span style={{ fontSize: "12px", fontWeight: "800", textTransform: "uppercase", color: "#64748b", display: "block", marginBottom: "4px" }}>About Company</span>
                <p style={{ fontSize: "13px", color: "#334155", background: "#fff", padding: "10px", border: "1px solid #e2e8f0", borderRadius: "6px", margin: 0 }}>
                  {viewDetailsModal.about}
                </p>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", borderTop: "1px solid #e2e8f0", paddingTop: "16px" }}>
              <button type="button" onClick={() => setViewDetailsModal(null)} style={{ background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1", padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}>
                Close Overview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Company Jobs Listing Modal */}
      {companyJobsModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15, 23, 42, 0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000, padding: "20px" }}>
          <div style={{ background: "#fff", borderRadius: "16px", maxWidth: "750px", width: "100%", maxHeight: "90vh", overflowY: "auto", padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
              <div>
                <h2 style={{ fontSize: "20px", fontWeight: "800", color: "#0f172a", margin: 0 }}>
                  Jobs Posted by {companyJobsModal.employer.company_name}
                </h2>
                <span style={{ fontSize: "13px", color: "#64748b" }}>Total Listings: {companyJobsModal.jobs.length}</span>
              </div>
              <button type="button" onClick={() => setCompanyJobsModal(null)} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#64748b" }}>
                ✕
              </button>
            </div>

            {companyJobsModal.loading ? (
              <div style={{ padding: "32px", textAlign: "center", color: "#64748b" }}>Loading company jobs...</div>
            ) : companyJobsModal.jobs.length === 0 ? (
              <div style={{ padding: "32px", textAlign: "center", color: "#64748b" }}>No jobs posted by this employer yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {companyJobsModal.jobs.map((job) => (
                  <div key={job.id} style={{ padding: "12px 16px", border: "1px solid #e2e8f0", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <strong style={{ color: "#0f172a", fontSize: "15px", display: "block" }}>{job.title}</strong>
                      <span style={{ fontSize: "12px", color: "#64748b" }}>
                        {job.employment_type} • {job.location || "Not specified"} • Posted {formatDate(job.created_at)}
                      </span>
                    </div>

                    <span
                      style={{
                        padding: "4px 10px",
                        borderRadius: "12px",
                        fontSize: "12px",
                        fontWeight: "700",
                        background: job.status === "open" ? "#dcfce7" : job.status === "rejected" ? "#fee2e2" : job.status === "pending_review" ? "#fef3c7" : "#f1f5f9",
                        color: job.status === "open" ? "#15803d" : job.status === "rejected" ? "#dc2626" : job.status === "pending_review" ? "#b45309" : "#475569",
                      }}
                    >
                      {job.status === "open" ? "Active" : job.status === "rejected" ? "Rejected" : job.status === "pending_review" ? "Pending Review" : "Closed"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", borderTop: "1px solid #e2e8f0", paddingTop: "16px", marginTop: "20px" }}>
              <button type="button" onClick={() => setCompanyJobsModal(null)} style={{ background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1", padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}>
                Close Jobs List
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}