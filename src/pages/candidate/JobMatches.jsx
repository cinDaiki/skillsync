import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { supabase } from "../../services/supabase";
import { applyForJobWithSnapshot } from "../../services/applicationService";
import { triggerSimulationNotification } from "../../services/notificationService";
import { useToast } from "../../contexts/ToastContext";
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

    // 5. Fetch ALL active open jobs, ordered by created_at DESC (newest first)
    const { data: openJobs, error: jobsError } = await supabase
      .from("jobs")
      .select("*")
      .eq("status", "open")
      .order("created_at", { ascending: false });

    if (jobsError) {
      console.error("[Marketplace] Error loading jobs:", jobsError.message);
      setJobs([]);
    } else {
      setJobs(openJobs || []);
    }

    setLoading(false);
  }

  function hasApplied(jobId) {
    return applications.some((app) => app.job_id === jobId);
  }

  // Toggle Bookmark
  function toggleBookmark(jobId) {
    if (!userId) return;
    let nextBookmarks;
    if (bookmarks.includes(jobId)) {
      nextBookmarks = bookmarks.filter(id => id !== jobId);
    } else {
      nextBookmarks = [...bookmarks, jobId];
    }
    setBookmarks(nextBookmarks);
    localStorage.setItem(`skillsync_bookmarks_${userId}`, JSON.stringify(nextBookmarks));
  }

  const isApplyBlocked = !hasResume || (verificationStatus !== "Verified" && verificationStatus !== "Approved");

  async function handleApply(job) {
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

    const { data, error } = await applyForJobWithSnapshot(job.id, userId);

    if (error) {
      toast.error("Failed to apply: " + error.message);
      return;
    }

    setApplications((prev) => [...prev, data]);
    toast.success(`Successfully applied for "${job.title}"!`);

    await triggerSimulationNotification(userId, "job_applied", { jobTitle: job.title });
    setShowDetailModal(false);
  }

  function handleViewDetails(job) {
    setSelectedJob(job);
    setShowDetailModal(true);
  }

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
          <div className="job-match-list">
            {filteredJobs.map((job, listIdx) => {
              const rank = listIdx + 1;
              const applied = hasApplied(job.id);
              const applyDisabled = applied || isApplyBlocked;
              const applyLabel = applied ? "Applied ✓" : isApplyBlocked ? "🔒 Apply Now" : "Apply Now";
              const applyTitle = applied ? "You have already applied" : !hasResume ? "Upload a resume to apply" : verificationStatus !== "Verified" && verificationStatus !== "Approved" ? "Complete identity verification to apply" : "";

              return (
                <article className="job-match-card" key={job.id}>
                  <div className="job-card-header">
                    <div className="job-card-title-area">
                      <h3 style={{ margin: "0 0 4px 0", fontSize: "18px", fontWeight: "900", color: "#1e1b4b" }}>{job.title}</h3>
                      <p style={{ margin: "2px 0 0 0", fontSize: "13px", color: "#64748b", fontWeight: "600" }}>
                        {[job.company_name || "Employer", formatPostedDate(job.created_at)].filter(Boolean).join(" · ")}
                      </p>
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
                        onClick={() => handleApply(job)}
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
        )}
        </>
        )}
      </section>

      {/* ── JOB DETAILS POPUP MODAL ── */}
      {showDetailModal && selectedJob && (
        <div className="modal-overlay" onClick={() => setShowDetailModal(false)}>
          <div className="modal-card" style={{ maxWidth: "700px" }} onClick={(e) => e.stopPropagation()}>
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
              <div className="job-detail-main">
                <h4 style={{ color: "#58158f", margin: "0 0 6px 0", fontSize: "14px", fontWeight: "800" }}>Job Description</h4>
                <p style={{ margin: 0, fontSize: "13px", color: "#334155", lineHeight: "1.6", whiteSpace: "pre-wrap" }}>
                  {selectedJob.description || "No description provided by recruiter."}
                </p>
              </div>

              {selectedJob.required_skills && (
                <div>
                  <h4 style={{ color: "#58158f", margin: "0 0 6px 0", fontSize: "14px", fontWeight: "800" }}>Required Skills</h4>
                  <div className="job-skills-list">
                    {selectedJob.required_skills.split(",").map((s) => (
                      <span key={s} className="job-skill-badge">
                        {s.trim()}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedJob.required_education && (
                <div>
                  <h4 style={{ color: "#58158f", margin: "0 0 4px 0", fontSize: "14px", fontWeight: "800" }}>Required Education</h4>
                  <p style={{ margin: 0, fontSize: "13px", color: "#334155" }}>{selectedJob.required_education}</p>
                </div>
              )}

              {selectedJob.experience_required && (
                <div>
                  <h4 style={{ color: "#58158f", margin: "0 0 4px 0", fontSize: "14px", fontWeight: "800" }}>Required Experience</h4>
                  <p style={{ margin: 0, fontSize: "13px", color: "#334155" }}>{selectedJob.experience_required}</p>
                </div>
              )}

              <div className="job-detail-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", background: "#f8fafc", padding: "14px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                <div>
                  <strong style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase" }}>Location</strong>
                  <p style={{ margin: "2px 0 0 0", fontSize: "13px", fontWeight: "700", color: "#1e293b" }}>{selectedJob.location || "Not specified"}</p>
                </div>
                <div>
                  <strong style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase" }}>Employment Type</strong>
                  <p style={{ margin: "2px 0 0 0", fontSize: "13px", fontWeight: "700", color: "#1e293b" }}>{selectedJob.employment_type || "Full-time"}</p>
                </div>
                <div>
                  <strong style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase" }}>Work Setup</strong>
                  <p style={{ margin: "2px 0 0 0", fontSize: "13px", fontWeight: "700", color: "#1e293b" }}>{selectedJob.work_setup || "On-site"}</p>
                </div>
                <div>
                  <strong style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase" }}>Salary Range</strong>
                  <p style={{ margin: "2px 0 0 0", fontSize: "13px", fontWeight: "700", color: "#166534" }}>{selectedJob.salary_range || "Confidential"}</p>
                </div>
              </div>
            </div>

            <div className="modal-footer" style={{ display: "flex", justifyContent: "flex-end", gap: "12px", borderTop: "1px solid #e2e8f0", paddingTop: "16px" }}>
              <button
                type="button"
                className="view-details-btn"
                onClick={() => setShowDetailModal(false)}
              >Close</button>
              <button
                type="button"
                className="job-apply-primary"
                onClick={() => handleApply(selectedJob)}
                disabled={hasApplied(selectedJob.id) || isApplyBlocked}
              >{hasApplied(selectedJob.id) ? "Applied ✓" : "Apply for this Job"}</button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}