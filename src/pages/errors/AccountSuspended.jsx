import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../services/supabase";
import { signOut } from "../../services/authService";
import { setCurrentUser, getCurrentUser } from "../../services/localStorageService";
import {
  getPublicSuspensionMessage,
  getSuspensionReasonLabel,
  isAccountSuspended,
  formatSuspensionRemaining,
} from "../../services/adminService";
import { getDashboardPath } from "../../utils/getDashboardPath";
import "./AccountSuspended.css";

export default function AccountSuspended() {
  const navigate = useNavigate();
  const [profileData, setProfileData] = useState(null);
  const [remainingTime, setRemainingTime] = useState("");
  const [loading, setLoading] = useState(true);

  async function fetchProfile() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const currentLocal = getCurrentUser();
      const targetId = user?.id || currentLocal?.id;

      if (targetId) {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, full_name, email, role, is_suspended, verification_status, suspension_reason_code, suspended_at, suspension_expires_at")
          .eq("id", targetId)
          .maybeSingle();

        if (!error && data) {
          setProfileData(data);
          // If suspension has expired, automatically route to dashboard
          if (!isAccountSuspended(data)) {
            const path = getDashboardPath(data.role);
            navigate(path === "/" ? "/candidate/dashboard" : path, { replace: true });
            return;
          }
        } else if (currentLocal) {
          setProfileData(currentLocal);
          if (!isAccountSuspended(currentLocal)) {
            const path = getDashboardPath(currentLocal.role);
            navigate(path === "/" ? "/candidate/dashboard" : path, { replace: true });
            return;
          }
        }
      } else if (currentLocal) {
        setProfileData(currentLocal);
      }
    } catch (err) {
      console.warn("[AccountSuspended] Could not load suspension details:", err?.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProfile();
  }, []);

  // Live remaining time ticker for temporary suspensions
  useEffect(() => {
    if (!profileData?.suspension_expires_at) {
      setRemainingTime("");
      return;
    }

    function updateRemaining() {
      const remaining = formatSuspensionRemaining(profileData.suspension_expires_at);
      setRemainingTime(remaining);

      if (remaining === "Expired") {
        // Re-fetch from database to verify authoritative state
        fetchProfile();
      }
    }

    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);
    return () => clearInterval(interval);
  }, [profileData?.suspension_expires_at]);

  async function handleSignOut() {
    try {
      await signOut();
    } catch (err) {
      console.warn("Error signing out from Supabase:", err);
    } finally {
      setCurrentUser(null);
      try {
        localStorage.removeItem("skillsync_user");
        localStorage.removeItem("skillsync_session");
      } catch {}
      navigate("/sign-in", { replace: true });
    }
  }

  const reasonCode = profileData?.suspension_reason_code || null;
  const reasonLabel = getSuspensionReasonLabel(reasonCode);
  const publicMessage = getPublicSuspensionMessage(reasonCode);

  const formattedSuspendedAt = profileData?.suspended_at
    ? new Date(profileData.suspended_at).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const formattedExpiresAt = profileData?.suspension_expires_at
    ? new Date(profileData.suspension_expires_at).toLocaleString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    : null;

  const isTemporary = Boolean(profileData?.suspension_expires_at);

  return (
    <main className="suspended-page">
      <div className="suspended-card">
        <div className="suspended-icon" aria-hidden="true">
          ⚠️
        </div>
        <h1 className="suspended-title">Account Suspended</h1>

        {/* Public Suspension Reason & Duration Details Card */}
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fca5a5",
            borderRadius: "12px",
            padding: "16px",
            marginBottom: "20px",
            textAlign: "left",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "11px", fontWeight: "800", textTransform: "uppercase", color: "#991b1b", letterSpacing: "0.5px" }}>
              Reason for Suspension
            </span>
            {reasonCode && (
              <span style={{ fontSize: "12px", fontWeight: "700", color: "#b91c1c", background: "#fee2e2", padding: "2px 8px", borderRadius: "10px" }}>
                {reasonLabel}
              </span>
            )}
          </div>
          <p style={{ margin: "0 0 10px 0", fontSize: "13.5px", color: "#7f1d1d", lineHeight: "1.5", fontWeight: "500" }}>
            {publicMessage}
          </p>

          <div style={{ borderTop: "1px solid #fecaca", paddingTop: "10px", marginTop: "10px", display: "flex", flexDirection: "column", gap: "6px", fontSize: "12.5px" }}>
            {formattedSuspendedAt && (
              <div style={{ color: "#991b1b" }}>
                Suspended on: <strong>{formattedSuspendedAt}</strong>
              </div>
            )}

            <div style={{ color: "#991b1b" }}>
              Suspension ends:{" "}
              <strong>
                {isTemporary ? formattedExpiresAt : "Indefinite"}
              </strong>
            </div>

            {isTemporary && remainingTime && remainingTime !== "Expired" && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                <span style={{ color: "#991b1b" }}>Time remaining:</span>
                <span style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #f87171", padding: "2px 8px", borderRadius: "6px", fontWeight: "800", fontSize: "12px" }}>
                  ⏳ {remainingTime}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="suspended-message">
          <p>
            {isTemporary
              ? "Your SkillSync access will automatically be restored when the suspension period ends."
              : "Your access to SkillSync features and workflows is currently restricted while your account is in suspension."}
          </p>
          <p style={{ fontSize: "13px", color: "#64748b" }}>
            If you believe this decision was made in error or would like to submit an inquiry, please contact the SkillSync administrator or support team.
          </p>
        </div>

        <div className="suspended-actions">
          <button
            type="button"
            className="suspended-signout-btn"
            onClick={handleSignOut}
          >
            Sign Out
          </button>
        </div>
      </div>
    </main>
  );
}
