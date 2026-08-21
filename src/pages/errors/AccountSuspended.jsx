import { useNavigate } from "react-router-dom";
import { signOut } from "../../services/authService";
import { setCurrentUser } from "../../services/localStorageService";
import "./AccountSuspended.css";

export default function AccountSuspended() {
  const navigate = useNavigate();

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

  return (
    <main className="suspended-page">
      <div className="suspended-card">
        <div className="suspended-icon" aria-hidden="true">
          ⚠️
        </div>
        <h1 className="suspended-title">Account Suspended</h1>
        <div className="suspended-message">
          <p>Your SkillSync account has been suspended by an administrator.</p>
          <p>You cannot access SkillSync features while your account is suspended.</p>
          <p>
            If you believe this was a mistake, please contact the SkillSync
            administrator or support team.
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
