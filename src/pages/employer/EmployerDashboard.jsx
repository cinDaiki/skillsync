import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { supabase } from "../../services/supabase";
import { getNotifications, markAsRead, markAllAsRead, clearAllNotifications } from "../../services/notificationService";
import "./EmployerDashboard.css";

export default function EmployerDashboard() {
  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [showBell, setShowBell] = useState(false);
  const [userId, setUserId] = useState(null);
  const [employerProfile, setEmployerProfile] = useState(null);
  const [activityLogs, setActivityLogs] = useState([]);
  const [recommendedCandidates, setRecommendedCandidates] = useState([]);

  useEffect(() => { loadDashboardData(); }, []);

  async function loadDashboardData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    // Profile for verification status
    const { data: prof } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    setEmployerProfile(prof);

    // Jobs
    const { data: jobsData } = await supabase
      .from("jobs").select("*")
      .eq("employer_id", user.id)
      .order("created_at", { ascending: false });
    const myJobs = jobsData || [];
    setJobs(myJobs);

    // Applications for those jobs
    let enrichedApps = [];
    if (myJobs.length > 0) {
      const jobIds = myJobs.map(j => j.id);
      const { data: appsData } = await supabase
        .from("applications").select("*")
        .in("job_id", jobIds)
        .order("created_at", { ascending: false });

      const apps = appsData || [];
      const applicantIds = [...new Set(apps.map(a => a.applicant_id).filter(Boolean))];

      let profileMap = {};
      if (applicantIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles").select("id,full_name,email,skills")
          .in("id", applicantIds);
        (profilesData || []).forEach(p => { profileMap[p.id] = p; });
      }

      const jobMap = Object.fromEntries(myJobs.map(j => [j.id, j]));
      enrichedApps = apps.map(app => ({
        ...app,
        profiles: profileMap[app.applicant_id] || null,
        jobs: jobMap[app.job_id] || null,
      }));
      setApplications(enrichedApps);

      // Build activity feed from recent applications
      const logs = enrichedApps.slice(0, 5).map(app => ({
        id: app.id,
        icon: "✉️",
        title: `${app.profiles?.full_name || "Someone"} applied`,
        desc: `Applied for ${app.jobs?.title || "a job"} · ${new Date(app.created_at).toLocaleDateString()}`,
      }));
      setActivityLogs(logs);
    }

    // Notifications
    const { data: notifData } = await getNotifications(user.id);
    setNotifications(notifData || []);

    // Fetch Recommended Candidates from job_matches (via employer's job IDs)
    // job_matches has no employer_id — we filter by the employer's job IDs
    if (myJobs.length > 0) {
      const employerJobIds = myJobs.map(j => j.id);
      const { data: matchData } = await supabase
        .from("job_matches")
        .select("*, jobs!inner(title, id)")
        .in("job_id", employerJobIds)
        .gte("match_score", 50)
        .order("match_score", { ascending: false })
        .limit(10);

      if (matchData && matchData.length > 0) {
        const candidateUserIds = [...new Set(matchData.map(m => m.user_id).filter(Boolean))];
        let candProfileMap = {};
        if (candidateUserIds.length > 0) {
          const { data: cData } = await supabase
            .from("profiles")
            .select("id,full_name,profile_picture_url")
            .in("id", candidateUserIds);
          (cData || []).forEach(p => { candProfileMap[p.id] = p; });
        }

        const enrichedMatches = matchData.map(m => ({
          ...m,
          profile: candProfileMap[m.user_id] || { full_name: "Unknown Candidate" },
          jobTitle: m.jobs?.title || "Job"
        }));
        setRecommendedCandidates(enrichedMatches);
      }     // end if (matchData && matchData.length > 0)
    }       // end if (myJobs.length > 0)
  }         // end loadDashboardData

  async function handleNotifClick(notifId) {
    await markAsRead(notifId);
    setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, is_read: true } : n));
  }
  async function handleMarkAllRead() {
    if (!userId) return;
    await markAllAsRead(userId);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  }
  async function handleClearAllNotifs() {
    if (!userId) return;
    await clearAllNotifications(userId);
    setNotifications([]);
    setShowBell(false);
  }

  // Derived stats
  const openJobs          = jobs.filter(j => j.status === "open");
  const pendingReviewJobs = jobs.filter(j => j.status === "pending_review");
  const rejectedJobs      = jobs.filter(j => j.status === "rejected");
  const suspendedJobs     = jobs.filter(j => j.status === "suspended");
  const closedJobs        = jobs.filter(j => j.status === "closed");

  const shortlisted     = applications.filter(a => a.status === "shortlisted");
  const interviews      = applications.filter(a => String(a.status||"").toLowerCase().includes("interview"));
  const hired           = applications.filter(a => ["hired","accepted"].includes(String(a.status||"").toLowerCase()));
  const pending         = applications.filter(a => ["applied","pending","submitted"].includes(String(a.status||"").toLowerCase()));
  const unread          = notifications.filter(n => !n.is_read).length;

  const isVerifiedEmployer = employerProfile?.verification_status === "Approved" || employerProfile?.verification_status === "Verified";

  // Donut chart: pipeline distribution
  const total = applications.length || 1; // avoid /0
  const segments = [
    { label: "Pending",     count: pending.length,     color: "#8b18ff" },
    { label: "Shortlisted", count: shortlisted.length, color: "#10b981" },
    { label: "Interview",   count: interviews.length,  color: "#f59e0b" },
    { label: "Hired",       count: hired.length,       color: "#f13093" },
  ];
  let cumulativeOffset = 0;
  const CIRC = 2 * Math.PI * 40; // r=40

  // Bar chart: applications per job (top 5 jobs by applicant count)
  const jobAppCounts = jobs.slice(0, 6).map(job => ({
    label: (job.title || "Job").substring(0, 8),
    count: applications.filter(a => a.job_id === job.id).length,
  }));
  const maxCount = Math.max(...jobAppCounts.map(j => j.count), 1);

  return (
    <DashboardLayout
      role="employer"
      title="Recruiter Dashboard"
      subtitle="Monitor hiring pipelines, applicant analytics, and job performance."
    >
      {/* Topbar actions */}
      <div className="recruiter-topbar-actions">
        <Link to="/employer/post-job" className="recruiter-action-btn">＋ Post New Job</Link>
        <Link to="/employer/applicants" className="recruiter-action-btn">👥 Applicants Desk</Link>
        <Link to="/employer/interviews" className="recruiter-action-btn">📅 Interview Center</Link>
        <Link to="/employer/hiring-pipeline" className="recruiter-action-btn">🗂️ Hiring Pipeline</Link>

        <div className="recruiter-bell-container">
          <button type="button" className="recruiter-bell-btn" onClick={() => setShowBell(!showBell)}>
            🔔
            {unread > 0 && <span className="recruiter-bell-badge">{unread}</span>}
          </button>

          {showBell && (
            <div className="recruiter-notif-dropdown">
              <div className="recruiter-notif-header">
                <h3>Inbox Notifications</h3>
                {notifications.length > 0 && (
                  <button type="button" className="recruiter-notif-clear" onClick={handleMarkAllRead}>Mark all read</button>
                )}
              </div>
              <div className="recruiter-notif-list">
                {notifications.length > 0 ? notifications.map(n => (
                  <div key={n.id} className={`recruiter-notif-item ${!n.is_read ? "unread" : ""}`} onClick={() => handleNotifClick(n.id)}>
                    <span className="recruiter-notif-icon">
                      {n.type === "job_match" ? "🧠" : n.type === "application_update" ? "✉️" : "📢"}
                    </span>
                    <div className="recruiter-notif-info">
                      <h4>{n.title}</h4>
                      <p>{n.message}</p>
                    </div>
                  </div>
                )) : (
                  <div className="recruiter-notif-empty">No notifications yet.</div>
                )}
              </div>
              {notifications.length > 0 && (
                <div style={{ padding: "8px 14px", borderTop: "1px solid #f1f5f9", textAlign: "right" }}>
                  <button type="button" className="recruiter-notif-clear" style={{ color: "#dc2626" }} onClick={handleClearAll}>Clear All</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── EMPLOYER VERIFICATION STATUS BANNER ── */}
      <div style={{ margin: "0 0 20px 0", padding: "16px 20px", background: isVerifiedEmployer ? "#f0fdf4" : employerProfile?.verification_status === "Rejected" ? "#fef2f2" : employerProfile?.verification_status === "Suspended" ? "#450a0a" : "#fffbeb", border: isVerifiedEmployer ? "1px solid #bbf7d0" : employerProfile?.verification_status === "Rejected" ? "1px solid #fca5a5" : employerProfile?.verification_status === "Suspended" ? "1px solid #991b1b" : "1px solid #fde68a", borderRadius: "12px", color: employerProfile?.verification_status === "Suspended" ? "#fff" : "#1e293b", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <span style={{ fontSize: "20px" }}>
              {isVerifiedEmployer ? "🛡️" : employerProfile?.verification_status === "Rejected" ? "❌" : employerProfile?.verification_status === "Suspended" ? "🚫" : "⏳"}
            </span>
            <strong style={{ fontSize: "16px", color: isVerifiedEmployer ? "#166534" : employerProfile?.verification_status === "Suspended" ? "#fff" : "#92400e" }}>
              {isVerifiedEmployer ? "✓ Verified Employer Account" : employerProfile?.verification_status === "Rejected" ? "Verification Status: Rejected" : employerProfile?.verification_status === "Suspended" ? "Account Suspended" : "Verification Status: Pending Administrator Review"}
            </strong>
          </div>
          <p style={{ margin: 0, fontSize: "13px", lineHeight: "1.4" }}>
            {isVerifiedEmployer ? (
              <>Your business identity has been verified. You may create and manage job postings.</>
            ) : employerProfile?.verification_status === "Rejected" ? (
              <>Reason: {employerProfile?.verification_reason || "Verification documents did not meet guidelines."} Please update your verification documents in Company Profile.</>
            ) : employerProfile?.verification_status === "Suspended" ? (
              <>Reason: {employerProfile?.verification_reason || "Account suspended due to policy violation."} Posting privileges are disabled.</>
            ) : (
              <>Your account is awaiting administrator review. You cannot publish jobs until approved.</>
            )}
          </p>
        </div>

        {!isVerifiedEmployer && (
          <Link to="/employer/company-profile" style={{ background: "#58158f", color: "#fff", padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: "700", textDecoration: "none" }}>
            View Verification Profile →
          </Link>
        )}
      </div>

      {/* Stats grid — 7 cards */}
      <div className="enterprise-stats-grid">
        <div className="enterprise-stat-card">
          <div className="enterprise-stat-icon purple">▣</div>
          <div className="enterprise-stat-info">
            <h3>{jobs.length}</h3>
            <p>Total Job Posts</p>
          </div>
        </div>
        <div className="enterprise-stat-card">
          <div className="enterprise-stat-icon blue">◎</div>
          <div className="enterprise-stat-info">
            <h3>{openJobs.length}</h3>
            <p>Active Open Jobs</p>
          </div>
        </div>
        <div className="enterprise-stat-card">
          <div className="enterprise-stat-icon orange">⏳</div>
          <div className="enterprise-stat-info">
            <h3>{pendingReviewJobs.length}</h3>
            <p>Pending Review</p>
          </div>
        </div>
        <div className="enterprise-stat-card">
          <div className="enterprise-stat-icon orange">⭐</div>
          <div className="enterprise-stat-info">
            <h3>{shortlisted.length}</h3>
            <p>Shortlisted</p>
          </div>
        </div>
        <div className="enterprise-stat-card">
          <div className="enterprise-stat-icon green">📅</div>
          <div className="enterprise-stat-info">
            <h3>{interviews.length}</h3>
            <p>Interviews Scheduled</p>
          </div>
        </div>
        <div className="enterprise-stat-card">
          <div className="enterprise-stat-icon pink">✅</div>
          <div className="enterprise-stat-info">
            <h3>{hired.length}</h3>
            <p>Hired</p>
          </div>
        </div>
        <div className="enterprise-stat-card">
          <div className="enterprise-stat-icon red">⏳</div>
          <div className="enterprise-stat-info">
            <h3>{pending.length}</h3>
            <p>Pending Review</p>
          </div>
        </div>
      </div>

      {/* Analytics columns */}
      <div className="recruiter-analytics-columns">
        {/* Hiring Funnel */}
        <div className="enterprise-panel">
          <div className="enterprise-panel-header">
            <h2>Hiring Funnel</h2>
          </div>
          <div className="funnel-chart-container" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '20px 10px', alignItems: 'center', width: '100%' }}>
            {applications.length === 0 ? (
              <p style={{ color: "#94a3b8", fontSize: "13px" }}>No applications yet.</p>
            ) : (
              segments.map((seg, i) => {
                // Calculate width percentage based on stage to simulate a funnel shape
                const widthPct = Math.max(20, 100 - (i * 20)); 
                return (
                  <div key={seg.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                    <div style={{
                      background: seg.color, 
                      height: '32px', 
                      width: `${widthPct}%`, 
                      borderRadius: '4px', 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      padding: '0 12px',
                      color: 'white', 
                      fontSize: '12px', 
                      fontWeight: 'bold',
                      transition: 'width 0.5s ease'
                    }}>
                      <span>{seg.label}</span>
                      <span>{seg.count}</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Bar chart: applications per job */}
        <div className="enterprise-panel">
          <div className="enterprise-panel-header">
            <h2>Applications per Job</h2>
          </div>
          {jobs.length === 0 ? (
            <p style={{ color: "#94a3b8", fontSize: "13px", textAlign: "center", padding: "30px" }}>Post a job to see analytics.</p>
          ) : (
            <div className="bar-chart-wrap">
              {jobAppCounts.map((item, i) => (
                <div className="bar-chart-bar-group" key={i}>
                  <div
                    className="bar-chart-bar"
                    style={{ height: `${Math.max(4, (item.count / maxCount) * 100)}px` }}
                    title={`${item.count} applicants`}
                  ></div>
                  <span className="bar-chart-bar-label">{item.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom columns: activity + recent applicants */}
      <div className="recruiter-analytics-columns">
        {/* Activity feed */}
        <div className="enterprise-panel">
          <div className="enterprise-panel-header">
            <h2>Recent Hiring Activity</h2>
          </div>
          {activityLogs.length === 0 ? (
            <p style={{ color: "#94a3b8", fontSize: "13px", textAlign: "center", padding: "24px" }}>No activity yet.</p>
          ) : (
            <div className="recruiter-activity-feed">
              {activityLogs.map(log => (
                <div className="recruiter-activity-item" key={log.id}>
                  <div className="recruiter-activity-dot">{log.icon}</div>
                  <div className="recruiter-activity-content">
                    <h4>{log.title}</h4>
                    <p>{log.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recommended Candidates Tiers */}
        <div className="enterprise-panel" style={{ gridColumn: "1 / -1" }}>
          <div className="enterprise-panel-header">
            <h2>Recommended Candidates</h2>
            <Link to="/employer/applicants" style={{ fontSize: "12px", color: "#8b18ff", fontWeight: "800", textDecoration: "none" }}>View All →</Link>
          </div>
          {recommendedCandidates.length === 0 ? (
            <div className="enterprise-empty-state">
              <span>🧠</span><h3>No matches found yet</h3>
              <p>When candidates match your job requirements, they will appear here.</p>
            </div>
          ) : (
            <div className="recommended-candidates-tiers">
              
              {/* Strong Matches (90-100%) */}
              {recommendedCandidates.filter(c => c.match_score >= 90).length > 0 && (
                <div className="tier-section">
                  <h3 className="tier-title" style={{ color: "#16a34a", padding: "10px 16px", borderBottom: "2px solid #16a34a", marginBottom: "16px" }}>🔥 Strong Matches (90-100%)</h3>
                  <div className="overview-list" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px", padding: "0 16px 16px" }}>
                    {recommendedCandidates.filter(c => c.match_score >= 90).map(cand => (
                      <article className="overview-list-card" key={cand.id} style={{ display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-start", padding: "16px", border: "1px solid #dcfce7", background: "#f0fdf4" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                          <h3 style={{ fontSize: "15px", margin: 0, color: "#166534" }}>{cand.profile.full_name}</h3>
                          <span style={{ fontWeight: "bold", color: "#16a34a" }}>{cand.match_score}% Match</span>
                        </div>
                        <p style={{ margin: 0, fontSize: "13px", color: "#475569" }}>For <strong>{cand.jobTitle}</strong></p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                          {(cand.matching_skills || []).slice(0,3).map(skill => (
                            <span key={skill} style={{ fontSize: "11px", background: "#dcfce7", color: "#166534", padding: "2px 6px", borderRadius: "4px" }}>✓ {skill}</span>
                          ))}
                          {(cand.missing_skills || []).slice(0,2).map(skill => (
                            <span key={skill} style={{ fontSize: "11px", background: "#fee2e2", color: "#991b1b", padding: "2px 6px", borderRadius: "4px" }}>✗ {skill}</span>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              )}

              {/* Good Matches (70-89%) */}
              {recommendedCandidates.filter(c => c.match_score >= 70 && c.match_score < 90).length > 0 && (
                <div className="tier-section">
                  <h3 className="tier-title" style={{ color: "#2563eb", padding: "10px 16px", borderBottom: "2px solid #2563eb", marginBottom: "16px" }}>✨ Good Matches (70-89%)</h3>
                  <div className="overview-list" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px", padding: "0 16px 16px" }}>
                    {recommendedCandidates.filter(c => c.match_score >= 70 && c.match_score < 90).map(cand => (
                      <article className="overview-list-card" key={cand.id} style={{ display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-start", padding: "16px", border: "1px solid #dbeafe", background: "#eff6ff" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                          <h3 style={{ fontSize: "15px", margin: 0, color: "#1e40af" }}>{cand.profile.full_name}</h3>
                          <span style={{ fontWeight: "bold", color: "#2563eb" }}>{cand.match_score}% Match</span>
                        </div>
                        <p style={{ margin: 0, fontSize: "13px", color: "#475569" }}>For <strong>{cand.jobTitle}</strong></p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                          {(cand.matching_skills || []).slice(0,3).map(skill => (
                            <span key={skill} style={{ fontSize: "11px", background: "#dbeafe", color: "#1e40af", padding: "2px 6px", borderRadius: "4px" }}>✓ {skill}</span>
                          ))}
                          {(cand.missing_skills || []).slice(0,2).map(skill => (
                            <span key={skill} style={{ fontSize: "11px", background: "#fee2e2", color: "#991b1b", padding: "2px 6px", borderRadius: "4px" }}>✗ {skill}</span>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              )}

              {/* Potential Matches (50-69%) */}
              {recommendedCandidates.filter(c => c.match_score >= 50 && c.match_score < 70).length > 0 && (
                <div className="tier-section">
                  <h3 className="tier-title" style={{ color: "#d97706", padding: "10px 16px", borderBottom: "2px solid #d97706", marginBottom: "16px" }}>⚡ Potential Matches (50-69%)</h3>
                  <div className="overview-list" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px", padding: "0 16px 16px" }}>
                    {recommendedCandidates.filter(c => c.match_score >= 50 && c.match_score < 70).map(cand => (
                      <article className="overview-list-card" key={cand.id} style={{ display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-start", padding: "16px", border: "1px solid #fef3c7", background: "#fffbeb" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                          <h3 style={{ fontSize: "15px", margin: 0, color: "#92400e" }}>{cand.profile.full_name}</h3>
                          <span style={{ fontWeight: "bold", color: "#d97706" }}>{cand.match_score}% Match</span>
                        </div>
                        <p style={{ margin: 0, fontSize: "13px", color: "#475569" }}>For <strong>{cand.jobTitle}</strong></p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                          {(cand.matching_skills || []).slice(0,2).map(skill => (
                            <span key={skill} style={{ fontSize: "11px", background: "#fef3c7", color: "#92400e", padding: "2px 6px", borderRadius: "4px" }}>✓ {skill}</span>
                          ))}
                          {(cand.missing_skills || []).slice(0,3).map(skill => (
                            <span key={skill} style={{ fontSize: "11px", background: "#fee2e2", color: "#991b1b", padding: "2px 6px", borderRadius: "4px" }}>✗ {skill}</span>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}