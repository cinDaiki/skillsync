import { useState } from "react";
import ResumeTemplateModal from "./ResumeTemplateModal.jsx";

export default function ResumeTemplateSection({ variant = "standard" }) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className={`resume-template-section ${variant === "compact" ? "compact" : ""}`}>
      <div className="template-section-header">
        <div className="template-section-title-wrap">
          <div className="template-toolkit-badge">
            <span>✨</span> ATS-Optimized Resume Toolkit
          </div>
          <h3>Download Standard Resume Templates</h3>
          <p>
            Start with our verified, single-column Microsoft Word templates engineered for accurate parser extraction,
            ATS compliance, and high match scores on SkillSync.
          </p>
        </div>
        <button
          type="button"
          className="template-guide-trigger-btn"
          onClick={() => setIsModalOpen(true)}
        >
          <span>📖</span> View Filling Guide & Instructions
        </button>
      </div>

      <div className="template-cards-grid">
        {/* Card 1: Blank Editable Template */}
        <div className="template-card">
          <div className="template-card-icon-wrap docx">
            <span className="template-icon">📄</span>
            <span className="template-format-pill">.DOCX</span>
          </div>
          <div className="template-card-content">
            <h4>Blank ATS Resume Template</h4>
            <p>
              Pre-structured single-column template with standard sections for Contact, Summary, Skills, Experience, Education, Projects, and Certifications.
            </p>
            <div className="template-card-meta">
              <span>Microsoft Word • 23 KB • Single-Column</span>
            </div>
            <a
              href="/templates/SkillSync_ATS_Resume_Template.docx"
              download="SkillSync_ATS_Resume_Template.docx"
              className="template-action-btn primary"
              id="download-blank-resume-template"
            >
              <span>⬇️</span> Download Blank Template (.docx)
            </a>
          </div>
        </div>

        {/* Card 2: Completed Fictional Sample */}
        <div className="template-card">
          <div className="template-card-icon-wrap sample">
            <span className="template-icon">👤</span>
            <span className="template-format-pill">100% SCORE</span>
          </div>
          <div className="template-card-content">
            <h4>Completed Fictional Sample</h4>
            <p>
              Full engineering resume for <em>Alex Rivera</em> (Senior Full Stack Engineer) demonstrating how to format skill categories, quantified metrics, and credentials.
            </p>
            <div className="template-card-meta">
              <span>Verified 100% ATS Score • 24 KB</span>
            </div>
            <a
              href="/templates/SkillSync_Completed_Sample_Resume.docx"
              download="SkillSync_Completed_Sample_Resume.docx"
              className="template-action-btn secondary"
              id="download-sample-resume-template"
            >
              <span>⬇️</span> Download Sample (.docx)
            </a>
          </div>
        </div>

        {/* Card 3: Plain Guide & Walkthrough */}
        <div className="template-card guide">
          <div className="template-card-icon-wrap txt">
            <span className="template-icon">💡</span>
            <span className="template-format-pill">GUIDE</span>
          </div>
          <div className="template-card-content">
            <h4>Writing Guide & ATS Tips</h4>
            <p>
              Section-by-section filling instructions, AI dictionary keyword recommendations, and step-by-step guidance on uploading to SkillSync.
            </p>
            <div className="template-card-meta">
              <span>ATS Formatting Checklist • Text Guide</span>
            </div>
            <div className="template-btn-row">
              <button
                type="button"
                className="template-action-btn outline"
                onClick={() => setIsModalOpen(true)}
                id="open-resume-guide-modal"
              >
                <span>🔍</span> Open Guide
              </button>
              <a
                href="/templates/SkillSync_Resume_Writing_Guide.txt"
                download="SkillSync_Resume_Writing_Guide.txt"
                className="template-action-btn text-link"
                id="download-plain-resume-guide"
              >
                <span>📄</span> Text Guide (.txt)
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="template-features-bar">
        <div className="feature-item">
          <span className="check">✓</span> 100% Compatible with Word, Google Docs & LibreOffice
        </div>
        <div className="feature-item">
          <span className="check">✓</span> Standardized Heading Aliases for Parser Accuracy
        </div>
        <div className="feature-item">
          <span className="check">✓</span> Optimized for SkillSync Job-Fit Matching Engine
        </div>
      </div>

      {/* Guide Modal */}
      <ResumeTemplateModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
}
