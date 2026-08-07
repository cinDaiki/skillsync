import React, { useMemo } from 'react';
import { groupSkillsByCategory, logPerfMetric } from '../../services/parser/utils/uiHelpers.js';

export const SkillDictionary = React.memo(({ skills }) => {
  const t0 = performance.now();

  const grouped = useMemo(() => groupSkillsByCategory(skills), [skills]);

  // Helper to color confidence labels
  const getConfidenceStyle = (conf) => {
    if (conf >= 90) return { background: '#dcfce7', color: '#15803d' }; // high (green)
    if (conf >= 70) return { background: '#fef9c3', color: '#a16207' }; // medium (yellow)
    return { background: '#fee2e2', color: '#b91c1c' }; // low (red)
  };

  React.useEffect(() => {
    logPerfMetric('SkillDictionary render', t0);
  });

  const categories = Object.keys(grouped);

  if (categories.length === 0) {
    return (
      <div 
        className="skills-dictionary-panel empty"
        role="tabpanel"
        id="panel-skills"
        aria-labelledby="tab-skills"
      >
        <p className="skills-empty-text">No skills detected. Try adding skills in the tags field!</p>
      </div>
    );
  }

  return (
    <div 
      className="skills-dictionary-panel"
      role="tabpanel" 
      id="panel-skills" 
      aria-labelledby="tab-skills"
    >
      <div className="skills-category-grid">
        {categories.map(category => (
          <div key={category} className="skills-category-card">
            <h4>{category}</h4>
            <div className="skills-badge-list">
              {grouped[category].map((skill, index) => {
                const confStyle = getConfidenceStyle(skill.confidenceScore);
                return (
                  <div key={`${skill.canonicalName}-${index}`} className="rich-skill-badge">
                    <span className="skill-badge-name">{skill.canonicalName}</span>
                    <div className="skill-badge-details">
                      {skill.occurrences > 1 && (
                        <span className="skill-badge-occurrences" title={`${skill.occurrences} occurrences found`}>
                          {skill.occurrences}×
                        </span>
                      )}
                      <span 
                        className="skill-badge-confidence" 
                        style={confStyle}
                        title={`Detection confidence: ${skill.confidenceScore}%`}
                      >
                        {skill.confidenceScore}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

SkillDictionary.displayName = 'SkillDictionary';
export default SkillDictionary;
