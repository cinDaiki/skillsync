import { useEffect, useState } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import ResumeViewerModal from "../../components/resume/ResumeViewerModal";
import AIMatchReport from "../../components/ai/AIMatchReport";
import { fetchEmployerApplicants } from "../../services/applicationService";
import {
  sendInterviewInvitation,
  respondToInterview,
  rescheduleInterviewByEmployer,
  cancelInterview,
  completeInterview,
  saveInterviewEvaluation,
  makeHiringDecision,
  fetchInterviewsForEmployer,
  fetchUpcomingInterviews
} from "../../services/interviewService";
import { checkAndSendInterviewReminders } from "../../services/notificationService";
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

function getRelativeDateLabel(dateString) {
  if (!dateString) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateString);
  target.setHours(0, 0, 0, 0);
  
  const diffTime = target - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "📅 Past — Awaiting Completion";
  if (diffDays === 0) return "🔔 Today";
  if (diffDays === 1) return "📅 Tomorrow";
  if (diffDays > 1 && diffDays <= 7) return `📅 In ${diffDays} days`;
  return `📅 ${new Date(dateString).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

export default function Applicants() {
  const [applicants, setApplicants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedApplicant, setSelectedApplicant] = useState(null);
  
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterJob, setFilterJob] = useState("All");
  const [filterStatus, setFilterStatus] = useState("Active Pipeline");
  const [filterMatchTier, setFilterMatchTier] = useState("All");
  const [filterInterviewStatus, setFilterInterviewStatus] = useState("All");

  // Interview state: { [applicationId]: activeInterviewRecord }
  const [interviewsMap, setInterviewsMap] = useState({});
  const [upcomingInterviews, setUpcomingInterviews] = useState([]);
  const [showUpcomingList, setShowUpcomingList] = useState(true);
  const [highlightedAppId, setHighlightedAppId] = useState(null);

  // Location Modal for Walk-in interviews
  const [walkinModalInfo, setWalkinModalInfo] = useState(null);

  // Form states per application
  const [notesState, setNotesState] = useState({});
  const [expandedNotes, setExpandedNotes] = useState({});

  // Modals state
  const [inviteModalApp, setInviteModalApp] = useState(null);
  const [isRescheduling, setIsRescheduling] = useState(false);

  // Send Interview Form State
  const [invType, setInvType] = useState("ONLINE");
  const [invDate, setInvDate] = useState("");
  const [invTime, setInvTime] = useState("10:00 AM");
  const [invPlatform, setInvPlatform] = useState("Google Meet");
  const [invMeetingUrl, setInvMeetingUrl] = useState("");
  const [invAddress, setInvAddress] = useState("");
  const [invContactPerson, setInvContactPerson] = useState("");
  const [invInstructions, setInvInstructions] = useState("");
  const [submittingInvite, setSubmittingInvite] = useState(false);

  // Recruiter Evaluation Modal State
  const [evalModalApp, setEvalModalApp] = useState(null);
  const [evalNotes, setEvalNotes] = useState("");
  const [evalTechRating, setEvalTechRating] = useState(5);
  const [evalCommRating, setEvalCommRating] = useState(5);
  const [evalRecommendation, setEvalRecommendation] = useState("Hire");
  const [submittingEval, setSubmittingEval] = useState(false);

  // Final Hiring Decision Modal State
  const [decisionModalApp, setDecisionModalApp] = useState(null);
  const [decisionType, setDecisionType] = useState("HIRED");
  const [rejectionReason, setRejectionReason] = useState("");
  const [submittingDecision, setSubmittingDecision] = useState(false);

  // AI Semantic scores
  const [semanticScores, setSemanticScores] = useState({});
  const [aiReportApp, setAiReportApp] = useState(null);
  const [sortByAI, setSortByAI] = useState(false);

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

    // Check & trigger interview reminders in background
    checkAndSendInterviewReminders(user.id).catch(console.warn);

    const { data, error } = await fetchEmployerApplicants(user.id);
    if (error) {
      console.warn("Failed to load applicants:", error.message);
    }

    const list = data || [];
    setApplicants(list);

    // Seed notes
    const notes = {};
    list.forEach(app => {
      notes[app.id] = app.recruiter_notes || "";
    });
    setNotesState(notes);

    // Fetch interviews & upcoming reminders for employer
    await loadInterviews(user.id);

    setLoading(false);

    // Load semantic scores (non-blocking)
    loadSemanticScores(list).catch(console.warn);
  }

  async function loadInterviews(employerId) {
    const { data: interviewsData } = await fetchInterviewsForEmployer(employerId);
    const map = {};
    (interviewsData || []).forEach(inv => {
      if (!map[inv.application_id]) {
        map[inv.application_id] = inv;
      }
    });
    setInterviewsMap(map);

    const { data: upcoming } = await fetchUpcomingInterviews(employerId);
    setUpcomingInterviews(upcoming || []);
  }

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

  // Scroll to and highlight applicant card
  function scrollToApplicantCard(appId) {
    setHighlightedAppId(appId);
    const element = document.getElementById(`applicant-card-${appId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setTimeout(() => setHighlightedAppId(null), 3000);
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
    setApplicants((prev) =>
      prev.map((a) => (a.id === appId ? { ...a, status: newStatus } : a))
    );
  }

  async function saveNotes(appId) {
    const noteText = notesState[appId] || "";
    const { error } = await supabase.from("applications").update({ recruiter_notes: noteText }).eq("id", appId);
    
    if (error) {
      toast.error("Failed to save notes");
    } else {
      toast.success("Recruiter screening notes saved!");
    }
  }

  // ── Open Send Interview Invitation Modal ─────────────────────────
  function openInviteModal(app, rescheduling = false) {
    const existingInv = interviewsMap[app.id];
    setInviteModalApp(app);
    setIsRescheduling(rescheduling);

    if (existingInv && rescheduling) {
      setInvType(existingInv.interview_type || "ONLINE");
      setInvDate(existingInv.scheduled_date || "");
      setInvTime(existingInv.scheduled_time || "10:00 AM");
      setInvPlatform(existingInv.platform || "Google Meet");
      setInvMeetingUrl(existingInv.meeting_url || "");
      setInvAddress(existingInv.address || "");
      setInvContactPerson(existingInv.contact_person || "");
      setInvInstructions(existingInv.instructions || "");
    } else {
      setInvType("ONLINE");
      setInvDate("");
      setInvTime("10:00 AM");
      setInvPlatform("Google Meet");
      setInvMeetingUrl("");
      setInvAddress("");
      setInvContactPerson("");
      setInvInstructions("");
    }
  }

  function closeInviteModal() {
    setInviteModalApp(null);
    setIsRescheduling(false);
  }

  async function handleSendInterviewSubmit(e) {
    e.preventDefault();
    if (!inviteModalApp) return;

    setSubmittingInvite(true);
    const { data: { session } } = await supabase.auth.getSession();
    const employerId = session?.user?.id;

    if (!employerId) {
      toast.error("Authentication session expired.");
      setSubmittingInvite(false);
      return;
    }

    const existingInv = interviewsMap[inviteModalApp.id];

    let result;
    if (isRescheduling && existingInv) {
      result = await rescheduleInterviewByEmployer({
        interviewId: existingInv.id,
        employerId,
        newDate: invDate,
        newTime: invTime,
        platform: invPlatform,
        meetingUrl: invMeetingUrl,
        address: invAddress,
        contactPerson: invContactPerson,
        instructions: invInstructions,
      });
    } else {
      result = await sendInterviewInvitation({
        applicationId: inviteModalApp.id,
        employerId,
        candidateId: inviteModalApp.applicant_id,
        jobId: inviteModalApp.job_id || inviteModalApp.jobs?.id,
        interviewType: invType,
        scheduledDate: invDate,
        scheduledTime: invTime,
        platform: invPlatform,
        meetingUrl: invMeetingUrl,
        address: invAddress,
        contactPerson: invContactPerson,
        instructions: invInstructions,
      });
    }

    setSubmittingInvite(false);

    if (result.error) {
      toast.error(result.error.message || "Failed sending interview invitation.");
    } else {
      toast.success(isRescheduling ? "Revised interview proposed!" : "🟡 Interview invitation sent! Waiting for candidate confirmation.");
      closeInviteModal();
      await loadInterviews(employerId);
    }
  }

  async function handleCancelInterview(interviewId) {
    confirm({
      title: "Cancel Interview Session",
      message: "Are you sure you want to cancel this interview invitation?",
      confirmText: "Cancel Interview",
      isDestructive: true,
      onConfirm: async () => {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await cancelInterview({ interviewId, userId: session?.user?.id, reason: "Cancelled by employer" });
        if (res.error) {
          toast.error("Failed to cancel interview: " + res.error.message);
        } else {
          toast.success("Interview cancelled.");
          await loadInterviews(session?.user?.id);
        }
      }
    });
  }

  async function handleCompleteInterview(interviewId) {
    confirm({
      title: "Mark Interview as Completed",
      message: "Confirm that the interview session has occurred and is completed?",
      confirmText: "Mark Completed",
      onConfirm: async () => {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await completeInterview({ interviewId, employerId: session?.user?.id });
        if (res.error) {
          toast.error("Failed completing interview: " + res.error.message);
        } else {
          toast.success("Interview marked as completed! You can now record private recruiter evaluations.");
          await loadInterviews(session?.user?.id);
        }
      }
    });
  }

  function openEvalModal(app) {
    setEvalModalApp(app);
    setEvalNotes("");
    setEvalTechRating(5);
    setEvalCommRating(5);
    setEvalRecommendation("Hire");
  }

  function closeEvalModal() {
    setEvalModalApp(null);
  }

  async function handleSaveEvaluationSubmit(e) {
    e.preventDefault();
    if (!evalModalApp) return;

    setSubmittingEval(true);
    const { data: { session } } = await supabase.auth.getSession();
    const existingInv = interviewsMap[evalModalApp.id];

    if (!existingInv) {
      toast.error("No active interview record found.");
      setSubmittingEval(false);
      return;
    }

    const res = await saveInterviewEvaluation({
      interviewId: existingInv.id,
      employerId: session?.user?.id,
      notes: evalNotes,
      techRating: evalTechRating,
      commRating: evalCommRating,
      recommendation: evalRecommendation,
    });

    setSubmittingEval(false);

    if (res.error) {
      toast.error("Failed saving evaluation: " + res.error.message);
    } else {
      toast.success("🔒 Private recruiter evaluation saved successfully!");
      closeEvalModal();
    }
  }

  function openDecisionModal(app, type = "HIRED") {
    setDecisionModalApp(app);
    setDecisionType(type);
    setRejectionReason("");
  }

  function closeDecisionModal() {
    setDecisionModalApp(null);
  }

  async function handleDecisionSubmit(e) {
    e.preventDefault();
    if (!decisionModalApp) return;

    setSubmittingDecision(true);
    const { data: { session } } = await supabase.auth.getSession();

    const res = await makeHiringDecision({
      applicationId: decisionModalApp.id,
      employerId: session?.user?.id,
      candidateId: decisionModalApp.applicant_id,
      decision: decisionType,
      rejectionReason: decisionType === "REJECTED" ? rejectionReason : "",
    });

    setSubmittingDecision(false);

    if (res.error) {
      toast.error("Failed submitting decision: " + res.error.message);
    } else {
      toast.success(decisionType === "HIRED" ? "🎉 Candidate hired!" : "Application updated to Rejected.");
      closeDecisionModal();
      await loadApplicants();
    }
  }

  function toggleNotes(appId) {
    setExpandedNotes(prev => ({ ...prev, [appId]: !prev[appId] }));
  }

  function openResumeViewer(app) {
    setSelectedApplicant(app);
  }

  function closeResumeViewer() {
    setSelectedApplicant(null);
  }

  const uniqueJobs = ["All", ...new Set(applicants.map(app => app.jobs?.title).filter(Boolean))];

  const filteredApplicants = applicants
    .filter(app => {
      const alignment = calculateAlignment(app);
      const tier = getMatchTierLocal(alignment.score);
      const activeInv = interviewsMap[app.id] || (app.interview_schedule?.date ? { status: "CONFIRMED" } : null);
      const invStatus = activeInv ? activeInv.status : "NONE";

      const name = (app.profiles?.full_name || app.displayName || "").toLowerCase();
      const email = (app.profiles?.email || app.displayEmail || "").toLowerCase();
      const skills = (app.profiles?.skills || "").toLowerCase();
      const query = searchQuery.toLowerCase();

      const matchesSearch = !query || name.includes(query) || email.includes(query) || skills.includes(query);
      const matchesJob = filterJob === "All" || app.jobs?.title === filterJob;

      let matchesStatus = true;
      const appStatusLower = (app.status || "").toLowerCase();
      if (filterStatus === "Active Pipeline") {
        matchesStatus = !["hired", "rejected", "accepted", "withdrawn", "closed"].includes(appStatusLower);
      } else if (filterStatus === "Applied") {
        matchesStatus = appStatusLower === "applied" || appStatusLower === "pending";
      } else if (filterStatus === "Reviewing") {
        matchesStatus = appStatusLower === "reviewing" || appStatusLower === "under review";
      } else if (filterStatus === "Shortlisted") {
        matchesStatus = appStatusLower === "shortlisted";
      } else if (filterStatus === "Interview Stage") {
        matchesStatus = appStatusLower === "interview_scheduled" || appStatusLower === "interview_completed" || appStatusLower === "interview";
      } else if (filterStatus === "Hired") {
        matchesStatus = appStatusLower === "hired" || appStatusLower === "accepted";
      } else if (filterStatus === "Rejected") {
        matchesStatus = appStatusLower === "rejected";
      } else if (filterStatus !== "All") {
        matchesStatus = appStatusLower === filterStatus.toLowerCase();
      }

      const matchesTier = filterMatchTier === "All" || tier === filterMatchTier;

      let matchesInv = true;
      if (filterInterviewStatus !== "All") {
        if (filterInterviewStatus === "No Interview") matchesInv = invStatus === "NONE";
        else if (filterInterviewStatus === "Awaiting Confirmation") matchesInv = invStatus === "PENDING_CONFIRMATION";
        else if (filterInterviewStatus === "Confirmed") matchesInv = invStatus === "CONFIRMED";
        else if (filterInterviewStatus === "Reschedule Requested") matchesInv = invStatus === "RESCHEDULE_REQUESTED";
        else if (filterInterviewStatus === "Declined") matchesInv = invStatus === "DECLINED";
        else if (filterInterviewStatus === "Cancelled") matchesInv = invStatus === "CANCELLED";
        else if (filterInterviewStatus === "Completed") matchesInv = invStatus === "COMPLETED";
      }

      return matchesSearch && matchesJob && matchesStatus && matchesTier && matchesInv;
    })
    .sort((a, b) => {
      if (sortByAI) {
        const aiA = semanticScores[a.id] ?? calculateAlignment(a).score;
        const aiB = semanticScores[b.id] ?? calculateAlignment(b).score;
        return aiB - aiA;
      }
      return 0;
    });

  const todayCount = upcomingInterviews.filter(inv => {
    const todayStr = new Date().toISOString().split("T")[0];
    return inv.scheduled_date === todayStr;
  }).length;

  return (
    <DashboardLayout
      role="employer"
      title="Applicants Desk"
      subtitle="Verify candidate skills alignment, manage interview invitations, and progress hiring decisions."
    >
      <section className="dashboard-panel">
        <div className="panel-header">
          <div>
            <h2>Review Applications & Interview Pipelines</h2>
            <p>Compare criteria, invite candidates to Online or Walk-in interviews, and record evaluation notes.</p>
          </div>
          <div className="emp-interview-indicators">
            <span className="emp-indicator-chip">
              📅 Upcoming Interviews: <strong>{upcomingInterviews.length}</strong>
            </span>
            {todayCount > 0 && (
              <span className="emp-indicator-chip today">
                🔔 <strong>{todayCount} Interview Today</strong>
              </span>
            )}
          </div>
        </div>

        {/* ── 2. ACTIONABLE UPCOMING INTERVIEWS REMINDER CARD ────────────── */}
        {upcomingInterviews.length > 0 && (
          <div className="upcoming-interviews-banner">
            <div className="banner-header" onClick={() => setShowUpcomingList(v => !v)}>
              <div>
                <h3>📅 Upcoming Interviews Reminder ({upcomingInterviews.length})</h3>
                <p>Confirmed & pending sessions requiring your attendance</p>
              </div>
              <button type="button" className="banner-toggle-btn">
                {showUpcomingList ? "Hide Reminders ▲" : "Show Reminders ▼"}
              </button>
            </div>

            {showUpcomingList && (
              <div className="upcoming-cards-grid">
                {upcomingInterviews.map((inv) => {
                  const relLabel = getRelativeDateLabel(inv.scheduled_date);
                  const isOnline = inv.interview_type === "ONLINE";

                  return (
                    <article className={`upcoming-card ${isOnline ? "online" : "walkin"}`} key={inv.id}>
                      <div className="upcoming-card-top">
                        <span className="upcoming-date-badge">{relLabel}</span>
                        <span className={`upcoming-status-tag ${inv.status.toLowerCase()}`}>
                          {inv.status === "CONFIRMED" ? "🟢 CONFIRMED" : "🟡 PENDING"}
                        </span>
                      </div>

                      <h4 className="upcoming-candidate-name">
                        {inv.profiles?.full_name || "Candidate"}
                      </h4>
                      <p className="upcoming-job-title">{inv.jobs?.title || "Job Position"}</p>

                      <div className="upcoming-time-row">
                        <span>🕒 {inv.scheduled_time}</span>
                        <span>{isOnline ? `🌐 Online — ${inv.platform || "Google Meet"}` : "🏢 Walk-in"}</span>
                      </div>

                      {isOnline ? (
                        <div className="upcoming-details-box">
                          <span className="box-label">Meeting URL:</span>
                          <a href={inv.meeting_url} target="_blank" rel="noreferrer" className="upcoming-link">
                            {inv.meeting_url || "Link pending"}
                          </a>
                        </div>
                      ) : (
                        <div className="upcoming-details-box">
                          <span className="box-label">📍 Location: {inv.address}</span>
                          <span className="box-sub">👤 Contact: {inv.contact_person}</span>
                        </div>
                      )}

                      <div className="upcoming-actions-row">
                        <button
                          type="button"
                          className="upcoming-action-btn view-app"
                          onClick={() => scrollToApplicantCard(inv.application_id)}
                        >
                          👤 View Applicant
                        </button>

                        <button
                          type="button"
                          className="upcoming-action-btn complete-btn"
                          style={{ background: "#166534", color: "#fff", border: "none" }}
                          onClick={() => handleCompleteInterview(inv.id)}
                        >
                          ✓ Mark Completed
                        </button>

                        {isOnline && inv.meeting_url && (
                          <a href={inv.meeting_url} target="_blank" rel="noreferrer" className="upcoming-join-btn">
                            🌐 Join Interview
                          </a>
                        )}

                        {!isOnline && (
                          <button
                            type="button"
                            className="upcoming-action-btn view-loc"
                            onClick={() => setWalkinModalInfo(inv)}
                          >
                            📍 View Location
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* QUICK TABS & MAIN SEARCH TOOLBAR */}
        <div className="applicants-tab-toolbar">
          <div className="applicants-quick-tabs">
            <button
              type="button"
              className={`app-tab-btn ${filterStatus === "Active Pipeline" ? "active" : ""}`}
              onClick={() => setFilterStatus("Active Pipeline")}
            >
              ⚡ Active Pipeline ({applicants.filter(a => !["hired", "rejected", "accepted", "withdrawn", "closed"].includes((a.status || "").toLowerCase())).length})
            </button>
            <button
              type="button"
              className={`app-tab-btn ${filterStatus === "Archive" ? "active" : ""}`}
              onClick={() => setFilterStatus("Archive")}
            >
              📁 Applicant Archive ({applicants.filter(a => ["hired", "rejected", "accepted", "withdrawn", "closed"].includes((a.status || "").toLowerCase())).length})
            </button>
            <button
              type="button"
              className={`app-tab-btn ${filterStatus === "Hired" ? "active" : ""}`}
              onClick={() => setFilterStatus("Hired")}
            >
              🎉 Hired ({applicants.filter(a => ["hired", "accepted"].includes((a.status || "").toLowerCase())).length})
            </button>
            <button
              type="button"
              className={`app-tab-btn ${filterStatus === "Rejected" ? "active" : ""}`}
              onClick={() => setFilterStatus("Rejected")}
            >
              ❌ Rejected ({applicants.filter(a => (a.status || "").toLowerCase() === "rejected").length})
            </button>
            <button
              type="button"
              className={`app-tab-btn ${filterStatus === "All" ? "active" : ""}`}
              onClick={() => setFilterStatus("All")}
            >
              🌐 All ({applicants.length})
            </button>
          </div>

          <div className="applicants-search-row">
            <input
              type="text"
              className="applicants-search-input"
              placeholder="🔍 Search applicant name, email, or skills…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />

            <button
              type="button"
              className={`applicants-advanced-toggle-btn ${showAdvancedFilters ? "active" : ""}`}
              onClick={() => setShowAdvancedFilters(v => !v)}
            >
              ⚙️ {showAdvancedFilters ? "Hide Filters" : "Advanced Filters"}
            </button>

            <button
              type="button"
              className={`applicants-ai-sort-btn ${sortByAI ? "active" : ""}`}
              onClick={() => setSortByAI(v => !v)}
            >
              🤖 {sortByAI ? "AI Ranked ✓" : "Sort by AI"}
            </button>
          </div>
        </div>

        {/* EXPANDABLE ADVANCED FILTERS PANEL */}
        {showAdvancedFilters && (
          <div className="applicants-advanced-panel">
            <select className="applicants-filter-select" value={filterJob} onChange={e => setFilterJob(e.target.value)}>
              <option value="All">All Job Posts</option>
              {uniqueJobs.filter(j => j !== "All").map(j => (
                <option key={j} value={j}>{j}</option>
              ))}
            </select>

            <select className="applicants-filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="Active Pipeline">⚡ Active Pipeline</option>
              <option value="Archive">📁 Applicant Archive</option>
              <option value="All">All Pipeline Stages</option>
              <option value="Applied">Applied / Pending</option>
              <option value="Reviewing">Under Review</option>
              <option value="Shortlisted">Shortlisted</option>
              <option value="Interview Stage">Interview Stage</option>
              <option value="Hired">🎉 Hired</option>
              <option value="Rejected">Rejected</option>
            </select>

            <select className="applicants-filter-select" value={filterInterviewStatus} onChange={e => setFilterInterviewStatus(e.target.value)}>
              <option value="All">All Interview Statuses</option>
              <option value="No Interview">No Interview Scheduled</option>
              <option value="Awaiting Confirmation">🟡 Awaiting Confirmation</option>
              <option value="Confirmed">🟢 Confirmed</option>
              <option value="Reschedule Requested">🔄 Reschedule Requested</option>
              <option value="Declined">🔴 Candidate Declined</option>
              <option value="Cancelled">⚫ Cancelled</option>
              <option value="Completed">✓ Completed</option>
            </select>

            <select className="applicants-filter-select" value={filterMatchTier} onChange={e => setFilterMatchTier(e.target.value)}>
              <option value="All">All Match Tiers</option>
              <option value="High">High Matches (≥80%)</option>
              <option value="Medium">Medium Matches (40-79%)</option>
              <option value="Basic">Basic Matches (&lt;40%)</option>
            </select>
          </div>
        )}

        {/* ACTIVE FILTER CHIPS */}
        {(filterJob !== "All" || filterMatchTier !== "All" || filterInterviewStatus !== "All" || searchQuery || filterStatus !== "Active Pipeline") && (
          <div className="applicants-chips-row">
            <span className="chip-label">Active Filters:</span>
            {filterStatus !== "Active Pipeline" && (
              <span className="filter-chip">
                View: {filterStatus}
                <button type="button" onClick={() => setFilterStatus("Active Pipeline")}>✕</button>
              </span>
            )}
            {filterJob !== "All" && (
              <span className="filter-chip">
                Job: {filterJob}
                <button type="button" onClick={() => setFilterJob("All")}>✕</button>
              </span>
            )}
            {filterMatchTier !== "All" && (
              <span className="filter-chip">
                Match: {filterMatchTier}
                <button type="button" onClick={() => setFilterMatchTier("All")}>✕</button>
              </span>
            )}
            {filterInterviewStatus !== "All" && (
              <span className="filter-chip">
                Interview: {filterInterviewStatus}
                <button type="button" onClick={() => setFilterInterviewStatus("All")}>✕</button>
              </span>
            )}
            {searchQuery && (
              <span className="filter-chip">
                Query: "{searchQuery}"
                <button type="button" onClick={() => setSearchQuery("")}>✕</button>
              </span>
            )}
            <button
              type="button"
              className="clear-all-chips-btn"
              onClick={() => {
                setSearchQuery("");
                setFilterJob("All");
                setFilterStatus("Active Pipeline");
                setFilterInterviewStatus("All");
                setFilterMatchTier("All");
              }}
            >
              Clear All Filters
            </button>
          </div>
        )}

        {/* APPLICANTS LIST */}
        {loading ? (
          <div className="empty-state">
            <h3>Retrieving applicants...</h3>
          </div>
        ) : applicants.length === 0 ? (
          <div className="empty-state">
            <span>👥</span>
            <h3>No applicants yet</h3>
            <p>Share your job posts to attract candidates and start receiving applications.</p>
          </div>
        ) : filteredApplicants.length === 0 ? (
          <div className="empty-state">
            <span>🔍</span>
            <h3>No applicants match the selected filters</h3>
            <p>Try clearing active search queries or adjusting your pipeline filters.</p>
            <button
              type="button"
              style={{
                marginTop: "12px",
                padding: "8px 16px",
                borderRadius: "8px",
                background: "#4f46e5",
                color: "#fff",
                border: "none",
                fontWeight: "700",
                cursor: "pointer"
              }}
              onClick={() => {
                setSearchQuery("");
                setFilterJob("All");
                setFilterStatus("Active Pipeline");
                setFilterInterviewStatus("All");
                setFilterMatchTier("All");
              }}
            >
              🔄 Clear All Filters
            </button>
          </div>
        ) : (
          <div className="applicants-list">
            {filteredApplicants.map((app, appIdx) => {
              const alignment = calculateAlignment(app);
              const tier = getMatchTierLocal(alignment.score);
              const aiScore = semanticScores[app.id];
              const activeInv = interviewsMap[app.id] || (app.interview_schedule?.date ? {
                id: `legacy-${app.id}`,
                status: "CONFIRMED",
                interview_type: app.interview_schedule?.type || "ONLINE",
                scheduled_date: app.interview_schedule?.date,
                scheduled_time: app.interview_schedule?.time,
                platform: app.interview_schedule?.platform || "Google Meet",
                meeting_url: app.interview_schedule?.link,
                instructions: app.interview_schedule?.notes,
                is_legacy: true
              } : null);

              const invStatus = activeInv ? activeInv.status : "NONE";
              const isHighlighted = highlightedAppId === app.id;

              return (
                <article
                  id={`applicant-card-${app.id}`}
                  className={`recruiter-applicant-card ${tier === "High" ? "high-match" : tier === "Medium" ? "med-match" : "low-match"} ${isHighlighted ? "highlighted-card" : ""}`}
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
                        <span className="rac-ai-score-pill">
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

                  {/* Hiring Pipeline Stage */}
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
                      <option value="interview">Interview Stage</option>
                      <option value="rejected">Rejected</option>
                      <option value="hired">Hired</option>
                    </select>
                  </div>

                  {/* INTERVIEW STATUS CARD */}
                  <div className="rac-interview-card-container">
                    <div className="rac-interview-card-header">
                      <span className="card-title-text">🗓️ Interview Management</span>

                      {/* Status Badges */}
                      {invStatus === "NONE" && (
                        <span className="inv-badge none">⚪ No Interview Scheduled</span>
                      )}
                      {invStatus === "PENDING_CONFIRMATION" && (
                        <span className="inv-badge pending">🟡 Awaiting Candidate Confirmation</span>
                      )}
                      {invStatus === "CONFIRMED" && (
                        <span className="inv-badge confirmed">🟢 Interview Confirmed</span>
                      )}
                      {invStatus === "RESCHEDULE_REQUESTED" && (
                        <span className="inv-badge reschedule">🔄 Candidate Requested Reschedule</span>
                      )}
                      {invStatus === "DECLINED" && (
                        <span className="inv-badge declined">🔴 Candidate Declined</span>
                      )}
                      {invStatus === "CANCELLED" && (
                        <span className="inv-badge cancelled">⚫ Interview Cancelled</span>
                      )}
                      {invStatus === "COMPLETED" && (
                        <span className="inv-badge completed">✓ Interview Completed</span>
                      )}
                    </div>

                    {/* Active Interview Content */}
                    {activeInv ? (
                      <div className="rac-interview-details-panel">
                        <div className="inv-details-grid">
                          <div>
                            <span>Schedule:</span>
                            <strong>{activeInv.scheduled_date} at {activeInv.scheduled_time}</strong>
                          </div>
                          <div>
                            <span>Mode:</span>
                            <strong>{activeInv.interview_type === "ONLINE" ? `💻 Online (${activeInv.platform || "Google Meet"})` : `🏢 Walk-in`}</strong>
                          </div>
                        </div>

                        {activeInv.interview_type === "ONLINE" && activeInv.meeting_url && (
                          <div className="inv-link-row">
                            <span>Meeting Link:</span>
                            <a href={activeInv.meeting_url} target="_blank" rel="noreferrer">
                              {activeInv.meeting_url}
                            </a>
                          </div>
                        )}

                        {activeInv.interview_type === "WALK_IN" && (
                          <div className="inv-link-row">
                            <span>Address & Contact:</span>
                            <strong>📍 {activeInv.address} (👤 {activeInv.contact_person})</strong>
                          </div>
                        )}

                        {activeInv.instructions && (
                          <p className="inv-instructions-note">
                            📝 <em>Instructions: {activeInv.instructions}</em>
                          </p>
                        )}

                        {/* Candidate Reschedule Details */}
                        {invStatus === "RESCHEDULE_REQUESTED" && (
                          <div className="inv-reschedule-box">
                            <h5>🔄 Candidate Reschedule Request</h5>
                            <p><strong>Preferred Date:</strong> {activeInv.preferred_date || "Flexible"}</p>
                            <p><strong>Preferred Time:</strong> {activeInv.preferred_time_range || "Flexible"}</p>
                            {activeInv.candidate_message && <p><strong>Candidate Note:</strong> "{activeInv.candidate_message}"</p>}
                          </div>
                        )}

                        {/* Candidate Decline Reason */}
                        {invStatus === "DECLINED" && (
                          <div className="inv-declined-box">
                            <h5>🔴 Candidate Decline Response</h5>
                            <p>"{activeInv.candidate_message || "No reason specified."}"</p>
                          </div>
                        )}

                        {/* Actions Toolbar */}
                        <div className="inv-actions-toolbar">
                          {invStatus === "PENDING_CONFIRMATION" && (
                            <button
                              type="button"
                              className="inv-action-btn cancel"
                              onClick={() => handleCancelInterview(activeInv.id)}
                            >
                              Cancel Invitation
                            </button>
                          )}

                          {invStatus === "CONFIRMED" && (
                            <>
                              <button
                                type="button"
                                className="inv-action-btn complete"
                                onClick={() => handleCompleteInterview(activeInv.id)}
                              >
                                ✓ Mark Interview Completed
                              </button>
                              <button
                                type="button"
                                className="inv-action-btn reschedule"
                                onClick={() => openInviteModal(app, true)}
                              >
                                🔄 Reschedule
                              </button>
                              <button
                                type="button"
                                className="inv-action-btn cancel"
                                onClick={() => handleCancelInterview(activeInv.id)}
                              >
                                Cancel Interview
                              </button>
                            </>
                          )}

                          {invStatus === "RESCHEDULE_REQUESTED" && (
                            <button
                              type="button"
                              className="inv-action-btn invite"
                              onClick={() => openInviteModal(app, true)}
                            >
                              Propose Revised Schedule
                            </button>
                          )}

                          {(invStatus === "DECLINED" || invStatus === "CANCELLED") && (
                            <button
                              type="button"
                              className="inv-action-btn invite"
                              onClick={() => openInviteModal(app, false)}
                            >
                              Propose New Interview
                            </button>
                          )}

                          {invStatus === "COMPLETED" && (
                            <div className="inv-completed-actions-row">
                              <button
                                type="button"
                                className="inv-action-btn eval"
                                onClick={() => openEvalModal(app)}
                              >
                                📝 Recruiter Evaluation
                              </button>
                              <button
                                type="button"
                                className="inv-action-btn decision-hire"
                                onClick={() => openDecisionModal(app, "HIRED")}
                              >
                                🎉 Hire Candidate
                              </button>
                              <button
                                type="button"
                                className="inv-action-btn decision-reject"
                                onClick={() => openDecisionModal(app, "REJECTED")}
                              >
                                ❌ Reject Candidate
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="rac-no-interview-box">
                        <p>No interview proposed for this applicant yet.</p>
                        <button
                          type="button"
                          className="inv-action-btn invite-main"
                          onClick={() => openInviteModal(app, false)}
                        >
                          🗓️ Send Interview Invitation
                        </button>
                      </div>
                    )}
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

                    {semanticScores[app.id] !== undefined && (
                      <button
                        type="button"
                        className="rac-ai-report-btn"
                        onClick={() => setAiReportApp(app)}
                      >
                        🤖 View AI Match Report
                      </button>
                    )}
                  </div>

                  {/* Recruiter Notes Panel */}
                  {expandedNotes[app.id] && (
                    <div className="rac-notes-panel">
                      <h4>Recruiter Screening Notes</h4>
                      <textarea
                        className="rac-notes-textarea"
                        placeholder="Add screening evaluations, resume review findings, or internal follow-ups…"
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
                        Save Notes
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* WALK-IN LOCATION MODAL */}
      {walkinModalInfo && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>📍 Walk-in Interview Location</h3>
              <button type="button" className="modal-close-btn" onClick={() => setWalkinModalInfo(null)}>×</button>
            </div>
            <div className="modal-body-form">
              <p><strong>Candidate:</strong> {walkinModalInfo.profiles?.full_name}</p>
              <p><strong>Position:</strong> {walkinModalInfo.jobs?.title}</p>
              <p><strong>Date & Time:</strong> {walkinModalInfo.scheduled_date} at {walkinModalInfo.scheduled_time}</p>
              <div className="form-group">
                <label>Office Address</label>
                <div className="upcoming-details-box" style={{ fontSize: "14px", fontWeight: "700" }}>
                  📍 {walkinModalInfo.address}
                </div>
              </div>
              <div className="form-group">
                <label>Contact Person & Phone</label>
                <div className="upcoming-details-box" style={{ fontSize: "14px", fontWeight: "700" }}>
                  👤 {walkinModalInfo.contact_person}
                </div>
              </div>
              <div className="modal-footer-actions">
                <button type="button" className="btn-primary" onClick={() => setWalkinModalInfo(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SEND INTERVIEW INVITATION MODAL */}
      {inviteModalApp && (
        <div className="modal-backdrop">
          <div className="modal-dialog interview-invite-modal">
            <div className="modal-header">
              <h3>{isRescheduling ? "🔄 Propose Revised Interview Schedule" : "🗓️ Send Interview Invitation"}</h3>
              <button type="button" className="modal-close-btn" onClick={closeInviteModal}>×</button>
            </div>
            <form onSubmit={handleSendInterviewSubmit} className="modal-body-form">
              <div className="modal-applicant-summary">
                <strong>Applicant: {inviteModalApp.displayName}</strong>
                <span>Role: {inviteModalApp.jobs?.title || "Job Position"}</span>
              </div>

              {/* Interview Mode Selector */}
              <div className="form-group">
                <label className="form-label-title">Interview Mode</label>
                <div className="inv-mode-selector">
                  <button
                    type="button"
                    className={`mode-btn ${invType === "ONLINE" ? "selected" : ""}`}
                    onClick={() => setInvType("ONLINE")}
                  >
                    💻 Online Interview
                  </button>
                  <button
                    type="button"
                    className={`mode-btn ${invType === "WALK_IN" ? "selected" : ""}`}
                    onClick={() => setInvType("WALK_IN")}
                  >
                    🏢 Walk-in Interview
                  </button>
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label>Scheduled Date *</label>
                  <input
                    type="date"
                    required
                    value={invDate}
                    onChange={e => setInvDate(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Scheduled Time *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 10:00 AM"
                    value={invTime}
                    onChange={e => setInvTime(e.target.value)}
                  />
                </div>
              </div>

              {invType === "ONLINE" ? (
                <>
                  <div className="form-group">
                    <label>Platform *</label>
                    <select value={invPlatform} onChange={e => setInvPlatform(e.target.value)}>
                      <option value="Google Meet">Google Meet</option>
                      <option value="Zoom">Zoom</option>
                      <option value="Microsoft Teams">Microsoft Teams</option>
                      <option value="Other">Other / Custom Link</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Meeting URL / Link *</label>
                    <input
                      type="url"
                      required
                      placeholder="https://meet.google.com/abc-defg-hij"
                      value={invMeetingUrl}
                      onChange={e => setInvMeetingUrl(e.target.value)}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="form-group">
                    <label>Office / Walk-in Address *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 123 Tech Tower, Ayala Avenue, Makati City"
                      value={invAddress}
                      onChange={e => setInvAddress(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Contact Person & Number *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Juan Dela Cruz (0917-123-4567)"
                      value={invContactPerson}
                      onChange={e => setInvContactPerson(e.target.value)}
                    />
                  </div>
                </>
              )}

              <div className="form-group">
                <label>Prep Instructions / Session Notes (Optional)</label>
                <textarea
                  rows="3"
                  placeholder="e.g. Bring valid ID, printed resume, and portfolio demo..."
                  value={invInstructions}
                  onChange={e => setInvInstructions(e.target.value)}
                />
              </div>

              <div className="modal-footer-actions">
                <button type="button" className="btn-secondary" onClick={closeInviteModal}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={submittingInvite}>
                  {submittingInvite ? "Sending Proposal..." : "Send Invitation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RECRUITER EVALUATION MODAL */}
      {evalModalApp && (
        <div className="modal-backdrop">
          <div className="modal-dialog eval-modal">
            <div className="modal-header">
              <h3>📝 Private Recruiter Evaluation</h3>
              <button type="button" className="modal-close-btn" onClick={closeEvalModal}>×</button>
            </div>
            <form onSubmit={handleSaveEvaluationSubmit} className="modal-body-form">
              <p className="eval-privacy-notice">
                🔒 <strong>Strictly Private:</strong> Evaluation scores and notes are internal recruiter records and are NEVER shown to candidates.
              </p>

              <div className="form-group">
                <label>Technical Skill Rating (1–5 Stars)</label>
                <div className="star-rating-selector">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      type="button"
                      key={star}
                      className={`star-btn ${star <= evalTechRating ? "filled" : ""}`}
                      onClick={() => setEvalTechRating(star)}
                    >
                      ★
                    </button>
                  ))}
                  <span className="rating-label">{evalTechRating} / 5</span>
                </div>
              </div>

              <div className="form-group">
                <label>Communication & Culture Fit Rating (1–5 Stars)</label>
                <div className="star-rating-selector">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      type="button"
                      key={star}
                      className={`star-btn ${star <= evalCommRating ? "filled" : ""}`}
                      onClick={() => setEvalCommRating(star)}
                    >
                      ★
                    </button>
                  ))}
                  <span className="rating-label">{evalCommRating} / 5</span>
                </div>
              </div>

              <div className="form-group">
                <label>Overall Recommendation</label>
                <select value={evalRecommendation} onChange={e => setEvalRecommendation(e.target.value)}>
                  <option value="Strong Hire">Strong Hire</option>
                  <option value="Hire">Hire</option>
                  <option value="Consider">Keep Under Consideration</option>
                  <option value="No Hire">Do Not Hire / Reject</option>
                </select>
              </div>

              <div className="form-group">
                <label>Private Recruiter Screening Notes</label>
                <textarea
                  rows="4"
                  placeholder="Record interview observations, live coding results, soft skills feedback..."
                  value={evalNotes}
                  onChange={e => setEvalNotes(e.target.value)}
                />
              </div>

              <div className="modal-footer-actions">
                <button type="button" className="btn-secondary" onClick={closeEvalModal}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={submittingEval}>
                  {submittingEval ? "Saving..." : "Save Private Evaluation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FINAL HIRING DECISION MODAL */}
      {decisionModalApp && (
        <div className="modal-backdrop">
          <div className="modal-dialog decision-modal">
            <div className="modal-header">
              <h3>{decisionType === "HIRED" ? "🎉 Confirm Hiring Decision" : "❌ Confirm Rejection Update"}</h3>
              <button type="button" className="modal-close-btn" onClick={closeDecisionModal}>×</button>
            </div>
            <form onSubmit={handleDecisionSubmit} className="modal-body-form">
              <p className="decision-notice">
                Candidate: <strong>{decisionModalApp.displayName}</strong><br />
                Position: <strong>{decisionModalApp.jobs?.title}</strong>
              </p>

              {decisionType === "REJECTED" && (
                <div className="form-group">
                  <label>Professional Rejection Note (Optional)</label>
                  <textarea
                    rows="3"
                    placeholder="Add feedback reason (e.g., Position filled, missing specialized framework experience)..."
                    value={rejectionReason}
                    onChange={e => setRejectionReason(e.target.value)}
                  />
                </div>
              )}

              <p className="decision-warning">
                {decisionType === "HIRED"
                  ? "Marking as Hired will notify the candidate and update the application stage to Hired."
                  : "Marking as Rejected will notify the candidate with a professional update notice."}
              </p>

              <div className="modal-footer-actions">
                <button type="button" className="btn-secondary" onClick={closeDecisionModal}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className={decisionType === "HIRED" ? "btn-primary hire" : "btn-primary reject"}
                  disabled={submittingDecision}
                >
                  {submittingDecision ? "Updating..." : decisionType === "HIRED" ? "Confirm Hired Status" : "Confirm Rejection"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
