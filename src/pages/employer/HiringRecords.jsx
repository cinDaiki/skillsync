import { useState, useEffect } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { supabase } from "../../services/supabase";
import { fetchEmployerApplicants } from "../../services/applicationService";
import { fetchInterviewsForEmployer } from "../../services/interviewService";
import {
  isTerminalApplication,
  isHired,
  isRejected,
  deduplicateByApplicationId
} from "../../services/recruitmentStatus";
import ResumeViewerModal from "../../components/resume/ResumeViewerModal";
import "./HiringRecords.css";

function formatDate(dateStr) {
  if (!dateStr) return "Timestamp unavailable";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "Timestamp unavailable";
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  } catch {
    return "Timestamp unavailable";
  }
}

function formatDateTime(dateStr) {
  if (!dateStr) return "Timestamp unavailable";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "Timestamp unavailable";
    return d.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "Timestamp unavailable";
  }
}

function renderListOrText(data) {
  if (!data) return "Not provided";
  if (Array.isArray(data)) {
    if (data.length === 0) return "Not provided";
    return (
      <ul className="hr-details-sublist">
        {data.map((item, i) => (
          <li key={i}>
            {typeof item === "object"
              ? item.degree || item.school || item.title || item.company || item.role || item.name || JSON.stringify(item)
              : String(item)}
          </li>
        ))}
      </ul>
    );
  }
  if (typeof data === "object") {
    const vals = Object.values(data).filter(Boolean);
    return vals.length > 0 ? vals.join(" • ") : "Not provided";
  }
  return String(data);
}

function renderSkillsPills(skillsRaw) {
  if (!skillsRaw) return "Not provided";
  let skillsArr = [];
  if (Array.isArray(skillsRaw)) {
    skillsArr = skillsRaw.filter(Boolean);
  } else if (typeof skillsRaw === "string") {
    skillsArr = skillsRaw.split(",").map(s => s.trim()).filter(Boolean);
  }
  if (skillsArr.length === 0) return "Not provided";

  return (
    <div className="hr-skills-pill-group">
      {skillsArr.map((skill, idx) => (
        <span key={idx} className="hr-skill-pill">{skill}</span>
      ))}
    </div>
  );
}

