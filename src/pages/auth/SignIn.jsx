import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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
import { getDashboardPath } from "../../utils/getDashboardPath";
import { isDevMode } from "../../services/devMode";
import { isAccountSuspended } from "../../services/adminService";
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

function maskEmail(email) {
  if (!email || !email.includes("@")) return email || "";
  const [user, domain] = email.split("@");
  if (user.length <= 2) {
    return `${user.charAt(0)}***@${domain}`;
  }
  return `${user.charAt(0)}***${user.charAt(user.length - 1)}@${domain}`;
}

function getDeviceName() {
  if (typeof navigator === "undefined") return "Browser Device";
  const platform = navigator.userAgentData?.platform || navigator.platform || "Device";
  const ua = navigator.userAgent || "";
  let browser = "Browser";
  if (ua.includes("Edg")) browser = "Edge";
  else if (ua.includes("Chrome")) browser = "Chrome";
  else if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Safari")) browser = "Safari";
  return `${browser} on ${platform}`;
}

export default function SignIn() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = safeRedirectPath(searchParams.get("redirect"));

  // View state: "credentials" (Email + Password) | "verify_otp" (Adaptive Step-Up OTP)
  const [viewMode, setViewMode] = useState("credentials");

  // Credential inputs
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  // Step-Up OTP state
  const [challengeId, setChallengeId] = useState(null);
  const [otpCode, setOtpCode] = useState("");
  const [rememberDevice, setRememberDevice] = useState(true);
  const [maskedEmail, setMaskedEmail] = useState("");
  const [otpCooldown, setOtpCooldown] = useState(0);

  // Status & Feedback
  const [error, setError] = useState(null);
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

  // Handle registered query param
  useEffect(() => {
    if (searchParams.get("registered") === "true") {
      setInfoMessage("Account created successfully! Please sign in with your email and password.");
    }
  }, [searchParams]);

  // Handle existing session upon page load or page refresh
  useEffect(() => {
    let isMounted = true;

    async function checkSessionOnMount() {
      if (isDevMode()) return;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user || !isMounted) return;

        const deviceToken = getOrCreateDeviceToken();
        const { data: trustData } = await checkSessionTrust(deviceToken);

        if (!isMounted) return;

        if (trustData?.is_trusted === true && trustData?.requires_otp === false) {
          const { data: gate } = await getLoginGateStatus();
          if (gate?.role === "admin") {
            try {
              await signOut();
            } catch {
              // ignore
            }
            return;
          }
          // Fully trusted session -> route to dashboard
          await handleAuthenticatedUser(session.user);
        } else {
          // Unverified / untrusted session found on mount (e.g. from signup or stale state).
          // Do NOT auto-trigger OTP. Cleanly sign out so user performs an explicit sign-in.
          try {
            await signOut();
          } catch {
            // ignore
          }
        }
      } catch {
        // Fallback to normal login form
      }
    }

    checkSessionOnMount();
    return () => {
      isMounted = false;
    };
  }, []);

  function handleChange(e) {
    const { name, value } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
    setError("");
    setInfoMessage("");
  }

  async function handleAuthenticatedUser(user) {
    let role;
    let isSuspended = false;

    if (isDevMode()) {
      role = resolveRole(user?.role, user?.user_metadata?.role);
      isSuspended = isAccountSuspended(user || user?.user_metadata);
      setCurrentUser({
        id:                    user.id,
        email:                 user.email,
        role,
        full_name:             user?.full_name || user?.user_metadata?.full_name || "",
        is_suspended:          isSuspended,
        suspension_expires_at: user?.suspension_expires_at || null,
      });
    } else {
      // PRODUCTION / REAL SUPABASE: fetch authoritative profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, full_name, email, profile_picture_url, is_suspended, verification_status, suspension_reason_code, suspension_expires_at, suspended_at")
        .eq("id", user.id)
        .maybeSingle();

      role = resolveRole(profile?.role, user?.user_metadata?.role);
      isSuspended = isAccountSuspended(profile);

      setCurrentUser({
        id:                    user.id,
        email:                 profile?.email || user.email,
        role,
        full_name:             profile?.full_name || user?.user_metadata?.full_name || "",
        profile_picture_url:   profile?.profile_picture_url || "",
        is_suspended:          isSuspended,
        suspension_expires_at: profile?.suspension_expires_at || null,
        suspension_reason_code: profile?.suspension_reason_code || null,
      });
    }

    if (isSuspended && role !== "admin") {
      navigate("/account-suspended");
      return;
    }

    if (redirectTo) {
      navigate(redirectTo);
      return;
    }

    const path = getDashboardPath(role);
    navigate(path === "/" ? "/candidate/dashboard" : path);
  }

  // ─── PRIMARY LOGIN FLOW: Email + Password ─────────────────────────────────

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    if (!formData.email.trim() || !formData.password) {
      setError("Please enter your email and password.");
      return;
    }

    setLoading(true);
    setError(null);
    setInfoMessage("");

    try {
      // 1. Authenticate password with GoTrue
      const { data: authData, error: signInError } = await signIn(formData.email, formData.password);

      if (signInError) {
        if (signInError.message?.toLowerCase().includes("email not confirmed")) {
          setError("Please confirm your email before signing in. Check your inbox for the confirmation link.");
        } else if (signInError.message?.toLowerCase().includes("invalid login credentials")) {
          setError("Invalid email or password. Please try again.");
        } else {
          setError("Invalid email or password. Please try again.");
        }
        return;
      }

      if (!authData?.user) {
        setError("Unable to authenticate session. Please try again.");
        return;
      }

      // 2. Authoritative Login Gate Check
      const { data: gate } = await getLoginGateStatus();

      // REJECT ADMIN FROM REGULAR SIGN-IN
      if (gate?.role === "admin") {
        try {
          await signOut();
        } catch {
          // ignore
        }
        setError("This is an administrator account. Please use the Admin sign-in page.");
        return;
      }

      if (gate?.is_suspended) {
        navigate("/account-suspended");
        return;
      }

      if (gate && gate.profile_exists === false) {
        // Safe redirect to onboarding if profile is not initialized
        navigate("/sign-up");
        return;
      }

      // 3. Adaptive Device Trust Check
      const deviceToken = getOrCreateDeviceToken();
      const { data: trustData, error: trustError } = await checkSessionTrust(deviceToken);

      if (trustError) {
        setError("Security check failed. Please try again.");
        return;
      }

      if (trustData?.is_trusted === true && trustData?.requires_otp === false) {
        // TRUSTED DEVICE: Route directly to dashboard without OTP
        await handleAuthenticatedUser(authData.user);
        return;
      }

      // 4. UNTRUSTED DEVICE: Trigger Adaptive Email Verification Challenge
      const { data: reqData, error: reqError } = await requestLoginVerification();

      if (reqError) {
        if (reqError.status === 429 || reqError.message?.includes("RESEND_COOLDOWN_ACTIVE")) {
          setError("Please wait a moment before requesting another verification code.");
        } else {
          setError("We couldn't send the verification code. Please try again.");
        }
        return;
      }

      if (!reqData?.challenge_id) {
        setError("Failed to initialize verification challenge. Please try again.");
        return;
      }

      setChallengeId(reqData.challenge_id);
      setOtpCooldown(reqData.cooldown_seconds || 60);
      setMaskedEmail(maskEmail(formData.email));
      setOtpCode("");
      setRememberDevice(true);
      setViewMode("verify_otp");
    } catch (unexpectedError) {
      console.error("Unexpected error during login:", unexpectedError);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ─── ADAPTIVE STEP-UP OTP VERIFICATION FLOW ────────────────────────────────

  async function handleVerifyOtpSubmit(e) {
    e.preventDefault();
    const cleanCode = otpCode.trim();

    if (!cleanCode || !/^\d{6}$/.test(cleanCode)) {
      setError("Please enter the exact 6-digit verification code sent to your email.");
      return;
    }

    if (!challengeId) {
      setError("Verification challenge expired. Please sign in again.");
      return;
    }

    setLoading(true);
    setError(null);
    setInfoMessage("");

    try {
      const deviceToken = getOrCreateDeviceToken();
      const deviceName = getDeviceName();

      const { data: verifyData, error: verifyError } = await verifyLoginVerification({
        challengeId,
        otp: cleanCode,
        rememberDevice,
        deviceToken,
        deviceName,
      });

      if (verifyError) {
        setError("The verification code is invalid or has expired.");
        return;
      }

      if (!verifyData || verifyData.verified !== true) {
        setError("The verification code is invalid or has expired.");
        return;
      }

      // Step-Up Verification Succeeded -> Refresh session and route to dashboard
      const { data: { session } } = await supabase.auth.getSession();
      const currentUser = session?.user || { email: formData.email };
      await handleAuthenticatedUser(currentUser);
    } catch (unexpectedError) {
      console.error("Unexpected error during OTP verification:", unexpectedError);
      setError("Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ─── RESEND OTP ─────────────────────────────────────────────────────────────

  async function handleResendOtp() {
    if (otpCooldown > 0 || loading) return;

    setLoading(true);
    setError(null);
    setInfoMessage("");

    try {
      const { data: reqData, error: reqError } = await requestLoginVerification();

      if (reqError) {
        if (reqError.status === 429 || reqError.message?.includes("RESEND_COOLDOWN_ACTIVE")) {
          setError("Please wait before requesting another code.");
        } else {
          setError("We couldn't send the verification code. Please try again.");
        }
        return;
      }

      if (reqData?.challenge_id) {
        setChallengeId(reqData.challenge_id);
        setOtpCooldown(reqData.cooldown_seconds || 60);
        setInfoMessage("A new verification code has been sent to your email.");
      }
    } catch {
      setError("Failed to resend code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ─── BACK / CANCEL VERIFICATION ─────────────────────────────────────────────

  async function handleCancelVerification() {
    setLoading(true);
    try {
      // Invalidate the unverified Supabase password session so no orphan session persists
      await signOut();
    } catch {
      // Session cleanup fallback
    } finally {
      setViewMode("credentials");
      setChallengeId(null);
      setOtpCode("");
      setError(null);
      setInfoMessage("");
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
          <div className="signin-card">
            {/* VIEW 1: Primary Email + Password Login Form */}
            {viewMode === "credentials" && (
              <>
                <div className="signin-card-header">
                  <span>Sign In</span>
                  <h2>Welcome back</h2>
                  <p>Sign in to continue your SkillSync journey.</p>
                </div>

                {error && <div className="signin-error">{error}</div>}
                {infoMessage && <div className="otp-info-msg">{infoMessage}</div>}

                <form onSubmit={handlePasswordSubmit} className="signin-form-grid">
                  <label>
                    <span>Email address</span>
                    <input
                      type="email"
                      name="email"
                      placeholder="you@example.com"
                      value={formData.email}
                      onChange={handleChange}
                      autoComplete="email"
                      required
                    />
                  </label>

                  <label>
                    <span className="signin-password-header">
                      <span>Password</span>
                      <Link to="/forgot-password" className="signin-forgot-link">
                        Forgot password?
                      </Link>
                    </span>
                    <input
                      type="password"
                      name="password"
                      placeholder="Enter password"
                      value={formData.password}
                      onChange={handleChange}
                      autoComplete="current-password"
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
                </form>

                <p className="signin-footer-text">
                  New to SkillSync? <Link to="/sign-up">Create an account</Link>
                </p>
              </>
            )}

            {/* VIEW 2: Adaptive Step-Up OTP Verification Card */}
            {viewMode === "verify_otp" && (
              <>
                <div className="signin-card-header">
                  <span>Security Verification</span>
                  <h2>Verify your identity</h2>
                  <p>
                    We sent a 6-digit verification code to:{" "}
                    <strong>{maskedEmail}</strong>
                  </p>
                </div>

                {error && <div className="signin-error">{error}</div>}
                {infoMessage && <div className="otp-info-msg">{infoMessage}</div>}

                <form onSubmit={handleVerifyOtpSubmit} className="signin-form-grid">
                  <label>
                    <span>Enter 6-digit verification code</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      className="otp-input-field"
                      placeholder="••••••"
                      value={otpCode}
                      onChange={(e) => {
                        setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                        setError("");
                      }}
                      autoFocus
                      required
                    />
                  </label>

                  <label className="otp-remember-checkbox-label">
                    <input
                      type="checkbox"
                      checked={rememberDevice}
                      onChange={(e) => setRememberDevice(e.target.checked)}
                      className="otp-remember-checkbox"
                    />
                    <span>Trust this device for 30 days</span>
                  </label>

                  <div className="otp-resend-row">
                    <span>Didn't receive code?</span>
                    {otpCooldown > 0 ? (
                      <span className="otp-cooldown-text">Resend in {otpCooldown}s</span>
                    ) : (
                      <button
                        type="button"
                        className="otp-resend-btn"
                        onClick={handleResendOtp}
                        disabled={loading}
                      >
                        Resend code
                      </button>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="signin-submit-btn"
                    disabled={loading || otpCode.length < 6}
                  >
                    {loading ? "Verifying..." : "Verify Code"}
                  </button>

                  <button
                    type="button"
                    className="otp-cancel-btn"
                    onClick={handleCancelVerification}
                    disabled={loading}
                  >
                    Back to Sign In
                  </button>
                </form>
              </>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
