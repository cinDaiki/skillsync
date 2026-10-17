import React from "react";

const STEPS = [
  { id: 1, label: "Personal Details", short: "Personal" },
  { id: 2, label: "Education & Training", short: "Education" },
  { id: 3, label: "Skills", short: "Skills" },
  { id: 4, label: "Experience", short: "Experience" },
  { id: 5, label: "Projects & Credentials", short: "Projects" },
  { id: 6, label: "Review Resume", short: "Review" }
];

export default function BuilderProgressBar({ currentStep, onSelectStep, readiness }) {
  const sections = readiness?.sections || [];

  return (
    <nav className="builder-progress-container" aria-label="Resume Builder Steps">
      <div className="builder-progress-header">
        <div className="builder-readiness-badge">
          <span className="readiness-icon" aria-hidden="true">📋</span>
          <span className="readiness-text">
            Resume Readiness: <strong>{readiness?.completedSections || 0} of 6 sections completed</strong> ({readiness?.percentage || 0}%)
          </span>
        </div>
      </div>

      <ol className="builder-steps-list">
        {STEPS.map((step) => {
          const isActive = currentStep === step.id;
          const sectionInfo = sections.find((s) => s.id === step.short.toLowerCase()) || {};
          const isComplete = step.id === 6 ? readiness?.canFinalize : sectionInfo.isComplete;
          const isAccessible = step.id <= currentStep || isComplete;

          let statusClass = "";
          if (isActive) statusClass = "active";
          else if (isComplete) statusClass = "completed";

          return (
            <li key={step.id} className={`builder-step-item ${statusClass}`}>
              <button
                type="button"
                className="builder-step-button"
                onClick={() => isAccessible && onSelectStep(step.id)}
                disabled={!isAccessible}
                aria-current={isActive ? "step" : undefined}
                title={`Step ${step.id}: ${step.label}`}
              >
                <span className="step-number" aria-hidden="true">
                  {isComplete && !isActive ? "✓" : step.id}
                </span>
                <span className="step-label">{step.label}</span>
              </button>
              {step.id < 6 && <div className="step-connector" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
