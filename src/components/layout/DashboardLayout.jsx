import { useState, useEffect } from "react";
import Sidebar from "./Sidebar";
import ErrorBoundary from "../guards/ErrorBoundary";
import NotificationBell from "./NotificationBell";
import "../../styles/dashboard.css";

export default function DashboardLayout({
  role = "candidate",
  title,
  subtitle,
  children,
}) {
  const [currentUser, setCurrentUser] = useState(
    () => JSON.parse(localStorage.getItem("skillsync_user")) || {}
  );

  // Re-read from localStorage whenever the user navigates / uploads a new photo.
  // We listen to the storage event for cross-tab sync, and also poll on focus
  // so uploads on the same tab reflect immediately after localStorage is written.
  useEffect(() => {
    function syncFromStorage() {
      try {
        const fresh = JSON.parse(localStorage.getItem("skillsync_user")) || {};
        setCurrentUser(fresh);
      } catch {
        // ignore
      }
    }

    window.addEventListener("storage", syncFromStorage);
    window.addEventListener("focus", syncFromStorage);

    // Also poll every 2 s while the tab is active (catches same-tab uploads)
    const interval = setInterval(syncFromStorage, 2000);

    return () => {
      window.removeEventListener("storage", syncFromStorage);
      window.removeEventListener("focus", syncFromStorage);
      clearInterval(interval);
    };
  }, []);

  const panelLabel =
    role === "admin"
      ? "ADMIN PANEL"
      : role === "employer"
      ? "EMPLOYER PANEL"
      : "JOB SEEKER PANEL";

  const displayName =
    currentUser?.full_name ||
    currentUser?.fullName ||
    currentUser?.name ||
    currentUser?.email ||
    "Account";

  const displayEmail = currentUser?.email || "user@skillsync.com";
  const displayInitial = displayName.charAt(0).toUpperCase();
  const photoUrl = currentUser?.profile_picture_url || "";

  return (
    <div className="dashboard-page">
      <Sidebar role={role} />

      <main className="dashboard-main">
        <div className="dashboard-topbar">
          <div>
            <p className="dashboard-eyebrow">{panelLabel}</p>
            <h1>{title}</h1>
            <span>{subtitle}</span>
          </div>

          <div
            className="dashboard-user"
            style={{ display: "flex", alignItems: "center", gap: "8px" }}
          >
            <NotificationBell />
            <div style={{ textAlign: "right" }}>
              <strong>Account</strong>
              <small>{displayEmail}</small>
            </div>

            {/* Avatar: real photo if available, letter-initial otherwise */}
            {photoUrl ? (
              <span
                style={{
                  width: "38px",
                  height: "38px",
                  borderRadius: "50%",
                  overflow: "hidden",
                  flexShrink: 0,
                  border: "2px solid rgba(88,21,143,0.3)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <img
                  src={photoUrl}
                  alt={displayName}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    borderRadius: "50%",
                    display: "block",
                  }}
                  onError={(e) => {
                    // If photo fails to load, fall back to initial
                    e.target.style.display = "none";
                    e.target.parentNode.textContent = displayInitial;
                  }}
                />
              </span>
            ) : (
              <span>{displayInitial}</span>
            )}
          </div>
        </div>

        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
    </div>
  );
}