import { useEffect, useState, useCallback } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { useToast } from "../../contexts/ToastContext";
import {
  fetchAdminSuspensionAppeals,
  getAdminSuspensionAppealDetails,
  reviewSuspensionAppeal,
  APPEAL_STATUS_LABELS,
} from "../../services/suspensionAppealService";

export default function SuspensionAppeals() {
  const toast = useToast();
  const [appeals, setAppeals] = useState([]);
  const [summary, setSummary] = useState({ total: 0, pending: 0, under_review: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [statusTab, setStatusTab] = useState("pending"); // 'pending' | 'under_review' | 'resolved' | 'all'
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Review Modal State
  const [activeReviewAppeal, setActiveReviewAppeal] = useState(null); // enriched appeal object
  const [detailedAppeal, setDetailedAppeal] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [publicResponse, setPublicResponse] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [submittingDecision, setSubmittingDecision] = useState(false);

  const loadAppeals = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const res = await fetchAdminSuspensionAppeals({
      statusFilter: statusTab,
      search,
      page,
      pageSize,
    });

    if (res.error) {
      setLoadError("Could not load suspension appeals. Please check administrator permissions.");
    }
    setAppeals(res.data || []);
    setTotalCount(res.totalCount || 0);
    setTotalPages(res.totalPages || 1);
    if (res.summary) {
      setSummary(res.summary);
    }
    setLoading(false);
  }, [statusTab, search, page, pageSize]);

  useEffect(() => {
    loadAppeals();
  }, [loadAppeals]);

  const handleOpenReviewModal = async (appeal) => {
    setActiveReviewAppeal(appeal);
    setPublicResponse(appeal.admin_public_response || "");
    setInternalNote("");
    setLoadingDetails(true);

    const res = await getAdminSuspensionAppealDetails(appeal.id);
    setLoadingDetails(false);
    if (!res.error && res.data) {
      setDetailedAppeal(res.data);
    } else {
      setDetailedAppeal(appeal);
    }
  };

  const handleCloseModal = () => {
    setActiveReviewAppeal(null);
    setDetailedAppeal(null);
    setPublicResponse("");
    setInternalNote("");
    setSubmittingDecision(false);
  };

  const handleExecuteDecision = async (decision) => {
    if (!activeReviewAppeal) return;
    setSubmittingDecision(true);

    const res = await reviewSuspensionAppeal(activeReviewAppeal.id, {
      decision,
      publicResponse,
      internalNote,
    });
    setSubmittingDecision(false);

    if (res.error) {
      toast.error("Failed to execute appeal decision: " + res.error.message);
      return;
    }

    if (decision === "approved") {
      toast.success("✅ Suspension appeal approved and account restored.");
    } else if (decision === "rejected") {
      toast.success("❌ Suspension appeal rejected.");
    } else if (decision === "under_review") {
      toast.info("🔎 Appeal status updated to Under Review.");
    }

    handleCloseModal();
    loadAppeals();
  };

  return (
    <DashboardLayout
      role="admin"
      title="Suspension Appeals"
      subtitle="Review and resolve account suspension appeals submitted by Jobseekers and Employers."
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

        {/* Top Summary Metrics Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
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
              borderLeft: "4px solid #f59e0b",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "700", textTransform: "uppercase" }}>
              🕓 Pending Review
            </span>
            <h3 style={{ fontSize: "24px", fontWeight: "800", color: "#d97706", margin: "6px 0 0" }}>
              {summary.pending}
            </h3>
            <span style={{ fontSize: "12px", color: "#64748b" }}>Awaiting initial triage</span>
          </div>

          <div
            style={{
              background: "#ffffff",
              padding: "16px 20px",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              borderLeft: "4px solid #2563eb",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "700", textTransform: "uppercase" }}>
              🔎 Under Review
            </span>
            <h3 style={{ fontSize: "24px", fontWeight: "800", color: "#2563eb", margin: "6px 0 0" }}>
              {summary.under_review}
            </h3>
            <span style={{ fontSize: "12px", color: "#64748b" }}>In active moderation</span>
          </div>

          <div
            style={{
              background: "#ffffff",
              padding: "16px 20px",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              borderLeft: "4px solid #16a34a",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "700", textTransform: "uppercase" }}>
              ✅ Approved
            </span>
            <h3 style={{ fontSize: "24px", fontWeight: "800", color: "#16a34a", margin: "6px 0 0" }}>
              {summary.approved}
            </h3>
            <span style={{ fontSize: "12px", color: "#64748b" }}>Restored accounts</span>
          </div>

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
              ❌ Rejected
            </span>
            <h3 style={{ fontSize: "24px", fontWeight: "800", color: "#dc2626", margin: "6px 0 0" }}>
              {summary.rejected}
            </h3>
            <span style={{ fontSize: "12px", color: "#64748b" }}>Maintained suspensions</span>
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
              onClick={() => { setStatusTab("pending"); setPage(1); }}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: "700",
                cursor: "pointer",
                border: "none",
                background: statusTab === "pending" ? "#f59e0b" : "#f1f5f9",
                color: statusTab === "pending" ? "#ffffff" : "#475569",
                transition: "all 0.15s ease",
              }}
            >
              Pending ({summary.pending})
            </button>
            <button
              type="button"
              onClick={() => { setStatusTab("under_review"); setPage(1); }}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: "700",
                cursor: "pointer",
                border: "none",
                background: statusTab === "under_review" ? "#2563eb" : "#f1f5f9",
                color: statusTab === "under_review" ? "#ffffff" : "#475569",
                transition: "all 0.15s ease",
              }}
            >
              Under Review ({summary.under_review})
            </button>
            <button
              type="button"
              onClick={() => { setStatusTab("resolved"); setPage(1); }}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: "700",
                cursor: "pointer",
                border: "none",
                background: statusTab === "resolved" ? "#0f172a" : "#f1f5f9",
                color: statusTab === "resolved" ? "#ffffff" : "#475569",
                transition: "all 0.15s ease",
              }}
            >
              Resolved ({summary.approved + summary.rejected})
            </button>
            <button
              type="button"
              onClick={() => { setStatusTab("all"); setPage(1); }}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: "700",
                cursor: "pointer",
                border: "none",
                background: statusTab === "all" ? "#64748b" : "#f1f5f9",
                color: statusTab === "all" ? "#ffffff" : "#475569",
                transition: "all 0.15s ease",
              }}
            >
              All ({summary.total})
            </button>
          </div>

          {/* Search Input & Page Size */}
          <div style={{ display: "flex", gap: "10px", flex: "1", maxWidth: "450px", justifyContent: "flex-end" }}>
            <input
              type="text"
              placeholder="🔍 Search user, email, or message..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
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

        {/* Appeals Table */}
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
                  <th style={{ padding: "14px 16px" }}>Role</th>
                  <th style={{ padding: "14px 16px" }}>Suspension Reason</th>
                  <th style={{ padding: "14px 16px" }}>Submitted</th>
                  <th style={{ padding: "14px 16px" }}>Appeal Status</th>
                  <th style={{ padding: "14px 16px" }}>Context Flag</th>
                  <th style={{ padding: "14px 16px", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "36px", color: "#64748b" }}>
                      Loading suspension appeals...
                    </td>
                  </tr>
                ) : appeals.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
                      <div style={{ fontSize: "16px", fontWeight: "700", color: "#334155" }}>
                        ✅ No appeals found in this category.
                      </div>
                    </td>
                  </tr>
                ) : (
                  appeals.map((appeal) => {
                    const isPending = appeal.status === "pending";
                    const isUnderReview = appeal.status === "under_review";
                    const isResolved = appeal.status === "approved" || appeal.status === "rejected";

                    return (
                      <tr
                        key={appeal.id}
                        style={{
                          borderBottom: "1px solid #f1f5f9",
                          transition: "background 0.15s ease",
                        }}
                      >
                        {/* User / Account Name & Email */}
                        <td style={{ padding: "14px 16px" }}>
                          <div>
                            <strong style={{ display: "block", color: "#0f172a" }}>{appeal.displayName}</strong>
                            <span style={{ fontSize: "12px", color: "#64748b" }}>{appeal.email}</span>
                          </div>
                        </td>

                        {/* Role */}
                        <td style={{ padding: "14px 16px" }}>
                          <span
                            style={{
                              padding: "3px 8px",
                              borderRadius: "6px",
                              fontSize: "12px",
                              fontWeight: "700",
                              background: appeal.isEmployer ? "#e0f2fe" : "#f3e8ff",
                              color: appeal.isEmployer ? "#0369a1" : "#7e22ce",
                              border: `1px solid ${appeal.isEmployer ? "#bae6fd" : "#e9d5ff"}`,
                            }}
                          >
                            {appeal.isEmployer ? "🏢 Employer" : "👤 Jobseeker"}
                          </span>
                        </td>

                        {/* Suspension Reason */}
                        <td style={{ padding: "14px 16px", fontSize: "13px" }}>
                          <span
                            style={{
                              padding: "3px 8px",
                              borderRadius: "10px",
                              fontSize: "11px",
                              fontWeight: "700",
                              background: "#fee2e2",
                              color: "#991b1b",
                            }}
                          >
                            🚫 {appeal.suspensionReasonLabel}
                          </span>
                        </td>

                        {/* Submitted Date */}
                        <td style={{ padding: "14px 16px", fontSize: "13px", color: "#475569" }}>
                          {appeal.formattedCreatedAt}
                        </td>

                        {/* Status */}
                        <td style={{ padding: "14px 16px" }}>
                          <span
                            style={{
                              padding: "4px 10px",
                              borderRadius: "12px",
                              fontSize: "12px",
                              fontWeight: "700",
                              background:
                                appeal.status === "approved"
                                  ? "#dcfce7"
                                  : appeal.status === "rejected"
                                  ? "#fee2e2"
                                  : appeal.status === "under_review"
                                  ? "#fef3c7"
                                  : "#dbeafe",
                              color:
                                appeal.status === "approved"
                                  ? "#15803d"
                                  : appeal.status === "rejected"
                                  ? "#991b1b"
                                  : appeal.status === "under_review"
                                  ? "#92400e"
                                  : "#1e40af",
                            }}
                          >
                            {appeal.status === "pending" && "🕓 "}
                            {appeal.status === "under_review" && "🔎 "}
                            {appeal.status === "approved" && "✅ "}
                            {appeal.status === "rejected" && "❌ "}
                            {APPEAL_STATUS_LABELS[appeal.status] || appeal.status}
                          </span>
                        </td>

                        {/* Context Flags */}
                        <td style={{ padding: "14px 16px", fontSize: "12px" }}>
                          {appeal.isStale ? (
                            <span style={{ color: "#d97706", fontWeight: "700", background: "#fef3c7", padding: "2px 6px", borderRadius: "4px" }}>
                              ⚠️ Stale Instance
                            </span>
                          ) : appeal.isNaturallyExpired ? (
                            <span style={{ color: "#0284c7", fontWeight: "700", background: "#e0f2fe", padding: "2px 6px", borderRadius: "4px" }}>
                              ℹ️ Expired Naturally
                            </span>
                          ) : (
                            <span style={{ color: "#16a34a", fontWeight: "600" }}>Active Suspension</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td style={{ padding: "14px 16px", textAlign: "right" }}>
                          <button
                            type="button"
                            onClick={() => handleOpenReviewModal(appeal)}
                            style={{
                              background: (isPending || isUnderReview) ? "#2563eb" : "#f1f5f9",
                              color: (isPending || isUnderReview) ? "#ffffff" : "#334155",
                              border: "1px solid #cbd5e1",
                              padding: "6px 12px",
                              borderRadius: "6px",
                              fontSize: "12px",
                              fontWeight: "700",
                              cursor: "pointer",
                            }}
                          >
                            {(isPending || isUnderReview) ? "Review Appeal" : "View Details"}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Review Appeal Modal */}
        {activeReviewAppeal && (
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
                maxWidth: "640px",
                width: "100%",
                maxHeight: "90vh",
                overflowY: "auto",
                boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "1px solid #e2e8f0", pb: "12px" }}>
                <div>
                  <h3 style={{ fontSize: "18px", fontWeight: "800", color: "#0f172a", margin: 0 }}>
                    Review Suspension Appeal
                  </h3>
                  <span style={{ fontSize: "12px", color: "#64748b" }}>
                    ID: {activeReviewAppeal.id}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  style={{ background: "transparent", border: "none", fontSize: "20px", color: "#64748b", cursor: "pointer" }}
                >
                  ✕
                </button>
              </div>

              {/* User Identity & Suspension Snapshot */}
              <div style={{ background: "#f8fafc", padding: "12px 16px", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "16px", fontSize: "13px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <div>
                    <span style={{ color: "#64748b", fontSize: "11px", textTransform: "uppercase", fontWeight: "700" }}>User / Account:</span>
                    <strong style={{ display: "block", color: "#0f172a" }}>{activeReviewAppeal.displayName}</strong>
                    <span style={{ color: "#64748b", fontSize: "12px" }}>{activeReviewAppeal.email}</span>
                  </div>
                  <div>
                    <span style={{ color: "#64748b", fontSize: "11px", textTransform: "uppercase", fontWeight: "700" }}>Account Type:</span>
                    <strong style={{ display: "block", color: "#0f172a" }}>
                      {activeReviewAppeal.isEmployer ? "Employer" : "Jobseeker"}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: "#64748b", fontSize: "11px", textTransform: "uppercase", fontWeight: "700" }}>Suspension Reason:</span>
                    <span style={{ display: "block", color: "#991b1b", fontWeight: "600" }}>
                      {activeReviewAppeal.suspensionReasonLabel}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: "#64748b", fontSize: "11px", textTransform: "uppercase", fontWeight: "700" }}>Suspension Expiry:</span>
                    <span style={{ display: "block", color: "#334155", fontWeight: "600" }}>
                      {activeReviewAppeal.durationRemaining}
                    </span>
                  </div>
                </div>

                {/* Stale or Expired Warnings */}
                {activeReviewAppeal.isStale && (
                  <div style={{ marginTop: "10px", padding: "8px 12px", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: "6px", color: "#92400e", fontSize: "12px" }}>
                    ⚠️ <strong>Stale Appeal Notice:</strong> The user has a newer suspension instance than this appeal snapshot. Approving this appeal will resolve it for historical records but will NOT restore the newer active suspension.
                  </div>
                )}
                {activeReviewAppeal.isNaturallyExpired && (
                  <div style={{ marginTop: "10px", padding: "8px 12px", background: "#e0f2fe", border: "1px solid #bae6fd", borderRadius: "6px", color: "#0369a1", fontSize: "12px" }}>
                    ℹ️ <strong>Natural Expiry Notice:</strong> The suspension period for this account has already expired naturally. The account is currently active.
                  </div>
                )}
              </div>

              {/* Appeal Message */}
              <div style={{ marginBottom: "16px" }}>
                <label style={{ fontSize: "12px", fontWeight: "700", color: "#334155", display: "block", marginBottom: "4px" }}>
                  Appeal Explanation from User:
                </label>
                <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", padding: "12px", borderRadius: "8px", fontSize: "13.5px", lineHeight: "1.5", color: "#1e293b", whiteSpace: "pre-wrap" }}>
                  {activeReviewAppeal.appeal_message}
                </div>
              </div>

              {/* User Evidence / Additional Note */}
              {activeReviewAppeal.user_evidence_note && (
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ fontSize: "12px", fontWeight: "700", color: "#334155", display: "block", marginBottom: "4px" }}>
                    Additional Information / Supporting Context:
                  </label>
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "10px 12px", borderRadius: "8px", fontSize: "13px", color: "#475569", whiteSpace: "pre-wrap" }}>
                    {activeReviewAppeal.user_evidence_note}
                  </div>
                </div>
              )}

              {/* Decision Forms (If pending or under_review) */}
              {(activeReviewAppeal.status === "pending" || activeReviewAppeal.status === "under_review") ? (
                <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "14px", marginTop: "14px" }}>
                  <div style={{ marginBottom: "12px" }}>
                    <label style={{ fontSize: "12px", fontWeight: "700", color: "#334155", display: "block", marginBottom: "4px" }}>
                      Public Response to User (Visible on /account-suspended):
                    </label>
                    <textarea
                      rows={2}
                      value={publicResponse}
                      onChange={(e) => setPublicResponse(e.target.value)}
                      placeholder="e.g. After reviewing your appeal, your account access has been restored."
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px", boxSizing: "border-box" }}
                    />
                  </div>

                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ fontSize: "12px", fontWeight: "700", color: "#334155", display: "block", marginBottom: "4px" }}>
                      Internal Review Note (Admin Only — Strictly Private):
                    </label>
                    <textarea
                      rows={2}
                      value={internalNote}
                      onChange={(e) => setInternalNote(e.target.value)}
                      placeholder="Optional private moderation notes regarding this appeal decision..."
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px", boxSizing: "border-box" }}
                    />
                  </div>

                  {/* Action Confirmation & Clarification Text */}
                  <div style={{ marginBottom: "14px", padding: "8px 12px", background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "12px", color: "#475569" }}>
                    {activeReviewAppeal.isStale ? (
                      <span style={{ color: "#92400e", fontWeight: "600" }}>
                        ⚠️ <strong>Stale Appeal:</strong> This appeal belongs to a previous suspension. Approving it will resolve the historical appeal record only and will NOT modify the user&apos;s current active suspension.
                      </span>
                    ) : activeReviewAppeal.isNaturallyExpired ? (
                      <span style={{ color: "#0369a1", fontWeight: "600" }}>
                        ℹ️ <strong>Natural Expiry:</strong> This suspension has already expired. Approving this appeal will resolve the appeal record only.
                      </span>
                    ) : (
                      <span style={{ color: "#166534", fontWeight: "600" }}>
                        ✓ <strong>Active Suspension:</strong> Approving this appeal will restore the user&apos;s account access immediately.
                      </span>
                    )}
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                    <button
                      type="button"
                      disabled={submittingDecision || activeReviewAppeal.status === "under_review"}
                      onClick={() => handleExecuteDecision("under_review")}
                      style={{
                        background: "#f1f5f9",
                        color: "#334155",
                        border: "1px solid #cbd5e1",
                        padding: "8px 14px",
                        borderRadius: "8px",
                        fontSize: "12.5px",
                        fontWeight: "700",
                        cursor: (submittingDecision || activeReviewAppeal.status === "under_review") ? "not-allowed" : "pointer",
                        opacity: activeReviewAppeal.status === "under_review" ? 0.6 : 1,
                      }}
                    >
                      {activeReviewAppeal.status === "under_review" ? "Already Under Review" : "Mark Under Review"}
                    </button>

                    <div style={{ display: "flex", gap: "10px" }}>
                      <button
                        type="button"
                        disabled={submittingDecision}
                        onClick={() => handleExecuteDecision("rejected")}
                        style={{
                          background: "#dc2626",
                          color: "#ffffff",
                          border: "none",
                          padding: "8px 16px",
                          borderRadius: "8px",
                          fontSize: "12.5px",
                          fontWeight: "700",
                          cursor: submittingDecision ? "not-allowed" : "pointer",
                        }}
                      >
                        Reject Appeal
                      </button>
                      <button
                        type="button"
                        disabled={submittingDecision}
                        onClick={() => handleExecuteDecision("approved")}
                        style={{
                          background: "#16a34a",
                          color: "#ffffff",
                          border: "none",
                          padding: "8px 16px",
                          borderRadius: "8px",
                          fontSize: "12.5px",
                          fontWeight: "700",
                          cursor: submittingDecision ? "not-allowed" : "pointer",
                        }}
                      >
                        {activeReviewAppeal.isStale || activeReviewAppeal.isNaturallyExpired
                          ? "Resolve as Approved"
                          : "Approve & Restore"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Resolved Appeal Display */
                <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "14px", marginTop: "14px" }}>
                  <div style={{ padding: "12px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                    <span style={{ fontSize: "12px", fontWeight: "700", color: "#334155", display: "block" }}>
                      Appeal Decision: <strong>{APPEAL_STATUS_LABELS[activeReviewAppeal.status]}</strong>
                    </span>
                    {activeReviewAppeal.admin_public_response && (
                      <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#1e293b" }}>
                        Public Response: &ldquo;{activeReviewAppeal.admin_public_response}&rdquo;
                      </p>
                    )}
                    {activeReviewAppeal.formattedReviewedAt && (
                      <span style={{ fontSize: "11px", color: "#64748b", display: "block", marginTop: "4px" }}>
                        Reviewed on: {activeReviewAppeal.formattedReviewedAt}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
