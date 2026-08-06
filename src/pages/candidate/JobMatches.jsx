import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { supabase } from "../../services/supabase";
import { applyForJobWithSnapshot } from "../../services/applicationService";
import { triggerSimulationNotification } from "../../services/notificationService";
import { runMatchingForCandidate } from "../../services/matchingEngine";
import { useToast } from "../../contexts/ToastContext";
import "./JobMatches.css";

export default function JobMatches() {
  const toast = useToast();
  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);

  // Candidate status
  const [hasResume, setHasResume] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState("Pending Verification");

  // Filtering & Search
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState("All");
  const [selectedMatch, setSelectedMatch] = useState("All");
  const [showBookmarkedOnly, setShowBookmarkedOnly] = useState(false);

  const [userId, setUserId] = useState(null);

  // Detail Modal
  const [selectedJob, setSelectedJob] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function fetchMatches(uid) {
    const { data: matches } = await supabase
      .from("job_matches")
      .select(`*, jobs!inner(*)`)
      .eq("user_id", uid)
      .order("match_score", { ascending: false });

    const formatted = (matches || [])
      .filter(m => m.jobs && m.jobs.status === "open")
      .map((m, idx) => ({
        ...m.jobs,
        rank: idx + 1,
        matchScore: m.match_score || 0,
        skillsScore: m.skills_score || 0,
        educationScore: m.education_score || 0,
        experienceScore: m.experience_score || 0,
        matchedSkills: m.matching_skills || [],
        missingSkills: m.missing_skills || [],
        matchedCerts: m.matched_certs || [],
        matchReason: m.match_reason || "",
        recommendedCourses: m.recommended_courses || [],
        microCredentials: m.micro_credentials || []
      }));
    return formatted;
  }

  async function loadData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
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
    const vStatus = profileRow?.verification_status || "Pending Verification";
    setVerificationStatus(vStatus);

    // 3. Fetch existing job matches
    let formattedJobs = await fetchMatches(user.id);

    // 4. If no matches yet but candidate_profile exists, run engine now
    if (formattedJobs.length === 0 && resumeRow) {
      setMatching(true);
      await runMatchingForCandidate(user.id);
      formattedJobs = await fetchMatches(user.id);
      setMatching(false);
    }

    setJobs(formattedJobs);

    // 5. Fetch Applications
    const { data: appsData } = await supabase
      .from("applications")
      .select("*")
      .eq("applicant_id", user.id);
    setApplications(appsData || []);

    // 6. Bookmarks
    const savedBookmarks = localStorage.getItem(`skillsync_bookmarks_${user.id}`);
    if (savedBookmarks) setBookmarks(JSON.parse(savedBookmarks));

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

  // Client-side Math Removed: AI matching engine handles this server-side

  const isApplyBlocked = !hasResume || (verificationStatus !== "Verified" && verificationStatus !== "Approved");

  async function handleApply(job) {
    if (!userId) {
      toast.error("Please sign in before applying.");
      return;
    }

    // Block if no resume
    if (!hasResume) {
      toast.error("You must upload a resume before applying to jobs.");
      return;
    }

    // Block if identity not verified
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

  // Sort descending by match score (rank 1 = highest)
  const sortedJobs = [...jobs].sort((a, b) => b.matchScore - a.matchScore);

  const filteredJobs = sortedJobs.filter(job => {
    // Filter out unrelated jobs (< 40%) completely unless selectedMatch says 'All' ?
    // "Filter out strictly unrelated jobs (e.g., matching score < 40%)." - I will do it globally.
    if (job.matchScore < 40) return false;
    // Search filter
    const matchesSearch = 
      job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (job.location && job.location.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (job.required_skills && job.required_skills.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (job.description && job.description.toLowerCase().includes(searchTerm.toLowerCase()));

    // Employment type filter
    const matchesType = selectedType === "All" || job.employment_type === selectedType;

    // Match quality filter
    let matchesMatch = true;
    if (selectedMatch === "High") {
      matchesMatch = job.matchScore >= 75;
    } else if (selectedMatch === "Medium") {
      matchesMatch = job.matchScore >= 40 && job.matchScore < 75;
    } else if (selectedMatch === "Basic") {
      matchesMatch = job.matchScore < 40;
    }

    // Bookmark filter
    const matchesBookmark = !showBookmarkedOnly || bookmarks.includes(job.id);

    return matchesSearch && matchesType && matchesMatch && matchesBookmark;
  });

  return (
    <DashboardLayout
      role="candidate"
      title="Skill Aligned Job Openings"
      subtitle="AI-driven job screening matching your profile achievements."
    >
      <section className="dashboard-panel">
        <div className="panel-header">
          <div>
            <h2>Intelligent Job Matching</h2>
            <p>Our matching algorithm ranks openings by comparing your skills to the recruiter's specifications.</p>
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

        {/* ── LOADING / MATCHING STATES ── */}
        {loading ? (
          <div className="empty-state">
            <span style={{ fontSize: "40px" }}>⏳</span>
            <h3>Loading your job matches...</h3>
            <p>Please wait while we fetch your personalized recommendations.</p>
          </div>
        ) : matching ? (
          <div className="empty-state">
            <span style={{ fontSize: "40px", display: "block", animation: "spin 1.2s linear infinite" }}>🧠</span>
            <h3>AI Matching in Progress...</h3>
            <p>Analyzing your resume and scoring all active job postings. This takes just a moment.</p>
          </div>
        ) : (
        <>
        {/* Filter controls row */}
        <div className="matches-controls-row">
          <input
            type="text"
            placeholder="🔍 Search title, skills, location..."
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
            <option value="Full-time">Full-Time</option>
            <option value="Part-time">Part-Time</option>
            <option value="Contract">Contract</option>
            <option value="Remote">Remote</option>
            <option value="Internship">Internship</option>
          </select>

          <select
            value={selectedMatch}
            onChange={(e) => setSelectedMatch(e.target.value)}
            className="filter-select"
          >
            <option value="All">All Match Levels</option>
            <option value="High">🔥 High Matches (≥75%)</option>
            <option value="Medium">⚡ Medium Matches (40-74%)</option>
            <option value="Basic">📈 Basic Matches (&lt;40%)</option>
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
            <h3>{hasResume ? "No matching jobs found" : "Upload a resume to see your job matches"}</h3>
            <p>{hasResume ? "Try adjusting your search criteria or clearing your filters." : "Your AI-powered recommendations will appear here after uploading your resume."}</p>
          </div>
        ) : (
          <div className="job-match-list">
            {filteredJobs.map((job, listIdx) => {
              const rank = listIdx + 1;
              const score = job.matchScore;
              let matchClass = "basic-match";
              let badgeClass = "basic";
              if (score >= 75) { matchClass = "high-match"; badgeClass = "high"; }
              else if (score >= 40) { matchClass = "medium-match"; badgeClass = "medium"; }

              const applied = hasApplied(job.id);
              const applyDisabled = applied || isApplyBlocked;
              const applyLabel = applied ? "Applied ✓" : isApplyBlocked ? "🔒 Apply Now" : "Apply Now";
              const applyTitle = applied ? "You have already applied" : !hasResume ? "Upload a resume to apply" : verificationStatus !== "Verified" && verificationStatus !== "Approved" ? "Complete identity verification to apply" : "";

              return (
                <article className={`job-match-card ${matchClass}`} key={job.id}>
                  <div className="job-card-header">
                    <div className="job-card-title-area">
                      {/* Rank Badge */}
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          width: "26px", height: "26px", borderRadius: "50%", fontSize: "12px", fontWeight: "800",
                          background: rank === 1 ? "#f59e0b" : rank === 2 ? "#94a3b8" : rank === 3 ? "#b45309" : "#e2e8f0",
                          color: rank <= 3 ? "#fff" : "#64748b"
                        }}>#{rank}</span>
                        <h3 style={{ margin: 0 }}>{job.title}</h3>
                      </div>
                      <h4>Hiring Partner</h4>
                    </div>

                    <div className={`match-score-badge ${badgeClass}`}>
                      🧠 {score}% Match
                    </div>
                  </div>

                  <p className="job-description-excerpt">{job.description || "No job description provided."}</p>

                  {/* Skills with ✓/✗ from engine */}
                  <div className="job-skills-list">
                    {job.required_skills ? (
                      job.required_skills.split(",").map((s) => {
                        const skill = s.trim();
                        const skillNorm = skill.toLowerCase().replace(/[^a-z0-9]/g, "");
                        const isMatched = Array.isArray(job.matchedSkills)
                          ? job.matchedSkills.some(m => {
                              const mNorm = String(m).toLowerCase().replace(/[^a-z0-9]/g, "");
                              return mNorm.includes(skillNorm) || skillNorm.includes(mNorm);
                            })
                          : false;
                        return (
                          <span key={skill} className={`job-skill-badge ${isMatched ? "matched" : ""}`}>
                            {isMatched ? "✓ " : "✗ "}{skill}
                          </span>
                        );
                      })
                    ) : (
                      <span className="job-skill-badge">No required skills specified</span>
                    )}
                  </div>

                  <div className="job-card-footer">
                    <div className="job-card-meta">
                      <span>📍 {job.location || "Not specified"}</span>
                      <span>💼 {job.employment_type || "Full-time"}</span>
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
                      >View Alignment</button>
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
                <h3 style={{ fontSize: "20px" }}>{selectedJob.title}</h3>
                <span style={{ fontSize: "13px", color: "#58158f", fontWeight: "800" }}>Company Hiring Partner</span>
              </div>
              <button className="modal-close-btn" onClick={() => setShowDetailModal(false)}>×</button>
            </div>
            
            {/* Skills Comparison */}
            <div className="skills-comparison-card">
              <h4>Skill Alignment Comparison</h4>
              <div className="skills-comparison-group">
                <div className="skills-comparison-label">Matched Skills ({selectedJob.matchedSkills?.length || 0})</div>
                <div className="job-skills-list">
                  {selectedJob.matchedSkills?.map(skill => (
                    <span key={skill} className="job-skill-badge matched">✓ {skill}</span>
                  ))}
                  {(!selectedJob.matchedSkills || selectedJob.matchedSkills.length === 0) && (
                    <em style={{ fontSize: "12px", color: "#8b8f9c" }}>No matching skills yet. Add these to your profile.</em>
                  )}
                </div>
              </div>
              
              <div className="skills-comparison-group">
                <div className="skills-comparison-label">Missing Skills ({selectedJob.missingSkills?.length || 0})</div>
                <div className="job-skills-list">
                  {selectedJob.missingSkills?.map(skill => (
                    <span key={skill} className="job-skill-badge" style={{ color: "#d97706", background: "#fffbeb", border: "1px solid #fde68a" }}>{skill}</span>
                  ))}
                  {(!selectedJob.missingSkills || selectedJob.missingSkills.length === 0) && (
                    <span className="job-skill-badge matched">✓ Complete match!</span>
                  )}
                </div>
              </div>
            </div>

            {/* AI Reasoning */}
            {selectedJob.matchReason && (
              <div className="ai-reasoning-card" style={{ marginTop: "16px", padding: "16px", backgroundColor: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "8px" }}>
                <h4 style={{ color: "#334155", marginBottom: "8px", fontSize: "15px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span>🧠</span> AI Match Breakdown
                </h4>
                <p style={{ fontSize: "13px", color: "#475569", lineHeight: "1.5" }}>{selectedJob.matchReason}</p>
                <div style={{ display: "flex", gap: "16px", marginTop: "12px", flexWrap: "wrap" }}>
                  <div style={{ fontSize: "12px", color: "#64748b" }}>
                    <strong>Skills:</strong> {Math.round((selectedJob.skillsScore / 100) * 60)}/60 pts
                    <span style={{ marginLeft: 6, color: "#94a3b8" }}>({selectedJob.skillsScore}%)</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#64748b" }}>
                    <strong>Education:</strong> {Math.round((selectedJob.educationScore / 100) * 25)}/25 pts
                    <span style={{ marginLeft: 6, color: "#94a3b8" }}>({selectedJob.educationScore}%)</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#64748b" }}>
                    <strong>Experience:</strong> {Math.round((selectedJob.experienceScore / 100) * 15)}/15 pts
                    <span style={{ marginLeft: 6, color: "#94a3b8" }}>({selectedJob.experienceScore}%)</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── Micro-Credentials Section ── */}
            {selectedJob.microCredentials && selectedJob.microCredentials.length > 0 && (
              <div style={{ marginTop: "16px", padding: "16px", background: "linear-gradient(135deg, #eff6ff, #f0fdf4)", border: "1px solid #bfdbfe", borderRadius: "12px" }}>
                <h4 style={{ color: "#1e40af", marginBottom: "6px", fontSize: "15px", display: "flex", alignItems: "center", gap: "8px" }}>
                  🏅 Recommended Micro-Credentials
                </h4>
                <p style={{ fontSize: "12px", color: "#3b82f6", marginBottom: "12px" }}>
                  Earn these professional certificates to boost your match score and stand out to recruiters.
                </p>
                <div style={{ display: "grid", gap: "8px" }}>
                  {selectedJob.microCredentials.map((mc, idx) => (
                    <a key={idx} href={mc.link} target="_blank" rel="noopener noreferrer"
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "#fff", borderRadius: "10px", textDecoration: "none", border: "1px solid #dbeafe" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ fontSize: "20px" }}>🎖️</span>
                        <div>
                          <strong style={{ display: "block", color: "#1e40af", fontSize: "13px" }}>{mc.badge}</strong>
                          <span style={{ fontSize: "11px", color: "#64748b" }}>Skill gap: {mc.skill}</span>
                        </div>
                      </div>
                      <span style={{ fontSize: "11px", fontWeight: "800", color: "#2563eb", whiteSpace: "nowrap" }}>{mc.provider} →</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* ── Recommended Courses Section ── */}
            {selectedJob.recommendedCourses && selectedJob.recommendedCourses.length > 0 && (
              <div style={{ marginTop: "12px", padding: "16px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "12px" }}>
                <h4 style={{ color: "#166534", marginBottom: "6px", fontSize: "15px", display: "flex", alignItems: "center", gap: "8px" }}>
                  📚 Upskilling Courses
                </h4>
                <p style={{ fontSize: "12px", color: "#15803d", marginBottom: "12px" }}>
                  Courses to close your skill gaps for this role:
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {selectedJob.recommendedCourses.map((course, idx) => (
                    <a key={idx} href={course.link} target="_blank" rel="noopener noreferrer"
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: "#fff", borderRadius: "8px", textDecoration: "none", border: "1px solid #dcfce7" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "16px" }}>🎓</span>
                        <strong style={{ color: "#166534", fontSize: "12px" }}>{course.course}</strong>
                      </div>
                      <span style={{ fontSize: "11px", color: "#2563eb", fontWeight: "700" }}>Enroll →</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* ── Matched Certs Boost ── */}
            {selectedJob.matchedCerts && selectedJob.matchedCerts.length > 0 && (
              <div style={{ marginTop: "12px", padding: "12px 16px", background: "#fefce8", border: "1px solid #fde68a", borderRadius: "10px" }}>
                <h4 style={{ color: "#92400e", marginBottom: "8px", fontSize: "14px" }}>🏆 Your Certifications That Boosted This Match</h4>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {selectedJob.matchedCerts.map((cert, idx) => (
                    <span key={idx} style={{ fontSize: "12px", fontWeight: "800", padding: "5px 10px", background: "#fffbeb", border: "1px solid #fbbf24", borderRadius: "8px", color: "#92400e" }}>
                      🎖️ {cert}
                    </span>
                  ))}
                </div>
              </div>
            )}


            <div className="job-detail-grid">
              <div className="job-detail-main">
                <h4>Job Description</h4>
                <p>{selectedJob.description || "No description provided by the recruiter."}</p>
              </div>

              <div className="job-detail-sidebar">
                <div className="detail-sidebar-item">
                  <h5>Location</h5>
                  <p>{selectedJob.location || "Office Location"}</p>
                </div>
                <div className="detail-sidebar-item">
                  <h5>Employment Type</h5>
                  <p>{selectedJob.employment_type || "Full-time"}</p>
                </div>
                <div className="detail-sidebar-item">
                  <h5>AI Match Rating</h5>
                  <p style={{ color: selectedJob.matchScore >= 75 ? "#10b981" : "#8b5cf6" }}>
                    {selectedJob.matchScore}% Match
                  </p>
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="modal-btn secondary"
                onClick={() => setShowDetailModal(false)}
              >Close</button>
              <button
                type="button"
                className="modal-btn primary"
                onClick={() => handleApply(selectedJob)}
                disabled={hasApplied(selectedJob.id) || isApplyBlocked}
                title={!hasResume ? "Upload a resume to apply" : verificationStatus !== "Verified" && verificationStatus !== "Approved" ? "Complete identity verification to apply" : ""}
                style={isApplyBlocked && !hasApplied(selectedJob.id) ? { opacity: 0.6, cursor: "not-allowed" } : {}}
              >
                {hasApplied(selectedJob.id) ? "Applied ✓" : isApplyBlocked ? "🔒 Apply for Job" : "Apply for Job"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}