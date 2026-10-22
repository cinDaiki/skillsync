import JobMatchScore from "../alignment/JobMatchScore.jsx";
import { useEffect, useState, useRef } from "react";
import { getResumeViewUrl, getCertificateSignedUrl, extractResumeStoragePath } from "../../services/api.js";
import { supabase } from "../../services/supabase.js";
import { isTerminalApplication, isScreeningStatus } from "../../services/recruitmentStatus.js";
import { downloadDocxResume } from "../../services/docxResumeGenerator.js";

function getFileName(resume) {
  return resume?.file_name || resume?.name || "Resume";
}

function isPdfFile(resume) {
  const name = getFileName(resume).toLowerCase();
  const url = (resume?.file_url || "").toLowerCase();
  return name.endsWith(".pdf") || url.includes(".pdf");
}

function formatFileSize(size) {
  if (!size) return null;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(dateString) {
  if (!dateString) return null;
  try {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return null;
  }
}

function formatBackgroundText(val) {
  if (!val) return "Not provided";
  if (Array.isArray(val)) {
    if (val.length === 0) return "Not provided";
    return val.filter(Boolean).join(", ") || "Not provided";
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed || trimmed === "[]" || trimmed === "null" || trimmed === "undefined") {
      return "Not provided";
    }
    return trimmed;
  }
  return "Not provided";
}

function parseSkills(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean).map(s => s.trim().toLowerCase());
  if (typeof raw === "string") {
    return raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  }
  return [];
}

