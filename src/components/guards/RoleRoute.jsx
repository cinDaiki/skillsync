import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../../services/supabase";
import { setCurrentUser } from "../../services/localStorageService";
import { isDevMode, devGetSession } from "../../services/devMode";
import { isAccountSuspended } from "../../services/adminService";

function normalizeRole(role) {
  if (role === "job_seeker") return "candidate";
  return role || "candidate";
}

function roleIsAllowed(role, allowedRoles) {
  const normalized = normalizeRole(role);
  return allowedRoles.some(
    (allowed) => normalizeRole(allowed) === normalized
  );
}

export default function RoleRoute({ allowedRoles, children }) {
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    async function checkAuth() {

      // ── DEV MODE: read session from localStorage only, skip Supabase ──────
      if (isDevMode()) {
        const { data: { session }, fakeProfile } = devGetSession();

        if (!session?.user) {
          setStatus("unauthenticated");
          return;
        }

        const role = normalizeRole(
          fakeProfile?.role || session.user?.user_metadata?.role
        );
        const isSuspended = isAccountSuspended(fakeProfile || session.user?.user_metadata);

        // Preserve any profile_picture_url already in localStorage
        const existingUser = (() => {
          try { return JSON.parse(localStorage.getItem("skillsync_user")) || {}; } catch { return {}; }
        })();

        setCurrentUser({
          ...existingUser,
          id:                    session.user.id,
          email:                 fakeProfile?.email || session.user.email,
          role,
          full_name:             fakeProfile?.full_name || session.user?.user_metadata?.full_name || "",
          is_suspended:          isSuspended,
          suspension_expires_at: fakeProfile?.suspension_expires_at || null,
        });

        if (isSuspended && role !== "admin") {
          setStatus("suspended");
          return;
        }

        if (roleIsAllowed(role, allowedRoles)) {
          setStatus("allowed");
        } else {
          setStatus("unauthorized");
        }
        return;
      }
      // ── END DEV MODE ───────────────────────────────────────────────────────

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setStatus("unauthenticated");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, full_name, email, profile_picture_url, is_suspended, verification_status, suspension_reason_code, suspension_expires_at, suspended_at")
        .eq("id", session.user.id)
        .maybeSingle();

      const role = normalizeRole(
        profile?.role || session.user?.user_metadata?.role
      );
      const isSuspended = isAccountSuspended(profile);

      setCurrentUser({
        id:                    session.user.id,
        email:                 profile?.email || session.user.email,
        role,
        full_name:             profile?.full_name || session.user?.user_metadata?.full_name || "",
        profile_picture_url:   profile?.profile_picture_url || "",
        is_suspended:          isSuspended,
        suspension_expires_at: profile?.suspension_expires_at || null,
        suspension_reason_code: profile?.suspension_reason_code || null,
      });

      if (isSuspended && role !== "admin") {
        setStatus("suspended");
        return;
      }

      if (roleIsAllowed(role, allowedRoles)) {
        setStatus("allowed");
      } else {
        setStatus("unauthorized");
      }
    }

    checkAuth();
  }, [allowedRoles]);

  if (status === "checking") {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          background: "#f8f9fc",
          flexDirection: "column",
          gap: "1rem",
          fontFamily: "Inter, sans-serif",
          color: "#6b7280",
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            border: "3px solid #e5e7eb",
            borderTop: "3px solid #7c3aed",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p>Verifying session...</p>
      </div>
    );
  }

  if (status === "unauthenticated") return <Navigate to="/sign-in" replace />;
  if (status === "suspended") return <Navigate to="/account-suspended" replace />;
  if (status === "unauthorized") return <Navigate to="/unauthorized" replace />;
  return children;
}
