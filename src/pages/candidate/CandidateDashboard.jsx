import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { supabase } from "../../services/supabase";
import { 
  getNotifications, 
  markAsRead, 
  markAllAsRead, 
  clearAllNotifications 
} from "../../services/notificationService";
import { fetchSuspendedEmployerIds, filterAvailableJobs } from "../../services/jobAvailability";
import "./CandidateDashboard.css";

export default function CandidateDashboard() {
  const [resume, setResume] = useState(null);
  const [profile, setProfile] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  
  // Notifications states
  const [notifications, setNotifications] = useState([]);
  const [showBellDropdown, setShowBellDropdown] = useState(false);
  const [userId, setUserId] = useState(null);

  // Activity feed logs
  const [activityLogs, setActivityLogs] = useState([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    // 1. Fetch Profile
    const { data: profileData } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    setProfile(profileData);

    // 2. Fetch Resume
    const { data: resumeData } = await supabase
      .from("resumes")
      .select("*")
      .eq("applicant_id", user.id)
      .maybeSingle();
    setResume(resumeData);

    // 3. Fetch Jobs
    const { data: jobsData } = await supabase
      .from("jobs")
      .select("*")
      .eq("status", "open");
    const rawJobs = jobsData || [];
    const employerIds = rawJobs.map((j) => j.employer_id).filter(Boolean);
    const suspendedSet = await fetchSuspendedEmployerIds(supabase, employerIds);
    const availableJobs = filterAvailableJobs(rawJobs, suspendedSet);
    setJobs(availableJobs);

    // 4. Fetch Applications
    const { data: appsData, error: appsError } = await supabase
      .from("applications")
      .select("*")
      .eq("applicant_id", user.id);

    let enriched = [];
    if (!appsError && appsData) {
      const apps = appsData;
      const jobIds = [...new Set(apps.map(a => a.job_id).filter(Boolean))];

      let jobMap = {};
      if (jobIds.length > 0) {
        const { data: jobsData } = await supabase
          .from("jobs")
          .select("id, title, employment_type, location")
          .in("id", jobIds);
        (jobsData || []).forEach(j => { jobMap[j.id] = j; });
      }

      enriched = apps.map(app => ({
        ...app,
        jobs: jobMap[app.job_id] || null,
      }));
      setApplications(enriched);
    }

    // 5. Fetch Real-time DB Notifications
    const { data: notifies } = await getNotifications(user.id);
    setNotifications(notifies || []);

    // 6. Generate recent activities based on profile uploads and applications
    const logs = [];
    if (resumeData) {
      logs.push({
        id: "log-1",
        title: "Resume updated & parsed",
        time: new Date(resumeData.created_at || Date.now()).toLocaleDateString(),
        icon: "📄"
      });
    }
    if (enriched.length > 0) {
      enriched.slice(0, 3).forEach((app, idx) => {
        logs.push({
          id: `log-app-${idx}`,
          title: `Applied for ${app.jobs?.title || "Job opening"}`,
          time: new Date(app.created_at || Date.now()).toLocaleDateString(),
          icon: "✉️"
        });
      });
    }
    if (profileData?.skills) {
      logs.push({
        id: "log-skills",
        title: "Updated professional skill tags",
        time: "Recently",
        icon: "⚙️"
      });
    }
    setActivityLogs(logs.slice(0, 4));
  }

  // Manage Notification clicks
  async function handleNotificationClick(id) {
    await markAsRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  }

  async function handleMarkAllNotificationsRead() {
    if (!userId) return;
    await markAllAsRead(userId);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  }

  async function handleClearNotifications() {
    if (!userId) return;
    await clearAllNotifications(userId);
    setNotifications([]);
  }

  function getStatusClass(status) {
    const s = String(status || "").toLowerCase();
    if (s === "accepted" || s === "hired" || s === "offer") return "accepted";
    if (s === "rejected" || s === "closed") return "rejected";
    if (s.includes("interview") || s === "shortlisted") return "pending";
    return "submitted";
  }

  function getProfileCompletenessText() {
    if (!profile) return "0% Complete";
    let score = 10;
    if (profile.full_name) score += 10;
    if (profile.contact_number) score += 10;
    if (profile.address) score += 10;
    if (profile.skills) score += 20;
    
    const exp = typeof profile.work_experience === "string" ? JSON.parse(profile.work_experience || "[]") : (profile.work_experience || []);
    const edu = typeof profile.education === "string" ? JSON.parse(profile.education || "[]") : (profile.education || []);
    if (exp.length > 0) score += 10;
    if (edu.length > 0) score += 10;
    
    if (profile.verification_status === "Verified") score += 20;
    else if (profile.id_image_url && profile.selfie_image_url) score += 10;
    
    return `${Math.min(100, score)}%`;
  }

  // Applications Status Distribution for SVG Donut Chart
  const totalApps = applications.length;
  const submittedCount = applications.filter(a => ["applied", "submitted"].includes(String(a.status || "").toLowerCase())).length;
  const screeningCount = applications.filter(a => ["screening", "reviewed"].includes(String(a.status || "").toLowerCase())).length;
  const interviewCount = applications.filter(a => String(a.status || "").toLowerCase().includes("interview")).length;
  const offerCount = applications.filter(a => ["accepted", "hired", "offer"].includes(String(a.status || "").toLowerCase())).length;
  const rejectedCount = applications.filter(a => ["rejected", "closed"].includes(String(a.status || "").toLowerCase())).length;

  // Pie chart arc offsets calculation
  const dashSubmitted = totalApps > 0 ? (submittedCount / totalApps) * 100 : 0;
  const dashScreening = totalApps > 0 ? (screeningCount / totalApps) * 100 : 0;
  const dashInterview = totalApps > 0 ? (interviewCount / totalApps) * 100 : 0;
  const dashOffer = totalApps > 0 ? (offerCount / totalApps) * 100 : 0;
  const dashRejected = totalApps > 0 ? (rejectedCount / totalApps) * 100 : 0;

  // Map simulated upcoming interviews (when application status includes interview or shortlisted)
  const interviewApplications = applications.filter(a => 
    String(a.status || "").toLowerCase().includes("interview") || 
    String(a.status || "").toLowerCase() === "shortlisted"
  );

  const unreadNotificationsCount = notifications.filter(n => !n.is_read).length;
  const recentJobs = jobs.slice(0, 3);
  const recentApplications = applications.slice(0, 3);

  return (
    <DashboardLayout
      role="candidate"
      title="Candidate Dashboard"
      subtitle="Overview of your resume parsing quality, job alignment, and active pipeline tracker."
    >
      <div className="dashboard-toolbar">
        <div className="notification-bell-container">
          <button 
            type="button" 
            className="bell-btn" 
            onClick={() => setShowBellDropdown(!showBellDropdown)}
            title="System alerts"
          >
            🔔
            {unreadNotificationsCount > 0 && (
              <span className="bell-badge">{unreadNotificationsCount}</span>
            )}
          </button>

          {showBellDropdown && (
            <div className="notifications-dropdown">
              <div className="notifications-header">
                <h3>Inbox & Notifications</h3>
                {notifications.length > 0 && (
                  <button type="button" className="clear-all-btn" onClick={handleMarkAllNotificationsRead}>
                    Mark read
                  </button>
                )}
              </div>

              <div className="notifications-list">
                {notifications.length > 0 ? (
                  notifications.map((n) => (
                    <div 
                      key={n.id} 
                      className={`notification-item ${!n.is_read ? "unread" : ""}`}
                      onClick={() => handleNotificationClick(n.id)}
                    >
                      <div className="notification-icon-wrap">
                        {n.type === "job_match" ? "🧠" : n.type === "application_update" ? "✉️" : "📢"}
                      </div>
                      <div className="notification-info">
                        <h4>{n.title}</h4>
                        <p>{n.message}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="notifications-empty">No notifications alerts recorded.</div>
                )}
              </div>
              
              {notifications.length > 0 && (
                <div style={{ padding: "8px 16px", borderTop: "1px solid #f1f5f9", textAlign: "right" }}>
                  <button 
                    type="button" 
                    className="clear-all-btn" 
                    onClick={handleClearNotifications}
                    style={{ color: "#dc2626" }}
                  >
                    Clear All Alerts
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <section className="dashboard-grid">
        {/* Welcome Section */}
        <section className="dashboard-hero-card">
          <div>
            <span className="section-badge">Welcome back, Job Seeker</span>
            <h2>Prepare your profile for matching</h2>
            <p>
              Complete your profile builder setup and upload a PDF resume. The SkillSync matching engine calculates scores and suggests the best positions for your resume.
            </p>
            <div className="quick-actions-row">
              <Link to="/candidate/profile" className="quick-action-btn">🛠 Profile Builder</Link>
              <Link to="/candidate/resume" className="quick-action-btn">📄 Resume Parsing</Link>
              <Link to="/candidate/jobs" className="quick-action-btn">🔍 View Job Matches</Link>
            </div>
          </div>
          <div className="dashboard-hero-icon">🚀</div>
        </section>

        {/* Analytics counts grid */}
        <section className="enterprise-stats-grid">
          <article className="enterprise-stat-card">
            <div className="enterprise-stat-icon purple">📄</div>
            <div className="enterprise-stat-info">
              <h3>{resume ? (resume.resume_score || 70) : "0"}</h3>
              <p>Resume Score</p>
            </div>
          </article>

          <article className="enterprise-stat-card">
            <div className="enterprise-stat-icon blue">🧠</div>
            <div className="enterprise-stat-info">
              <h3>{jobs.length}</h3>
              <p>Job Match Feed</p>
            </div>
          </article>

          <article className="enterprise-stat-card">
            <div className="enterprise-stat-icon teal">✉️</div>
            <div className="enterprise-stat-info">
              <h3>{applications.length}</h3>
              <p>Applications Sent</p>
            </div>
          </article>

          <article className="enterprise-stat-card">
            <div className="enterprise-stat-icon orange">👤</div>
            <div className="enterprise-stat-info">
              <h3>{getProfileCompletenessText()}</h3>
              <p>Profile Completeness</p>
            </div>
          </article>

          <article className="enterprise-stat-card">
            <div className="enterprise-stat-icon" style={{ background: profile?.verification_status === 'Verified' ? '#dcfce7' : '#fef9c3', color: profile?.verification_status === 'Verified' ? '#166534' : '#854d0e' }}>🛡️</div>
            <div className="enterprise-stat-info">
              <h3 style={{ fontSize: '18px' }}>{profile?.verification_status === 'Verified' ? 'Verified' : 'Pending'}</h3>
              <p>Identity Verification</p>
            </div>
          </article>
        </section>

        {/* Dynamic charts and activity timelines split */}
        <section className="dashboard-overview-columns">
          {/* Donut Chart: Application Status */}
          <section className="enterprise-panel">
            <div className="enterprise-panel-header">
              <div className="panel-header-content">
                <h2>Application Status Flow</h2>
              </div>
            </div>

            <div className="overview-panel-body">
              {totalApps === 0 ? (
                <div className="enterprise-empty-state">
                  <span>📈</span>
                  <h3>No applications sent yet</h3>
                  <p>Send an application to a matched job to display visual chart analytics.</p>
                  <Link to="/candidate/jobs" className="panel-action" style={{ marginTop: "12px" }}>Browse Matches</Link>
                </div>
              ) : (
                <div>
                  <div className="chart-container">
                    <svg className="chart-svg" width="160" height="160" viewBox="0 0 100 100">
                      {/* Grey background ring */}
                      <circle cx="50" cy="50" r="40" fill="none" stroke="#f1f0f5" strokeWidth="12" />
                      
                      {/* Red/Yellow/Purple SVG Pie segments */}
                      {dashSubmitted > 0 && (
                        <circle 
                          cx="50" 
                          cy="50" 
                          r="40" 
                          fill="none" 
                          stroke="#58158f" 
                          strokeWidth="12" 
                          strokeDasharray={`${dashSubmitted} 100`}
                          strokeDashoffset="0"
                        />
                      )}
                      
                      {dashScreening > 0 && (
                        <circle 
                          cx="50" 
                          cy="50" 
                          r="40" 
                          fill="none" 
                          stroke="#8b18ff" 
                          strokeWidth="12" 
                          strokeDasharray={`${dashScreening} 100`}
                          strokeDashoffset={-dashSubmitted}
                        />
                      )}

                      {dashInterview > 0 && (
                        <circle 
                          cx="50" 
                          cy="50" 
                          r="40" 
                          fill="none" 
                          stroke="#10b981" 
                          strokeWidth="12" 
                          strokeDasharray={`${dashInterview} 100`}
                          strokeDashoffset={-(dashSubmitted + dashScreening)}
                        />
                      )}

                      {dashOffer > 0 && (
                        <circle 
                          cx="50" 
                          cy="50" 
                          r="40" 
                          fill="none" 
                          stroke="#f13093" 
                          strokeWidth="12" 
                          strokeDasharray={`${dashOffer} 100`}
                          strokeDashoffset={-(dashSubmitted + dashScreening + dashInterview)}
                        />
                      )}

                      {dashRejected > 0 && (
                        <circle 
                          cx="50" 
                          cy="50" 
                          r="40" 
                          fill="none" 
                          stroke="#dc2626" 
                          strokeWidth="12" 
                          strokeDasharray={`${dashRejected} 100`}
                          strokeDashoffset={-(dashSubmitted + dashScreening + dashInterview + dashOffer)}
                        />
                      )}
                    </svg>

                    <div className="chart-center-text">
                      <span className="chart-center-number">{totalApps}</span>
                      <span className="chart-center-label">Total</span>
                    </div>
                  </div>

                  {/* Legends */}
                  <div className="chart-legend">
                    <div className="legend-item">
                      <span className="legend-color-dot" style={{ backgroundColor: "#58158f" }}></span>
                      <span>Submitted ({submittedCount})</span>
                    </div>
                    <div className="legend-item">
                      <span className="legend-color-dot" style={{ backgroundColor: "#8b18ff" }}></span>
                      <span>Screening ({screeningCount})</span>
                    </div>
                    <div className="legend-item">
                      <span className="legend-color-dot" style={{ backgroundColor: "#10b981" }}></span>
                      <span>Interviewing ({interviewCount})</span>
                    </div>
                    <div className="legend-item">
                      <span className="legend-color-dot" style={{ backgroundColor: "#f13093" }}></span>
                      <span>Offers ({offerCount})</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Activity Timeline log */}
          <section className="enterprise-panel">
            <div className="enterprise-panel-header">
              <div className="panel-header-content">
                <h2>Recent Activity logs</h2>
              </div>
            </div>

            <div className="overview-panel-body" style={{ padding: "8px" }}>
              {activityLogs.length === 0 ? (
                <p style={{ color: "#667085", textAlign: "center", padding: "30px" }}>No recent logs detected.</p>
              ) : (
                <div className="activity-timeline">
                  {activityLogs.map((log) => (
                    <div className="activity-timeline-item" key={log.id}>
                      <div className="activity-node">{log.icon}</div>
                      <div className="activity-content">
                        <h4>{log.title}</h4>
                        <p>{log.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </section>

        {/* Interviews and Job Matches display row */}
        <section className="dashboard-overview-columns">
          {/* Upcoming Interview Events */}
          <section className="enterprise-panel">
            <div className="enterprise-panel-header">
              <div className="panel-header-content">
                <h2>Scheduled Interviews</h2>
              </div>
            </div>

            <div className="overview-panel-body">
              {interviewApplications.length === 0 ? (
                <div className="enterprise-empty-state">
                  <span>📅</span>
                  <h3>No interviews scheduled</h3>
                  <p>When an employer schedules a screening interview, details will list here.</p>
                </div>
              ) : (
                <div className="interview-schedule-list">
                  {interviewApplications.map((app, index) => (
                    <div className="interview-card-item" key={app.id || index}>
                      <div className="interview-time-box">
                        <strong>{24 + index}</strong>
                        <span>May</span>
                      </div>
                      <div className="interview-details">
                        <h4>{app.jobs?.title || "Screening Interview"}</h4>
                        <p>Platform: Google Meet Video Call</p>
                        <small style={{ color: "#9b24ff", fontWeight: "800" }}>Time: 10:00 AM PST</small>
                      </div>
                      <a 
                        href="https://meet.google.com" 
                        target="_blank" 
                        rel="noreferrer" 
                        className="join-link"
                      >
                        Join call
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Job Matches Feed preview */}
          <section className="enterprise-panel">
            <div className="enterprise-panel-header">
              <div className="panel-header-content">
                <h2>Recent Matches Feed</h2>
              </div>
              <Link to="/candidate/jobs" className="panel-action" style={{ fontSize: "12px", minHeight: "36px", padding: "0 14px" }}>
                Browse All
              </Link>
            </div>

            <div className="overview-panel-body">
              {recentJobs.length === 0 ? (
                <div className="enterprise-empty-state">
                  <span>◎</span>
                  <h3>No job matches feed</h3>
                  <p>Complete your profile to generate AI matches.</p>
                  <Link to="/candidate/profile" className="panel-action" style={{ marginTop: "12px" }}>Update Profile</Link>
                </div>
              ) : (
                <div className="overview-list">
                  {recentJobs.map((job) => (
                    <article className="overview-list-card" key={job.id}>
                      <div className="overview-list-card-content">
                        <h3>{job.title}</h3>
                        <p>{job.employment_type} • {job.location || "Remote"}</p>
                      </div>
                      <span className="overview-status open" style={{ background: "#f5ecff", color: "#58158f" }}>
                        Match Ready
                      </span>
                    </article>
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