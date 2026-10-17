import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { generateProfessionalSummary, calculateResumeReadiness } from "../../../services/resumeBuilderService";
import { downloadDocxResume } from "../../../services/docxResumeGenerator";

export default function Step6Review({
  data,
  onChange,
  onNavigateStep,
  onFinalize
}) {
  const navigate = useNavigate();
  const readiness = calculateResumeReadiness(data);
  const [showInBrowserPreview, setShowInBrowserPreview] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const summary = data?.summary || "";

  function handleSummaryChange(newSummary) {
    onChange({
      ...data,
      summary: newSummary
    });
  }

  function handleCreateSummary() {
    const generated = generateProfessionalSummary(data);
    onChange({
      ...data,
      summary: generated
    });
  }

  function handleDownloadWord() {
    setDownloading(true);
    try {
      const candidateName = data?.personalDetails?.fullName?.trim() || "Candidate";
      const sanitized = candidateName.replace(/[^a-zA-Z0-9_-]/g, "_");
      downloadDocxResume(data, `${sanitized}_Resume.docx`);
    } catch (err) {
      console.error("Failed downloading DOCX resume:", err);
    } finally {
      setDownloading(false);
    }
  }

  function handleGoToJobs() {
    if (onFinalize) onFinalize();
    navigate("/candidate/jobs");
  }

  // Section details
  const name = data?.personalDetails?.fullName?.trim();
  const eduCount = data?.education?.entries?.length || 0;
  const noEdu = data?.education?.noFormalEducation;
  const skillsCount = data?.skills?.length || 0;
  const expCount = data?.experience?.entries?.length || 0;
  const noExp = data?.experience?.noExperience;
  const projCount = data?.projectsAndCredentials?.projects?.length || 0;
  const certCount = data?.projectsAndCredentials?.certifications?.length || 0;
  const trainingCount = data?.projectsAndCredentials?.training?.length || 0;
  const awardsCount = data?.projectsAndCredentials?.awards?.length || 0;
  const credentialsTotal = projCount + certCount + trainingCount + awardsCount;

  return (
    <section className="builder-step-section review-screen" aria-labelledby="step6-heading">
      <div className="step-intro-card">
        <div className="step-intro-icon" aria-hidden="true">📋</div>
        <div className="step-intro-text">
          <h3 id="step6-heading">Review Your Resume</h3>
          <p>
            Verify your information, edit your professional summary, and preview or download your editable Word resume.
          </p>
        </div>
      </div>

      {/* Top Readiness & Actions Card */}
      <div className="review-readiness-card">
        <div className="readiness-card-left">
          <div className="readiness-score-row">
            <span className="readiness-score-title">Resume Readiness</span>
            <span className="readiness-score-pct">{readiness.percentage}%</span>
          </div>
          <p className="readiness-card-sub">
            {readiness.completedSections} of 6 sections completed •{" "}
            {readiness.canFinalize
              ? "All required details are complete."
              : "Full Name and Education decision required to finalize."}
          </p>
        </div>
        <div className="readiness-card-actions">
          <button
            type="button"
            className="builder-action-btn outline"
            onClick={() => setShowInBrowserPreview(!showInBrowserPreview)}
          >
            {showInBrowserPreview ? "Hide Preview" : "Preview Resume"}
          </button>
          <button
            type="button"
            className="builder-action-btn primary download-resume-btn"
            onClick={handleDownloadWord}
            disabled={downloading || !name}
            title={!name ? "Please provide your full name before downloading" : "Download editable Word resume (.docx)"}
          >
            <span>⬇️</span> {downloading ? "Preparing..." : "Download Word Resume"}
          </button>
        </div>
      </div>

      {/* In-Browser Formatted Resume Preview */}
      {showInBrowserPreview && (
        <div className="in-browser-resume-preview" role="region" aria-label="Resume Document Preview">
          <div className="preview-paper">
            <div className="preview-paper-header">
              <h2 className="preview-candidate-name">{name || "Candidate Name"}</h2>
              <div className="preview-contact-line">
                {[
                  data?.personalDetails?.email,
                  data?.personalDetails?.phone,
                  data?.personalDetails?.city,
                  data?.personalDetails?.linkedin,
                  data?.personalDetails?.github
                ].filter(Boolean).join(" • ")}
              </div>
            </div>

            {summary && (
              <div className="preview-section">
                <h4 className="preview-section-title">PROFESSIONAL SUMMARY</h4>
                <p className="preview-summary-text">{summary}</p>
              </div>
            )}

            {skillsCount > 0 && (
              <div className="preview-section">
                <h4 className="preview-section-title">SKILLS</h4>
                <div className="preview-skills-row">
                  {(data.skills || []).map((s, idx) => (
                    <span key={idx} className="preview-skill-tag">
                      {typeof s === "string" ? s : s.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="preview-section">
              <h4 className="preview-section-title">EXPERIENCE</h4>
              {noExp ? (
                <p className="preview-empty-italic">No formal work experience reported. Seeking entry-level opportunities.</p>
              ) : expCount > 0 ? (
                (data.experience.entries || []).map((exp, idx) => (
                  <div key={idx} className="preview-entry-item">
                    <div className="preview-entry-head">
                      <strong>{exp.title}</strong>
                      {exp.organization && <span> | {exp.organization}</span>}
                      <span className="preview-date">
                        {exp.startDate || ""} – {exp.isCurrent ? "Present" : (exp.endDate || "")}
                      </span>
                    </div>
                    {exp.responsibilities && <p className="preview-entry-desc">{exp.responsibilities}</p>}
                    {exp.achievements && <p className="preview-entry-ach">Achievement: {exp.achievements}</p>}
                  </div>
                ))
              ) : (
                <p className="preview-empty-italic">No experience added.</p>
              )}
            </div>

            <div className="preview-section">
              <h4 className="preview-section-title">EDUCATION & TRAINING</h4>
              {noEdu ? (
                <p className="preview-empty-italic">No formal schooling reported.</p>
              ) : eduCount > 0 ? (
                (data.education.entries || []).map((edu, idx) => (
                  <div key={idx} className="preview-entry-item">
                    <div className="preview-entry-head">
                      <strong>{edu.institution}</strong>
                      <span> - {edu.level}</span>
                      {edu.courseOrProgram && <span> ({edu.courseOrProgram})</span>}
                      <span className="preview-date">{edu.status}</span>
                    </div>
                    {edu.courseworkAndAchievements && (
                      <p className="preview-entry-desc">{edu.courseworkAndAchievements}</p>
                    )}
                  </div>
                ))
              ) : (
                <p className="preview-empty-italic">No education added.</p>
              )}
            </div>

            {credentialsTotal > 0 && (
              <div className="preview-section">
                <h4 className="preview-section-title">PROJECTS & CREDENTIALS</h4>
                {(data.projectsAndCredentials.projects || []).map((p, idx) => (
                  <div key={`proj-${idx}`} className="preview-entry-item">
                    <strong>Project: {p.title}</strong> {p.role && `(${p.role})`}
                    {p.description && <p className="preview-entry-desc">{p.description}</p>}
                  </div>
                ))}
                {(data.projectsAndCredentials.certifications || []).map((c, idx) => (
                  <div key={`cert-${idx}`} className="preview-entry-item">
                    <strong>Certification: {c.name}</strong> {c.issuer && `| ${c.issuer}`}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Two-Column Grid: Summary on Left, Sections Checklist on Right */}
      <div className="review-two-column-layout">
        {/* Left Column: Professional Summary */}
        <div className="review-column-card summary-editor-box">
          <div className="column-card-header">
            <h4>Professional Summary</h4>
            <button
              type="button"
              className="builder-action-btn outline small"
              onClick={handleCreateSummary}
              title="Create a concise, truthful summary based on your entered education, skills, and experience"
            >
              Create Summary
            </button>
          </div>
          <p className="card-guidance-subtext">
            Review and adjust your summary. It provides employers with a clear snapshot of your background.
          </p>
          <div className="summary-textarea-wrapper">
            <textarea
              className="form-textarea summary-text-input"
              rows={6}
              placeholder="Write or edit your professional summary..."
              value={summary}
              onChange={(e) => handleSummaryChange(e.target.value)}
              aria-label="Professional summary"
            />
          </div>
        </div>

        {/* Right Column: Resume Sections Checklist */}
        <div className="review-column-card sections-checklist-box">
          <div className="column-card-header">
            <h4>Resume Sections</h4>
          </div>
          <p className="card-guidance-subtext">
            Click any section below to make quick edits before saving.
          </p>

          <ul className="review-checklist-list" role="list">
            {/* 1. Personal Details */}
            <li className="checklist-list-item">
              <span className={`checklist-item-status ${name ? "checked" : "missing"}`} aria-hidden="true">
                {name ? "✓" : "!"}
              </span>
              <div className="checklist-item-body">
                <span className="checklist-item-name">Personal Details</span>
                <span className="checklist-item-meta">
                  {name ? `${name} • ${data.personalDetails?.email || "No email"}` : "Full Name is required"}
                </span>
              </div>
              <button
                type="button"
                className="checklist-item-edit-btn"
                onClick={() => onNavigateStep(1)}
              >
                Edit
              </button>
            </li>

            {/* 2. Education */}
            <li className="checklist-list-item">
              <span className={`checklist-item-status ${(eduCount > 0 || noEdu) ? "checked" : "missing"}`} aria-hidden="true">
                {(eduCount > 0 || noEdu) ? "✓" : "!"}
              </span>
              <div className="checklist-item-body">
                <span className="checklist-item-name">Education</span>
                <span className="checklist-item-meta">
                  {noEdu
                    ? "No formal schooling reported"
                    : eduCount > 0
                    ? `${eduCount} education/training ${eduCount === 1 ? "entry" : "entries"}`
                    : "Add entry or select 'No formal schooling'"}
                </span>
              </div>
              <button
                type="button"
                className="checklist-item-edit-btn"
                onClick={() => onNavigateStep(2)}
              >
                Edit
              </button>
            </li>

            {/* 3. Skills */}
            <li className="checklist-list-item">
              <span className={`checklist-item-status ${skillsCount > 0 ? "checked" : "neutral"}`} aria-hidden="true">
                {skillsCount > 0 ? "✓" : "○"}
              </span>
              <div className="checklist-item-body">
                <span className="checklist-item-name">Skills</span>
                <span className="checklist-item-meta">
                  {skillsCount > 0 ? `${skillsCount} skills added` : "Optional: add 3-10 skills"}
                </span>
              </div>
              <button
                type="button"
                className="checklist-item-edit-btn"
                onClick={() => onNavigateStep(3)}
              >
                Edit
              </button>
            </li>

            {/* 4. Experience */}
            <li className="checklist-list-item">
              <span className={`checklist-item-status ${(expCount > 0 || noExp) ? "checked" : "neutral"}`} aria-hidden="true">
                {(expCount > 0 || noExp) ? "✓" : "○"}
              </span>
              <div className="checklist-item-body">
                <span className="checklist-item-name">Experience</span>
                <span className="checklist-item-meta">
                  {noExp
                    ? "No work experience yet (entry-level)"
                    : expCount > 0
                    ? `${expCount} work experience ${expCount === 1 ? "entry" : "entries"}`
                    : "Optional: jobs, internships, freelance"}
                </span>
              </div>
              <button
                type="button"
                className="checklist-item-edit-btn"
                onClick={() => onNavigateStep(4)}
              >
                Edit
              </button>
            </li>

            {/* 5. Projects & Credentials */}
            <li className="checklist-list-item">
              <span className={`checklist-item-status ${credentialsTotal > 0 ? "checked" : "neutral"}`} aria-hidden="true">
                {credentialsTotal > 0 ? "✓" : "○"}
              </span>
              <div className="checklist-item-body">
                <span className="checklist-item-name">Extras & Credentials</span>
                <span className="checklist-item-meta">
                  {credentialsTotal > 0
                    ? `${credentialsTotal} projects/credentials added`
                    : "Optional: capstone, certifications, licenses"}
                </span>
              </div>
              <button
                type="button"
                className="checklist-item-edit-btn"
                onClick={() => onNavigateStep(5)}
              >
                Edit
              </button>
            </li>
          </ul>
        </div>
      </div>

      {/* Clean Completion Card pointing to Job Marketplace */}
      <div className="review-completion-card">
        <div className="completion-card-icon" aria-hidden="true">💼</div>
        <div className="completion-card-content">
          <h4>Your resume is ready</h4>
          <p>
            Your resume information can now be used to find suitable opportunities across our job marketplace.
          </p>
        </div>
        <div className="completion-card-action">
          <button
            type="button"
            className="builder-action-btn primary view-jobs-cta"
            onClick={handleGoToJobs}
          >
            View Recommended Jobs →
          </button>
        </div>
      </div>
    </section>
  );
}