export default function HiringRecords() {
  const [applicants, setApplicants] = useState([]);
  const [interviewsMap, setInterviewsMap] = useState({});
  const [evaluationsMap, setEvaluationsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState("Hired");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterJob, setFilterJob] = useState("All");

  // Modals
  const [detailsModalApp, setDetailsModalApp] = useState(null);
  const [timelineModalInfo, setTimelineModalInfo] = useState(null);
  const [selectedResumeApp, setSelectedResumeApp] = useState(null);

  useEffect(() => {
    loadRecordsData();
  }, []);

  async function loadRecordsData() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    if (userId) {
      const { data: appsData } = await fetchEmployerApplicants(userId);
      const { data: invsData } = await fetchInterviewsForEmployer(userId);
      const { data: evalsData } = await supabase
        .from("interview_evaluations")
        .select("*")
        .eq("employer_id", userId);

      const invMap = {};
      if (invsData) {
        invsData.forEach((inv) => {
          if (inv.application_id && !invMap[inv.application_id]) {
            invMap[inv.application_id] = inv;
          }
        });
      }

      const evalMap = {};
      if (evalsData) {
        evalsData.forEach((ev) => {
          if (ev.application_id) evalMap[ev.application_id] = ev;
          if (ev.interview_id && !evalMap[ev.interview_id]) evalMap[ev.interview_id] = ev;
        });
      }

      setInterviewsMap(invMap);
      setEvaluationsMap(evalMap);
      const uniqueApps = deduplicateByApplicationId(appsData || []);
      setApplicants(uniqueApps);
    }
    setLoading(false);
  }

  // Base filtering by Search and Job
  const baseFiltered = applicants.filter((app) => {
    const candidateName = (app.name || app.profiles?.full_name || app.displayName || "").toLowerCase();
    const candidateEmail = (app.email || app.profiles?.email || app.displayEmail || "").toLowerCase();
    const jobTitle = (app.job_title || app.jobs?.title || "").toLowerCase();
    const query = searchQuery.toLowerCase().trim();

    const matchesSearch = !query || candidateName.includes(query) || candidateEmail.includes(query) || jobTitle.includes(query);
    const matchesJob = filterJob === "All" || (app.job_title || app.jobs?.title) === filterJob;

    return matchesSearch && matchesJob;
  });

  const counts = {
    hired: baseFiltered.filter(a => isHired(a.status)).length,
    rejected: baseFiltered.filter(a => isRejected(a.status)).length,
    other: baseFiltered.filter(a => isTerminalApplication(a.status) && !isHired(a.status) && !isRejected(a.status)).length,
    all: baseFiltered.filter(a => isTerminalApplication(a.status)).length
  };

  const finalApplicants = baseFiltered.filter((app) => {
    if (!isTerminalApplication(app.status)) return false;
    if (filterTab === "Hired") return isHired(app.status);
    if (filterTab === "Rejected") return isRejected(app.status);
    if (filterTab === "Other Closed") return !isHired(app.status) && !isRejected(app.status);
    return true; // "All History"
  });

  const uniqueJobs = ["All", ...new Set(applicants.map(a => a.job_title || a.jobs?.title).filter(Boolean))];

  return (
    <DashboardLayout
      role="employer"
      title="📜 Historical Hiring Records"
      subtitle="Complete archive of past recruitment outcomes, hired candidates, and chronological application history."
    >
      <div className="hiring-records-toolbar">
        <div className="hr-quick-tabs">
          <button
            type="button"
            className={`hr-tab-btn ${filterTab === "Hired" ? "active hired" : ""}`}
            onClick={() => setFilterTab("Hired")}
          >
            🎉 Hired ({counts.hired})
          </button>

          <button
            type="button"
            className={`hr-tab-btn ${filterTab === "Rejected" ? "active rejected" : ""}`}
            onClick={() => setFilterTab("Rejected")}
          >
            ❌ Rejected ({counts.rejected})
          </button>

          <button
            type="button"
            className={`hr-tab-btn ${filterTab === "Other Closed" ? "active" : ""}`}
            onClick={() => setFilterTab("Other Closed")}
          >
            📁 Other Closed ({counts.other})
          </button>

          <button
            type="button"
            className={`hr-tab-btn ${filterTab === "All History" ? "active" : ""}`}
            onClick={() => setFilterTab("All History")}
          >
            🌐 All History ({counts.all})
          </button>
        </div>

        <div className="hr-filter-row">
          <input
            type="text"
            className="hr-search-input"
            placeholder="🔍 Search candidate name, role, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <select className="hr-job-select" value={filterJob} onChange={(e) => setFilterJob(e.target.value)}>
            {uniqueJobs.map((j) => (
              <option key={j} value={j}>{j === "All" ? "All Job Listings" : j}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="empty-state">
          <h3>Loading recruitment history...</h3>
        </div>
      ) : finalApplicants.length === 0 ? (
        <div className="empty-state">
          <span>📜</span>
          <h3>No recruitment records found</h3>
          <p>No historical applications match the selected <strong>{filterTab}</strong> tab and filters.</p>
        </div>
      ) : (
        <div className="records-cards-grid">
          {finalApplicants.map((app) => {
            const inv = interviewsMap[app.id];
            const candidateName = app.name || app.profiles?.full_name || app.displayName || "Candidate";
            const jobTitle = app.job_title || app.jobs?.title || "Position";
            const isAppHired = isHired(app.status);
            const isAppRejected = isRejected(app.status);

            return (
              <div key={app.id} className={`hr-card ${isAppHired ? "hired" : isAppRejected ? "rejected" : ""}`}>
                <div>
                  <div className="hr-card-header">
                    <div>
                      <h4 className="hr-candidate-name">{candidateName}</h4>
                      <p className="hr-job-title">💼 {jobTitle}</p>
                    </div>

                    <span className={isAppHired ? "hr-badge-hired" : isAppRejected ? "hr-badge-rejected" : "hr-badge-closed"}>
                      {isAppHired ? "🎉 Hired" : isAppRejected ? "❌ Rejected" : (app.status || "").toUpperCase()}
                    </span>
                  </div>

                  <div className="hr-details-grid">
                    <div className="hr-detail-item">
                      <span>Applied</span>
                      <strong>{formatDate(app.created_at)}</strong>
                    </div>

                    <div className="hr-detail-item">
                      <span>Interviewed</span>
                      <strong>{inv?.scheduled_date || "N/A"}</strong>
                    </div>

                    <div className="hr-detail-item">
                      <span>Decision</span>
                      <strong>{isAppHired ? "Hired" : isAppRejected ? "Rejected" : (app.status || "Closed")}</strong>
                    </div>

                    <div className="hr-detail-item">
                      <span>Decision Date</span>
                      <strong>{formatDate(app.updated_at)}</strong>
                    </div>
                  </div>
                </div>

                <div className="hr-card-actions">
                  <button
                    type="button"
                    className="hr-btn-timeline"
                    onClick={() => setDetailsModalApp(app)}
                  >
                    👤 View Details
                  </button>

                  <button
                    type="button"
                    className="hr-btn-timeline"
                    onClick={() => setTimelineModalInfo({ app, inv, ev: evaluationsMap[app.id] || evaluationsMap[inv?.id] })}
                  >
                    📜 View Timeline
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CANDIDATE DETAILS MODAL (REDESIGNED VIEW DETAILS) */}
      {detailsModalApp && (() => {
        const app = detailsModalApp;
        const inv = interviewsMap[app.id];
        const ev = evaluationsMap[app.id] || evaluationsMap[inv?.id];
        const candidateName = app.name || app.profiles?.full_name || app.displayName || "Candidate";
        const candidateEmail = app.email || app.profiles?.email || app.displayEmail || "";
        const phone = app.profiles?.contact_number || app.applicant_snapshot?.contact_number || "";
        const location = app.profiles?.address || app.jobs?.location || "";
        const jobTitle = app.job_title || app.jobs?.title || "Position";
        const empType = app.jobs?.employment_type || "Full-time";

        const educationData = app.profiles?.education || app.applicant_snapshot?.education;
        const experienceData = app.profiles?.work_experience || app.applicant_snapshot?.work_experience;
        const skillsData = app.profiles?.skills || app.applicant_snapshot?.skills;
        const certsData = app.profiles?.certifications;

        const evalNotes = ev?.evaluation_notes || app.recruiter_notes;
        const recommendation = ev?.overall_recommendation;
        const techRating = ev?.technical_rating;
        const commRating = ev?.communication_rating;

        const hasResume = Boolean(app.resume_url || app.resume?.file_url || app.applicant_snapshot?.resume || app.profiles?.resume_url);

        return (
          <div className="modal-backdrop">
            <div className="modal-dialog hr-details-modal">
              <div className="modal-header">
                <div className="hr-details-header-title">
                  <div className="hr-avatar-circle">
                    {candidateName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 style={{ margin: 0 }}>{candidateName}</h3>
                    <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#64748b" }}>💼 {jobTitle}</p>
                  </div>
                </div>
                <button type="button" className="modal-close-btn" onClick={() => setDetailsModalApp(null)}>×</button>
              </div>

              <div className="modal-body-form hr-details-modal-body">
                {/* STATUS BADGE BANNER */}
                <div className={`hr-details-status-banner ${isHired(app.status) ? "hired" : isRejected(app.status) ? "rejected" : "closed"}`}>
                  <span>Application Outcome: <strong>{isHired(app.status) ? "🎉 HIRED" : isRejected(app.status) ? "❌ REJECTED" : (app.status || "").toUpperCase()}</strong></span>
                  <span>Decision Date: <strong>{formatDate(app.updated_at)}</strong></span>
                </div>

                {/* CONTACT INFORMATION */}
                <div className="hr-modal-section">
                  <h4 className="hr-section-title">📞 Contact Information</h4>
                  <div className="hr-info-grid">
                    <div><span>Email:</span> <strong>{candidateEmail || "Not provided"}</strong></div>
                    <div><span>Phone:</span> <strong>{phone || "Not provided"}</strong></div>
                    <div><span>Location:</span> <strong>{location || "Not provided"}</strong></div>
                  </div>
                </div>

                {/* APPLICATION INFORMATION */}
                <div className="hr-modal-section">
                  <h4 className="hr-section-title">💼 Application Information</h4>
                  <div className="hr-info-grid">
                    <div><span>Job Title:</span> <strong>{jobTitle}</strong></div>
                    <div><span>Employment Type:</span> <strong>{empType}</strong></div>
                    <div><span>Applied Date:</span> <strong>{formatDate(app.created_at)}</strong></div>
                    <div><span>Final Status:</span> <strong>{(app.status || "").toUpperCase()}</strong></div>
                    <div><span>ATS Score:</span> <strong>{typeof app.match_score === "number" && app.match_score > 0 ? `${app.match_score}%` : "Not available"}</strong></div>
                  </div>
                </div>

                {/* PROFESSIONAL BACKGROUND */}
                <div className="hr-modal-section">
                  <h4 className="hr-section-title">🎓 Professional Background</h4>
                  <div className="hr-bg-block">
                    <span>Education:</span>
                    <div>{renderListOrText(educationData)}</div>
                  </div>

                  <div className="hr-bg-block" style={{ marginTop: "10px" }}>
                    <span>Work Experience:</span>
                    <div>{renderListOrText(experienceData)}</div>
                  </div>

                  <div className="hr-bg-block" style={{ marginTop: "10px" }}>
                    <span>Skills:</span>
                    <div>{renderSkillsPills(skillsData)}</div>
                  </div>

                  {certsData && (
                    <div className="hr-bg-block" style={{ marginTop: "10px" }}>
                      <span>Certifications / Credentials:</span>
                      <div>{renderListOrText(certsData)}</div>
                    </div>
                  )}
                </div>

                {/* INTERVIEW SUMMARY */}
                <div className="hr-modal-section">
                  <h4 className="hr-section-title">📝 Interview & Evaluation Summary</h4>
                  {inv ? (
                    <div className="hr-info-grid">
                      <div><span>Date & Time:</span> <strong>{inv.scheduled_date || "N/A"} {inv.scheduled_time ? `at ${inv.scheduled_time}` : ""}</strong></div>
                      <div><span>Mode / Type:</span> <strong>{inv.interview_type || "Standard"}</strong></div>
                      <div><span>Interview Status:</span> <strong>{inv.status || "Completed"}</strong></div>
                    </div>
                  ) : (
                    <p style={{ margin: 0, fontSize: "13px", color: "#94a3b8" }}>No interview record linked.</p>
                  )}

                  <div style={{ marginTop: "10px", background: "#f8fafc", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <span style={{ fontSize: "12px", fontWeight: "700", color: "#334155", textTransform: "uppercase" }}>Recruiter Notes:</span>
                      {recommendation && (
                        <span style={{ fontSize: "11px", fontWeight: "700", background: recommendation.includes("RECOMMEND") ? "#dcfce7" : "#fee2e2", color: recommendation.includes("RECOMMEND") ? "#166534" : "#991b1b", padding: "2px 8px", borderRadius: "12px" }}>
                          {recommendation.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: "13px", color: evalNotes ? "#475569" : "#94a3b8", fontStyle: evalNotes ? "italic" : "normal" }}>
                      {evalNotes ? `"${evalNotes}"` : "No interview evaluation was recorded."}
                    </p>

                    {(techRating || commRating) && (
                      <div style={{ display: "flex", gap: "12px", fontSize: "12px", color: "#64748b", marginTop: "8px" }}>
                        {techRating && <span>Technical: <strong>{"★".repeat(techRating)}{"☆".repeat(5-techRating)}</strong></span>}
                        {commRating && <span>Communication: <strong>{"★".repeat(commRating)}{"☆".repeat(5-commRating)}</strong></span>}
                      </div>
                    )}
                  </div>
                </div>

                {/* DOCUMENTS SECTION */}
                <div className="hr-modal-section" style={{ borderBottom: "none" }}>
                  <h4 className="hr-section-title">📄 Documents</h4>
                  <button
                    type="button"
                    className="hr-btn-view-resume"
                    disabled={!hasResume}
                    onClick={() => setSelectedResumeApp(app)}
                  >
                    {hasResume ? "📄 View Candidate Resume" : "Resume unavailable"}
                  </button>
                </div>
              </div>

              <div className="modal-footer-actions">
                <button type="button" className="btn-secondary" onClick={() => setDetailsModalApp(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* CHRONOLOGICAL VERTICAL RECRUITMENT TIMELINE MODAL */}
      {timelineModalInfo && (() => {
        const { app, inv, ev } = timelineModalInfo;
        const candidateName = app.name || app.profiles?.full_name || app.displayName || "Candidate";
        const jobTitle = app.job_title || app.jobs?.title || "Position";
        const isAppHired = isHired(app.status);
        const isAppRejected = isRejected(app.status);
        const evalNotes = ev?.evaluation_notes || app.recruiter_notes || "";

        const scheduledDateStr = inv?.scheduled_date ? `${inv.scheduled_date}T${inv.scheduled_time || "00:00:00"}` : null;
        const isCompletionPredatingSchedule = Boolean(
          inv?.completed_at &&
          scheduledDateStr &&
          !isNaN(new Date(inv.completed_at).getTime()) &&
          !isNaN(new Date(scheduledDateStr).getTime()) &&
          new Date(inv.completed_at).getTime() < new Date(scheduledDateStr).getTime()
        );

        return (
          <div className="modal-backdrop">
            <div className="modal-dialog hr-timeline-modal">
              <div className="modal-header">
                <h3>📜 Recruitment History Timeline</h3>
                <button type="button" className="modal-close-btn" onClick={() => setTimelineModalInfo(null)}>×</button>
              </div>

              <p className="timeline-subtitle">
                Candidate: <strong>{candidateName}</strong> for Position: <strong>{jobTitle}</strong>
              </p>

              <div className="hr-vertical-timeline">
                {/* EVENT 1: APPLICATION SUBMITTED */}
                <div className="hr-timeline-item completed">
                  <div className="hr-timeline-marker font-marker">📋</div>
                  <div className="hr-timeline-content">
                    <div className="hr-timeline-event-header">
                      <h4>1. Application Submitted</h4>
                      <span className="hr-timeline-time">{formatDateTime(app.created_at)}</span>
                    </div>
                    <p>Candidate applied for <strong>{jobTitle}</strong> and submitted initial profile snapshot.</p>
                  </div>
                </div>

                {/* EVENT 2: PROFILE REVIEWED */}
                <div className="hr-timeline-item completed">
                  <div className="hr-timeline-marker font-marker">👁️</div>
                  <div className="hr-timeline-content">
                    <div className="hr-timeline-event-header">
                      <h4>2. Application Reviewed & Screened</h4>
                      <span className="hr-timeline-time">Timestamp unavailable</span>
                    </div>
                    <p>Recruiter reviewed candidate background, skills, and qualifications.</p>
                  </div>
                </div>

                {/* EVENT 3: INTERVIEW SCHEDULED */}
                {inv && (
                  <div className="hr-timeline-item completed">
                    <div className="hr-timeline-marker font-marker">📅</div>
                    <div className="hr-timeline-content">
                      <div className="hr-timeline-event-header">
                        <h4>3. Interview Scheduled ({inv.interview_type || "Online"})</h4>
                        <span className="hr-timeline-time">{inv.created_at ? formatDateTime(inv.created_at) : (inv.scheduled_date ? `${inv.scheduled_date} ${inv.scheduled_time || ""}` : "Timestamp unavailable")}</span>
                      </div>
                      <p>Interview session scheduled for: <strong>{inv.scheduled_date || "TBD"} {inv.scheduled_time ? "at " + inv.scheduled_time : ""}</strong>.</p>
                    </div>
                  </div>
                )}

                {/* EVENT 4: INTERVIEW COMPLETED */}
                {inv && (inv.status === "COMPLETED" || inv.completed_at) && (
                  <div className="hr-timeline-item completed">
                    <div className="hr-timeline-marker font-marker">✓</div>
                    <div className="hr-timeline-content">
                      <div className="hr-timeline-event-header">
                        <h4>4. Interview Completed</h4>
                        <span className="hr-timeline-time">{inv.completed_at ? formatDateTime(inv.completed_at) : "Timestamp unavailable"}</span>
                      </div>
                      <p>
                        Interview session completed.
                        {evalNotes ? ` Evaluator Notes: "${evalNotes}"` : ""}
                      </p>
                      {isCompletionPredatingSchedule && (
                        <div style={{ marginTop: "6px", fontSize: "11px", color: "#b45309", background: "#fef3c7", padding: "4px 8px", borderRadius: "4px" }}>
                          ⚠️ Completion timestamp ({formatDateTime(inv.completed_at)}) predates scheduled interview ({inv.scheduled_date} {inv.scheduled_time || ""}) — legacy/test record.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* EVENT 5: FINAL DECISION RECORDED */}
                <div className={`hr-timeline-item completed ${isAppHired ? "hired" : isAppRejected ? "rejected" : "closed"}`}>
                  <div className="hr-timeline-marker font-marker">
                    {isAppHired ? "🎉" : isAppRejected ? "❌" : "📁"}
                  </div>
                  <div className="hr-timeline-content">
                    <div className="hr-timeline-event-header">
                      <h4>5. Final Decision Recorded: {(app.status || "").toUpperCase()}</h4>
                      <span className="hr-timeline-time">{formatDateTime(app.updated_at)}</span>
                    </div>
                    <p>
                      Official recruitment outcome recorded as <strong>{(app.status || "").toUpperCase()}</strong>.
                      {app.reject_reason ? ` Rejection Feedback: "${app.reject_reason}"` : " Candidate recruitment lifecycle concluded."}
                    </p>
                  </div>
                </div>
              </div>

              <div className="modal-footer-actions" style={{ marginTop: "20px" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setTimelineModalInfo(null)}
                >
                  Close Timeline
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* RESUME VIEWER MODAL */}
      {selectedResumeApp && (
        <ResumeViewerModal
          applicant={selectedResumeApp}
          readOnly={true}
          context="hiring-records"
          onClose={() => setSelectedResumeApp(null)}
        />
      )}
    </DashboardLayout>
  );
}
