import { useEffect, useState, useCallback } from "react";
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
import {
  submitSuspensionAppeal,
  fetchMyCurrentSuspensionAppeal,
  APPEAL_STATUS_LABELS,
} from "../../services/suspensionAppealService";
import { getDashboardPath } from "../../utils/getDashboardPath";
import "./AccountSuspended.css";

export default function AccountSuspended() {
  const navigate = useNavigate();
  const [profileData, setProfileData] = useState(null);
  const [remainingTime, setRemainingTime] = useState("");
  const [loading, setLoading] = useState(true);

  // Phase 5 Appeal State
  const [appealData, setAppealData] = useState(null);
  const [showAppealForm, setShowAppealForm] = useState(false);
  const [appealMessage, setAppealMessage] = useState("");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [submittingAppeal, setSubmittingAppeal] = useState(false);
  const [appealError, setAppealError] = useState("");
  const [appealSuccessMsg, setAppealSuccessMsg] = useState("");

  const fetchProfile = useCallback(async () => {
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
          // If suspension has expired or was restored, automatically route to dashboard
          if (!isAccountSuspended(data)) {
            const path = getDashboardPath(data.role);
            navigate(path === "/" ? "/candidate/dashboard" : path, { replace: true });
            return;
          }

          // Fetch appeal for current suspension instance
          const appealRes = await fetchMyCurrentSuspensionAppeal(data.suspended_at);
          if (!appealRes.error && appealRes.data) {
            setAppealData(appealRes.data);
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
  }, [navigate]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Live countdown ticker (Pure client-side calculation every second, 0 database queries)
  useEffect(() => {
    if (!profileData?.suspension_expires_at) {
      setRemainingTime("");
      return;
    }

    function updateRemaining() {
      const remaining = formatSuspensionRemaining(profileData.suspension_expires_at);
      setRemainingTime(remaining);

      if (remaining === "Expired") {
        // Authoritative verification when local countdown reaches zero
        fetchProfile();
      }
    }

    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);
    return () => clearInterval(interval);
  }, [profileData?.suspension_expires_at, fetchProfile]);

  // Lightweight periodic recheck for Admin approval (Every 20 seconds or on window focus)
  useEffect(() => {
    const periodicCheck = setInterval(() => {
      fetchProfile();
    }, 20000);

    const handleFocus = () => {
      fetchProfile();
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      clearInterval(periodicCheck);
      window.removeEventListener("focus", handleFocus);
    };
  }, [fetchProfile]);

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

  async function handleSubmitAppeal(e) {
    e.preventDefault();
    setAppealError("");
    setAppealSuccessMsg("");

    const trimmed = appealMessage.trim();
    if (!trimmed || trimmed.length < 20) {
      setAppealError("Please provide an appeal explanation of at least 20 characters.");
      return;
    }

    setSubmittingAppeal(true);
    const res = await submitSuspensionAppeal({
      appealMessage: trimmed,
      userEvidenceNote: evidenceNote.trim() || "",
    });
    setSubmittingAppeal(false);

    if (res.error) {
      setAppealError(res.error.message || "Failed to submit appeal. Please try again.");
      return;
    }

    setAppealSuccessMsg("✓ Your appeal has been submitted for administrative review.");
    setShowAppealForm(false);
    setAppealMessage("");
    setEvidenceNote("");

    // Reload appeal status
    if (profileData) {
      const appealRes = await fetchMyCurrentSuspensionAppeal(profileData.suspended_at);
      if (!appealRes.error && appealRes.data) {
        setAppealData(appealRes.data);
      }
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
      <div className="suspended-card" style={{ maxWidth: "600px" }}>
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

        {/* Phase 5: Appeal Status Display & Interaction */}
        {appealSuccessMsg && (
          <div style={{ background: "#f0fdf4", border: "1px solid #86efac", color: "#166534", padding: "12px", borderRadius: "8px", fontSize: "13px", fontWeight: "600", marginBottom: "16px", textAlign: "left" }}>
            {appealSuccessMsg}
          </div>
        )}

        {appealData ? (
          <div
            style={{
              background: appealData.status === "approved"
                ? "#f0fdf4"
                : appealData.status === "rejected"
                ? "#f8fafc"
                : "#eff6ff",
              border: `1px solid ${
                appealData.status === "approved"
                  ? "#86efac"
                  : appealData.status === "rejected"
                  ? "#cbd5e1"
                  : "#bfdbfe"
              }`,
              borderRadius: "12px",
              padding: "16px",
              marginBottom: "20px",
              textAlign: "left",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ fontSize: "12px", fontWeight: "800", textTransform: "uppercase", color: "#1e3a8a", letterSpacing: "0.5px" }}>
                Suspension Appeal Status
              </span>
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: "700",
                  padding: "3px 10px",
                  borderRadius: "12px",
                  background:
                    appealData.status === "approved"
                      ? "#dcfce7"
                      : appealData.status === "rejected"
                      ? "#fee2e2"
                      : appealData.status === "under_review"
                      ? "#fef3c7"
                      : "#dbeafe",
                  color:
                    appealData.status === "approved"
                      ? "#15803d"
                      : appealData.status === "rejected"
                      ? "#991b1b"
                      : appealData.status === "under_review"
                      ? "#92400e"
                      : "#1e40af",
                }}
              >
                {appealData.status === "pending" && "🕓 "}
                {appealData.status === "under_review" && "🔎 "}
                {appealData.status === "rejected" && "❌ "}
                {appealData.status === "approved" && "✅ "}
                {APPEAL_STATUS_LABELS[appealData.status] || appealData.status}
              </span>
            </div>

            {appealData.status === "pending" && (
              <p style={{ margin: "0 0 6px 0", fontSize: "13px", color: "#1e3a8a", lineHeight: "1.5" }}>
                Your appeal has been submitted and is currently awaiting moderation review.
                Your account remains suspended while your appeal is pending.
              </p>
            )}

            {appealData.status === "under_review" && (
              <p style={{ margin: "0 0 6px 0", fontSize: "13px", color: "#92400e", lineHeight: "1.5" }}>
                An administrator is actively reviewing your suspension appeal. You will receive an in-app notice when a final decision is made.
              </p>
            )}

            {appealData.status === "rejected" && (
              <div style={{ margin: "0 0 6px 0", fontSize: "13px", color: "#334155", lineHeight: "1.5" }}>
                <p style={{ margin: "0 0 6px", fontWeight: "600", color: "#991b1b" }}>
                  Your suspension appeal was reviewed and the suspension decision remains in effect.
                </p>
                {appealData.admin_public_response && (
                  <div style={{ background: "#f1f5f9", padding: "10px 12px", borderRadius: "6px", borderLeft: "3px solid #64748b", margin: "8px 0" }}>
                    <span style={{ fontSize: "11px", fontWeight: "700", color: "#64748b", display: "block" }}>
                      Administrative Feedback:
                    </span>
                    <p style={{ margin: "4px 0 0", color: "#1e293b", fontSize: "12.5px" }}>
                      &ldquo;{appealData.admin_public_response}&rdquo;
                    </p>
                  </div>
                )}
              </div>
            )}

            <div style={{ fontSize: "11.5px", color: "#64748b", marginTop: "8px", borderTop: "1px solid #e2e8f0", paddingTop: "6px" }}>
              Submitted: {new Date(appealData.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              {appealData.reviewed_at && (
                <span style={{ marginLeft: "10px" }}>
                  • Reviewed: {new Date(appealData.reviewed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
          </div>
        ) : showAppealForm ? (
          /* Appeal Submission Form */
          <form
            onSubmit={handleSubmitAppeal}
            style={{
              background: "#f8fafc",
              border: "1px solid #cbd5e1",
              borderRadius: "12px",
              padding: "16px",
              marginBottom: "20px",
              textAlign: "left",
            }}
          >
            <h3 style={{ fontSize: "15px", fontWeight: "800", color: "#0f172a", margin: "0 0 8px 0" }}>
              Submit a Suspension Appeal
            </h3>
            <p style={{ fontSize: "12.5px", color: "#64748b", margin: "0 0 12px 0", lineHeight: "1.4" }}>
              Please explain why you believe your account suspension should be reviewed. Submitting an appeal does not immediately restore your account.
            </p>

            {appealError && (
              <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "8px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "600", marginBottom: "10px" }}>
                ⚠️ {appealError}
              </div>
            )}

            <div style={{ marginBottom: "12px" }}>
              <label style={{ fontSize: "12px", fontWeight: "700", color: "#334155", display: "block", marginBottom: "4px" }}>
                Why should this suspension be reviewed? *
              </label>
              <textarea
                rows={4}
                value={appealMessage}
                onChange={(e) => setAppealMessage(e.target.value)}
                placeholder="Explain the situation or why you believe the suspension was in error (min 20 characters)..."
                required
                style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px", boxSizing: "border-box" }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", fontSize: "11px", color: appealMessage.trim().length < 20 ? "#dc2626" : "#64748b", marginTop: "2px" }}>
                {appealMessage.trim().length} / 2000 characters {appealMessage.trim().length < 20 && "(minimum 20 required)"}
              </div>
            </div>

            <div style={{ marginBottom: "14px" }}>
              <label style={{ fontSize: "12px", fontWeight: "700", color: "#334155", display: "block", marginBottom: "4px" }}>
                Additional Information or Evidence (Optional):
              </label>
              <textarea
                rows={2}
                value={evidenceNote}
                onChange={(e) => setEvidenceNote(e.target.value)}
                placeholder="Any links, context, or clarifying details..."
                style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px", boxSizing: "border-box" }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                onClick={() => {
                  setShowAppealForm(false);
                  setAppealError("");
                }}
                disabled={submittingAppeal}
                style={{ background: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1", padding: "8px 14px", borderRadius: "6px", fontSize: "12.5px", fontWeight: "600", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingAppeal || appealMessage.trim().length < 20}
                style={{
                  background: (submittingAppeal || appealMessage.trim().length < 20) ? "#93c5fd" : "#2563eb",
                  color: "#fff",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "6px",
                  fontSize: "12.5px",
                  fontWeight: "700",
                  cursor: (submittingAppeal || appealMessage.trim().length < 20) ? "not-allowed" : "pointer",
                }}
              >
                {submittingAppeal ? "Submitting..." : "Submit Appeal"}
              </button>
            </div>
          </form>
        ) : (
          /* Button to trigger appeal form if no appeal for current suspension exists */
          <div style={{ marginBottom: "20px" }}>
            <button
              type="button"
              onClick={() => setShowAppealForm(true)}
              style={{
                background: "#f8fafc",
                border: "1px solid #cbd5e1",
                color: "#1e293b",
                padding: "10px 16px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: "700",
                width: "100%",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                transition: "all 0.15s ease",
              }}
            >
              📝 Submit an Appeal
            </button>
          </div>
        )}

        <div className="suspended-message">
          <p>
            {isTemporary
              ? "Your SkillSync access will automatically be restored when the suspension period ends."
              : "Your access to SkillSync features and workflows is currently restricted while your account is in suspension."}
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
