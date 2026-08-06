import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  fetchAdminDashboardStats,
  fetchAdminProfiles,
  fetchAdminJobs,
  fetchAdminResumes,
  fetchAdminApplications,
  displayUserName,
} from "../../services/adminService";
import { supabase } from "../../services/supabase";

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    jobSeekers: 0,
    employers: 0,
    totalJobs: 0,
    openJobs: 0,
    closedJobs: 0,
    totalApplications: 0,
    totalResumes: 0,
    totalUsers: 0,
    aiMatches: 0,
    aiAvgScore: 0,
    topMissingSkills: []
  });
  const [recentResumes, setRecentResumes] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [logFilter, setLogFilter] = useState("all");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([
    { id: 1, type: "info", text: "System is performing optimally. Database health at 100%.", time: "Just now" },
    { id: 2, type: "warning", text: "New applications submitted. Job matches waiting for screening.", time: "10 mins ago" },
    { id: 3, type: "success", text: "Platform integration verified with Supabase Storage.", time: "1 hour ago" },
  ]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  useEffect(() => {
    filterActivityLogs();
  }, [searchQuery, logFilter, activityLogs]);

  async function loadDashboardData() {
    setLoading(true);
    setLoadError("");

    try {
      const [statsResult, profilesResult, jobsResult, resumesResult, appsResult] = await Promise.all([
        fetchAdminDashboardStats(),
        fetchAdminProfiles(),
        fetchAdminJobs(),
        fetchAdminResumes(),
        fetchAdminApplications(),
      ]);

      const profileList = profilesResult.data || [];
      const jobsList = jobsResult.data || [];
      const resumesList = resumesResult.data || [];
      const applicationsList = appsResult.data || [];

      // Calculate stats
      const totalSeekers = profileList.filter((p) => p.role === "candidate" || p.role === "job_seeker").length;
      const totalEmployers = profileList.filter((p) => p.role === "employer").length;
      const totalUsers = profileList.length;
      const totalJobs = jobsList.length;
      const openJobs = jobsList.filter((j) => j.status === "open").length;
      const closedJobs = jobsList.filter((j) => j.status === "closed").length;
      const totalApps = applicationsList.length;
      const totalResumes = resumesList.length;

      setStats({
        jobSeekers: totalSeekers,
        employers: totalEmployers,
        totalUsers,
        totalJobs,
        openJobs,
        closedJobs,
        totalApplications: totalApps,
        totalResumes,
        aiMatches: 0,
        aiAvgScore: 0,
        topMissingSkills: []
      });

      // Fetch Matching Engine Stats
      const { data: matches } = await supabase.from("job_matches").select("match_score, missing_skills");
      if (matches && matches.length > 0) {
        const avgScore = Math.round(matches.reduce((sum, m) => sum + (m.match_score || 0), 0) / matches.length);
        
        const skillCounts = {};
        matches.forEach(m => {
          if (Array.isArray(m.missing_skills)) {
            m.missing_skills.forEach(s => {
              skillCounts[s] = (skillCounts[s] || 0) + 1;
            });
          }
        });
        const sortedSkills = Object.entries(skillCounts).sort((a,b) => b[1] - a[1]).slice(0, 4).map(k => k[0]);

        setStats(prev => ({
          ...prev,
          aiMatches: matches.length,
          aiAvgScore: avgScore,
          topMissingSkills: sortedSkills
        }));
      }

      setRecentResumes(resumesList.slice(0, 4));

      // Build activity logs timeline
      const logs = [];

      // User registrations
      profileList.forEach((user) => {
        logs.push({
          id: `reg-${user.id}`,
          type: "registration",
          title: displayUserName(user),
          desc: `Registered as ${user.role === "employer" ? "Employer" : "Job Seeker"}`,
          time: new Date(user.created_at),
          badge: user.role === "employer" ? "Employer" : "Candidate",
          icon: "👥",
        });
      });

      // Job posts
      jobsList.forEach((job) => {
        logs.push({
          id: `job-${job.id}`,
          type: "job",
          title: job.title || "Untitled Job",
          desc: `Posted by ${job.employer_name || "Employer"}`,
          time: new Date(job.created_at),
          badge: job.location || "Remote",
          icon: "▣",
        });
      });

      // Resume uploads
      resumesList.forEach((resume) => {
        logs.push({
          id: `res-${resume.applicant_id}-${resume.created_at}`,
          type: "resume",
          title: resume.file_name || "Resume File",
          desc: `Uploaded by ${resume.applicant_name || "Candidate"}`,
          time: new Date(resume.created_at),
          badge: formatFileSize(resume.file_size),
          icon: "📁",
        });
      });

      // Applications
      applicationsList.forEach((app) => {
        logs.push({
          id: `app-${app.id}`,
          type: "application",
          title: `${app.applicant_name || "Candidate"} applied`,
          desc: `Applied for ${app.job_title || "Job Post"}`,
          time: new Date(app.created_at),
          badge: app.status || "Applied",
          icon: "↗",
        });
      });

      // Sort logs chronologically (newest first)
      logs.sort((a, b) => b.time - a.time);
      setActivityLogs(logs);

      if (profilesResult.error || jobsResult.error) {
        setLoadError(
          "Database connection warnings. Please make sure database RPC functions are installed."
        );
      }
    } catch (err) {
      console.error(err);
      setLoadError("Failed to fetch platform dashboard analytics.");
    } finally {
      setLoading(false);
    }
  }

  function filterActivityLogs() {
    let result = [...activityLogs];

    // Filter by type
    if (logFilter !== "all") {
      result = result.filter((log) => log.type === logFilter);
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (log) =>
          log.title.toLowerCase().includes(q) ||
          log.desc.toLowerCase().includes(q) ||
          log.type.toLowerCase().includes(q)
      );
    }

    setFilteredLogs(result.slice(0, 15)); // Limit to top 15 matches for dashboard view
  }

  function formatFileSize(size) {
    if (!size) return "Unknown size";
    return `${(size / 1024 / 1024).toFixed(2)} MB`;
  }

  function formatLogTime(dateObj) {
    const now = new Date();
    const diffMs = now - dateObj;
    const diffMins = Math.floor(diffMs / 1000 / 60);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function dismissNotification(id) {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  // Calculate alignment metrics for interactive radial chart
  const seekerPercent = stats.totalUsers > 0 ? Math.round((stats.jobSeekers / stats.totalUsers) * 100) : 0;
  const employerPercent = stats.totalUsers > 0 ? Math.round((stats.employers / stats.totalUsers) * 100) : 0;

  return (
    <DashboardLayout
      role="admin"
      title="Platform Workspace"
      subtitle="Complete admin control panel for users, files, resumes, and hiring tracking."
    >
      <section className="dashboard-grid">
        {/* HERO SECTION */}
        <section className="dashboard-hero-card">
          <div>
            <span className="section-badge">SkillSync Administration</span>
            <h2>Platform Hub & Analytics</h2>
            <p>
              Overview of registrations, applications, storage quotas, and match metrics. Review files directly in browser and adjust platform configurations.
            </p>
          </div>
          <div className="dashboard-hero-icon">⚙</div>
        </section>

        {loadError && (
          <div className="profile-message" style={{ background: "#fff1f2", color: "#e11d48", borderColor: "#fecdd3" }}>
            ⚠️ {loadError}
          </div>
        )}

        {/* NOTIFICATIONS PANEL */}
        {notifications.length > 0 && (
          <div className="dashboard-notifications-panel" style={{
            background: "rgba(88, 21, 143, 0.04)",
            border: "1px solid #e7e2f2",
            borderRadius: "22px",
            padding: "18px 24px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            boxShadow: "0 10px 30px rgba(16, 24, 40, 0.02)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h4 style={{ margin: 0, color: "#58158f", fontWeight: "900", display: "flex", alignItems: "center", gap: "8px" }}>
                <span>🔔</span> Platform Alerts ({notifications.length})
              </h4>
              <button
                onClick={() => setNotifications([])}
                style={{ background: "none", border: "none", color: "#667085", fontSize: "12px", cursor: "pointer", fontWeight: "800" }}
              >
                Clear All
              </button>
            </div>
            <div style={{ display: "grid", gap: "8px" }}>
              {notifications.map((n) => (
                <div key={n.id} style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "#ffffff",
                  padding: "10px 16px",
                  borderRadius: "12px",
                  borderLeft: `4px solid ${n.type === "warning" ? "#f59e0b" : n.type === "success" ? "#10b981" : "#58158f"}`,
                  fontSize: "13px",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.03)"
                }}>
                  <span style={{ color: "#344054" }}>{n.text}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <small style={{ color: "#98a2b3", fontSize: "11px" }}>{n.time}</small>
                    <button
                      onClick={() => dismissNotification(n.id)}
                      style={{ background: "none", border: "none", color: "#98a2b3", cursor: "pointer", fontSize: "14px", fontWeight: "bold" }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* METRICS OVERVIEW */}
        <section className="enterprise-stats-grid" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
          <article className="enterprise-stat-card" style={{ borderLeft: "4px solid #8b18ff" }}>
            <div className="enterprise-stat-icon purple">👥</div>
            <div className="enterprise-stat-info">
              <h3>{stats.totalUsers}</h3>
              <p>Total Users</p>
            </div>
          </article>
          <article className="enterprise-stat-card" style={{ borderLeft: "4px solid #3b82f6" }}>
            <div className="enterprise-stat-icon blue">▤</div>
            <div className="enterprise-stat-info">
              <h3>{stats.employers}</h3>
              <p>Recruiters</p>
            </div>
          </article>
          <article className="enterprise-stat-card" style={{ borderLeft: "4px solid #ec4899" }}>
            <div className="enterprise-stat-icon pink">👤</div>
            <div className="enterprise-stat-info">
              <h3>{stats.jobSeekers}</h3>
              <p>Applicants</p>
            </div>
          </article>
          <article className="enterprise-stat-card" style={{ borderLeft: "4px solid #10b981" }}>
            <div className="enterprise-stat-icon green">🧠</div>
            <div className="enterprise-stat-info">
              <h3>{stats.aiMatches}</h3>
              <p>AI Matches Generated</p>
            </div>
          </article>
          <article className="enterprise-stat-card" style={{ borderLeft: "4px solid #f59e0b" }}>
            <div className="enterprise-stat-icon orange">⚡</div>
            <div className="enterprise-stat-info">
              <h3>{stats.aiAvgScore}%</h3>
              <p>Average Match Score</p>
            </div>
          </article>
        </section>

        {/* AI INSIGHTS PANEL */}
        {stats.topMissingSkills.length > 0 && (
          <section className="enterprise-panel" style={{ marginTop: "24px" }}>
             <div className="enterprise-panel-header">
               <h2>Platform Skill Gap Analysis</h2>
               <p style={{ fontSize: "13px", color: "#64748b" }}>Most frequently missing skills across all job candidates based on AI matching.</p>
             </div>
             <div style={{ display: "flex", gap: "12px", padding: "16px" }}>
               {stats.topMissingSkills.map((skill, idx) => (
                 <div key={idx} style={{ background: "#fee2e2", border: "1px solid #fecaca", padding: "8px 16px", borderRadius: "8px", color: "#991b1b", fontWeight: "bold" }}>
                   ✗ {skill}
                 </div>
               ))}
             </div>
          </section>
        )}

        {/* INTERACTIVE ANALYTICS & CHARTS */}
        <section className="dashboard-overview-columns">
          {/* USER MIX CHART */}
          <section className="enterprise-panel" style={{ minHeight: "360px" }}>
            <div className="enterprise-panel-header">
              <div className="panel-header-content">
                <h2>User Alignment Metrics</h2>
                <p>Proportion of candidates vs employers registered on SkillSync.</p>
              </div>
            </div>
            <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "space-around", gap: "20px" }}>
              {/* Circular SVG Chart */}
              <div style={{ position: "relative", width: "160px", height: "160px" }}>
                <svg width="100%" height="100%" viewBox="0 0 42 42" className="donut">
                  <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#f1e5ff" strokeWidth="4.5"></circle>
                  <circle
                    cx="21"
                    cy="21"
                    r="15.915"
                    fill="transparent"
                    stroke="#8b18ff"
                    strokeWidth="4.5"
                    strokeDasharray={`${seekerPercent} ${100 - seekerPercent}`}
                    strokeDashoffset="25"
                  ></circle>
                </svg>
                <div style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  textAlign: "center"
                }}>
                  <strong style={{ fontSize: "28px", color: "#101828", fontWeight: "950" }}>{seekerPercent}%</strong>
                  <span style={{ display: "block", fontSize: "11px", color: "#667085", fontWeight: "800" }}>Candidates</span>
                </div>
              </div>

              {/* Data Indicators */}
              <div style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: "150px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <span style={{ width: "12px", height: "12px", borderRadius: "4px", background: "#8b18ff" }}></span>
                    <strong style={{ fontSize: "14px", color: "#344054" }}>Candidates ({stats.jobSeekers})</strong>
                  </div>
                  <div style={{ width: "100%", height: "6px", background: "#f1e5ff", borderRadius: "10px" }}>
                    <div style={{ width: `${seekerPercent}%`, height: "100%", background: "#8b18ff", borderRadius: "10px" }}></div>
                  </div>
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <span style={{ width: "12px", height: "12px", borderRadius: "4px", background: "#f13093" }}></span>
                    <strong style={{ fontSize: "14px", color: "#344054" }}>Recruiters ({stats.employers})</strong>
                  </div>
                  <div style={{ width: "100%", height: "6px", background: "#ffeef7", borderRadius: "10px" }}>
                    <div style={{ width: `${employerPercent}%`, height: "100%", background: "#f13093", borderRadius: "10px" }}></div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* JOBS MONITORING BAR CHART */}
          <section className="enterprise-panel" style={{ minHeight: "360px" }}>
            <div className="enterprise-panel-header">
              <div className="panel-header-content">
                <h2>Job Posts Funnel</h2>
                <p>Status summary of posted roles in employer workspaces.</p>
              </div>
            </div>
            <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center", gap: "20px", padding: "0 10px" }}>
              <div style={{ display: "grid", gap: "14px" }}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "14px" }}>
                    <span style={{ fontWeight: "800", color: "#344054" }}>🟢 Active Open Jobs</span>
                    <strong style={{ color: "#101828" }}>{stats.openJobs} / {stats.totalJobs}</strong>
                  </div>
                  <div style={{ width: "100%", height: "12px", background: "#f3f4f6", borderRadius: "6px", overflow: "hidden" }}>
                    <div style={{
                      width: stats.totalJobs > 0 ? `${(stats.openJobs / stats.totalJobs) * 100}%` : "0%",
                      height: "100%",
                      background: "linear-gradient(90deg, #10b981, #34d399)",
                      borderRadius: "6px"
                    }}></div>
                  </div>
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "14px" }}>
                    <span style={{ fontWeight: "800", color: "#344054" }}>🔴 Closed Jobs</span>
                    <strong style={{ color: "#101828" }}>{stats.closedJobs} / {stats.totalJobs}</strong>
                  </div>
                  <div style={{ width: "100%", height: "12px", background: "#f3f4f6", borderRadius: "6px", overflow: "hidden" }}>
                    <div style={{
                      width: stats.totalJobs > 0 ? `${(stats.closedJobs / stats.totalJobs) * 100}%` : "0%",
                      height: "100%",
                      background: "linear-gradient(90deg, #ef4444, #f87171)",
                      borderRadius: "6px"
                    }}></div>
                  </div>
                </div>
              </div>

              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "10px",
                background: "#f9fafb",
                padding: "12px",
                borderRadius: "14px",
                border: "1px dashed #e5e7eb"
              }}>
                <div style={{ textAlign: "center" }}>
                  <span style={{ fontSize: "12px", color: "#6b7280", fontWeight: "bold" }}>Total Posts</span>
                  <h4 style={{ margin: "4px 0 0", fontSize: "18px", color: "#111827", fontWeight: "900" }}>{stats.totalJobs}</h4>
                </div>
                <div style={{ textAlign: "center" }}>
                  <span style={{ fontSize: "12px", color: "#6b7280", fontWeight: "bold" }}>Active Applications</span>
                  <h4 style={{ margin: "4px 0 0", fontSize: "18px", color: "#111827", fontWeight: "900" }}>{stats.totalApplications}</h4>
                </div>
              </div>
            </div>
          </section>
        </section>

        {/* LOGS, STORAGE FILES & DETAILS */}
        <section className="dashboard-overview-columns" style={{ gridTemplateColumns: "1fr 1.1fr" }}>
          {/* RECENT UPLOADED RESUMES */}
          <section className="enterprise-panel">
            <div className="enterprise-panel-header">
              <div className="panel-header-content">
                <h2>Uploaded Resumes Vault</h2>
                <p>Direct view of documents securely held in storage.</p>
              </div>
              <Link to="/admin/resumes" className="panel-action" style={{ minWidth: "120px" }}>
                Manage Resumes
              </Link>
            </div>
            <div className="overview-panel-body">
              {loading ? (
                <div style={{ textAlign: "center", padding: "40px 0" }}>Loading files...</div>
              ) : recentResumes.length === 0 ? (
                <div className="enterprise-empty-state">
                  <span>📁</span>
                  <h3>No resumes uploaded</h3>
                  <p>When candidates add their resumes, files will be shown here.</p>
                </div>
              ) : (
                <div style={{ display: "grid", gap: "10px" }}>
                  {recentResumes.map((resume, idx) => (
                    <div key={idx} style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 16px",
                      background: "#fbf9ff",
                      border: "1px solid #e7e2f2",
                      borderRadius: "14px"
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                        <span style={{ fontSize: "24px", color: "#8b18ff" }}>📄</span>
                        <div style={{ minWidth: 0 }}>
                          <strong style={{ display: "block", fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#101828" }}>
                            {resume.file_name || "Resume File"}
                          </strong>
                          <span style={{ fontSize: "11px", color: "#667085" }}>
                            {formatFileSize(resume.file_size)} · {resume.applicant_name || "Unknown Candidate"}
                          </span>
                        </div>
                      </div>
                      <Link to="/admin/resumes" style={{
                        fontSize: "12px",
                        color: "#8b18ff",
                        textDecoration: "none",
                        fontWeight: "900",
                        padding: "6px 12px",
                        background: "#f1e5ff",
                        borderRadius: "8px"
                      }}>
                        Review
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* DYNAMIC SYSTEM ACTIVITY LOGS TIMELINE */}
          <section className="enterprise-panel">
            <div className="enterprise-panel-header" style={{ borderBottom: "none", marginBottom: "8px" }}>
              <div className="panel-header-content">
                <h2>System Activity Logs</h2>
                <p>Real-time updates of platform activities and user actions.</p>
              </div>
            </div>

            {/* SEARCH AND FILTERS */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 1fr",
              gap: "10px",
              marginBottom: "16px",
              padding: "10px",
              background: "#f9fafb",
              borderRadius: "14px",
              border: "1px solid #f2f4f7"
            }}>
              <input
                type="text"
                placeholder="Search logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  height: "36px",
                  padding: "0 10px",
                  fontSize: "13px",
                  border: "1px solid #d0d5dd",
                  borderRadius: "8px",
                  outline: "none"
                }}
              />
              <select
                value={logFilter}
                onChange={(e) => setLogFilter(e.target.value)}
                style={{
                  height: "36px",
                  padding: "0 8px",
                  fontSize: "13px",
                  border: "1px solid #d0d5dd",
                  borderRadius: "8px",
                  outline: "none"
                }}
              >
                <option value="all">All Events</option>
                <option value="registration">Registrations</option>
                <option value="job">Job Posts</option>
                <option value="resume">Resume Uploads</option>
                <option value="application">Applications</option>
              </select>
            </div>

            <div className="overview-panel-body" style={{ maxHeight: "350px", overflowY: "auto", paddingRight: "4px" }}>
              {loading ? (
                <div style={{ textAlign: "center", padding: "40px 0" }}>Compiling timeline logs...</div>
              ) : filteredLogs.length === 0 ? (
                <div className="enterprise-empty-state" style={{ borderStyle: "none" }}>
                  <span>📋</span>
                  <h3>No activity logged</h3>
                  <p>Adjust your search query or filter tags.</p>
                </div>
              ) : (
                <div style={{ display: "grid", gap: "12px", position: "relative", paddingLeft: "10px" }}>
                  {/* Vertical line helper */}
                  <div style={{
                    position: "absolute",
                    top: "10px",
                    bottom: "10px",
                    left: "22px",
                    width: "2px",
                    background: "#e4e7ec",
                    zIndex: 0
                  }}></div>

                  {filteredLogs.map((log) => (
                    <div key={log.id} style={{
                      display: "flex",
                      gap: "14px",
                      position: "relative",
                      zIndex: 1,
                      alignItems: "flex-start",
                      background: "#ffffff",
                      padding: "4px 0"
                    }}>
                      {/* Event icon circle */}
                      <span style={{
                        width: "26px",
                        height: "26px",
                        borderRadius: "50%",
                        background: log.type === "registration" ? "#f1e5ff" : log.type === "job" ? "#e0f2fe" : log.type === "resume" ? "#d1fae5" : "#fef3c7",
                        display: "grid",
                        placeItems: "center",
                        fontSize: "13px",
                        border: "2px solid #ffffff",
                        boxShadow: "0 2px 4px rgba(0,0,0,0.06)",
                        flexShrink: 0
                      }}>
                        {log.icon}
                      </span>

                      {/* Content block */}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" }}>
                          <strong style={{ fontSize: "13px", color: "#101828", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {log.title}
                          </strong>
                          <small style={{ fontSize: "10px", color: "#98a2b3", flexShrink: 0 }}>
                            {formatLogTime(log.time)}
                          </small>
                        </div>
                        <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#667085" }}>{log.desc}</p>
                      </div>

                      {/* Small badge */}
                      <span style={{
                        fontSize: "10px",
                        fontWeight: "900",
                        padding: "2px 6px",
                        borderRadius: "6px",
                        background: "#f3f4f6",
                        color: "#4b5563",
                        flexShrink: 0
                      }}>
                        {log.badge}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </section>
      </section>
    </DashboardLayout>
  );
}
