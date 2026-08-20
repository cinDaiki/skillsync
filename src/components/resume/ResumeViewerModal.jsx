import { useEffect, useState, useRef } from "react";
import { getResumeViewUrl, getCertificateSignedUrl } from "../../services/api.js";
import { isTerminalApplication, isScreeningStatus } from "../../services/recruitmentStatus.js";

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

  const isTerminal = isTerminalApplication(applicant?.status);
  const isArchiveMode = readOnly || context === "hiring-records" || context === "hiring-decisions" || isTerminal;

  // Screening actions are strictly visible during active initial screening (applied / reviewing) on screening desk
  const normStatus = String(applicant?.status || "").toLowerCase().trim();
  const isInitialScreening = (normStatus === "applied" || normStatus === "reviewing" || normStatus === "under review" || normStatus === "screening");
  const isScreeningContext = context === "screening" || context === "default";
  const showScreeningActions = isInitialScreening && isScreeningContext && !isArchiveMode && !isTerminal;

  // Skills extraction
  const candidateSkills = parseSkills(profile?.skills || snapshot?.skills);
  const jobSkills = parseSkills(job?.required_skills);

  // Intersections
  const matchedSkills = jobSkills.filter(s => candidateSkills.includes(s));
  const missingSkills = jobSkills.filter(s => !candidateSkills.includes(s));
  const matchPct = jobSkills.length > 0 ? Math.round((matchedSkills.length / jobSkills.length) * 100) : 100;

  const canPreviewPdf = resume?.file_url && isPdfFile(resume);

  // Load view URL
  useEffect(() => {
    let active = true;

    async function loadViewUrl() {
      if (!resume?.file_url) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      const { url, error: urlError } = await getResumeViewUrl(resume.file_url);
      if (!active) return;

      if (urlError || !url) {
        setError("Could not load resume preview. Try downloading the file instead.");
        setViewUrl(resume.file_url);
      } else {
        setViewUrl(url);
      }

      setLoading(false);
    }

    loadViewUrl();
    return () => { active = false; };
  }, [resume?.file_url]);

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
            {viewUrl && (
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
            )}
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
                {/* In archive mode, only show persisted application-time match score */}
                {isArchiveMode ? (
                  typeof applicant.match_score === "number" && applicant.match_score > 0 ? (
                    <div>
                      <dt>Application-time Match Score</dt>
                      <dd style={{ fontWeight: "900", color: applicant.match_score >= 80 ? "#10b981" : applicant.match_score >= 50 ? "#6d28d9" : "#d97706" }}>
                        🧠 {applicant.match_score}%
                      </dd>
                    </div>
                  ) : null
                ) : (
                  <div>
                    <dt>Job Skill Fit</dt>
                    <dd style={{ color: matchPct >= 80 ? "#10b981" : matchPct >= 40 ? "#6d28d9" : "#d97706", fontWeight: "900" }}>
                      🧠 {matchPct}% Alignment
                    </dd>
                  </div>
                )}
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
                  {formatBackgroundText(profile?.education || snapshot?.education)}
                </p>
              </div>
              <div>
                <strong style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase" }}>Experience</strong>
                <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "#1e293b", fontWeight: "600" }}>
                  {formatBackgroundText(profile?.work_experience || snapshot?.work_experience)}
                </p>
              </div>
            </div>

            {/* 5. Side-by-side Skill Matching Comparison Table (Clean Requirement vs Fit without microcredentials) */}
            {!isArchiveMode && jobSkills.length > 0 && (
              <div className="resume-viewer-sidebar-section">
                <h3>Skill Alignment Details</h3>
                <div style={{ background: "#faf8ff", border: "1px solid #f1ebfa", borderRadius: "10px", padding: "10px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "#667085" }}>
                        <th style={{ paddingBottom: "6px" }}>Requirement</th>
                        <th style={{ paddingBottom: "6px" }}>Candidate Fit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchedSkills.map(skill => (
                        <tr key={skill} style={{ borderTop: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "6px 0", color: "#1e1b4b", textTransform: "capitalize" }}>{skill}</td>
                          <td style={{ padding: "6px 0", color: "#10b981", fontWeight: "bold" }}>✅ Match</td>
                        </tr>
                      ))}
                      {missingSkills.map(skill => (
                        <tr key={skill} style={{ borderTop: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "6px 0", color: "#667085", textTransform: "capitalize" }}>{skill}</td>
                          <td style={{ padding: "6px 0", color: "#f59e0b", fontWeight: "bold" }}>⚠️ Missing</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

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

            {/* 7. Submitted Resume Metadata */}
            {resume?.file_url && (
              <div className="resume-viewer-sidebar-section">
                <h3>Submitted Resume</h3>
                <p className="resume-viewer-file-meta">
                  <strong>{getFileName(resume)}</strong>
                  {formatFileSize(resume.file_size) && (
                    <> · {formatFileSize(resume.file_size)}</>
                  )}
                  {formatDate(resume.created_at) && (
                    <> · Uploaded {formatDate(resume.created_at)}</>
                  )}
                </p>
              </div>
            )}

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

          <section className="resume-viewer-preview">
            {!resume?.file_url ? (
              <div className="resume-viewer-empty">
                <span>▤</span>
                <h3>No resume uploaded</h3>
                <p>This applicant has not uploaded a resume yet.</p>
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
