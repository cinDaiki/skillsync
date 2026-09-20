import React from "react";
import "./SkillSyncLogo.css";

/**
 * SkillSyncLogo
 * Exact canonical SkillSync brand logo matching live production:
 * - 36px rounded square icon with 2px solid border, 11px radius, and checkmark mark
 * - "SkillSync" bold header + "Find the right match" subtext
 * 
 * Used for authentication loaders without altering existing page-level logo markup.
 */
export default function SkillSyncLogo({ className = "", variant = "purple" }) {
  return (
    <div className={`skillsync-brand-logo variant-${variant} ${className}`.trim()}>
      <div className="skillsync-brand-icon" aria-hidden="true">
        ✓
      </div>
      <div className="skillsync-brand-text">
        <strong>SkillSync</strong>
        <small>Find the right match</small>
      </div>
    </div>
  );
}
