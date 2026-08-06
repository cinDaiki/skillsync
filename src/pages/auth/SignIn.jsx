import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { signIn } from "../../services/authService";
import { supabase } from "../../services/supabase";
import { setCurrentUser } from "../../services/localStorageService";
import { getDashboardPath } from "../../utils/getDashboardPath";
import { isDevMode } from "../../services/devMode";
import "./SignIn.css";

function resolveRole(profileRole, metadataRole) {
  const role = profileRole || metadataRole || "candidate";
  if (role === "job_seeker") return "candidate";
  return role;
}

function safeRedirectPath(value) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

export default function SignIn() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = safeRedirectPath(searchParams.get("redirect"));

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
    setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { data, error: signInError } = await signIn(formData.email, formData.password);

      if (signInError) {
        const msg = signInError.message?.toLowerCase() || "";
        if (msg.includes("email not confirmed")) {
          setError("Your email is not confirmed yet. Please check your inbox and click the confirmation link.");
        } else if (msg.includes("invalid login credentials") || msg.includes("invalid email or password")) {
          setError("Incorrect email or password. Please try again.");
        } else if (msg.includes("too many requests")) {
          setError("Too many login attempts. Please wait a moment and try again.");
        } else {
          setError(signInError.message || "Login failed. Please try again.");
        }
        return;
      }

      // DEV MODE: user object already has role/full_name — skip Supabase profile query
      let role;
      if (isDevMode()) {
        role = resolveRole(data.user?.role, data.user?.user_metadata?.role);
        setCurrentUser({
          id:        data.user.id,
          email:     data.user.email,
          role,
          full_name: data.user?.full_name || data.user?.user_metadata?.full_name || "",
        });
      } else {
        // PRODUCTION: fetch role from profiles table
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, full_name, email, profile_picture_url")
          .eq("id", data.user.id)
          .maybeSingle();

        role = resolveRole(profile?.role, data.user?.user_metadata?.role);

        setCurrentUser({
          id:                  data.user.id,
          email:               profile?.email || data.user.email,
          role,
          full_name:           profile?.full_name || data.user?.user_metadata?.full_name || "",
          profile_picture_url: profile?.profile_picture_url || "",
        });
      }

      if (redirectTo) {
        navigate(redirectTo);
        return;
      }

      const path = getDashboardPath(role);
      navigate(path === "/" ? "/candidate/dashboard" : path);
    } catch (unexpectedError) {
      console.error("Unexpected error during login:", unexpectedError);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="signin-page">
      <section className="signin-shell">
        <section className="signin-left">
          <Link to="/" className="signin-back-btn">
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
          <div className="signin-brand">
            <div className="signin-logo-icon">✓</div>
            <div>
              <h1>SkillSync</h1>
              <p>Find the right match</p>
            </div>
          </div>

          <div className="signin-hero-content">
            <h2>Find jobs that match your skill.</h2>
            <p>
              Access your account, manage your profile, and continue your
              SkillSync journey with a cleaner and more modern experience.
            </p>
          </div>
        </section>

        <section className="signin-right">
          <form className="signin-card" onSubmit={handleSubmit}>
            <div className="signin-card-header">
              <span>Sign In</span>
              <h2>Welcome back</h2>
              <p>Sign in to continue your SkillSync journey.</p>
            </div>

            {error && <div className="signin-error">{error}</div>}

            <label>
              <span>Email address</span>
              <input
                type="email"
                name="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </label>

            <label>
              <span style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                <span>Password</span>
                <Link to="/forgot-password" style={{ color: "#8b18ff", textDecoration: "none", fontSize: "13px", fontWeight: "700" }}>Forgot password?</Link>
              </span>
              <input
                type="password"
                name="password"
                placeholder="Enter password"
                value={formData.password}
                onChange={handleChange}
                required
              />
            </label>

            <button
              type="submit"
              className="signin-submit-btn"
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>

            <p className="signin-footer-text">
              New to SkillSync? <Link to="/sign-up">Create an account</Link>
            </p>
          </form>
        </section>
      </section>
    </main>
  );
}
