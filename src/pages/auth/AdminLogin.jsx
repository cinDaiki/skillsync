import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  signIn,
  signOut,
  getOrCreateDeviceToken,
  getLoginGateStatus,
  checkSessionTrust,
  requestLoginVerification,
  verifyLoginVerification,
} from "../../services/authService";
import { supabase } from "../../services/supabase";
import { setCurrentUser } from "../../services/localStorageService";
import { isDevMode } from "../../services/devMode";
import "./AdminLogin.css";

function maskEmail(email) {
  if (!email || !email.includes("@")) return email || "";
  const [user, domain] = email.split("@");
  if (user.length <= 2) {
    return `${user.charAt(0)}***@${domain}`;
  }
  return `${user.charAt(0)}***${user.charAt(user.length - 1)}@${domain}`;
}

function getDeviceName() {
  if (typeof navigator === "undefined") return "Admin Device";
  const platform = navigator.userAgentData?.platform || navigator.platform || "Device";
  const ua = navigator.userAgent || "";
  let browser = "Browser";
  if (ua.includes("Edg")) browser = "Edge";
  else if (ua.includes("Chrome")) browser = "Chrome";
  else if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Safari")) browser = "Safari";
  return `${browser} on ${platform}`;
}

export default function AdminLogin() {
  const navigate = useNavigate();

  // View mode: "credentials" | "verify_otp"
  const [viewMode, setViewMode] = useState("credentials");

  // Credential state
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  // Step-up OTP state
  const [challengeId, setChallengeId] = useState(null);
  const [otpCode, setOtpCode] = useState("");
  const [rememberDevice, setRememberDevice] = useState(true);
  const [maskedEmail, setMaskedEmail] = useState("");
  const [otpCooldown, setOtpCooldown] = useState(0);

  // Status & Feedback
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Countdown timer for OTP resend cooldown
  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = setInterval(() => {
      setOtpCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCooldown]);

  function handleChange(e) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError("");
  }

  async function handleCredentialsSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const email = formData.email.trim();
    const password = formData.password;

    try {
      const { data: authData, error: signInError } = await signIn(email, password);

      // ── DEV MODE ──────────────────────────────────────────────────────────
      if (isDevMode()) {
        if (signInError || !authData?.user) {
          setError("Incorrect admin email or password. Please try again.");
          return;
        }
        const devRole = authData.user?.role || authData.user?.user_metadata?.role;
        if (devRole === "admin") {
          setCurrentUser({
            id:        authData.user.id,
            email:     authData.user.email,
            role:      "admin",
            full_name: authData.user.full_name || authData.user?.user_metadata?.full_name || "",
          });
          navigate("/admin/dashboard");
        } else {
          setError("This dev account is not an admin. Use admin@test.com with password SkillSync#Admin1.");
        }
        return;
      }
      // ── END DEV MODE ───────────────────────────────────────────────────────

      if (signInError) {
        setError("Incorrect admin email or password. Please try again.");
        return;
      }

      if (!authData?.user) {
        setError("Unable to authenticate session. Please try again.");
        return;
      }

      // 1. Authoritative Login Gate Check
      const { data: gate, error: gateError } = await getLoginGateStatus();

      if (gateError) {
        console.error("Admin gate error:", gateError);
        await signOut();
        setError("Unable to verify administrator authorization. Please try again.");
        return;
      }

      if (gate && gate.profile_exists === false) {
        await signOut();
        setError("This account is not an admin. Use the regular sign-in page.");
        return;
      }

      if (gate?.role !== "admin") {
        await signOut();
        setError("This account is not an admin. Use the regular sign-in page.");
        return;
      }

      if (gate?.is_suspended) {
        navigate("/account-suspended");
        return;
      }

      // 2. Adaptive Device Trust Check
      const deviceToken = getOrCreateDeviceToken();
      const { data: trustData, error: trustError } = await checkSessionTrust(deviceToken);

      if (trustError) {
        setError("Security check failed. Please try again.");
        return;
      }

      if (trustData?.is_trusted === true && trustData?.requires_otp === false) {
        // TRUSTED DEVICE: Complete sign in immediately
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, full_name, email")
          .eq("id", authData.user.id)
          .maybeSingle();

        setCurrentUser({
          id: authData.user.id,
          email: profile?.email || authData.user.email,
          role: "admin",
          full_name: profile?.full_name || "Administrator",
        });
        navigate("/admin/dashboard");
        return;
      }

      // 3. UNTRUSTED DEVICE: Trigger Adaptive Step-Up OTP
      const { data: reqData, error: reqError } = await requestLoginVerification();

      if (reqError) {
        if (reqError.status === 429 || reqError.message?.includes("RESEND_COOLDOWN_ACTIVE")) {
          setError("Too many requests. Please wait a moment before trying again.");
        } else {
          setError(reqError.message || "Failed to send verification code. Please try again.");
        }
        return;
      }

      setChallengeId(reqData.challenge_id);
      setMaskedEmail(maskEmail(reqData.recipient_email || "hanseecorbo@gmail.com"));
      setOtpCooldown(reqData.cooldown_seconds || 60);
      setViewMode("verify_otp");
      setError("");
    } catch (err) {
      console.error("Admin login error:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleOtpSubmit(e) {
    e.preventDefault();
    const cleanOtp = otpCode.trim();

    if (!cleanOtp || cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
      setError("Please enter a valid 6-digit numeric verification code.");
      return;
    }

    if (!challengeId) {
      setError("Verification challenge expired. Please start over.");
      setViewMode("credentials");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { data: verifyData, error: verifyError } = await verifyLoginVerification({
        challengeId,
        otp: cleanOtp,
        rememberDevice,
        deviceName: getDeviceName(),
      });

      if (verifyError || !verifyData?.verified) {
        const remaining = verifyError?.remaining_attempts;
        if (remaining !== undefined && remaining > 0) {
          setError(`Invalid code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`);
        } else if (remaining === 0) {
          setError("Too many incorrect attempts. This code has been invalidated. Please request a new code.");
        } else {
          setError(verifyError?.message || "Verification failed. Please try again.");
        }
        return;
      }

      // OTP Verified -> fetch authoritative profile and proceed to Admin Dashboard
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, full_name, email")
        .eq("id", user?.id)
        .maybeSingle();

      setCurrentUser({
        id: user?.id,
        email: profile?.email || user?.email,
        role: "admin",
        full_name: profile?.full_name || "Administrator",
      });

      navigate("/admin/dashboard");
    } catch (err) {
      console.error("Admin OTP verification error:", err);
      setError("Something went wrong during verification. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOtp() {
    if (otpCooldown > 0 || loading) return;

    setLoading(true);
    setError("");

    try {
      const { data: reqData, error: reqError } = await requestLoginVerification();

      if (reqError) {
        if (reqError.status === 429 || reqError.message?.includes("RESEND_COOLDOWN_ACTIVE")) {
          setError("Please wait before requesting another code.");
        } else {
          setError(reqError.message || "Failed to resend verification code.");
        }
        return;
      }

      setChallengeId(reqData.challenge_id);
      setOtpCooldown(reqData.cooldown_seconds || 60);
      setOtpCode("");
    } catch (err) {
      console.error("Admin OTP resend error:", err);
      setError("Failed to resend code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleBackToCredentials() {
    try {
      await signOut();
    } catch {
      // ignore
    }
    setViewMode("credentials");
    setOtpCode("");
    setChallengeId(null);
    setError("");
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
            {viewMode === "credentials" ? (
              <>
                <h1>Admin access</h1>
                <p>Sign in to manage users, jobs, employers, and reports.</p>

                {error && <div className="admin-login-error">{error}</div>}

                <form className="admin-login-form" onSubmit={handleCredentialsSubmit}>
                  <label>
                    <span>Admin email</span>
                    <input
                      name="email"
                      type="email"
                      placeholder="admin@skillsync.com"
                      value={formData.email}
                      onChange={handleChange}
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
                      value={formData.password}
                      onChange={handleChange}
                      autoComplete="current-password"
                      required
                    />
                  </label>

                  <button type="submit" disabled={loading}>
                    {loading ? "Verifying..." : "Login as Admin"}
                  </button>
                </form>

                <div className="admin-login-footer">
                  <p>
                    Not an admin? <Link to="/sign-in">Go to user sign in</Link>
                  </p>
                </div>
              </>
            ) : (
              <>
                <h1>Step-up verification</h1>
                <p>
                  We sent a 6-digit security code to your registered admin security email{" "}
                  <strong>{maskedEmail}</strong>.
                </p>

                {error && <div className="admin-login-error">{error}</div>}

                <form className="admin-login-form" onSubmit={handleOtpSubmit}>
                  <label>
                    <span>Enter 6-Digit Code</span>
                    <input
                      name="otp"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      placeholder="000000"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="admin-otp-input"
                      autoFocus
                      required
                    />
                  </label>

                  <label className="admin-remember-label">
                    <input
                      type="checkbox"
                      checked={rememberDevice}
                      onChange={(e) => setRememberDevice(e.target.checked)}
                      className="admin-remember-checkbox"
                    />
                    <span>Remember this device for 14 days</span>
                  </label>

                  <button type="submit" disabled={loading || otpCode.length !== 6}>
                    {loading ? "Verifying..." : "Verify & Enter Admin"}
                  </button>

                  <div className="admin-otp-resend-row">
                    <button
                      type="button"
                      className="admin-resend-btn"
                      onClick={handleResendOtp}
                      disabled={otpCooldown > 0 || loading}
                    >
                      {otpCooldown > 0 ? `Resend code in ${otpCooldown}s` : "Resend code"}
                    </button>

                    <button
                      type="button"
                      className="admin-back-credentials-btn"
                      onClick={handleBackToCredentials}
                    >
                      Sign in as different user
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
