import React from "react";

const STEPS = [
  { id: 1, label: "Personal Details", short: "Personal" },
  { id: 2, label: "Education & Training", short: "Education" },
  { id: 3, label: "Skills", short: "Skills" },
  { id: 4, label: "Experience", short: "Experience" },
  { id: 5, label: "Projects & Credentials", short: "Extras" },
  { id: 6, label: "Review Resume", short: "Review" }
];

export default function BuilderProgressBar({
  currentStep,
  onSelectStep,
  readiness,
  saveStatus = "idle",
  lastSavedTime = null,
  onRetrySave
}) {
  const sections = readiness?.sections || [];
  const pct = readiness?.percentage || 0;

  return (
    <nav className="builder-progress-container" aria-label="Resume Builder Steps">
      {/* Top Readiness & Autosave Header */}
      <div className="builder-progress-header">
        {currentStep !== 6 && (
          <div className="builder-readiness-block">
            <div className="readiness-label-row">
              <span className="readiness-title">Resume Readiness</span>
              <span className="readiness-percentage">{pct}%</span>
            </div>
            <div className="readiness-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="readiness-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        <div className="builder-header-autosave" aria-live="polite">
          <span className={`autosave-dot ${saveStatus}`} aria-hidden="true" />
          <span className="autosave-text">
            {saveStatus === "saving" && "Saving..."}
            {saveStatus === "saved" && (lastSavedTime ? `Saved at ${lastSavedTime}` : "Saved just now")}
            {saveStatus === "idle" && (lastSavedTime ? `Saved at ${lastSavedTime}` : "All changes saved")}
            {saveStatus === "error" && (
              <span className="autosave-error-text">
                Couldn't save.{" "}
                {onRetrySave && (
                  <button type="button" className="retry-save-link" onClick={onRetrySave}>
                    Retry
                  </button>
                )}
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Visual Stepper */}
      <ol className="builder-steps-list">
        {STEPS.map((step) => {
          const isActive = currentStep === step.id;
          const sectionKey = step.short === "Extras" ? "projects" : step.short.toLowerCase();
          const sectionInfo = sections.find((s) => s.id === sectionKey) || {};
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
                <span className="step-label">{step.short}</span>
              </button>
              {step.id < 6 && <div className="step-connector" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
