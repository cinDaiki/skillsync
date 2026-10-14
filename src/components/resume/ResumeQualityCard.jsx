import React, { useState } from "react";
import ResumeTemplateModal from "./ResumeTemplateModal.jsx";

export default function ResumeQualityCard({ assessment, onReupload }) {
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [showAllDetails, setShowAllDetails] = useState(false);

  if (!assessment) return null;

  const {
    extractionQuality = {},
    resumeQuality = {},
    sections = {},
    fields = {},
    feedback = {},
    templateSuggestion = {},
    skillTraceability = {},
  } = assessment;

  const extractionScore = extractionQuality.score ?? 80;
  const extractionRating = extractionQuality.rating || "GOOD";
  const isTextPoor = extractionQuality.isTextPoor || false;

  const issues = feedback.issues || [];
  const warnings = feedback.warnings || [];
  const strengths = feedback.strengths || [];

  const sectionStatus = sections.statusMap || {};

  return (
    <div className={`resume-quality-card ${extractionRating.toLowerCase()}`} id="resume-quality-assessment">
      <div className="quality-card-header">
        <div className="quality-header-main">
          <div className="quality-badges-row">
            <span className={`extraction-rating-badge ${extractionRating.toLowerCase()}`}>
              {extractionRating === "EXCELLENT" && "✓ Excellent Extraction Quality"}
              {extractionRating === "GOOD" && "✓ Good Extraction Quality"}
              {extractionRating === "NEEDS_REVIEW" && "⚠️ Extraction Needs Review"}
              {extractionRating === "POOR" && "❌ Low Extraction Quality"}
              <span className="badge-score">({extractionScore}%)</span>
            </span>
            <span className="quality-meta-pill">
              {extractionQuality.wordCount || 0} words extracted
            </span>
            {isTextPoor && (
              <span className="quality-warning-pill">
                ⚠️ Low Text Volume
              </span>
            )}
          </div>
          <h3>Resume Quality & Extraction Assessment</h3>
          <p>
            Evaluates whether SkillSync successfully extracted your qualifications, identifies missing sections,
            and validates skill provenance without fabricating credentials.
          </p>
        </div>
        <button
          type="button"
          className="quality-toggle-btn"
          onClick={() => setShowAllDetails(prev => !prev)}
          aria-expanded={showAllDetails}
        >
          {showAllDetails ? "Hide Full Details ▲" : "View Full Details ▼"}
        </button>
      </div>

      {/* Template Suggestion Alert when extraction is degraded */}
      {templateSuggestion.recommended && (
        <div className="template-suggestion-alert">
          <div className="suggestion-alert-icon">💡</div>
          <div className="suggestion-alert-content">
            <strong>Formatting Recommendation:</strong>
            <p>{templateSuggestion.reason || "Your document structure may be limiting text extraction."}</p>
            <div className="suggestion-alert-actions">
              <a
                href="/templates/SkillSync_ATS_Resume_Template.docx"
                download="SkillSync_ATS_Resume_Template.docx"
                className="suggestion-action-btn primary"
              >
                <span>📄</span> Download ATS Template (.docx)
              </a>
              <button
                type="button"
                className="suggestion-action-btn secondary"
                onClick={() => setIsGuideOpen(true)}
              >
                <span>📖</span> View Guide
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sections Verification Grid */}
      <div className="quality-sections-grid">
        {/* Contact */}
        <div className={`section-check-item ${sectionStatus.CONTACT ? "verified" : "missing"}`}>
          <div className="check-icon">{sectionStatus.CONTACT ? "✓" : "⚠️"}</div>
          <div className="check-content">
            <span className="check-label">Contact Information</span>
            <span className="check-val">
              {fields.email && fields.phone
                ? "Email & Phone verified"
                : fields.email
                ? "Email verified (No phone)"
                : fields.phone
                ? "Phone verified (No email)"
                : "No contact coordinates"}
            </span>
          </div>
        </div>

        {/* Experience */}
        <div className={`section-check-item ${sectionStatus.EXPERIENCE ? "verified" : "missing"}`}>
          <div className="check-icon">{sectionStatus.EXPERIENCE ? "✓" : "⚠️"}</div>
          <div className="check-content">
            <span className="check-label">Work Experience</span>
            <span className="check-val">
              {sectionStatus.EXPERIENCE
                ? fields.yearsOfExperience > 0
                  ? `${fields.yearsOfExperience}+ years stated`
                  : "Section found"
                : "Section not identified"}
            </span>
          </div>
        </div>

        {/* Education */}
        <div className={`section-check-item ${sectionStatus.EDUCATION ? "verified" : "missing"}`}>
          <div className="check-icon">{sectionStatus.EDUCATION ? "✓" : "⚠️"}</div>
          <div className="check-content">
            <span className="check-label">Education</span>
            <span className="check-val">
              {fields.degree || (sectionStatus.EDUCATION ? "Section found" : "Section not identified")}
            </span>
          </div>
        </div>

        {/* Skills */}
        <div className={`section-check-item ${sectionStatus.SKILLS ? "verified" : "missing"}`}>
          <div className="check-icon">{sectionStatus.SKILLS ? "✓" : "⚠️"}</div>
          <div className="check-content">
            <span className="check-label">Core Skills</span>
            <span className="check-val">
              {fields.groundedSkillsCount > 0
                ? `${fields.groundedSkillsCount} skills verified in text`
                : "No recognized skills"}
            </span>
          </div>
        </div>
      </div>

      {/* Actionable Feedback Messages */}
      {(issues.length > 0 || warnings.length > 0) && (
        <div className="quality-feedback-box">
          <div className="feedback-box-title">
            <span>📋</span> Actionable Guidance:
          </div>
          <ul className="feedback-messages-list">
            {issues.map((iss, i) => (
              <li key={`iss-${i}`} className="feedback-item issue">
                <strong>Attention:</strong> {iss.message}
              </li>
            ))}
            {warnings.map((warn, i) => (
              <li key={`warn-${i}`} className="feedback-item warning">
                <strong>Tip:</strong> {warn.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Expanded Details Panel */}
      {showAllDetails && (
        <div className="quality-expanded-details">
          <div className="details-columns">
            {/* Strengths */}
            <div className="details-col">
              <h4>Extracted Strengths</h4>
              {strengths.length > 0 ? (
                <ul>
                  {strengths.map((str, i) => (
                    <li key={`str-${i}`}>✓ {str}</li>
                  ))}
                </ul>
              ) : (
                <p className="details-empty">Add conventional headings to improve extraction scoring.</p>
              )}
            </div>

            {/* Traceability & Provenance */}
            <div className="details-col">
              <h4>Skill Provenance Traceability</h4>
              <p className="details-subtext">
                Every skill recognized by SkillSync must match verbatim words or recognized aliases in your uploaded text:
              </p>
              <div className="traceable-skills-wrap">
                {skillTraceability.verified && skillTraceability.verified.length > 0 ? (
                  skillTraceability.verified.slice(0, 15).map((sk, i) => (
                    <span key={`tr-${i}`} className="trace-tag verified" title="Traced to document text">
                      ✓ {sk}
                    </span>
                  ))
                ) : (
                  <span className="details-empty">No skills currently extracted.</span>
                )}
                {skillTraceability.verified && skillTraceability.verified.length > 15 && (
                  <span className="trace-tag more">
                    +{skillTraceability.verified.length - 15} more verified
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Guide Modal */}
      <ResumeTemplateModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
    </div>
  );
}
