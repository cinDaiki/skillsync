import { useEffect, useState, useCallback } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { useToast } from "../../contexts/ToastContext";
import { supabase } from "../../services/supabase";
import { fetchAdminJobs, moderateJobStatus } from "../../services/adminService";
import { parseJobRequirements } from "../../utils/jobRequirementsHelper";

export default function AdminManageJobs() {
  const toast = useToast();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [workSetupFilter, setWorkSetupFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Modal states
  const [viewJobModal, setViewJobModal] = useState(null); // job object
  const [viewEmployerModal, setViewEmployerModal] = useState(null); // employer object
  const [rejectionModal, setRejectionModal] = useState(null); // job object
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

  async function handleApproveJob(job) {
    setSubmitting(true);
    const { error } = await moderateJobStatus(job.id, "open", "");
    setSubmitting(false);

    if (error) {
      toast.error("Failed to approve job: " + error.message);
      return;
    }

    toast.success(`Job "${job.title}" has been approved and is now live!`);
    if (viewJobModal?.id === job.id) setViewJobModal(null);
    loadJobs();
  }

  function handleOpenRejectModal(job) {
    setRejectionModal(job);
    setRejectionReason("");
  }

  async function handleConfirmRejection() {
    if (!rejectionReason.trim()) {
      toast.error("Please enter a non-empty reason for rejecting this job posting.");
      return;
    }

    setSubmitting(true);
    const { error } = await moderateJobStatus(rejectionModal.id, "rejected", rejectionReason.trim());
    setSubmitting(false);

    if (error) {
      toast.error("Failed to reject job: " + error.message);
      return;
    }

    toast.success(`Job "${rejectionModal.title}" rejected with explanation recorded.`);
    setRejectionModal(null);
    if (viewJobModal?.id === rejectionModal.id) setViewJobModal(null);
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

  async function handleDeleteJob(jobId) {
    if (!window.confirm("Are you sure you want to permanently delete this job posting?")) return;
    await supabase.from("jobs").delete().eq("id", jobId);
    toast.success("Job post deleted.");
    loadJobs();
  }

  function formatDate(dateString) {
    if (!dateString) return "No date";
    return new Date(dateString).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  return (
    <DashboardLayout
      role="admin"
      title="Job Moderation Engine"
      subtitle="Audit pending job postings, verify employer information, approve live listings, or issue rejection feedback."
    >
      <div className="admin-page-container" style={{ padding: "24px" }}>
        {/* Header Summary Bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: "800", color: "#0f172a", margin: 0 }}>
              💼 Job Moderation Workspace
            </h1>
            <p style={{ color: "#64748b", fontSize: "14px", marginTop: "4px" }}>
              Filter postings by review status, inspect employer credentials, and publish verified opportunities.
            </p>
          </div>

          <div style={{ background: "#f1f5f9", padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: "700", color: "#334155" }}>
            Total Job Postings: <span style={{ color: "#2563eb" }}>{totalCount}</span>
          </div>
        </div>

        {loadError && (
          <div style={{ padding: "12px 16px", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: "8px", color: "#991b1b", fontSize: "13px", marginBottom: "16px" }}>
            {loadError}
          </div>
        )}

        {/* Filter Controls Bar */}
        <div style={{ display: "flex", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
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
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
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
            <option value="all">All Statuses</option>
            <option value="pending_review">Pending Review</option>
            <option value="open">Open / Active</option>
            <option value="rejected">Rejected</option>
            <option value="closed">Closed</option>
          </select>

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

        {/* Job Cards Grid */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#64748b", background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
            Loading job postings...
          </div>
        ) : jobs.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#64748b", background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
            No job postings found matching search and filter criteria.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: "16px" }}>
            {jobs.map((job) => {
              const emp = job.employer_info || {};
              const isOpen = job.status === "open";
              const isPending = job.status === "pending_review";
              const isRejected = job.status === "rejected";

              return (
                <div
                  key={job.id}
                  style={{
                    background: "#fff",
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    padding: "20px",
                    display: "flex",
                    flexDirection: "column",
                    justify: "space-between",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  }}
                >
                  <div>
                    {/* Header with Title & Status */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px", marginBottom: "8px" }}>
                      <h3 style={{ fontSize: "17px", fontWeight: "800", color: "#0f172a", margin: 0, lineHeight: 1.3 }}>
                        {job.title}
                      </h3>
                      <span
                        style={{
                          padding: "3px 10px",
                          borderRadius: "12px",
                          fontSize: "11px",
                          fontWeight: "700",
                          whiteSpace: "nowrap",
                          background: isOpen ? "#dcfce7" : isPending ? "#fef3c7" : isRejected ? "#fee2e2" : "#f1f5f9",
                          color: isOpen ? "#15803d" : isPending ? "#b45309" : isRejected ? "#dc2626" : "#475569",
                        }}
                      >
                        {isOpen ? "✓ Open" : isPending ? "⏳ Pending Review" : isRejected ? "❌ Rejected" : "Closed"}
                      </span>
                    </div>

                    <div style={{ fontSize: "14px", fontWeight: "700", color: "#2563eb", marginBottom: "8px" }}>
                      🏢 {emp.company_name}
                    </div>

                    {/* Employer Context */}
                    <div style={{ fontSize: "12px", color: "#64748b", background: "#f8fafc", padding: "8px 12px", borderRadius: "6px", marginBottom: "12px" }}>
                      <div>👤 <strong>Poster:</strong> {emp.contact_name}</div>
                      <div>✉ <strong>Email:</strong> {emp.contact_email}</div>
                    </div>

                    {/* Key Details */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", fontSize: "12px", color: "#475569", marginBottom: "12px" }}>
                      <div>📍 {job.location || emp.location || "Location unstated"}</div>
                      <div>🏠 {job.work_setup || job.employment_type || "Full-time"}</div>
                      <div>💰 {job.salary_range || "Salary unstated"}</div>
                      <div>⏳ {formatDate(job.created_at)}</div>
                    </div>

                    {/* Rejection Alert if rejected */}
                    {isRejected && job.rejection_reason && (
                      <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "6px", padding: "8px 10px", fontSize: "12px", color: "#991b1b", marginBottom: "12px" }}>
                        <strong>Rejection Reason:</strong> "{job.rejection_reason}"
                      </div>
                    )}
                  </div>

                  {/* Card Actions Toolbar */}
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", borderTop: "1px solid #f1f5f9", paddingTop: "12px", marginTop: "12px" }}>
                    <button
                      type="button"
                      onClick={() => setViewJobModal(job)}
                      style={{ flex: 1, background: "#f1f5f9", color: "#1e293b", border: "1px solid #cbd5e1", padding: "6px 8px", borderRadius: "6px", fontSize: "12px", fontWeight: "600", cursor: "pointer" }}
                    >
                      📄 View Job
                    </button>

                    <button
                      type="button"
                      onClick={() => setViewEmployerModal(emp)}
                      style={{ flex: 1, background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", padding: "6px 8px", borderRadius: "6px", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}
                    >
                      🏢 Employer
                    </button>

                    {!isOpen && (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => handleApproveJob(job)}
                        style={{ background: "#16a34a", color: "#fff", border: "none", padding: "6px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}
                      >
                        ✓ Approve
                      </button>
                    )}

                    {!isRejected && (
                      <button
                        type="button"
                        onClick={() => handleOpenRejectModal(job)}
                        style={{ background: "#dc2626", color: "#fff", border: "none", padding: "6px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}
                      >
                        ❌ Reject
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Server-Side Pagination Footer */}
        <div style={{ padding: "14px 16px", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px", color: "#64748b", marginTop: "20px" }}>
          <div>
            Showing {jobs.length > 0 ? (page - 1) * pageSize + 1 : 0} to {Math.min(page * pageSize, totalCount)} of {totalCount} jobs
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

      {/* Rejection Reason Input Modal */}
      {rejectionModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15, 23, 42, 0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000, padding: "20px" }}>
          <div style={{ background: "#fff", borderRadius: "16px", padding: "24px", maxWidth: "500px", width: "100%", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
            <h3 style={{ fontSize: "18px", fontWeight: "800", color: "#dc2626", margin: 0 }}>
              Reject Job Posting
            </h3>
            <p style={{ color: "#475569", fontSize: "14px", marginTop: "6px" }}>
              Target Job: <strong>"{rejectionModal.title}"</strong>
            </p>

            <div style={{ marginTop: "12px" }}>
              <label style={{ fontSize: "13px", fontWeight: "700", color: "#334155", display: "block", marginBottom: "6px" }}>
                Reason for Rejection <span style={{ color: "#dc2626" }}>* (Required)</span>
              </label>
              <textarea
                rows={4}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explain why this job post was rejected (e.g. Missing required salary range, misleading description, unverified contact)..."
                style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px", outline: "none" }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}>
              <button
                type="button"
                onClick={() => setRejectionModal(null)}
                style={{ background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1", padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}
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

      {/* Full Job Details Modal */}
      {viewJobModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15, 23, 42, 0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000, padding: "20px" }}>
          <div style={{ background: "#fff", borderRadius: "16px", maxWidth: "700px", width: "100%", maxHeight: "90vh", overflowY: "auto", padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
              <div>
                <h2 style={{ fontSize: "22px", fontWeight: "800", color: "#0f172a", margin: 0 }}>
                  {viewJobModal.title}
                </h2>
                <span style={{ fontSize: "14px", fontWeight: "700", color: "#2563eb" }}>
                  🏢 {viewJobModal.employer_info?.company_name || viewJobModal.company_name}
                </span>
              </div>

              <button type="button" onClick={() => setViewJobModal(null)} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#64748b" }}>
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
                <span style={{ fontSize: "12px", fontWeight: "800", textTransform: "uppercase", color: "#64748b", display: "block", marginBottom: "6px" }}>Required Skills</span>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {(typeof viewJobModal.required_skills === "string" ? viewJobModal.required_skills.split(",") : viewJobModal.required_skills).map((sk, idx) => (
                    <span key={idx} style={{ background: "#e0f2fe", color: "#0369a1", padding: "4px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "600" }}>
                      {sk.trim ? sk.trim() : sk}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginBottom: "20px" }}>
              <span style={{ fontSize: "12px", fontWeight: "800", textTransform: "uppercase", color: "#64748b", display: "block", marginBottom: "6px" }}>Job Description</span>
              <div style={{ fontSize: "14px", color: "#334155", background: "#fff", padding: "12px", border: "1px solid #e2e8f0", borderRadius: "8px", whiteSpace: "pre-wrap", lineHeight: "1.5" }}>
                {viewJobModal.description}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid #e2e8f0", paddingTop: "16px" }}>
              {viewJobModal.status !== "open" && (
                <button type="button" onClick={() => handleApproveJob(viewJobModal)} style={{ background: "#16a34a", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>
                  ✓ Approve Job
                </button>
              )}

              {viewJobModal.status !== "rejected" && (
                <button type="button" onClick={() => handleOpenRejectModal(viewJobModal)} style={{ background: "#dc2626", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>
                  ❌ Reject Job
                </button>
              )}

              <button type="button" onClick={() => setViewJobModal(null)} style={{ background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1", padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Employer Details Modal */}
      {viewEmployerModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15, 23, 42, 0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000, padding: "20px" }}>
          <div style={{ background: "#fff", borderRadius: "16px", maxWidth: "600px", width: "100%", maxHeight: "90vh", overflowY: "auto", padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
              <div>
                <h2 style={{ fontSize: "20px", fontWeight: "800", color: "#0f172a", margin: 0 }}>
                  {viewEmployerModal.company_name}
                </h2>
                <span style={{ fontSize: "13px", color: "#64748b" }}>
                  Status: <strong style={{ color: viewEmployerModal.verification_status === "Approved" ? "#16a34a" : "#b45309" }}>{viewEmployerModal.verification_status}</strong>
                </span>
              </div>
              <button type="button" onClick={() => setViewEmployerModal(null)} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#64748b" }}>
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
                  <button type="button" onClick={() => handleAdminViewDoc(viewEmployerModal.id_image_url)} style={{ background: "#fff", color: "#58158f", border: "1px solid #d8b4fe", padding: "4px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>
                    🔒 Government ID
                  </button>
                )}
                {viewEmployerModal.selfie_image_url && (
                  <button type="button" onClick={() => handleAdminViewDoc(viewEmployerModal.selfie_image_url)} style={{ background: "#fff", color: "#58158f", border: "1px solid #d8b4fe", padding: "4px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>
                    🔒 Selfie with ID
                  </button>
                )}
                {viewEmployerModal.business_permit_url && (
                  <button type="button" onClick={() => handleAdminViewDoc(viewEmployerModal.business_permit_url)} style={{ background: "#fff", color: "#58158f", border: "1px solid #d8b4fe", padding: "4px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>
                    🔒 Business Permit
                  </button>
                )}
                {viewEmployerModal.sec_registration_url && (
                  <button type="button" onClick={() => handleAdminViewDoc(viewEmployerModal.sec_registration_url)} style={{ background: "#fff", color: "#58158f", border: "1px solid #d8b4fe", padding: "4px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>
                    🔒 SEC Registration
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", borderTop: "1px solid #e2e8f0", paddingTop: "16px" }}>
              <button type="button" onClick={() => setViewEmployerModal(null)} style={{ background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1", padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}>
                Close Employer Details
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
