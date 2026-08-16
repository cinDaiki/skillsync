import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signIn, signOut } from "../../services/authService";
import { supabase } from "../../services/supabase";
import { setCurrentUser } from "../../services/localStorageService";
import { isDevMode } from "../../services/devMode";
import "./AdminLogin.css";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const email = event.target.email.value.trim();
    const password = event.target.password.value;

    try {
      const { data, error: signInError } = await signIn(email, password);

      // ── DEV MODE: never query Supabase — check role from local dev user ───
      if (isDevMode()) {
        if (signInError || !data?.user) {
          setError("Incorrect admin email or password. Please try again.");
          return;
        }
        const devRole = data.user?.role || data.user?.user_metadata?.role;
        if (devRole === "admin") {
          setCurrentUser({
            id:        data.user.id,
            email:     data.user.email,
            role:      "admin",
            full_name: data.user.full_name || data.user?.user_metadata?.full_name || "",
          });
          navigate("/admin/dashboard");
        } else {
          setError("This dev account is not an admin. Use admin@test.com with password SkillSync#Admin1.");
        }
        return;
      }
      // ── END DEV MODE ───────────────────────────────────────────────────────

      if (!signInError && data?.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, full_name, email")
          .eq("id", data.user.id)
          .maybeSingle();

        if (profile?.role === "admin") {
          setCurrentUser({
            id: data.user.id,
            email: profile?.email || data.user.email,
            role: "admin",
            full_name: profile?.full_name || "",
          });
          navigate("/admin/dashboard");
          return;
        }

        await signOut();
        setError("This account is not an admin. Use the regular sign-in page.");
        return;
      }

      setError("Incorrect admin email or password. Please try again.");
    } catch (err) {
      console.error("Admin login error:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="admin-login-page">
      <section className="admin-login-card">
        <section className="admin-login-showcase">
          <Link to="/" className="admin-back-btn">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            <span>Back to Home</span>
          </Link>
          <div className="admin-login-brand">
            <div className="admin-login-brand-icon">✓</div>
            <div>
              <h2>SkillSync</h2>
              <p>Find the right match</p>
            </div>
          </div>

          <div className="admin-login-showcase-content">
            <span className="admin-login-chip">Admin Portal</span>
            <div className="admin-login-copy">
              <h1>Manage SkillSync with clarity.</h1>
              <p>
                Access the admin workspace to manage users, job posts,
                employers, and platform records.
              </p>
            </div>
          </div>
        </section>

        <div className="admin-login-form-side">
          <div className="admin-login-form-wrap">
            <h1>Admin access</h1>
            <p>Sign in to manage users, jobs, employers, and reports.</p>

            {error && <div className="admin-login-error">{error}</div>}

            <form className="admin-login-form" onSubmit={handleSubmit}>
              <label>
                <span>Admin email</span>
                <input
                  name="email"
                  type="email"
                  placeholder="admin@skillsync.com"
                  autoComplete="email"
                  required
                />
              </label>

              <label>
                <span>Password</span>
                <input
                  name="password"
                  type="password"
                  placeholder="Enter admin password"
                  autoComplete="current-password"
                  required
                />
              </label>

              <button type="submit" disabled={loading}>
                {loading ? "Logging in..." : "Login as Admin"}
              </button>
            </form>

            <div className="admin-login-footer">
              <p>
                Not an admin? <Link to="/sign-in">Go to user sign in</Link>
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
