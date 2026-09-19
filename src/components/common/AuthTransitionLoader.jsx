import React, { useState, useEffect } from "react";
import "./AuthTransitionLoader.css";

/**
 * Reusable AuthTransitionLoader
 * Pure CSS transition overlay for navigation between public pages and auth routes.
 * 
 * Variants:
 *  - "signin": Lavender / purple palette
 *  - "signup": Light pink / purple palette
 * 
 * Includes subtle text progression across the 3.5-second buffer:
 *  - 0–1200ms: "Opening Sign In..." / "Opening Sign Up..."
 *  - 1200–2400ms: "Preparing your secure session..." / "Preparing your registration page..."
 *  - 2400ms+: "Almost ready..."
 */
export default function AuthTransitionLoader({
  type = "signin",
  isVisible = false,
  isExiting = false,
}) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!isVisible) {
      setStep(0);
      return;
    }

    setStep(0);
    const timer1 = setTimeout(() => setStep(1), 1200);
    const timer2 = setTimeout(() => setStep(2), 2400);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [isVisible]);

  if (!isVisible) return null;

  const isSignUp = type === "signup";

  let titleText = isSignUp ? "Opening Sign Up..." : "Opening Sign In...";
  if (step === 1) {
    titleText = isSignUp ? "Preparing your registration page..." : "Preparing your secure session...";
  } else if (step === 2) {
    titleText = "Almost ready...";
  }

  const statusAriaText = isSignUp ? "Opening Sign Up page" : "Opening Sign In page";

  return (
    <div
      className={`auth-transition-overlay ${isSignUp ? "theme-signup" : "theme-signin"} ${isExiting ? "is-exiting" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={statusAriaText}
    >
      <div className={`auth-transition-card ${isExiting ? "is-exiting" : ""}`}>
        {/* Brand Header with Entrance Animation */}
        <div className="auth-transition-brand">
          <div className="auth-transition-brand-icon" aria-hidden="true">
            ✓
          </div>
          <div className="auth-transition-brand-text">
            <strong>SkillSync</strong>
            <small>Find the right match</small>
          </div>
        </div>

        {/* Animated Circular Loader */}
        <div className="auth-transition-spinner-wrap" aria-hidden="true">
          <div className="auth-transition-spinner-ring"></div>
          <div className="auth-transition-spinner-core"></div>
        </div>

        {/* Status Messaging with Staggered Entrance & Dynamic Progression */}
        <div className="auth-transition-copy">
          <h2 key={step} className="auth-transition-title text-step-change">
            {titleText}
          </h2>
          <p className="auth-transition-subtext">This won't take long.</p>
        </div>

        {/* Sequential Animated Loading Dots */}
        <div className="auth-transition-dots" aria-hidden="true">
          <span className="auth-dot auth-dot-1"></span>
          <span className="auth-dot auth-dot-2"></span>
          <span className="auth-dot auth-dot-3"></span>
        </div>

        {/* Visually hidden screen reader status */}
        <span className="auth-transition-sr-only">{statusAriaText}</span>
      </div>
    </div>
  );
}
