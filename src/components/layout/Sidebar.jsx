import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import ConfirmDialog from "../ui/ConfirmDialog";
import { signOut } from "../../services/authService";

const sidebarLinks = {
  admin: [
    { label: "Dashboard", icon: "⌂", path: "/admin/dashboard" },
    { label: "Jobseekers", icon: "👤", path: "/admin/jobseekers" },
    { label: "Employers", icon: "🏢", path: "/admin/employers" },
    { label: "Manage Jobs", icon: "💼", path: "/admin/jobs" },
    { label: "Applications", icon: "📋", path: "/admin/applications" },
    { label: "Resume Vault", icon: "📁", path: "/admin/resumes" },
    { label: "Reports", icon: "⚙", path: "/admin/reports" },
    { label: "Audit Logs", icon: "📜", path: "/admin/audit-logs" },
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
    { label: "Manage Jobs", icon: "▣", path: "/employer/jobs" },
    { label: "Post Job", icon: "＋", path: "/employer/post-job" },
    { label: "Applicants Desk", icon: "👥", path: "/employer/applicants" },
    { label: "Interview Center", icon: "📅", path: "/employer/interviews" },
    { label: "Hiring Pipeline", icon: "🗂️", path: "/employer/hiring-pipeline" },
    { label: "Company Profile", icon: "▤", path: "/employer/company" },
  ],
};

export default function Sidebar({ role }) {
  const navigate = useNavigate();
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
    try {
      await signOut();
      navigate("/sign-in", { replace: true });
    } finally {
      setLoggingOut(false);
      setShowLogoutConfirm(false);
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
        {links.map((link) => (
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
        ))}
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