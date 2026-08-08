import { useState, useEffect, useCallback } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { fetchAdminJobseekers, toggleUserSuspension, displayUserName } from "../../services/adminService";

export default function ManageJobseekers() {
  const [jobseekers, setJobseekers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadJobseekers = useCallback(async () => {
    setLoading(true);
    const res = await fetchAdminJobseekers({
      search,
      status: statusFilter,
      page,
      pageSize,
    });
    setJobseekers(res.data || []);
    setTotalCount(res.totalCount || 0);
    setTotalPages(res.totalPages || 1);
    setLoading(false);
  }, [search, statusFilter, page, pageSize]);

  useEffect(() => {
    loadJobseekers();
  }, [loadJobseekers]);

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleStatusChange = (e) => {
    setStatusFilter(e.target.value);
    setPage(1);
  };

  const handleToggleSuspension = async (candidate) => {
    const isSuspended = candidate.is_suspended;
    const actionLabel = isSuspended ? "unsuspend" : "suspend";
    if (!window.confirm(`Are you sure you want to ${actionLabel} candidate "${displayUserName(candidate)}"?`)) {
      return;
    }

    setActionLoading(true);
    const { error } = await toggleUserSuspension(candidate.id, !isSuspended);
    setActionLoading(false);

    if (error) {
      alert(`Failed to ${actionLabel} user: ` + error.message);
      return;
    }

    // Refresh state
    if (selectedCandidate && selectedCandidate.id === candidate.id) {
      setSelectedCandidate((prev) => ({ ...prev, is_suspended: !isSuspended }));
    }
    loadJobseekers();
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const renderSkills = (skills) => {
    let list = [];
    if (Array.isArray(skills)) {
      list = skills;
    } else if (typeof skills === "string" && skills.trim()) {
      list = skills.split(",").map((s) => s.trim());
    }

    if (list.length === 0) return <span className="text-muted" style={{ fontSize: "12px" }}>Unspecified</span>;

    return (
      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
        {list.slice(0, 3).map((sk, idx) => (
          <span
            key={idx}
            style={{
              background: "#e0f2fe",
              color: "#0369a1",
              padding: "2px 8px",
              borderRadius: "4px",
              fontSize: "11px",
              fontWeight: "600",
            }}
          >
            {sk}
          </span>
        ))}
        {list.length > 3 && (
          <span style={{ fontSize: "11px", color: "#64748b", alignSelf: "center" }}>
            +{list.length - 3}
          </span>
        )}
      </div>
    );
  };

  return (
    <DashboardLayout role="admin">
      <div className="admin-page-container" style={{ padding: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: "800", color: "#0f172a", margin: 0 }}>
              👤 Jobseeker Management
            </h1>
            <p style={{ color: "#64748b", fontSize: "14px", marginTop: "4px" }}>
              View candidate profiles, skills, profile completeness, and account moderation controls.
            </p>
          </div>

          <div style={{ background: "#f1f5f9", padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: "700", color: "#334155" }}>
            Total Candidates: <span style={{ color: "#2563eb" }}>{totalCount}</span>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div style={{ display: "flex", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="🔍 Search name or email..."
            value={search}
            onChange={handleSearchChange}
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
            value={statusFilter}
            onChange={handleStatusChange}
            style={{
              padding: "10px 14px",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              fontSize: "14px",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Accounts</option>
            <option value="suspended">Suspended Accounts</option>
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

        {/* Candidate Table */}
        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: "12px", textTransform: "uppercase", color: "#64748b", fontWeight: "700" }}>
                <th style={{ padding: "14px 16px" }}>Candidate</th>
                <th style={{ padding: "14px 16px" }}>Location</th>
                <th style={{ padding: "14px 16px" }}>Primary Skills</th>
                <th style={{ padding: "14px 16px" }}>Completion</th>
                <th style={{ padding: "14px 16px" }}>Status</th>
                <th style={{ padding: "14px 16px" }}>Registered</th>
                <th style={{ padding: "14px 16px", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "32px", color: "#64748b" }}>
                    Loading jobseeker profiles...
                  </td>
                </tr>
              ) : jobseekers.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "32px", color: "#64748b" }}>
                    No jobseekers found matching search criteria.
                  </td>
                </tr>
              ) : (
                jobseekers.map((cand) => {
                  const isSuspended = cand.is_suspended;
                  return (
                    <tr key={cand.id} style={{ borderBottom: "1px solid #f1f5f9", fontSize: "14px", transition: "background 0.15s" }}>
                      <td style={{ padding: "14px 16px" }}>
                        <strong style={{ display: "block", color: "#0f172a" }}>{displayUserName(cand)}</strong>
                        <span style={{ fontSize: "12px", color: "#64748b" }}>{cand.email}</span>
                      </td>

                      <td style={{ padding: "14px 16px", color: "#334155", fontSize: "13px" }}>
                        {cand.address || cand.location || "Not specified"}
                      </td>

                      <td style={{ padding: "14px 16px" }}>
                        {renderSkills(cand.skills)}
                      </td>

                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <div style={{ flex: 1, height: "6px", background: "#e2e8f0", borderRadius: "3px", overflow: "hidden", minWidth: "60px" }}>
                            <div
                              style={{
                                width: `${cand.profile_completion || 0}%`,
                                height: "100%",
                                background: (cand.profile_completion || 0) >= 80 ? "#16a34a" : (cand.profile_completion || 0) >= 50 ? "#eab308" : "#dc2626",
                                borderRadius: "3px",
                              }}
                            />
                          </div>
                          <span style={{ fontSize: "12px", fontWeight: "700", color: "#475569" }}>
                            {cand.profile_completion || 0}%
                          </span>
                        </div>
                      </td>

                      <td style={{ padding: "14px 16px" }}>
                        <span
                          style={{
                            padding: "4px 10px",
                            borderRadius: "12px",
                            fontSize: "12px",
                            fontWeight: "700",
                            background: isSuspended ? "#fee2e2" : "#dcfce7",
                            color: isSuspended ? "#991b1b" : "#15803d",
                          }}
                        >
                          {isSuspended ? "🚫 Suspended" : "✓ Active"}
                        </span>
                      </td>

                      <td style={{ padding: "14px 16px", color: "#64748b", fontSize: "13px" }}>
                        {formatDate(cand.created_at)}
                      </td>

                      <td style={{ padding: "14px 16px", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            onClick={() => setSelectedCandidate(cand)}
                            style={{
                              background: "#f1f5f9",
                              color: "#1e293b",
                              border: "1px solid #cbd5e1",
                              padding: "6px 12px",
                              borderRadius: "6px",
                              fontSize: "12px",
                              fontWeight: "600",
                              cursor: "pointer",
                            }}
                          >
                            👁 Profile
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleSuspension(cand)}
                            disabled={actionLoading}
                            style={{
                              background: isSuspended ? "#16a34a" : "#dc2626",
                              color: "#fff",
                              border: "none",
                              padding: "6px 12px",
                              borderRadius: "6px",
                              fontSize: "12px",
                              fontWeight: "600",
                              cursor: "pointer",
                            }}
                          >
                            {isSuspended ? "Unsuspend" : "Suspend"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Pagination Footer */}
          <div style={{ padding: "14px 16px", background: "#f8fafc", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px", color: "#64748b" }}>
            <div>
              Showing {jobseekers.length > 0 ? (page - 1) * pageSize + 1 : 0} to {Math.min(page * pageSize, totalCount)} of {totalCount} candidates
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

      {/* Candidate Profile Details Drawer / Modal */}
      {selectedCandidate && (
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
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
              <div>
                <h2 style={{ fontSize: "20px", fontWeight: "800", color: "#0f172a", margin: 0 }}>
                  {displayUserName(selectedCandidate)}
                </h2>
                <span style={{ fontSize: "13px", color: "#64748b" }}>{selectedCandidate.email}</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCandidate(null)}
                style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#64748b" }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px", padding: "12px", background: "#f8fafc", borderRadius: "8px", fontSize: "13px" }}>
              <div><span>Contact:</span> <strong>{selectedCandidate.contact_number || "Not provided"}</strong></div>
              <div><span>Location:</span> <strong>{selectedCandidate.address || selectedCandidate.location || "Not specified"}</strong></div>
              <div><span>Registered:</span> <strong>{formatDate(selectedCandidate.created_at)}</strong></div>
              <div>
                <span>Account Status:</span>{" "}
                <strong style={{ color: selectedCandidate.is_suspended ? "#dc2626" : "#16a34a" }}>
                  {selectedCandidate.is_suspended ? "Suspended" : "Active"}
                </strong>
              </div>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <span style={{ fontSize: "12px", fontWeight: "800", textTransform: "uppercase", color: "#64748b", display: "block", marginBottom: "6px" }}>
                Skills & Technical Competencies
              </span>
              {renderSkills(selectedCandidate.skills)}
            </div>

            <div style={{ marginBottom: "16px" }}>
              <span style={{ fontSize: "12px", fontWeight: "800", textTransform: "uppercase", color: "#64748b", display: "block", marginBottom: "6px" }}>
                Education Background
              </span>
              <p style={{ fontSize: "13px", color: "#334155", background: "#fff", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: "6px" }}>
                {typeof selectedCandidate.education === "string" ? selectedCandidate.education : Array.isArray(selectedCandidate.education) && selectedCandidate.education.length > 0 ? selectedCandidate.education.map(e => e.degree || e.school || JSON.stringify(e)).join(", ") : "No education details provided"}
              </p>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <span style={{ fontSize: "12px", fontWeight: "800", textTransform: "uppercase", color: "#64748b", display: "block", marginBottom: "6px" }}>
                Experience Summary
              </span>
              <p style={{ fontSize: "13px", color: "#334155", background: "#fff", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: "6px" }}>
                {typeof selectedCandidate.experience === "string" ? selectedCandidate.experience : Array.isArray(selectedCandidate.experience) && selectedCandidate.experience.length > 0 ? selectedCandidate.experience.map(x => x.title || x.company || JSON.stringify(x)).join("; ") : "Fresh Graduate / Entry Level"}
              </p>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid #e2e8f0", paddingTop: "16px" }}>
              <button
                type="button"
                onClick={() => handleToggleSuspension(selectedCandidate)}
                style={{
                  background: selectedCandidate.is_suspended ? "#16a34a" : "#dc2626",
                  color: "#fff",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: "700",
                  cursor: "pointer",
                }}
              >
                {selectedCandidate.is_suspended ? "Unsuspend Account" : "Suspend Account"}
              </button>

              <button
                type="button"
                onClick={() => setSelectedCandidate(null)}
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
    </DashboardLayout>
  );
}
