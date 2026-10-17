import React, { useState } from "react";
import { generateProfessionalSummary, calculateResumeReadiness } from "../../../services/resumeBuilderService";
import { downloadDocxResume } from "../../../services/docxResumeGenerator";
import RecommendedJobs from "../RecommendedJobs.jsx";
import ErrorBoundary from "../../guards/ErrorBoundary.jsx";

export default function Step6Review({
  data,
  onChange,
  onNavigateStep,
  recommendedJobs = [],
  loadingJobs = false,
  matchingJobs = false,
  verificationStatus = "Pending Verification",
  applications = [],
  onApplyJob,
  applyingJobId,
  onRefreshRecommendations,
  refreshingJobs = false,
  lastUpdatedText = ""
}) {
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

  function handleAutoGenerateSummary() {
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
    <div className="builder-step-section review-screen">
      <div className="step-intro-card">
        <div className="step-intro-icon" aria-hidden="true">📋</div>
        <div className="step-intro-text">
          <h3>Review Your Resume</h3>
          <p>
            Verify your resume sections, customize your professional summary, and preview or download your
            completed Microsoft Word resume.
          </p>
        </div>
      </div>

      {/* Top Action Bar */}
      <div className="review-action-banner">
        <div className="banner-left">
          <div className="banner-readiness-pill">
            <span className="pill-check">✓</span>
            <strong>{readiness.completedSections} of 6 Sections Complete</strong> ({readiness.percentage}%)
          </div>
          <span className="banner-subtext">
            {readiness.canFinalize
              ? "Your resume has all required sections and is ready for download and job matching."
              : "Please complete your Full Name and Education before finalizing."}
          </span>
        </div>
        <div className="banner-actions">
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

      {/* Professional Summary Editor */}
      <div className="review-section-card summary-card">
        <div className="review-card-header">
          <div>
            <h4>Professional Summary</h4>
            <p className="helper-text">
              We've prepared a summary based on the information in your resume. Review and edit it before continuing.
            </p>
          </div>
          <button
            type="button"
            className="builder-action-btn outline small"
            onClick={handleAutoGenerateSummary}
            title="Generate summary based on your education, skills, and experience"
          >
            <span>✨</span> Suggest Summary
          </button>
        </div>

        <div className="summary-textarea-wrap">
          <textarea
            className="form-textarea"
            rows={4}
            placeholder="Write or review your professional summary..."
            value={summary}
            onChange={(e) => handleSummaryChange(e.target.value)}
          />
          <span className="field-hint">
            Tip: A factual 2-3 sentence overview highlighting your background and primary abilities.
          </span>
        </div>
      </div>

      {/* Sections Checklist & Quick Edit Links */}
      <div className="review-section-card checklist-card">
        <h4 className="checklist-heading">Resume Sections Checklist</h4>

        <div className="checklist-items-grid">
          {/* 1. Personal Details */}
          <div className="checklist-item-row">
            <div className="checklist-status-col">
              <span className={`checklist-icon ${name ? "complete" : "incomplete"}`}>
                {name ? "✓" : "!"}
              </span>
            </div>
            <div className="checklist-info-col">
              <strong>Personal Details</strong>
              <p>
                {name ? `${name} • ${data.personalDetails?.email || "No email"}` : "Full Name is required before finalizing."}
              </p>
            </div>
            <div className="checklist-action-col">
              <button
                type="button"
                className="checklist-edit-btn"
                onClick={() => onNavigateStep(1)}
              >
                Edit Personal Details
              </button>
            </div>
          </div>

          {/* 2. Education & Training */}
          <div className="checklist-item-row">
            <div className="checklist-status-col">
              <span className={`checklist-icon ${(eduCount > 0 || noEdu) ? "complete" : "incomplete"}`}>
                {(eduCount > 0 || noEdu) ? "✓" : "!"}
              </span>
            </div>
            <div className="checklist-info-col">
              <strong>Education & Training</strong>
              <p>
                {noEdu
                  ? "No formal education to report."
                  : eduCount > 0
                  ? `${eduCount} education/training ${eduCount === 1 ? "entry" : "entries"} recorded.`
                  : "Please add an education entry or select 'No formal schooling'."}
              </p>
            </div>
            <div className="checklist-action-col">
              <button
                type="button"
                className="checklist-edit-btn"
                onClick={() => onNavigateStep(2)}
              >
                Edit Education
              </button>
            </div>
          </div>

          {/* 3. Skills */}
          <div className="checklist-item-row">
            <div className="checklist-status-col">
              <span className={`checklist-icon ${skillsCount > 0 ? "complete" : "optional"}`}>
                {skillsCount > 0 ? "✓" : "–"}
              </span>
            </div>
            <div className="checklist-info-col">
              <strong>Skills</strong>
              <p>
                {skillsCount > 0
                  ? `${skillsCount} skills added to your resume.`
                  : "Optional: Add 3-10 skills to improve job matching."}
              </p>
            </div>
            <div className="checklist-action-col">
              <button
                type="button"
                className="checklist-edit-btn"
                onClick={() => onNavigateStep(3)}
              >
                Edit Skills
              </button>
            </div>
          </div>

          {/* 4. Experience */}
          <div className="checklist-item-row">
            <div className="checklist-status-col">
              <span className={`checklist-icon ${(expCount > 0 || noExp) ? "complete" : "optional"}`}>
                {(expCount > 0 || noExp) ? "✓" : "–"}
              </span>
            </div>
            <div className="checklist-info-col">
              <strong>Experience</strong>
              <p>
                {noExp
                  ? "No work experience yet (entry-level candidate)."
                  : expCount > 0
                  ? `${expCount} work experience ${expCount === 1 ? "entry" : "entries"} added.`
                  : "Optional: Add jobs, internships, freelance, or volunteer work."}
              </p>
            </div>
            <div className="checklist-action-col">
              <button
                type="button"
                className="checklist-edit-btn"
                onClick={() => onNavigateStep(4)}
              >
                Edit Experience
              </button>
            </div>
          </div>

          {/* 5. Projects & Credentials */}
          <div className="checklist-item-row">
            <div className="checklist-status-col">
              <span className={`checklist-icon ${credentialsTotal > 0 ? "complete" : "optional"}`}>
                {credentialsTotal > 0 ? "✓" : "–"}
              </span>
            </div>
            <div className="checklist-info-col">
              <strong>Projects & Credentials</strong>
              <p>
                {credentialsTotal > 0
                  ? `${projCount} projects, ${certCount} certs, ${trainingCount} trainings, ${awardsCount} awards.`
                  : "Optional: Highlight projects, licenses, certifications, or awards."}
              </p>
            </div>
            <div className="checklist-action-col">
              <button
                type="button"
                className="checklist-edit-btn"
                onClick={() => onNavigateStep(5)}
              >
                Edit Projects & Credentials
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Recommended Jobs — Matches available immediately from form data */}
      <div className="review-recommended-jobs-section" style={{ marginTop: "32px" }}>
        <div className="section-header-box">
          <h3>Recommended Jobs Based on Your Resume</h3>
          <p>
            Jobs matching your qualifications, skills, and background are evaluated automatically
            from your structured resume.
          </p>
        </div>

        <ErrorBoundary>
          <RecommendedJobs
            jobs={recommendedJobs}
            loading={loadingJobs}
            matching={matchingJobs}
            hasResume={true}
            verificationStatus={verificationStatus}
            candidate={{ skills: (data.skills || []).map(s => (typeof s === "string" ? s : s.name)) }}
            applications={applications}
            onApply={onApplyJob}
            applyingJobId={applyingJobId}
            onRefresh={onRefreshRecommendations}
            refreshing={refreshingJobs}
            lastUpdatedText={lastUpdatedText}
          />
        </ErrorBoundary>
      </div>
    </div>
  );
}
