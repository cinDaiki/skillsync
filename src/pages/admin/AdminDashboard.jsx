import { Link } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  fetchAdminDashboardStats,
  fetchAttentionRequiredStats,
  fetchAdminAuditLogs,
  exportPlatformSummaryCSV,
  exportJobsReportCSV,
  exportUsersReportCSV,
} from "../../services/adminService";

export default function AdminDashboard() {
  const [platformStats, setPlatformStats] = useState({
    jobSeekers: 0,
    employers: 0,
    totalJobs: 0,
    openJobs: 0,
    closedJobs: 0,
    totalApplications: 0,
  });

  const [attentionStats, setAttentionStats] = useState({
    pendingEmployers: 0,
    reportedJobs: 0,
    suspendedAccounts: 0,
    pendingAppeals: 0,
  });

  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportMenuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target)) {
        setExportMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    setLoading(true);
    setLoadError("");

    try {
      const [platformRes, attentionRes, auditRes] = await Promise.all([
        fetchAdminDashboardStats(),
        fetchAttentionRequiredStats(),
        fetchAdminAuditLogs({ page: 1, pageSize: 12 }),
      ]);

      if (platformRes.data) {
        setPlatformStats(platformRes.data);
      }
      if (attentionRes.data) {
        setAttentionStats(attentionRes.data);
      }
      setAuditLogs(auditRes.data || []);
    } catch (err) {
      console.error("[AdminDashboard] Load error:", err);
      setLoadError("Failed to load dashboard metrics. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateString) {
    if (!dateString) return "Just now";
    return new Date(dateString).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getActionBadge(action) {
    const act = (action || "").toUpperCase();
    let bg = "#f1f5f9";
    let color = "#475569";

    if (act.includes("APPROVED") || act.includes("RESTORED")) {
      bg = "#dcfce7";
      color = "#15803d";
    } else if (act.includes("REJECTED") || act.includes("ACTIONED")) {
      bg = "#fee2e2";
      color = "#b91c1c";
    } else if (act.includes("SUSPENDED")) {
      bg = "#450a0a";
      color = "#ffffff";
    } else if (act.includes("DISMISSED")) {
      bg = "#f3f4f6";
      color = "#4b5563";
    }

    return (
      <span
        style={{
          padding: "3px 8px",
          borderRadius: "10px",
          fontSize: "11px",
          fontWeight: "700",
          background: bg,
          color: color,
        }}
      >
        {action}
      </span>
    );
  }

  return (
    <DashboardLayout
      role="admin"
      title="Admin Dashboard"
      subtitle="Overview of platform metrics, moderation queue, and security activity."
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

        {/* ─── PLATFORM SUMMARY SECTION (Merged from Reports) ─── */}
        <div style={{ marginBottom: "28px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              marginBottom: "14px",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: "13px",
                  fontWeight: "800",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#64748b",
                  margin: "0 0 4px 0",
                }}
              >
                Platform Summary
              </h2>
              <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0 }}>
                Live metrics across registered users, job listings, and candidate applications.
              </p>
            </div>

            <div
              ref={exportMenuRef}
              style={{ position: "relative", display: "flex", gap: "8px", alignItems: "center" }}
            >
              <button
                type="button"
                id="admin-dashboard-export-csv-btn"
                disabled={exporting}
                onClick={() => setExportMenuOpen(!exportMenuOpen)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "7px 14px",
                  background: "#ffffff",
                  color: "#0f172a",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: "600",
                  cursor: exporting ? "not-allowed" : "pointer",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                  transition: "all 0.15s ease",
                }}
              >
                <span>📥</span> Export CSV ▾
              </button>

              <Link
                to="/admin/reports"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "7px 12px",
                  background: "#f8fafc",
                  color: "#475569",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: "600",
                  textDecoration: "none",
                }}
              >
                <span>↗</span> Detailed Reports
              </Link>

              {exportMenuOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    right: 0,
                    marginTop: "6px",
                    background: "#ffffff",
                    borderRadius: "10px",
                    boxShadow: "0 10px 25px -5px rgba(0,0,0,0.15), 0 0 1px 1px rgba(0,0,0,0.05)",
                    border: "1px solid #e2e8f0",
                    padding: "6px",
                    zIndex: 50,
                    minWidth: "230px",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      exportPlatformSummaryCSV(platformStats);
                      setExportMenuOpen(false);
                    }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 12px",
                      background: "none",
                      border: "none",
                      borderRadius: "6px",
                      fontSize: "13px",
                      color: "#1e293b",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                  >
                    📊 <span>Platform Summary (CSV)</span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      setExporting(true);
                      setExportMenuOpen(false);
                      await exportJobsReportCSV();
                      setExporting(false);
                    }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 12px",
                      background: "none",
                      border: "none",
                      borderRadius: "6px",
                      fontSize: "13px",
                      color: "#1e293b",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                  >
                    💼 <span>Job Listings Report (CSV)</span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      setExporting(true);
                      setExportMenuOpen(false);
                      await exportUsersReportCSV();
                      setExporting(false);
                    }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 12px",
                      background: "none",
                      border: "none",
                      borderRadius: "6px",
                      fontSize: "13px",
                      color: "#1e293b",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                  >
                    👥 <span>Users Directory (CSV)</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "14px",
            }}
          >
            {/* 1. Job Seekers */}
            <Link
              to="/admin/users?role=candidate"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div
                style={{
                  background: "#fff",
                  padding: "18px 20px",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  transition: "transform 0.15s ease, box-shadow 0.15s ease",
                }}
              >
                <span style={{ fontSize: "28px" }}>👥</span>
                <div>
                  <div style={{ fontSize: "26px", fontWeight: "800", color: "#0f172a", lineHeight: 1.1 }}>
                    {loading ? "..." : platformStats.jobSeekers}
                  </div>
                  <div style={{ fontSize: "12px", color: "#64748b", fontWeight: "600", marginTop: "2px" }}>
                    Job Seekers
                  </div>
                </div>
              </div>
            </Link>

            {/* 2. Employers */}
            <Link
              to="/admin/employers"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div
                style={{
                  background: "#fff",
                  padding: "18px 20px",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                }}
              >
                <span style={{ fontSize: "28px" }}>▤</span>
                <div>
                  <div style={{ fontSize: "26px", fontWeight: "800", color: "#0f172a", lineHeight: 1.1 }}>
                    {loading ? "..." : platformStats.employers}
                  </div>
                  <div style={{ fontSize: "12px", color: "#64748b", fontWeight: "600", marginTop: "2px" }}>
                    Employers
                  </div>
                </div>
              </div>
            </Link>

            {/* 3. Total Job Posts */}
            <Link
              to="/admin/jobs"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div
                style={{
                  background: "#fff",
                  padding: "18px 20px",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                }}
              >
                <span style={{ fontSize: "28px" }}>▣</span>
                <div>
                  <div style={{ fontSize: "26px", fontWeight: "800", color: "#0f172a", lineHeight: 1.1 }}>
                    {loading ? "..." : platformStats.totalJobs}
                  </div>
                  <div style={{ fontSize: "12px", color: "#64748b", fontWeight: "600", marginTop: "2px" }}>
                    Total Job Posts
                  </div>
                </div>
              </div>
            </Link>

            {/* 4. Open Jobs */}
            <Link
              to="/admin/jobs?status=open"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div
                style={{
                  background: "#fff",
                  padding: "18px 20px",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                }}
              >
                <span style={{ fontSize: "28px" }}>◎</span>
                <div>
                  <div style={{ fontSize: "26px", fontWeight: "800", color: "#16a34a", lineHeight: 1.1 }}>
                    {loading ? "..." : platformStats.openJobs}
                  </div>
                  <div style={{ fontSize: "12px", color: "#64748b", fontWeight: "600", marginTop: "2px" }}>
                    Open Jobs
                  </div>
                </div>
              </div>
            </Link>

            {/* 5. Closed Jobs */}
            <Link
              to="/admin/jobs?status=closed"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div
                style={{
                  background: "#fff",
                  padding: "18px 20px",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                }}
              >
                <span style={{ fontSize: "28px" }}>□</span>
                <div>
                  <div style={{ fontSize: "26px", fontWeight: "800", color: "#64748b", lineHeight: 1.1 }}>
                    {loading ? "..." : platformStats.closedJobs}
                  </div>
                  <div style={{ fontSize: "12px", color: "#64748b", fontWeight: "600", marginTop: "2px" }}>
                    Closed Jobs
                  </div>
                </div>
              </div>
            </Link>

            {/* 6. Total Applications */}
            <Link
              to="/admin/applications"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div
                style={{
                  background: "#fff",
                  padding: "18px 20px",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                }}
              >
                <span style={{ fontSize: "28px" }}>↗</span>
                <div>
                  <div style={{ fontSize: "26px", fontWeight: "800", color: "#2563eb", lineHeight: 1.1 }}>
                    {loading ? "..." : platformStats.totalApplications}
                  </div>
                  <div style={{ fontSize: "12px", color: "#64748b", fontWeight: "600", marginTop: "2px" }}>
                    Total Applications
                  </div>
                </div>
              </div>
            </Link>
          </div>
        </div>

        {/* ─── ATTENTION REQUIRED SECTION ─── */}
        <div style={{ marginBottom: "28px" }}>
          <div style={{ marginBottom: "12px" }}>
            <h2
              style={{
                fontSize: "13px",
                fontWeight: "800",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#92400e",
                margin: "0 0 4px 0",
              }}
            >
              Attention Required
            </h2>
            <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0 }}>
              Actionable moderation items awaiting administrator review and resolution.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "14px",
            }}
          >
            {/* 1. Pending Employer Verifications */}
            <Link
              to="/admin/employers?status=pending"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div
                style={{
                  background: "#fffbeb",
                  border: "1px solid #fde68a",
                  borderRadius: "12px",
                  padding: "16px 18px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <strong style={{ fontSize: "14px", color: "#92400e", display: "block" }}>
                    🏢 Pending Employer Verifications
                  </strong>
                  <span style={{ fontSize: "12px", color: "#b45309", marginTop: "2px", display: "block" }}>
                    Review business credentials & IDs
                  </span>
                </div>
                <span
                  style={{
                    background: "#d97706",
                    color: "#fff",
                    padding: "4px 10px",
                    borderRadius: "12px",
                    fontSize: "13px",
                    fontWeight: "800",
                  }}
                >
                  {loading ? "..." : attentionStats.pendingEmployers}
                </span>
              </div>
            </Link>

            {/* 2. Reported Job Posts */}
            <Link
              to="/admin/jobs?status=reported"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div
                style={{
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: "12px",
                  padding: "16px 18px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <strong style={{ fontSize: "14px", color: "#991b1b", display: "block" }}>
                    🚩 Reported Job Posts
                  </strong>
                  <span style={{ fontSize: "12px", color: "#dc2626", marginTop: "2px", display: "block" }}>
                    Investigate candidate abuse flags
                  </span>
                </div>
                <span
                  style={{
                    background: "#dc2626",
                    color: "#fff",
                    padding: "4px 10px",
                    borderRadius: "12px",
                    fontSize: "13px",
                    fontWeight: "800",
                  }}
                >
                  {loading ? "..." : attentionStats.reportedJobs}
                </span>
              </div>
            </Link>

            {/* 3. Suspended Accounts */}
            <Link
              to="/admin/suspended-accounts"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div
                style={{
                  background: "#faf5ff",
                  border: "1px solid #e9d5ff",
                  borderRadius: "12px",
                  padding: "16px 18px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <strong style={{ fontSize: "14px", color: "#6b21a8", display: "block" }}>
                    🚫 Suspended Accounts
                  </strong>
                  <span style={{ fontSize: "12px", color: "#7e22ce", marginTop: "2px", display: "block" }}>
                    Monitor penalized accounts
                  </span>
                </div>
                <span
                  style={{
                    background: "#7e22ce",
                    color: "#fff",
                    padding: "4px 10px",
                    borderRadius: "12px",
                    fontSize: "13px",
                    fontWeight: "800",
                  }}
                >
                  {loading ? "..." : attentionStats.suspendedAccounts}
                </span>
              </div>
            </Link>

            {/* 4. Suspension Appeals */}
            <Link
              to="/admin/suspension-appeals"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div
                style={{
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  borderRadius: "12px",
                  padding: "16px 18px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <strong style={{ fontSize: "14px", color: "#1e40af", display: "block" }}>
                    ⚖️ Suspension Appeals
                  </strong>
                  <span style={{ fontSize: "12px", color: "#2563eb", marginTop: "2px", display: "block" }}>
                    Adjudicate user appeal filings
                  </span>
                </div>
                <span
                  style={{
                    background: "#2563eb",
                    color: "#fff",
                    padding: "4px 10px",
                    borderRadius: "12px",
                    fontSize: "13px",
                    fontWeight: "800",
                  }}
                >
                  {loading ? "..." : attentionStats.pendingAppeals}
                </span>
              </div>
            </Link>
          </div>
        </div>

        {/* ─── RECENT MODERATION ACTIVITY STREAM ─── */}
        <div
          style={{
            background: "#fff",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
            padding: "20px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
            }}
          >
            <h3 style={{ fontSize: "16px", fontWeight: "800", color: "#0f172a", margin: 0 }}>
              📜 Recent Platform Moderation Activity
            </h3>
            <Link
              to="/admin/audit-logs"
              style={{ color: "#2563eb", fontSize: "13px", fontWeight: "700", textDecoration: "none" }}
            >
              View All Audit Logs →
            </Link>
          </div>

          {loading ? (
            <div style={{ padding: "24px", textAlign: "center", color: "#64748b" }}>
              Loading moderation log stream...
            </div>
          ) : auditLogs.length === 0 ? (
            <div style={{ padding: "24px", textAlign: "center", color: "#64748b" }}>
              No audit log activity recorded yet.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  style={{
                    padding: "12px 14px",
                    border: "1px solid #f1f5f9",
                    borderRadius: "8px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "#f8fafc",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      {getActionBadge(log.action)}
                      <span style={{ fontSize: "13px", fontWeight: "700", color: "#0f172a" }}>
                        Target {log.target_type}: {log.target_id ? log.target_id.substring(0, 8) + "..." : "System"}
                      </span>
                    </div>
                    <span style={{ fontSize: "12px", color: "#64748b", marginTop: "2px", display: "block" }}>
                      By {log.admin_email || "Admin User"} • Note: {log.reason || "No explanation provided"}
                    </span>
                  </div>

                  <span style={{ fontSize: "12px", color: "#94a3b8", whiteSpace: "nowrap" }}>
                    {formatDate(log.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
