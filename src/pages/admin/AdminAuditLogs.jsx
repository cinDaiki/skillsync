import { useEffect, useState, useCallback } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { fetchAdminAuditLogs } from "../../services/adminService";

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionType, setActionType] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const loadAuditLogs = useCallback(async () => {
    setLoading(true);
    const res = await fetchAdminAuditLogs({
      search,
      actionType,
      page,
      pageSize,
    });
    setLogs(res.data || []);
    setTotalCount(res.totalCount || 0);
    setTotalPages(res.totalPages || 1);
    setLoading(false);
  }, [search, actionType, page, pageSize]);

  useEffect(() => {
    loadAuditLogs();
  }, [loadAuditLogs]);

  function formatDate(dateString) {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
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
    } else if (act.includes("REJECTED")) {
      bg = "#fee2e2";
      color = "#b91c1c";
    } else if (act.includes("SUSPENDED")) {
      bg = "#fee2e2";
      color = "#991b1b";
    } else if (act.includes("RESUBMITTED")) {
      bg = "#fef3c7";
      color = "#b45309";
    } else if (act.includes("UPDATED")) {
      bg = "#e0f2fe";
      color = "#0369a1";
    }

    return (
      <span
        style={{
          padding: "4px 10px",
          borderRadius: "12px",
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
      title="Audit Logs"
      subtitle="Immutable platform moderation history and administrative security logs."
    >
      <div className="admin-page-container" style={{ padding: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: "800", color: "#0f172a", margin: 0 }}>
              📜 Platform Audit Trail
            </h1>
            <p style={{ color: "#64748b", fontSize: "14px", marginTop: "4px" }}>
              Immutable record of administrative verifications, job moderations, and account suspensions.
            </p>
          </div>

          <div style={{ background: "#f1f5f9", padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: "700", color: "#334155" }}>
            Total Audit Records: <span style={{ color: "#2563eb" }}>{totalCount}</span>
          </div>
        </div>

        {/* Security Banner */}
        <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "10px", padding: "12px 16px", fontSize: "13px", color: "#334155", marginBottom: "20px" }}>
          🛡️ <strong>Immutable Security Policy:</strong> Audit logs are read-only records generated automatically by platform operations. Records cannot be modified or deleted.
        </div>

        {/* Filter Controls Bar */}
        <div style={{ display: "flex", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="🔍 Search action, target, or reason note..."
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
            value={actionType}
            onChange={(e) => {
              setActionType(e.target.value);
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
            <option value="all">All Actions</option>
            <option value="EMPLOYER_APPROVED">EMPLOYER_APPROVED</option>
            <option value="EMPLOYER_REJECTED">EMPLOYER_REJECTED</option>
            <option value="EMPLOYER_SUSPENDED">EMPLOYER_SUSPENDED</option>
            <option value="JOB_APPROVED">JOB_APPROVED</option>
            <option value="JOB_REJECTED">JOB_REJECTED</option>
            <option value="JOB_SUSPENDED">JOB_SUSPENDED</option>
            <option value="USER_SUSPENDED">USER_SUSPENDED</option>
            <option value="USER_UNSUSPENDED">USER_UNSUSPENDED</option>
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

        {/* Audit Table */}
        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: "12px", textTransform: "uppercase", color: "#64748b", fontWeight: "700" }}>
                <th style={{ padding: "14px 16px" }}>Timestamp</th>
                <th style={{ padding: "14px 16px" }}>Admin User</th>
                <th style={{ padding: "14px 16px" }}>Action</th>
                <th style={{ padding: "14px 16px" }}>Target Entity</th>
                <th style={{ padding: "14px 16px" }}>Reason / Notes</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "32px", color: "#64748b" }}>
                    Loading audit trail history...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "32px", color: "#64748b" }}>
                    No audit records found matching search or filter criteria.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: "1px solid #f1f5f9", fontSize: "13px" }}>
                    <td style={{ padding: "14px 16px", color: "#64748b", whiteSpace: "nowrap" }}>
                      {formatDate(log.created_at)}
                    </td>

                    <td style={{ padding: "14px 16px" }}>
                      <strong style={{ color: "#0f172a", display: "block" }}>{log.admin_name}</strong>
                      <span style={{ fontSize: "12px", color: "#64748b" }}>{log.admin_email}</span>
                    </td>

                    <td style={{ padding: "14px 16px" }}>
                      {getActionBadge(log.action)}
                    </td>

                    <td style={{ padding: "14px 16px", color: "#334155" }}>
                      <span style={{ textTransform: "capitalize", fontWeight: "700" }}>{log.target_type || "Entity"}</span>
                      {log.target_id && (
                        <span style={{ display: "block", fontSize: "11px", color: "#94a3b8" }}>
                          ID: {log.target_id.substring(0, 8)}...
                        </span>
                      )}
                    </td>

                    <td style={{ padding: "14px 16px", color: "#334155" }}>
                      {log.reason || <span style={{ color: "#94a3b8", italic: true }}>No note provided</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Pagination Footer */}
          <div style={{ padding: "14px 16px", background: "#f8fafc", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px", color: "#64748b" }}>
            <div>
              Showing {logs.length > 0 ? (page - 1) * pageSize + 1 : 0} to {Math.min(page * pageSize, totalCount)} of {totalCount} records
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
      </div>
    </DashboardLayout>
  );
}
