import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../services/supabase";
import { signOut } from "../../services/authService";
import { setCurrentUser, getCurrentUser } from "../../services/localStorageService";
import {
  getPublicSuspensionMessage,
  getSuspensionReasonLabel,
} from "../../services/adminService";
import "./AccountSuspended.css";

export default function AccountSuspended() {
  const navigate = useNavigate();
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSuspensionDetails() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const currentLocal = getCurrentUser();
        const targetId = user?.id || currentLocal?.id;

        if (targetId) {
          const { data, error } = await supabase
            .from("profiles")
            .select("id, full_name, email, role, is_suspended, suspension_reason_code, suspended_at")
            .eq("id", targetId)
            .maybeSingle();

          if (!error && data) {
            setProfileData(data);
          } else if (currentLocal) {
            setProfileData(currentLocal);
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

    loadSuspensionDetails();
  }, []);

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

  const formattedDate = profileData?.suspended_at
    ? new Date(profileData.suspended_at).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <main className="suspended-page">
      <div className="suspended-card">
        <div className="suspended-icon" aria-hidden="true">
          ⚠️
        </div>
        <h1 className="suspended-title">Account Suspended</h1>

        {/* Public Suspension Reason Card */}
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <span style={{ fontSize: "11px", fontWeight: "800", textTransform: "uppercase", color: "#991b1b", letterSpacing: "0.5px" }}>
              Reason for Suspension
            </span>
            {reasonCode && (
              <span style={{ fontSize: "12px", fontWeight: "700", color: "#b91c1c", background: "#fee2e2", padding: "2px 8px", borderRadius: "10px" }}>
                {reasonLabel}
              </span>
            )}
          </div>
          <p style={{ margin: "0 0 6px 0", fontSize: "13.5px", color: "#7f1d1d", lineHeight: "1.5", fontWeight: "500" }}>
            {publicMessage}
          </p>
          {formattedDate && (
            <span style={{ fontSize: "12px", color: "#991b1b", display: "block", marginTop: "6px" }}>
              Suspended on: <strong>{formattedDate}</strong>
            </span>
          )}
        </div>

        <div className="suspended-message">
          <p>
            Your access to SkillSync features, jobs, and recruitment workflows is temporarily restricted while your account is in suspension.
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
