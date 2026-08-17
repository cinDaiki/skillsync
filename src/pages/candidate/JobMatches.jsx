import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { supabase } from "../../services/supabase";
import { applyForJobWithSnapshot } from "../../services/applicationService";
import { triggerSimulationNotification } from "../../services/notificationService";
import { useToast } from "../../contexts/ToastContext";
import { fetchSemanticMatchesForCandidate, refreshCandidateRecommendations } from "../../services/ai/semanticMatchingService";
import { parseJobRequirements } from "../../utils/jobRequirementsHelper";
import { matchMicrocredentialsForMissingSkills } from "../../services/microcredentialService";
import "./JobMatches.css";

function formatPostedDate(dateStr) {
  if (!dateStr) return "Recently posted";
  try {
    const d = new Date(dateStr);
    return `Posted ${d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    })}`;
  } catch {
    return "Recently posted";
  }
}

export default function JobMatches() {
  const toast = useToast();
  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [loading, setLoading] = useState(true);

  // Candidate status
  const [hasResume, setHasResume] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState("Pending Verification");

  // Filtering & Search
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState("All");
  const [selectedSetup, setSelectedSetup] = useState("All");
  const [showBookmarkedOnly, setShowBookmarkedOnly] = useState(false);

  const [userId, setUserId] = useState(null);

  // Detail Modal
  const [selectedJob, setSelectedJob] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [confirmApplyJob, setConfirmApplyJob] = useState(null);
  const [reportingJob, setReportingJob] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      setUserId(user.id);

      // 1. Check resume existence
      const { data: resumeRow } = await supabase
        .from("resumes")
        .select("id")
        .eq("applicant_id", user.id)
        .maybeSingle();
      setHasResume(!!resumeRow);

      if (resumeRow) {
        // Trigger background refresh of candidate recommendations against latest open jobs
        refreshCandidateRecommendations(user.id).catch((err) => {
          console.warn("[Marketplace] Background recommendation refresh info:", err);
        });
      }

      // 2. Check identity verification status
      const { data: profileRow } = await supabase
        .from("profiles")
        .select("verification_status")
        .eq("id", user.id)
        .maybeSingle();
      setVerificationStatus(profileRow?.verification_status || "Pending Verification");

      // 3. Fetch applications
      const { data: appsData } = await supabase
        .from("applications")
        .select("*")
        .eq("applicant_id", user.id);
      setApplications(appsData || []);

      // 4. Bookmarks
      const savedBookmarks = localStorage.getItem(`skillsync_bookmarks_${user.id}`);
      if (savedBookmarks) setBookmarks(JSON.parse(savedBookmarks));
    }

    // 5. Fetch ALL active open jobs from Approved/Verified employers, ordered by created_at DESC (newest first)
    const { data: openJobs, error: jobsError } = await supabase
      .from("jobs")
      .select("*")
      .eq("status", "open")
      .order("created_at", { ascending: false });

    if (jobsError) {
      console.error("[Marketplace] Error loading jobs:", jobsError.message);
      setJobs([]);
    } else {
      let rawJobs = openJobs || [];
      const empIds = Array.from(new Set(rawJobs.map((j) => j.employer_id).filter(Boolean)));

      let profMap = new Map();
      let empProfMap = new Map();

      if (empIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, email, verification_status, is_suspended")
          .in("id", empIds);

        const { data: empProfs } = await supabase
          .from("employer_profiles")
          .select("id, company_name, location, industry, website, company_logo_url, verification_status")
          .in("id", empIds);

        profMap = new Map((profs || []).map((p) => [p.id, p]));
        empProfMap = new Map((empProfs || []).map((ep) => [ep.id, ep]));
      }

      // Filter strictly for open jobs from Approved or Verified employers
      const validJobs = rawJobs
        .filter((j) => {
          const p = profMap.get(j.employer_id);
          const ep = empProfMap.get(j.employer_id);

          if (p?.is_suspended) return false;

          const verificationStatus = ep?.verification_status || p?.verification_status || "Approved";
          return verificationStatus === "Approved" || verificationStatus === "Verified";
        })
        .map((j) => {
          const p = profMap.get(j.employer_id);
          const ep = empProfMap.get(j.employer_id);
          return {
            ...j,
            company_name: ep?.company_name || j.company_name || p?.full_name || "Verified Employer",
            employer_name: p ? (p.full_name || p.email) : (j.employer_name || "Employer"),
            employer_email: p?.email || j.employer_email || "",
            employer_verification_status: ep?.verification_status || p?.verification_status || "Approved",
            verified_employer: true,
            location: j.location || ep?.location || "Tagum City",
            company_logo_url: ep?.company_logo_url || null,
          };
        });

      setJobs(validJobs);
    }

    setLoading(false);
  }

  function hasApplied(jobId) {
    return applications.some((app) => app.job_id === jobId);
  }

  // Toggle Bookmark
  function toggleBookmark(jobId) {
    if (!userId) return;
    const newBookmarks = bookmarks.includes(jobId)
      ? bookmarks.filter((id) => id !== jobId)
      : [...bookmarks, jobId];

    setBookmarks(newBookmarks);
    localStorage.setItem(`skillsync_bookmarks_${userId}`, JSON.stringify(newBookmarks));
    toast.info(bookmarks.includes(jobId) ? "Removed from bookmarks." : "Job bookmarked!");
  }

  const isApplyBlocked = !hasResume || (verificationStatus !== "Verified" && verificationStatus !== "Approved");

  function handlePromptApply(job) {
    if (!userId) {
      toast.error("Please sign in before applying.");
      return;
    }

    if (!hasResume) {
      toast.error("You must upload a resume before applying to jobs.");
      return;
    }

    if (verificationStatus !== "Verified" && verificationStatus !== "Approved") {
      if (verificationStatus === "Under Review") {
        toast.error("Your verification is under review. You can apply once the admin approves your identity.");
      } else {
        toast.error("Your identity must be verified before you can apply. Please complete ID verification in your Profile.");
      }
      return;
    }

    if (hasApplied(job.id)) {
      toast.error("You already applied to this job.");
      return;
    }

    setConfirmApplyJob(job);
  }

  async function handleConfirmApply() {
    if (!confirmApplyJob) return;
    const job = confirmApplyJob;

    const { data, error } = await applyForJobWithSnapshot(job.id, userId);

    if (error) {
      toast.error("Failed to apply: " + error.message);
      setConfirmApplyJob(null);
      return;
    }

    setApplications((prev) => [...prev, data]);
    toast.success(`Successfully applied for "${job.title}"!`);

    await triggerSimulationNotification(userId, "job_applied", { jobTitle: job.title });
    setConfirmApplyJob(null);
    setShowDetailModal(false);
  }

  function handleViewDetails(job) {
    setSelectedJob(job);
    setShowDetailModal(true);
  }

  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 6;

  // Chronological sort: newest first (created_at DESC)
  const sortedJobs = [...jobs].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  const filteredJobs = sortedJobs.filter(job => {
    // Search filter
    const matchesSearch = 
      !searchTerm.trim() ||
      job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (job.location && job.location.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (job.required_skills && job.required_skills.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (job.description && job.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (job.company_name && job.company_name.toLowerCase().includes(searchTerm.toLowerCase()));

    // Employment type filter
    const matchesType = selectedType === "All" || job.employment_type === selectedType;

    // Work setup filter
    const matchesSetup = selectedSetup === "All" || job.work_setup === selectedSetup;

    // Bookmark filter
    const matchesBookmark = !showBookmarkedOnly || bookmarks.includes(job.id);

    return matchesSearch && matchesType && matchesSetup && matchesBookmark;
  });

  const totalPages = Math.ceil(filteredJobs.length / PAGE_SIZE) || 1;
  const paginatedJobs = filteredJobs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <DashboardLayout
      role="candidate"
      title="Job Marketplace"
      subtitle="Browse all available employer job postings, ordered by newest first."
    >
      <section className="dashboard-panel">
        <div className="panel-header">
          <div>
            <h2>Active Job Openings</h2>
            <p>Explore current opportunities posted by employers across all industries.</p>
          </div>
        </div>

        {/* ── WARNING BANNERS ── */}
        {!hasResume && !loading && (
          <div style={{ margin: "0 0 16px", padding: "14px 18px", background: "#fef3c7", border: "1px solid #fbbf24", borderRadius: "10px", display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "22px" }}>📄</span>
            <div>
              <strong style={{ color: "#92400e" }}>No Resume Found</strong>
              <p style={{ margin: 0, fontSize: "13px", color: "#b45309" }}>You must upload a resume before you can apply to jobs. <Link to="/candidate/resume" style={{ color: "#d97706", fontWeight: "700" }}>Upload Resume →</Link></p>
            </div>
          </div>
        )}

        {hasResume && verificationStatus !== "Verified" && verificationStatus !== "Approved" && !loading && (
          verificationStatus === "Under Review" ? (
            <div style={{ margin: "0 0 16px", padding: "14px 18px", background: "#fffbeb", border: "1px solid #f59e0b", borderRadius: "10px", display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "22px" }}>⏳</span>
              <div>
                <strong style={{ color: "#92400e" }}>Verification Under Review</strong>
                <p style={{ margin: 0, fontSize: "13px", color: "#b45309" }}>Your ID and selfie have been submitted. The admin is reviewing your documents. You will be able to apply once approved.</p>
              </div>
            </div>
          ) : (
            <div style={{ margin: "0 0 16px", padding: "14px 18px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "10px", display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "22px" }}>🔒</span>
              <div>
                <strong style={{ color: "#991b1b" }}>Identity Verification Required</strong>
                <p style={{ margin: 0, fontSize: "13px", color: "#b91c1c" }}>Your account must be verified before applying to jobs. <Link to="/candidate/profile" style={{ color: "#dc2626", fontWeight: "700" }}>Complete Verification →</Link></p>
              </div>
            </div>
          )
        )}

        {/* ── LOADING STATE ── */}
        {loading ? (
          <div className="empty-state">
            <span style={{ fontSize: "40px" }}>⏳</span>
            <h3>Loading job marketplace...</h3>
            <p>Fetching active open positions.</p>
          </div>
        ) : (
        <>
        {/* Filter controls row */}
        <div className="matches-controls-row">
          <input
            type="text"
            placeholder="🔍 Search title, company, skills, location..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-filter-input"
          />

          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="filter-select"
          >
            <option value="All">All Job Types</option>
            <option value="Full-time">Full-time</option>
            <option value="Part-time">Part-time</option>
            <option value="Contract">Contract</option>
            <option value="Remote">Remote</option>
            <option value="Internship">Internship</option>
          </select>

          <select
            value={selectedSetup}
            onChange={(e) => setSelectedSetup(e.target.value)}
            className="filter-select"
          >
            <option value="All">All Work Setups</option>
            <option value="On-site">On-site</option>
            <option value="Hybrid">Hybrid</option>
            <option value="Remote">Remote</option>
          </select>

          <button
            type="button"
            className={`bookmarks-tab-btn ${showBookmarkedOnly ? "active" : ""}`}
            onClick={() => setShowBookmarkedOnly(!showBookmarkedOnly)}
          >
            ⭐ Bookmarks ({bookmarks.length})
          </button>
        </div>

        {filteredJobs.length === 0 ? (
          <div className="empty-state">
            <span>◎</span>
            <h3>No jobs found</h3>
            <p>There are currently no active job openings matching your search criteria. Please check back later.</p>
          </div>
        ) : (
          <div>
            <div className="job-match-list">
            {paginatedJobs.map((job) => {
              const applied = hasApplied(job.id);
              const applyDisabled = applied || isApplyBlocked;
              const applyLabel = applied ? "Applied ✓" : isApplyBlocked ? "🔒 Apply Now" : "Apply Now";
              const applyTitle = applied ? "You have already applied" : !hasResume ? "Upload a resume to apply" : verificationStatus !== "Verified" && verificationStatus !== "Approved" ? "Complete identity verification to apply" : "";
              const { applicationRequirements } = parseJobRequirements(job);

              return (
                <article className="job-match-card" key={job.id}>
                  <div className="job-card-header">
                    <div className="job-card-title-area">
                      <h3 style={{ margin: "0 0 4px 0", fontSize: "18px", fontWeight: "900", color: "#1e1b4b" }}>{job.title}</h3>
                      <p style={{ margin: "2px 0 0 0", fontSize: "13px", color: "#64748b", fontWeight: "600" }}>
                        {[job.company_name || "Employer", formatPostedDate(job.created_at)].filter(Boolean).join(" · ")}
                      </p>
                      {(job.employer_verification_status === "Approved" || job.employer_verification_status === "Verified" || job.verified_employer) && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "#dcfce7", color: "#15803d", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: "700", marginTop: "4px" }}>
                          ✓ Verified Employer
                        </span>
                      )}
                    </div>

                    {job.salary_range && (
                      <div style={{ background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0", padding: "4px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: "800" }}>
                        💰 {job.salary_range}
                      </div>
                    )}
                  </div>

                  <p className="job-description-excerpt">{job.description || "No job description provided."}</p>

                  {/* Required Skills Tags */}
                  <div className="job-skills-list">
                    {job.required_skills ? (
                      job.required_skills.split(",").map((s) => (
                        <span key={s} className="job-skill-badge">
                          {s.trim()}
                        </span>
                      ))
                    ) : (
                      <span className="job-skill-badge">No specific skills listed</span>
                    )}
                  </div>

                  {/* Employer Application Requirements */}
                  {applicationRequirements.length > 0 && (
                    <div style={{ marginTop: "8px" }}>
                      <span style={{ fontSize: "11px", fontWeight: "700", color: "#1e1b4b", display: "block", marginBottom: "4px" }}>
                        📋 Document Requirements:
                      </span>
                      <div className="job-skills-list">
                        {applicationRequirements.map((req, rIdx) => (
                          <span key={rIdx} className="job-skill-badge" style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>
                            ✓ {req}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="job-card-footer">
                    <div className="job-card-meta">
                      <span>📍 {job.location || "Location not specified"}</span>
                      <span>💼 {job.employment_type || "Full-time"}</span>
                      {job.work_setup && <span>🏢 {job.work_setup}</span>}
                    </div>

                    <div className="job-card-actions">
                      <button
                        type="button"
                        className={`bookmark-btn ${bookmarks.includes(job.id) ? "bookmarked" : ""}`}
                        onClick={() => toggleBookmark(job.id)}
                        title="Bookmark Job"
                      >⭐</button>
                      <button
                        type="button"
                        className="view-details-btn"
                        onClick={() => handleViewDetails(job)}
                      >View Details</button>
                      <button
                        type="button"
                        className="job-apply-primary"
                        onClick={() => handlePromptApply(job)}
                        disabled={applyDisabled}
                        title={applyTitle}
                        style={isApplyBlocked && !applied ? { opacity: 0.6, cursor: "not-allowed" } : {}}
                      >{applyLabel}</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="job-matches-pagination" style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "12px", marginTop: "24px" }}>
              <button
                type="button"
                className="filter-select"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                style={{ padding: "6px 14px", fontSize: "13px", cursor: currentPage === 1 ? "not-allowed" : "pointer" }}
              >
                ← Previous
              </button>
              <span style={{ fontSize: "13px", fontWeight: "600", color: "#475569" }}>
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                className="filter-select"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                style={{ padding: "6px 14px", fontSize: "13px", cursor: currentPage === totalPages ? "not-allowed" : "pointer" }}
              >
                Next →
              </button>
            </div>
          )}
          </div>
        )}
        </>
        )}
      </section>

      {/* ── JOB DETAILS POPUP MODAL ── */}
      {showDetailModal && selectedJob && (() => {
        const { cleanCertifications, applicationRequirements } = parseJobRequirements(selectedJob);

        return (
          <div className="modal-overlay" onClick={() => setShowDetailModal(false)}>
            <div className="modal-card" style={{ maxWidth: "720px" }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h3 style={{ fontSize: "20px", margin: 0 }}>{selectedJob.title}</h3>
                  <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#58158f", fontWeight: "700" }}>
                    {[selectedJob.company_name || "Employer", formatPostedDate(selectedJob.created_at)].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <button className="modal-close-btn" onClick={() => setShowDetailModal(false)}>×</button>
              </div>

              <div style={{ padding: "20px 0", display: "flex", flexDirection: "column", gap: "16px" }}>
                
                {/* Meta details grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px", background: "#f8fafc", padding: "12px 16px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "12px" }}>
                  <div>📍 <strong>Location:</strong> {selectedJob.location || "Not specified"}</div>
                  <div>💼 <strong>Type:</strong> {selectedJob.employment_type || "Full-time"}</div>
                  <div>🏢 <strong>Setup:</strong> {selectedJob.work_setup || "On-site"}</div>
                  {selectedJob.salary_range && <div>💰 <strong>Salary:</strong> {selectedJob.salary_range}</div>}
                </div>

                <div className="job-detail-main">
                  <h4 style={{ color: "#58158f", margin: "0 0 6px 0", fontSize: "14px", fontWeight: "800" }}>Job Description</h4>
                  <p style={{ margin: 0, fontSize: "13px", color: "#334155", lineHeight: "1.6", whiteSpace: "pre-wrap" }}>
                    {selectedJob.description || "No description provided by recruiter."}
                  </p>
                </div>

                {/* ── JOB QUALIFICATIONS ── */}
                <div style={{ background: "#faf5ff", padding: "14px", borderRadius: "10px", border: "1px solid #f3e8ff" }}>
                  <h4 style={{ color: "#58158f", margin: "0 0 8px 0", fontSize: "14px", fontWeight: "800" }}>🎓 Job Qualifications</h4>
                  {selectedJob.required_education && (
                    <p style={{ fontSize: "13px", margin: "0 0 4px 0" }}><strong>Education:</strong> {selectedJob.required_education}</p>
                  )}
                  {selectedJob.experience_required && (
                    <p style={{ fontSize: "13px", margin: "0 0 4px 0" }}><strong>Experience:</strong> {selectedJob.experience_required}</p>
                  )}
                  {selectedJob.required_skills && (
                    <div style={{ marginTop: "6px" }}>
                      <strong style={{ fontSize: "13px" }}>Required Skills:</strong>
                      <div className="job-skills-list" style={{ marginTop: "4px" }}>
                        {selectedJob.required_skills.split(",").map((s) => (
                          <span key={s} className="job-skill-badge">{s.trim()}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {cleanCertifications && (
                    <p style={{ fontSize: "13px", margin: "6px 0 0 0", color: "#6b21a8" }}><strong>Certifications:</strong> {cleanCertifications}</p>
                  )}
                </div>

                {/* ── APPLICATION DOCUMENT REQUIREMENTS ── */}
                <div style={{ background: "#f0f9ff", padding: "14px", borderRadius: "10px", border: "1px solid #bae6fd" }}>
                  <h4 style={{ color: "#0369a1", margin: "0 0 8px 0", fontSize: "14px", fontWeight: "800" }}>📋 Required Application Documents</h4>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {applicationRequirements.map((req, rIdx) => (
                      <span key={rIdx} style={{ background: "#ffffff", color: "#0369a1", border: "1px solid #7dd3fc", padding: "4px 10px", borderRadius: "14px", fontSize: "12px", fontWeight: "700" }}>
                        ✓ {req}
                      </span>
                    ))}
                  </div>
                </div>

                {/* ── AI SKILL GAP ANALYSIS & MICROCREDENTIAL RECOMMENDATIONS ── */}
                {(() => {
                  const microList = (selectedJob.microCredentials && selectedJob.microCredentials.length > 0)
                    ? selectedJob.microCredentials
                    : matchMicrocredentialsForMissingSkills(selectedJob.missingSkills || []);

                  const matchedSkillsList = selectedJob.matchedSkills || [];
                  const missingSkillsList = selectedJob.missingSkills || [];

                  return (
                    <div style={{ background: "#f8fafc", padding: "16px 20px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                      <h4 style={{ color: "#1e1b4b", margin: "0 0 12px 0", fontSize: "15px", fontWeight: "800", display: "flex", alignItems: "center", gap: "8px" }}>
                        🧠 Skill Gap Analysis & Microcredentials
                      </h4>

                      {/* Skills You Have vs Skills You're Missing */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "8px" }}>
                        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "12px", borderRadius: "8px" }}>
                          <strong style={{ fontSize: "12px", color: "#15803d", display: "block", marginBottom: "6px" }}>
                            ✓ Skills You Have ({matchedSkillsList.length})
                          </strong>
                          {matchedSkillsList.length > 0 ? (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                              {matchedSkillsList.map(s => (
                                <span key={s} style={{ background: "#dcfce7", color: "#166534", fontSize: "11px", fontWeight: "600", padding: "3px 8px", borderRadius: "12px" }}>
                                  ✓ {s}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ fontSize: "12px", color: "#64748b" }}>No direct required skill matches identified.</span>
                          )}
                        </div>

                        <div style={{ background: "#fff1f2", border: "1px solid #fecdd3", padding: "12px", borderRadius: "8px" }}>
                          <strong style={{ fontSize: "12px", color: "#be123c", display: "block", marginBottom: "6px" }}>
                            ⚠ Skills You're Missing ({missingSkillsList.length})
                          </strong>
                          {missingSkillsList.length > 0 ? (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                              {missingSkillsList.map(s => (
                                <span key={s} style={{ background: "#ffe4e6", color: "#9f1239", fontSize: "11px", fontWeight: "600", padding: "3px 8px", borderRadius: "12px" }}>
                                  ⚠ {s}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <div style={{ color: "#15803d", fontSize: "12px", fontWeight: "600" }}>
                              🎉 Your current skills cover the identified requirements for this role.
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Zero Gap Notification */}
                      {missingSkillsList.length === 0 && (
                        <div style={{ marginTop: "14px", padding: "12px 16px", borderRadius: "8px", background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", fontSize: "13px" }}>
                          🎉 <strong>Full Skill Alignment:</strong> Your current skills cover all identified requirements for this role. No skill-gap microcredentials are currently recommended.
                        </div>
                      )}

                      {/* Recommended Credentials Section */}
                      {microList.length > 0 && (
                        <div style={{ marginTop: "16px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                            <strong style={{ fontSize: "14px", color: "#1e1b4b" }}>
                              🎓 Recommended Credentials to Close Skill Gaps
                            </strong>
                            <span style={{ fontSize: "11px", color: "#64748b", background: "#f1f5f9", padding: "3px 8px", borderRadius: "12px", fontWeight: "600" }}>
                              {microList.length} verified program{microList.length > 1 ? "s" : ""}
                            </span>
                          </div>

                          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                            {microList.map((mc, mIdx) => {
                              const coveredGaps = mc.coveredSkills || (mc.skill_name ? [mc.skill_name] : []);
                              const hasUrl = mc.url && mc.url !== '#' && mc.url.startsWith('http');
                              const formatType = (mc.credentialType || "Course").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

                              let sourceBg = "#e0f2fe";
                              let sourceColor = "#0369a1";
                              let sourceBorder = "#bae6fd";
                              if (mc.sourceType === "tesda") {
                                sourceBg = "#fef3c7";
                                sourceColor = "#92400e";
                                sourceBorder = "#fde68a";
                              } else if (mc.sourceType === "industry_provider") {
                                sourceBg = "#f3e8ff";
                                sourceColor = "#6b21a8";
                                sourceBorder = "#e9d5ff";
                              } else if (mc.sourceType === "open_badge") {
                                sourceBg = "#dcfce7";
                                sourceColor = "#166534";
                                sourceBorder = "#bbf7d0";
                              }

                              return (
                                <div key={mc.id || mIdx} style={{ background: "#ffffff", border: "1px solid #cbd5e1", padding: "14px 16px", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
                                    <div style={{ flex: 1, minWidth: "260px" }}>
                                      <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap", marginBottom: "6px" }}>
                                        <span style={{ fontSize: "11px", fontWeight: "700", background: sourceBg, color: sourceColor, border: `1px solid ${sourceBorder}`, padding: "2px 8px", borderRadius: "4px" }}>
                                          🏛️ {mc.provider}
                                        </span>
                                        <span style={{ fontSize: "11px", fontWeight: "600", background: "#f1f5f9", color: "#475569", padding: "2px 8px", borderRadius: "4px" }}>
                                          📋 {formatType}
                                        </span>
                                        {mc.level && (
                                          <span style={{ fontSize: "11px", color: "#64748b", background: "#f8fafc", padding: "2px 6px", borderRadius: "4px" }}>
                                            📊 {mc.level}
                                          </span>
                                        )}
                                      </div>

                                      <h5 style={{ margin: "2px 0 6px 0", fontSize: "14px", fontWeight: "700", color: "#0f172a" }}>
                                        {mc.badge || "🎓"} {mc.title}
                                      </h5>

                                      <p style={{ margin: "0 0 8px 0", fontSize: "12px", color: "#475569", lineHeight: "1.4" }}>
                                        {mc.description}
                                      </p>

                                      {coveredGaps.length > 0 && (
                                        <div style={{ marginTop: "6px", background: "#faf5ff", border: "1px solid #f3e8ff", padding: "6px 10px", borderRadius: "6px" }}>
                                          <span style={{ fontSize: "11px", fontWeight: "700", color: "#6b21a8", display: "block", marginBottom: "4px" }}>
                                            🎯 Helps close ({coveredGaps.length} missing skill{coveredGaps.length > 1 ? "s" : ""}):
                                          </span>
                                          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                                            {coveredGaps.map(g => (
                                              <span key={g} style={{ background: "#ede9fe", color: "#581c87", padding: "2px 6px", borderRadius: "4px", fontSize: "11px", fontWeight: "600" }}>
                                                {g}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", fontSize: "11px", color: "#64748b", marginTop: "8px" }}>
                                        {mc.duration && <span>⏱️ Duration: <strong>{mc.duration}</strong></span>}
                                        {mc.issuer && mc.issuer !== mc.provider && <span>🏢 Issuer: <strong>{mc.issuer}</strong></span>}
                                      </div>
                                    </div>

                                    <div style={{ alignSelf: "center" }}>
                                      {hasUrl ? (
                                        <a
                                          href={mc.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="job-apply-primary"
                                          style={{ fontSize: "12px", padding: "8px 14px", textDecoration: "none", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "4px", fontWeight: "700" }}
                                        >
                                          View Credential ↗
                                        </a>
                                      ) : (
                                        <span style={{ fontSize: "11px", color: "#94a3b8", fontStyle: "italic" }}>
                                          Official credential link currently unavailable.
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Missing skills with zero credential matches */}
                      {missingSkillsList.length > 0 && microList.length === 0 && (
                        <p style={{ fontSize: "12px", color: "#64748b", fontStyle: "italic", marginTop: "12px", margin: "12px 0 0 0" }}>
                          No verified credential recommendation is currently available for this skill.
                        </p>
                      )}
                    </div>
                  );
                })()}

              </div>

              <div className="modal-footer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #e2e8f0", paddingTop: "16px" }}>
                <button
                  type="button"
                  style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5", padding: "8px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: "700", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
                  onClick={() => setReportingJob(selectedJob)}
                >
                  🚩 Report Job
                </button>
                <div style={{ display: "flex", gap: "12px" }}>
                  <button
                    type="button"
                    className="view-details-btn"
                    onClick={() => setShowDetailModal(false)}
                  >Close</button>
                  <button
                    type="button"
                    className="job-apply-primary"
                    onClick={() => handlePromptApply(selectedJob)}
                    disabled={hasApplied(selectedJob.id) || isApplyBlocked}
                  >{hasApplied(selectedJob.id) ? "Applied ✓" : "Apply Now"}</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── PRE-APPLICATION REQUIREMENTS CONFIRMATION MODAL ── */}
      {confirmApplyJob && (() => {
        const { applicationRequirements } = parseJobRequirements(confirmApplyJob);

        return (
          <div className="modal-overlay" onClick={() => setConfirmApplyJob(null)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "500px" }}>
              <div className="modal-header">
                <div>
                  <h3 style={{ margin: 0, fontSize: "18px", color: "#1e1b4b" }}>📋 Application Documents Check</h3>
                  <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#64748b" }}>
                    Applying for <strong>{confirmApplyJob.title}</strong> at {confirmApplyJob.company_name || 'Employer'}
                  </p>
                </div>
                <button className="modal-close-btn" onClick={() => setConfirmApplyJob(null)}>×</button>
              </div>

              <div style={{ padding: "20px 0" }}>
                <p style={{ fontSize: "13px", color: "#334155", lineHeight: "1.5", margin: "0 0 12px 0" }}>
                  The employer requires applicants to prepare the following documents:
                </p>

                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "12px 16px", borderRadius: "8px", display: "flex", flexDirection: "column", gap: "8px" }}>
                  {applicationRequirements.map((req, rIdx) => (
                    <div key={rIdx} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: "600", color: "#1e293b" }}>
                      <span style={{ color: "#16a34a" }}>✓</span>
                      <span>{req}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="modal-footer" style={{ display: "flex", justifyContent: "flex-end", gap: "12px", borderTop: "1px solid #e2e8f0", paddingTop: "16px" }}>
                <button type="button" className="view-details-btn" onClick={() => setConfirmApplyJob(null)}>
                  Cancel
                </button>
                <button type="button" className="job-apply-primary" onClick={handleConfirmApply}>
                  Confirm & Apply
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── REPORT JOB MODAL ── */}
      {reportingJob && (
        <ReportJobModal
          job={reportingJob}
          userId={userId}
          onClose={() => setReportingJob(null)}
          onSuccess={() => {
            setReportingJob(null);
            setShowDetailModal(false);
          }}
        />
      )}
    </DashboardLayout>
  );
}

/**
 * Report Job Modal Component
 */
function ReportJobModal({ job, userId, onClose, onSuccess }) {
  const toast = useToast();
  const [reason, setReason] = useState("Scam / Fraud");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reportReasons = [
    "Scam / Fraud",
    "Fake Job",
    "Asking for Money",
    "Misleading Information",
    "Suspicious Employer",
    "Incorrect Job Details",
    "Inappropriate Content",
    "Other"
  ];

  async function handleSubmitReport(e) {
    e.preventDefault();
    setSubmitting(true);

    const { submitJobReport } = await import("../../services/adminService");
    const { error } = await submitJobReport({
      jobId: job.id,
      reporterId: userId,
      reason,
      details
    });

    setSubmitting(false);

    if (error) {
      toast.error("Failed to submit report: " + error.message);
      return;
    }

    toast.success("Job report submitted for administrator investigation.");
    onSuccess();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "480px" }}>
        <div className="modal-header">
          <div>
            <h3 style={{ margin: 0, fontSize: "18px", color: "#991b1b" }}>🚩 Report Job Posting</h3>
            <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#64748b" }}>
              Reporting <strong>{job.title}</strong> at {job.company_name || "Employer"}
            </p>
          </div>
          <button className="modal-close-btn" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmitReport} style={{ padding: "20px 0" }}>
          <label style={{ display: "block", marginBottom: "14px", fontSize: "13px", fontWeight: "700", color: "#1e293b" }}>
            Reason for reporting *
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{ display: "block", width: "100%", marginTop: "6px", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
            >
              {reportReasons.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>

          <label style={{ display: "block", marginBottom: "14px", fontSize: "13px", fontWeight: "700", color: "#1e293b" }}>
            Additional Details (Optional)
            <textarea
              rows={4}
              placeholder="Describe the issue or suspicious activity..."
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              style={{ display: "block", width: "100%", marginTop: "6px", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
            />
          </label>

          <div className="modal-footer" style={{ display: "flex", justifyContent: "flex-end", gap: "12px", borderTop: "1px solid #e2e8f0", paddingTop: "16px" }}>
            <button type="button" className="view-details-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="job-apply-primary" disabled={submitting} style={{ background: "#dc2626" }}>
              {submitting ? "Submitting..." : "Submit Report"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}