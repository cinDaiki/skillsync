import React, { useState } from "react";
import { EDUCATION_LEVEL_OPTIONS, EDUCATION_STATUS_OPTIONS } from "../../../services/resumeBuilderService";

const EMPTY_ENTRY = {
  institution: "",
  level: "College/university graduate",
  courseOrProgram: "",
  status: "Completed",
  startYear: "",
  endYear: "",
  courseworkAndAchievements: ""
};

export default function Step2Education({ data, onChange }) {
  const education = data?.education || { noFormalEducation: false, entries: [] };
  const entries = education.entries || [];

  const [isEditing, setIsEditing] = useState(false);
  const [editingIndex, setEditingIndex] = useState(-1);
  const [entryForm, setEntryForm] = useState(EMPTY_ENTRY);

  function handleToggleNoFormalEducation() {
    const nextVal = !education.noFormalEducation;
    onChange({
      ...data,
      education: {
        ...education,
        noFormalEducation: nextVal,
        entries: nextVal ? [] : education.entries
      }
    });
  }

  function handleStartAdd() {
    setEditingIndex(-1);
    setEntryForm({
      ...EMPTY_ENTRY,
      id: `edu-${Date.now()}`
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
      education: {
        ...education,
        entries: updated
      }
    });
  }

  function handleSaveEntry(e) {
    e.preventDefault();
    if (!entryForm.institution.trim()) return;

    let updated;
    if (editingIndex >= 0) {
      updated = [...entries];
      updated[editingIndex] = entryForm;
    } else {
      updated = [...entries, { ...entryForm, id: entryForm.id || `edu-${Date.now()}` }];
    }

    onChange({
      ...data,
      education: {
        noFormalEducation: false,
        entries: updated
      }
    });

    setIsEditing(false);
    setEditingIndex(-1);
    setEntryForm(EMPTY_ENTRY);
  }

  function handleCancel() {
    setIsEditing(false);
    setEditingIndex(-1);
    setEntryForm(EMPTY_ENTRY);
  }

  return (
    <div className="builder-step-section">
      <div className="step-intro-card">
        <div className="step-intro-icon" aria-hidden="true">🎓</div>
        <div className="step-intro-text">
          <h3>Education & Training</h3>
          <p>
            Tell us about your education or training. Add any school, college, vocational course,
            TESDA training, or other education you've attended. You can still include it if you haven't completed it.
          </p>
        </div>
      </div>

      {/* No Formal Schooling Toggle */}
      <div className="builder-card-toggle">
        <label className="toggle-checkbox-label">
          <input
            type="checkbox"
            checked={Boolean(education.noFormalEducation)}
            onChange={handleToggleNoFormalEducation}
          />
          <span className="toggle-text">
            <strong>No formal schooling to report</strong>
            <small>Select this if you developed your abilities through self-learning, work, or practical life experience.</small>
          </span>
        </label>
      </div>

      {!education.noFormalEducation && (
        <div className="repeatable-entries-block">
          {entries.length === 0 && !isEditing && (
            <div className="entries-empty-hint">
              <span className="empty-hint-icon">📚</span>
              <p>No education or training entries added yet.</p>
              <button
                type="button"
                className="builder-action-btn primary"
                onClick={handleStartAdd}
              >
                + Add Education or Training
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
                      <h4 className="entry-title">{entry.institution}</h4>
                      <span className={`entry-status-tag ${entry.status?.toLowerCase().replace(/\s+/g, "-")}`}>
                        {entry.status}
                      </span>
                    </div>
                    <div className="entry-sub-line">
                      <strong>{entry.level}</strong>
                      {entry.courseOrProgram && ` • ${entry.courseOrProgram}`}
                      {(entry.startYear || entry.endYear) && (
                        <span> • {entry.startYear || "Start"} – {entry.endYear || (entry.status === "Currently Studying" ? "Present" : "End")}</span>
                      )}
                    </div>
                    {entry.courseworkAndAchievements && (
                      <p className="entry-description">{entry.courseworkAndAchievements}</p>
                    )}
                  </div>
                  <div className="entry-card-actions">
                    <button
                      type="button"
                      className="entry-btn edit"
                      onClick={() => handleStartEdit(idx)}
                      title="Edit this education entry"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="entry-btn remove"
                      onClick={() => handleRemove(idx)}
                      title="Remove this education entry"
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
                  + Add Another School or Training
                </button>
              )}
            </div>
          )}

          {/* Add / Edit Form Modal / Inline Form */}
          {isEditing && (
            <form onSubmit={handleSaveEntry} className="entry-edit-form">
              <h4 className="form-subheading">
                {editingIndex >= 0 ? "Edit Education or Training Entry" : "Add Education or Training Entry"}
              </h4>

              <div className="builder-form-grid">
                <div className="form-group full-width">
                  <label htmlFor="edu-institution" className="form-label required">
                    School, Institution, or Training Provider <span className="label-badge required">Required</span>
                  </label>
                  <input
                    id="edu-institution"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Polytechnic University of the Philippines, TESDA Women's Center"
                    value={entryForm.institution || ""}
                    onChange={(e) => setEntryForm({ ...entryForm, institution: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="edu-level" className="form-label">
                    Education Level or Program Type
                  </label>
                  <select
                    id="edu-level"
                    className="form-select"
                    value={entryForm.level || EDUCATION_LEVEL_OPTIONS[0]}
                    onChange={(e) => setEntryForm({ ...entryForm, level: e.target.value })}
                  >
                    {EDUCATION_LEVEL_OPTIONS.map((lvl) => (
                      <option key={lvl} value={lvl}>{lvl}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="edu-status" className="form-label">
                    Completion Status
                  </label>
                  <select
                    id="edu-status"
                    className="form-select"
                    value={entryForm.status || EDUCATION_STATUS_OPTIONS[0]}
                    onChange={(e) => setEntryForm({ ...entryForm, status: e.target.value })}
                  >
                    {EDUCATION_STATUS_OPTIONS.map((st) => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                  <span className="field-hint">Clearly distinguishes attended studies from completed degrees.</span>
                </div>

                <div className="form-group full-width">
                  <label htmlFor="edu-course" className="form-label">
                    Degree, Program, Major, Strand, or Training Course
                  </label>
                  <input
                    id="edu-course"
                    type="text"
                    className="form-input"
                    placeholder="e.g. BS Computer Science, General Academic Strand (GAS), Web Development NC III"
                    value={entryForm.courseOrProgram || ""}
                    onChange={(e) => setEntryForm({ ...entryForm, courseOrProgram: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="edu-start-year" className="form-label">
                    Start Year <span className="label-badge optional">Optional</span>
                  </label>
                  <input
                    id="edu-start-year"
                    type="text"
                    className="form-input"
                    placeholder="e.g. 2020"
                    value={entryForm.startYear || ""}
                    onChange={(e) => setEntryForm({ ...entryForm, startYear: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="edu-end-year" className="form-label">
                    End Year or Expected Graduation <span className="label-badge optional">Optional</span>
                  </label>
                  <input
                    id="edu-end-year"
                    type="text"
                    className="form-input"
                    placeholder={entryForm.status === "Currently Studying" ? "e.g. 2026 (Expected)" : "e.g. 2024"}
                    value={entryForm.endYear || ""}
                    onChange={(e) => setEntryForm({ ...entryForm, endYear: e.target.value })}
                  />
                </div>

                <div className="form-group full-width">
                  <label htmlFor="edu-achievements" className="form-label">
                    Relevant Coursework, Projects, or Honors <span className="label-badge optional">Optional</span>
                  </label>
                  <textarea
                    id="edu-achievements"
                    className="form-textarea"
                    rows={3}
                    placeholder="e.g. Capstone Project: Community Health Portal, Dean's List (2022-2023), Relevant Coursework: Data Structures, UI Design"
                    value={entryForm.courseworkAndAchievements || ""}
                    onChange={(e) => setEntryForm({ ...entryForm, courseworkAndAchievements: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-button-row">
                <button type="submit" className="builder-action-btn primary">
                  {editingIndex >= 0 ? "Save Changes" : "Save Entry"}
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
