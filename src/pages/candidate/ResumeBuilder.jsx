import { useEffect, useRef, useState, useCallback } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { supabase } from "../../services/supabase";
import {
  DEFAULT_RESUME_DATA,
  calculateResumeReadiness,
  loadCanonicalResume,
  saveCanonicalResume
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
  const [loading, setLoading] = useState(true);

  // Autosave status state: 'idle' | 'saving' | 'saved' | 'error'
  const [saveStatus, setSaveStatus] = useState("idle");
  const [lastSavedTime, setLastSavedTime] = useState(null);
  const debounceTimerRef = useRef(null);
  const latestDataRef = useRef(resumeData);
  latestDataRef.current = resumeData;

  // Load candidate resume data on mount
  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setUserId(user.id);

        // Load canonical structured data (with historical fallback prefill)
        const { resumeData: loadedData, historicalResume: hist } = await loadCanonicalResume(user.id);
        setResumeData(loadedData);
        setHistoricalResume(hist);
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
    if (!userId) return;
    setSaveStatus("saving");

    try {
      const res = await saveCanonicalResume(userId, dataToSave, options);
      if (res.success) {
        setSaveStatus("saved");
        const formattedTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        setLastSavedTime(formattedTime);

        // Also cache locally for immediate offline draft recovery
        try {
          localStorage.setItem(`skillsync_resume_draft_${userId}`, JSON.stringify(dataToSave));
        } catch (_) {}
      } else {
        setSaveStatus("error");
      }
    } catch (saveErr) {
      console.error("[ResumeBuilder] Autosave error:", saveErr);
      setSaveStatus("error");
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

  function handleExplicitSaveDraft() {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    performSave(latestDataRef.current);
    if (toast?.addToast) {
      toast.addToast("Draft saved successfully.", "success");
    }
  }

  function handleFinalize() {
    performSave(latestDataRef.current, { isFinalize: true, setActiveForMatching: true });
    if (toast?.addToast) {
      toast.addToast("Resume finalized and active for job matching!", "success");
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
              disabled={saveStatus === "saving"}
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
                className="builder-action-btn primary next-btn finish-btn"
                onClick={handleFinalize}
              >
                Save & Complete Resume ✓
              </button>
            )}
          </div>
        </footer>
      </div>
    </DashboardLayout>
  );
}
