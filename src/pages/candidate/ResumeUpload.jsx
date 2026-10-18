import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { uploadResume, getResume, getResumeViewUrl } from "../../services/api";
import { syncApplicantSnapshot } from "../../services/applicationService";
import { supabase } from "../../services/supabase";
import { parseResumeFile } from "../../services/resumeParser";
import { triggerSimulationNotification } from "../../services/notificationService";
import { runMatchingForCandidate } from "../../services/matchingEngine";
import { generateAndStoreResumeEmbedding, buildResumeTextForEmbedding } from "../../services/ai/embeddingService";
import { runSemanticMatchingForCandidate } from "../../services/ai/semanticMatchingService";
import { useToast } from "../../contexts/ToastContext";
import SkillTagInput from "../../components/common/SkillTagInput.jsx";
import ResumeTemplateSection from "../../components/resume/ResumeTemplateSection.jsx";
import ResumeQualityCard from "../../components/resume/ResumeQualityCard.jsx";
import { assessResumeQuality } from "../../services/parser/qualityAssessor.js";
import { getActiveResumeSource, setActiveResumeSource } from "../../services/resumeBuilderService";
import "./ResumeUpload.css";

export default function ResumeUpload() {
  const toast = useToast();
  const fileInputRef = useRef(null);
  const [resumeFile, setResumeFile] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState(null);
  const [hasBuiltResume, setHasBuiltResume] = useState(false);
  const [activeSource, setActiveSource] = useState("upload");
  const [isSwitchingSource, setIsSwitchingSource] = useState(false);

  // Extracted Skills editor state (strictly isolated to Uploaded Resume snapshot)
  const [extractedSkills, setExtractedSkills] = useState([]);
  const [savingSkills, setSavingSkills] = useState(false);

  // History state (saved in localStorage to simulate upload history)
  const [uploadHistory, setUploadHistory] = useState([]);

  // Preview state
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const previewBlobRef = useRef(null);

  async function openPreview() {
    if (!resumeFile?.file_url) return;
    setShowPreviewModal(true);
    setPreviewUrl("");
    setPreviewError("");
    setPreviewLoading(true);
    try {
      const { url, error } = await getResumeViewUrl(resumeFile.file_url, 900);
      if (error || !url) {
        setPreviewError("Could not generate a preview link. Please try downloading the file instead.");
      } else {
        setPreviewUrl(url);
      }
    } catch (err) {
      setPreviewError("Unexpected error loading preview.");
    } finally {
      setPreviewLoading(false);
    }
  }

  function closePreview() {
    setShowPreviewModal(false);
    setPreviewUrl("");
    setPreviewError("");
    if (previewBlobRef.current) {
      URL.revokeObjectURL(previewBlobRef.current);
      previewBlobRef.current = null;
    }
  }

  async function handleDownloadResume() {
    if (!resumeFile?.file_url) return;
    try {
      const { url } = await getResumeViewUrl(resumeFile.file_url, 900);
      if (url) {
        const a = document.createElement("a");
        a.href = url;
        a.download = resumeFile.file_name || "resume.pdf";
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (_) { /* silent — user can retry */ }
  }

  useEffect(() => {
    loadResume();
  }, []);

  async function loadResume() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const [{ data }, { data: candProfRow }, sourceRes, { data: formRow }] = await Promise.all([
      getResume(user.id),
      supabase.from("candidate_profiles").select("*").eq("user_id", user.id).maybeSingle(),
      getActiveResumeSource(user.id),
      supabase.from("candidate_form_resumes").select("user_id").eq("user_id", user.id).maybeSingle()
    ]);

    if (formRow) {
      setHasBuiltResume(true);
    }
    if (sourceRes?.success) {
      setActiveSource(sourceRes.source);
    }

    if (data || candProfRow) {
      if (data) {
        if (data.parsed_details && !data.parsed_details.qualityAssessment) {
          data.parsed_details.qualityAssessment = assessResumeQuality({
            rawText: data.parsed_details._rawText || '',
            details: data.parsed_details,
            skills: data.extracted_skills ? data.extracted_skills.split(',') : [],
            parsedPipeline: data.parsed_details,
            fileName: data.file_name || ''
          });
        }
        setResumeFile(data);
      }

      // SECTION 5 FIX: Isolate uploaded resume skills strictly from data (the uploaded resume snapshot).
      // Never preload Builder-only skills from candidate_profiles into the Upload editor.
      let uploadSkills = [];
      if (data?.extracted_skills) {
        uploadSkills = data.extracted_skills.split(',').map(s => s.trim()).filter(Boolean);
      } else if (Array.isArray(data?.parsed_details?.skills)) {
        uploadSkills = data.parsed_details.skills.map(s => String(s).trim()).filter(Boolean);
      }
      setExtractedSkills(uploadSkills);
    } else {
      setExtractedSkills([]);
    }

    // Load simulated upload history from localStorage
    const localHistory = localStorage.getItem(`skillsync_resume_history_${user.id}`);
    if (localHistory) {
      setUploadHistory(JSON.parse(localHistory));
    } else if (data) {
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

    syncApplicantSnapshot(user.id).catch(() => {});
  }

  function handleAddResume() {
    if (fileInputRef.current) fileInputRef.current.click();
  }

  async function handleSwitchSource(newSource) {
    if (newSource === activeSource || isSwitchingSource || !userId) return;
    setIsSwitchingSource(true);
    try {
      const res = await setActiveResumeSource(userId, newSource);
      if (res?.success) {
        setActiveSource(newSource);
        const label = newSource === "builder" ? "Built Resume" : "Uploaded Resume";
        if (toast?.addToast) {
          toast.addToast(`Resume used for job matching switched to: ${label}`, "success");
        } else if (toast?.success) {
          toast.success(`Resume used for job matching switched to: ${label}`);
        }
        await loadResume();
      } else {
        const errMsg = res?.error || "Failed to switch resume source";
        if (toast?.addToast) {
          toast.addToast(errMsg, "error");
        } else if (toast?.error) {
          toast.error(errMsg);
        }
      }
    } finally {
      setIsSwitchingSource(false);
    }
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

    // Validation: Check for genuinely unreadable, empty, or corrupt documents.
    if (analysis.qualityAssessment?.extractionQuality?.isUnreadable || !analysis.extractedText?.trim()) {
      setMessage("Upload Failed: No readable text could be extracted from this document. If this is an image-only scan or unsupported binary, please use our editable ATS Word template or export as standard text.");
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const { data: fileUrl, error: uploadError } = await uploadResume(file, user.id);

    if (uploadError) {
      setMessage("Failed to upload resume. Please try again.");
      setLoading(false);
      return;
    }

    // Delete existing resume record before inserting new one
    const { error: delResumeErr } = await supabase.from("resumes").delete().eq("applicant_id", user.id);
    if (delResumeErr) {
      console.warn("[ResumeUpload] Notice clearing previous resume record:", delResumeErr.message);
    }

    const parsedDetailsObj = {
      ...(analysis.parsed || {}),
      ...analysis.details,
      skills: analysis.skills,
      qualityAssessment: analysis.qualityAssessment
    };

    const newRecord = {
      applicant_id: user.id,
      file_url: fileUrl,
      file_name: file.name,
      file_size: file.size,
      extracted_skills: analysis.skills.join(","),
      resume_score: analysis.parsed?.ats?.score || analysis.score,
      completeness: analysis.completeness,
      parsed_details: parsedDetailsObj
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

    // Sync detected skills to profiles table
    const { error: profErr } = await supabase.from("profiles").update({
      skills: analysis.skills.join(","),
    }).eq("id", user.id);

    if (profErr) {
      console.error("[ResumeUpload] Error updating profile skills:", profErr);
    }

    // Persist parsed resume data to candidate_profiles
    const { error: candProfErr } = await supabase.from("candidate_profiles").upsert({
      user_id: user.id,
      course: analysis.details.course || null,
      degree: analysis.details.degree || null,
      education_level: analysis.details.degree || null,
      skills: JSON.stringify(analysis.parsed?.skills || analysis.skills),
      certifications: JSON.stringify([]),
      years_experience: analysis.details.yearsOfExperience || 0,
      active_resume_source: 'upload',
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

    if (candProfErr) {
      console.error("[ResumeUpload] Error upserting candidate_profiles:", candProfErr);
    }

    // Trigger platform match notifications
    await triggerSimulationNotification(user.id, "resume_uploaded", {
      fileName: file.name,
      score: analysis.score,
      skillsCount: analysis.skills.length
    });

    // Reload from DB
    const { data: saved } = await getResume(user.id);
    if (saved) {
      setResumeFile(saved);
      const skillsList = saved.extracted_skills
        ? saved.extracted_skills.split(",").map(s => s.trim()).filter(Boolean)
        : [];
      setExtractedSkills(skillsList);
    }

    syncApplicantSnapshot(user.id).catch(() => {});

    // Run rule-based matching engine
    runMatchingForCandidate(user.id).catch(console.error);

    // Semantic AI Embedding Pipeline (non-blocking)
    (async () => {
      try {
        const resumeText = buildResumeTextForEmbedding(analysis, analysis.extractedText || '');
        const { embedding, error: embErr } = await generateAndStoreResumeEmbedding(user.id, resumeText);
        if (!embErr && embedding) {
          await supabase.from("resumes").update({
            parsed_details: {
              ...parsedDetailsObj,
              upload_embedding: embedding,
              upload_canonical_text: resumeText
            }
          }).eq("applicant_id", user.id);

          await runSemanticMatchingForCandidate(user.id, embedding);
        } else {
          await runMatchingForCandidate(user.id);
        }
      } catch (aiErr) {
        console.warn('[Resume] AI pipeline error (non-critical):', aiErr.message);
      }
    })();

    if (analysis.qualityAssessment?.extractionQuality?.isTextPoor) {
      setMessage("Resume uploaded. Note: Document contains very little extractable text. Review the extraction assessment below or consider using the ATS template.");
    } else if (analysis.qualityAssessment?.feedback?.warnings?.length > 0) {
      setMessage(`Resume uploaded and parsed successfully. Quality tip: ${analysis.qualityAssessment.feedback.warnings[0].message}`);
    } else {
      setMessage("Resume uploaded and parsed successfully.");
    }
    setLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleDeleteResume() {
    const confirmDelete = window.confirm("Are you sure you want to remove your uploaded resume?");
    if (!confirmDelete) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Check if candidate has a builder resume before deleting matching data
    const { data: formRow, error: formCheckErr } = await supabase
      .from("candidate_form_resumes")
      .select("resume_data")
      .eq("user_id", user.id)
      .maybeSingle();

    if (formCheckErr) {
      console.warn("[ResumeUpload] Notice checking builder resume before delete:", formCheckErr.message);
    }

    const hasBuilder = Boolean(formRow?.resume_data);

    if (hasBuilder) {
      // User has a built resume: delete only the uploaded resume record
      const { error: delErr } = await supabase.from("resumes").delete().eq("applicant_id", user.id);
      if (delErr) {
        console.error("[ResumeUpload] Error deleting resumes row:", delErr);
        if (toast?.error) toast.error("Failed to remove uploaded resume");
        return;
      }

      // Automatically project / activate Builder as active source
      const switchRes = await setActiveResumeSource(user.id, "builder");
      if (!switchRes.success) {
        console.warn("[ResumeUpload] Notice projecting builder source after upload removal:", switchRes.error);
      }

      setActiveSource("builder");
      if (toast?.success) {
        toast.success("Uploaded resume removed. Your Built Resume is now actively used for job matching.");
      }
    } else {
      // Neither source remains: clear all resume and matching data with strict error checking
      const { error: delResumeErr } = await supabase.from("resumes").delete().eq("applicant_id", user.id);
      if (delResumeErr) {
        console.error("[ResumeUpload] Error deleting resumes row:", delResumeErr);
      }

      const { error: delCandProfErr } = await supabase.from("candidate_profiles").delete().eq("user_id", user.id);
      if (delCandProfErr) {
        console.error("[ResumeUpload] Error deleting candidate_profiles row:", delCandProfErr);
      }

      const { error: clearProfErr } = await supabase.from("profiles").update({ skills: "" }).eq("id", user.id);
      if (clearProfErr) {
        console.error("[ResumeUpload] Error clearing profile skills:", clearProfErr);
      }

      if (toast?.success) {
        toast.success("Resume deleted successfully.");
      }
    }

    syncApplicantSnapshot(user.id).catch(() => {});
    setResumeFile(null);
    setExtractedSkills([]);
    setMessage("Uploaded resume removed.");
    if (fileInputRef.current) fileInputRef.current.value = "";
    await loadResume();
  }

  // Manage Extracted Skills Editor
  async function handleSkillsChange(updatedSkills) {
    setExtractedSkills(updatedSkills);
    await saveSkillsToDb(updatedSkills);
  }

  async function saveSkillsToDb(skillsArray) {
    if (!userId) return;
    setSavingSkills(true);
    const skillsString = skillsArray.join(",");

    // Always update resumes table (the upload source snapshot) with strict error check
    const { error: resumeErr } = await supabase
      .from("resumes")
      .update({ extracted_skills: skillsString })
      .eq("applicant_id", userId);

    if (resumeErr) {
      console.error("[ResumeUpload] Error updating resumes extracted_skills:", resumeErr);
      if (toast?.error) toast.error("Failed to update uploaded skills");
      setSavingSkills(false);
      return;
    }

    // Only update active matching projections if Upload is the active source!
    if (activeSource === "upload") {
      const { error: profErr } = await supabase
        .from("profiles")
        .update({ skills: skillsString })
        .eq("id", userId);

      if (profErr) {
        console.error("[ResumeUpload] Error updating profiles skills:", profErr);
        if (toast?.error) toast.error("Failed to update matching skills in profile");
        setSavingSkills(false);
        return;
      }

      const { error: candProfErr } = await supabase
        .from("candidate_profiles")
        .update({
          skills: JSON.stringify(skillsArray),
          updated_at: new Date().toISOString()
        })
        .eq("user_id", userId);

      if (candProfErr) {
        console.error("[ResumeUpload] Error updating candidate_profiles skills:", candProfErr);
        if (toast?.error) toast.error("Failed to update candidate matching profile");
        setSavingSkills(false);
        return;
      }

      syncApplicantSnapshot(userId).catch(() => {});
      
      // Run AI Matching Engine since upload skills were updated while upload is active
      runMatchingForCandidate(userId).catch(console.error);

      if (toast?.success) {
        toast.success("Skills updated and job matching recalculated.");
      }
    } else {
      // When Builder is active, do NOT alter candidate matching projection
      if (toast?.info) {
        toast.info("Uploaded skills updated. Your Built Resume remains active for job matching.");
      } else if (toast?.success) {
        toast.success("Uploaded skills updated (Built Resume remains active for matching).");
      }
    }

    setSavingSkills(false);
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

  return (
    <DashboardLayout
      role="candidate"
      title="Resume Upload"
      subtitle="Already have a resume? Upload it here to review your information and use it for job matching."
    >
      <section className="dashboard-panel">
        <div className="panel-header">
          <div>
            <h2>Resume Upload</h2>
            <p>Already have a resume? Upload it here to review your information and use it for job matching.</p>
          </div>
          <button className="panel-action" type="button" onClick={handleAddResume} disabled={loading}>
            {loading ? "Processing..." : "Upload New Resume"}
          </button>
        </div>

        {/* Bidirectional Active Resume Source Selector */}
        {hasBuiltResume && (
          <div className="active-source-selector-bar" role="region" aria-label="Resume used for job matching" style={{ margin: "16px 0 20px" }}>
            <div className="source-selector-content">
              <span className="source-selector-heading">Resume used for job matching:</span>
              <div className="source-selector-options">
                <label className={`source-radio-pill ${activeSource === "upload" ? "selected" : ""}`}>
                  <input
                    type="radio"
                    name="upload_active_source"
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
                    name="upload_active_source"
                    value="builder"
                    checked={activeSource === "builder"}
                    onChange={() => handleSwitchSource("builder")}
                    disabled={isSwitchingSource}
                  />
                  <span className="source-pill-text">📝 Built Resume</span>
                </label>
              </div>
            </div>
            {isSwitchingSource && <span className="source-switching-spinner">Switching active matching source...</span>}
          </div>
        )}

        {message && <div className="profile-message">{message}</div>}

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx"
          onChange={handleFileChange}
          hidden
        />

        {!resumeFile ? (
          <div>
            <div className="empty-state">
              <span>▤</span>
              <h3>No resume uploaded yet</h3>
              <p>
                Upload your resume in PDF or Word format. SkillSync will automatically analyze the structure, extract skill tags, and compile your qualifications for the Job Marketplace.
              </p>
              <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap", marginTop: "16px" }}>
                <button
                  className="panel-action"
                  type="button"
                  onClick={handleAddResume}
                  disabled={loading}
                >
                  {loading ? "Parsing file..." : "Choose File"}
                </button>
                <Link
                  to="/candidate/resume-builder"
                  className="panel-action secondary"
                  style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  Build Resume Step-by-Step →
                </Link>
              </div>
            </div>

            {/* Standard Resume Templates & ATS Guide */}
            <ResumeTemplateSection />

            {/* Empty Guidance CTA */}
            <div className="resume-marketplace-cta-card empty-guidance" style={{ marginTop: "24px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "14px", padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "14px" }}>
              <div>
                <h4 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#334155" }}>
                  Ready to discover matching positions?
                </h4>
                <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#64748b" }}>
                  Upload your resume above or create a resume using our Builder to unlock personalized job recommendations.
                </p>
              </div>
              <Link
                to="/candidate/jobs"
                className="panel-action secondary"
                style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px" }}
              >
                Browse All Jobs →
              </Link>
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
                      onClick={openPreview}
                    >
                      Quick Preview
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadResume}
                      className="resume-view-btn secondary"
                      style={{ display: "inline-grid", placeItems: "center" }}
                    >
                      Download
                    </button>
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

            {/* Resume Quality & Extraction Validation Assessment */}
            <ResumeQualityCard
              assessment={resumeFile.parsed_details?.qualityAssessment || null}
              onReupload={handleAddResume}
            />

            {/* Extracted Skills & Manual Corrections (strictly isolated to Uploaded Resume snapshot) */}
            <div className="resume-extracted-skills-card" style={{ marginTop: "24px", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "16px", padding: "20px", boxShadow: "0 4px 12px rgba(0,0,0,0.03)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "10px", marginBottom: "14px" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#1e293b", display: "flex", alignItems: "center", gap: "8px" }}>
                    <span>🏷️</span> Extracted Skills & Qualifications
                  </h3>
                  <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#64748b" }}>
                    Skills parsed from your uploaded resume. You can add missing skills or remove inaccuracies.
                  </p>
                </div>
                {savingSkills && (
                  <span style={{ fontSize: "12px", color: "#0284c7", fontWeight: 600 }}>Saving skills...</span>
                )}
              </div>

              <SkillTagInput
                skills={extractedSkills}
                onChange={handleSkillsChange}
                placeholder="Type a skill and press Enter or comma..."
              />

              {activeSource === "builder" && (
                <div style={{ marginTop: "14px", padding: "10px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", fontSize: "12px", color: "#166534" }}>
                  ℹ️ <strong>Note:</strong> Your <strong>Built Resume</strong> is currently active for job matching. Edits saved here update your uploaded resume snapshot without altering your active Built Resume matching profile.
                </div>
              )}
            </div>

            {/* Standard Resume Templates & ATS Guide for active resume holders */}
            <ResumeTemplateSection variant="compact" />

            {/* Primary Navigation CTA to Central Job Marketplace */}
            <div className="resume-marketplace-cta-card" style={{ marginTop: "24px", background: "linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%)", border: "1px solid #bfdbfe", borderRadius: "16px", padding: "24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "#1e293b" }}>
                  Explore opportunities that match your resume
                </h3>
                <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#475569" }}>
                  Your active resume is used to identify jobs aligned with your qualifications and experience.
                </p>
              </div>
              <Link
                to="/candidate/jobs?view=recommended"
                className="panel-action"
                style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "6px", fontWeight: 700 }}
              >
                View Job Matches →
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* PDF Quick Preview Modal Overlay */}
      {showPreviewModal && resumeFile?.file_url && (
        <div className="preview-modal-overlay" onClick={closePreview}>
          <div className="preview-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="preview-modal-header">
              <h3>Resume Preview: {resumeFile.file_name}</h3>
              <button className="preview-modal-close" onClick={closePreview}>×</button>
            </div>
            <div className="preview-modal-body">
              {previewLoading ? (
                <div style={{ textAlign: "center", padding: "80px 20px" }}>
                  <h3>Generating secure preview link...</h3>
                </div>
              ) : previewError ? (
                <div style={{ textAlign: "center", padding: "80px 20px" }}>
                  <span style={{ fontSize: "48px" }}>⚠️</span>
                  <h3>Preview unavailable</h3>
                  <p>{previewError}</p>
                  <button
                    type="button"
                    className="panel-action"
                    style={{ marginTop: "12px" }}
                    onClick={handleDownloadResume}
                  >
                    Download Resume
                  </button>
                </div>
              ) : resumeFile.file_name.toLowerCase().endsWith(".pdf") ? (
                <iframe
                  title="Resume PDF Preview"
                  src={previewUrl}
                  className="preview-iframe"
                />
              ) : (
                <div style={{ textAlign: "center", padding: "80px 20px" }}>
                  <span style={{ fontSize: "64px" }}>📄</span>
                  <h3>In-browser preview is only available for PDF documents.</h3>
                  <p>For Word files, please click download to review the content locally.</p>
                  <button
                    type="button"
                    className="panel-action"
                    style={{ textDecoration: "none", display: "inline-flex", marginTop: "12px" }}
                    onClick={handleDownloadResume}
                  >
                    Download Resume
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}