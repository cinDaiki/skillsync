import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import ConfirmDialog from "../ui/ConfirmDialog";
import { signOut } from "../../services/authService";
import { useAuthAction } from "../../context/AuthActionContext";

const sidebarLinks = {
  admin: [
    { label: "Dashboard", icon: "⌂", path: "/admin/dashboard" },
    { section: "MANAGEMENT" },
    { label: "Employers", icon: "🏢", path: "/admin/employers" },
    { label: "Jobs", icon: "💼", path: "/admin/jobs" },
    { label: "Applications", icon: "📋", path: "/admin/applications" },
    { label: "Jobseekers", icon: "👤", path: "/admin/jobseekers" },
    { label: "Users", icon: "👥", path: "/admin/users" },
    { section: "MODERATION" },
    { label: "Suspended Accounts", icon: "🚫", path: "/admin/suspended-accounts" },
    { label: "Suspension Appeals", icon: "⚖️", path: "/admin/suspension-appeals" },
    { label: "Audit Logs", icon: "📜", path: "/admin/audit-logs" },
    { section: "ACCOUNT" },
    { label: "My Profile", icon: "👤", path: "/admin/profile" },
  ],

  candidate: [
    { label: "Dashboard",       icon: "⌂",  path: "/candidate/dashboard"   },
    { label: "My Resume",       icon: "📄", path: "/candidate/resume"      },
    { label: "Job Marketplace", icon: "💼", path: "/candidate/jobs"        },
    { label: "My Applications", icon: "📋", path: "/candidate/applications"},
    { label: "Profile",         icon: "👤", path: "/candidate/profile"     },
  ],

  employer: [
    { label: "Dashboard", icon: "⌂", path: "/employer/dashboard" },
    { label: "Manage Jobs", icon: "💼", path: "/employer/jobs" },
    { label: "Post Job", icon: "＋", path: "/employer/post-job" },
    { label: "Applicants", icon: "👥", path: "/employer/applicants" },
    { label: "Interviews", icon: "📅", path: "/employer/interviews" },
    { label: "Hiring Decisions", icon: "⚖️", path: "/employer/hiring-decisions" },
    { label: "Hiring Records", icon: "📜", path: "/employer/hiring-records" },
    { label: "Company Profile", icon: "🏢", path: "/employer/company" },
  ],
};

export default function Sidebar({ role }) {
  const navigate = useNavigate();
  const { executeLogout } = useAuthAction();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const links = sidebarLinks[role] || sidebarLinks.candidate;

  const roleLabel =
    role === "admin" ? "Admin" : role === "employer" ? "Employer" : "Job Seeker";

  const roleSubtitle =
    role === "admin"
      ? "Control Panel"
      : role === "employer"
      ? "Hiring Workspace"
      : "Career Workspace";

  async function handleLogout() {
    setLoggingOut(true);
    setShowLogoutConfirm(false);
    try {
      await executeLogout(signOut, "/");
    } finally {
      setLoggingOut(false);
    }
  }

  const workspaceLabel =
    role === "admin"
      ? "admin panel"
      : role === "employer"
      ? "employer workspace"
      : "career workspace";

  return (
    <aside className="dashboard-sidebar">
      <NavLink 
        to={role === "admin" ? "/admin/dashboard" : role === "employer" ? "/employer/dashboard" : "/candidate/dashboard"} 
        className="dashboard-logo"
      >
        <span className="dashboard-logo-icon">✓</span>
        <span>
          <strong>SkillSync</strong>
          <small>Find the right match</small>
        </span>
      </NavLink>

      <div className="sidebar-role-card">
        <span>{roleLabel}</span>
        <strong>{roleSubtitle}</strong>
      </div>

      <nav className="sidebar-nav">
        {links.map((link) => {
          if (link.section) {
            return (
              <div
                key={link.section}
                className="sidebar-section-header"
                style={{
                  fontSize: "11px",
                  fontWeight: "800",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "rgba(255, 255, 255, 0.55)",
                  padding: "10px 14px 2px",
                  margin: "4px 0 0",
                  gridColumn: "1 / -1",
                }}
              >
                {link.section}
              </div>
            );
          }

          return (
            <NavLink
              key={link.label}
              to={link.path}
              className={({ isActive }) =>
                isActive ? "sidebar-link active" : "sidebar-link"
              }
            >
              <span>{link.icon}</span>
              {link.label}
            </NavLink>
          );
        })}
      </nav>

      <button
        type="button"
        className="sidebar-logout"
        onClick={() => setShowLogoutConfirm(true)}
      >
        Logout
      </button>

      <ConfirmDialog
        open={showLogoutConfirm}
        title="Log out?"
        message={`You will leave your ${workspaceLabel} and need to sign in again to continue.`}
        confirmLabel="Log out"
        cancelLabel="Stay signed in"
        variant="danger"
        loading={loggingOut}
        onCancel={() => !loggingOut && setShowLogoutConfirm(false)}
        onConfirm={handleLogout}
      />
    </aside>
  );
}