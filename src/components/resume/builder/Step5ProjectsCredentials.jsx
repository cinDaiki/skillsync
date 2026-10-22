import React, { useState } from "react";

export default function Step5ProjectsCredentials({ data, onChange }) {
  const pData = data?.projectsAndCredentials || {
    projects: [],
    certifications: [],
    training: [],
    awards: []
  };

  const [activeTab, setActiveTab] = useState("projects"); // 'projects' | 'certifications' | 'training' | 'awards'
  const [editingType, setEditingType] = useState(null);
  const [editingIndex, setEditingIndex] = useState(-1);

  // Forms
  const [projectForm, setProjectForm] = useState({ title: "", role: "", tools: "", link: "", description: "" });
  const [certForm, setCertForm] = useState({ name: "", issuer: "", issueDate: "", credentialId: "", url: "" });
  const [trainForm, setTrainForm] = useState({ title: "", provider: "", dateOrYear: "", description: "" });
  const [awardForm, setAwardForm] = useState({ title: "", issuer: "", year: "", description: "" });

  // ── Projects Handlers ─────────────────────────────
  function startAddProject() {
    setEditingType("projects");
    setEditingIndex(-1);
    setProjectForm({ title: "", role: "", tools: "", link: "", description: "" });
  }

  function startEditProject(idx) {
    setEditingType("projects");
    setEditingIndex(idx);
    const item = pData.projects[idx] || {};
    setProjectForm({
      title: item.title || "",
      role: item.role || "",
      tools: Array.isArray(item.tools) ? item.tools.join(", ") : (item.tools || ""),
      link: item.link || "",
      description: item.description || ""
    });
  }

  function removeProject(idx) {
    const updated = (pData.projects || []).filter((_, i) => i !== idx);
    onChange({
      ...data,
      projectsAndCredentials: { ...pData, projects: updated },
      _projectsSectionReviewed: true
    });
  }

  function saveProject(e) {
    e.preventDefault();
    if (!projectForm.title.trim()) return;

    const entry = {
      id: editingIndex >= 0 ? pData.projects[editingIndex].id : `proj-${Date.now()}`,
      title: projectForm.title.trim(),
      role: projectForm.role.trim(),
      tools: projectForm.tools ? projectForm.tools.split(",").map(t => t.trim()).filter(Boolean) : [],
      link: projectForm.link.trim(),
      description: projectForm.description.trim()
    };

    let updatedList;
    if (editingIndex >= 0) {
      updatedList = [...pData.projects];
      updatedList[editingIndex] = entry;
    } else {
      updatedList = [...(pData.projects || []), entry];
    }

    onChange({
      ...data,
      projectsAndCredentials: { ...pData, projects: updatedList },
      _projectsSectionReviewed: true
    });
    setEditingType(null);
  }

  // ── Certifications Handlers ───────────────────────
  function startAddCert() {
    setEditingType("certifications");
    setEditingIndex(-1);
    setCertForm({ name: "", issuer: "", issueDate: "", credentialId: "", url: "" });
  }

  function startEditCert(idx) {
    setEditingType("certifications");
    setEditingIndex(idx);
    const item = pData.certifications[idx] || {};
    setCertForm({ ...item });
  }

  function removeCert(idx) {
    const updated = (pData.certifications || []).filter((_, i) => i !== idx);
    onChange({
      ...data,
      projectsAndCredentials: { ...pData, certifications: updated },
      _projectsSectionReviewed: true
    });
  }

  function saveCert(e) {
    e.preventDefault();
    if (!certForm.name.trim()) return;

    const entry = {
      id: editingIndex >= 0 ? pData.certifications[editingIndex].id : `cert-${Date.now()}`,
      ...certForm
    };

    let updatedList;
    if (editingIndex >= 0) {
      updatedList = [...pData.certifications];
      updatedList[editingIndex] = entry;
    } else {
      updatedList = [...(pData.certifications || []), entry];
    }

    onChange({
      ...data,
      projectsAndCredentials: { ...pData, certifications: updatedList },
      _projectsSectionReviewed: true
    });
    setEditingType(null);
  }

  // ── Training Handlers ─────────────────────────────
  function startAddTraining() {
    setEditingType("training");
    setEditingIndex(-1);
    setTrainForm({ title: "", provider: "", dateOrYear: "", description: "" });
  }

  function startEditTraining(idx) {
    setEditingType("training");
    setEditingIndex(idx);
    const item = pData.training[idx] || {};
    setTrainForm({ ...item });
  }

  function removeTraining(idx) {
    const updated = (pData.training || []).filter((_, i) => i !== idx);
    onChange({
      ...data,
      projectsAndCredentials: { ...pData, training: updated },
      _projectsSectionReviewed: true
    });
  }

  function saveTraining(e) {
    e.preventDefault();
    if (!trainForm.title.trim()) return;

    const entry = {
      id: editingIndex >= 0 ? pData.training[editingIndex].id : `train-${Date.now()}`,
      ...trainForm
    };

    let updatedList;
    if (editingIndex >= 0) {
      updatedList = [...pData.training];
      updatedList[editingIndex] = entry;
    } else {
      updatedList = [...(pData.training || []), entry];
    }

    onChange({
      ...data,
      projectsAndCredentials: { ...pData, training: updatedList },
      _projectsSectionReviewed: true
    });
    setEditingType(null);
  }

  // ── Awards Handlers ───────────────────────────────
  function startAddAward() {
    setEditingType("awards");
    setEditingIndex(-1);
    setAwardForm({ title: "", issuer: "", year: "", description: "" });
  }

  function startEditAward(idx) {
    setEditingType("awards");
    setEditingIndex(idx);
    const item = pData.awards[idx] || {};
    setAwardForm({ ...item });
  }

  function removeAward(idx) {
    const updated = (pData.awards || []).filter((_, i) => i !== idx);
    onChange({
      ...data,
      projectsAndCredentials: { ...pData, awards: updated },
      _projectsSectionReviewed: true
    });
  }

  function saveAward(e) {
    e.preventDefault();
    if (!awardForm.title.trim()) return;

    const entry = {
      id: editingIndex >= 0 ? pData.awards[editingIndex].id : `award-${Date.now()}`,
      ...awardForm
    };

    let updatedList;
    if (editingIndex >= 0) {
      updatedList = [...pData.awards];
      updatedList[editingIndex] = entry;
    } else {
      updatedList = [...(pData.awards || []), entry];
    }

    onChange({
      ...data,
      projectsAndCredentials: { ...pData, awards: updatedList },
      _projectsSectionReviewed: true
    });
    setEditingType(null);
  }

  return (
    <div className="builder-step-section">
      <div className="step-intro-card">
        <div className="step-intro-icon" aria-hidden="true">🏆</div>
        <div className="step-intro-text">
          <h3>Projects & Credentials</h3>
          <p>
            Showcase school projects, personal apps, certifications, workshops, and honors.
            All sections here are completely optional — feel free to add what you have or skip to review.
          </p>
        </div>
      </div>

      {/* Tab Selectors for the 4 Subsections */}
      <div className="subtabs-navigation">
        <button
          type="button"
          className={`subtab-btn ${activeTab === "projects" ? "active" : ""}`}
          onClick={() => { setActiveTab("projects"); setEditingType(null); }}
        >
          <span>📁</span> Projects ({pData.projects?.length || 0})
        </button>
        <button
          type="button"
          className={`subtab-btn ${activeTab === "certifications" ? "active" : ""}`}
          onClick={() => { setActiveTab("certifications"); setEditingType(null); }}
        >
          <span>📜</span> Certifications & Licenses ({pData.certifications?.length || 0})
        </button>
        <button
          type="button"
          className={`subtab-btn ${activeTab === "training" ? "active" : ""}`}
          onClick={() => { setActiveTab("training"); setEditingType(null); }}
        >
          <span>🛠️</span> Training & Workshops ({pData.training?.length || 0})
        </button>
        <button
          type="button"
          className={`subtab-btn ${activeTab === "awards" ? "active" : ""}`}
          onClick={() => { setActiveTab("awards"); setEditingType(null); }}
        >
          <span>🎖️</span> Awards & Recognition ({pData.awards?.length || 0})
        </button>
      </div>

      {/* ── Subtab 1: Projects ────────────────────────── */}
      {activeTab === "projects" && (
        <div className="subtab-content-panel">
          <div className="panel-instruction">
            <p>Add school capstones, personal side projects, client websites, or open-source contributions.</p>
          </div>

          {(pData.projects || []).length === 0 && editingType !== "projects" && (
            <div className="entries-empty-hint">
              <span className="empty-hint-icon">💻</span>
              <p>No projects added yet.</p>
              <button type="button" className="builder-action-btn primary" onClick={startAddProject}>
                + Add Project
              </button>
            </div>
          )}

          {(pData.projects || []).length > 0 && (
            <div className="entries-card-list">
              {pData.projects.map((proj, idx) => (
                <div key={proj.id || idx} className="entry-card-item">
                  <div className="entry-card-main">
                    <div className="entry-card-header">
                      <h4 className="entry-title">{proj.title}</h4>
                      {proj.role && <span className="entry-status-tag project">{proj.role}</span>}
                    </div>
                    {proj.link && (
                      <div className="entry-link-line">
                        <a href={proj.link} target="_blank" rel="noopener noreferrer">{proj.link}</a>
                      </div>
                    )}
                    {proj.description && <p className="entry-description">{proj.description}</p>}
                    {proj.tools && proj.tools.length > 0 && (
                      <div className="entry-tools-line">
                        <strong>Tools:</strong> {Array.isArray(proj.tools) ? proj.tools.join(", ") : proj.tools}
                      </div>
                    )}
                  </div>
                  <div className="entry-card-actions">
                    <button type="button" className="entry-btn edit" onClick={() => startEditProject(idx)}>Edit</button>
                    <button type="button" className="entry-btn remove" onClick={() => removeProject(idx)}>Remove</button>
                  </div>
                </div>
              ))}

              {editingType !== "projects" && (
                <button type="button" className="builder-action-btn secondary add-another" onClick={startAddProject}>
                  + Add Another Project
                </button>
              )}
            </div>
          )}

          {editingType === "projects" && (
            <form onSubmit={saveProject} className="entry-edit-form">
              <h4 className="form-subheading">{editingIndex >= 0 ? "Edit Project" : "Add Project"}</h4>
              <div className="builder-form-grid">
                <div className="form-group full-width">
                  <label htmlFor="proj-title" className="form-label required">
                    Project Title <span className="label-badge required">Required</span>
                  </label>
                  <input
                    id="proj-title"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Barangay Record Management System, Portfolio Site"
                    value={projectForm.title}
                    onChange={(e) => setProjectForm({ ...projectForm, title: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="proj-role" className="form-label">
                    Your Role / Contribution <span className="label-badge optional">Optional</span>
                  </label>
                  <input
                    id="proj-role"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Lead Developer, UI Designer, Solo Creator"
                    value={projectForm.role}
                    onChange={(e) => setProjectForm({ ...projectForm, role: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="proj-link" className="form-label">
                    Live Demo or GitHub Link <span className="label-badge optional">Optional</span>
                  </label>
                  <input
                    id="proj-link"
                    type="url"
                    className="form-input"
                    placeholder="https://github.com/username/project"
                    value={projectForm.link}
                    onChange={(e) => setProjectForm({ ...projectForm, link: e.target.value })}
                  />
                </div>
                <div className="form-group full-width">
                  <label htmlFor="proj-tools" className="form-label">
                    Tools / Technologies Used <span className="label-badge optional">Optional</span>
                  </label>
                  <input
                    id="proj-tools"
                    type="text"
                    className="form-input"
                    placeholder="e.g. React, Node.js, PostgreSQL, Figma (comma-separated)"
                    value={projectForm.tools}
                    onChange={(e) => setProjectForm({ ...projectForm, tools: e.target.value })}
                  />
                </div>
                <div className="form-group full-width">
                  <label htmlFor="proj-desc" className="form-label">
                    Description & Outcomes <span className="label-badge optional">Optional</span>
                  </label>
                  <textarea
                    id="proj-desc"
                    className="form-textarea"
                    rows={3}
                    placeholder="Briefly describe what the project solves and what features you implemented..."
                    value={projectForm.description}
                    onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
                  />
                </div>
              </div>
              <div className="form-button-row">
                <button type="submit" className="builder-action-btn primary">Save Project</button>
                <button type="button" className="builder-action-btn outline" onClick={() => setEditingType(null)}>Cancel</button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ── Subtab 2: Certifications ───────────────────── */}
      {activeTab === "certifications" && (
        <div className="subtab-content-panel">
          <div className="panel-instruction">
            <p>Add national certificates, professional licenses, or online credentials you have earned.</p>
          </div>

          {(pData.certifications || []).length === 0 && editingType !== "certifications" && (
            <div className="entries-empty-hint">
              <span className="empty-hint-icon">📜</span>
              <p>No certifications added yet.</p>
              <button type="button" className="builder-action-btn primary" onClick={startAddCert}>
                + Add Certification or License
              </button>
            </div>
          )}

          {(pData.certifications || []).length > 0 && (
            <div className="entries-card-list">
              {pData.certifications.map((cert, idx) => (
                <div key={cert.id || idx} className="entry-card-item">
                  <div className="entry-card-main">
                    <h4 className="entry-title">{cert.name}</h4>
                    <div className="entry-sub-line">
                      {cert.issuer && <strong>{cert.issuer}</strong>}
                      {cert.issueDate && ` • Issued ${cert.issueDate}`}
                      {cert.credentialId && ` • ID: ${cert.credentialId}`}
                    </div>
                  </div>
                  <div className="entry-card-actions">
                    <button type="button" className="entry-btn edit" onClick={() => startEditCert(idx)}>Edit</button>
                    <button type="button" className="entry-btn remove" onClick={() => removeCert(idx)}>Remove</button>
                  </div>
                </div>
              ))}

              {editingType !== "certifications" && (
                <button type="button" className="builder-action-btn secondary add-another" onClick={startAddCert}>
                  + Add Another Certification
                </button>
              )}
            </div>
          )}

          {editingType === "certifications" && (
            <form onSubmit={saveCert} className="entry-edit-form">
              <h4 className="form-subheading">{editingIndex >= 0 ? "Edit Certification" : "Add Certification"}</h4>
              <div className="builder-form-grid">
                <div className="form-group full-width">
                  <label htmlFor="cert-name" className="form-label required">
                    Certification or License Name <span className="label-badge required">Required</span>
                  </label>
                  <input
                    id="cert-name"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Civil Service Eligibility, TESDA NC II in Computer Systems Servicing, AWS Certified Cloud Practitioner"
                    value={certForm.name}
                    onChange={(e) => setCertForm({ ...certForm, name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="cert-issuer" className="form-label">
                    Issuing Organization <span className="label-badge optional">Optional</span>
                  </label>
                  <input
                    id="cert-issuer"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Civil Service Commission, TESDA, Amazon Web Services"
                    value={certForm.issuer}
                    onChange={(e) => setCertForm({ ...certForm, issuer: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="cert-date" className="form-label">
                    Issue Date or Year <span className="label-badge optional">Optional</span>
                  </label>
                  <input
                    id="cert-date"
                    type="text"
                    className="form-input"
                    placeholder="e.g. May 2024 or 2024"
                    value={certForm.issueDate}
                    onChange={(e) => setCertForm({ ...certForm, issueDate: e.target.value })}
                  />
                </div>
                <div className="form-group full-width">
                  <label htmlFor="cert-id" className="form-label">
                    Credential ID or Verification URL <span className="label-badge optional">Optional</span>
                  </label>
                  <input
                    id="cert-id"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Certificate number or verification link"
                    value={certForm.credentialId}
                    onChange={(e) => setCertForm({ ...certForm, credentialId: e.target.value })}
                  />
                </div>
              </div>
              <div className="form-button-row">
                <button type="submit" className="builder-action-btn primary">Save Certification</button>
                <button type="button" className="builder-action-btn outline" onClick={() => setEditingType(null)}>Cancel</button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ── Subtab 3: Training & Workshops ────────────── */}
      {activeTab === "training" && (
        <div className="subtab-content-panel">
          <div className="panel-instruction">
            <p>Add short bootcamps, technical seminars, or community training programs attended.</p>
          </div>

          {(pData.training || []).length === 0 && editingType !== "training" && (
            <div className="entries-empty-hint">
              <span className="empty-hint-icon">🛠️</span>
              <p>No training courses added yet.</p>
              <button type="button" className="builder-action-btn primary" onClick={startAddTraining}>
                + Add Training or Workshop
              </button>
            </div>
          )}

          {(pData.training || []).length > 0 && (
            <div className="entries-card-list">
              {pData.training.map((t, idx) => (
                <div key={t.id || idx} className="entry-card-item">
                  <div className="entry-card-main">
                    <h4 className="entry-title">{t.title}</h4>
                    <div className="entry-sub-line">
                      {t.provider && <strong>{t.provider}</strong>}
                      {t.dateOrYear && ` • ${t.dateOrYear}`}
                    </div>
                    {t.description && <p className="entry-description">{t.description}</p>}
                  </div>
                  <div className="entry-card-actions">
                    <button type="button" className="entry-btn edit" onClick={() => startEditTraining(idx)}>Edit</button>
                    <button type="button" className="entry-btn remove" onClick={() => removeTraining(idx)}>Remove</button>
                  </div>
                </div>
              ))}

              {editingType !== "training" && (
                <button type="button" className="builder-action-btn secondary add-another" onClick={startAddTraining}>
                  + Add Another Training
                </button>
              )}
            </div>
          )}

          {editingType === "training" && (
            <form onSubmit={saveTraining} className="entry-edit-form">
              <h4 className="form-subheading">{editingIndex >= 0 ? "Edit Training" : "Add Training"}</h4>
              <div className="builder-form-grid">
                <div className="form-group full-width">
                  <label htmlFor="train-title" className="form-label required">
                    Program or Workshop Title <span className="label-badge required">Required</span>
                  </label>
                  <input
                    id="train-title"
                    type="text"
                    className="form-input"
                    placeholder="e.g. DICT DigitalJobsPH Web Development Bootcamp"
                    value={trainForm.title}
                    onChange={(e) => setTrainForm({ ...trainForm, title: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="train-provider" className="form-label">
                    Training Provider / Organizer <span className="label-badge optional">Optional</span>
                  </label>
                  <input
                    id="train-provider"
                    type="text"
                    className="form-input"
                    placeholder="e.g. DICT, Coursera, FreeCodeCamp"
                    value={trainForm.provider}
                    onChange={(e) => setTrainForm({ ...trainForm, provider: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="train-date" className="form-label">
                    Date or Duration <span className="label-badge optional">Optional</span>
                  </label>
                  <input
                    id="train-date"
                    type="text"
                    className="form-input"
                    placeholder="e.g. 40 Hours, Aug 2023"
                    value={trainForm.dateOrYear}
                    onChange={(e) => setTrainForm({ ...trainForm, dateOrYear: e.target.value })}
                  />
                </div>
                <div className="form-group full-width">
                  <label htmlFor="train-desc" className="form-label">
                    Key Topics Covered <span className="label-badge optional">Optional</span>
                  </label>
                  <textarea
                    id="train-desc"
                    className="form-textarea"
                    rows={2}
                    placeholder="e.g. Covered responsive web design, Git collaboration, and basic backend integration."
                    value={trainForm.description}
                    onChange={(e) => setTrainForm({ ...trainForm, description: e.target.value })}
                  />
                </div>
              </div>
              <div className="form-button-row">
                <button type="submit" className="builder-action-btn primary">Save Training</button>
                <button type="button" className="builder-action-btn outline" onClick={() => setEditingType(null)}>Cancel</button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ── Subtab 4: Awards & Recognition ────────────── */}
      {activeTab === "awards" && (
        <div className="subtab-content-panel">
          <div className="panel-instruction">
            <p>Add academic honors, employee of the month recognitions, or competition awards.</p>
          </div>

          {(pData.awards || []).length === 0 && editingType !== "awards" && (
            <div className="entries-empty-hint">
              <span className="empty-hint-icon">🎖️</span>
              <p>No awards added yet.</p>
              <button type="button" className="builder-action-btn primary" onClick={startAddAward}>
                + Add Award or Recognition
              </button>
            </div>
          )}

          {(pData.awards || []).length > 0 && (
            <div className="entries-card-list">
              {pData.awards.map((a, idx) => (
                <div key={a.id || idx} className="entry-card-item">
                  <div className="entry-card-main">
                    <h4 className="entry-title">{a.title}</h4>
                    <div className="entry-sub-line">
                      {a.issuer && <strong>{a.issuer}</strong>}
                      {a.year && ` • ${a.year}`}
                    </div>
                    {a.description && <p className="entry-description">{a.description}</p>}
                  </div>
                  <div className="entry-card-actions">
                    <button type="button" className="entry-btn edit" onClick={() => startEditAward(idx)}>Edit</button>
                    <button type="button" className="entry-btn remove" onClick={() => removeAward(idx)}>Remove</button>
                  </div>
                </div>
              ))}

              {editingType !== "awards" && (
                <button type="button" className="builder-action-btn secondary add-another" onClick={startAddAward}>
                  + Add Another Award
                </button>
              )}
            </div>
          )}

          {editingType === "awards" && (
            <form onSubmit={saveAward} className="entry-edit-form">
              <h4 className="form-subheading">{editingIndex >= 0 ? "Edit Award" : "Add Award"}</h4>
              <div className="builder-form-grid">
                <div className="form-group full-width">
                  <label htmlFor="award-title" className="form-label required">
                    Award or Honor Title <span className="label-badge required">Required</span>
                  </label>
                  <input
                    id="award-title"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Dean's Lister, Best in Customer Service, 1st Place Hackathon"
                    value={awardForm.title}
                    onChange={(e) => setAwardForm({ ...awardForm, title: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="award-issuer" className="form-label">
                    Awarding Body / Organization <span className="label-badge optional">Optional</span>
                  </label>
                  <input
                    id="award-issuer"
                    type="text"
                    className="form-input"
                    placeholder="e.g. College of Engineering, Employer Name"
                    value={awardForm.issuer}
                    onChange={(e) => setAwardForm({ ...awardForm, issuer: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="award-year" className="form-label">
                    Year Received <span className="label-badge optional">Optional</span>
                  </label>
                  <input
                    id="award-year"
                    type="text"
                    className="form-input"
                    placeholder="e.g. 2023"
                    value={awardForm.year}
                    onChange={(e) => setAwardForm({ ...awardForm, year: e.target.value })}
                  />
                </div>
                <div className="form-group full-width">
                  <label htmlFor="award-desc" className="form-label">
                    Description or Significance <span className="label-badge optional">Optional</span>
                  </label>
                  <input
                    id="award-desc"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Awarded for top academic standing among graduating class"
                    value={awardForm.description}
                    onChange={(e) => setAwardForm({ ...awardForm, description: e.target.value })}
                  />
                </div>
              </div>
              <div className="form-button-row">
                <button type="submit" className="builder-action-btn primary">Save Award</button>
                <button type="button" className="builder-action-btn outline" onClick={() => setEditingType(null)}>Cancel</button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
