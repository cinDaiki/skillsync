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
  const isUnreadable = extractionQuality.isUnreadable || false;

  const issues = feedback.issues || [];
  const warnings = feedback.warnings || [];
  const strengths = feedback.strengths || [];

  const sectionStatus = sections.statusMap || {};

  return (
    <div className={`resume-quality-card ${isUnreadable ? "poor" : extractionRating.toLowerCase()}`} id="resume-quality-assessment">
      <div className="resume-check-overview">
        <div className="resume-check-main">
          <span className={`resume-check-symbol ${isUnreadable ? 'is-error' : extractionRating === 'GOOD' || extractionRating === 'EXCELLENT' ? 'is-success' : 'is-warning'}`} aria-hidden="true">
            {isUnreadable ? '!' : extractionRating === 'GOOD' || extractionRating === 'EXCELLENT' ? '✓' : 'i'}
          </span>
          <div>
            <h3>{isUnreadable ? "We couldn't read this file" : extractionRating === 'GOOD' || extractionRating === 'EXCELLENT' ? 'Your resume was read' : 'Your resume needs a quick review'}</h3>
            <p>{isUnreadable
              ? 'Try replacing it with a text-based PDF or Word file.'
              : 'Check the information SkillSync found before using this upload for matching.'}</p>
          </div>
        </div>
        <button type="button" className="resume-guided-text-button"
          onClick={() => setShowAllDetails(value => !value)} aria-expanded={showAllDetails}
          aria-controls="resume-guided-quality-details">
          {showAllDetails ? 'Hide details ↑' : 'View details ↓'}
        </button>
      </div>
      {isUnreadable && (
        <div className="resume-check-advice" role="status">
          <p><strong>What this means:</strong> No readable text was found. Previously saved profile details may still support job matches, but they were not verified from this file.</p>
          <button type="button" className="resume-guided-text-button" onClick={onReupload}>Replace file →</button>
        </div>
      )}
      {showAllDetails && (
        <div id="resume-guided-quality-details" className="resume-guided-quality-details">
          <div className="resume-check-technical">
            <span className={`extraction-rating-badge ${isUnreadable ? 'poor' : extractionRating.toLowerCase()}`}>
              {isUnreadable ? '❌ Text Extraction Failed (0%)' : `Extraction Quality: ${extractionRating} (${extractionScore}%)`}
            </span>
            <span className="quality-meta-pill">{extractionQuality.wordCount || 0} words found</span>
          </div>
          <h4>Resume Quality &amp; Extraction Assessment</h4>
          <p className="resume-check-technical-copy">These details describe document readability, not hiring probability.</p>

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
              {isUnreadable
                ? "Document unreadable — not extracted"
                : fields.email && fields.phone
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
              {isUnreadable
                ? "Document unreadable — not extracted"
                : sectionStatus.EXPERIENCE
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
              {isUnreadable
                ? (fields.degreeStored ? `Unextracted (Profile: ${fields.degreeStored})` : "Document unreadable — not extracted")
                : (fields.degreeProvenance === 'extracted'
                    ? fields.degree
                    : fields.degreeProvenance === 'profile_stored'
                    ? `Profile: ${fields.degreeStored} (Not in document)`
                    : (sectionStatus.EDUCATION ? "Section found" : "Section not identified"))}
            </span>
          </div>
        </div>

        {/* Skills */}
        <div className={`section-check-item ${sectionStatus.SKILLS ? "verified" : "missing"}`}>
          <div className="check-icon">{sectionStatus.SKILLS ? "✓" : "⚠️"}</div>
          <div className="check-content">
            <span className="check-label">Core Skills</span>
            <span className="check-val">
              {isUnreadable
                ? "Document unreadable — not extracted"
                : fields.groundedSkillsCount > 0
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

        </div>
      )}

      {/* Interactive Guide Modal */}
      <ResumeTemplateModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
    </div>
  );
}
