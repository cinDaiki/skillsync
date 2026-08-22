import { useEffect, useState } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { supabase } from "../../services/supabase";
import {
  fetchAdminProfiles,
  fetchAdminApplications,
  fetchAdminResumes,
  toggleUserSuspension,
  deleteUser,
  updateUserProfile,
  displayUserName,
  isAccountSuspended,
} from "../../services/adminService";
import ResumeViewerModal from "../../components/resume/ResumeViewerModal";

export default function ManageUsers() {
  const [profiles, setProfiles] = useState([]);
  const [applications, setApplications] = useState([]);
  const [resumes, setResumes] = useState([]);
  
  const [selectedUser, setSelectedUser] = useState(null);
  const [editUser, setEditUser] = useState(null);
  const [verifyingId, setVerifyingId] = useState(null); // userId being approved/rejected
  
  // Search and Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [verifyFilter, setVerifyFilter] = useState("all"); // NEW: filter by verification status
  
  const [toast, setToast] = useState({ text: "", type: "success" });
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activeResumeViewer, setActiveResumeViewer] = useState(null);

  useEffect(() => {
    loadAllData();
  }, []);

  async function loadAllData() {
    setLoading(true);
    setLoadError("");
    try {
      const [profilesRes, appsRes, resumesRes] = await Promise.all([
        fetchAdminProfiles(),
        fetchAdminApplications(),
        fetchAdminResumes(),
      ]);

      if (profilesRes.error) {
        setLoadError(
          "Could not load platform users. Ensure public.profiles is fully configured."
        );
      }

      setProfiles(profilesRes.data || []);
      setApplications(appsRes.data || []);
      setResumes(resumesRes.data || []);
    } catch (err) {
      console.error(err);
      setLoadError("Failed to synchronize with Supabase tables.");
    } finally {
      setLoading(false);
    }
  }

  function showToast(text, type = "success") {
    setToast({ text, type });
    setTimeout(() => setToast({ text: "", type: "success" }), 4000);
  }

  // Suspend/Activate User
  async function handleToggleSuspend(userId, currentSuspension) {
    const nextStatus = !currentSuspension;
    const { error } = await toggleUserSuspension(userId, nextStatus);
    
    if (error) {
      showToast(`Failed to update suspension: ${error.message}`, "error");
      return;
    }

    setProfiles((prev) =>
      prev.map((p) => (p.id === userId ? { ...p, is_suspended: nextStatus } : p))
    );
    if (selectedUser?.id === userId) {
      setSelectedUser((prev) => ({ ...prev, is_suspended: nextStatus }));
    }
    
    showToast(`User account has been successfully ${nextStatus ? "suspended" : "reactivated"}.`);
  }

  // Remove User
  async function handleRemoveUser(userId) {
    if (!window.confirm("Are you sure you want to permanently delete this user account? All associated resumes and applications will also be destroyed.")) return;
    
    const { error } = await deleteUser(userId);
    if (error) {
      showToast(`Failed to remove user: ${error.message}`, "error");
      return;
    }

    setProfiles((prev) => prev.filter((p) => p.id !== userId));
    setResumes((prev) => prev.filter((r) => r.applicant_id !== userId));
    setApplications((prev) => prev.filter((a) => a.applicant_id !== userId));
    
    if (selectedUser?.id === userId) setSelectedUser(null);
    if (editUser?.id === userId) setEditUser(null);

    showToast("User account successfully removed.");
  }

  // Approve / Reject Identity Verification
  async function handleVerificationDecision(userId, decision) {
    // decision: 'Verified' or 'Rejected'
    setVerifyingId(userId);
    const { error } = await supabase
      .from("profiles")
      .update({ verification_status: decision })
      .eq("id", userId);

    if (error) {
      showToast(`Failed to update verification: ${error.message}`, "error");
      setVerifyingId(null);
      return;
    }

    setProfiles((prev) =>
      prev.map((p) => p.id === userId ? { ...p, verification_status: decision } : p)
    );
    if (selectedUser?.id === userId) {
      setSelectedUser((prev) => ({ ...prev, verification_status: decision }));
    }
    setVerifyingId(null);
    showToast(
      decision === "Verified"
        ? "✅ Identity Verified — Job Seeker can now apply to jobs."
        : "❌ Verification Rejected — Job Seeker has been notified."
    );
  }

  // Save User Edit
  async function handleSaveEdit(e) {
    e.preventDefault();
    setSubmitting(true);

    const { error } = await updateUserProfile(editUser.id, editUser);
    
    if (error) {
      showToast(`Failed to update user: ${error.message}`, "error");
      setSubmitting(false);
      return;
    }

    setProfiles((prev) =>
      prev.map((p) => (p.id === editUser.id ? { ...p, ...editUser, contact_number: editUser.contactNumber } : p))
    );
    
    if (selectedUser?.id === editUser.id) {
      setSelectedUser((prev) => ({
        ...prev,
        ...editUser,
        contact_number: editUser.contactNumber,
      }));
    }

    setEditUser(null);
    setSubmitting(false);
    showToast("User profile information successfully updated.");
  }

  function parseSkills(skillsString) {
    if (!skillsString) return [];
    return skillsString.split(",").map((s) => s.trim()).filter(Boolean);
  }

  function formatDate(dateString) {
    if (!dateString) return "No date";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function formatFileSize(size) {
    if (!size) return "0.00 KB";
    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} KB`;
    }
    return `${(size / 1024 / 1024).toFixed(2)} MB`;
  }

  // Filter Logic
  const filteredUsers = profiles.filter((user) => {
    const matchesSearch =
      displayUserName(user).toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.email || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.contact_number || "").includes(searchQuery);

    const matchesRole =
      roleFilter === "all" ||
      (roleFilter === "employer" && user.role === "employer") ||
      (roleFilter === "candidate" && (user.role === "candidate" || user.role === "job_seeker"));

    const isSuspended = isAccountSuspended(user);
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "suspended" && isSuspended) ||
      (statusFilter === "active" && !isSuspended);

    const matchesVerify =
      verifyFilter === "all" ||
      (verifyFilter === "pending" && user.verification_status === "Pending Verification") ||
      (verifyFilter === "under_review" && (user.verification_status === "Under Review" || (user.id_image_url && user.verification_status !== "Verified" && user.verification_status !== "Rejected"))) ||
      (verifyFilter === "verified" && user.verification_status === "Verified") ||
      (verifyFilter === "rejected" && user.verification_status === "Rejected");

    return matchesSearch && matchesRole && matchesStatus && matchesVerify;
  });

  // Count pending verifications for badge
  const pendingVerifyCount = profiles.filter(p =>
    p.role !== "employer" && p.id_image_url && p.verification_status !== "Verified" && p.verification_status !== "Rejected"
  ).length;

  return (
    <DashboardLayout
      role="admin"
      title="User Management"
      subtitle="View, search, suspend, edit, or delete platform accounts."
    >
      {/* Toast Alert */}
      {toast.text && (
        <div style={{
          position: "fixed",
          top: "20px",
          right: "20px",
          zIndex: 1000,
          background: toast.type === "error" ? "#fff1f2" : "#e9fbef",
          color: toast.type === "error" ? "#e11d48" : "#15803d",
          border: `1px solid ${toast.type === "error" ? "#fecdd3" : "#a7f3d0"}`,
          borderRadius: "12px",
          padding: "12px 24px",
          fontWeight: "900",
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          display: "flex",
          alignItems: "center",
          gap: "8px"
        }}>
          <span>{toast.type === "error" ? "⚠️" : "✓"}</span> {toast.text}
        </div>
      )}

      <div style={{ display: "grid", gap: "22px", gridTemplateColumns: selectedUser ? "1.3fr 1fr" : "1fr" }}>
        
        {/* MAIN PANEL */}
        <section className="dashboard-panel">
          <div className="panel-header users-panel-header" style={{ borderBottom: "none", marginBottom: "8px" }}>
            <div className="panel-header-content">
              <h2>Registered Platform Users ({filteredUsers.length})</h2>
              <p>Search candidates or employers, inspect complete files, suspend access, or modify profile parameters.</p>
            </div>
          </div>

          {/* ADVANCED FILTERS */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 1fr",
            gap: "12px",
            background: "#f9fafb",
            padding: "12px",
            borderRadius: "18px",
            border: "1px solid #f2f4f7",
            marginBottom: "20px"
          }}>
            <input
              type="text"
              placeholder="Search by full name, email, or phone number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ height: "44px", padding: "0 14px", fontSize: "14px", border: "1px solid #d0d5dd", borderRadius: "10px", outline: "none" }}
            />
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
              style={{ height: "44px", padding: "0 10px", fontSize: "14px", border: "1px solid #d0d5dd", borderRadius: "10px", outline: "none" }}>
              <option value="all">All Roles</option>
              <option value="candidate">Job Seekers</option>
              <option value="employer">Employers</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              style={{ height: "44px", padding: "0 10px", fontSize: "14px", border: "1px solid #d0d5dd", borderRadius: "10px", outline: "none" }}>
              <option value="all">All Statuses</option>
              <option value="active">Active Accounts</option>
              <option value="suspended">Suspended Accounts</option>
            </select>
            <select value={verifyFilter} onChange={(e) => setVerifyFilter(e.target.value)}
              style={{ height: "44px", padding: "0 10px", fontSize: "13px", border: pendingVerifyCount > 0 && verifyFilter !== "under_review" ? "2px solid #f59e0b" : "1px solid #d0d5dd", borderRadius: "10px", outline: "none", fontWeight: "800" }}>
              <option value="all">All Verifications</option>
              <option value="under_review">🔔 Needs Review {pendingVerifyCount > 0 ? `(${pendingVerifyCount})` : ""}</option>
              <option value="pending">Pending (No Upload)</option>
              <option value="verified">✅ Verified</option>
              <option value="rejected">❌ Rejected</option>
            </select>
          </div>

          {loadError && <div className="profile-message" style={{ background: "#fff1f2", color: "#e11d48" }}>{loadError}</div>}

          {loading ? (
            <div style={{ textAlign: "center", padding: "80px 0", fontSize: "16px", color: "#667085" }}>Loading platform directory...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="empty-state">
              <span>👥</span>
              <h3>No users found</h3>
              <p>Try refining your search terms or filter criteria.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: "12px" }}>
              {filteredUsers.map((user) => {
                const isUserSuspended = isAccountSuspended(user);
                return (
                  <article key={user.id} style={{
                    display: "flex",
                    flexDirection: "column",
                    padding: "16px 20px",
                    border: "1px solid #e7e2f2",
                    borderRadius: "20px",
                    background: selectedUser?.id === user.id ? "rgba(88, 21, 143, 0.03)" : "#ffffff",
                    borderColor: selectedUser?.id === user.id ? "#8b18ff" : "#e7e2f2",
                    transition: "0.2s ease"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                        <div style={{
                          width: "48px",
                          height: "48px",
                          borderRadius: "14px",
                          background: user.role === "employer" ? "linear-gradient(135deg, #3b82f6, #60a5fa)" : "linear-gradient(135deg, #58158f, #f13093)",
                          color: "#ffffff",
                          display: "grid",
                          placeItems: "center",
                          fontSize: "20px",
                          fontWeight: "900"
                        }}>
                          {(user.full_name || user.email || "U").charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "900", color: "#101828" }}>{displayUserName(user)}</h3>
                          <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#667085" }}>{user.email || "No email address"}</p>
                        </div>
                      </div>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        <span style={{
                          fontSize: "11px", fontWeight: "900", padding: "4px 8px", borderRadius: "6px",
                          background: user.role === "employer" ? "#e0f2fe" : "#f1e5ff",
                          color: user.role === "employer" ? "#0369a1" : "#8b18ff"
                        }}>
                          {user.role === "employer" ? "Employer" : "Job Seeker"}
                        </span>
                        <span style={{
                          fontSize: "11px", fontWeight: "900", padding: "4px 8px", borderRadius: "6px",
                          background: isUserSuspended ? "#fff1f2" : "#e9fbef",
                          color: isUserSuspended ? "#e11d48" : "#15803d"
                        }}>
                          {isUserSuspended ? "Suspended" : "Active"}
                        </span>
                        {user.role !== "employer" && (() => {
                          const vs = user.verification_status;
                          const hasUploaded = user.id_image_url;
                          if (vs === "Verified") return <span style={{ fontSize: "11px", fontWeight: "900", padding: "4px 8px", borderRadius: "6px", background: "#dcfce7", color: "#15803d" }}>✅ Verified</span>;
                          if (vs === "Rejected") return <span style={{ fontSize: "11px", fontWeight: "900", padding: "4px 8px", borderRadius: "6px", background: "#fff1f2", color: "#e11d48" }}>❌ Rejected</span>;
                          if (hasUploaded) return <span style={{ fontSize: "11px", fontWeight: "900", padding: "4px 8px", borderRadius: "6px", background: "#fef3c7", color: "#92400e" }}>🔔 Needs Review</span>;
                          return <span style={{ fontSize: "11px", fontWeight: "900", padding: "4px 8px", borderRadius: "6px", background: "#f3f4f6", color: "#6b7280" }}>⏳ Unverified</span>;
                        })()}
                      </div>
                    </div>

                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: "12px",
                      margin: "14px 0",
                      padding: "10px 14px",
                      background: "#f9fafb",
                      borderRadius: "12px",
                      fontSize: "12px"
                    }}>
                      <div>
                        <span style={{ display: "block", color: "#667085", fontWeight: "800", marginBottom: "2px" }}>Phone</span>
                        <strong style={{ color: "#344054" }}>{user.contact_number || "Not provided"}</strong>
                      </div>
                      <div>
                        <span style={{ display: "block", color: "#667085", fontWeight: "800", marginBottom: "2px" }}>Location</span>
                        <strong style={{ color: "#344054", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                          {user.address || "Not provided"}
                        </strong>
                      </div>
                      <div>
                        <span style={{ display: "block", color: "#667085", fontWeight: "800", marginBottom: "2px" }}>Registered</span>
                        <strong style={{ color: "#344054" }}>{formatDate(user.created_at)}</strong>
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid #f2f4f7", paddingTop: "12px" }}>
                      <button
                        type="button"
                        onClick={() => setSelectedUser(user)}
                        style={{
                          height: "36px",
                          padding: "0 14px",
                          borderRadius: "8px",
                          background: "#ffffff",
                          border: "1px solid #d0d5dd",
                          fontSize: "13px",
                          fontWeight: "800",
                          color: "#344054",
                          cursor: "pointer"
                        }}
                      >
                        Inspect Profile
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditUser({
                          id: user.id,
                          fullName: user.full_name || "",
                          email: user.email || "",
                          contactNumber: user.contact_number || "",
                          address: user.address || "",
                          skills: user.skills || "",
                          role: user.role || "candidate"
                        })}
                        style={{
                          height: "36px",
                          padding: "0 14px",
                          borderRadius: "8px",
                          background: "#ffffff",
                          border: "1px solid #d0d5dd",
                          fontSize: "13px",
                          fontWeight: "800",
                          color: "#344054",
                          cursor: "pointer"
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleSuspend(user.id, isUserSuspended)}
                        style={{
                          height: "36px",
                          padding: "0 14px",
                          borderRadius: "8px",
                          background: isUserSuspended ? "#e9fbef" : "#fff1f2",
                          border: "none",
                          fontSize: "13px",
                          fontWeight: "800",
                          color: isUserSuspended ? "#15803d" : "#e11d48",
                          cursor: "pointer"
                        }}
                      >
                        {isUserSuspended ? "Reactivate" : "Suspend"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveUser(user.id)}
                        style={{
                          height: "36px",
                          padding: "0 14px",
                          borderRadius: "8px",
                          background: "none",
                          border: "none",
                          fontSize: "13px",
                          fontWeight: "800",
                          color: "#98a2b3",
                          cursor: "pointer"
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* SIDE PROFILE SHEET */}
        {selectedUser && (
          <section className="dashboard-panel" style={{ height: "fit-content", position: "sticky", top: "20px" }}>
            <div className="panel-header users-panel-header">
              <div className="panel-header-content">
                <h2>User Dossier</h2>
                <p>Complete metadata overview for the selected platform user.</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  border: "none",
                  background: "#f3f4f6",
                  display: "grid",
                  placeItems: "center",
                  fontSize: "16px",
                  cursor: "pointer",
                  color: "#6b7280"
                }}
              >
                ×
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Header profile block */}
              <div style={{ display: "flex", alignItems: "center", gap: "16px", background: "#fbf9ff", padding: "16px", borderRadius: "16px", border: "1px solid #e7e2f2" }}>
                <div style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "16px",
                  background: "linear-gradient(135deg, #58158f, #f13093)",
                  color: "#ffffff",
                  display: "grid",
                  placeItems: "center",
                  fontSize: "24px",
                  fontWeight: "950"
                }}>
                  {(selectedUser.full_name || selectedUser.email || "U").charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "18px", color: "#101828", fontWeight: "950" }}>{displayUserName(selectedUser)}</h3>
                  <span style={{
                    fontSize: "11px",
                    fontWeight: "900",
                    padding: "3px 8px",
                    borderRadius: "6px",
                    background: isAccountSuspended(selectedUser) ? "#fff1f2" : "#e9fbef",
                    color: isAccountSuspended(selectedUser) ? "#e11d48" : "#15803d",
                    display: "inline-block",
                    marginTop: "6px"
                  }}>
                    {isAccountSuspended(selectedUser) ? "Access Suspended" : "Active Member"}
                  </span>
                </div>
              </div>

              {/* Personal Details */}
              <div>
                <h4 style={{ margin: "0 0 10px", fontSize: "14px", color: "#58158f", borderBottom: "1px solid #eee7f7", paddingBottom: "6px" }}>Contact & Bio</h4>
                <div style={{ display: "grid", gap: "10px", fontSize: "13px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#667085", fontWeight: "800" }}>Email Address</span>
                    <strong style={{ color: "#344054" }}>{selectedUser.email || "Not listed"}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#667085", fontWeight: "800" }}>Contact Number</span>
                    <strong style={{ color: "#344054" }}>{selectedUser.contact_number || "Not listed"}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#667085", fontWeight: "800" }}>Living Address</span>
                    <strong style={{ color: "#344054" }}>{selectedUser.address || "Not listed"}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#667085", fontWeight: "800" }}>Joined Date</span>
                    <strong style={{ color: "#344054" }}>{formatDate(selectedUser.created_at)}</strong>
                  </div>
                </div>
              </div>

              {/* Skills Tags */}
              <div>
                <h4 style={{ margin: "0 0 10px", fontSize: "14px", color: "#58158f", borderBottom: "1px solid #eee7f7", paddingBottom: "6px" }}>Extracted Skills</h4>
                {parseSkills(selectedUser.skills).length === 0 ? (
                  <span style={{ fontSize: "13px", color: "#98a2b3", fontStyle: "italic" }}>No skills listed on profile</span>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {parseSkills(selectedUser.skills).map((skill, index) => (
                      <span key={index} style={{
                        fontSize: "12px",
                        fontWeight: "800",
                        padding: "5px 10px",
                        background: "#f3f4f6",
                        color: "#374151",
                        borderRadius: "8px"
                      }}>{skill}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* Education & Experience snapshots */}
              <div>
                <h4 style={{ margin: "0 0 10px", fontSize: "14px", color: "#58158f", borderBottom: "1px solid #eee7f7", paddingBottom: "6px" }}>Education & Experience</h4>
                <div style={{ display: "grid", gap: "10px", fontSize: "13px", padding: "10px 14px", background: "#f9fafb", borderRadius: "12px", border: "1px dashed #e5e7eb" }}>
                  <div>
                    <span style={{ display: "block", color: "#6b7280", fontWeight: "bold" }}>Highest Qualification</span>
                    <strong style={{ color: "#111827" }}>
                      {selectedUser.role === "employer" ? "N/A - Employer Account" : "Bachelor of Science in Information Technology"}
                    </strong>
                  </div>
                  <div>
                    <span style={{ display: "block", color: "#6b7280", fontWeight: "bold" }}>Professional Experience</span>
                    <strong style={{ color: "#111827" }}>
                      {selectedUser.role === "employer" ? "N/A - Employer Account" : "Software Engineer (2+ Years experience)"}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Resume File Block */}
              {selectedUser.role !== "employer" && (
                <div>
                  <h4 style={{ margin: "0 0 10px", fontSize: "14px", color: "#58158f", borderBottom: "1px solid #eee7f7", paddingBottom: "6px" }}>Document & Resume Storage</h4>
                  {resumes.find((r) => r.applicant_id === selectedUser.id) ? (
                    (() => {
                      const userResume = resumes.find((r) => r.applicant_id === selectedUser.id);
                      return (
                        <div style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "12px 14px",
                          background: "#ffffff",
                          border: "1px solid #e7e2f2",
                          borderRadius: "12px"
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <span style={{ fontSize: "20px" }}>📄</span>
                            <div>
                              <strong style={{ display: "block", fontSize: "12px", color: "#101828", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {userResume.file_name || "Resume File"}
                              </strong>
                              <span style={{ fontSize: "10px", color: "#667085" }}>
                                {formatFileSize(userResume.file_size)} · Uploaded {formatDate(userResume.created_at)}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveResumeViewer({
                              resume: userResume,
                              profiles: selectedUser,
                              displayName: displayUserName(selectedUser)
                            })}
                            style={{
                              fontSize: "11px",
                              color: "#ffffff",
                              background: "linear-gradient(135deg, #58158f, #9b24ff)",
                              border: "none",
                              borderRadius: "6px",
                              padding: "6px 12px",
                              fontWeight: "900",
                              cursor: "pointer"
                            }}
                          >
                            Open Preview
                          </button>
                        </div>
                      );
                    })()
                  ) : (
                    <div style={{ padding: "12px", background: "#f9fafb", borderRadius: "12px", textAlign: "center", border: "1px dashed #e5e7eb" }}>
                      <span style={{ fontSize: "13px", color: "#667085" }}>No resume has been uploaded yet.</span>
                    </div>
                  )}
                </div>
              )}

              {/* ── Identity Verification Review ── */}
              {selectedUser.role !== "employer" && (
                <div>
                  <h4 style={{ margin: "0 0 10px", fontSize: "14px", color: "#58158f", borderBottom: "1px solid #eee7f7", paddingBottom: "6px", display: "flex", alignItems: "center", gap: "8px" }}>
                    🛡️ Identity Verification
                    <span style={{
                      fontSize: "11px", fontWeight: "900", padding: "2px 8px", borderRadius: "6px",
                      background: selectedUser.verification_status === "Verified" ? "#dcfce7" : selectedUser.verification_status === "Rejected" ? "#fff1f2" : selectedUser.id_image_url ? "#fef3c7" : "#f3f4f6",
                      color: selectedUser.verification_status === "Verified" ? "#15803d" : selectedUser.verification_status === "Rejected" ? "#e11d48" : selectedUser.id_image_url ? "#92400e" : "#6b7280"
                    }}>
                      {selectedUser.verification_status === "Verified" ? "✅ Verified" : selectedUser.verification_status === "Rejected" ? "❌ Rejected" : selectedUser.id_image_url ? "🔔 Needs Review" : "⏳ No Submission"}
                    </span>
                  </h4>

                  {/* Show ID and Selfie images */}
                  {selectedUser.id_image_url || selectedUser.selfie_image_url ? (
                    <div style={{ display: "grid", gap: "12px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                        {/* Valid ID */}
                        <div style={{ background: "#f9fafb", borderRadius: "10px", padding: "10px", border: "1px solid #e5e7eb" }}>
                          <p style={{ margin: "0 0 6px", fontSize: "11px", fontWeight: "800", color: "#6b7280" }}>📄 VALID ID</p>
                          {selectedUser.id_image_url ? (
                            <a href={selectedUser.id_image_url} target="_blank" rel="noopener noreferrer">
                              <img src={selectedUser.id_image_url} alt="Valid ID" style={{ width: "100%", borderRadius: "8px", objectFit: "cover", maxHeight: "100px", border: "1px solid #d1d5db" }} />
                            </a>
                          ) : (
                            <div style={{ height: "80px", display: "grid", placeItems: "center", color: "#9ca3af", fontSize: "12px" }}>No ID uploaded</div>
                          )}
                        </div>
                        {/* Selfie */}
                        <div style={{ background: "#f9fafb", borderRadius: "10px", padding: "10px", border: "1px solid #e5e7eb" }}>
                          <p style={{ margin: "0 0 6px", fontSize: "11px", fontWeight: "800", color: "#6b7280" }}>🤳 SELFIE</p>
                          {selectedUser.selfie_image_url ? (
                            <a href={selectedUser.selfie_image_url} target="_blank" rel="noopener noreferrer">
                              <img src={selectedUser.selfie_image_url} alt="Selfie" style={{ width: "100%", borderRadius: "8px", objectFit: "cover", maxHeight: "100px", border: "1px solid #d1d5db" }} />
                            </a>
                          ) : (
                            <div style={{ height: "80px", display: "grid", placeItems: "center", color: "#9ca3af", fontSize: "12px" }}>No selfie uploaded</div>
                          )}
                        </div>
                      </div>

                      {/* Approve / Reject Actions */}
                      {selectedUser.verification_status !== "Verified" && selectedUser.verification_status !== "Rejected" && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                          <button
                            type="button"
                            onClick={() => handleVerificationDecision(selectedUser.id, "Verified")}
                            disabled={verifyingId === selectedUser.id}
                            style={{
                              padding: "10px", borderRadius: "10px", border: "none", fontWeight: "900", fontSize: "13px",
                              background: "linear-gradient(135deg, #10b981, #059669)", color: "#fff", cursor: "pointer",
                              opacity: verifyingId === selectedUser.id ? 0.7 : 1
                            }}
                          >
                            {verifyingId === selectedUser.id ? "Processing..." : "✅ Approve"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleVerificationDecision(selectedUser.id, "Rejected")}
                            disabled={verifyingId === selectedUser.id}
                            style={{
                              padding: "10px", borderRadius: "10px", border: "none", fontWeight: "900", fontSize: "13px",
                              background: "linear-gradient(135deg, #ef4444, #dc2626)", color: "#fff", cursor: "pointer",
                              opacity: verifyingId === selectedUser.id ? 0.7 : 1
                            }}
                          >
                            {verifyingId === selectedUser.id ? "Processing..." : "❌ Reject"}
                          </button>
                        </div>
                      )}

                      {/* Already decided */}
                      {selectedUser.verification_status === "Verified" && (
                        <div style={{ padding: "10px", background: "#dcfce7", borderRadius: "10px", textAlign: "center", fontSize: "13px", fontWeight: "800", color: "#15803d" }}>
                          ✅ Identity Approved — Can apply to jobs
                        </div>
                      )}
                      {selectedUser.verification_status === "Rejected" && (
                        <div style={{ display: "grid", gap: "8px" }}>
                          <div style={{ padding: "10px", background: "#fff1f2", borderRadius: "10px", textAlign: "center", fontSize: "13px", fontWeight: "800", color: "#e11d48" }}>
                            ❌ Verification Rejected
                          </div>
                          <button type="button" onClick={() => handleVerificationDecision(selectedUser.id, "Verified")}
                            style={{ padding: "8px", borderRadius: "8px", border: "1px solid #10b981", background: "#f0fdf4", fontWeight: "800", fontSize: "12px", color: "#15803d", cursor: "pointer" }}>
                            Override: Mark as Verified
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ padding: "14px", background: "#f9fafb", borderRadius: "12px", textAlign: "center", border: "1px dashed #e5e7eb" }}>
                      <span style={{ fontSize: "13px", color: "#667085" }}>No verification documents submitted yet.</span>
                    </div>
                  )}
                </div>
              )}

              <div>
                <h4 style={{ margin: "0 0 10px", fontSize: "14px", color: "#58158f", borderBottom: "1px solid #eee7f7", paddingBottom: "6px" }}>Job Applications History</h4>
                {(() => {
                  const userApps = applications.filter((a) => a.applicant_id === selectedUser.id);
                  if (userApps.length === 0) {
                    return (
                      <span style={{ fontSize: "13px", color: "#98a2b3", fontStyle: "italic" }}>No submitted job applications recorded</span>
                    );
                  }
                  return (
                    <div style={{ display: "grid", gap: "8px" }}>
                      {userApps.map((app) => (
                        <div key={app.id} style={{
                          padding: "10px 12px",
                          background: "#f9fafb",
                          border: "1px solid #f2f4f7",
                          borderRadius: "10px",
                          fontSize: "12px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center"
                        }}>
                          <div>
                            <strong style={{ display: "block", color: "#101828" }}>{app.job_title || "Job Post"}</strong>
                            <span style={{ color: "#667085" }}>Applied {formatDate(app.created_at)}</span>
                          </div>
                          <span style={{
                            fontSize: "10px",
                            fontWeight: "900",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            background: app.status === "hired" ? "#e9fbef" : app.status === "rejected" ? "#fff1f2" : "#f1e5ff",
                            color: app.status === "hired" ? "#15803d" : app.status === "rejected" ? "#e11d48" : "#8b18ff"
                          }}>
                            {app.status || "applied"}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </section>
        )}
      </div>

      {/* EDIT USER MODAL */}
      {editUser && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.4)",
          display: "grid",
          placeItems: "center",
          zIndex: 900
        }}>
          <div style={{
            background: "#ffffff",
            borderRadius: "24px",
            padding: "30px",
            width: "560px",
            boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
            border: "1px solid #e7e2f2"
          }}>
            <h2 style={{ margin: "0 0 8px", fontSize: "20px", color: "#101828", fontWeight: "950" }}>Edit Profile Information</h2>
            <p style={{ margin: "0 0 20px", fontSize: "14px", color: "#667085" }}>Modify details below and click Save changes to commit to server.</p>

            <form onSubmit={handleSaveEdit} className="profile-form">
              <div className="profile-form-grid">
                <label>
                  <span>Full Name</span>
                  <input
                    type="text"
                    value={editUser.fullName}
                    onChange={(e) => setEditUser((prev) => ({ ...prev, fullName: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  <span>Email address</span>
                  <input
                    type="email"
                    value={editUser.email}
                    onChange={(e) => setEditUser((prev) => ({ ...prev, email: e.target.value }))}
                    required
                  />
                </label>
              </div>

              <div className="profile-form-grid">
                <label>
                  <span>Contact number</span>
                  <input
                    type="text"
                    value={editUser.contactNumber}
                    onChange={(e) => setEditUser((prev) => ({ ...prev, contactNumber: e.target.value }))}
                  />
                </label>
                <label>
                  <span>Account Role</span>
                  <select
                    value={editUser.role}
                    onChange={(e) => setEditUser((prev) => ({ ...prev, role: e.target.value }))}
                  >
                    <option value="candidate">Job Seeker</option>
                    <option value="employer">Employer</option>
                    <option value="admin">Administrator</option>
                  </select>
                </label>
              </div>

              <label>
                <span>Living Address</span>
                <input
                  type="text"
                  value={editUser.address}
                  onChange={(e) => setEditUser((prev) => ({ ...prev, address: e.target.value }))}
                />
              </label>

              <label>
                <span>Skills (separated by commas)</span>
                <input
                  type="text"
                  value={editUser.skills}
                  onChange={(e) => setEditUser((prev) => ({ ...prev, skills: e.target.value }))}
                  placeholder="e.g. React, Node, SQL"
                />
              </label>

              <div className="profile-actions" style={{ marginTop: "10px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="profile-cancel-btn"
                  onClick={() => setEditUser(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="profile-save-btn"
                  disabled={submitting}
                >
                  {submitting ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESUME PREVIEWER MODAL */}
      {activeResumeViewer && (
        <ResumeViewerModal
          applicant={activeResumeViewer}
          onClose={() => setActiveResumeViewer(null)}
        />
      )}
    </DashboardLayout>
  );
}