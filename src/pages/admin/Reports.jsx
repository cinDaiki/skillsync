import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  fetchAdminDashboardStats,
  fetchAdminProfiles,
  filterJobSeekers,
  filterEmployers,
  exportPlatformSummaryCSV,
  exportJobsReportCSV,
  exportUsersReportCSV,
} from "../../services/adminService";

export default function Reports() {
  const [stats, setStats] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [exporting, setExporting] = useState("");

  useEffect(() => {
    loadReports();
  }, []);

  async function loadReports() {
    setLoadError("");
    const { data, error } = await fetchAdminDashboardStats();
    if (error && !data) {
      setLoadError(
        "Could not load reports. Please verify admin database privileges, then refresh."
      );
      return;
    }
    const { data: profiles } = await fetchAdminProfiles();
    setStats({
      ...data,
      jobSeekers: profiles?.length
        ? filterJobSeekers(profiles).length
        : data.jobSeekers,
      employers: profiles?.length
        ? filterEmployers(profiles).length
        : data.employers,
    });
  }

  async function handleExportPlatformSummary() {
    if (!stats) return;
    setExporting("summary");
    try {
      exportPlatformSummaryCSV(stats);
    } finally {
      setExporting("");
    }
  }

  async function handleExportJobs() {
    setExporting("jobs");
    try {
      await exportJobsReportCSV();
    } finally {
      setExporting("");
    }
  }

  async function handleExportUsers() {
    setExporting("users");
    try {
      await exportUsersReportCSV();
    } finally {
      setExporting("");
    }
  }

  return (
    <DashboardLayout
      role="admin"
      title="Platform Reports & Exports"
      subtitle="View platform analytics summaries and export authoritative CSV datasets."
    >
      <div className="admin-page-container" style={{ padding: "24px" }}>
        {/* Navigation Breadcrumb */}
        <div style={{ marginBottom: "16px" }}>
          <Link
            to="/admin/dashboard"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              color: "#2563eb",
              fontSize: "13px",
              fontWeight: "600",
              textDecoration: "none",
            }}
          >
            ← Back to Dashboard
          </Link>
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
              marginBottom: "20px",
            }}
          >
            {loadError}
          </div>
        )}

        {/* ─── PLATFORM SUMMARY SECTION ─── */}
        <section className="dashboard-panel" style={{ marginBottom: "28px" }}>
          <div className="panel-header" style={{ marginBottom: "14px" }}>
            <div>
              <h2 style={{ fontSize: "18px", fontWeight: "800", color: "#0f172a", margin: 0 }}>
                Platform Summary
              </h2>
              <p style={{ fontSize: "13px", color: "#64748b", margin: "4px 0 0 0" }}>
                Overview of registered users, job listings, and applications on SkillSync.
              </p>
            </div>
          </div>

          {!stats && !loadError ? (
            <div className="empty-state">
              <span>↗</span>
              <h3>Loading platform metrics...</h3>
            </div>
          ) : stats ? (
            <section className="overview-grid admin-overview-grid">
              <article className="overview-card">
                <span>👥</span>
                <div>
                  <h3>{stats.jobSeekers}</h3>
                  <p>Job Seekers</p>
                </div>
              </article>
              <article className="overview-card">
                <span>▤</span>
                <div>
                  <h3>{stats.employers}</h3>
                  <p>Employers</p>
                </div>
              </article>
              <article className="overview-card">
                <span>▣</span>
                <div>
                  <h3>{stats.totalJobs}</h3>
                  <p>Total Job Posts</p>
                </div>
              </article>
              <article className="overview-card">
                <span>◎</span>
                <div>
                  <h3>{stats.openJobs}</h3>
                  <p>Open Jobs</p>
                </div>
              </article>
              <article className="overview-card">
                <span>□</span>
                <div>
                  <h3>{stats.closedJobs}</h3>
                  <p>Closed Jobs</p>
                </div>
              </article>
              <article className="overview-card">
                <span>↗</span>
                <div>
                  <h3>{stats.totalApplications}</h3>
                  <p>Total Applications</p>
                </div>
              </article>
            </section>
          ) : null}
        </section>

        {/* ─── EXPORT CENTER SECTION ─── */}
        <section
          style={{
            background: "#ffffff",
            borderRadius: "14px",
            border: "1px solid #e2e8f0",
            padding: "24px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ marginBottom: "18px" }}>
            <h2 style={{ fontSize: "18px", fontWeight: "800", color: "#0f172a", margin: 0 }}>
              📥 Export Center
            </h2>
            <p style={{ fontSize: "13px", color: "#64748b", margin: "4px 0 0 0" }}>
              Download authoritative system reports formatted for compliance, audits, and external analysis.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "16px",
            }}
          >
            {/* Card 1: Platform Summary Export */}
            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                padding: "20px",
                background: "#f8fafc",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                  <span style={{ fontSize: "20px" }}>📊</span>
                  <h3 style={{ fontSize: "15px", fontWeight: "700", color: "#0f172a", margin: 0 }}>
                    Platform Summary
                  </h3>
                </div>
                <p style={{ fontSize: "13px", color: "#64748b", margin: "0 0 16px 0", lineHeight: "1.4" }}>
                  Exports the 6 canonical high-level system metrics with current UTC timestamps and counts.
                </p>
              </div>

              <button
                type="button"
                disabled={!stats || exporting === "summary"}
                onClick={handleExportPlatformSummary}
                style={{
                  padding: "9px 16px",
                  background: "#0284c7",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: "600",
                  cursor: !stats || exporting === "summary" ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                }}
              >
                <span>📥</span> {exporting === "summary" ? "Generating CSV..." : "Export Summary (CSV)"}
              </button>
            </div>

            {/* Card 2: Job Listings Export */}
            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                padding: "20px",
                background: "#f8fafc",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                  <span style={{ fontSize: "20px" }}>💼</span>
                  <h3 style={{ fontSize: "15px", fontWeight: "700", color: "#0f172a", margin: 0 }}>
                    Job Postings Directory
                  </h3>
                </div>
                <p style={{ fontSize: "13px", color: "#64748b", margin: "0 0 16px 0", lineHeight: "1.4" }}>
                  Exports active, closed, and moderated job postings, including departments and active moderation notes.
                </p>
              </div>

              <button
                type="button"
                disabled={exporting === "jobs"}
                onClick={handleExportJobs}
                style={{
                  padding: "9px 16px",
                  background: "#0284c7",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: "600",
                  cursor: exporting === "jobs" ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                }}
              >
                <span>📥</span> {exporting === "jobs" ? "Generating CSV..." : "Export Jobs (CSV)"}
              </button>
            </div>

            {/* Card 3: Users Directory Export */}
            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                padding: "20px",
                background: "#f8fafc",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                  <span style={{ fontSize: "20px" }}>👥</span>
                  <h3 style={{ fontSize: "15px", fontWeight: "700", color: "#0f172a", margin: 0 }}>
                    Users & Profiles Directory
                  </h3>
                </div>
                <p style={{ fontSize: "13px", color: "#64748b", margin: "0 0 16px 0", lineHeight: "1.4" }}>
                  Exports candidate and employer profiles with verification badges and suspension statuses.
                </p>
              </div>

              <button
                type="button"
                disabled={exporting === "users"}
                onClick={handleExportUsers}
                style={{
                  padding: "9px 16px",
                  background: "#0284c7",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: "600",
                  cursor: exporting === "users" ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                }}
              >
                <span>📥</span> {exporting === "users" ? "Generating CSV..." : "Export Users (CSV)"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
