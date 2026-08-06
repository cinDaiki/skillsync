import { useEffect, useRef, useState } from "react";
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
import "./Resume.css";

export default function Resume() {
  const fileInputRef = useRef(null);
  const [resumeFile, setResumeFile] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState(null);

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

    const { data: fileUrl, error: uploadError } = await uploadResume(file, user.id);

    if (uploadError) {
      setMessage("Failed to upload resume. Please try again.");
      setLoading(false);
      return;
    }

    // Delete existing resume record before inserting new one
    await supabase.from("resumes").delete().eq("applicant_id", user.id);

    const newRecord = {
      applicant_id: user.id,
      file_url: fileUrl,
      file_name: file.name,
      file_size: file.size,
      extracted_skills: analysis.skills.join(","),
      resume_score: analysis.score,
      completeness: analysis.completeness,
      parsed_details: analysis.details
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
      skills: JSON.stringify(analysis.skills),
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

    // Run rule-based matching engine (existing)
    runMatchingForCandidate(user.id).catch(console.error);

    // ── Semantic AI Embedding Pipeline (non-blocking) ────────────────────
    // Runs in background — generates a 384-dim embedding from resume text,
    // stores it in resumes.resume_embedding, then runs semantic matching.
    ;(async () => {
      try {
        const resumeText = buildResumeTextForEmbedding(analysis, analysis.extractedText || '')
        const { embedding, error: embErr } = await generateAndStoreResumeEmbedding(user.id, resumeText)
        if (!embErr && embedding) {
          await runSemanticMatchingForCandidate(user.id, embedding)
          console.log('[Resume] Semantic AI matching complete.')
        } else {
          console.warn('[Resume] Embedding generation failed — semantic matching skipped.', embErr?.message)
        }
      } catch (aiErr) {
        console.warn('[Resume] AI pipeline error (non-critical):', aiErr.message)
      }
    })()
    // ── End AI Pipeline ──────────────────────────────────────────────────

    setMessage("Resume uploaded and parsed successfully.");
    setLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
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

            {/* Split Screen Metrics & Skills Editor */}
            <div className="resume-grid">
              {/* Left Panel: Quality Scoring and completeness */}
              <div className="resume-metrics-card">
                <h3>Resume Parsing Metrics</h3>
                
                <div className="resume-score-gauge">
                  <svg width="100" height="100" viewBox="0 0 80 80">
                    <defs>
                      <linearGradient id="score-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#58158f" />
                        <stop offset="100%" stopColor="#f13093" />
                      </linearGradient>
                    </defs>
                    <circle className="resume-score-circle-bg" cx="40" cy="40" r="32" />
                    <circle 
                      className="resume-score-circle-bar" 
                      cx="40" 
                      cy="40" 
                      r="32" 
                      strokeDasharray="200"
                      strokeDashoffset={strokeDashoffset}
                    />
                  </svg>
                  <div className="resume-score-number">
                    <span className="resume-score-val">{resumeFile.resume_score || 0}</span>
                    <span className="resume-score-label">Score</span>
                  </div>
                </div>

                <div className={`resume-score-rating ${scoreInfo?.class}`}>
                  {scoreInfo?.label}
                </div>

                <p style={{ fontSize: "13px", color: "#667085", margin: "4px 0 16px 0" }}>
                  This score rates formatting structures, clear section headers, contact points, and keyword density.
                </p>

                {/* Completeness gauge */}
                <div className="completeness-metric">
                  <div className="completeness-metric-label">
                    <span>Profile Integration Completeness</span>
                    <span>{resumeFile.completeness || 0}%</span>
                  </div>
                  <div className="completeness-metric-bar-bg">
                    <div 
                      className="completeness-metric-bar-fill" 
                      style={{ width: `${resumeFile.completeness || 0}%` }}
                    ></div>
                  </div>
                </div>

                {/* AI Extracted Key Info */}
                {resumeFile.parsed_details && (
                  <div style={{
                    marginTop: "20px",
                    padding: "18px 20px",
                    background: "linear-gradient(135deg, #fbf9ff, #f3e8ff)",
                    borderRadius: "14px",
                    border: "1px solid #e9d5ff"
                  }}>
                    <h4 style={{ margin: "0 0 14px 0", color: "#58158f", fontSize: "13px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      🤖 AI Extracted Key Info
                    </h4>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>

                      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                        <span style={{ fontSize: "16px", lineHeight: 1 }}>🎓</span>
                        <div>
                          <div style={{ fontSize: "11px", fontWeight: 700, color: "#8b5cf6", textTransform: "uppercase", letterSpacing: "0.05em" }}>Degree</div>
                          <div style={{ fontSize: "13px", color: "#1e1b4b", fontWeight: 600, marginTop: "2px" }}>
                            {resumeFile.parsed_details.degree
                              ? resumeFile.parsed_details.degree.length > 60
                                ? resumeFile.parsed_details.degree.slice(0, 60) + "…"
                                : resumeFile.parsed_details.degree
                              : <span style={{ color: "#94a3b8", fontStyle: "italic" }}>Not detected</span>}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                        <span style={{ fontSize: "16px", lineHeight: 1 }}>📚</span>
                        <div>
                          <div style={{ fontSize: "11px", fontWeight: 700, color: "#8b5cf6", textTransform: "uppercase", letterSpacing: "0.05em" }}>Course / Major</div>
                          <div style={{ fontSize: "13px", color: "#1e1b4b", fontWeight: 600, marginTop: "2px" }}>
                            {resumeFile.parsed_details.course
                              ? resumeFile.parsed_details.course
                              : <span style={{ color: "#94a3b8", fontStyle: "italic" }}>Not detected</span>}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                        <span style={{ fontSize: "16px", lineHeight: 1 }}>💼</span>
                        <div>
                          <div style={{ fontSize: "11px", fontWeight: 700, color: "#8b5cf6", textTransform: "uppercase", letterSpacing: "0.05em" }}>Experience</div>
                          <div style={{ fontSize: "13px", color: "#1e1b4b", fontWeight: 600, marginTop: "2px" }}>
                            {resumeFile.parsed_details.yearsOfExperience > 0
                              ? `${resumeFile.parsed_details.yearsOfExperience}+ years`
                              : resumeFile.parsed_details.hasExperienceSection
                                ? <span style={{ color: "#16a34a" }}>Experience section found ✓</span>
                                : <span style={{ color: "#94a3b8", fontStyle: "italic" }}>Not explicitly stated</span>}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                        <span style={{ fontSize: "16px", lineHeight: 1 }}>📧</span>
                        <div>
                          <div style={{ fontSize: "11px", fontWeight: 700, color: "#8b5cf6", textTransform: "uppercase", letterSpacing: "0.05em" }}>Contact Info</div>
                          <div style={{ fontSize: "13px", color: "#1e1b4b", fontWeight: 600, marginTop: "2px" }}>
                            {resumeFile.parsed_details.email || resumeFile.parsed_details.phone
                              ? <span style={{ color: "#16a34a" }}>
                                  {[resumeFile.parsed_details.email, resumeFile.parsed_details.phone].filter(Boolean).join(" · ")}
                                </span>
                              : resumeFile.parsed_details.hasContact
                                ? <span style={{ color: "#16a34a" }}>Contact info found ✓</span>
                                : <span style={{ color: "#f59e0b" }}>Not found — add to your resume</span>}
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>
                )}

              </div>

              {/* Right Panel: Skills List Editor */}
              <div className="extracted-skills-card">
                <div className="extracted-skills-header">
                  <h3>Auto-Detected Skill Tags</h3>
                  <span className="skills-count-badge">{extractedSkills.length} Detected</span>
                </div>

                <p style={{ fontSize: "13px", color: "#667085", marginBottom: "16px" }}>
                  Below are the skills parsed from your file. You can add or remove tags to improve matches.
                </p>

                {/* Add Custom Skill Tag */}
                <form className="skills-editor-input-row" onSubmit={handleAddSkillTag}>
                  <input
                    type="text"
                    value={newSkillInput}
                    onChange={(e) => setNewSkillInput(e.target.value)}
                    placeholder="Type skill name (e.g. React, Docker)"
                    className="skills-editor-input"
                    disabled={savingSkills}
                  />
                  <button type="submit" className="skills-editor-add-btn" disabled={savingSkills}>
                    Add Tag
                  </button>
                </form>

                {/* Display Tags */}
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
                  <p style={{ color: "#8b8f9c", fontStyle: "italic", textAlign: "center", padding: "16px 0" }}>
                    No skills extracted. Try adding tag keywords above!
                  </p>
                )}
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