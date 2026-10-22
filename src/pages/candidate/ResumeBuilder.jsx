import { useEffect, useRef, useState, useCallback } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { supabase } from "../../services/supabase";
import {
  DEFAULT_RESUME_DATA,
  calculateResumeReadiness,
  loadCanonicalResume,
  saveCanonicalResume,
  getActiveResumeSource,
  setActiveResumeSource
} from "../../services/resumeBuilderService";
import { useToast } from "../../contexts/ToastContext";

// Builder Step Components
import BuilderProgressBar from "../../components/resume/builder/BuilderProgressBar.jsx";
import HistoricalResumeNotice from "../../components/resume/builder/HistoricalResumeNotice.jsx";
import Step1PersonalDetails from "../../components/resume/builder/Step1PersonalDetails.jsx";
import Step2Education from "../../components/resume/builder/Step2Education.jsx";
import Step3Skills from "../../components/resume/builder/Step3Skills.jsx";
import Step4Experience from "../../components/resume/builder/Step4Experience.jsx";
import Step5ProjectsCredentials from "../../components/resume/builder/Step5ProjectsCredentials.jsx";
import Step6Review from "../../components/resume/builder/Step6Review.jsx";

import "./ResumeBuilder.css";

export default function ResumeBuilder() {
  const toast = useToast();
  const [userId, setUserId] = useState(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [resumeData, setResumeData] = useState(DEFAULT_RESUME_DATA);
  const [historicalResume, setHistoricalResume] = useState(null);
  const [activeSource, setActiveSource] = useState("upload");
  const [isSwitchingSource, setIsSwitchingSource] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Autosave status state: 'idle' | 'saving' | 'saved' | 'error'
  const [saveStatus, setSaveStatus] = useState("idle");
  const [lastSavedTime, setLastSavedTime] = useState(null);
  const debounceTimerRef = useRef(null);
  const latestDataRef = useRef(resumeData);
  latestDataRef.current = resumeData;

  // Load candidate resume data and active resume source on mount
  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setUserId(user.id);

        const [{ resumeData: loadedData, historicalResume: hist }, sourceRes] = await Promise.all([
          loadCanonicalResume(user.id),
          getActiveResumeSource(user.id)
        ]);

        setResumeData(loadedData);
        setHistoricalResume(hist);
        if (sourceRes?.success) {
          setActiveSource(sourceRes.source);
        }
      } catch (err) {
        console.error("[ResumeBuilder] Init error:", err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // ── Autosave Engine ────────────────────────────────────────────────────────
  const performSave = useCallback(async (dataToSave, options = {}) => {
    if (!userId) return { success: false, error: "No user authenticated" };
    setSaveStatus("saving");

    try {
      const res = await saveCanonicalResume(userId, dataToSave, options);
      if (res?.success) {
        setSaveStatus("saved");
        const formattedTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        setLastSavedTime(formattedTime);

        // Also cache locally for immediate offline draft recovery
        try {
          localStorage.setItem(`skillsync_resume_draft_${userId}`, JSON.stringify(dataToSave));
        } catch (_) {}
        return res;
      } else {
        setSaveStatus("error");
        return res;
      }
    } catch (saveErr) {
      console.error("[ResumeBuilder] Autosave error:", saveErr);
      setSaveStatus("error");
      return { success: false, error: saveErr?.message || "Failed to save" };
    }
  }, [userId]);

  function handleDataChange(newData) {
    setResumeData(newData);
    setSaveStatus("saving");

    // Debounce save by 1200ms
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      performSave(newData);
    }, 1200);
  }

  async function handleExplicitSaveDraft() {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    const res = await performSave(latestDataRef.current);
    if (res?.success) {
      if (toast?.addToast) {
        toast.addToast("Draft saved successfully.", "success");
      }
    } else {
      if (toast?.addToast) {
        toast.addToast(res?.error || "Failed to save draft.", "error");
      }
    }
  }

  async function handleFinalize() {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    setIsFinalizing(true);
    try {
      const res = await performSave(latestDataRef.current, { isFinalize: true, setActiveForMatching: true });
      if (res?.success) {
        setActiveSource("builder");
        if (toast?.addToast) {
          toast.addToast("Built Resume is now active for job matching!", "success");
        }
      } else {
        if (toast?.addToast) {
          toast.addToast(res?.error || "Failed to finalize resume. Please try again.", "error");
        }
      }
      return res;
    } finally {
      setIsFinalizing(false);
    }
  }

  async function handleSwitchSource(newSource) {
    if (newSource === activeSource || isSwitchingSource || !userId) return;
    setIsSwitchingSource(true);
    try {
      const res = await setActiveResumeSource(userId, newSource);
      if (res?.success) {
        setActiveSource(newSource);
        if (toast?.addToast) {
          const label = newSource === "builder" ? "Built Resume" : "Uploaded Resume";
          toast.addToast(`Resume used for job matching switched to: ${label}`, "success");
        }
      } else {
        if (toast?.addToast) {
          toast.addToast(res?.error || "Failed to switch active resume source", "error");
        }
      }
    } finally {
      setIsSwitchingSource(false);
    }
  }

  // ── Step Navigation ────────────────────────────────────────────────────────
  function handleStepChange(targetStep) {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      performSave(latestDataRef.current);
    }
    setCurrentStep(targetStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleNext() {
    if (currentStep < 6) {
      handleStepChange(currentStep + 1);
    }
  }

  function handleBack() {
    if (currentStep > 1) {
      handleStepChange(currentStep - 1);
    }
  }

  const readiness = calculateResumeReadiness(resumeData);

  return (
    <DashboardLayout
      role="candidate"
      title="Resume Builder"
      subtitle="Don't have a resume yet? Build one step by step and download an editable Word resume."
    >
      <div className="resume-builder-page-wrapper">
        {/* Historical Upload Notice (if candidate has a preserved upload) */}
        {historicalResume && (
          <HistoricalResumeNotice historicalResume={historicalResume} />
        )}

        {/* Bidirectional Active Resume Source Selector */}
        {historicalResume && (
          <div className="active-source-selector-bar" role="region" aria-label="Resume used for job matching">
            <div className="source-selector-content">
              <span className="source-selector-heading">Resume used for job matching:</span>
              <div className="source-selector-options">
                <label className={`source-radio-pill ${activeSource === "upload" ? "selected" : ""}`}>
                  <input
                    type="radio"
                    name="builder_active_source"
                    value="upload"
                    checked={activeSource === "upload"}
                    onChange={() => handleSwitchSource("upload")}
                    disabled={isSwitchingSource}
                  />
                  <span className="source-pill-text">📄 Uploaded Resume</span>
                </label>
                <label className={`source-radio-pill ${activeSource === "builder" ? "selected" : ""}`}>
                  <input
                    type="radio"
                    name="builder_active_source"
                    value="builder"
                    checked={activeSource === "builder"}
                    onChange={() => handleSwitchSource("builder")}
                    disabled={isSwitchingSource}
                  />
                  <span className="source-pill-text">📝 Built Resume</span>
                </label>
              </div>
            </div>
            <p className="source-selector-subtext">
              {activeSource === "builder"
                ? "Your Built Resume is currently used for job recommendations."
                : "Your Uploaded Resume is currently used for job recommendations."}
            </p>
            {isSwitchingSource && <span className="source-switching-spinner">Switching active matching source...</span>}
          </div>
        )}

        {/* 6-Step Visual Progress Bar with integrated Readiness Meter & Autosave */}
        <BuilderProgressBar
          currentStep={currentStep}
          onSelectStep={handleStepChange}
          readiness={readiness}
          saveStatus={saveStatus}
          lastSavedTime={lastSavedTime}
          onRetrySave={() => performSave(latestDataRef.current)}
        />

        {/* Main Step Form Card (max-width: 900px, centered) */}
        <main className="builder-main-form-card" role="main">
          {loading ? (
            <div className="builder-loading-state">
              <span className="loading-spinner-icon" aria-hidden="true">⏳</span>
              <p>Loading your resume builder...</p>
            </div>
          ) : (
            <>
              {currentStep === 1 && (
                <Step1PersonalDetails
                  data={resumeData}
                  onChange={handleDataChange}
                />
              )}

              {currentStep === 2 && (
                <Step2Education
                  data={resumeData}
                  onChange={handleDataChange}
                />
              )}

              {currentStep === 3 && (
                <Step3Skills
                  data={resumeData}
                  onChange={handleDataChange}
                />
              )}

              {currentStep === 4 && (
                <Step4Experience
                  data={resumeData}
                  onChange={handleDataChange}
                />
              )}

              {currentStep === 5 && (
                <Step5ProjectsCredentials
                  data={resumeData}
                  onChange={handleDataChange}
                />
              )}

              {currentStep === 6 && (
                <Step6Review
                  data={resumeData}
                  onChange={handleDataChange}
                  onNavigateStep={handleStepChange}
                  onFinalize={handleFinalize}
                  isFinalizing={isFinalizing}
                  activeSource={activeSource}
                />
              )}
            </>
          )}
        </main>

        {/* Bottom Navigation Footer */}
        <footer className="builder-bottom-navigation-bar" aria-label="Resume Form Actions">
          <div className="nav-bar-inner">
            <button
              type="button"
              className="builder-action-btn outline back-btn"
              onClick={handleBack}
              disabled={currentStep === 1}
            >
              ← Back
            </button>

            <button
              type="button"
              className="builder-action-btn secondary save-draft-btn"
              onClick={handleExplicitSaveDraft}
              disabled={saveStatus === "saving" || isFinalizing}
            >
              {saveStatus === "saving" ? "Saving..." : "Save Draft"}
            </button>

            {currentStep < 6 ? (
              <button
                type="button"
                className="builder-action-btn primary next-btn"
                onClick={handleNext}
              >
                Continue →
              </button>
            ) : (
              <button
                type="button"
                className={`builder-action-btn primary next-btn finish-btn ${activeSource === "builder" ? "active-source-btn" : ""}`}
                onClick={handleFinalize}
                disabled={isFinalizing}
              >
                {isFinalizing
                  ? "Activating Built Resume..."
                  : activeSource === "builder"
                  ? "✓ Built Resume Active"
                  : "Use Built Resume"}
              </button>
            )}
          </div>
        </footer>
      </div>
    </DashboardLayout>
  );
}
