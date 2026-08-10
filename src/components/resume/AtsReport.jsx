import React, { useMemo } from 'react';
import { getScoreRating, logPerfMetric } from '../../services/parser/utils/uiHelpers.js';

export const AtsReport = React.memo(({ atsData }) => {
  const t0 = performance.now();

  const score = atsData?.score ?? 0;
  const grade = atsData?.grade?.letter ?? 'N/A';
  const gradeDesc = atsData?.grade?.description ?? 'No evaluation details.';
  
  const ruleResults = atsData?.ruleResults || [];
  const feedback = atsData?.feedback || { critical: [], recommended: [], strengths: [] };

  const rating = useMemo(() => getScoreRating(score), [score]);

  // Safe SVG circle calculation
  const radius = 32;
  const circumference = 2 * Math.PI * radius; // ≈ 201
  const strokeDashoffset = circumference - (score / 100) * circumference;

  React.useEffect(() => {
    logPerfMetric('AtsReport render', t0);
  });

  return (
    <div 
      className="ats-report-panel"
      role="tabpanel" 
      id="panel-ats" 
      aria-labelledby="tab-ats"
    >
      <div className="ats-score-showcase">
        {/* Accessible Progress Gauge */}
        <div className="ats-gauge-container">
          <svg 
            width="120" 
            height="120" 
            viewBox="0 0 80 80"
            role="progressbar"
            aria-valuenow={score}
            aria-valuemin="0"
            aria-valuemax="100"
            aria-label={`Resume ATS score: ${score}%`}
          >
            <circle className="resume-score-circle-bg" cx="40" cy="40" r={radius} />
            <circle 
              className="resume-score-circle-bar" 
              cx="40" 
              cy="40" 
              r={radius} 
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
            />
          </svg>
          <div className="ats-score-overlay">
            <span className="ats-score-num">{score}</span>
            <span className="ats-score-lbl">Score</span>
          </div>
        </div>

        <div className="ats-grade-display">
          <div className="ats-grade-badge">Grade: {grade}</div>
          <div className={`ats-rating-tag ${rating.class}`}>{rating.label}</div>
          <p className="ats-grade-desc">{gradeDesc}</p>
        </div>
      </div>

      {/* Rules Breakdown */}
      <div className="ats-feedback-sections">
        {/* Critical Warnings */}
        {feedback.critical?.length > 0 && (
          <div className="ats-feedback-card critical">
            <h4>🚨 Critical Improvements Required</h4>
            <ul>
              {feedback.critical.map((item, idx) => (
                <li key={item.id || idx}>
                  <strong>{item.category}:</strong> {item.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Recommended Actions */}
        {feedback.recommended?.length > 0 && (
          <div className="ats-feedback-card recommended">
            <h4>💡 Recommended Enhancements</h4>
            <ul>
              {feedback.recommended.map((item, idx) => (
                <li key={item.id || idx}>
                  <strong>{item.category}:</strong> {item.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Strengths */}
        {feedback.strengths?.length > 0 && (
          <div className="ats-feedback-card strengths">
            <h4>🌟 Resume Strengths</h4>
            <ul>
              {feedback.strengths.map((item, idx) => (
                <li key={item.id || idx}>
                  <strong>{item.category}:</strong> {item.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Empty State Fallback */}
        {feedback.critical?.length === 0 && feedback.recommended?.length === 0 && feedback.strengths?.length === 0 && (
          <p className="ats-empty-feedback">
            No matching rule results or suggestions available. Try re-uploading your resume.
          </p>
        )}
      </div>
    </div>
  );
});

AtsReport.displayName = 'AtsReport';
export default AtsReport;
