import { useEffect, useState, useCallback } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { useToast } from "../../contexts/ToastContext";
import {
  fetchSuspendedAccounts,
  restoreCandidateAccount,
  restoreEmployerAccount,
  fetchEmployerJobs,
  displayUserName,
  normalizeAdminRole,
} from "../../services/adminService";

export default function SuspendedAccounts() {
  const toast = useToast();
  const [accounts, setAccounts] = useState([]);
  const [summary, setSummary] = useState({ total: 0, jobseekers: 0, employers: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [roleTab, setRoleTab] = useState("all"); // 'all' | 'jobseekers' | 'employers'
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Restore Modal State
  const [restoreModalAccount, setRestoreModalAccount] = useState(null);
  const [restoring, setRestoring] = useState(false);

  // Employer Jobs Modal State
  const [companyJobsModal, setCompanyJobsModal] = useState(null); // { account, jobs: [], loading: boolean }

  const loadSuspendedAccounts = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const res = await fetchSuspendedAccounts({
      search,
      roleFilter: roleTab,
      page,
      pageSize,
    });

    if (res.error) {
      setLoadError("Could not load suspended accounts. Please check your admin permissions.");
    }
    setAccounts(res.data || []);
    setTotalCount(res.totalCount || 0);
    setTotalPages(res.totalPages || 1);
    if (res.summary) {
      setSummary(res.summary);
    }
    setLoading(false);
  }, [search, roleTab, page, pageSize]);

  useEffect(() => {
    loadSuspendedAccounts();
  }, [loadSuspendedAccounts]);

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleTabChange = (tab) => {
    setRoleTab(tab);
    setPage(1);
  };

  // Restore handler calling authoritative existing services
  async function handleConfirmRestore() {
    if (!restoreModalAccount) return;
    setRestoring(true);

    const isEmployer = normalizeAdminRole(restoreModalAccount.role) === "Employer";
    let res;

    if (isEmployer) {
      res = await restoreEmployerAccount(
        restoreModalAccount.id,
        "Account reactivated by administrator from Suspended Accounts portal"
      );
    } else {
      res = await restoreCandidateAccount(
        restoreModalAccount.id,
        "Account reactivated by administrator from Suspended Accounts portal"
      );
    }

    setRestoring(false);

    if (res.error) {
      toast.error(`Failed to restore account: ${res.error.message}`);
      return;
    }

    if (isEmployer) {
      toast.success("✅ Employer account restored successfully.");
    } else {
      toast.success("✅ Candidate account restored successfully.");
    }

    setRestoreModalAccount(null);
    loadSuspendedAccounts();
  }

  // Open company jobs modal for suspended employers
  async function handleOpenCompanyJobs(account) {
    setCompanyJobsModal({ account, jobs: [], loading: true });
    const { data: jobs } = await fetchEmployerJobs(account.id);
    setCompanyJobsModal({ account, jobs: jobs || [], loading: false });
  }

  return (
    <DashboardLayout
      role="admin"
      title="Suspended Accounts"
      subtitle="Unified management and reactivation of suspended Jobseekers and Employers across SkillSync."
    >
      <div className="admin-page-container" style={{ padding: "24px" }}>
        {loadError && (
          <div
            style={{
              padding: "12px 16px",
              background: "#fee2e2",
              border: "1px solid #fca5a5",
              borderRadius: "8px",
              color: "#991b1b",
              fontSize: "13px",
              marginBottom: "20px",
            }}
          >
            {loadError}
          </div>
        )}

        {/* Top Summary Metrics Cards (Global counts independent of search/tabs) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              background: "#ffffff",
              padding: "16px 20px",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              borderLeft: "4px solid #dc2626",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "700", textTransform: "uppercase" }}>
              🚫 Total Suspended
            </span>
            <h3 style={{ fontSize: "24px", fontWeight: "800", color: "#dc2626", margin: "6px 0 0" }}>
              {summary.total}
            </h3>
            <span style={{ fontSize: "12px", color: "#64748b" }}>Accounts currently restricted</span>
          </div>

          <div
            style={{
              background: "#ffffff",
              padding: "16px 20px",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              borderLeft: "4px solid #8b18ff",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "700", textTransform: "uppercase" }}>
              👤 Jobseekers
            </span>
            <h3 style={{ fontSize: "24px", fontWeight: "800", color: "#8b18ff", margin: "6px 0 0" }}>
              {summary.jobseekers}
            </h3>
            <span style={{ fontSize: "12px", color: "#64748b" }}>Suspended candidates</span>
          </div>

          <div
            style={{
              background: "#ffffff",
              padding: "16px 20px",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              borderLeft: "4px solid #0284c7",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "700", textTransform: "uppercase" }}>
              🏢 Employers
            </span>
            <h3 style={{ fontSize: "24px", fontWeight: "800", color: "#0284c7", margin: "6px 0 0" }}>
              {summary.employers}
            </h3>
            <span style={{ fontSize: "12px", color: "#64748b" }}>Suspended company accounts</span>
          </div>
        </div>

        {/* Tab & Search Controls Bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            marginBottom: "20px",
            flexWrap: "wrap",
          }}
        >
          {/* Tabs */}
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={() => handleTabChange("all")}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "1px solid",
                borderColor: roleTab === "all" ? "#dc2626" : "#cbd5e1",
                background: roleTab === "all" ? "#fef2f2" : "#ffffff",
                color: roleTab === "all" ? "#dc2626" : "#475569",
                fontWeight: "700",
                fontSize: "13px",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              All ({summary.total})
            </button>
            <button
              type="button"
              onClick={() => handleTabChange("jobseekers")}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "1px solid",
                borderColor: roleTab === "jobseekers" ? "#8b18ff" : "#cbd5e1",
                background: roleTab === "jobseekers" ? "#faf5ff" : "#ffffff",
                color: roleTab === "jobseekers" ? "#8b18ff" : "#475569",
                fontWeight: "700",
                fontSize: "13px",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              Jobseekers ({summary.jobseekers})
            </button>
            <button
              type="button"
              onClick={() => handleTabChange("employers")}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "1px solid",
                borderColor: roleTab === "employers" ? "#0284c7" : "#cbd5e1",
                background: roleTab === "employers" ? "#f0f9ff" : "#ffffff",
                color: roleTab === "employers" ? "#0284c7" : "#475569",
                fontWeight: "700",
                fontSize: "13px",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              Employers ({summary.employers})
            </button>
          </div>

          {/* Search Input & Page Size */}
          <div style={{ display: "flex", gap: "10px", flex: "1", maxWidth: "450px", justifyContent: "flex-end" }}>
            <input
              type="text"
              placeholder="🔍 Search name, email, or company..."
              value={search}
              onChange={handleSearchChange}
              style={{
                flex: "1",
                padding: "8px 14px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                fontSize: "13px",
                outline: "none",
              }}
            />
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              style={{
                padding: "8px 12px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                fontSize: "13px",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              <option value={10}>10 / page</option>
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
            </select>
          </div>
        </div>

        {/* Suspended Accounts Table */}
        <div
          style={{
            background: "#fff",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", minWidth: "950px" }}>
              <thead>
                <tr
                  style={{
                    background: "#f8fafc",
                    borderBottom: "1px solid #e2e8f0",
                    fontSize: "12px",
                    textTransform: "uppercase",
                    color: "#64748b",
                    fontWeight: "700",
                  }}
                >
                  <th style={{ padding: "14px 16px" }}>User / Account</th>
                  <th style={{ padding: "14px 16px" }}>Account Type</th>
                  <th style={{ padding: "14px 16px" }}>Contact</th>
                  <th style={{ padding: "14px 16px" }}>Verification</th>
                  <th style={{ padding: "14px 16px" }}>Suspension Reason</th>
                  <th style={{ padding: "14px 16px" }}>Suspended Date</th>
                  <th style={{ padding: "14px 16px" }}>Admin Note</th>
                  <th style={{ padding: "14px 16px", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", padding: "36px", color: "#64748b" }}>
                      Loading suspended accounts...
                    </td>
                  </tr>
                ) : accounts.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
                      <div style={{ fontSize: "16px", fontWeight: "700", color: "#334155" }}>
                        {roleTab === "all"
                          ? "✅ No suspended accounts."
                          : roleTab === "jobseekers"
                          ? "No suspended Jobseekers."
                          : "No suspended Employers."}
                      </div>
                      <div style={{ fontSize: "13px", marginTop: "4px", color: "#64748b" }}>
                        All candidate and employer accounts in this category are active.
                      </div>
                    </td>
                  </tr>
                ) : (
                  accounts.map((acc) => {
                    const isEmployer = normalizeAdminRole(acc.role) === "Employer";
                    const displayName = isEmployer
                      ? acc.company_name || acc.full_name || displayUserName(acc)
                      : displayUserName(acc);

                    const formattedSuspendedDate = acc.suspended_at
                      ? new Date(acc.suspended_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "Not recorded";

                    return (
                      <tr
                        key={acc.id}
                        style={{
                          borderBottom: "1px solid #f1f5f9",
                          fontSize: "14px",
                          transition: "background 0.15s",
                        }}
                      >
                        {/* User Identity */}
                        <td style={{ padding: "14px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <div
                              style={{
                                width: "36px",
                                height: "36px",
                                borderRadius: "50%",
                                background: isEmployer
                                  ? "linear-gradient(135deg, #0284c7, #0369a1)"
                                  : "linear-gradient(135deg, #8b18ff, #58158f)",
                                color: "#fff",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: "700",
                                fontSize: "14px",
                              }}
                            >
                              {displayName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <strong style={{ display: "block", color: "#0f172a" }}>{displayName}</strong>
                              <span style={{ fontSize: "12px", color: "#64748b" }}>{acc.email}</span>
                            </div>
                          </div>
                        </td>

                        {/* Account Type Badge */}
                        <td style={{ padding: "14px 16px" }}>
                          <span
                            style={{
                              padding: "3px 8px",
                              borderRadius: "6px",
                              fontSize: "12px",
                              fontWeight: "700",
                              background: isEmployer ? "#e0f2fe" : "#f3e8ff",
                              color: isEmployer ? "#0369a1" : "#7e22ce",
                              border: `1px solid ${isEmployer ? "#bae6fd" : "#e9d5ff"}`,
                            }}
                          >
                            {isEmployer ? "🏢 Employer" : "👤 Jobseeker"}
                          </span>
                        </td>

                        {/* Contact */}
                        <td style={{ padding: "14px 16px", fontSize: "13px", color: "#475569" }}>
                          {acc.contact_number || "Not provided"}
                        </td>

                        {/* Verification Status */}
                        <td style={{ padding: "14px 16px" }}>
                          <span
                            style={{
                              padding: "3px 8px",
                              borderRadius: "12px",
                              fontSize: "11px",
                              fontWeight: "700",
                              background:
                                acc.verification_status === "Verified" || acc.verification_status === "Approved"
                                  ? "#dcfce7"
                                  : "#f1f5f9",
                              color:
                                acc.verification_status === "Verified" || acc.verification_status === "Approved"
                                  ? "#15803d"
                                  : "#64748b",
                            }}
                          >
                            {acc.verification_status || "Pending"}
                          </span>
                        </td>

                        {/* Public Suspension Reason */}
                        <td style={{ padding: "14px 16px" }}>
                          <span
                            style={{
                              padding: "4px 10px",
                              borderRadius: "12px",
                              fontSize: "12px",
                              fontWeight: "700",
                              background: "#fee2e2",
                              color: "#991b1b",
                              border: "1px solid #fca5a5",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            🚫 {acc.suspension_reason_label || "Administrative suspension"}
                          </span>
                        </td>

                        {/* Suspended Date */}
                        <td style={{ padding: "14px 16px", fontSize: "13px", color: "#475569", whiteSpace: "nowrap" }}>
                          {formattedSuspendedDate}
                        </td>

                        {/* Admin Moderation Note (from audit logs) */}
                        <td style={{ padding: "14px 16px", fontSize: "13px", color: "#64748b", maxWidth: "220px" }}>
                          {acc.internal_admin_note ? (
                            <span style={{ color: "#334155", fontStyle: "italic", background: "#f8fafc", padding: "4px 8px", borderRadius: "4px", display: "inline-block" }}>
                              "{acc.internal_admin_note}"
                            </span>
                          ) : (
                            <span style={{ color: "#94a3b8" }}>No internal note</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td style={{ padding: "14px 16px", textAlign: "right" }}>
                          <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", flexWrap: "wrap" }}>
                            {isEmployer && (
                              <button
                                type="button"
                                onClick={() => handleOpenCompanyJobs(acc)}
                                style={{
                                  background: "#f8fafc",
                                  color: "#1e293b",
                                  border: "1px solid #cbd5e1",
                                  padding: "6px 10px",
                                  borderRadius: "6px",
                                  fontSize: "12px",
                                  fontWeight: "600",
                                  cursor: "pointer",
                                }}
                              >
                                💼 Jobs ({acc.job_stats?.total || 0})
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => setRestoreModalAccount(acc)}
                              style={{
                                background: "#dcfce7",
                                color: "#166534",
                                border: "1px solid #bbf7d0",
                                padding: "6px 12px",
                                borderRadius: "6px",
                                fontSize: "12px",
                                fontWeight: "700",
                                cursor: "pointer",
                                transition: "all 0.15s",
                              }}
                            >
                              ✓ Restore Account
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Bar */}
          {totalPages > 1 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 16px",
                background: "#f8fafc",
                borderTop: "1px solid #e2e8f0",
                fontSize: "13px",
                color: "#64748b",
              }}
            >
              <span>
                Showing page {page} of {totalPages} ({totalCount} suspended accounts)
              </span>
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    background: page <= 1 ? "#f1f5f9" : "#fff",
                    color: page <= 1 ? "#94a3b8" : "#334155",
                    cursor: page <= 1 ? "not-allowed" : "pointer",
                  }}
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    background: page >= totalPages ? "#f1f5f9" : "#fff",
                    color: page >= totalPages ? "#94a3b8" : "#334155",
                    cursor: page >= totalPages ? "not-allowed" : "pointer",
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* RESTORE CONFIRMATION MODAL */}
        {restoreModalAccount && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(15, 23, 42, 0.6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
              padding: "20px",
            }}
          >
            <div
              style={{
                background: "#ffffff",
                borderRadius: "14px",
                maxWidth: "480px",
                width: "100%",
                padding: "24px",
                boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                <span style={{ fontSize: "24px" }}>✓</span>
                <h3 style={{ fontSize: "18px", fontWeight: "800", color: "#0f172a", margin: 0 }}>
                  Restore Account Access?
                </h3>
              </div>

              <p style={{ fontSize: "14px", color: "#475569", lineHeight: "1.5", margin: "0 0 16px" }}>
                Are you sure you want to restore access for{" "}
                <strong>
                  {normalizeAdminRole(restoreModalAccount.role) === "Employer"
                    ? restoreModalAccount.company_name || restoreModalAccount.full_name || displayUserName(restoreModalAccount)
                    : displayUserName(restoreModalAccount)}
                </strong>{" "}
                ({normalizeAdminRole(restoreModalAccount.role)})?
              </p>

              <div
                style={{
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: "8px",
                  padding: "12px",
                  fontSize: "13px",
                  color: "#166534",
                  marginBottom: "20px",
                }}
              >
                {normalizeAdminRole(restoreModalAccount.role) === "Employer" ? (
                  <>
                    <strong>Employer Reactivation:</strong> Existing jobs, applications, interviews, and hiring
                    records remain unchanged. Eligible open jobs will automatically become discoverable again for
                    candidates.
                  </>
                ) : (
                  <>
                    <strong>Candidate Reactivation:</strong> Existing applications, scheduled interviews, and
                    submitted resume records remain unchanged. Candidate can log in and apply for positions normally.
                  </>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  disabled={restoring}
                  onClick={() => setRestoreModalAccount(null)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    color: "#475569",
                    fontWeight: "600",
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={restoring}
                  onClick={handleConfirmRestore}
                  style={{
                    padding: "8px 18px",
                    borderRadius: "8px",
                    border: "none",
                    background: "#16a34a",
                    color: "#ffffff",
                    fontWeight: "700",
                    fontSize: "13px",
                    cursor: restoring ? "not-allowed" : "pointer",
                  }}
                >
                  {restoring ? "Restoring..." : "Restore Account"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* EMPLOYER JOBS MODAL */}
        {companyJobsModal && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(15, 23, 42, 0.6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
              padding: "20px",
            }}
          >
            <div
              style={{
                background: "#ffffff",
                borderRadius: "14px",
                maxWidth: "600px",
                width: "100%",
                padding: "24px",
                maxHeight: "80vh",
                overflowY: "auto",
                boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <div>
                  <h3 style={{ fontSize: "18px", fontWeight: "800", color: "#0f172a", margin: 0 }}>
                    💼 Company Job Postings
                  </h3>
                  <span style={{ fontSize: "13px", color: "#64748b" }}>
                    {companyJobsModal.account.company_name || companyJobsModal.account.full_name}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setCompanyJobsModal(null)}
                  style={{
                    background: "#f1f5f9",
                    border: "none",
                    borderRadius: "6px",
                    padding: "6px 10px",
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  ✕ Close
                </button>
              </div>

              {companyJobsModal.loading ? (
                <div style={{ textAlign: "center", padding: "24px", color: "#64748b" }}>
                  Loading company jobs...
                </div>
              ) : companyJobsModal.jobs.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px", color: "#64748b" }}>
                  No job postings found for this employer.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {companyJobsModal.jobs.map((job) => (
                    <div
                      key={job.id}
                      style={{
                        padding: "12px 16px",
                        borderRadius: "8px",
                        border: "1px solid #e2e8f0",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <strong style={{ display: "block", color: "#0f172a", fontSize: "14px" }}>{job.title}</strong>
                        <span style={{ fontSize: "12px", color: "#64748b" }}>
                          {job.employment_type || "Full-time"} • {job.location || "Remote"}
                        </span>
                      </div>
                      <span
                        style={{
                          padding: "3px 8px",
                          borderRadius: "10px",
                          fontSize: "11px",
                          fontWeight: "700",
                          background: job.status === "open" ? "#dcfce7" : "#f1f5f9",
                          color: job.status === "open" ? "#166534" : "#475569",
                        }}
                      >
                        {job.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
