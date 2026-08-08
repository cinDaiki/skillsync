import { useEffect, useRef, useState, lazy, Suspense } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { uploadResume, saveResumeRecord, getResume } from "../../services/api";
import { syncApplicantSnapshot } from "../../services/applicationService";
import { supabase } from "../../services/supabase";
import { parseResumeFile } from "../../services/resumeParser";
import { triggerSimulationNotification }          from "../../services/notificationService";
import { runMatchingForCandidate }                 from "../../services/matchingEngine";
import { generateAndStoreResumeEmbedding,
         buildResumeTextForEmbedding }             from "../../services/ai/embeddingService";
import { runSemanticMatchingForCandidate }         from "../../services/ai/semanticMatchingService";
import RecommendedJobs                           from "../../components/resume/RecommendedJobs.jsx";
import { applyForJobWithSnapshot }                 from "../../services/applicationService";
import { fetchSemanticMatchesForCandidate }         from "../../services/ai/semanticMatchingService";
import { useToast }                                from "../../contexts/ToastContext";
import ErrorBoundary                               from "../../components/guards/ErrorBoundary.jsx";
import "./Resume.css";

// Lazy-loaded sub-components for Phase 6 modular UI
const ResumeTabs = lazy(() => import("../../components/resume/ResumeTabs.jsx"));
const AtsReport = lazy(() => import("../../components/resume/AtsReport.jsx"));
const SkillDictionary = lazy(() => import("../../components/resume/SkillDictionary.jsx"));
const ResumeMetadata = lazy(() => import("../../components/resume/ResumeMetadata.jsx"));

const TABS_CONFIG = [
  { id: 'jobs', label: 'Recommended Jobs', icon: '🎯' },
  { id: 'ats', label: 'ATS Scan Report', icon: '🤖' },
  { id: 'skills', label: 'AI Skill Dictionary', icon: '🧠' },
  { id: 'meta', label: 'Parsed Metadata', icon: '📝' }
];

