import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  requestRegistrationVerification,
  verifyRegistrationVerification,
  completeRegistration,
} from "../../services/authService";
import "./SignIn.css";

function maskEmail(email) {
  if (!email || !email.includes("@")) return email || "";
  const [user, domain] = email.split("@");
  if (user.length <= 2) {
    return `${user.charAt(0)}***@${domain}`;
  }
  return `${user.charAt(0)}***${user.charAt(user.length - 1)}@${domain}`;
}

export default function SignUp() {
  const navigate = useNavigate();

  // View Mode: "details" | "verify_otp"
  const [viewMode, setViewMode] = useState("details");

  // Registration Form State
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    accountType: "candidate",
  });

  // OTP Challenge State
  const [challengeId, setChallengeId] = useState(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpCooldown, setOtpCooldown] = useState(0);

  // Status & Feedback
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // Cooldown countdown timer for OTP resend
  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = setInterval(() => {
      setOtpCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCooldown]);

  function handleChange(e) {
    const { name, value } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
    setError("");
    setInfoMessage("");
  }

  // Step 1: Submit Details & Request 6-digit OTP via Brevo
  async function handleDetailsSubmit(e) {
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
    setInfoMessage("");

    try {
      const { data, error: reqError } = await requestRegistrationVerification(formData.email);

      if (reqError || !data?.success) {
        if (data?.error === "RESEND_COOLDOWN_ACTIVE") {
          setOtpCooldown(data.retry_after_seconds || 60);
          setError("Please wait a moment before requesting another verification code.");
        } else {
          setError(reqError?.message || data?.error || "Unable to request verification code. Please try again.");
        }
        setLoading(false);
        return;
      }

      setChallengeId(data.challenge_id);
      setOtpCooldown(data.cooldown_seconds || 60);
      setViewMode("verify_otp");
      setInfoMessage(`We've sent a 6-digit verification code to ${maskEmail(formData.email)}.`);
    } catch {
      setError("Network error requesting verification code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // Resend OTP
  async function handleResendOtp() {
    if (otpCooldown > 0 || loading) return;

    setLoading(true);
    setError("");
    setInfoMessage("");

    try {
      const { data, error: reqError } = await requestRegistrationVerification(formData.email);

      if (reqError || !data?.success) {
        if (data?.error === "RESEND_COOLDOWN_ACTIVE") {
          setOtpCooldown(data.retry_after_seconds || 60);
        } else {
          setError(reqError?.message || data?.error || "Unable to resend code.");
        }
        setLoading(false);
        return;
      }

      setChallengeId(data.challenge_id);
      setOtpCooldown(data.cooldown_seconds || 60);
      setOtpCode("");
      setInfoMessage(`A fresh verification code was sent to ${maskEmail(formData.email)}.`);
    } catch {
      setError("Failed to resend code.");
    } finally {
      setLoading(false);
    }
  }

  // Step 2: Verify OTP -> Receive 256-bit Completion Token -> Authoritatively Complete Registration
  async function handleOtpSubmit(e) {
    e.preventDefault();

    const cleanOtp = otpCode.trim();
    if (cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
      setError("Please enter the 6-digit numeric verification code.");
      return;
    }

    setLoading(true);
    setError("");
    setInfoMessage("");

    try {
      // 1. Verify OTP and obtain one-time completion token
      const { data: verifyData, error: verifyErr } = await verifyRegistrationVerification({
        challengeId,
        email: formData.email,
        otp: cleanOtp,
      });

      if (verifyErr || !verifyData?.success || !verifyData?.completion_token) {
        const remaining = verifyData?.remaining_attempts;
        if (remaining !== undefined && remaining > 0) {
          setError(`Incorrect code. You have ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`);
        } else if (verifyData?.error === "CHALLENGE_LOCKED" || remaining === 0) {
          setError("Too many failed attempts. Please request a new code.");
        } else if (verifyData?.error === "CHALLENGE_EXPIRED") {
          setError("Verification code expired. Please request a new code.");
        } else {
          setError(verifyErr?.message || verifyData?.message || "Invalid verification code.");
        }
        setLoading(false);
        return;
      }

      const completionToken = verifyData.completion_token;

      // 2. Complete account and profile creation using the completion token
      const { data: compData, error: compErr } = await completeRegistration({
        challengeId,
        email: formData.email,
        completionToken,
        password: formData.password,
        fullName: formData.fullName,
        role: formData.accountType,
      });

      if (compErr || !compData?.success) {
        setError(compErr?.message || compData?.error || "Account creation failed. Please try again.");
        setLoading(false);
        return;
      }

      // Success: Navigate cleanly to Sign In
      navigate("/sign-in?registered=true");
    } catch {
      setError("Registration completion failed. Please try again.");
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
              Create your SkillSync account and start building your career
              profile with a cleaner and more modern experience.
            </p>
          </div>
        </section>

        <section className="signin-right">
          {viewMode === "verify_otp" ? (
            /* Stage 2: 6-Digit Email Verification Screen */
            <form className="signin-card" onSubmit={handleOtpSubmit}>
              <div className="signin-card-header">
                <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>✉️</div>
                <span>Email Verification</span>
                <h2>Enter 6-digit Code</h2>
                <p>
                  We sent a single-use verification code to <strong>{maskEmail(formData.email)}</strong>.
                </p>
              </div>

              {infoMessage && (
                <div
                  style={{
                    background: "rgba(99, 102, 241, 0.08)",
                    border: "1px solid rgba(99, 102, 241, 0.2)",
                    borderRadius: "8px",
                    padding: "10px 14px",
                    color: "#4f46e5",
                    fontSize: "0.875rem",
                    marginBottom: "1rem",
                  }}
                >
                  {infoMessage}
                </div>
              )}

              {error && <div className="signin-error">{error}</div>}

              <label>
                <span>6-Digit Verification Code</span>
                <input
                  type="text"
                  name="otpCode"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength="6"
                  placeholder="• • • • • •"
                  value={otpCode}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setOtpCode(val);
                    setError("");
                  }}
                  style={{
                    textAlign: "center",
                    letterSpacing: "8px",
                    fontSize: "1.5rem",
                    fontWeight: "700",
                    fontFamily: "monospace",
                  }}
                  autoFocus
                  required
                />
              </label>

              <button
                type="submit"
                className="signin-submit-btn"
                disabled={loading || otpCode.trim().length !== 6}
                style={{ marginTop: "1rem" }}
              >
                {loading ? "Verifying & creating account..." : "Verify & Complete Registration"}
              </button>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1.25rem" }}>
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={otpCooldown > 0 || loading}
                  style={{
                    background: "none",
                    border: "none",
                    color: otpCooldown > 0 ? "#94a3b8" : "#6366f1",
                    fontSize: "0.875rem",
                    cursor: otpCooldown > 0 ? "default" : "pointer",
                    padding: 0,
                    fontWeight: "500",
                  }}
                >
                  {otpCooldown > 0 ? `Resend code in ${otpCooldown}s` : "Resend code"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setViewMode("details");
                    setError("");
                    setInfoMessage("");
                    setOtpCode("");
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#64748b",
                    fontSize: "0.875rem",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  Edit details
                </button>
              </div>

              <p className="signin-footer-text" style={{ marginTop: "1.5rem" }}>
                Already have an account? <Link to="/sign-in">Sign in</Link>
              </p>
            </form>
          ) : (
            /* Stage 1: Registration Details Screen */
            <form className="signin-card" onSubmit={handleDetailsSubmit}>
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
                {loading ? "Sending verification code..." : "Create Account"}
              </button>

              <p className="signin-footer-text">
                Already have an account? <Link to="/sign-in">Sign in</Link>
              </p>
            </form>
          )}
        </section>
      </section>
    </main>
  );
}