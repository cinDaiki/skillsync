import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { useToast } from "../../contexts/ToastContext";
import { useModal } from "../../contexts/ModalContext";
import { supabase } from "../../services/supabase";
import { runMatchingForJob } from "../../services/matchingEngine";
import "./ManageJobs.css";

export default function ManageJobs() {
  const [jobs, setJobs] = useState([]);
  const [applicantCounts, setApplicantCounts] = useState({});
  const [editingJobId, setEditingJobId] = useState(null);
  const [userId, setUserId] = useState(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterType, setFilterType] = useState("All");
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const toast = useToast();
  const { confirm } = useModal();

  const [editForm, setEditForm] = useState({
    title: "", employment_type: "Full-time",
    location: "", required_skills: "", description: "",
    salary_range: "", deadline: "",
  });

  useEffect(() => { loadJobs(); }, []);

  async function loadJobs() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const { data: jobsData } = await supabase
      .from("jobs").select("*")
      .eq("employer_id", user.id)
      .order("created_at", { ascending: false });
    setJobs(jobsData || []);

    // Fetch applicant counts per job
    if (jobsData && jobsData.length > 0) {
      const jobIds = jobsData.map(j => j.id);
      const { data: appsData } = await supabase
        .from("applications").select("job_id")
        .in("job_id", jobIds);
      const counts = {};
      (appsData || []).forEach(a => {
        counts[a.job_id] = (counts[a.job_id] || 0) + 1;
      });
      setApplicantCounts(counts);
    }
  }

  function handleEditJob(job) {
    setEditingJobId(job.id);
    setEditForm({
      title: job.title || "",
      department: job.department || "",
      employment_type: job.employment_type || "Full-time",
      work_setup: job.work_setup || "On-site",
      location: job.location || "",
      required_skills: job.required_skills || "",
      required_certifications: job.required_certifications || "",
      required_education: job.required_education || "Bachelor's Degree",
      experience_required: job.experience_required || "1-3 years",
      number_of_openings: job.number_of_openings || 1,
      description: job.description || "",
      salary_range: job.salary_range || "",
      deadline: job.deadline ? job.deadline.substring(0,10) : "",
    });
  }



  async function handleSaveEdit(jobId) {
    if (!editForm.title.trim()) {
      toast.error("Job title is required.");
      return;
    }

    setSaving(true);
    const payload = {
      title: editForm.title.trim(),
      department: editForm.department?.trim() || null,
      employment_type: editForm.employment_type,
      work_setup: editForm.work_setup,
      location: editForm.location.trim(),
      required_skills: editForm.required_skills.trim(),
      required_certifications: editForm.required_certifications?.trim() || null,
      required_education: editForm.required_education,
      experience_required: editForm.experience_required,
      number_of_openings: parseInt(editForm.number_of_openings, 10) || 1,
      description: editForm.description.trim(),
    };
    if (editForm.salary_range?.trim()) payload.salary_range = editForm.salary_range.trim();
    if (editForm.deadline) payload.deadline = editForm.deadline;

    const { error } = await supabase
      .from("jobs")
      .update(payload)
      .eq("id", jobId)
      .eq("employer_id", userId);

    setSaving(false);

    if (error) {
      toast.error("Could not save changes. Please try again.");
      return;
    }

    setEditingJobId(null);
    await loadJobs();
    runMatchingForJob(jobId).catch(console.error);
    toast.success("Job post saved successfully.");
  }

  async function handleToggleStatus(jobId, currentStatus) {
    const newStatus = currentStatus === "closed" ? "open" : "closed";
    await supabase.from("jobs").update({ status: newStatus })
      .eq("id", jobId).eq("employer_id", userId);
    loadJobs();
  }

  async function handleDeleteJob(jobId) {
    setDeleting(true);
    const { error } = await supabase
      .from("jobs")
      .delete()
      .eq("id", jobId)
      .eq("employer_id", userId);

    setDeleting(false);
    if (error) {
      toast.error("Could not delete job post. Please try again.");
      return;
    }

    setJobs((prev) => prev.filter((j) => j.id !== jobId));
    if (editingJobId === jobId) setEditingJobId(null);
    toast.success("Job post deleted.");
  }

  function formatDate(d) {
    if (!d) return null;
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  // Filtered jobs
  const filteredJobs = jobs.filter(job => {
    const matchSearch = !search ||
      job.title.toLowerCase().includes(search.toLowerCase()) ||
      (job.location || "").toLowerCase().includes(search.toLowerCase()) ||
      (job.required_skills || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "All" || job.status === filterStatus.toLowerCase();
    const matchType = filterType === "All" || job.employment_type === filterType;
    return matchSearch && matchStatus && matchType;
  });

  return (
    <DashboardLayout
      role="employer"
      title="Manage Job Posts"
      subtitle="Update, archive, or delete your company job listings."
    >

      <section className="dashboard-panel">
        <div className="panel-header">
          <div>
            <h2>Company Job Listings</h2>
            <p>{jobs.length} total posting{jobs.length !== 1 ? "s" : ""} · {jobs.filter(j => j.status==="open").length} active</p>
          </div>
          <Link to="/employer/post-job" className="panel-action">＋ Post New Job</Link>
        </div>

        {/* Search + Filters */}
        <div className="manage-jobs-controls">
          <input
            type="text"
            className="manage-jobs-search"
            placeholder="🔍 Search by title, location, or skills…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select className="manage-jobs-filter" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="All">All Status</option>
            <option value="Open">Open</option>
            <option value="Closed">Closed</option>
          </select>
          <select className="manage-jobs-filter" value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="All">All Types</option>
            <option value="Full-time">Full-time</option>
            <option value="Part-time">Part-time</option>
            <option value="Contract">Contract</option>
            <option value="Internship">Internship</option>
            <option value="Remote">Remote</option>
          </select>
        </div>

        {filteredJobs.length === 0 ? (
          <div className="empty-state">
            <span>▣</span>
            <h3>No job posts found</h3>
            <p>Try adjusting your search filters, or create a new job listing.</p>
            <Link to="/employer/post-job" className="panel-action" style={{ marginTop: "12px" }}>Add Job Post</Link>
          </div>
        ) : (
          <div className="jobs-manage-list">
            {filteredJobs.map(job => (
              <article
                key={job.id}
                className={`job-manage-card ${job.status === "closed" ? "closed-job" : "open-job"}`}
              >
                {editingJobId === job.id ? (
                  /* ── INLINE EDIT FORM ── */
                  <div className="job-edit-form">
                    <div className="job-edit-grid">
                      <label className="job-edit-label">
                        Job Title
                        <input name="title" value={editForm.title} onChange={e => setEditForm(p => ({...p, title: e.target.value}))} />
                      </label>
                      <label className="job-edit-label">
                        Department
                        <input name="department" value={editForm.department || ""} onChange={e => setEditForm(p => ({...p, department: e.target.value}))} />
                      </label>
                      <label className="job-edit-label">
                        Employment Type
                        <select name="employment_type" value={editForm.employment_type} onChange={e => setEditForm(p => ({...p, employment_type: e.target.value}))}>
                          <option>Full-time</option><option>Part-time</option><option>Contract</option><option>Internship</option>
                        </select>
                      </label>
                      <label className="job-edit-label">
                        Work Setup
                        <select name="work_setup" value={editForm.work_setup || "On-site"} onChange={e => setEditForm(p => ({...p, work_setup: e.target.value}))}>
                          <option>On-site</option><option>Hybrid</option><option>Remote</option>
                        </select>
                      </label>
                      <label className="job-edit-label">
                        Location
                        <input name="location" value={editForm.location} onChange={e => setEditForm(p => ({...p, location: e.target.value}))} />
                      </label>
                      <label className="job-edit-label">
                        Salary Range
                        <input name="salary_range" placeholder="e.g. ₱40k–₱60k" value={editForm.salary_range} onChange={e => setEditForm(p => ({...p, salary_range: e.target.value}))} />
                      </label>
                      <label className="job-edit-label">
                        Experience Required
                        <select name="experience_required" value={editForm.experience_required || "1-3 years"} onChange={e => setEditForm(p => ({...p, experience_required: e.target.value}))}>
                          <option>Entry Level (0-1 year)</option><option>1-3 years</option><option>3-5 years</option><option>5+ years</option>
                        </select>
                      </label>
                      <label className="job-edit-label">
                        Required Education
                        <select name="required_education" value={editForm.required_education || "Bachelor's Degree"} onChange={e => setEditForm(p => ({...p, required_education: e.target.value}))}>
                          <option>High School</option><option>Associate Degree</option><option>Bachelor's Degree</option><option>Master's Degree</option>
                        </select>
                      </label>
                      <label className="job-edit-label">
                        Required Skills (comma-separated)
                        <input name="required_skills" value={editForm.required_skills} onChange={e => setEditForm(p => ({...p, required_skills: e.target.value}))} />
                      </label>
                      <label className="job-edit-label">
                        Required Certifications (comma-separated)
                        <input name="required_certifications" value={editForm.required_certifications || ""} onChange={e => setEditForm(p => ({...p, required_certifications: e.target.value}))} />
                      </label>
                      <label className="job-edit-label">
                        Openings
                        <input type="number" name="number_of_openings" min="1" value={editForm.number_of_openings || 1} onChange={e => setEditForm(p => ({...p, number_of_openings: e.target.value}))} />
                      </label>
                      <label className="job-edit-label">
                        Deadline
                        <input type="date" name="deadline" value={editForm.deadline} onChange={e => setEditForm(p => ({...p, deadline: e.target.value}))} />
                      </label>
                    </div>
                    <label className="job-edit-label">
                      Job Description
                      <textarea value={editForm.description}
                        onChange={e => setEditForm(p => ({...p, description: e.target.value}))} />
                    </label>
                    <div className="job-edit-actions">
                      <button
                        type="button"
                        className="job-edit-btn"
                        onClick={() => handleSaveEdit(job.id)}
                        disabled={saving}
                      >
                        {saving ? "Saving..." : "Save Changes"}
                      </button>
                      <button
                        type="button"
                        className="job-status-btn"
                        onClick={() => setEditingJobId(null)}
                        disabled={saving}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── CARD VIEW ── */
                  <>
                    <div className="job-manage-top">
                      <div className="job-manage-info">
                        <h3>{job.title || "Untitled Job"}</h3>
                      </div>
                      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                        <span className="job-applicant-count-badge">
                          👥 {applicantCounts[job.id] || 0} applicant{(applicantCounts[job.id] || 0) !== 1 ? "s" : ""}
                        </span>
                        <span className={`job-status-badge ${job.status === "closed" ? "closed" : "open"}`}>
                          {job.status || "open"}
                        </span>
                      </div>
                    </div>

                    {/* Meta chips */}
                    <div className="job-manage-meta-row">
                      <span className="job-meta-chip">💼 {job.employment_type || "Full-time"}</span>
                      <span className="job-meta-chip">📍 {job.location || "Not specified"}</span>
                      {job.salary_range && <span className="job-meta-chip salary">💰 {job.salary_range}</span>}
                      {job.deadline && <span className="job-meta-chip deadline">⏰ Deadline: {formatDate(job.deadline)}</span>}
                      {job.required_skills && (
                        job.required_skills.split(",").slice(0,3).map(s => (
                          <span key={s.trim()} className="job-meta-chip" style={{ background: "#f5ecff", color: "#58158f" }}>
                            {s.trim()}
                          </span>
                        ))
                      )}
                    </div>

                    <p className="job-description-preview">{job.description || "No description provided."}</p>

                    <div className="job-actions">
                      <button type="button" className="job-edit-btn" onClick={() => handleEditJob(job)}>Edit</button>
                      <button type="button" className="job-status-btn" onClick={() => handleToggleStatus(job.id, job.status)}>
                        {job.status === "closed" ? "Reopen" : "Close"}
                      </button>
                      <button
                        type="button"
                        className="job-delete-btn"
                        onClick={() => {
                          confirm({
                            title: "Delete job post?",
                            message: "This permanently removes the listing and cannot be undone. Applicants linked to this post will no longer see it.",
                            confirmText: "Delete Post",
                            isDestructive: true,
                            onConfirm: () => handleDeleteJob(job.id)
                          });
                        }}
                      >
                        Delete
                      </button>
                      <Link to="/employer/applicants" style={{ marginLeft: "auto", color: "#58158f", fontWeight: "800", fontSize: "13px", textDecoration: "none" }}>
                        View Applicants →
                      </Link>
                    </div>
                  </>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </DashboardLayout>
  );
}