import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signUp } from "../../services/authService";
import { isDevMode } from "../../services/devMode";
import "./SignIn.css";

export default function SignUp() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    accountType: "candidate",
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

    if (!formData.fullName.trim()) {
      setError("Please enter your full name.");
      return;
    }

    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    setError("");

    const { data, error } = await signUp(
      formData.email,
      formData.password,
      formData.fullName.trim(),
      formData.accountType
    );

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // DEV MODE: devSignUp already stored the user locally — skip Supabase insert
    if (!isDevMode()) {
      // PRODUCTION: save profile to Supabase profiles table
      const { supabase } = await import("../../services/supabase");
      await supabase.from("profiles").insert([{
        id:        data.user.id,
        full_name: formData.fullName.trim(),
        email:     formData.email.toLowerCase().trim(),
        role:      formData.accountType,
      }]);
    }

    setLoading(false);
    navigate("/sign-in");
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
              Create your SkillSync account and start building your career
              profile with a cleaner and more modern experience.
            </p>
          </div>
        </section>

        <section className="signin-right">
          <form className="signin-card" onSubmit={handleSubmit}>
            <div className="signin-card-header">
              <span>Create Account</span>
              <h2>Join SkillSync</h2>
              <p>Start matching with the right opportunities.</p>
            </div>

            {error && <div className="signin-error">{error}</div>}

            <label>
              <span>Full name</span>
              <input
                type="text"
                name="fullName"
                placeholder="Enter your full name"
                value={formData.fullName}
                onChange={handleChange}
                required
              />
            </label>

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
              <span>Password</span>
              <input
                type="password"
                name="password"
                placeholder="Create password (min 6 characters)"
                value={formData.password}
                onChange={handleChange}
                required
              />
            </label>

            <label>
              <span>Account type</span>
              <select
                name="accountType"
                value={formData.accountType}
                onChange={handleChange}
              >
                <option value="candidate">Job Seeker</option>
                <option value="employer">Employer</option>
              </select>
            </label>

            <button
              type="submit"
              className="signin-submit-btn"
              disabled={loading}
            >
              {loading ? "Creating account..." : "Create Account"}
            </button>

            <p className="signin-footer-text">
              Already have an account? <Link to="/sign-in">Sign in</Link>
            </p>
          </form>
        </section>
      </section>
    </main>
  );
}