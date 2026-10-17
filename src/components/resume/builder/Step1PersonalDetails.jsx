import React from "react";

export default function Step1PersonalDetails({ data, onChange }) {
  const details = data?.personalDetails || {};

  function handleFieldChange(field, value) {
    onChange({
      ...data,
      personalDetails: {
        ...details,
        [field]: value
      }
    });
  }

  return (
    <div className="builder-step-section">
      <div className="step-intro-card">
        <div className="step-intro-icon" aria-hidden="true">👤</div>
        <div className="step-intro-text">
          <h3>Personal Details</h3>
          <p>
            Start with your contact information so employers know who you are and how to reach you.
            Only your full name is required to complete your resume.
          </p>
        </div>
      </div>

      <div className="builder-form-grid">
        {/* Full Name */}
        <div className="form-group full-width">
          <label htmlFor="fullName" className="form-label required">
            Full Name <span className="label-badge required">Required</span>
          </label>
          <input
            id="fullName"
            type="text"
            className="form-input"
            placeholder="e.g. Maria Clara Santos"
            value={details.fullName || ""}
            onChange={(e) => handleFieldChange("fullName", e.target.value)}
            required
            autoComplete="name"
          />
          <span className="field-hint">Enter your name as you would like it to appear on your resume.</span>
        </div>

        {/* Account Email */}
        <div className="form-group">
          <label htmlFor="email" className="form-label">
            Email Address <span className="label-badge optional">Account Email</span>
          </label>
          <input
            id="email"
            type="email"
            className="form-input"
            placeholder="name@example.com"
            value={details.email || ""}
            onChange={(e) => handleFieldChange("email", e.target.value)}
            autoComplete="email"
          />
          <span className="field-hint">Primary email for job applications and updates.</span>
        </div>

        {/* Phone Number */}
        <div className="form-group">
          <label htmlFor="phone" className="form-label">
            Phone Number <span className="label-badge optional">Optional</span>
          </label>
          <input
            id="phone"
            type="tel"
            className="form-input"
            placeholder="e.g. +63 917 555 0192"
            value={details.phone || ""}
            onChange={(e) => handleFieldChange("phone", e.target.value)}
            autoComplete="tel"
          />
          <span className="field-hint">Mobile or landline number for recruiter calls.</span>
        </div>

        {/* City / Location */}
        <div className="form-group">
          <label htmlFor="city" className="form-label">
            City / Municipality <span className="label-badge optional">Optional</span>
          </label>
          <input
            id="city"
            type="text"
            className="form-input"
            placeholder="e.g. Quezon City, Metro Manila"
            value={details.city || ""}
            onChange={(e) => handleFieldChange("city", e.target.value)}
            autoComplete="address-level2"
          />
        </div>

        {/* Region / Province */}
        <div className="form-group">
          <label htmlFor="region" className="form-label">
            Province / Region <span className="label-badge optional">Optional</span>
          </label>
          <input
            id="region"
            type="text"
            className="form-input"
            placeholder="e.g. National Capital Region (NCR)"
            value={details.region || ""}
            onChange={(e) => handleFieldChange("region", e.target.value)}
            autoComplete="address-level1"
          />
        </div>

        {/* LinkedIn */}
        <div className="form-group">
          <label htmlFor="linkedin" className="form-label">
            LinkedIn Profile <span className="label-badge optional">Optional</span>
          </label>
          <input
            id="linkedin"
            type="url"
            className="form-input"
            placeholder="https://linkedin.com/in/yourprofile"
            value={details.linkedin || ""}
            onChange={(e) => handleFieldChange("linkedin", e.target.value)}
          />
        </div>

        {/* GitHub / Portfolio */}
        <div className="form-group">
          <label htmlFor="github" className="form-label">
            GitHub / Portfolio <span className="label-badge optional">Optional</span>
          </label>
          <input
            id="github"
            type="url"
            className="form-input"
            placeholder="https://github.com/yourusername"
            value={details.github || ""}
            onChange={(e) => handleFieldChange("github", e.target.value)}
          />
        </div>

        {/* Additional Website / Portfolio */}
        <div className="form-group full-width">
          <label htmlFor="portfolio" className="form-label">
            Personal Website or Portfolio Link <span className="label-badge optional">Optional</span>
          </label>
          <input
            id="portfolio"
            type="url"
            className="form-input"
            placeholder="https://yourportfolio.dev"
            value={details.portfolio || ""}
            onChange={(e) => handleFieldChange("portfolio", e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
