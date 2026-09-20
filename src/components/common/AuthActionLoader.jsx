import React from "react";
import SkillSyncLogo from "./SkillSyncLogo";
import "./AuthActionLoader.css";

/**
 * AuthActionLoader
 * Branded full-screen loading buffer for real login submissions and session logout.
 * 
 * Features:
 * - Exact canonical SkillSync brand logo
 * - Synchronous spinner ring + pulsing core dot
 * - 3-phase sequential bouncing dots
 * - State-aware messaging matching actual authentication reality:
 *     Login Pending: "Signing you in..." / "Validating your credentials..."
 *     Login Success: "Signing you in..." / "Preparing your secure session..."
 *     Login Final:   "Almost ready..." / "Redirecting to your dashboard..."
 *     Logout Start:  "Signing you out..." / "Ending your session securely..."
 *     Logout Final:  "Almost done..." / "See you again soon!"
 * - prefers-reduced-motion accessibility support
 */
export default function AuthActionLoader({
  isVisible = false,
  isExiting = false,
  mode = "login", // "login" | "logout"
  stage = "pending", // "pending" | "success" | "ready" | "logout_initial" | "logout_final"
}) {
  if (!isVisible) return null;

  const isLogin = mode === "login";

  let headline = "Signing you in...";
  let supporting = "Validating your credentials...";

  if (isLogin) {
    if (stage === "pending") {
      headline = "Signing you in...";
      supporting = "Validating your credentials...";
    } else if (stage === "success") {
      headline = "Signing you in...";
      supporting = "Preparing your secure session...";
    } else if (stage === "ready") {
      headline = "Almost ready...";
      supporting = "Redirecting to your dashboard...";
    }
  } else {
    // Logout flow
    if (stage === "logout_initial") {
      headline = "Signing you out...";
      supporting = "Ending your session securely...";
    } else {
      headline = "Almost done...";
      supporting = "See you again soon!";
    }
  }

  const ariaStatus = `${headline} ${supporting}`;

  return (
    <div
      className={`auth-action-overlay ${isLogin ? "theme-login" : "theme-logout"} ${
        isExiting ? "is-exiting" : ""
      }`}
      role="status"
      aria-live="polite"
      aria-label={ariaStatus}
      id="auth-action-loader-overlay"
    >
      <div className={`auth-action-card ${isExiting ? "is-exiting" : ""}`}>
        {/* Canonical SkillSync Logo */}
        <div className="auth-action-logo-wrap">
          <SkillSyncLogo variant="purple" />
        </div>

        {/* Circular Spinner with Pulsing Core */}
        <div className="auth-action-spinner-wrap" aria-hidden="true">
          <div className="auth-action-spinner-ring"></div>
          <div className="auth-action-spinner-core"></div>
        </div>

        {/* Dynamic State-Aware Copy */}
        <div className="auth-action-copy">
          <h2 key={headline} className="auth-action-title text-step-change">
            {headline}
          </h2>
          <p key={supporting} className="auth-action-subtext text-step-change">
            {supporting}
          </p>
        </div>

        {/* Sequential Animated Loading Dots */}
        <div className="auth-action-dots" aria-hidden="true">
          <span className="auth-action-dot auth-action-dot-1"></span>
          <span className="auth-action-dot auth-action-dot-2"></span>
          <span className="auth-action-dot auth-action-dot-3"></span>
        </div>

        {/* Visually hidden screen reader status */}
        <span className="auth-action-sr-only">{ariaStatus}</span>
      </div>
    </div>
  );
}
