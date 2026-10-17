import { useEffect, useRef, useState, useCallback } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { supabase } from "../../services/supabase";
import {
  DEFAULT_RESUME_DATA,
  calculateResumeReadiness,
  loadCanonicalResume,
  saveCanonicalResume
} from "../../services/resumeBuilderService";
import {
  fetchSemanticMatchesForCandidate,
  refreshCandidateRecommendations
} from "../../services/ai/semanticMatchingService";
import {
  applyForJobWithSnapshot,
  getJobApplicationEligibility,
  syncApplicantSnapshot
} from "../../services/applicationService";
import { useToast } from "../../contexts/ToastContext";
import ErrorBoundary from "../../components/guards/ErrorBoundary.jsx";

// Builder Step Components
import BuilderProgressBar from "../../components/resume/builder/BuilderProgressBar.jsx";
import HistoricalResumeNotice from "../../components/resume/builder/HistoricalResumeNotice.jsx";
import Step1PersonalDetails from "../../components/resume/builder/Step1PersonalDetails.jsx";
import Step2Education from "../../components/resume/builder/Step2Education.jsx";
import Step3Skills from "../../components/resume/builder/Step3Skills.jsx";
import Step4Experience from "../../components/resume/builder/Step4Experience.jsx";
import Step5ProjectsCredentials from "../../components/resume/builder/Step5ProjectsCredentials.jsx";
import Step6Review from "../../components/resume/builder/Step6Review.jsx";
import ResumeTemplateSection from "../../components/resume/ResumeTemplateSection.jsx";

import "./Resume.css";

