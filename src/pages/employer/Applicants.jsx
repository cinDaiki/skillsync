import { useEffect, useState } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import ResumeViewerModal from "../../components/resume/ResumeViewerModal";
import AIMatchReport from "../../components/ai/AIMatchReport";
import { fetchEmployerApplicants } from "../../services/applicationService";
import { useToast } from "../../contexts/ToastContext";
import { useModal } from "../../contexts/ModalContext";
import { supabase } from "../../services/supabase";
import { cosineSimilarity, fetchResumeEmbeddings, fetchJobEmbedding } from "../../services/ai/vectorSearchService";
import { generateCandidateRecommendation, getMatchTier } from "../../services/ai/recommendationService";
import { calculateJobFit } from "../../services/ai/jobFitEngine";
import "./Applicants.css";

function formatUploadDate(dateString) {
  if (!dateString) return "";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getResumeFileName(resume) {
  return resume?.file_name || resume?.name || "Resume";
}

export default function Applicants() {
  const [applicants, setApplicants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedApplicant, setSelectedApplicant] = useState(null);
  
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterJob, setFilterJob] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterMatchTier, setFilterMatchTier] = useState("All");

  // Expandable sections state
  const [expandedNotes, setExpandedNotes] = useState({});
  const [expandedInterviews, setExpandedInterviews] = useState({});

  // Form states per application
  const [notesState, setNotesState] = useState({});
  const [interviewState, setInterviewState] = useState({});

  // AI Semantic scores: { applicantId → cosineSimilarity 0–100 }
  const [semanticScores, setSemanticScores] = useState({});
  const [aiReportApp,    setAiReportApp]    = useState(null);   // open AI Report modal
  const [sortByAI,       setSortByAI]       = useState(false);

  const toast = useToast();
  const { confirm } = useModal();

  useEffect(() => {
    loadApplicants();
  }, []);

  async function loadApplicants() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      setLoading(false);
      return;
    }

    const { data, error } = await fetchEmployerApplicants(user.id);
    if (error) {
      console.warn("Failed to load applicants:", error.message);
    }

    const list = data || [];
    setApplicants(list);

    // Seed notes and interview states
    const notes = {};
    const interviews = {};
    list.forEach(app => {
      notes[app.id] = app.recruiter_notes || "";
      
      const isched = app.interview_schedule || {};
      interviews[app.id] = {
        date: isched.date || "",
        time: isched.time || "",
        link: isched.link || "",
        notes: isched.notes || ""
      };
    });
    setNotesState(notes);
    setInterviewState(interviews);

    setLoading(false);

    // ── Load semantic scores (non-blocking) ─────────────────────────────
    loadSemanticScores(list).catch(console.warn);
  }

  // ── Semantic scoring ─────────────────────────────────────────────────────
  async function loadSemanticScores(list) {
    const jobGroups = {};
    list.forEach(app => {
      const jobId = app.job_id || app.jobs?.id;
      if (!jobId) return;
      if (!jobGroups[jobId]) jobGroups[jobId] = [];
      jobGroups[jobId].push(app);
    });

    const scores = {};

    for (const [jobId, apps] of Object.entries(jobGroups)) {
      const jobEmbedding = await fetchJobEmbedding(jobId);
      if (!jobEmbedding) continue;

      const applicantIds = apps.map(a => a.applicant_id).filter(Boolean);
      const resumeEmbeddings = await fetchResumeEmbeddings(applicantIds);

      apps.forEach(app => {
        const resumeEmb = resumeEmbeddings[app.applicant_id];
        if (resumeEmb) {
          scores[app.id] = Math.round(cosineSimilarity(resumeEmb, jobEmbedding) * 100);
        }
      });
    }

    setSemanticScores(scores);
  }

  function getSkillsList(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      return raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    }
    return [];
  }

  // Algorithm to calculate skill alignment using unified Job Fit engine
  function calculateAlignment(app) {
    const jobObj = app.jobs || {};
    const candObj = {
      skills: app.profiles?.skills,
      course: app.candidate_profiles?.course,
      degree: app.candidate_profiles?.degree,
      years_experience: app.candidate_profiles?.years_experience,
      certifications: app.candidate_profiles?.certifications
    };
    const semScore = semanticScores[app.id] ? semanticScores[app.id] / 100 : 0.70;
    const fitResult = calculateJobFit(candObj, jobObj, semScore);

    return {
      score: fitResult.jobFitScore,
      tier: fitResult.tier,
      matched: fitResult.matchedSkills,
      missing: fitResult.missingSkills,
      breakdown: fitResult.breakdown
    };
  }

  function getMatchTierLocal(score) {
    if (score >= 80) return "High";
    if (score >= 40) return "Medium";
    return "Basic";
  }

  async function handleStatusChange(appId, newStatus, appName) {
    if (["hired", "rejected", "shortlisted"].includes(newStatus)) {
      confirm({
        title: `Confirm Status Update`,
        message: `Are you sure you want to mark ${appName} as ${newStatus}?`,
        confirmText: "Update Status",
        isDestructive: newStatus === "rejected",
        onConfirm: () => executeUpdateStatus(appId, newStatus)
      });
    } else {
      executeUpdateStatus(appId, newStatus);
    }
  }

  async function executeUpdateStatus(appId, newStatus) {
    const { error } = await supabase.from("applications").update({ status: newStatus }).eq("id", appId);
    if (error) {
      toast.error("Failed to update status: " + error.message);
      return;
    }

    toast.success(`Status updated to ${newStatus}`);

    // Live state update
    setApplicants((prev) =>
      prev.map((a) => (a.id === appId ? { ...a, status: newStatus } : a))
    );
    if (selectedApplicant?.id === appId) {
      setSelectedApplicant((prev) => ({ ...prev, status: newStatus }));
    }

    // Trigger local notification to candidate when status changes
    const updatedApp = applicants.find(a => a.id === appId);
    if (updatedApp && updatedApp.applicant_id) {
      await supabase.from("notifications").insert([{
        user_id: updatedApp.applicant_id,
        title: "Application Status Update",
        message: `Your application status for "${updatedApp.jobs?.title}" has been updated to "${newStatus.replace("_", " ")}".`,
        type: "application_update",
        is_read: false
      }]);
    }
  }

  async function saveNotes(appId) {
    const noteText = notesState[appId] || "";
    const { error } = await supabase.from("applications").update({ recruiter_notes: noteText }).eq("id", appId);
    
    if (error) {
      toast.error("Failed to save notes");
    } else {
      toast.success("Notes saved successfully!");
    }
  }

  async function saveInterview(appId) {
    const details = interviewState[appId] || {};
    const { error } = await supabase.from("applications").update({ interview_schedule: details }).eq("id", appId);
    
    if (error) {
      toast.error("Failed to schedule interview");
    } else {
      toast.success("Interview scheduled successfully!");

      // Notify candidate
      const updatedApp = applicants.find(a => a.id === appId);
      if (updatedApp && updatedApp.applicant_id) {
        await supabase.from("notifications").insert([{
          user_id: updatedApp.applicant_id,
          title: "🗓️ Interview Invitation",
          message: `An interview has been scheduled for "${updatedApp.jobs?.title}" on ${details.date} at ${details.time}. Link: ${details.link || "Google Meet"}`,
          type: "interview",
          is_read: false
        }]);
      }
    }
  }

  function toggleNotes(appId) {
    setExpandedNotes(prev => ({ ...prev, [appId]: !prev[appId] }));
  }

  function toggleInterview(appId) {
    setExpandedInterviews(prev => ({ ...prev, [appId]: !prev[appId] }));
  }

  function openResumeViewer(app) {
    setSelectedApplicant(app);
  }

  function closeResumeViewer() {
    setSelectedApplicant(null);
  }

  // Get unique jobs for filter dropdown
  const uniqueJobs = ["All", ...new Set(applicants.map(app => app.jobs?.title).filter(Boolean))];

  // Filtering + Sorting Logic
  const filteredApplicants = applicants
    .filter(app => {
      const alignment = calculateAlignment(app);
      const tier = getMatchTierLocal(alignment.score);

      const name = (app.profiles?.full_name || app.displayName || "").toLowerCase();
      const email = (app.profiles?.email || app.displayEmail || "").toLowerCase();
      const skills = (app.profiles?.skills || "").toLowerCase();
      const query = searchQuery.toLowerCase();

      const matchesSearch = name.includes(query) || email.includes(query) || skills.includes(query);
      const matchesJob = filterJob === "All" || app.jobs?.title === filterJob;
      const matchesStatus = filterStatus === "All" || app.status === filterStatus.toLowerCase();
      const matchesTier = filterMatchTier === "All" || tier === filterMatchTier;

      return matchesSearch && matchesJob && matchesStatus && matchesTier;
    })
    .sort((a, b) => {
      if (sortByAI) {
        // Sort by semantic AI score (highest first), fallback to rule-based
        const aiA = semanticScores[a.id] ?? calculateAlignment(a).score;
        const aiB = semanticScores[b.id] ?? calculateAlignment(b).score;
        return aiB - aiA;
      }
      return 0; // Keep original order
    });

  return (
    <DashboardLayout
      role="employer"
      title="Applicants Desk"
      subtitle="Verify candidate skills alignment, parse score analytics, and progress hiring workflows."
    >
      <section className="dashboard-panel">
        <div className="panel-header">
          <div>
            <h2>Review Applications</h2>
            <p>Compare job criteria to parsed applicant resumes matching Indeed analytics.</p>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="applicants-controls">
          <input
            type="text"
            className="applicants-search-input"
            placeholder="🔍 Search applicant name, email, or skills…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />

          <select className="applicants-filter-select" value={filterJob} onChange={e => setFilterJob(e.target.value)}>
            <option value="All">All Job Posts</option>
            {uniqueJobs.filter(j => j !== "All").map(j => (
              <option key={j} value={j}>{j}</option>
            ))}
          </select>

          <select className="applicants-filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="All">All Statuses</option>
            <option value="Pending">Pending</option>
            <option value="Under Review">Under Review</option>
            <option value="Shortlisted">Shortlisted</option>
            <option value="Interview Scheduled">Interview Scheduled</option>
            <option value="Rejected">Rejected</option>
            <option value="Hired">Hired</option>
          </select>

          <select className="applicants-filter-select" value={filterMatchTier} onChange={e => setFilterMatchTier(e.target.value)}>
            <option value="All">All Match Tiers</option>
            <option value="High">High Matches (≥80%)</option>
            <option value="Medium">Medium Matches (40-79%)</option>
            <option value="Basic">Basic Matches (&lt;40%)</option>
          </select>

          {/* AI Sort Toggle */}
          <button
            type="button"
            onClick={() => setSortByAI(v => !v)}
            style={{
              padding: "8px 14px",
              background: sortByAI ? "linear-gradient(135deg,#7c3aed,#4c1d95)" : "#f8f5ff",
              color: sortByAI ? "#fff" : "#7c3aed",
              border: "1.5px solid #c4b5fd",
              borderRadius: "8px",
              fontWeight: 700,
              fontSize: "12px",
              cursor: "pointer",
              whiteSpace: "nowrap",
              fontFamily: "inherit",
              transition: "all 0.15s",
            }}
          >
            🤖 {sortByAI ? "AI Ranked ✓" : "Sort by AI"}
          </button>
        </div>

        {loading ? (
          <div className="empty-state">
            <h3>Retrieving applicants...</h3>
          </div>
        ) : filteredApplicants.length === 0 ? (
          <div className="empty-state">
            <span>👥</span>
            <h3>No applicants found</h3>
            <p>Try modifying your search queries or listing filters.</p>
          </div>
        ) : (
          <div className="applicants-list">
            {filteredApplicants.map((app, appIdx) => {
              const alignment = calculateAlignment(app);
              const tier = getMatchTierLocal(alignment.score);
              const aiScore = semanticScores[app.id];  // undefined if no embedding yet
              
              return (
                <article
                  className={`recruiter-applicant-card ${tier === "High" ? "high-match" : tier === "Medium" ? "med-match" : "low-match"}`}
                  key={app.id}
                >
                  <div className="rac-header">
                    <div className="rac-avatar">
                      {sortByAI && <span style={{ position:"absolute", top:-8, left:-8, background:"#7c3aed", color:"#fff", fontSize:"9px", fontWeight:900, padding:"2px 5px", borderRadius:"8px" }}>#{appIdx+1}</span>}
                      <span style={{position:"relative"}}>{app.avatarLetter || "A"}</span>
                    </div>
                    <div className="rac-identity">
                      <h3>{app.displayName || "Unnamed Applicant"}</h3>
                      <p>{app.displayEmail || "No Email"}</p>
                    </div>

                    <div className="rac-header-right">
                      {aiScore !== undefined && (
                        <span style={{
                          fontSize: "11px", fontWeight: 700, padding: "3px 9px",
                          background: "#f3e8ff", color: "#7c3aed",
                          borderRadius: "8px", marginRight: "6px",
                          border: "1px solid #e9d5ff",
                        }}>
                          🤖 {aiScore}% AI
                        </span>
                      )}
                      <span className={`rac-match-badge ${tier.toLowerCase()}`}>
                        🧠 {alignment.score}% Match
                      </span>
                    </div>
                  </div>

                  {/* Info Snapshot Grid */}
                  <div className="rac-info-grid">
                    <div className="rac-info-item">
                      <span>Applied For</span>
                      <strong>{app.jobs?.title || "No role"}</strong>
                    </div>
                    <div className="rac-info-item">
                      <span>Job Type</span>
                      <strong>{app.jobs?.employment_type || "Full-time"}</strong>
                    </div>
                    <div className="rac-info-item">
                      <span>Applied Date</span>
                      <strong>{formatUploadDate(app.created_at)}</strong>
                    </div>
                    <div className="rac-info-item">
                      <span>Resume Score</span>
                      <strong>{app.resume?.resume_score || "N/A"}</strong>
                    </div>
                  </div>

                  {/* Skills Alignment Widgets */}
                  <div className="rac-skills-section">
                    {alignment.matched.length > 0 && (
                      <div style={{ marginBottom: "8px" }}>
                        <div className="rac-skills-label">Matched Skills ({alignment.matched.length})</div>
                        <div className="rac-skills-row">
                          {alignment.matched.map(s => (
                            <span key={s} className="rac-skill-chip matched">{s}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {alignment.missing.length > 0 && (
                      <div>
                        <div className="rac-skills-label">Missing Skills ({alignment.missing.length})</div>
                        <div className="rac-skills-row">
                          {alignment.missing.map(s => (
                            <span key={s} className="rac-skill-chip missing">{s}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Workflow Stage */}
                  <div className="rac-stage-section">
                    <div className="rac-stage-label">Current Hiring Pipeline Stage</div>
                    <select
                      className="rac-stage-select"
                      value={app.status || "pending"}
                      onChange={(e) => handleStatusChange(app.id, e.target.value, app.displayName || "Applicant")}
                    >
                      <option value="pending">Pending</option>
                      <option value="under review">Under Review</option>
                      <option value="shortlisted">Shortlisted</option>
                      <option value="interview scheduled">Interview Scheduled</option>
                      <option value="rejected">Rejected</option>
                      <option value="hired">Hired</option>
                    </select>
                  </div>

                  {/* Accordion Actions */}
                  <div className="rac-expand-actions">
                    <button
                      type="button"
                      className="rac-expand-btn"
                      onClick={() => toggleNotes(app.id)}
                    >
                      📝 Recruiter Notes {expandedNotes[app.id] ? "▲" : "▼"}
                    </button>
                    <button
                      type="button"
                      className="rac-expand-btn"
                      onClick={() => toggleInterview(app.id)}
                      style={{ color: "#16803d" }}
                    >
                      🗓️ Schedule Interview {expandedInterviews[app.id] ? "▲" : "▼"}
                    </button>

                    {app.resume?.file_url ? (
                      <button
                        type="button"
                        className="rac-resume-btn"
                        onClick={() => openResumeViewer(app)}
                      >
                        📄 View PDF Resume
                      </button>
                    ) : (
                      <span className="job-meta-chip" style={{ fontSize: "11px" }}>No Resume Uploaded</span>
                    )}
                  </div>

                  {/* 1. Recruiter Notes Panel */}
                  {expandedNotes[app.id] && (
                    <div className="rac-notes-panel">
                      <h4>Recruiter Screening Notes</h4>
                      <textarea
                        className="rac-notes-textarea"
                        placeholder="Add screening evaluations, resume review findings, or specific follow-ups…"
                        value={notesState[app.id] || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNotesState(prev => ({ ...prev, [app.id]: val }));
                        }}
                      />
                      <button
                        type="button"
                        className="rac-notes-save-btn"
                        onClick={() => saveNotes(app.id)}
                      >
                        Save Evaluations
                      </button>
                    </div>
                  )}

                  {/* 2. Interview Scheduler Panel */}
                  {expandedInterviews[app.id] && (
                    <div className="rac-interview-panel">
                      <h4>Schedule Interview Session</h4>
                      <div className="rac-interview-grid">
                        <label className="rac-interview-label">
                          Interview Date
                          <input
                            type="date"
                            value={interviewState[app.id]?.date || ""}
                            onChange={(e) => {
                              const dateVal = e.target.value;
                              setInterviewState(prev => ({
                                ...prev,
                                [app.id]: { ...(prev[app.id] || {}), date: dateVal }
                              }));
                            }}
                          />
                        </label>
                        <label className="rac-interview-label">
                          Interview Time
                          <input
                            type="time"
                            value={interviewState[app.id]?.time || ""}
                            onChange={(e) => {
                              const timeVal = e.target.value;
                              setInterviewState(prev => ({
                                ...prev,
                                [app.id]: { ...(prev[app.id] || {}), time: timeVal }
                              }));
                            }}
                          />
                        </label>
                      </div>
                      <label className="rac-interview-label" style={{ marginBottom: "12px" }}>
                        Google Meet or Interview Link
                        <input
                          type="url"
                          placeholder="https://meet.google.com/abc-defg-hij"
                          value={interviewState[app.id]?.link || ""}
                          onChange={(e) => {
                            const linkVal = e.target.value;
                            setInterviewState(prev => ({
                              ...prev,
                              [app.id]: { ...(prev[app.id] || {}), link: linkVal }
                            }));
                          }}
                        />
                      </label>
                      <label className="rac-interview-label" style={{ marginBottom: "12px" }}>
                        Session Notes / Prep Instructions
                        <input
                          type="text"
                          placeholder="e.g. Technical live coding, dress professionally"
                          value={interviewState[app.id]?.notes || ""}
                          onChange={(e) => {
                            const noteVal = e.target.value;
                            setInterviewState(prev => ({
                              ...prev,
                              [app.id]: { ...(prev[app.id] || {}), notes: noteVal }
                            }));
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="rac-interview-save-btn"
                        onClick={() => saveInterview(app.id)}
                      >
                        Confirm & Invite Candidate
                      </button>
                    </div>
                  )}
                  {/* AI Report Button (shown when embedding available) */}
                  {semanticScores[app.id] !== undefined && (
                    <div style={{ padding: "0 16px 14px", display:"flex", justifyContent:"flex-end" }}>
                      <button
                        type="button"
                        onClick={() => setAiReportApp(app)}
                        style={{
                          padding: "7px 14px",
                          background: "linear-gradient(135deg,#7c3aed,#4c1d95)",
                          color: "#fff",
                          border: "none",
                          borderRadius: "8px",
                          fontWeight: 700,
                          fontSize: "12px",
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        🤖 View AI Report
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {selectedApplicant && (
        <ResumeViewerModal
          applicant={selectedApplicant}
          onClose={closeResumeViewer}
          onAccept={() => handleStatusChange(selectedApplicant.id, "hired", selectedApplicant.displayName || "Applicant")}
          onReject={() => handleStatusChange(selectedApplicant.id, "rejected", selectedApplicant.displayName || "Applicant")}
          onShortlist={() => handleStatusChange(selectedApplicant.id, "shortlisted", selectedApplicant.displayName || "Applicant")}
        />
      )}

      {/* AI Candidate Report Modal */}
      {aiReportApp && (() => {
        const alignment = calculateAlignment(aiReportApp);
        const aiScore = semanticScores[aiReportApp.id] ?? alignment.score;
        const rec = generateCandidateRecommendation(
          aiScore,
          alignment.matched,
          alignment.missing,
          aiReportApp.displayName || "This candidate"
        );
        return (
          <AIMatchReport
            job={aiReportApp.jobs}
            matchScore={aiScore}
            semanticScore={aiScore}
            matchedSkills={alignment.matched}
            missingSkills={alignment.missing}
            recommendation={rec}
            educationMatch={aiReportApp.profiles?.education_level || ""}
            experienceYrs={aiReportApp.profiles?.years_experience || 0}
            onClose={() => setAiReportApp(null)}
            mode="employer"
            candidateName={aiReportApp.displayName || "Candidate"}
          />
        );
      })()}
    </DashboardLayout>
  );
}