export default function Resume() {
  const toast = useToast();
  const fileInputRef = useRef(null);
  const [resumeFile, setResumeFile] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState(null);

  // Tab State
  const [activeTab, setActiveTab] = useState('jobs');

  // Recommended Jobs State (Phase 8)
  const [recommendedJobs, setRecommendedJobs] = useState([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [matchingJobs, setMatchingJobs] = useState(false);
  const [applications, setApplications] = useState([]);
  const [applyingJobId, setApplyingJobId] = useState(null);

  // Skills editor state
  const [extractedSkills, setExtractedSkills] = useState([]);
  const [newSkillInput, setNewSkillInput] = useState("");
  const [savingSkills, setSavingSkills] = useState(false);

  // History state (saved in localStorage to simulate upload history)
  const [uploadHistory, setUploadHistory] = useState([]);

  // Preview state
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  useEffect(() => {
    loadResume();
  }, []);

  async function loadResume() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const { data } = await getResume(user.id);
    if (data) {
      setResumeFile(data);
      const skillsList = data.extracted_skills
        ? data.extracted_skills.split(",").map(s => s.trim()).filter(Boolean)
        : [];
      setExtractedSkills(skillsList);
    }

    // Load simulated upload history from localStorage
    const localHistory = localStorage.getItem(`skillsync_resume_history_${user.id}`);
    if (localHistory) {
      setUploadHistory(JSON.parse(localHistory));
    } else if (data) {
      // Seed history with current resume
      const initialHistory = [{
        id: data.id || "current",
        file_name: data.file_name,
        file_size: data.file_size,
        created_at: data.created_at,
        status: "Active"
      }];
      setUploadHistory(initialHistory);
      localStorage.setItem(`skillsync_resume_history_${user.id}`, JSON.stringify(initialHistory));
    }

    // Load Phase 8 Job Matches & Applications
    setLoadingJobs(true);
    try {
      const [matches, appsRes] = await Promise.all([
        fetchSemanticMatchesForCandidate(user.id),
        supabase.from("applications").select("job_id").eq("applicant_id", user.id)
      ]);
      setRecommendedJobs(matches || []);
      setApplications((appsRes?.data || []).map(a => a.job_id));
    } catch (err) {
      console.warn("Failed loading job recommendations:", err);
    } finally {
      setLoadingJobs(false);
    }

    syncApplicantSnapshot(user.id).catch(() => {});
  }

  function handleAddResume() {
    if (fileInputRef.current) fileInputRef.current.click();
  }

  async function handleFileChange(event) {
    const file = event.target.files[0];
    if (!file) return;

    const allowedExtensions = [".pdf", ".doc", ".docx"];
    const fileName = file.name.toLowerCase();
    const hasAllowedExtension = allowedExtensions.some((ext) =>
      fileName.endsWith(ext)
    );

    if (!hasAllowedExtension) {
      setMessage("Please upload a PDF, DOC, or DOCX resume file.");
      return;
    }

    setLoading(true);
    setMessage("");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setMessage("You must be logged in to upload a resume.");
      setLoading(false);
      return;
    }

    // Client-side Skill & Score analysis
    const analysis = await parseResumeFile(file);

    // Smart Validation — works for all resume types and formats
    // PDF/DOCX files get benefit of the doubt since binary content limits text extraction.
    const isComplexFile = file.name.match(/\.(pdf|docx?)$/i);
    const missingSections = [];

    if (!analysis.details.hasEducationSection && !isComplexFile) {
      missingSections.push("Education");
    }
    if (!analysis.details.hasExperienceSection && !isComplexFile) {
      missingSections.push("Work Experience");
    }
    // Contact: only block if NEITHER email NOR phone NOR social links detected and it's not a complex file
    if (!analysis.details.hasContact && !isComplexFile) {
      missingSections.push("Contact Information");
    }

    if (missingSections.length > 0) {
      setMessage(`Validation Failed: Your resume is missing key sections (${missingSections.join(", ")}). Please revise your file and try again.`);
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const tUploadStart = performance.now();
    const { data: fileUrl, error: uploadError } = await uploadResume(file, user.id);
    const dUpload = performance.now() - tUploadStart;

    if (uploadError) {
      setMessage("Failed to upload resume. Please try again.");
      setLoading(false);
      return;
    }

    const tDbOpsStart = performance.now();
    // Delete existing resume record before inserting new one
    await supabase.from("resumes").delete().eq("applicant_id", user.id);

    const newRecord = {
      applicant_id: user.id,
      file_url: fileUrl,
      file_name: file.name,
      file_size: file.size,
      extracted_skills: analysis.skills.join(","),
      resume_score: analysis.parsed?.ats?.score || analysis.score,
      completeness: analysis.completeness,
      parsed_details: analysis.parsed || analysis.details
    };

    const { error: dbError } = await supabase
      .from("resumes")
      .insert([newRecord]);

    if (dbError) {
      setMessage(`Resume uploaded but failed to save record: ${dbError.message}`);
      setLoading(false);
      return;
    }

    // Add to simulated history
    const historyItem = {
      id: Math.random().toString(36).substring(7),
      file_name: file.name,
      file_size: file.size,
      created_at: new Date().toISOString(),
      status: "Active"
    };
    const updatedHistory = [historyItem, ...uploadHistory.map(h => ({ ...h, status: "Archived" }))].slice(0, 5);
    setUploadHistory(updatedHistory);
    localStorage.setItem(`skillsync_resume_history_${user.id}`, JSON.stringify(updatedHistory));

    // Sync detected skills to profiles table (ALWAYS overwrite with latest parsed data)
    await supabase.from("profiles").update({
      skills: analysis.skills.join(","),
    }).eq("id", user.id);

    // FIX: Persist ALL parsed resume data to candidate_profiles before running matching engine
    await supabase.from("candidate_profiles").upsert({
      user_id: user.id,
      course: analysis.details.course || null,
      degree: analysis.details.degree || null,
      education_level: analysis.details.degree || null,
      skills: JSON.stringify(analysis.parsed?.skills || analysis.skills),
      certifications: JSON.stringify([]),
      years_experience: analysis.details.yearsOfExperience || 0,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

    // Trigger platform match notifications
    await triggerSimulationNotification(user.id, "resume_uploaded", {
      fileName: file.name,
      score: analysis.score,
      skillsCount: analysis.skills.length
    });
    const dDbOps = performance.now() - tDbOpsStart;

    // Reload from DB
    const tReloadStart = performance.now();
    const { data: saved } = await getResume(user.id);
    if (saved) {
      setResumeFile(saved);
      const skillsList = saved.extracted_skills
        ? saved.extracted_skills.split(",").map(s => s.trim()).filter(Boolean)
        : [];
      setExtractedSkills(skillsList);
    }
    const dReload = performance.now() - tReloadStart;

    syncApplicantSnapshot(user.id).catch(() => {});

    console.log(`[Perf-UploadFlow] Upload Flow database and matching stages:
      - Storage uploadResume(): ${dUpload.toFixed(2)}ms
      - Supabase database upserts: ${dDbOps.toFixed(2)}ms
      - DB Reload getResume(): ${dReload.toFixed(2)}ms`);

    // Run rule-based matching engine (existing)
    const tRuleMatch = performance.now();
    runMatchingForCandidate(user.id)
      .then(() => {
        console.log(`[Perf-UploadFlow] Rule-based matching complete in ${(performance.now() - tRuleMatch).toFixed(2)}ms`);
      })
      .catch(console.error);

    // ── Semantic AI Embedding Pipeline (non-blocking) ────────────────────
    // Runs in background — generates a 384-dim embedding from resume text,
    // stores it in resumes.resume_embedding, then runs semantic matching.
    ;(async () => {
      try {
        setMatchingJobs(true);
        const resumeText = buildResumeTextForEmbedding(analysis, analysis.extractedText || '')
        const { embedding, error: embErr } = await generateAndStoreResumeEmbedding(user.id, resumeText)
        if (!embErr && embedding) {
          await runSemanticMatchingForCandidate(user.id, embedding)
          console.log('[Resume] Semantic AI matching complete.')
        } else {
          console.warn('[Resume] Embedding generation failed — running rule-based fallback matching.', embErr?.message)
          await runMatchingForCandidate(user.id)
        }
        const freshMatches = await fetchSemanticMatchesForCandidate(user.id);
        setRecommendedJobs(freshMatches || []);
      } catch (aiErr) {
        console.warn('[Resume] AI pipeline error (non-critical):', aiErr.message)
      } finally {
        setMatchingJobs(false);
      }
    })()
    // ── End AI Pipeline ──────────────────────────────────────────────────

    setMessage("Resume uploaded and parsed successfully.");
    setLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleApplyJob(job) {
    if (!userId || applyingJobId) return;
    setApplyingJobId(job.id);
    try {
      const { error } = await applyForJobWithSnapshot(job.id, userId);
      if (error) {
        if (toast) toast.error(error.message || 'Failed to apply.');
        return;
      }
      setApplications(prev => [...prev, job.id]);
      if (toast) toast.success(`Applied to "${job.title}" successfully!`);
      await triggerSimulationNotification(userId, 'job_applied', { jobTitle: job.title });
    } catch (err) {
      if (toast) toast.error('Unexpected error applying.');
    } finally {
      setApplyingJobId(null);
    }
  }

  async function handleDeleteResume() {
    const confirmDelete = window.confirm("Are you sure you want to delete your resume? This will also remove your job matches.");
    if (!confirmDelete) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Delete resume record
    await supabase.from("resumes").delete().eq("applicant_id", user.id);

    // Clear candidate_profiles (removes matching engine source data)
    await supabase.from("candidate_profiles").delete().eq("user_id", user.id);

    // Clear job_matches (no resume = no matches)
    await supabase.from("job_matches").delete().eq("user_id", user.id);

    // Clear skills from profiles table
    await supabase.from("profiles").update({ skills: "" }).eq("id", user.id);

    syncApplicantSnapshot(user.id).catch(() => {});
    setResumeFile(null);
    setExtractedSkills([]);
    setMessage("Resume deleted. Your job matches have been cleared.");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Manage Extracted Skills Editor
  async function handleAddSkillTag(e) {
    e.preventDefault();
    const trimmed = newSkillInput.trim();
    if (!trimmed || extractedSkills.includes(trimmed)) return;

    const updatedSkills = [...extractedSkills, trimmed];
    setExtractedSkills(updatedSkills);
    setNewSkillInput("");

    await saveSkillsToDb(updatedSkills);
  }

  async function handleRemoveSkillTag(skillToRemove) {
    const updatedSkills = extractedSkills.filter(s => s !== skillToRemove);
    setExtractedSkills(updatedSkills);

    await saveSkillsToDb(updatedSkills);
  }

  async function saveSkillsToDb(skillsArray) {
    if (!userId) return;
    setSavingSkills(true);
    const skillsString = skillsArray.join(",");

    // Save to resumes table
    await supabase.from("resumes").update({ extracted_skills: skillsString }).eq("applicant_id", userId);

    // Save to profiles table as well to keep skills synchronized
    await supabase.from("profiles").update({ skills: skillsString }).eq("id", userId);

    syncApplicantSnapshot(userId).catch(() => {});
    
    // Run AI Matching Engine since skills were updated
    runMatchingForCandidate(userId).catch(console.error);

    setSavingSkills(false);
  }

  function getScoreRating(score) {
    if (score >= 80) return { label: "Excellent Match Quality", class: "excellent" };
    if (score >= 50) return { label: "Good Quality Profile", class: "good" };
    return { label: "Needs Improvement", class: "poor" };
  }

  function formatFileSize(size) {
    if (!size) return "Unknown size";
    return `${(size / 1024 / 1024).toFixed(2)} MB`;
  }

  function formatUploadDate(dateString) {
    if (!dateString) return "";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  const scoreInfo = resumeFile ? getScoreRating(resumeFile.resume_score || 50) : null;
  const strokeDashoffset = resumeFile ? 200 - (200 * (resumeFile.resume_score || 0)) / 100 : 200;

  return (
    <DashboardLayout
      role="candidate"
      title="Resume Management"
      subtitle="Optimize your resume and manage auto-extracted qualifications."
    >
      <section className="dashboard-panel">
        <div className="panel-header">
          <div>
            <h2>Resume Upload & Parsing</h2>
            <p>Upload a new resume to automatically scan skills and calculate match scores.</p>
          </div>
          <button className="panel-action" type="button" onClick={handleAddResume} disabled={loading}>
            {loading ? "Processing..." : "Upload New Resume"}
          </button>
        </div>

        {message && <div className="profile-message">{message}</div>}

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx"
          onChange={handleFileChange}
          hidden
        />

        {!resumeFile ? (
          <div className="empty-state">
            <span>▤</span>
            <h3>No resume uploaded yet</h3>
            <p>
              Upload your resume in PDF or Word format. SkillSync will automatically analyze the structure, extract skill tags, and compile your match percentage.
            </p>
            <button
              className="panel-action"
              type="button"
              onClick={handleAddResume}
              disabled={loading}
              style={{ marginTop: "12px", marginBottom: "20px" }}
            >
              {loading ? "Parsing file..." : "Choose File"}
            </button>
            <div className="resume-templates-section" style={{ borderTop: "1px solid #e2e8f0", paddingTop: "20px", marginTop: "10px", width: "100%", maxWidth: "400px", margin: "0 auto" }}>
              <p style={{ fontSize: "13px", color: "#667085", marginBottom: "12px", fontWeight: "600" }}>Need a standard format? Download our ATS-friendly templates:</p>
              <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
                <a href="#" className="template-download-btn" style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", padding: "6px 12px", border: "1px solid #cbd5e1", borderRadius: "6px", textDecoration: "none", color: "#334155" }}>
                  <span style={{ color: "#ef4444" }}>📄</span> PDF Template
                </a>
                <a href="#" className="template-download-btn" style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", padding: "6px 12px", border: "1px solid #cbd5e1", borderRadius: "6px", textDecoration: "none", color: "#334155" }}>
                  <span style={{ color: "#2563eb" }}>📝</span> DOCX Template
                </a>
              </div>
            </div>
          </div>
        ) : (
          <div>
            {/* Active Resume Information Banner */}
            <div className="resume-file-card">
              <div className="resume-file-icon">📄</div>
              <div className="resume-file-info">
                <h3>{resumeFile.file_name || "Resume.pdf"}</h3>
                <p>
                  {formatFileSize(resumeFile.file_size)} • Uploaded{" "}
                  {formatUploadDate(resumeFile.created_at)}
                </p>
              </div>
              <div className="resume-file-actions">
                {resumeFile.file_url && (
                  <>
                    <button
                      type="button"
                      className="resume-view-btn"
                      onClick={() => setShowPreviewModal(true)}
                    >
                      Quick Preview
                    </button>
                    <a
                      href={resumeFile.file_url}
                      download={resumeFile.file_name || "resume.pdf"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="resume-view-btn secondary"
                      style={{ display: "inline-grid", placeItems: "center", textDecoration: "none" }}
                    >
                      Download
                    </a>
                  </>
                )}
                <button
                  className="resume-delete-btn"
                  type="button"
                  onClick={handleDeleteResume}
                >
                  Delete File
                </button>
              </div>
            </div>

            {/* Tabbed Analysis System */}
            <div className="resume-tabs-container" style={{ marginTop: "24px" }}>
              <Suspense fallback={<div className="tab-loading-spinner">Loading tabs...</div>}>
                <ResumeTabs 
                  activeTab={activeTab} 
                  tabs={TABS_CONFIG} 
                  onChange={setActiveTab} 
                />
              </Suspense>

              <div className="resume-tab-panel-container" style={{ marginTop: "16px" }}>
                <ErrorBoundary>
                  <Suspense fallback={<div className="panel-loading-spinner">Loading analysis view...</div>}>
                    {activeTab === 'jobs' && (
                      <RecommendedJobs
                        jobs={recommendedJobs}
                        loading={loadingJobs}
                        matching={matchingJobs}
                        hasResume={!!resumeFile}
                        applications={applications}
                        onApply={handleApplyJob}
                        applyingJobId={applyingJobId}
                      />
                    )}
                    {activeTab === 'ats' && (
                      <AtsReport atsData={resumeFile.parsed_details?.ats || null} />
                    )}
                    {activeTab === 'skills' && (
                      <div className="skills-tab-split-grid">
                        <SkillDictionary skills={resumeFile.parsed_details?.skills || []} />
                        
                        {/* Interactive Skills tag editor next to dictionary */}
                        <div className="extracted-skills-card">
                          <div className="extracted-skills-header">
                            <h3>Tag Customizer</h3>
                            <span className="skills-count-badge">{extractedSkills.length} Total</span>
                          </div>
                          <p style={{ fontSize: "12px", color: "#667085", marginBottom: "12px" }}>
                            Review tags parsed from your file. You can add new ones or prune legacy tags.
                          </p>
                          <form className="skills-editor-input-row" onSubmit={handleAddSkillTag}>
                            <input
                              type="text"
                              value={newSkillInput}
                              onChange={(e) => setNewSkillInput(e.target.value)}
                              placeholder="Add a new skill (e.g. React)"
                              className="skills-editor-input"
                              disabled={savingSkills}
                            />
                            <button type="submit" className="skills-editor-add-btn" disabled={savingSkills}>
                              Add
                            </button>
                          </form>
                          {extractedSkills.length > 0 ? (
                            <div className="profile-skills-display">
                              {extractedSkills.map((skill) => (
                                <span key={skill} className="profile-skill-tag">
                                  {skill}
                                  <button 
                                    type="button" 
                                    className="profile-skill-remove" 
                                    onClick={() => handleRemoveSkillTag(skill)}
                                    disabled={savingSkills}
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p style={{ color: "#8b8f9c", fontStyle: "italic", textAlign: "center", padding: "12px" }}>
                              No skills. Add tags above!
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                    {activeTab === 'meta' && (
                      <ResumeMetadata details={resumeFile.parsed_details} />
                    )}
                  </Suspense>
                </ErrorBoundary>
              </div>
            </div>

            {/* Resume Upload History Timeline */}
            <div className="upload-history-card">
              <h3>Upload & Parsing History Log</h3>
              {uploadHistory.length > 0 ? (
                <div className="history-list">
                  {uploadHistory.map((item, index) => (
                    <div className="history-item" key={item.id || index}>
                      <div className="history-item-info">
                        <h4>{item.file_name}</h4>
                        <p>{formatFileSize(item.file_size)} • Uploaded {formatUploadDate(item.created_at)}</p>
                      </div>
                      <div className="history-item-actions">
                        <span className={item.status === "Active" ? "history-action-badge" : "overview-status closed"} style={{ fontSize: "11px" }}>
                          {item.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: "#667085", fontSize: "13px" }}>No previous upload history details recorded.</p>
              )}
            </div>
          </div>
        )}
      </section>

      {/* PDF Quick Preview Modal Overlay */}
      {showPreviewModal && resumeFile?.file_url && (
        <div className="preview-modal-overlay" onClick={() => setShowPreviewModal(false)}>
          <div className="preview-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="preview-modal-header">
              <h3>Resume Preview: {resumeFile.file_name}</h3>
              <button className="preview-modal-close" onClick={() => setShowPreviewModal(false)}>×</button>
            </div>
            <div className="preview-modal-body">
              {resumeFile.file_name.toLowerCase().endsWith(".pdf") ? (
                <iframe
                  title="Resume PDF Preview"
                  src={resumeFile.file_url}
                  className="preview-iframe"
                />
              ) : (
                <div style={{ textAlign: "center", padding: "80px 20px" }}>
                  <span style={{ fontSize: "64px" }}>📄</span>
                  <h3>In-browser preview is only available for PDF documents.</h3>
                  <p>For Word files, please click download to review the content locally.</p>
                  <a
                    href={resumeFile.file_url}
                    download={resumeFile.file_name}
                    className="panel-action"
                    style={{ textDecoration: "none", display: "inline-flex", marginTop: "12px" }}
                  >
                    Download Resume
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}