import React, { useState, useMemo } from "react";

const SUGGESTED_SKILL_CATEGORIES = {
  "Software & Development": [
    "JavaScript", "TypeScript", "React", "Node.js", "Python", "HTML", "CSS", "SQL",
    "PostgreSQL", "Git", "REST APIs", "Docker", "Java", "PHP", "C#", "Next.js"
  ],
  "Office & Business Tools": [
    "Microsoft Excel", "Microsoft Word", "Microsoft PowerPoint", "Google Workspace",
    "Data Entry", "QuickBooks", "Customer Support", "CRM", "Canva", "Report Writing"
  ],
  "Transferable Skills": [
    "Communication", "Problem Solving", "Teamwork", "Time Management", "Adaptability",
    "Attention to Detail", "Critical Thinking", "Organization", "Customer Service"
  ],
  "Specialized & Industry": [
    "Accounting", "Bookkeeping", "AutoCAD", "Figma", "UI/UX Design", "Social Media Marketing",
    "Content Writing", "Video Editing", "Project Management", "Inventory Management"
  ]
};

const PROFICIENCY_OPTIONS = [
  "Comfortable",
  "Proficient",
  "Advanced",
  "Familiar / Learning"
];

export default function Step3Skills({ data, onChange }) {
  const skills = data?.skills || [];
  const [skillInput, setSkillInput] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Software & Development");
  const [searchFilter, setSearchFilter] = useState("");
  const [editingSkillId, setEditingSkillId] = useState(null);
  const [editContext, setEditContext] = useState("");
  const [editProficiency, setEditProficiency] = useState("");

  const existingSkillNamesLower = useMemo(() => {
    return new Set(skills.map(s => (typeof s === "string" ? s.toLowerCase() : s.name.toLowerCase())));
  }, [skills]);

  function handleAddCustomSkill(e) {
    if (e) e.preventDefault();
    const trimmed = skillInput.trim();
    if (!trimmed) return;

    if (existingSkillNamesLower.has(trimmed.toLowerCase())) {
      setSkillInput("");
      return;
    }

    const newSkillObj = {
      id: `skill-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: trimmed,
      category: selectedCategory || "General",
      proficiency: "Comfortable",
      context: ""
    };

    onChange({
      ...data,
      skills: [...skills, newSkillObj]
    });
    setSkillInput("");
  }

  function handleAddSuggestedSkill(skillName, category) {
    if (existingSkillNamesLower.has(skillName.toLowerCase())) return;

    const newSkillObj = {
      id: `skill-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: skillName,
      category: category,
      proficiency: "Comfortable",
      context: ""
    };

    onChange({
      ...data,
      skills: [...skills, newSkillObj]
    });
  }

  function handleRemoveSkill(skillId) {
    const updated = skills.filter(s => (typeof s === "string" ? s !== skillId : s.id !== skillId));
    onChange({
      ...data,
      skills: updated
    });
  }

  function handleStartEditSkill(skill) {
    setEditingSkillId(skill.id);
    setEditContext(skill.context || "");
    setEditProficiency(skill.proficiency || "Comfortable");
  }

  function handleSaveEditSkill(skillId) {
    const updated = skills.map(s => {
      if (s.id === skillId) {
        return {
          ...s,
          context: editContext.trim(),
          proficiency: editProficiency
        };
      }
      return s;
    });

    onChange({
      ...data,
      skills: updated
    });
    setEditingSkillId(null);
  }

  // Filter suggested skills based on search
  const filteredSuggestions = useMemo(() => {
    const q = searchFilter.trim().toLowerCase();
    const currentCategorySkills = SUGGESTED_SKILL_CATEGORIES[selectedCategory] || [];
    if (!q) return currentCategorySkills;
    return currentCategorySkills.filter(s => s.toLowerCase().includes(q));
  }, [selectedCategory, searchFilter]);

  return (
    <div className="builder-step-section">
      <div className="step-intro-card">
        <div className="step-intro-icon" aria-hidden="true">💡</div>
        <div className="step-intro-text">
          <h3>Skills</h3>
          <p>
            What can you do? Add skills, tools, software, languages, and other abilities you're comfortable using.
            You can select common skills below or type your own.
          </p>
        </div>
      </div>

      {/* Custom Skill Input */}
      <form onSubmit={handleAddCustomSkill} className="custom-skill-bar">
        <div className="skill-input-wrap">
          <input
            type="text"
            className="form-input"
            placeholder="Type a skill and press Enter (e.g. React, Bookkeeping, Customer Care)..."
            value={skillInput}
            onChange={(e) => setSkillInput(e.target.value)}
          />
          <button
            type="submit"
            className="builder-action-btn primary add-skill-btn"
            disabled={!skillInput.trim()}
          >
            + Add Skill
          </button>
        </div>
      </form>

      {/* Selected Skills List */}
      <div className="selected-skills-container">
        <div className="section-label-row">
          <h4 className="skills-subheading">
            Your Skills ({skills.length})
          </h4>
          {skills.length === 0 && (
            <span className="skills-hint-badge">No skills added yet — select from suggestions below</span>
          )}
        </div>

        {skills.length > 0 ? (
          <div className="selected-skills-tags-grid">
            {skills.map((skill) => {
              const skillId = typeof skill === "string" ? skill : skill.id;
              const skillName = typeof skill === "string" ? skill : skill.name;
              const skillCategory = skill.category || "Skill";
              const skillProf = skill.proficiency;
              const skillContext = skill.context;
              const isBeingEdited = editingSkillId === skillId;

              return (
                <div key={skillId} className={`skill-tag-chip ${isBeingEdited ? "editing" : ""}`}>
                  {!isBeingEdited ? (
                    <>
                      <div className="skill-chip-main">
                        <span className="skill-chip-name">{skillName}</span>
                        {skillCategory && <span className="skill-chip-category">{skillCategory}</span>}
                        {skillContext && <span className="skill-chip-context">({skillContext})</span>}
                      </div>
                      <div className="skill-chip-actions">
                        <button
                          type="button"
                          className="skill-chip-edit-btn"
                          onClick={() => handleStartEditSkill(skill)}
                          title="Add details or proficiency"
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          className="skill-chip-remove-btn"
                          onClick={() => handleRemoveSkill(skillId)}
                          title="Remove skill"
                          aria-label={`Remove ${skillName}`}
                        >
                          ×
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="skill-chip-edit-box">
                      <div className="edit-box-header">
                        <strong>Edit {skillName}</strong>
                      </div>
                      <div className="edit-box-row">
                        <select
                          className="form-select small"
                          value={editProficiency}
                          onChange={(e) => setEditProficiency(e.target.value)}
                        >
                          {PROFICIENCY_OPTIONS.map(p => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          className="form-input small"
                          placeholder="Where used? (e.g. Capstone, Freelance, 2 yrs)"
                          value={editContext}
                          onChange={(e) => setEditContext(e.target.value)}
                        />
                      </div>
                      <div className="edit-box-actions">
                        <button
                          type="button"
                          className="builder-action-btn primary small"
                          onClick={() => handleSaveEditSkill(skillId)}
                        >
                          Done
                        </button>
                        <button
                          type="button"
                          className="builder-action-btn outline small"
                          onClick={() => setEditingSkillId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="skills-empty-state">
            <p>Adding 3 to 10 skills helps match your resume with the right job opportunities.</p>
          </div>
        )}
      </div>

      {/* Skill Suggestions & Categories */}
      <div className="suggested-skills-panel">
        <div className="suggestions-header">
          <div className="suggestions-categories-tabs">
            {Object.keys(SUGGESTED_SKILL_CATEGORIES).map(cat => (
              <button
                key={cat}
                type="button"
                className={`category-tab-btn ${selectedCategory === cat ? "active" : ""}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="suggestions-filter-wrap">
            <input
              type="text"
              className="suggestions-filter-input"
              placeholder="Search category suggestions..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
            />
          </div>
        </div>

        <div className="suggested-chips-grid">
          {filteredSuggestions.map((sug) => {
            const isAdded = existingSkillNamesLower.has(sug.toLowerCase());
            return (
              <button
                key={sug}
                type="button"
                className={`suggestion-chip ${isAdded ? "added" : ""}`}
                onClick={() => !isAdded && handleAddSuggestedSkill(sug, selectedCategory)}
                disabled={isAdded}
                title={isAdded ? "Already added to your skills" : `Add ${sug}`}
              >
                {isAdded ? "✓ " : "+ "}{sug}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
