import React from 'react';
import { logPerfMetric } from '../../services/parser/utils/uiHelpers.js';

export const ResumeMetadata = React.memo(({ details }) => {
  const t0 = performance.now();

  React.useEffect(() => {
    logPerfMetric('ResumeMetadata render', t0);
  });

  if (!details) {
    return (
      <div 
        className="resume-metadata-panel empty"
        role="tabpanel"
        id="panel-meta"
        aria-labelledby="tab-meta"
      >
        <p className="meta-empty-text">No metadata information available.</p>
      </div>
    );
  }

  return (
    <div 
      className="resume-metadata-panel"
      role="tabpanel" 
      id="panel-meta" 
      aria-labelledby="tab-meta"
    >
      <div className="meta-info-grid">
        {/* Degree */}
        <div className="meta-info-item">
          <span className="meta-info-icon" aria-hidden="true">🎓</span>
          <div className="meta-info-content">
            <span className="meta-info-label">Degree</span>
            <span className="meta-info-value">
              {details.degree || <span className="meta-val-missing">Not detected</span>}
            </span>
          </div>
        </div>

        {/* Course */}
        <div className="meta-info-item">
          <span className="meta-info-icon" aria-hidden="true">📚</span>
          <div className="meta-info-content">
            <span className="meta-info-label">Course / Major</span>
            <span className="meta-info-value">
              {details.course || <span className="meta-val-missing">Not detected</span>}
            </span>
          </div>
        </div>

        {/* Experience */}
        <div className="meta-info-item">
          <span className="meta-info-icon" aria-hidden="true">💼</span>
          <div className="meta-info-content">
            <span className="meta-info-label">Years of Experience</span>
            <span className="meta-info-value">
              {details.yearsOfExperience > 0 
                ? `${details.yearsOfExperience}+ years` 
                : (details.hasExperienceSection 
                    ? 'Experience section found' 
                    : <span className="meta-val-missing">Not explicitly stated</span>
                  )
              }
            </span>
          </div>
        </div>

        {/* Contact Info */}
        <div className="meta-info-item">
          <span className="meta-info-icon" aria-hidden="true">📧</span>
          <div className="meta-info-content">
            <span className="meta-info-label">Validated Contacts</span>
            <span className="meta-info-value">
              {details.email || details.phone ? (
                <span className="meta-val-verified">
                  {[details.email, details.phone].filter(Boolean).join(' · ')}
                </span>
              ) : (
                details.hasContact 
                  ? <span className="meta-val-verified">Contact info found</span> 
                  : <span className="meta-val-warning">No verified contact coordinates</span>
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

ResumeMetadata.displayName = 'ResumeMetadata';
export default ResumeMetadata;