export default function Resume() {
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

  // Recommended Jobs state
  const [recommendedJobs, setRecommendedJobs] = useState([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [matchingJobs, setMatchingJobs] = useState(false);
  const [applications, setApplications] = useState([]);
  const [applyingJobId, setApplyingJobId] = useState(null);
  const [refreshingJobs, setRefreshingJobs] = useState(false);
  const [lastUpdatedText, setLastUpdatedText] = useState("");
  const [verificationStatus, setVerificationStatus] = useState("Pending Verification");

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

        // Load recommended jobs and applications
        setLoadingJobs(true);
        const [matches, appsRes, profileRes] = await Promise.all([
          fetchSemanticMatchesForCandidate(user.id),
          supabase.from("applications").select("job_id").eq("applicant_id", user.id),
          supabase.from("profiles").select("verification_status").eq("id", user.id).maybeSingle()
        ]);

        setRecommendedJobs(matches || []);
        setApplications((appsRes?.data || []).map((a) => a.job_id));
        setVerificationStatus(profileRes?.data?.verification_status || "Pending Verification");
        syncApplicantSnapshot(user.id).catch(() => {});
      } catch (err) {
        console.error("[ResumeBuilder] Init error:", err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // ── Autosave Engine ────────────────────────────────────────────────────────
  const performSave = useCallback(async (dataToSave) => {
    if (!userId) return;
    setSaveStatus("saving");

    try {
      const res = await saveCanonicalResume(userId, dataToSave);
      if (res.success) {
        setSaveStatus("saved");
        setLastSavedTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      } else {
        setSaveStatus("error");
      }
    } catch (err) {
      console.warn("[ResumeBuilder] Save error:", err);
      setSaveStatus("error");
    }
  }, [userId]);

  // Debounced autosave triggered whenever resumeData changes
  const handleDataChange = useCallback((newData) => {
    setResumeData(newData);
    setSaveStatus("saving");

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      performSave(newData);
    }, 1200);
  }, [performSave]);

  // Explicit Save Draft Button
  async function handleManualSaveDraft() {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    await performSave(latestDataRef.current);
    if (toast) toast.success("Draft saved successfully.");
  }

  // Step Navigation
  async function handleStepChange(targetStep) {
    if (targetStep === currentStep) return;
    // Save current step data before navigating
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    performSave(latestDataRef.current);
    setCurrentStep(targetStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleContinue() {
    if (currentStep < 6) {
      handleStepChange(currentStep + 1);
    }
  }

  function handleBack() {
    if (currentStep > 1) {
      handleStepChange(currentStep - 1);
    }
  }

  // Recommended Jobs Handlers
  async function handleRefreshRecommendations() {
    if (!userId) return;
    setRefreshingJobs(true);
    try {
      const { matches, totalEvaluatedJobs } = await refreshCandidateRecommendations(userId);
      setRecommendedJobs(matches || []);
      setLastUpdatedText(`Updated just now · ${totalEvaluatedJobs} open jobs evaluated`);
      if (toast) toast.success("Job recommendations updated!");
    } catch (err) {
      console.error("Failed refreshing recommendations:", err);
      if (toast) toast.error("Failed to refresh recommendations. Please try again.");
    } finally {
      setRefreshingJobs(false);
    }
  }

  async function handleApplyJob(job) {
    if (!userId || applyingJobId) return;
    setApplyingJobId(job.id);
    try {
      const elig = await getJobApplicationEligibility(job.id);
      if (elig && !elig.eligible) {
        if (toast) toast.error(`Your current match is ${elig.matchScore}%. This job requires ${elig.requiredMatch}%.`);
        return;
      }

      const { error } = await applyForJobWithSnapshot(job.id, userId);
      if (error) {
        if (toast) toast.error(error.message || "Failed to apply.");
        return;
      }
      setApplications((prev) => [...prev, job.id]);
      if (toast) toast.success(`Applied to "${job.title}" successfully!`);
    } catch (err) {
      if (toast) toast.error("Unexpected error applying.");
    } finally {
      setApplyingJobId(null);
    }
  }

  const readiness = calculateResumeReadiness(resumeData);

  return (
    <DashboardLayout
      role="candidate"
      title="Resume Builder"
      subtitle="Create your resume one step at a time. Add your education, skills, experience, projects, and other qualifications. You can save your progress and update your resume anytime."
    >
      <div className="resume-builder-container">
        {/* Historical Upload Notice (if candidate has a preserved upload) */}
        {historicalResume && (
          <HistoricalResumeNotice historicalResume={historicalResume} />
        )}

        {/* 6-Step Visual Progress Bar */}
        <BuilderProgressBar
          currentStep={currentStep}
          onSelectStep={handleStepChange}
          readiness={readiness}
        />

        {/* Step Body */}
        {loading ? (
          <div className="builder-step-section" style={{ textAlign: "center", padding: "60px 20px" }}>
            <span style={{ fontSize: "36px" }}>⏳</span>
            <p style={{ marginTop: "12px", color: "#64748b" }}>Loading your resume builder...</p>
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
                recommendedJobs={recommendedJobs}
                loadingJobs={loadingJobs}
                matchingJobs={matchingJobs}
                verificationStatus={verificationStatus}
                applications={applications}
                onApplyJob={handleApplyJob}
                applyingJobId={applyingJobId}
                onRefreshRecommendations={handleRefreshRecommendations}
                refreshingJobs={refreshingJobs}
                lastUpdatedText={lastUpdatedText}
              />
            )}

            {/* Resume Resources: Templates & Writing Guides (Non-intrusive) */}
            <div style={{ marginTop: "16px" }}>
              <ResumeTemplateSection variant="compact" />
            </div>

            {/* Sticky Bottom Navigation Footer */}
            <footer className="builder-bottom-navigation" aria-label="Resume Form Actions">
              <div className="autosave-status-wrap">
                <span
                  className={`autosave-dot ${saveStatus}`}
                  aria-hidden="true"
                />
                <span className="autosave-label">
                  {saveStatus === "saving" && "Saving..."}
                  {saveStatus === "saved" && (lastSavedTime ? `Saved at ${lastSavedTime}` : "Saved just now")}
                  {saveStatus === "idle" && (lastSavedTime ? `Saved at ${lastSavedTime}` : "All changes saved")}
                  {saveStatus === "error" && (
                    <span>
                      Couldn't save.{" "}
                      <button
                        type="button"
                        className="autosave-retry-btn"
                        onClick={() => performSave(latestDataRef.current)}
                      >
                        Retry
                      </button>
                    </span>
                  )}
                </span>
              </div>

              <div className="nav-buttons-wrap">
                <button
                  type="button"
                  className="builder-action-btn outline"
                  onClick={handleManualSaveDraft}
                  title="Save current progress"
                >
                  Save Draft
                </button>

                {currentStep > 1 && (
                  <button
                    type="button"
                    className="builder-action-btn secondary"
                    onClick={handleBack}
                  >
                    ← Back
                  </button>
                )}

                {currentStep < 6 && (
                  <button
                    type="button"
                    className="builder-action-btn primary"
                    onClick={handleContinue}
                  >
                    Continue →
                  </button>
                )}
              </div>
            </footer>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}