export default function ResumeViewerModal({
  applicant,
  onClose,
  onShortlist,
  readOnly = false,
  context = "default"
}) {
  const [viewUrl, setViewUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAllSkills, setShowAllSkills] = useState(false);
  const [showCoverLetter, setShowCoverLetter] = useState(false);

  const dialogRef = useRef(null);
  const previouslyFocusedElementRef = useRef(null);

  const resume = applicant?.resume;
  const profile = applicant?.profiles;
  const snapshot = applicant?.applicant_snapshot || {};
  const displayName = applicant?.displayName || profile?.full_name || snapshot?.full_name || "Unnamed Applicant";
  const job = applicant?.jobs;
  const coverLetter = applicant?.cover_letter || snapshot?.cover_letter || null;

  const builtResume = snapshot?.built_resume || applicant?.built_resume || null;
  const isBuiltResume = snapshot?.resume_source === "builder" || (!resume?.file_url && !!builtResume);
  const isUploadedResume = !isBuiltResume && !!resume?.file_url;

  function handleDownloadWordResume() {
    if (!builtResume) return;
    const candidateName = builtResume.personalDetails?.fullName?.trim() || displayName || "Candidate";
    const sanitized = candidateName.replace(/[^a-zA-Z0-9_-]/g, "_");
    downloadDocxResume(builtResume, `${sanitized}_Resume.docx`);
  }

  const isTerminal = isTerminalApplication(applicant?.status);
  const isArchiveMode = readOnly || context === "hiring-records" || context === "hiring-decisions" || isTerminal;

  // Screening actions are strictly visible during active initial screening (applied / reviewing) on screening desk
  const normStatus = String(applicant?.status || "").toLowerCase().trim();
  const isInitialScreening = (normStatus === "applied" || normStatus === "reviewing" || normStatus === "under review" || normStatus === "screening");
  const isScreeningContext = context === "screening" || context === "default";
  const showScreeningActions = isInitialScreening && isScreeningContext && !isArchiveMode && !isTerminal;

  // Skills extraction: submitted application-time snapshot skills take strict priority
  const candidateSkills = parseSkills(snapshot && Object.prototype.hasOwnProperty.call(snapshot, "skills") ? snapshot.skills : profile?.skills);
  const canPreviewPdf = isUploadedResume && isPdfFile(resume);

  // Load view URL
  useEffect(() => {
    let active = true;

    async function loadViewUrl() {
      if (isBuiltResume || !resume?.file_url) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      // ── Employer: use server-authoritative RPC ──────────────────────────────
      // applicant.id is the *application* UUID (not the user UUID).
      // When present, this is an employer viewing an applicant's resume.
      // Authorization is enforced server-side. On any auth error: hard stop.
      if (applicant?.id) {
        const { data: rpcData, error: rpcErr } = await supabase.rpc(
          "create_applicant_resume_signed_url",
          { p_application_id: applicant.id }
        );

        if (!active) return;

        if (rpcErr || !rpcData?.storage_path) {
          // Check for authorization errors — hard stop, no fallback
          const msg = (rpcErr?.message || "").toUpperCase();
          const isAuthError = msg.includes("FORBIDDEN") ||
            msg.includes("AUTHENTICATION_REQUIRED") ||
            msg.includes("ACCOUNT_SUSPENDED");

          if (isAuthError) {
            setError("Access denied. You do not have permission to view this resume.");
          } else if (msg.includes("RESUME_NOT_FOUND") || msg.includes("APPLICATION_NOT_FOUND")) {
            setError("Resume not found for this applicant.");
          } else {
            setError("Could not load resume preview. Please try again.");
          }
          setViewUrl("");
          setLoading(false);
          return;
        }

        // Normalize the storage_path — older snapshot rows may contain a full Supabase URL
        const rawPath = rpcData.storage_path;
        const storagePath = extractResumeStoragePath(rawPath);
        if (!storagePath) {
          setError("Resume path is invalid or inaccessible.");
          setViewUrl("");
          setLoading(false);
          return;
        }

        const { data: signedData, error: signedErr } = await supabase.storage
          .from("resumes")
          .createSignedUrl(storagePath, rpcData.expires_in_seconds || 900);

        if (!active) return;

        if (signedErr || !signedData?.signedUrl) {
          setError("Could not generate a secure preview link for this resume.");
          setViewUrl("");
        } else {
          setViewUrl(signedData.signedUrl);
        }

        setLoading(false);
        return;
      }

      // ── Candidate self-view / Admin context ────────────────────────────
      // No application ID — fall through to the generic signed URL helper.
      const { url, error: urlError } = await getResumeViewUrl(resume.file_url);
      if (!active) return;

      if (urlError || !url) {
        setError("Could not load resume preview. Access is restricted or preview is unavailable.");
        setViewUrl("");
      } else {
        setViewUrl(url);
      }

      setLoading(false);
    }

    loadViewUrl();
    return () => { active = false; };
  }, [resume?.file_url, applicant?.id]);

  // Accessibility: Focus management and Escape key
  useEffect(() => {
    previouslyFocusedElementRef.current = document.activeElement;

    const timer = setTimeout(() => {
      if (dialogRef.current) {
        const closeBtn = dialogRef.current.querySelector(".resume-viewer-close");
        if (closeBtn) closeBtn.focus();
      }
    }, 50);

    function handleKeyDown(e) {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      // Trap Tab within modal
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
        ).filter(el => !el.hasAttribute("disabled") && el.offsetParent !== null);

        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocusedElementRef.current && typeof previouslyFocusedElementRef.current.focus === "function") {
        previouslyFocusedElementRef.current.focus();
      }
    };
  }, [onClose]);

  if (!applicant) return null;

  const visibleCandidateSkills = showAllSkills ? candidateSkills : candidateSkills.slice(0, 8);

  return (
    <div className="resume-viewer-overlay" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        className="resume-viewer-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Applicant Details & Resume for ${displayName}`}
        tabIndex="-1"
      >
        <header className="resume-viewer-header">
          <div className="resume-viewer-header-main">
            <div className="resume-viewer-avatar">
              {(displayName || "A").charAt(0).toUpperCase()}
            </div>
            <div>
              <h2>{displayName}</h2>
              <p>
                Applied for <strong>{job?.title || "Unknown role"}</strong>
                {job?.location ? ` · 📍 ${job.location}` : ""}
                {job?.employment_type ? ` · ${job.employment_type}` : ""}
              </p>
              {profile?.email && <small>✉️ {profile.email}</small>}
            </div>
          </div>

          <div className="resume-viewer-header-actions">
            {isBuiltResume && builtResume ? (
              <button
                type="button"
                className="resume-viewer-btn primary download-built-word-btn"
                onClick={handleDownloadWordResume}
                title="Download editable Word resume (.docx) generated from submitted Built Resume"
              >
                ⬇️ Download Word Resume
              </button>
            ) : viewUrl ? (
              <>
                <a
                  href={viewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="resume-viewer-btn secondary"
                >
                  Open in tab
                </a>
                <a
                  href={viewUrl}
                  download={getFileName(resume)}
                  className="resume-viewer-btn secondary"
                >
                  Download
                </a>
              </>
            ) : null}
            <button type="button" className="resume-viewer-close" onClick={onClose} aria-label="Close modal">
              ×
            </button>
          </div>
        </header>

        <div className="resume-viewer-body">
          <aside className="resume-viewer-sidebar" style={{ maxHeight: "calc(100vh - 120px)", overflowY: "auto" }}>
            {/* 1. Application Overview */}
            <div className="resume-viewer-sidebar-section">
              <h3>{isArchiveMode ? "Application Overview" : "Hiring Analysis"}</h3>
              <dl>
                {applicant.id && (
                  <div>
                    <dt>Application Reference</dt>
                    <dd><strong>#{applicant.id.substring(0, 8).toUpperCase()}</strong></dd>
                  </div>
                )}
                {applicant.created_at && (
                  <div>
                    <dt>Applied Date</dt>
                    <dd>{formatDate(applicant.created_at)}</dd>
                  </div>
                )}
                <div>
                  <dt>Current Status</dt>
                  <dd style={{ textTransform: "capitalize", fontWeight: "bold" }}>{applicant.status || "Applied"}</dd>
                </div>
                {resume?.resume_score && (
                  <div>
                    <dt>Resume Score</dt>
                    <dd>⭐ {resume.resume_score} / 100</dd>
                  </div>
                )}
                {profile?.verification_status && (
                  <div style={{ marginTop: "12px", padding: "8px", background: profile.verification_status === "Verified" ? "#dcfce7" : "#fef9c3", borderRadius: "6px" }}>
                    <dt style={{ color: profile.verification_status === "Verified" ? "#166534" : "#854d0e", fontWeight: "bold" }}>Identity</dt>
                    <dd style={{ color: profile.verification_status === "Verified" ? "#15803d" : "#a16207" }}>
                      {profile.verification_status === "Verified" ? "✅ Verified Candidate" : "⚠️ Verification Pending"}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            <JobMatchScore application={applicant} />

            {/* 2. Cover Letter (if submitted) */}
            {coverLetter && (
              <div className="resume-viewer-sidebar-section">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3>Cover Letter</h3>
                  <button
                    type="button"
                    style={{ background: "none", border: "none", color: "#6d28d9", cursor: "pointer", fontSize: "12px", fontWeight: "bold" }}
                    onClick={() => setShowCoverLetter(!showCoverLetter)}
                  >
                    {showCoverLetter ? "Hide" : "View"}
                  </button>
                </div>
                {showCoverLetter ? (
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "10px", marginTop: "8px", fontSize: "12px", lineHeight: "1.5", whiteSpace: "pre-wrap", color: "#334155" }}>
                    {coverLetter}
                  </div>
                ) : (
                  <p style={{ fontSize: "11px", color: "#64748b", margin: "4px 0 0 0" }}>
                    {coverLetter.length > 80 ? `${coverLetter.substring(0, 80)}...` : coverLetter}
                  </p>
                )}
              </div>
            )}

            {/* 3. Candidate Professional Skills (Compact subset) */}
            {candidateSkills.length > 0 && (
              <div className="resume-viewer-sidebar-section">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3>Professional Skills</h3>
                  {candidateSkills.length > 8 && (
                    <button
                      type="button"
                      style={{ background: "none", border: "none", color: "#6d28d9", cursor: "pointer", fontSize: "11px", fontWeight: "bold" }}
                      onClick={() => setShowAllSkills(!showAllSkills)}
                    >
                      {showAllSkills ? "Show less" : `View all (${candidateSkills.length})`}
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                  {visibleCandidateSkills.map((skill) => (
                    <span
                      key={skill}
                      style={{
                        background: "#f1f5f9",
                        color: "#334155",
                        padding: "3px 8px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: "600",
                        textTransform: "capitalize"
                      }}
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 4. Education & Work Background (Sanitized clean presentation) */}
            <div className="resume-viewer-sidebar-section">
              <h3>Candidate Background</h3>
              <div style={{ marginBottom: "8px" }}>
                <strong style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase" }}>Education</strong>
                <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "#1e293b", fontWeight: "600" }}>
                  {formatBackgroundText(snapshot?.education || profile?.education)}
                </p>
              </div>
              <div>
                <strong style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase" }}>Experience</strong>
                <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "#1e293b", fontWeight: "600" }}>
                  {formatBackgroundText(snapshot?.work_experience || profile?.work_experience)}
                </p>
              </div>
            </div>

            {/* 6. Uploaded Certificates */}
            {profile?.certifications && profile.certifications.length > 0 && (
              <div className="resume-viewer-sidebar-section">
                <h3>Uploaded Certificates</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {profile.certifications.map((cert, idx) => (
                    <div key={idx} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "8px", borderRadius: "6px" }}>
                      <strong style={{ fontSize: "12px", color: "#334155" }}>{cert.name || "Certificate"}</strong>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "4px" }}>
                        <span style={{ fontSize: "11px", color: "#10b981", fontWeight: "bold" }}>✓ Authenticity Verified</span>
                        {(cert.file_url || cert.fileUrl) && (
                          <a
                            href="#"
                            onClick={async (e) => {
                              e.preventDefault();
                              const targetUrl = cert.file_url || cert.fileUrl;
                              const { url } = await getCertificateSignedUrl(targetUrl);
                              if (url) window.open(url, "_blank", "noopener,noreferrer");
                            }}
                            style={{ fontSize: "11px", color: "#58158f", textDecoration: "none", fontWeight: "600" }}
                          >
                            View File
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 7. Resume submitted with application */}
            <div className="resume-viewer-sidebar-section">
              <h3>Resume submitted with application</h3>
              {isBuiltResume ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0", padding: "4px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "700" }}>
                    📝 Built Resume
                  </div>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>
                    Submitted via SkillSync Resume Builder
                  </span>
                </div>
              ) : resume?.file_url ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#eff6ff", color: "#1e40af", border: "1px solid #bfdbfe", padding: "4px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "700" }}>
                    📄 Uploaded Resume
                  </div>
                  <p className="resume-viewer-file-meta" style={{ margin: 0 }}>
                    <strong>{getFileName(resume)}</strong>
                    {formatFileSize(resume.file_size) && (
                      <> · {formatFileSize(resume.file_size)}</>
                    )}
                    {formatDate(resume.created_at) && (
                      <> · Uploaded {formatDate(resume.created_at)}</>
                    )}
                  </p>
                </div>
              ) : (
                <span style={{ fontSize: "12px", color: "#64748b" }}>No resume submitted</span>
              )}
            </div>

            {/* 8. Screening Quick Actions: Shortlist Applicant strictly restricted to initial screening stage */}
            {showScreeningActions && !isArchiveMode && typeof onShortlist === "function" && (
              <div className="resume-viewer-sidebar-actions" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <button
                  type="button"
                  className="resume-viewer-btn secondary"
                  onClick={() => {
                    onShortlist(applicant.id);
                    onClose();
                  }}
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  Shortlist Applicant
                </button>
              </div>
            )}
          </aside>

          <section className="resume-viewer-preview" style={{ overflowY: "auto" }}>
            {isBuiltResume && builtResume ? (
              <div className="built-resume-rendered-document" style={{
                background: "#ffffff",
                borderRadius: "8px",
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08)",
                padding: "36px",
                maxWidth: "760px",
                margin: "20px auto",
                fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
                color: "#1e293b",
                lineHeight: "1.6"
              }}>
                {/* Header */}
                <div style={{ borderBottom: "2px solid #0f172a", paddingBottom: "16px", marginBottom: "20px" }}>
                  <h1 style={{ margin: "0 0 6px 0", fontSize: "24px", fontWeight: "800", textTransform: "uppercase", color: "#0f172a", letterSpacing: "0.02em" }}>
                    {builtResume.personalDetails?.fullName || displayName}
                  </h1>
                  <div style={{ fontSize: "12px", color: "#475569", display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {[
                      builtResume.personalDetails?.email || profile?.email,
                      builtResume.personalDetails?.phone || profile?.contact_number,
                      builtResume.personalDetails?.city || builtResume.personalDetails?.region,
                      builtResume.personalDetails?.linkedin,
                      builtResume.personalDetails?.github
                    ].filter(Boolean).map((item, idx) => (
                      <span key={idx}>{idx > 0 && "• "}{item}</span>
                    ))}
                  </div>
                </div>

                {/* Professional Summary */}
                {builtResume.summary && (
                  <div style={{ marginBottom: "20px" }}>
                    <h4 style={{ fontSize: "13px", fontWeight: "700", textTransform: "uppercase", color: "#0f172a", borderBottom: "1px solid #cbd5e1", paddingBottom: "4px", margin: "0 0 8px 0", letterSpacing: "0.05em" }}>
                      Professional Summary
                    </h4>
                    <p style={{ margin: 0, fontSize: "12px", color: "#334155", lineHeight: "1.6" }}>
                      {builtResume.summary}
                    </p>
                  </div>
                )}

                {/* Skills */}
                {Array.isArray(builtResume.skills) && builtResume.skills.length > 0 && (
                  <div style={{ marginBottom: "20px" }}>
                    <h4 style={{ fontSize: "13px", fontWeight: "700", textTransform: "uppercase", color: "#0f172a", borderBottom: "1px solid #cbd5e1", paddingBottom: "4px", margin: "0 0 8px 0", letterSpacing: "0.05em" }}>
                      Skills
                    </h4>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {builtResume.skills.map((skill, idx) => {
                        const name = typeof skill === "string" ? skill : skill?.name;
                        if (!name) return null;
                        return (
                          <span key={idx} style={{ background: "#f1f5f9", color: "#1e293b", padding: "3px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "600" }}>
                            {name}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Experience */}
                {builtResume.experience?.noExperience ? (
                  <div style={{ marginBottom: "20px" }}>
                    <h4 style={{ fontSize: "13px", fontWeight: "700", textTransform: "uppercase", color: "#0f172a", borderBottom: "1px solid #cbd5e1", paddingBottom: "4px", margin: "0 0 8px 0", letterSpacing: "0.05em" }}>
                      Work Experience
                    </h4>
                    <p style={{ margin: 0, fontSize: "12px", color: "#64748b", fontStyle: "italic" }}>
                      Entry-level candidate seeking first professional opportunity.
                    </p>
                  </div>
                ) : Array.isArray(builtResume.experience?.entries) && builtResume.experience.entries.length > 0 ? (
                  <div style={{ marginBottom: "20px" }}>
                    <h4 style={{ fontSize: "13px", fontWeight: "700", textTransform: "uppercase", color: "#0f172a", borderBottom: "1px solid #cbd5e1", paddingBottom: "4px", margin: "0 0 10px 0", letterSpacing: "0.05em" }}>
                      Work Experience
                    </h4>
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {builtResume.experience.entries.map((exp, idx) => (
                        <div key={idx}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap" }}>
                            <strong style={{ fontSize: "13px", color: "#0f172a" }}>{exp.title}</strong>
                            <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "600" }}>
                              {exp.startDate || ""} – {exp.isCurrent ? "Present" : (exp.endDate || "")}
                            </span>
                          </div>
                          {exp.organization && (
                            <div style={{ fontSize: "12px", color: "#475569", fontWeight: "500", marginBottom: "2px" }}>
                              {exp.organization}
                            </div>
                          )}
                          {exp.responsibilities && (
                            <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "#334155", lineHeight: "1.5" }}>
                              {exp.responsibilities}
                            </p>
                          )}
                          {exp.achievements && (
                            <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "#166534", fontWeight: "500" }}>
                              <strong>Key Achievement:</strong> {exp.achievements}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Education */}
                {builtResume.education?.noFormalEducation ? (
                  <div style={{ marginBottom: "20px" }}>
                    <h4 style={{ fontSize: "13px", fontWeight: "700", textTransform: "uppercase", color: "#0f172a", borderBottom: "1px solid #cbd5e1", paddingBottom: "4px", margin: "0 0 8px 0", letterSpacing: "0.05em" }}>
                      Education & Training
                    </h4>
                    <p style={{ margin: 0, fontSize: "12px", color: "#64748b", fontStyle: "italic" }}>
                      Practical learning and on-the-job training.
                    </p>
                  </div>
                ) : Array.isArray(builtResume.education?.entries) && builtResume.education.entries.length > 0 ? (
                  <div style={{ marginBottom: "20px" }}>
                    <h4 style={{ fontSize: "13px", fontWeight: "700", textTransform: "uppercase", color: "#0f172a", borderBottom: "1px solid #cbd5e1", paddingBottom: "4px", margin: "0 0 10px 0", letterSpacing: "0.05em" }}>
                      Education & Training
                    </h4>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {builtResume.education.entries.map((edu, idx) => (
                        <div key={idx}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap" }}>
                            <strong style={{ fontSize: "13px", color: "#0f172a" }}>{edu.institution}</strong>
                            <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "600" }}>
                              {edu.status || ""}
                            </span>
                          </div>
                          <div style={{ fontSize: "12px", color: "#475569", fontWeight: "500" }}>
                            {edu.level}{edu.courseOrProgram ? ` - ${edu.courseOrProgram}` : ""}
                          </div>
                          {edu.courseworkAndAchievements && (
                            <p style={{ margin: "2px 0 0 0", fontSize: "11px", color: "#334155" }}>
                              {edu.courseworkAndAchievements}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Projects & Credentials */}
                {builtResume.projectsAndCredentials && (
                  (builtResume.projectsAndCredentials.projects?.length > 0 ||
                   builtResume.projectsAndCredentials.certifications?.length > 0 ||
                   builtResume.projectsAndCredentials.training?.length > 0 ||
                   builtResume.projectsAndCredentials.awards?.length > 0) && (
                    <div style={{ marginBottom: "20px" }}>
                      <h4 style={{ fontSize: "13px", fontWeight: "700", textTransform: "uppercase", color: "#0f172a", borderBottom: "1px solid #cbd5e1", paddingBottom: "4px", margin: "0 0 10px 0", letterSpacing: "0.05em" }}>
                        Projects & Credentials
                      </h4>
                      {builtResume.projectsAndCredentials.projects?.map((p, idx) => (
                        <div key={`proj-${idx}`} style={{ marginBottom: "8px" }}>
                          <strong style={{ fontSize: "12px", color: "#0f172a" }}>Project: {p.title}</strong>
                          {p.role && <span style={{ fontSize: "11px", color: "#64748b" }}> ({p.role})</span>}
                          {p.description && <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "#334155" }}>{p.description}</p>}
                        </div>
                      ))}
                      {builtResume.projectsAndCredentials.certifications?.map((c, idx) => (
                        <div key={`cert-${idx}`} style={{ marginBottom: "4px", fontSize: "12px" }}>
                          <strong style={{ color: "#0f172a" }}>Certification: {c.name}</strong>
                          {c.issuer && <span style={{ color: "#64748b" }}> | {c.issuer}</span>}
                        </div>
                      ))}
                      {builtResume.projectsAndCredentials.training?.map((t, idx) => (
                        <div key={`train-${idx}`} style={{ marginBottom: "4px", fontSize: "12px" }}>
                          <strong style={{ color: "#0f172a" }}>Training: {t.title}</strong>
                          {t.provider && <span style={{ color: "#64748b" }}> | {t.provider}</span>}
                        </div>
                      ))}
                      {builtResume.projectsAndCredentials.awards?.map((a, idx) => (
                        <div key={`award-${idx}`} style={{ marginBottom: "4px", fontSize: "12px" }}>
                          <strong style={{ color: "#0f172a" }}>Award: {a.title}</strong>
                          {a.issuer && <span style={{ color: "#64748b" }}> | {a.issuer}</span>}
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            ) : !resume?.file_url ? (
              <div className="resume-viewer-empty">
                <span>▤</span>
                <h3>No resume available</h3>
                <p>This applicant has not submitted a resume with this application.</p>
              </div>
            ) : loading ? (
              <div className="resume-viewer-empty">
                <h3>Loading resume preview...</h3>
              </div>
            ) : canPreviewPdf ? (
              <>
                {error && <p className="resume-viewer-error">{error}</p>}
                <iframe
                  title={`Resume preview for ${displayName}`}
                  src={viewUrl}
                  className="resume-viewer-iframe"
                />
              </>
            ) : (
              <div className="resume-viewer-empty">
                <span>📄</span>
                <h3>{getFileName(resume)}</h3>
                <p>
                  Word document preview is not available in the browser.
                  Download or open the file to review this resume.
                </p>
                {viewUrl && (
                  <a
                    href={viewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="resume-viewer-btn primary"
                  >
                    Open resume file
                  </a>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
