import { useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { useToast } from "../../contexts/ToastContext";
import { supabase } from "../../services/supabase";
import { generateSuggestedSkills }                   from "../../services/resumeParser";
import { runMatchingForJob }                          from "../../services/matchingEngine";
import { generateAndStoreJobEmbedding,
         buildJobTextForEmbedding }                   from "../../services/ai/embeddingService";

export default function PostJob() {
  const navigate = useNavigate();
  const toast = useToast();
  const [formData, setFormData] = useState({
    title: "",
    department: "",
    employment_type: "Full-time",
    work_setup: "On-site",
    location: "",
    salary_range: "",
    required_skills: "",
    required_certifications: "",
    required_education: "Bachelor's Degree",
    experience_required: "1-3 years",
    number_of_openings: 1,
    deadline: "",
    description: "",
  });
  const [loading, setLoading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  }

  async function handleSuggestSkills(e) {
    e.preventDefault();
    if (!formData.title) {
      toast.error("Please enter a Job Title first.");
      return;
    }
    setSuggesting(true);
    try {
      const skills = await generateSuggestedSkills(formData.title, formData.description);
      if (skills.length > 0) {
        setFormData(prev => {
          const currentSkills = prev.required_skills ? prev.required_skills.split(',').map(s => s.trim()).filter(Boolean) : [];
          const combined = Array.from(new Set([...currentSkills, ...skills])).filter(Boolean);
          return { ...prev, required_skills: combined.join(', ') };
        });
        toast.success("AI generated skill recommendations!");
      } else {
        toast.info("AI couldn't find matches. Try adding a description.");
      }
    } catch (err) {
      toast.error("Failed to generate skills.");
    } finally {
      setSuggesting(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);

    if (!formData.title.trim() || !formData.location.trim() || !formData.description.trim()) {
      toast.error("Please fill in all required fields."); 
      setLoading(false); 
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Please sign in first."); 
      setLoading(false); 
      return;
    }

    const payload = {
      title: formData.title.trim(),
      department: formData.department.trim(),
      employment_type: formData.employment_type,
      work_setup: formData.work_setup,
      location: formData.location.trim(),
      salary_range: formData.salary_range.trim(),
      required_skills: formData.required_skills.trim(),
      required_certifications: formData.required_certifications.trim(),
      required_education: formData.required_education,
      experience_required: formData.experience_required,
      number_of_openings: parseInt(formData.number_of_openings, 10) || 1,
      description: formData.description.trim(),
      deadline: formData.deadline || null,
      status: "open",
      employer_id: user.id,
    };

    const { data, error } = await supabase.from("jobs").insert([payload]).select();

    if (error) {
       toast.error("Failed to post job: " + error.message); 
       setLoading(false); 
       return;
    }

    if (data && data[0]) {
      const newJob = data[0];

      // Rule-based matching (existing)
      runMatchingForJob(newJob.id).catch(console.error);

      // ── Semantic AI Job Embedding (non-blocking) ─────────────────────
      // Generates a 384-dim embedding from the job description + requirements
      // and stores it in jobs.job_embedding for future candidate vector search.
      ;(async () => {
        try {
          const jobText = buildJobTextForEmbedding(newJob)
          await generateAndStoreJobEmbedding(newJob.id, jobText)
          console.log('[PostJob] Job embedding stored for job:', newJob.id)
        } catch (aiErr) {
          console.warn('[PostJob] Job embedding failed (non-critical):', aiErr.message)
        }
      })()
      // ── End AI Pipeline ──────────────────────────────────────────
    }

    toast.success("Job posted successfully!");
    setLoading(false);
    setTimeout(() => navigate("/employer/jobs"), 800);
  }

  return (
    <DashboardLayout
      role="employer"
      title="Post a Job"
      subtitle="Create a new highly-detailed job listing to attract top talent."
    >
      <section className="dashboard-panel">
        <div className="panel-header">
          <div>
            <h2>New Job Posting</h2>
            <p>Fill in the requirements and let our AI suggest keywords to improve matches.</p>
          </div>
        </div>

        <form className="profile-form" onSubmit={handleSubmit}>
          <div className="profile-form-grid">
            <label><span>Job Title *</span>
              <input type="text" name="title" placeholder="e.g. Senior React Developer" value={formData.title} onChange={handleChange} required />
            </label>

            <label><span>Department</span>
              <input type="text" name="department" placeholder="e.g. Engineering" value={formData.department} onChange={handleChange} />
            </label>

            <label><span>Employment Type</span>
              <select name="employment_type" value={formData.employment_type} onChange={handleChange}>
                <option value="Full-time">Full-time</option>
                <option value="Part-time">Part-time</option>
                <option value="Contract">Contract</option>
                <option value="Internship">Internship</option>
              </select>
            </label>

            <label><span>Work Setup</span>
              <select name="work_setup" value={formData.work_setup} onChange={handleChange}>
                <option value="On-site">On-site</option>
                <option value="Hybrid">Hybrid</option>
                <option value="Remote">Remote</option>
              </select>
            </label>

            <label><span>Location *</span>
              <input type="text" name="location" placeholder="e.g. Manila, Philippines" value={formData.location} onChange={handleChange} required />
            </label>

            <label><span>Salary Range</span>
              <input type="text" name="salary_range" placeholder="e.g. ₱40,000 – ₱60,000" value={formData.salary_range} onChange={handleChange} />
            </label>
            
            <label><span>Experience Required</span>
              <select name="experience_required" value={formData.experience_required} onChange={handleChange}>
                <option value="Entry Level (0-1 year)">Entry Level (0-1 year)</option>
                <option value="1-3 years">1-3 years</option>
                <option value="3-5 years">3-5 years</option>
                <option value="5+ years">5+ years</option>
              </select>
            </label>

            <label><span>Required Education</span>
              <select name="required_education" value={formData.required_education} onChange={handleChange}>
                <option value="High School">High School</option>
                <option value="Associate Degree">Associate Degree</option>
                <option value="Bachelor's Degree">Bachelor's Degree</option>
                <option value="Master's Degree">Master's Degree</option>
              </select>
            </label>

            <label><span>Number of Openings</span>
              <input type="number" name="number_of_openings" min="1" value={formData.number_of_openings} onChange={handleChange} />
            </label>

            <label><span>Application Deadline</span>
              <input type="date" name="deadline" value={formData.deadline} onChange={handleChange} min={new Date().toISOString().split("T")[0]} />
            </label>
          </div>

          <label style={{ marginTop: "15px" }}>
            <span>Required Certifications</span>
            <input type="text" name="required_certifications" placeholder="e.g. AWS Certified Developer, CPA (comma-separated)" value={formData.required_certifications} onChange={handleChange} />
          </label>

          <label style={{ marginTop: "15px" }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Required Skills</span>
              <button type="button" onClick={handleSuggestSkills} disabled={suggesting} style={{ background: 'none', border: 'none', color: '#58158f', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
                {suggesting ? "✨ Analyzing..." : "✨ AI Suggest Skills"}
              </button>
            </div>
            <input type="text" name="required_skills" placeholder="e.g. React, Node.js (comma-separated)" value={formData.required_skills} onChange={handleChange} />
          </label>

          <label style={{ marginTop: "15px" }}>
            <span>Job Description *</span>
            <textarea className="dashboard-textarea" name="description" placeholder="Describe the responsibilities..." value={formData.description} onChange={handleChange} rows={6} required />
          </label>

          <div className="profile-actions" style={{ marginTop: "24px" }}>
            <button type="submit" className="profile-save-btn" disabled={loading}>
              {loading ? "Posting..." : "Publish Job Post"}
            </button>
            <button type="button" className="profile-cancel-btn" onClick={() => navigate("/employer/jobs")}>
              Cancel
            </button>
          </div>
        </form>
      </section>
    </DashboardLayout>
  );
}