import React, { useState } from "react";
import { WORK_TYPE_OPTIONS } from "../../../services/resumeBuilderService";

const EMPTY_EXP_ENTRY = {
  title: "",
  organization: "",
  workType: "Employment",
  startDate: "",
  endDate: "",
  isCurrent: false,
  responsibilities: "",
  achievements: ""
};

export default function Step4Experience({ data, onChange }) {
  const experience = data?.experience || { noExperience: false, entries: [] };
  const entries = experience.entries || [];

  const [isEditing, setIsEditing] = useState(false);
  const [editingIndex, setEditingIndex] = useState(-1);
  const [entryForm, setEntryForm] = useState(EMPTY_EXP_ENTRY);

  function handleToggleNoExperience() {
    const nextVal = !experience.noExperience;
    onChange({
      ...data,
      experience: {
        ...experience,
        noExperience: nextVal,
        entries: nextVal ? [] : experience.entries
      }
    });
  }

  function handleStartAdd() {
    setEditingIndex(-1);
    setEntryForm({
      ...EMPTY_EXP_ENTRY,
      id: `exp-${Date.now()}`
    });
    setIsEditing(true);
  }

  function handleStartEdit(index) {
    setEditingIndex(index);
    setEntryForm({ ...entries[index] });
    setIsEditing(true);
  }

  function handleRemove(index) {
    const updated = entries.filter((_, i) => i !== index);
    onChange({
      ...data,
      experience: {
        ...experience,
        entries: updated
      }
    });
  }

  function handleSaveEntry(e) {
    e.preventDefault();
    if (!entryForm.title.trim()) return;

    let updated;
    if (editingIndex >= 0) {
      updated = [...entries];
      updated[editingIndex] = entryForm;
    } else {
      updated = [...entries, { ...entryForm, id: entryForm.id || `exp-${Date.now()}` }];
    }

    onChange({
      ...data,
      experience: {
        noExperience: false,
        entries: updated
      }
    });

    setIsEditing(false);
    setEditingIndex(-1);
    setEntryForm(EMPTY_EXP_ENTRY);
  }

  function handleCancel() {
    setIsEditing(false);
    setEditingIndex(-1);
    setEntryForm(EMPTY_EXP_ENTRY);
  }

  return (
    <div className="builder-step-section">
      <div className="step-intro-card">
        <div className="step-intro-icon" aria-hidden="true">💼</div>
        <div className="step-intro-text">
          <h3>Experience</h3>
          <p>
            Jobs aren't the only experience that counts. You can include internships, freelance work,
            volunteer work, part-time work, and relevant informal work.
          </p>
        </div>
      </div>

      {/* No Work Experience Toggle */}
      <div className="builder-card-toggle">
        <label className="toggle-checkbox-label">
          <input
            type="checkbox"
            checked={Boolean(experience.noExperience)}
            onChange={handleToggleNoExperience}
          />
          <span className="toggle-text">
            <strong>I don't have work experience yet</strong>
            <small>That's completely okay! We will highlight your education, skills, and projects instead.</small>
          </span>
        </label>
      </div>

      {!experience.noExperience && (
        <div className="repeatable-entries-block">
          {entries.length === 0 && !isEditing && (
            <div className="entries-empty-hint">
              <span className="empty-hint-icon">📂</span>
              <p>No work experience entries added yet.</p>
              <button
                type="button"
                className="builder-action-btn primary"
                onClick={handleStartAdd}
              >
                + Add Experience
              </button>
            </div>
          )}

          {/* List of saved entries */}
          {entries.length > 0 && (
            <div className="entries-card-list">
              {entries.map((entry, idx) => (
                <div key={entry.id || idx} className="entry-card-item">
                  <div className="entry-card-main">
                    <div className="entry-card-header">
                      <h4 className="entry-title">{entry.title}</h4>
                      <span className="entry-status-tag experience">
                        {entry.workType || "Employment"}
                      </span>
                    </div>
                    <div className="entry-sub-line">
                      {entry.organization && <strong>{entry.organization} • </strong>}
                      <span>
                        {entry.startDate || "Start"} – {entry.isCurrent ? "Present" : (entry.endDate || "End")}
                      </span>
                    </div>
                    {entry.responsibilities && (
                      <p className="entry-description">{entry.responsibilities}</p>
                    )}
                    {entry.achievements && (
                      <p className="entry-description achievements">
                        <strong>Key Achievement:</strong> {entry.achievements}
                      </p>
                    )}
                  </div>
                  <div className="entry-card-actions">
                    <button
                      type="button"
                      className="entry-btn edit"
                      onClick={() => handleStartEdit(idx)}
                      title="Edit this experience entry"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="entry-btn remove"
                      onClick={() => handleRemove(idx)}
                      title="Remove this experience entry"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}

              {!isEditing && (
                <button
                  type="button"
                  className="builder-action-btn secondary add-another"
                  onClick={handleStartAdd}
                >
                  + Add Another Experience
                </button>
              )}
            </div>
          )}

          {/* Add / Edit Form */}
          {isEditing && (
            <form onSubmit={handleSaveEntry} className="entry-edit-form">
              <h4 className="form-subheading">
                {editingIndex >= 0 ? "Edit Experience Entry" : "Add Experience Entry"}
              </h4>

              <div className="builder-form-grid">
                <div className="form-group full-width">
                  <label htmlFor="exp-title" className="form-label required">
                    Job or Role Title <span className="label-badge required">Required</span>
                  </label>
                  <input
                    id="exp-title"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Registered Nurse, Accounting Staff, Front Desk Associate, Electrician, Sales Associate"
                    value={entryForm.title || ""}
                    onChange={(e) => setEntryForm({ ...entryForm, title: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="exp-organization" className="form-label">
                    Company, Organization, or Client <span className="label-badge optional">Optional</span>
                  </label>
                  <input
                    id="exp-organization"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Accenture Philippines, Freelance / Self-employed, Local Barangay Office"
                    value={entryForm.organization || ""}
                    onChange={(e) => setEntryForm({ ...entryForm, organization: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="exp-work-type" className="form-label">
                    Work Type
                  </label>
                  <select
                    id="exp-work-type"
                    className="form-select"
                    value={entryForm.workType || WORK_TYPE_OPTIONS[0]}
                    onChange={(e) => setEntryForm({ ...entryForm, workType: e.target.value })}
                  >
                    {WORK_TYPE_OPTIONS.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="exp-start-date" className="form-label">
                    Start Date <span className="label-badge optional">Optional</span>
                  </label>
                  <input
                    id="exp-start-date"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Jan 2023 or 2023"
                    value={entryForm.startDate || ""}
                    onChange={(e) => setEntryForm({ ...entryForm, startDate: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="exp-end-date" className="form-label">
                    End Date <span className="label-badge optional">Optional</span>
                  </label>
                  <input
                    id="exp-end-date"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Dec 2024 or 2024"
                    disabled={entryForm.isCurrent}
                    value={entryForm.isCurrent ? "Present" : (entryForm.endDate || "")}
                    onChange={(e) => setEntryForm({ ...entryForm, endDate: e.target.value })}
                  />
                  <label className="checkbox-sublabel" style={{ marginTop: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <input
                      type="checkbox"
                      checked={Boolean(entryForm.isCurrent)}
                      onChange={(e) => setEntryForm({ ...entryForm, isCurrent: e.target.checked, endDate: e.target.checked ? "" : entryForm.endDate })}
                    />
                    <span>I currently work in this role</span>
                  </label>
                </div>

                <div className="form-group full-width">
                  <label htmlFor="exp-responsibilities" className="form-label">
                    Responsibilities & Tasks <span className="label-badge optional">Optional</span>
                  </label>
                  <textarea
                    id="exp-responsibilities"
                    className="form-textarea"
                    rows={3}
                    placeholder="Describe what you worked on, tools you used, or services you provided..."
                    value={entryForm.responsibilities || ""}
                    onChange={(e) => setEntryForm({ ...entryForm, responsibilities: e.target.value })}
                  />
                </div>

                <div className="form-group full-width">
                  <label htmlFor="exp-achievements" className="form-label">
                    Key Achievements or Results <span className="label-badge optional">Optional</span>
                  </label>
                  <input
                    id="exp-achievements"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Handled 50+ customer inquiries daily with 98% positive rating; Built frontend for 3 client websites"
                    value={entryForm.achievements || ""}
                    onChange={(e) => setEntryForm({ ...entryForm, achievements: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-button-row">
                <button type="submit" className="builder-action-btn primary">
                  {editingIndex >= 0 ? "Save Changes" : "Save Experience"}
                </button>
                <button type="button" className="builder-action-btn outline" onClick={handleCancel}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
