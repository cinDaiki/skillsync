import React, { useState, useMemo } from "react";

export const SUGGESTED_SKILL_CATEGORIES = {
  "General & Transferable": [
    "Communication", "Teamwork", "Organization", "Leadership", "Problem Solving",
    "Time Management", "Adaptability", "Attention to Detail", "Critical Thinking",
    "Conflict Resolution", "Interpersonal Skills", "Work Ethic"
  ],
  "Business & Administration": [
    "Office Administration", "Records Management", "Data Entry", "Scheduling",
    "Document Preparation", "Procurement", "Customer Coordination", "Microsoft Office",
    "Google Workspace", "Business Correspondence", "Filing Systems", "Inventory Tracking"
  ],
  "Accounting & Finance": [
    "Bookkeeping", "Accounts Payable", "Accounts Receivable", "Payroll Processing",
    "Financial Reporting", "Auditing", "QuickBooks", "Microsoft Excel", "Tax Preparation",
    "Bank Reconciliation", "Cost Accounting", "Invoicing"
  ],
  "Sales & Customer Service": [
    "Customer Service", "Sales", "Lead Generation", "POS Operation", "CRM",
    "Merchandising", "Client Relations", "Cash Handling", "Upselling", "Product Knowledge",
    "Call Center Operations", "Customer Retention"
  ],
  "Healthcare & Caregiving": [
    "Patient Care", "Vital Signs Monitoring", "First Aid", "Caregiving",
    "Medical Terminology", "Health Documentation", "Infection Control", "Patient Assessment",
    "Medication Administration", "Elderly Care", "CPR", "Patient Hygiene"
  ],
  "Education & Training": [
    "Lesson Planning", "Classroom Management", "Tutoring", "Educational Assessment",
    "Curriculum Support", "Presentation", "Student Engagement", "Instructional Design",
    "Special Education Support", "E-Learning", "Public Speaking"
  ],
  "Hospitality & Tourism": [
    "Front Desk Operations", "Food Service", "Housekeeping", "Reservations Management",
    "Guest Relations", "Event Assistance", "Food Safety & Sanitation", "Bartending",
    "Barista", "Menu Knowledge", "Hotel Reception", "Concierge Services"
  ],
  "Engineering & Technical": [
    "AutoCAD", "Drafting", "Electrical Systems", "Electronics", "Mechanical Maintenance",
    "Quality Control", "Technical Drawing", "Troubleshooting", "SolidWorks",
    "Safety Compliance", "Circuit Testing", "HVAC Maintenance"
  ],
  "Construction & Skilled Trades": [
    "Carpentry", "Welding", "Plumbing", "Masonry", "Electrical Installation",
    "Heavy Equipment Operation", "Safety Procedures", "Blueprint Reading",
    "Painting", "Drywall Installation", "Pipefitting", "Scaffolding"
  ],
  "Information Technology & Digital": [
    "Technical Support", "Networking", "Databases", "Web Development", "Cybersecurity",
    "JavaScript", "React", "Python", "HTML & CSS", "SQL", "Git / GitHub",
    "System Administration", "Cloud Fundamentals", "Troubleshooting Hardware"
  ],
  "Logistics & Warehousing": [
    "Inventory Management", "Receiving", "Dispatch", "Stock Control", "Warehouse Operations",
    "Order Fulfillment", "Forklift Operation", "Shipping Documentation", "Supply Chain",
    "Packing & Crating", "Logistics Planning"
  ],
  "Manufacturing & Operations": [
    "Machine Operation", "Production Monitoring", "Quality Inspection", "Assembly Line",
    "Process Improvement", "5S Methodology", "Equipment Maintenance", "Preventive Maintenance",
    "Packaging", "Lean Manufacturing"
  ],
  "Creative & Media": [
    "Graphic Design", "Photography", "Video Editing", "Content Writing", "Social Media Management",
    "Canva", "Adobe Photoshop", "Copywriting", "Digital Illustration", "Brand Identity",
    "Audio Editing", "Storyboarding"
  ],
  "Agriculture & Environment": [
    "Crop Management", "Animal Care", "Environmental Monitoring", "Farm Operations",
    "Sustainability Practices", "Horticulture", "Pest Management", "Soil Testing",
    "Irrigation Management", "Harvesting"
  ],
  "Languages": [
    "English", "Filipino", "Cebuano", "Ilocano", "Hiligaynon", "Spanish",
    "Mandarin Chinese", "Japanese", "Arabic"
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
  const [selectedCategory, setSelectedCategory] = useState("General & Transferable");
  const [searchFilter, setSearchFilter] = useState("");
  const [editingSkillId, setEditingSkillId] = useState(null);
  const [editContext, setEditContext] = useState("");
  const [editProficiency, setEditProficiency] = useState("");

  const existingSkillNamesLower = useMemo(() => {
    return new Set(skills.map(s => (typeof s === "string" ? s.toLowerCase() : s.name.toLowerCase())));
  }, [skills]);

  // Global search across ALL categories simultaneously
  const visibleSkills = useMemo(() => {
    const q = searchFilter.trim().toLowerCase();
    if (q) {
      const results = [];
      Object.entries(SUGGESTED_SKILL_CATEGORIES).forEach(([cat, list]) => {
        list.forEach(skill => {
          if (skill.toLowerCase().includes(q) && !results.some(r => r.name.toLowerCase() === skill.toLowerCase())) {
            results.push({ name: skill, category: cat });
          }
        });
      });
      return results;
    }

    if (selectedCategory === "All") {
      const results = [];
      Object.entries(SUGGESTED_SKILL_CATEGORIES).forEach(([cat, list]) => {
        list.forEach(skill => {
          if (!results.some(r => r.name.toLowerCase() === skill.toLowerCase())) {
            results.push({ name: skill, category: cat });
          }
        });
      });
      return results;
    }

    const list = SUGGESTED_SKILL_CATEGORIES[selectedCategory] || [];
    return list.map(skill => ({ name: skill, category: selectedCategory }));
  }, [searchFilter, selectedCategory]);

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
      category: selectedCategory === "All" ? "General & Transferable" : selectedCategory,
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

  function handleStartEdit(skill) {
    const sId = typeof skill === "string" ? skill : skill.id;
    setEditingSkillId(sId);
    setEditProficiency((typeof skill === "object" && skill.proficiency) || "Comfortable");
    setEditContext((typeof skill === "object" && skill.context) || "");
  }

  function handleSaveEdit(skillId) {
    const updated = skills.map(s => {
      const currentId = typeof s === "string" ? s : s.id;
      if (currentId === skillId) {
        return {
          ...(typeof s === "string" ? { id: s, name: s, category: "General" } : s),
          proficiency: editProficiency,
          context: editContext.trim()
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

  return (
    <section className="builder-step-section" aria-labelledby="step3-heading">
      <div className="step-intro-card">
        <div className="step-intro-icon" aria-hidden="true">💡</div>
        <div className="step-intro-text">
          <h3 id="step3-heading">Skills</h3>
          <p>
            Add your core skills, industry capabilities, and transferable strengths.
            Search across all industries, browse curated categories, or type any custom skill.
          </p>
        </div>
      </div>

      <div className="form-card-container">
        {/* Custom Skill Input */}
        <div className="skill-input-bar">
          <form onSubmit={handleAddCustomSkill} className="skill-add-form">
            <input
              type="text"
              className="form-input skill-text-field"
              placeholder="Type any skill and press Enter (e.g. Patient Care, Bookkeeping, Customer Service, AutoCAD)..."
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              aria-label="Add custom skill"
            />
            <button
              type="submit"
              className="builder-action-btn primary"
              disabled={!skillInput.trim()}
            >
              + Add Skill
            </button>
          </form>
        </div>

        {/* Selected Skills Chips */}
        <div className="selected-skills-wrapper">
          <div className="selected-skills-header">
            <h4>Your Added Skills ({skills.length})</h4>
            {skills.length === 0 && (
              <span className="skills-guidance-note">
                Add 3–10 skills to help employers find your strengths.
              </span>
            )}
          </div>

          {skills.length > 0 ? (
            <div className="skills-badge-grid" role="list">
              {skills.map((skill, idx) => {
                const sName = typeof skill === "string" ? skill : skill.name;
                const sId = typeof skill === "string" ? skill : (skill.id || `skill-${idx}`);
                const sProf = typeof skill === "object" ? skill.proficiency : "Comfortable";
                const sContext = typeof skill === "object" ? skill.context : "";
                const isEditing = editingSkillId === sId;

                return (
                  <div key={sId} className={`skill-pill-card ${isEditing ? "editing" : ""}`} role="listitem">
                    <div className="skill-pill-main">
                      <span className="skill-pill-name">{sName}</span>
                      {sProf && <span className="skill-pill-prof">{sProf}</span>}
                      {sContext && <span className="skill-pill-ctx">"{sContext}"</span>}
                    </div>
                    <div className="skill-pill-actions">
                      <button
                        type="button"
                        className="pill-btn edit"
                        onClick={() => handleStartEdit(skill)}
                        title="Edit proficiency or add context"
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="pill-btn remove"
                        onClick={() => handleRemoveSkill(sId)}
                        title="Remove skill"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Inline edit drawer */}
                    {isEditing && (
                      <div className="skill-edit-drawer">
                        <div className="drawer-row">
                          <label className="drawer-label">Proficiency:</label>
                          <select
                            className="form-select small"
                            value={editProficiency}
                            onChange={(e) => setEditProficiency(e.target.value)}
                          >
                            {PROFICIENCY_OPTIONS.map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        </div>
                        <div className="drawer-row">
                          <label className="drawer-label">Context / Tool (Optional):</label>
                          <input
                            type="text"
                            className="form-input small"
                            placeholder="e.g. 2 years experience, certified, or used in capstone"
                            value={editContext}
                            onChange={(e) => setEditContext(e.target.value)}
                          />
                        </div>
                        <div className="drawer-actions">
                          <button
                            type="button"
                            className="builder-action-btn primary small"
                            onClick={() => handleSaveEdit(sId)}
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="no-skills-yet">
              No skills added yet. Select from the categories below or type your own skills above.
            </p>
          )}
        </div>

        {/* Global Skill Search & Category Selector */}
        <div className="skills-suggestion-desk">
          <div className="suggestion-desk-header">
            <h4>Explore Skills Across Career Fields</h4>
            <div className="search-skills-wrap">
              <input
                type="text"
                className="form-input search-skills-input"
                placeholder="Search skills in all industries (e.g. Vital Signs, QuickBooks, Welding, Electrical)..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                aria-label="Search skills across all categories"
              />
              {searchFilter && (
                <button
                  type="button"
                  className="clear-search-btn"
                  onClick={() => setSearchFilter("")}
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Category Tabs (Active when not searching) */}
          {!searchFilter && (
            <div className="skill-categories-tabs" role="tablist">
              <button
                type="button"
                className={`category-tab-btn ${selectedCategory === "All" ? "active" : ""}`}
                onClick={() => setSelectedCategory("All")}
              >
                All Industries
              </button>
              {Object.keys(SUGGESTED_SKILL_CATEGORIES).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`category-tab-btn ${selectedCategory === cat ? "active" : ""}`}
                  onClick={() => setSelectedCategory(cat)}
                  role="tab"
                  aria-selected={selectedCategory === cat}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/* Suggestions Grid */}
          <div className="suggested-chips-grid">
            {visibleSkills.length > 0 ? (
              visibleSkills.map((item) => {
                const isSelected = existingSkillNamesLower.has(item.name.toLowerCase());
                return (
                  <button
                    key={`${item.category}-${item.name}`}
                    type="button"
                    className={`suggested-skill-chip ${isSelected ? "selected" : ""}`}
                    onClick={() => handleAddSuggestedSkill(item.name, item.category)}
                    disabled={isSelected}
                    title={isSelected ? "Already added" : `Add ${item.name} (${item.category})`}
                  >
                    <span className="chip-plus">{isSelected ? "✓" : "+"}</span>
                    <span className="chip-name">{item.name}</span>
                    {searchFilter && <span className="chip-cat-tag">{item.category}</span>}
                  </button>
                );
              })
            ) : (
              <div className="no-search-results">
                <p>No matching skills found for "{searchFilter}".</p>
                <button
                  type="button"
                  className="builder-action-btn primary small"
                  onClick={handleAddCustomSkill}
                >
                  Add "{searchFilter}" as Custom Skill
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
