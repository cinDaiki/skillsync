import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  fetchAdminProfiles,
  fetchAdminJobs,
  fetchAdminAuditLogs,
  isAccountSuspended,
} from "../../services/adminService";

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    jobSeekers: 0,
    employers: 0,
    pendingEmployers: 0,
    approvedEmployers: 0,
    totalJobs: 0,
    openJobs: 0,
    pendingJobs: 0,
    rejectedJobs: 0,
    suspendedUsers: 0,
  });

  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    setLoading(true);
    setLoadError("");

    try {
      const [profilesRes, jobsRes, auditRes] = await Promise.all([
        fetchAdminProfiles(),
        fetchAdminJobs({ page: 1, pageSize: 200 }),
        fetchAdminAuditLogs({ page: 1, pageSize: 15 }),
      ]);

      const profileList = profilesRes.data || [];
      const jobsList = jobsRes.data || [];
      const auditList = auditRes.data || [];

      const seekers = profileList.filter((p) => p.role === "candidate" || p.role === "job_seeker");
      const employers = profileList.filter((p) => p.role === "employer");
      const pendingEmps = employers.filter((e) => (e.verification_status || "Pending") === "Pending").length;
      const approvedEmps = employers.filter((e) => e.verification_status === "Approved" || e.verification_status === "Verified").length;
      const suspended = profileList.filter(isAccountSuspended).length;

      const openJobsCount = jobsList.filter((j) => j.status === "open").length;
      const pendingJobsCount = jobsList.filter((j) => j.status === "pending_review").length;
      const rejectedJobsCount = jobsList.filter((j) => j.status === "rejected").length;

      setStats({
        jobSeekers: seekers.length,
        employers: employers.length,
        pendingEmployers: pendingEmps,
        approvedEmployers: approvedEmps,
        totalJobs: jobsList.length,
        openJobs: openJobsCount,
        pendingJobs: pendingJobsCount,
        rejectedJobs: rejectedJobsCount,
        suspendedUsers: suspended,
      });

      setAuditLogs(auditList);
    } catch (err) {
      console.error("[AdminDashboard] Load error:", err);
      setLoadError("Failed to load dashboard metrics. Check database connection.");
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

    if (act.includes("APPROVED")) {
      bg = "#dcfce7";
      color = "#15803d";
    } else if (act.includes("REJECTED")) {
      bg = "#fee2e2";
      color = "#b91c1c";
    } else if (act.includes("SUSPENDED")) {
      bg = "#450a0a";
      color = "#ffffff";
    }

    return (
      <span style={{ padding: "3px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: "700", background: bg, color: color }}>
        {action}
      </span>
    );
  }

  return (
    <DashboardLayout
      role="admin"
      title="Admin Dashboard"
      subtitle="Overview of platform users, verification pipeline, job moderation, and security activity."
    >
      <div className="admin-page-container" style={{ padding: "24px" }}>
        {loadError && (
          <div style={{ padding: "12px 16px", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: "8px", color: "#991b1b", fontSize: "13px", marginBottom: "20px" }}>
            {loadError}
          </div>
        )}

        {/* Top Metric Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginBottom: "24px" }}>
          <Link to="/admin/jobseekers" style={{ textDecoration: "none" }}>
            <div style={{ background: "#fff", padding: "20px", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
              <div style={{ fontSize: "13px", color: "#64748b", fontWeight: "700" }}>👤 JOBSEEKERS</div>
              <div style={{ fontSize: "28px", fontWeight: "800", color: "#0f172a", marginTop: "4px" }}>{stats.jobSeekers}</div>
              <div style={{ fontSize: "12px", color: "#2563eb", marginTop: "6px", fontWeight: "600" }}>Manage Candidates →</div>
            </div>
          </Link>

          <Link to="/admin/employers" style={{ textDecoration: "none" }}>
            <div style={{ background: "#fff", padding: "20px", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
              <div style={{ fontSize: "13px", color: "#64748b", fontWeight: "700" }}>🏢 EMPLOYERS</div>
              <div style={{ fontSize: "28px", fontWeight: "800", color: "#0f172a", marginTop: "4px" }}>{stats.employers}</div>
              <div style={{ fontSize: "12px", color: "#16a34a", marginTop: "6px", fontWeight: "600" }}>
                {stats.approvedEmployers} Verified • {stats.pendingEmployers} Pending
              </div>
            </div>
          </Link>

          <Link to="/admin/jobs" style={{ textDecoration: "none" }}>
            <div style={{ background: "#fff", padding: "20px", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
              <div style={{ fontSize: "13px", color: "#64748b", fontWeight: "700" }}>💼 ACTIVE JOBS</div>
              <div style={{ fontSize: "28px", fontWeight: "800", color: "#16a34a", marginTop: "4px" }}>{stats.openJobs}</div>
              <div style={{ fontSize: "12px", color: "#64748b", marginTop: "6px" }}>{stats.totalJobs} Total Listings</div>
            </div>
          </Link>

          <Link to="/admin/jobs" style={{ textDecoration: "none" }}>
            <div style={{ background: "#fff", padding: "20px", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
              <div style={{ fontSize: "13px", color: "#64748b", fontWeight: "700" }}>⏳ PENDING REVIEWS</div>
              <div style={{ fontSize: "28px", fontWeight: "800", color: "#d97706", marginTop: "4px" }}>
                {stats.pendingEmployers + stats.pendingJobs}
              </div>
              <div style={{ fontSize: "12px", color: "#b45309", marginTop: "6px", fontWeight: "600" }}>
                {stats.pendingEmployers} Emps • {stats.pendingJobs} Jobs
              </div>
            </div>
          </Link>
        </div>

        {/* Quick Action Alert Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "12px", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong style={{ fontSize: "15px", color: "#92400e", display: "block" }}>
                🏢 {stats.pendingEmployers} Pending Employer Verifications
              </strong>
              <span style={{ fontSize: "13px", color: "#b45309" }}>Review uploaded business permits and IDs.</span>
            </div>
            <Link
              to="/admin/employers"
              style={{ background: "#d97706", color: "#fff", padding: "8px 14px", borderRadius: "8px", textDecoration: "none", fontSize: "13px", fontWeight: "700" }}
            >
              Verify Employers
            </Link>
          </div>

          <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "12px", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong style={{ fontSize: "15px", color: "#1e40af", display: "block" }}>
                💼 {stats.pendingJobs} Pending Job Postings
              </strong>
              <span style={{ fontSize: "13px", color: "#1d4ed8" }}>Moderate submitted employer opportunities.</span>
            </div>
            <Link
              to="/admin/jobs"
              style={{ background: "#2563eb", color: "#fff", padding: "8px 14px", borderRadius: "8px", textDecoration: "none", fontSize: "13px", fontWeight: "700" }}
            >
              Moderate Jobs
            </Link>
          </div>
        </div>

        {/* Recent Security & Audit Activity Stream */}
        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h3 style={{ fontSize: "18px", fontWeight: "800", color: "#0f172a", margin: 0 }}>
              📜 Recent Platform Moderation Activity
            </h3>
            <Link to="/admin/audit-logs" style={{ color: "#2563eb", fontSize: "13px", fontWeight: "700", textDecoration: "none" }}>
              View All Audit Logs →
            </Link>
          </div>

          {loading ? (
            <div style={{ padding: "24px", textAlign: "center", color: "#64748b" }}>Loading moderation log stream...</div>
          ) : auditLogs.length === 0 ? (
            <div style={{ padding: "24px", textAlign: "center", color: "#64748b" }}>No audit log activity recorded yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {auditLogs.map((log) => (
                <div key={log.id} style={{ padding: "12px 14px", border: "1px solid #f1f5f9", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc" }}>
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
