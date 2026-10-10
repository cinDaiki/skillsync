import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { supabase } from "../../services/supabase";
import {
  fetchAdminJobseekers,
  updateCandidateVerification,
  suspendCandidateAccount,
  updateCandidateAdministrativeDetails,
  displayUserName,
  isAccountSuspended,
  parseJsonField,
  formatFileSize,
  SUSPENSION_REASON_OPTIONS,
  SUSPENSION_DURATION_PRESETS,
} from "../../services/adminService";
import { getPrivateDocumentSignedUrl, getCertificateSignedUrl } from "../../services/api";
import { getCategoryLabel, getSubcategoryLabel } from "../../constants/jobTaxonomy";
import ResumeViewerModal from "../../components/resume/ResumeViewerModal";

export default function ManageJobseekers() {
  const [jobseekers, setJobseekers] = useState([]);
  const [summary, setSummary] = useState({ total: 0, active: 0, suspended: 0, verified: 0, pending: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [verificationFilter, setVerificationFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Modals
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [verificationReviewCandidate, setVerificationReviewCandidate] = useState(null);
  const [verificationDocUrls, setVerificationDocUrls] = useState({ idUrl: null, selfieUrl: null, loading: false });
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  const [suspendModalCandidate, setSuspendModalCandidate] = useState(null);
  const [suspendReason, setSuspendReason] = useState("policy_violation");
  const [suspendDuration, setSuspendDuration] = useState("indefinite");
  const [customDateTimeInput, setCustomDateTimeInput] = useState("");
  const [confirmedCustomDateTime, setConfirmedCustomDateTime] = useState("");
  const [customDateError, setCustomDateError] = useState("");
  const [suspendNotes, setSuspendNotes] = useState("");

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

  const navigate = useNavigate();
  const [resetEmailSending, setResetEmailSending] = useState(false);

  const handleSendPasswordReset = async (email) => {
    if (!email) {
      showToast("No email address found for candidate.", "error");
      return;
    }
    setResetEmailSending(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        showToast(`Failed to send password reset email: ${error.message}`, "error");
      } else {
        showToast(`✓ Password reset email sent to ${email}.`, "success");
      }
    } catch (err) {
      showToast(`Error sending password reset: ${err?.message || "Unknown error"}`, "error");
    } finally {
      setResetEmailSending(false);
    }
  };

  const [editAdminCandidate, setEditAdminCandidate] = useState(null);
  const [editFormData, setEditFormData] = useState({ fullName: "", contactNumber: "", address: "" });

  const [activeResumeViewer, setActiveResumeViewer] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (text, type = "success") => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadJobseekers = useCallback(async () => {
    setLoading(true);
    const res = await fetchAdminJobseekers({
      search,
      verificationStatus: verificationFilter,
      page,
      pageSize,
    });
    setJobseekers(res.data || []);
    setTotalCount(res.totalCount || 0);
    setTotalPages(res.totalPages || 1);
    if (res.summary) setSummary(res.summary);
    setLoading(false);
  }, [search, verificationFilter, page, pageSize]);

  useEffect(() => {
    loadJobseekers();
  }, [loadJobseekers]);

  // Load verification signed URLs when opening verification review
  useEffect(() => {
    let isMounted = true;
    if (!verificationReviewCandidate) {
      setVerificationDocUrls({ idUrl: null, selfieUrl: null, loading: false });
      setShowRejectInput(false);
      setRejectionReason("");
      return;
    }

    async function fetchSignedUrls() {
      setVerificationDocUrls({ idUrl: null, selfieUrl: null, loading: true });
      let idUrl = null;
      let selfieUrl = null;

      const idPath = verificationReviewCandidate.id_image_url;
      const selfiePath = verificationReviewCandidate.selfie_image_url;

      if (idPath) {
        const { url } = await getPrivateDocumentSignedUrl(idPath);
        idUrl = url;
      }
      if (selfiePath) {
        const { url } = await getPrivateDocumentSignedUrl(selfiePath);
        selfieUrl = url;
      }

      if (isMounted) {
        setVerificationDocUrls({ idUrl, selfieUrl, loading: false });
      }
    }

    fetchSignedUrls();
    return () => { isMounted = false; };
  }, [verificationReviewCandidate]);

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleVerificationFilterChange = (e) => {
    setVerificationFilter(e.target.value);
    setPage(1);
  };

  const handleViewCertificate = async (fileUrl) => {
    if (!fileUrl) return;
    try {
      const { url } = await getCertificateSignedUrl(fileUrl);
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        window.open(fileUrl, "_blank", "noopener,noreferrer");
      }
    } catch {
      window.open(fileUrl, "_blank", "noopener,noreferrer");
    }
  };

  // --- VERIFICATION HANDLERS ---
  const handleApproveVerification = async () => {
    if (!verificationReviewCandidate) return;
    setActionLoading(true);
    const { error } = await updateCandidateVerification(verificationReviewCandidate.id, "Verified");
    setActionLoading(false);

    if (error) {
      showToast(`Failed to approve verification: ${error.message}`, "error");
      return;
    }

    showToast("✅ Candidate verification approved successfully.");
    setVerificationReviewCandidate(null);
    if (selectedCandidate?.id === verificationReviewCandidate.id) {
      setSelectedCandidate(prev => ({ ...prev, verification_status: "Verified" }));
    }
    loadJobseekers();
  };

  const handleRejectVerification = async () => {
    if (!verificationReviewCandidate) return;
    if (!rejectionReason.trim()) {
      showToast("Please provide a reason for rejecting verification.", "error");
      return;
    }

    setActionLoading(true);
    const { error } = await updateCandidateVerification(
      verificationReviewCandidate.id,
      "Rejected",
      rejectionReason.trim()
    );
    setActionLoading(false);

    if (error) {
      showToast(`Failed to reject verification: ${error.message}`, "error");
      return;
    }

    showToast("❌ Verification rejected with feedback sent to candidate.");
    setVerificationReviewCandidate(null);
    if (selectedCandidate?.id === verificationReviewCandidate.id) {
      setSelectedCandidate(prev => ({ ...prev, verification_status: "Rejected", verification_reason: rejectionReason.trim() }));
    }
    loadJobseekers();
  };

  // --- SUSPENSION HANDLERS ---
  const handleConfirmSuspend = async () => {
    if (!suspendModalCandidate) return;
    if (suspendDuration === "custom" && !confirmedCustomDateTime) {
      showToast("Please confirm a valid custom suspension expiry date and time.", "error");
      return;
    }
    setActionLoading(true);
    const { error } = await suspendCandidateAccount(suspendModalCandidate.id, {
      reasonCode: suspendReason,
      durationPreset: suspendDuration,
      customDateTime: confirmedCustomDateTime || null,
      internalNote: suspendNotes,
    });
    setActionLoading(false);

    if (error) {
      showToast(`Failed to suspend candidate: ${error.message}`, "error");
      return;
    }

    showToast("🚫 Candidate account suspended.");
    setSuspendModalCandidate(null);
    setSuspendNotes("");
    setSuspendDuration("indefinite");
    setCustomDateTimeInput("");
    setConfirmedCustomDateTime("");
    setCustomDateError("");
    if (selectedCandidate?.id === suspendModalCandidate.id) {
      setSelectedCandidate(prev => ({ ...prev, is_suspended: true }));
    }
    loadJobseekers();
  };

  // --- ADMIN EDIT HANDLER ---
  const handleOpenEdit = (cand) => {
    setEditAdminCandidate(cand);
    setEditFormData({
      fullName: cand.full_name || "",
      contactNumber: cand.contact_number || "",
      address: cand.address || cand.location || "",
    });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editAdminCandidate) return;

    setActionLoading(true);
    const { error } = await updateCandidateAdministrativeDetails(
      editAdminCandidate.id,
      editFormData,
      "Administrative profile correction"
    );
    setActionLoading(false);

    if (error) {
      showToast(`Failed to update candidate details: ${error.message}`, "error");
      return;
    }

    showToast("✓ Administrative details updated.");
    setEditAdminCandidate(null);
    if (selectedCandidate?.id === editAdminCandidate.id) {
      setSelectedCandidate(prev => ({
        ...prev,
        full_name: editFormData.fullName,
        contact_number: editFormData.contactNumber,
        address: editFormData.address,
      }));
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

    if (list.length === 0) return <span className="text-muted" style={{ fontSize: "12px", color: "#94a3b8" }}>Unspecified</span>;

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

  const renderVerificationBadge = (status, idImg) => {
    const isVerified = status === "Verified" || status === "Approved";
    const isRejected = status === "Rejected";
    const isUnderReview = status === "Under Review";
    const isPending = !isVerified && !isRejected && !isUnderReview;

    if (isVerified) {
      return (
        <span style={{ background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0", padding: "3px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: "700" }}>
          ✅ Verified
        </span>
      );
    }
    if (isRejected) {
      return (
        <span style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5", padding: "3px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: "700" }}>
          ❌ Rejected
        </span>
      );
    }
    if (isUnderReview) {
      return (
        <span style={{ background: "#e0e7ff", color: "#3730a3", border: "1px solid #c7d2fe", padding: "3px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: "700" }}>
          🔵 Under Review
        </span>
      );
    }
    return (
      <span style={{ background: idImg ? "#fef3c7" : "#f1f5f9", color: idImg ? "#92400e" : "#64748b", border: `1px solid ${idImg ? "#fde68a" : "#cbd5e1"}`, padding: "3px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: "700" }}>
        {idImg ? "🟡 Pending" : "⚪ No Submission"}
      </span>
    );
  };

  return (
    <DashboardLayout role="admin">
      <div className="admin-page-container" style={{ padding: "24px" }}>
        {/* Toast Notification */}
        {toastMessage && (
          <div style={{
            position: "fixed",
            top: "20px",
            right: "20px",
            background: toastMessage.type === "error" ? "#ef4444" : "#10b981",
            color: "#fff",
            padding: "12px 20px",
            borderRadius: "8px",
            zIndex: 9999,
            fontWeight: "600",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
          }}>
            {toastMessage.text}
          </div>
        )}

        {/* Page Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: "800", color: "#0f172a", margin: 0 }}>
              👤 Jobseeker Management
            </h1>
            <p style={{ color: "#64748b", fontSize: "14px", marginTop: "4px" }}>
              Manage candidate accounts, review identity verification, inspect professional profiles, and perform authorized account moderation.
            </p>
          </div>
        </div>

        {/* Summary Metric Cards */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "16px",
          marginBottom: "24px"
        }}>
          <div style={{ background: "#ffffff", padding: "16px", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "700", textTransform: "uppercase" }}>Total Candidates</span>
            <h3 style={{ fontSize: "22px", fontWeight: "800", color: "#0f172a", margin: "6px 0 0" }}>{summary.total ?? 0}</h3>
          </div>

          <div style={{ background: "#ffffff", padding: "16px", borderRadius: "12px", border: "1px solid #e2e8f0", borderLeft: "4px solid #16a34a", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "700", textTransform: "uppercase" }}>Active Accounts</span>
            <h3 style={{ fontSize: "22px", fontWeight: "800", color: "#16a34a", margin: "6px 0 0" }}>{summary.active ?? 0}</h3>
          </div>

          <div style={{ background: "#ffffff", padding: "16px", borderRadius: "12px", border: "1px solid #e2e8f0", borderLeft: "4px solid #f59e0b", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "700", textTransform: "uppercase" }}>Pending Verification</span>
            <h3 style={{ fontSize: "22px", fontWeight: "800", color: "#b45309", margin: "6px 0 0" }}>{summary.pending ?? 0}</h3>
          </div>

          <div style={{ background: "#ffffff", padding: "16px", borderRadius: "12px", border: "1px solid #e2e8f0", borderLeft: "4px solid #3b82f6", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "700", textTransform: "uppercase" }}>Verified Candidates</span>
            <h3 style={{ fontSize: "22px", fontWeight: "800", color: "#2563eb", margin: "6px 0 0" }}>{summary.verified ?? 0}</h3>
          </div>

          <div style={{ background: "#ffffff", padding: "16px", borderRadius: "12px", border: "1px solid #e2e8f0", borderLeft: "4px solid #dc2626", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "700", textTransform: "uppercase" }}>Suspended Accounts</span>
            <h3 style={{ fontSize: "22px", fontWeight: "800", color: "#dc2626", margin: "6px 0 0" }}>{summary.suspended ?? 0}</h3>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div style={{ display: "flex", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="🔍 Search candidate name, email, or city..."
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
            value={verificationFilter}
            onChange={handleVerificationFilterChange}
            style={{
              padding: "10px 14px",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              fontSize: "14px",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            <option value="all">All Verifications</option>
            <option value="pending">Pending Verification</option>
            <option value="under_review">Under Review</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
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
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", minWidth: "980px" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: "12px", textTransform: "uppercase", color: "#64748b", fontWeight: "700" }}>
                  <th style={{ padding: "14px 16px" }}>Candidate</th>
                  <th style={{ padding: "14px 16px" }}>Contact</th>
                  <th style={{ padding: "14px 16px" }}>Location</th>
                  <th style={{ padding: "14px 16px" }}>Primary Skills</th>
                  <th style={{ padding: "14px 16px" }}>Completion</th>
                  <th style={{ padding: "14px 16px" }}>Verification</th>
                  <th style={{ padding: "14px 16px" }}>Account Status</th>
                  <th style={{ padding: "14px 16px" }}>Registered</th>
                  <th style={{ padding: "14px 16px", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: "center", padding: "32px", color: "#64748b" }}>
                      Loading jobseeker profiles...
                    </td>
                  </tr>
                ) : jobseekers.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: "center", padding: "32px", color: "#64748b" }}>
                      No jobseekers found matching search criteria.
                    </td>
                  </tr>
                ) : (
                  jobseekers.map((cand) => {
                    const isSuspended = isAccountSuspended(cand);
                    const isVerified = cand.verification_status === "Verified" || cand.verification_status === "Approved";
                    const hasSubmittedVerification = Boolean(cand.id_image_url);

                    return (
                      <tr key={cand.id} style={{ borderBottom: "1px solid #f1f5f9", fontSize: "14px", transition: "background 0.15s" }}>
                        <td style={{ padding: "14px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <div style={{
                              width: "36px",
                              height: "36px",
                              borderRadius: "50%",
                              background: "linear-gradient(135deg, #8b18ff, #58158f)",
                              color: "#fff",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: "700",
                              fontSize: "14px"
                            }}>
                              {(cand.full_name || cand.email || "C").charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <strong style={{ display: "block", color: "#0f172a" }}>{displayUserName(cand)}</strong>
                              <span style={{ fontSize: "12px", color: "#64748b" }}>{cand.email}</span>
                            </div>
                          </div>
                        </td>

                        <td style={{ padding: "14px 16px", color: "#334155", fontSize: "13px" }}>
                          {cand.contact_number || "Not provided"}
                        </td>

                        <td style={{ padding: "14px 16px", color: "#334155", fontSize: "13px" }}>
                          {cand.address || cand.location || "Not specified"}
                        </td>

                        <td style={{ padding: "14px 16px" }}>
                          {renderSkills(cand.skills)}
                        </td>

                        <td style={{ padding: "14px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <div style={{ flex: 1, height: "6px", background: "#e2e8f0", borderRadius: "3px", overflow: "hidden", minWidth: "50px" }}>
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
                          {renderVerificationBadge(cand.verification_status, cand.id_image_url)}
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
                              border: `1px solid ${isSuspended ? "#fca5a5" : "#bbf7d0"}`
                            }}
                          >
                            {isSuspended ? "🚫 Suspended" : "✓ Active"}
                          </span>
                        </td>

                        <td style={{ padding: "14px 16px", color: "#64748b", fontSize: "13px" }}>
                          {formatDate(cand.created_at)}
                        </td>

                        <td style={{ padding: "14px 16px", textAlign: "right" }}>
                          <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", flexWrap: "wrap" }}>
                            <button
                              type="button"
                              onClick={() => setSelectedCandidate(cand)}
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
                              👁 View Details
                            </button>

                            {hasSubmittedVerification && !isVerified && (
                              <button
                                type="button"
                                onClick={() => setVerificationReviewCandidate(cand)}
                                style={{
                                  background: "#fef3c7",
                                  color: "#92400e",
                                  border: "1px solid #fde68a",
                                  padding: "6px 10px",
                                  borderRadius: "6px",
                                  fontSize: "12px",
                                  fontWeight: "700",
                                  cursor: "pointer",
                                }}
                              >
                                🛡 Review ID
                              </button>
                            )}

                            {!isSuspended ? (
                              <button
                                type="button"
                                onClick={() => setSuspendModalCandidate(cand)}
                                disabled={actionLoading}
                                style={{
                                  background: "#fef2f2",
                                  color: "#dc2626",
                                  border: "1px solid #fca5a5",
                                  padding: "6px 10px",
                                  borderRadius: "6px",
                                  fontSize: "12px",
                                  fontWeight: "600",
                                  cursor: "pointer",
                                }}
                              >
                                🚫 Suspend
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setRestoreModalCandidate(cand)}
                                disabled={actionLoading}
                                style={{
                                  background: "#dcfce7",
                                  color: "#166534",
                                  border: "1px solid #bbf7d0",
                                  padding: "6px 10px",
                                  borderRadius: "6px",
                                  fontSize: "12px",
                                  fontWeight: "700",
                                  cursor: "pointer",
                                }}
                              >
                                ✓ Restore
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", background: "#f8fafc", borderTop: "1px solid #e2e8f0", fontSize: "13px", color: "#64748b" }}>
            <span>Showing {jobseekers.length} of {totalCount} candidates</span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: page <= 1 ? "#f1f5f9" : "#fff",
                  cursor: page <= 1 ? "not-allowed" : "pointer",
                }}
              >
                Previous
              </button>
              <span style={{ alignSelf: "center", fontWeight: "600" }}>Page {page} of {totalPages}</span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: page <= 1 ? "#f1f5f9" : "#fff",
                  cursor: page <= 1 ? "not-allowed" : "pointer",
                }}
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {/* 1. CANDIDATE DETAILS MODAL */}
        {selectedCandidate && (() => {
          const cand = selectedCandidate;
          const isSuspended = isAccountSuspended(cand);
          const hasResume = Boolean(cand.resume_url || cand.resume?.file_url);

          const educationList = parseJsonField(cand.education, []);
          const workExpList = parseJsonField(cand.work_experience || cand.experience, []);
          const certList = parseJsonField(cand.certifications, []);
          const portfolioData = parseJsonField(cand.portfolio_links, {});
          const socialData = parseJsonField(cand.social_links, {});

          // Parse skills safely
          let skillList = [];
          if (Array.isArray(cand.skills)) {
            skillList = cand.skills;
          } else if (typeof cand.skills === "string" && cand.skills.trim()) {
            skillList = cand.skills.split(",").map((s) => s.trim()).filter(Boolean);
          }

          // Career preferences
          const prefCategories = cand.preferred_categories || cand.career_preferences?.preferredCategories || [];
          const prefSubcategories = cand.preferred_subcategories || cand.career_preferences?.preferredSubcategories || [];
          const prefRoles = cand.preferred_roles || cand.career_preferences?.preferredRoles || [];
          const careerStage = cand.career_stage || cand.career_preferences?.careerStage || null;

          // Social and Portfolio links
          const portfolioUrl = portfolioData.portfolioUrl || portfolioData.portfolio || null;
          const githubUrl = socialData.githubUrl || socialData.github || portfolioData.githubUrl || null;
          const linkedinUrl = socialData.linkedinUrl || socialData.linkedin || portfolioData.linkedinUrl || null;
          const twitterUrl = socialData.twitterUrl || socialData.twitter || portfolioData.twitterUrl || null;

          return (
            <div className="modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}>
              <div style={{ background: "#ffffff", borderRadius: "16px", maxWidth: "780px", width: "100%", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)" }}>
                {/* Header */}
                <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    {cand.profile_picture_url ? (
                      <img
                        src={cand.profile_picture_url}
                        alt={displayUserName(cand)}
                        style={{ width: "50px", height: "50px", borderRadius: "50%", objectFit: "cover", border: "2px solid #8b18ff" }}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <div style={{ width: "50px", height: "50px", borderRadius: "50%", background: "linear-gradient(135deg, #8b18ff, #58158f)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", fontWeight: "800" }}>
                        {(cand.full_name || cand.email || "C").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <h3 style={{ margin: 0, fontSize: "19px", color: "#0f172a", fontWeight: "800" }}>{displayUserName(cand)}</h3>
                      <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#64748b" }}>
                        Candidate Account Profile · Registered {formatDate(cand.created_at)}
                      </p>
                    </div>
                  </div>
                  <button type="button" onClick={() => setSelectedCandidate(null)} style={{ background: "none", border: "none", fontSize: "24px", cursor: "pointer", color: "#64748b", lineHeight: 1 }}>×</button>
                </div>

                {/* Body */}
                <div style={{ padding: "24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "20px" }}>
                  {/* Account & Verification Status Banner */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px", padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div>
                      <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "700", textTransform: "uppercase" }}>Account Status</span>
                      <div style={{ marginTop: "3px" }}>
                        <span style={{ padding: "3px 8px", borderRadius: "12px", fontSize: "12px", fontWeight: "700", background: isSuspended ? "#fee2e2" : "#dcfce7", color: isSuspended ? "#991b1b" : "#15803d" }}>
                          {isSuspended ? "🚫 Suspended" : "✓ Active"}
                        </span>
                      </div>
                    </div>

                    <div>
                      <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "700", textTransform: "uppercase" }}>Identity Verification</span>
                      <div style={{ marginTop: "3px" }}>
                        {renderVerificationBadge(cand.verification_status, cand.id_image_url)}
                      </div>
                    </div>

                    <div>
                      <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "700", textTransform: "uppercase" }}>Profile Completion</span>
                      <div style={{ marginTop: "3px", fontWeight: "800", fontSize: "14px", color: "#0f172a" }}>
                        {cand.profile_completion || 0}%
                      </div>
                    </div>

                    <div>
                      <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "700", textTransform: "uppercase" }}>Search Visibility</span>
                      <div style={{ marginTop: "3px" }}>
                        <span style={{
                          padding: "3px 8px",
                          borderRadius: "12px",
                          fontSize: "12px",
                          fontWeight: "700",
                          background: cand.visibility !== false ? "#eff6ff" : "#f1f5f9",
                          color: cand.visibility !== false ? "#1d4ed8" : "#475569",
                          border: `1px solid ${cand.visibility !== false ? "#bfdbfe" : "#cbd5e1"}`
                        }}>
                          {cand.visibility !== false ? "👁️ Public" : "🔒 Private"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 1. Basic & Contact Information */}
                  <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "16px" }}>
                    <h4 style={{ margin: "0 0 12px 0", fontSize: "14px", fontWeight: "700", color: "#0f172a", display: "flex", alignItems: "center", gap: "6px" }}>
                      📞 Basic Profile & Contact Information
                    </h4>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px", fontSize: "13px" }}>
                      <div><span style={{ color: "#64748b" }}>Full Name:</span> <strong style={{ color: "#0f172a", display: "block" }}>{cand.full_name || "Not provided"}</strong></div>
                      <div><span style={{ color: "#64748b" }}>Email:</span> <strong style={{ color: "#0f172a", display: "block" }}>{cand.email || "Not provided"}</strong></div>
                      <div><span style={{ color: "#64748b" }}>Phone Number:</span> <strong style={{ color: "#0f172a", display: "block" }}>{cand.contact_number || "Not provided"}</strong></div>
                      <div><span style={{ color: "#64748b" }}>Location / Address:</span> <strong style={{ color: "#0f172a", display: "block" }}>{cand.address || cand.location || "Not provided"}</strong></div>
                      <div><span style={{ color: "#64748b" }}>Registration Date:</span> <strong style={{ color: "#0f172a", display: "block" }}>{formatDate(cand.created_at)}</strong></div>
                      <div>
                        <span style={{ color: "#64748b" }}>Search Visibility:</span>
                        <strong style={{ color: "#0f172a", display: "block" }}>
                          {cand.visibility !== false ? "Public (Visible to employers)" : "Private (Hidden from search)"}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* 2. Skills & Competencies */}
                  <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "16px" }}>
                    <h4 style={{ margin: "0 0 12px 0", fontSize: "14px", fontWeight: "700", color: "#0f172a", display: "flex", alignItems: "center", gap: "6px" }}>
                      🛠 Skills & Competencies
                    </h4>
                    {skillList.length > 0 ? (
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        {skillList.map((sk, idx) => {
                          const label = typeof sk === "object" ? `${sk.name || "Skill"}${sk.proficiency || sk.level ? ` (${sk.proficiency || sk.level})` : ""}` : String(sk);
                          return (
                            <span
                              key={idx}
                              style={{
                                background: "#f0f9ff",
                                color: "#0369a1",
                                border: "1px solid #bae6fd",
                                padding: "4px 10px",
                                borderRadius: "6px",
                                fontSize: "12px",
                                fontWeight: "600",
                              }}
                            >
                              {label}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <span style={{ fontSize: "13px", color: "#94a3b8", fontStyle: "italic" }}>Not provided</span>
                    )}
                  </div>

                  {/* 3. Education & Work Experience */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px" }}>
                    {/* Education */}
                    <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "16px" }}>
                      <h4 style={{ margin: "0 0 12px 0", fontSize: "14px", fontWeight: "700", color: "#0f172a", display: "flex", alignItems: "center", gap: "6px" }}>
                        🎓 Education History
                      </h4>
                      {educationList.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                          {educationList.map((e, i) => (
                            <div key={i} style={{ padding: "10px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #f1f5f9", fontSize: "13px" }}>
                              <strong style={{ color: "#0f172a", display: "block" }}>
                                {typeof e === "object" ? (e.degree || e.qualification || e.education_level || "Degree not specified") : String(e)}
                              </strong>
                              {typeof e === "object" && (
                                <>
                                  <div style={{ color: "#475569", marginTop: "2px" }}>
                                    {e.field || e.course ? <span>Field: {e.field || e.course} · </span> : null}
                                    {e.education_level && e.degree && e.degree !== e.education_level ? <span>Level: {e.education_level} · </span> : null}
                                    <span>{e.school || e.institution || (e.is_normalized ? "" : "Institution not specified")}</span>
                                  </div>
                                  {(e.gradYear || e.year || e.dates || (e.startDate && e.endDate ? `${e.startDate} - ${e.endDate}` : e.startDate || e.endDate)) ? (
                                    <div style={{ color: "#64748b", fontSize: "12px", marginTop: "2px" }}>
                                      Year / Dates: {e.gradYear || e.year || e.dates || (e.startDate && e.endDate ? `${e.startDate} - ${e.endDate}` : e.startDate || e.endDate)}
                                    </div>
                                  ) : null}
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (cand.degree || cand.course || cand.education_level) ? (
                        <div style={{ padding: "10px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #f1f5f9", fontSize: "13px" }}>
                          <strong style={{ color: "#0f172a", display: "block" }}>{cand.degree || cand.education_level || "Degree not specified"}</strong>
                          {cand.course && <div style={{ color: "#475569", marginTop: "2px" }}>Field: {cand.course}</div>}
                          {cand.education_level && cand.degree && <div style={{ color: "#64748b", fontSize: "12px", marginTop: "2px" }}>Level: {cand.education_level}</div>}
                        </div>
                      ) : (
                        <span style={{ fontSize: "13px", color: "#94a3b8", fontStyle: "italic" }}>Not provided</span>
                      )}
                    </div>

                    {/* Work Experience */}
                    <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "16px" }}>
                      <h4 style={{ margin: "0 0 12px 0", fontSize: "14px", fontWeight: "700", color: "#0f172a", display: "flex", alignItems: "center", gap: "6px" }}>
                        💼 Employment & Work Experience
                      </h4>
                      {workExpList.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                          {workExpList.map((w, i) => (
                            <div key={i} style={{ padding: "10px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #f1f5f9", fontSize: "13px" }}>
                              <strong style={{ color: "#0f172a", display: "block" }}>
                                {typeof w === "object" ? (w.title || w.role || w.position || "Position not specified") : String(w)}
                              </strong>
                              {typeof w === "object" && (
                                <>
                                  <div style={{ color: "#475569", marginTop: "2px" }}>
                                    Employer: {w.company || w.employer || "Employer not specified"}
                                  </div>
                                  <div style={{ color: "#64748b", fontSize: "12px", marginTop: "2px" }}>
                                    Dates: {(w.startDate && w.endDate ? `${w.startDate} - ${w.endDate}` : w.startDate || w.endDate) || "Not provided"}
                                  </div>
                                  {w.description && (
                                    <div style={{ color: "#334155", fontSize: "12px", marginTop: "4px", whiteSpace: "pre-line" }}>
                                      {w.description}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (cand.years_experience !== null && cand.years_experience !== undefined && Number(cand.years_experience) > 0) ? (
                        <div style={{ padding: "10px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #f1f5f9", fontSize: "13px" }}>
                          <strong style={{ color: "#0f172a" }}>{cand.years_experience} years estimated experience</strong>
                        </div>
                      ) : (
                        <span style={{ fontSize: "13px", color: "#94a3b8", fontStyle: "italic" }}>Not provided</span>
                      )}
                    </div>
                  </div>

                  {/* 4. Projects, Portfolio & Social Links */}
                  <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "16px" }}>
                    <h4 style={{ margin: "0 0 12px 0", fontSize: "14px", fontWeight: "700", color: "#0f172a", display: "flex", alignItems: "center", gap: "6px" }}>
                      🌐 Projects, Portfolio & Social Profiles
                    </h4>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px", fontSize: "13px" }}>
                      <div>
                        <span style={{ color: "#64748b" }}>Portfolio Website:</span>
                        <div style={{ marginTop: "2px" }}>
                          {portfolioUrl ? (
                            <a href={portfolioUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb", fontWeight: "600", textDecoration: "none", wordBreak: "break-all" }}>
                              🔗 {portfolioUrl} ↗
                            </a>
                          ) : (
                            <span style={{ color: "#94a3b8", fontStyle: "italic" }}>Not provided</span>
                          )}
                        </div>
                      </div>

                      <div>
                        <span style={{ color: "#64748b" }}>GitHub Profile:</span>
                        <div style={{ marginTop: "2px" }}>
                          {githubUrl ? (
                            <a href={githubUrl.startsWith("http") ? githubUrl : `https://github.com/${githubUrl}`} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb", fontWeight: "600", textDecoration: "none", wordBreak: "break-all" }}>
                              🐙 {githubUrl} ↗
                            </a>
                          ) : (
                            <span style={{ color: "#94a3b8", fontStyle: "italic" }}>Not provided</span>
                          )}
                        </div>
                      </div>

                      <div>
                        <span style={{ color: "#64748b" }}>LinkedIn Profile:</span>
                        <div style={{ marginTop: "2px" }}>
                          {linkedinUrl ? (
                            <a href={linkedinUrl.startsWith("http") ? linkedinUrl : `https://linkedin.com/in/${linkedinUrl}`} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb", fontWeight: "600", textDecoration: "none", wordBreak: "break-all" }}>
                              💼 {linkedinUrl} ↗
                            </a>
                          ) : (
                            <span style={{ color: "#94a3b8", fontStyle: "italic" }}>Not provided</span>
                          )}
                        </div>
                      </div>

                      {twitterUrl && (
                        <div>
                          <span style={{ color: "#64748b" }}>Twitter / X:</span>
                          <div style={{ marginTop: "2px" }}>
                            <a href={twitterUrl.startsWith("http") ? twitterUrl : `https://twitter.com/${twitterUrl}`} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb", fontWeight: "600", textDecoration: "none", wordBreak: "break-all" }}>
                              🐦 {twitterUrl} ↗
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 5. Certifications & Achievements */}
                  <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "16px" }}>
                    <h4 style={{ margin: "0 0 12px 0", fontSize: "14px", fontWeight: "700", color: "#0f172a", display: "flex", alignItems: "center", gap: "6px" }}>
                      🏆 Certifications & Achievements
                    </h4>
                    {certList.length > 0 ? (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "10px" }}>
                        {certList.map((c, i) => (
                          <div key={i} style={{ padding: "10px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #f1f5f9", fontSize: "13px" }}>
                            <strong style={{ color: "#0f172a", display: "block" }}>
                              {typeof c === "object" ? (c.name || c.title || "Certification") : String(c)}
                            </strong>
                            {typeof c === "object" && (
                              <>
                                <div style={{ color: "#475569", marginTop: "2px" }}>Issuer: {c.issuer || "Issuer not specified"}</div>
                                <div style={{ color: "#64748b", fontSize: "12px", marginTop: "2px" }}>Date: {c.date || c.issueDate || "Not provided"}</div>
                                {c.credentialId && (
                                  <div style={{ color: "#64748b", fontSize: "12px", marginTop: "2px" }}>Credential ID: {c.credentialId}</div>
                                )}
                                {(c.fileUrl || c.file_url) && (
                                  <div style={{ marginTop: "6px" }}>
                                    <button
                                      type="button"
                                      onClick={() => handleViewCertificate(c.fileUrl || c.file_url)}
                                      style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "6px", padding: "4px 8px", fontSize: "11px", fontWeight: "700", color: "#0369a1", cursor: "pointer" }}
                                    >
                                      📎 View Certificate File
                                    </button>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span style={{ fontSize: "13px", color: "#94a3b8", fontStyle: "italic" }}>Not provided</span>
                    )}
                  </div>

                  {/* 6. Career Preferences */}
                  <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "16px" }}>
                    <h4 style={{ margin: "0 0 12px 0", fontSize: "14px", fontWeight: "700", color: "#0f172a", display: "flex", alignItems: "center", gap: "6px" }}>
                      🎯 Career Preferences & Targets
                    </h4>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", fontSize: "13px" }}>
                      <div>
                        <span style={{ color: "#64748b", fontWeight: "600", display: "block", marginBottom: "4px" }}>Career Stage:</span>
                        <strong style={{ color: "#0f172a" }}>{careerStage || "Not provided"}</strong>
                      </div>

                      <div>
                        <span style={{ color: "#64748b", fontWeight: "600", display: "block", marginBottom: "4px" }}>Preferred Categories:</span>
                        {prefCategories.length > 0 ? (
                          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                            {prefCategories.map((cat, i) => (
                              <span key={i} style={{ background: "#ecfdf5", color: "#047857", border: "1px solid #a7f3d0", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "600" }}>
                                {getCategoryLabel(cat)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: "#94a3b8", fontStyle: "italic" }}>Not provided</span>
                        )}
                      </div>

                      <div>
                        <span style={{ color: "#64748b", fontWeight: "600", display: "block", marginBottom: "4px" }}>Target Roles:</span>
                        {prefRoles.length > 0 ? (
                          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                            {prefRoles.map((role, i) => (
                              <span key={i} style={{ background: "#f5f3ff", color: "#6d28d9", border: "1px solid #ddd6fe", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "600" }}>
                                {role}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: "#94a3b8", fontStyle: "italic" }}>Not provided</span>
                        )}
                      </div>

                      <div>
                        <span style={{ color: "#64748b", fontWeight: "600", display: "block", marginBottom: "4px" }}>Preferred Subcategories:</span>
                        {prefSubcategories.length > 0 ? (
                          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                            {prefSubcategories.map((sub, i) => (
                              <span key={i} style={{ background: "#f8fafc", color: "#475569", border: "1px solid #e2e8f0", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "600" }}>
                                {getSubcategoryLabel(sub)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: "#94a3b8", fontStyle: "italic" }}>Not provided</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 7. Resume & Identity Verification Documents */}
                  <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "16px" }}>
                    <h4 style={{ margin: "0 0 12px 0", fontSize: "14px", fontWeight: "700", color: "#0f172a", display: "flex", alignItems: "center", gap: "6px" }}>
                      📄 Resume & Identity Verification Documents
                    </h4>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "14px" }}>
                      {/* Resume Box */}
                      <div style={{ padding: "12px", borderRadius: "10px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                        <span style={{ fontSize: "11px", fontWeight: "700", color: "#64748b", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>Resume File</span>
                        {hasResume ? (
                          <div>
                            <div style={{ fontSize: "13px", fontWeight: "700", color: "#0f172a", marginBottom: "2px" }}>
                              {cand.resume?.file_name || "Candidate Resume Document"}
                            </div>
                            <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "8px" }}>
                              {cand.resume?.file_size ? `${formatFileSize(cand.resume.file_size)} · ` : ""}
                              {cand.resume?.created_at ? `Uploaded ${formatDate(cand.resume.created_at)}` : ""}
                            </div>
                            <button
                              type="button"
                              onClick={() => setActiveResumeViewer({
                                id: cand.id,
                                applicant_id: cand.id,
                                profiles: cand,
                                displayName: displayUserName(cand),
                                resume: cand.resume || { file_url: cand.resume_url || cand.resume?.file_url }
                              })}
                              style={{ background: "#2563eb", color: "#fff", border: "none", padding: "7px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}
                            >
                              📄 Open Resume Viewer
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: "13px", color: "#94a3b8", fontStyle: "italic" }}>No resume uploaded yet</span>
                        )}
                      </div>

                      {/* Verification Box */}
                      <div style={{ padding: "12px", borderRadius: "10px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                        <span style={{ fontSize: "11px", fontWeight: "700", color: "#64748b", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>Identity Verification</span>
                        <div style={{ marginBottom: "8px" }}>
                          {renderVerificationBadge(cand.verification_status, cand.id_image_url)}
                        </div>
                        {cand.id_image_url ? (
                          <button
                            type="button"
                            onClick={() => setVerificationReviewCandidate(cand)}
                            style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a", padding: "7px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}
                          >
                            🛡 Review ID & Selfie Evidence
                          </button>
                        ) : (
                          <span style={{ fontSize: "13px", color: "#94a3b8", fontStyle: "italic", display: "block" }}>No ID documents submitted yet</span>
                        )}
                        {cand.verification_reason && (
                          <div style={{ marginTop: "6px", fontSize: "12px", color: "#991b1b", background: "#fee2e2", padding: "6px 10px", borderRadius: "6px" }}>
                            Feedback: {cand.verification_reason}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 8. Authorized Administration Controls */}
                  <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "16px", background: "#f8fafc", padding: "16px", borderRadius: "12px" }}>
                    <h4 style={{ margin: "0 0 10px 0", fontSize: "13px", fontWeight: "700", color: "#475569", textTransform: "uppercase" }}>⚙️ Authorized Account Moderation</h4>
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(cand)}
                        style={{ background: "#fff", color: "#1e293b", border: "1px solid #cbd5e1", padding: "8px 14px", borderRadius: "8px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}
                      >
                        ✏️ Edit Contact Info
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSendPasswordReset(cand.email)}
                        disabled={resetEmailSending || !cand.email}
                        style={{ background: "#fff", color: "#334155", border: "1px solid #cbd5e1", padding: "8px 14px", borderRadius: "8px", fontSize: "13px", fontWeight: "600", cursor: resetEmailSending || !cand.email ? "not-allowed" : "pointer" }}
                        title="Send password reset link via Supabase Auth to candidate's email"
                      >
                        {resetEmailSending ? "Sending Reset Email..." : "🔑 Send Password Reset Email"}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCandidate(null);
                          navigate(`/admin/audit-logs?search=${encodeURIComponent(cand.id || "")}`);
                        }}
                        style={{ background: "#fff", color: "#2563eb", border: "1px solid #bfdbfe", padding: "8px 14px", borderRadius: "8px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}
                      >
                        📜 View Audit Trail
                      </button>

                      {!isSuspended ? (
                        <button
                          type="button"
                          onClick={() => setSuspendModalCandidate(cand)}
                          style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5", padding: "8px 14px", borderRadius: "8px", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}
                        >
                          🚫 Suspend Account
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCandidate(null);
                            navigate("/admin/suspended-accounts");
                          }}
                          style={{ background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca", padding: "8px 14px", borderRadius: "8px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}
                        >
                          ⚠️ View in Suspended Accounts →
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div style={{ padding: "16px 24px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end" }}>
                  <button type="button" onClick={() => setSelectedCandidate(null)} style={{ background: "#e2e8f0", color: "#334155", border: "none", padding: "10px 18px", borderRadius: "8px", fontWeight: "600", cursor: "pointer" }}>
                    Close
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 2. VERIFICATION REVIEW MODAL */}
        {verificationReviewCandidate && (() => {
          const cand = verificationReviewCandidate;
          const isVerified = cand.verification_status === "Verified" || cand.verification_status === "Approved";

          return (
            <div className="modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: "20px" }}>
              <div style={{ background: "#ffffff", borderRadius: "16px", maxWidth: "650px", width: "100%", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
                <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "18px", color: "#0f172a" }}>🛡 Review Identity Verification</h3>
                    <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#64748b" }}>
                      Candidate: <strong>{displayUserName(cand)}</strong> ({cand.email})
                    </p>
                  </div>
                  <button type="button" onClick={() => setVerificationReviewCandidate(null)} style={{ background: "none", border: "none", fontSize: "22px", cursor: "pointer", color: "#64748b" }}>×</button>
                </div>

                <div style={{ padding: "24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "16px" }}>
                  {/* Current Status Note */}
                  <div style={{ padding: "12px 16px", borderRadius: "8px", background: isVerified ? "#dcfce7" : "#fffbeb", border: `1px solid ${isVerified ? "#bbf7d0" : "#fde68a"}`, fontSize: "13px" }}>
                    <span>Current Verification Status: <strong>{cand.verification_status || "Pending Verification"}</strong></span>
                  </div>

                  {/* ID Document & Selfie Previews */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                    <div>
                      <span style={{ fontSize: "12px", fontWeight: "700", color: "#475569", display: "block", marginBottom: "6px" }}>Government ID Document</span>
                      {verificationDocUrls.loading ? (
                        <div style={{ height: "160px", background: "#f1f5f9", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontSize: "12px" }}>Loading ID image...</div>
                      ) : verificationDocUrls.idUrl ? (
                        <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", overflow: "hidden" }}>
                          <img src={verificationDocUrls.idUrl} alt="ID Document" style={{ width: "100%", height: "160px", objectFit: "cover", display: "block" }} />
                          <div style={{ padding: "6px", textAlign: "center", background: "#f8fafc" }}>
                            <a href={verificationDocUrls.idUrl} target="_blank" rel="noreferrer" style={{ fontSize: "11px", color: "#2563eb", fontWeight: "600", textDecoration: "none" }}>Open full size ↗</a>
                          </div>
                        </div>
                      ) : (
                        <div style={{ height: "160px", background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: "12px" }}>No ID uploaded</div>
                      )}
                    </div>

                    <div>
                      <span style={{ fontSize: "12px", fontWeight: "700", color: "#475569", display: "block", marginBottom: "6px" }}>Candidate Selfie</span>
                      {verificationDocUrls.loading ? (
                        <div style={{ height: "160px", background: "#f1f5f9", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontSize: "12px" }}>Loading selfie...</div>
                      ) : verificationDocUrls.selfieUrl ? (
                        <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", overflow: "hidden" }}>
                          <img src={verificationDocUrls.selfieUrl} alt="Selfie" style={{ width: "100%", height: "160px", objectFit: "cover", display: "block" }} />
                          <div style={{ padding: "6px", textAlign: "center", background: "#f8fafc" }}>
                            <a href={verificationDocUrls.selfieUrl} target="_blank" rel="noreferrer" style={{ fontSize: "11px", color: "#2563eb", fontWeight: "600", textDecoration: "none" }}>Open full size ↗</a>
                          </div>
                        </div>
                      ) : (
                        <div style={{ height: "160px", background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: "12px" }}>No selfie uploaded</div>
                      )}
                    </div>
                  </div>

                  {/* Rejection input area */}
                  {showRejectInput && (
                    <div style={{ background: "#fef2f2", padding: "14px", borderRadius: "8px", border: "1px solid #fca5a5" }}>
                      <label style={{ fontSize: "12px", fontWeight: "700", color: "#991b1b", display: "block", marginBottom: "6px" }}>
                        Reason for rejection (Required feedback to candidate):
                      </label>
                      <textarea
                        rows={3}
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder="e.g. The submitted ID image is blurry or expired. Please upload a clear valid government ID."
                        style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #fca5a5", fontSize: "13px", outline: "none", boxSizing: "border-box" }}
                      />
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ padding: "16px 24px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <button type="button" onClick={() => setVerificationReviewCandidate(null)} style={{ background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1", padding: "10px 16px", borderRadius: "8px", fontWeight: "600", cursor: "pointer" }}>
                    Cancel
                  </button>

                  <div style={{ display: "flex", gap: "10px" }}>
                    {!showRejectInput ? (
                      <button
                        type="button"
                        onClick={() => setShowRejectInput(true)}
                        style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5", padding: "10px 16px", borderRadius: "8px", fontWeight: "700", cursor: "pointer" }}
                      >
                        ✕ Reject Verification
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleRejectVerification}
                        disabled={actionLoading || !rejectionReason.trim()}
                        style={{ background: "#dc2626", color: "#fff", border: "none", padding: "10px 16px", borderRadius: "8px", fontWeight: "700", cursor: "pointer" }}
                      >
                        Confirm Rejection
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleApproveVerification}
                      disabled={actionLoading}
                      style={{ background: "#16a34a", color: "#fff", border: "none", padding: "10px 18px", borderRadius: "8px", fontWeight: "700", cursor: "pointer" }}
                    >
                      ✓ Approve Verification
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 3. SUSPEND CONFIRMATION MODAL */}
        {suspendModalCandidate && (
          <div className="modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200, padding: "20px" }}>
            <div style={{ background: "#ffffff", borderRadius: "16px", maxWidth: "480px", width: "100%", padding: "24px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
              <h3 style={{ margin: "0 0 8px 0", color: "#991b1b", fontSize: "18px" }}>🚫 Suspend Candidate Account</h3>
              <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: "#475569" }}>
                Are you sure you want to suspend <strong>{displayUserName(suspendModalCandidate)}</strong>? This will restrict their access to application workflows while keeping their historical records intact.
              </p>

              <div style={{ marginBottom: "14px" }}>
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

              <div style={{ marginBottom: "14px" }}>
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
                <div style={{ marginBottom: "14px", background: "#f8fafc", padding: "14px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
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

              <div style={{ marginBottom: "20px" }}>
                <label style={{ fontSize: "12px", fontWeight: "700", color: "#334155", display: "block", marginBottom: "4px" }}>
                  Internal Moderation Note (Admin Only — Private):
                </label>
                <textarea
                  rows={3}
                  value={suspendNotes}
                  onChange={(e) => setSuspendNotes(e.target.value)}
                  placeholder="Optional internal administrative notes (never visible to candidate)..."
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px", boxSizing: "border-box" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => {
                    setSuspendModalCandidate(null);
                    setSuspendNotes("");
                    setSuspendDuration("indefinite");
                    setCustomDateTimeInput("");
                    setConfirmedCustomDateTime("");
                    setCustomDateError("");
                  }}
                  style={{ background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1", padding: "8px 14px", borderRadius: "8px", fontWeight: "600", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSuspend}
                  disabled={actionLoading || (suspendDuration === "custom" && !confirmedCustomDateTime)}
                  style={{
                    background: (actionLoading || (suspendDuration === "custom" && !confirmedCustomDateTime)) ? "#fca5a5" : "#dc2626",
                    color: "#fff",
                    border: "none",
                    padding: "8px 16px",
                    borderRadius: "8px",
                    fontWeight: "700",
                    cursor: (actionLoading || (suspendDuration === "custom" && !confirmedCustomDateTime)) ? "not-allowed" : "pointer"
                  }}
                >
                  {actionLoading ? "Suspending..." : "Confirm Suspension"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 5. ADMIN EDIT MODAL */}
        {editAdminCandidate && (
          <div className="modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200, padding: "20px" }}>
            <div style={{ background: "#ffffff", borderRadius: "16px", maxWidth: "480px", width: "100%", padding: "24px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
              <h3 style={{ margin: "0 0 4px 0", color: "#0f172a", fontSize: "18px" }}>✏️ Edit Administrative Details</h3>
              <p style={{ margin: "0 0 16px 0", fontSize: "12px", color: "#64748b" }}>
                Modify contact and identity details for administrative corrections. Professional background and application records remain candidate/employer-owned.
              </p>

              <form onSubmit={handleSaveEdit}>
                <div style={{ marginBottom: "12px" }}>
                  <label style={{ fontSize: "12px", fontWeight: "700", color: "#334155", display: "block", marginBottom: "4px" }}>Full Name:</label>
                  <input
                    type="text"
                    value={editFormData.fullName}
                    onChange={(e) => setEditFormData({ ...editFormData, fullName: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px", boxSizing: "border-box" }}
                  />
                </div>

                <div style={{ marginBottom: "12px" }}>
                  <label style={{ fontSize: "12px", fontWeight: "700", color: "#334155", display: "block", marginBottom: "4px" }}>Phone / Contact Number:</label>
                  <input
                    type="text"
                    value={editFormData.contactNumber}
                    onChange={(e) => setEditFormData({ ...editFormData, contactNumber: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px", boxSizing: "border-box" }}
                  />
                </div>

                <div style={{ marginBottom: "20px" }}>
                  <label style={{ fontSize: "12px", fontWeight: "700", color: "#334155", display: "block", marginBottom: "4px" }}>Location / Address:</label>
                  <input
                    type="text"
                    value={editFormData.address}
                    onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px", boxSizing: "border-box" }}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                  <button type="button" onClick={() => setEditAdminCandidate(null)} style={{ background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1", padding: "8px 14px", borderRadius: "8px", fontWeight: "600", cursor: "pointer" }}>
                    Cancel
                  </button>
                  <button type="submit" disabled={actionLoading} style={{ background: "#8b18ff", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "8px", fontWeight: "700", cursor: "pointer" }}>
                    {actionLoading ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* RESUME PREVIEW MODAL */}
        {activeResumeViewer && (
          <ResumeViewerModal
            applicant={activeResumeViewer}
            readOnly={true}
            context="admin"
            onClose={() => setActiveResumeViewer(null)}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
