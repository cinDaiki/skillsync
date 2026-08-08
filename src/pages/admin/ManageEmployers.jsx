import { useEffect, useState } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { useToast } from "../../contexts/ToastContext";
import { supabase } from "../../services/supabase";
import { fetchAdminProfiles, filterEmployers, displayUserName, updateEmployerVerification } from "../../services/adminService";

export default function ManageEmployers() {
  const toast = useToast();
  const [employers, setEmployers] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  // Moderation Modal State
  const [actionModal, setActionModal] = useState(null); // { employer, targetStatus: 'Approved'|'Rejected'|'Suspended' }
  const [reasonInput, setReasonInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadEmployers();
  }, []);

  async function loadEmployers() {
    setLoadError("");
    const { data: profiles, error } = await fetchAdminProfiles();
    if (error && (!profiles || profiles.length === 0)) {
      setLoadError(
        "Could not load employers. Run supabase/admin_access.sql in your Supabase SQL Editor, then refresh."
      );
    }
    setEmployers(filterEmployers(profiles));
  }

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

  async function executeStatusUpdate(userId, newStatus, reason) {
    setSubmitting(true);
    const { error } = await updateEmployerVerification(userId, newStatus, reason);
    setSubmitting(false);

    if (error) {
      toast.error("Failed to update verification status: " + error.message);
      return;
    }

    toast.success(`Employer status updated to "${newStatus}".`);
    setActionModal(null);
    await loadEmployers();
  }

  async function handleRemoveEmployer(userId) {
    if (!window.confirm("Are you sure you want to remove this employer account?")) return;
    await supabase.from("profiles").delete().eq("id", userId);
    await supabase.auth.admin.deleteUser(userId).catch(() => {});
    setEmployers((prev) => prev.filter((e) => e.id !== userId));
  }

  function formatDate(dateString) {
    if (!dateString) return "No date";
    return new Date(dateString).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  const filteredEmployers = employers.filter(emp => {
    const status = emp.verification_status || "Pending";
    if (statusFilter === "All") return true;
    if (statusFilter === "Approved") return status === "Approved" || status === "Verified";
    return status === statusFilter;
  });

  return (
    <DashboardLayout role="admin" title="Employers"
      subtitle="Manage employer accounts, company verification, and platform access.">
      <section className="dashboard-panel">
        <div className="panel-header employers-panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <div className="panel-header-content">
            <h2>Employer Accounts ({filteredEmployers.length})</h2>
          </div>

          {/* Status Filter Tabs */}
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {["All", "Pending", "Approved", "Rejected", "Suspended"].map(st => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                style={{
                  padding: "6px 14px",
                  borderRadius: "20px",
                  fontSize: "12px",
                  fontWeight: "700",
                  border: statusFilter === st ? "1px solid #58158f" : "1px solid #cbd5e1",
                  background: statusFilter === st ? "#58158f" : "#fff",
                  color: statusFilter === st ? "#fff" : "#475569",
                  cursor: "pointer"
                }}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {loadError && <div className="profile-message">{loadError}</div>}

        {filteredEmployers.length === 0 && !loadError ? (
          <div className="empty-state">
            <span>▤</span><h3>No employers found</h3>
            <p>No registered employer accounts match your selected filter.</p>
          </div>
        ) : (
          <div className="admin-employers-list">
            {filteredEmployers.map((employer) => {
              const status = employer.verification_status || "Pending";
              const isApproved = status === "Approved" || status === "Verified";

              return (
                <article className="admin-employer-card" key={employer.id} style={{ borderLeft: isApproved ? "4px solid #16a34a" : status === "Rejected" ? "4px solid #dc2626" : status === "Suspended" ? "4px solid #450a0a" : "4px solid #f59e0b" }}>
                  <div className="admin-employer-main">
                    <div className="admin-employer-avatar" style={{ background: isApproved ? "#dcfce7" : "#fef9c3", color: isApproved ? "#15803d" : "#854d0e" }}>
                      {(employer.full_name || employer.email || "E").charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 style={{ margin: "0 0 2px 0" }}>{displayUserName(employer)}</h3>
                      <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>{employer.email || "No email"}</p>
                    </div>
                  </div>

                  <div className="admin-employer-details-grid" style={{ marginTop: "12px" }}>
                    <div>
                      <span>Verification Status</span>
                      <strong style={{ color: isApproved ? "#15803d" : status === "Rejected" ? "#dc2626" : status === "Suspended" ? "#991b1b" : "#b45309" }}>
                        {isApproved ? "✓ Approved / Verified" : status === "Rejected" ? "❌ Rejected" : status === "Suspended" ? "🚫 Suspended" : "⏳ Pending Review"}
                      </strong>
                    </div>
                    <div><span>Registered</span><strong>{formatDate(employer.created_at)}</strong></div>
                    <div><span>Contact</span><strong>{employer.contact_number || "Not provided"}</strong></div>
                    <div><span>Location</span><strong>{employer.location || "Not specified"}</strong></div>
                  </div>

                  {/* Verification Reason Note if present */}
                  {employer.verification_reason && (
                    <div style={{ marginTop: "10px", padding: "8px 12px", background: "#f8fafc", borderRadius: "6px", fontSize: "12px", color: "#475569", border: "1px solid #e2e8f0" }}>
                      <strong>Reason Note:</strong> {employer.verification_reason}
                    </div>
                  )}

                  {/* Verification Documents Review Section */}
                  {(employer.id_image_url || employer.selfie_image_url || employer.business_permit_url || employer.sec_registration_url) && (
                    <div style={{ marginTop: "12px", padding: "10px 14px", background: "#f5ecff", borderRadius: "8px", border: "1px solid #e9d5ff" }}>
                      <span style={{ fontSize: "12px", fontWeight: "800", color: "#58158f", display: "block", marginBottom: "6px" }}>
                        🛡️ Employer Verification Documents
                      </span>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {employer.id_image_url && (
                          <button type="button" onClick={() => handleAdminViewDoc(employer.id_image_url)} style={{ background: "#fff", color: "#58158f", border: "1px solid #d8b4fe", padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: "700", cursor: "pointer" }}>
                            🔒 View Government ID
                          </button>
                        )}
                        {employer.selfie_image_url && (
                          <button type="button" onClick={() => handleAdminViewDoc(employer.selfie_image_url)} style={{ background: "#fff", color: "#58158f", border: "1px solid #d8b4fe", padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: "700", cursor: "pointer" }}>
                            🔒 View Selfie with ID
                          </button>
                        )}
                        {employer.business_permit_url && (
                          <button type="button" onClick={() => handleAdminViewDoc(employer.business_permit_url)} style={{ background: "#fff", color: "#58158f", border: "1px solid #d8b4fe", padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: "700", cursor: "pointer" }}>
                            🔒 View Business Permit
                          </button>
                        )}
                        {employer.sec_registration_url && (
                          <button type="button" onClick={() => handleAdminViewDoc(employer.sec_registration_url)} style={{ background: "#fff", color: "#58158f", border: "1px solid #d8b4fe", padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: "700", cursor: "pointer" }}>
                            🔒 View SEC Registration
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Moderation Actions */}
                  <div className="admin-employer-actions" style={{ display: "flex", gap: "8px", marginTop: "14px", flexWrap: "wrap" }}>
                    {!isApproved && (
                      <button
                        type="button"
                        className="job-edit-btn"
                        style={{ background: "#16a34a", color: "#fff", border: "none" }}
                        onClick={() => handlePromptAction(employer, "Approved")}
                      >
                        ✓ Approve Employer
                      </button>
                    )}

                    {status !== "Rejected" && (
                      <button
                        type="button"
                        className="job-status-btn"
                        style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5" }}
                        onClick={() => handlePromptAction(employer, "Rejected")}
                      >
                        ❌ Reject
                      </button>
                    )}

                    {status !== "Suspended" && (
                      <button
                        type="button"
                        className="job-status-btn"
                        style={{ background: "#450a0a", color: "#ffffff", border: "none" }}
                        onClick={() => handlePromptAction(employer, "Suspended")}
                      >
                        🚫 Suspend Employer
                      </button>
                    )}

                    <button type="button" className="job-delete-btn" onClick={() => handleRemoveEmployer(employer.id)}>
                      Remove
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Action Reason Modal */}
        {actionModal && (
          <div className="modal-overlay" onClick={() => setActionModal(null)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "480px" }}>
              <div className="modal-header">
                <div>
                  <h3 style={{ margin: 0, fontSize: "18px", color: actionModal.targetStatus === "Suspended" ? "#450a0a" : "#dc2626" }}>
                    {actionModal.targetStatus === "Rejected" ? "❌ Reject Employer Account" : "🚫 Suspend Employer Account"}
                  </h3>
                  <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#64748b" }}>
                    Employer: <strong>{displayUserName(actionModal.employer)}</strong> ({actionModal.employer.email})
                  </p>
                </div>
                <button className="modal-close-btn" onClick={() => setActionModal(null)}>×</button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!reasonInput.trim()) {
                    toast.error("Please enter a reason for this action.");
                    return;
                  }
                  executeStatusUpdate(actionModal.employer.id, actionModal.targetStatus, reasonInput.trim());
                }}
                style={{ padding: "20px 0" }}
              >
                <label style={{ display: "block", marginBottom: "14px", fontSize: "13px", fontWeight: "700", color: "#1e293b" }}>
                  Reason for {actionModal.targetStatus.toLowerCase()} *
                  <textarea
                    rows={4}
                    placeholder="Enter the official reason for this moderation decision..."
                    value={reasonInput}
                    onChange={(e) => setReasonInput(e.target.value)}
                    required
                    style={{ display: "block", width: "100%", marginTop: "6px", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                  />
                </label>

                <div className="modal-footer" style={{ display: "flex", justifyContent: "flex-end", gap: "12px", borderTop: "1px solid #e2e8f0", paddingTop: "16px" }}>
                  <button type="button" className="view-details-btn" onClick={() => setActionModal(null)}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="job-apply-primary"
                    disabled={submitting}
                    style={{ background: actionModal.targetStatus === "Suspended" ? "#450a0a" : "#dc2626" }}
                  >
                    {submitting ? "Processing..." : `Confirm ${actionModal.targetStatus}`}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </section>
    </DashboardLayout>
  );
}