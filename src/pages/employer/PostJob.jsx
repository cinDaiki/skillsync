import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { useToast } from "../../contexts/ToastContext";
import { supabase } from "../../services/supabase";
import { generateSuggestedSkills }                   from "../../services/resumeParser";
import { runMatchingForJob }                          from "../../services/matchingEngine";
import { generateAndStoreJobEmbedding,
         buildJobTextForEmbedding }                   from "../../services/ai/embeddingService";
import { PRESET_REQUIREMENTS, encodeApplicationRequirements } from "../../utils/jobRequirementsHelper";
import { fetchAuthoritativeEmployerVerification, getEmployerVerificationState } from "../../utils/employerVerification";
import SkillTagInput from "../../components/common/SkillTagInput";
import { parseSkillsToArray } from "../../services/normalization";
import { getAllCategories, getSubcategoriesForCategory } from "../../constants/jobTaxonomy";
import { createEmployerJob, getEmployerWeeklyUsage } from "../../services/jobService";

export default function PostJob() {
  const navigate = useNavigate();
  const toast = useToast();
  const [formData, setFormData] = useState({
    title: "",
    job_category: "it_software",
    job_subcategory: "web_development",
    department: "",
    employment_type: "Full-time",
    work_setup: "On-site",
    location: "",
    salary_range: "",
    required_skills: [],
    required_certifications: "",
    required_education: "Bachelor's Degree",
    experience_required: "1-3 years",
    number_of_openings: 1,
    deadline: "",
    description: "",
    minimum_match_percentage: 70,
  });

  // Employer verification status state
  const [employerProfile, setEmployerProfile] = useState(null);
  const [checkingVerification, setCheckingVerification] = useState(true);
  const [verificationError, setVerificationError] = useState(null);
  const [verificationState, setVerificationState] = useState(() => getEmployerVerificationState());

  // Weekly job posting limit state (Phase 5: max 5 new job posts per week)
  const [weeklyUsage, setWeeklyUsage] = useState(null);
  const [loadingUsage, setLoadingUsage] = useState(true);

  // Application Document Requirements State
  const [appReqs, setAppReqs] = useState(
    PRESET_REQUIREMENTS.filter(p => p.defaultSelected).map(p => p.name)
  );
  const [customReqInput, setCustomReqInput] = useState("");

  const [loading, setLoading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  useEffect(() => {
    checkEmployerVerification();
    loadWeeklyUsage();
  }, []);

  async function loadWeeklyUsage() {
    setLoadingUsage(true);
    try {
      const { data, error } = await getEmployerWeeklyUsage();
      if (!error && data) {
        setWeeklyUsage(data);
      }
    } catch (err) {
      console.error("[PostJob] Failed to load weekly usage:", err);
    } finally {
      setLoadingUsage(false);
    }
  }

  async function checkEmployerVerification() {
    setCheckingVerification(true);
    setVerificationError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { profile, employerProfile: ep, verificationState: vState, error } =
          await fetchAuthoritativeEmployerVerification(user.id);
        if (error) {
          console.error("[PostJob] Error checking employer verification:", error);
          setVerificationError(error);
        } else {
          setEmployerProfile(profile || ep);
          setVerificationState(vState);
        }
      }
    } catch (err) {
      console.error("[PostJob] Exception checking employer verification:", err);
      setVerificationError(err);
    } finally {
      setCheckingVerification(false);
    }
  }

  function handleChange(e) {
    const { name, value } = e.target;
    if (name === "job_category") {
      const subcats = getSubcategoriesForCategory(value);
      setFormData(prev => ({
        ...prev,
        job_category: value,
        job_subcategory: subcats[0]?.key || ""
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  }

  function handleToggleReq(name) {
    setAppReqs(prev =>
      prev.includes(name) ? prev.filter(r => r !== name) : [...prev, name]
    );
  }

  function handleAddCustomReq(e) {
    e.preventDefault();
    const val = customReqInput.trim();
    if (!val) return;
    if (!appReqs.includes(val)) {
      setAppReqs(prev => [...prev, val]);
    }
    setCustomReqInput("");
  }

  function handleRemoveReq(name) {
    setAppReqs(prev => prev.filter(r => r !== name));
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
          const currentSkills = Array.isArray(prev.required_skills)
            ? prev.required_skills
            : parseSkillsToArray(prev.required_skills);
          const combined = Array.from(new Set([...currentSkills, ...skills])).filter(Boolean);
          return { ...prev, required_skills: combined };
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

  const isVerifiedEmployer = verificationState.canPostJob;
  const isLimitReached = weeklyUsage && weeklyUsage.used_count >= weeklyUsage.weekly_limit;

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);

    if (checkingVerification) {
      toast.info("Please wait while verification status is being checked.");
      setLoading(false);
      return;
    }

    if (!verificationState.canPostJob) {
      toast.error(verificationState.message || "Verification Required: Your employer account must be verified before you can publish job postings.");
      setLoading(false);
      return;
    }

    if (isLimitReached) {
      toast.error("You've reached your weekly limit of 5 new job posts. You can create another job when your weekly posting window resets on Monday.");
      setLoading(false);
      return;
    }

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

    // Encode application document requirements into payload
    const encodedCerts = encodeApplicationRequirements(formData.required_certifications, appReqs);

    const matchThreshold = parseInt(formData.minimum_match_percentage, 10);
    if (isNaN(matchThreshold) || matchThreshold < 60 || matchThreshold > 90) {
      toast.error("Minimum match percentage must be between 60% and 90%.");
      setLoading(false);
      return;
    }

    const skillsList = Array.isArray(formData.required_skills)
      ? formData.required_skills
      : parseSkillsToArray(formData.required_skills);

    const payload = {
      title: formData.title.trim(),
      job_category: formData.job_category || null,
      job_subcategory: formData.job_subcategory || null,
      department: formData.department.trim(),
      employment_type: formData.employment_type,
      work_setup: formData.work_setup,
      location: formData.location.trim(),
      salary_range: formData.salary_range.trim(),
      required_skills: skillsList.join(', '),
      required_certifications: encodedCerts,
      required_education: formData.required_education,
      experience_required: formData.experience_required,
      number_of_openings: parseInt(formData.number_of_openings, 10) || 1,
      minimum_match_percentage: matchThreshold,
      description: formData.description.trim(),
      deadline: formData.deadline || null,
      status: "pending_review", // Newly created jobs require admin moderation
      employer_id: user.id,
    };

    const { data: newJob, usage: updatedUsage, error } = await createEmployerJob(payload);

    if (error) {
       toast.error(error.message || "Failed to post job."); 
       if (error.code === 'WEEKLY_JOB_POST_LIMIT_REACHED') {
         loadWeeklyUsage();
       }
       setLoading(false); 
       return;
    }

    if (updatedUsage) {
      setWeeklyUsage(updatedUsage);
    }

    if (newJob) {
      // Rule-based matching (existing)
      runMatchingForJob(newJob.id).catch(console.error);

      // ── Semantic AI Job Embedding (non-blocking) ─────────────────────
      ;(async () => {
        try {
          const jobText = buildJobTextForEmbedding(newJob)
          await generateAndStoreJobEmbedding(newJob.id, jobText)
          console.log('[PostJob] Job embedding stored for job:', newJob.id)
        } catch (aiErr) {
          console.warn('[PostJob] Job embedding failed (non-critical):', aiErr.message)
        }
      })()
    }

    toast.success("Job submitted for administrator review! Status: Pending Review.");
    setLoading(false);
    setTimeout(() => navigate("/employer/jobs"), 1200);
  }

  const allCategories = getAllCategories();
  const availableSubcats = getSubcategoriesForCategory(formData.job_category);

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

        {/* ── EMPLOYER VERIFICATION STATUS / WARNING BANNERS ── */}
        {checkingVerification && (
          <div style={{ margin: "16px 0", padding: "16px 20px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", color: "#64748b", display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "18px" }}>🔄</span>
            <span style={{ fontSize: "14px", fontWeight: "600" }}>Checking employer verification status...</span>
          </div>
        )}

        {!checkingVerification && verificationError && (
          <div style={{ margin: "16px 0", padding: "16px 20px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "10px", color: "#991b1b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong>Unable to verify employer status.</strong>
              <p style={{ margin: "4px 0 0 0", fontSize: "13px" }}>{verificationError.message || "Please check your connection and try again."}</p>
            </div>
            <button type="button" onClick={checkEmployerVerification} className="profile-save-btn" style={{ padding: "6px 14px", fontSize: "13px" }}>
              Retry
            </button>
          </div>
        )}

        {!checkingVerification && !verificationError && !verificationState.canPostJob && (
          <div style={{
            margin: "16px 0",
            padding: "16px 20px",
            background: verificationState.isSuspended || verificationState.isRejected ? "#fef2f2" : "#fffbeb",
            border: verificationState.isSuspended || verificationState.isRejected ? "1px solid #fca5a5" : "1px solid #fde68a",
            borderRadius: "10px",
            color: "#1e293b"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
              <span style={{ fontSize: "20px" }}>
                {verificationState.isSuspended ? "🔴" : verificationState.isRejected ? "❌" : "⏳"}
              </span>
              <strong style={{ fontSize: "15px", color: verificationState.isSuspended || verificationState.isRejected ? "#991b1b" : "#92400e" }}>
                {verificationState.isSuspended
                  ? "Account Suspended"
                  : verificationState.isRejected
                  ? "Employer Account Verification Rejected"
                  : "Verification Status: Pending Administrator Review"}
              </strong>
            </div>
            <p style={{ margin: 0, fontSize: "13px", lineHeight: "1.5" }}>
              {verificationState.isSuspended ? (
                <>Your account is suspended. Reason: {verificationState.reason || "Administrative policy enforcement."}. You cannot publish jobs.</>
              ) : verificationState.isRejected ? (
                <>Reason: {verificationState.reason || "Verification documents did not meet platform guidelines."} Please update your verification documents in your Company Profile.</>
              ) : (
                <>Your employer account is awaiting administrator review. You cannot publish jobs until approved.</>
              )}
            </p>
          </div>
        )}

        {/* Weekly Job Posting Allowance & Usage Indicator (Phase 5) */}
        <div
          className="weekly-posting-limit-card"
          style={{
            margin: "16px 0 24px 0",
            padding: "16px 20px",
            background: isLimitReached ? "#fef2f2" : "#f8fafc",
            border: isLimitReached ? "1px solid #fca5a5" : "1px solid #e2e8f0",
            borderRadius: "10px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "20px" }}>{isLimitReached ? "🛑" : "📊"}</span>
              <div>
                <strong style={{ fontSize: "14px", color: isLimitReached ? "#991b1b" : "#1e293b", display: "block" }}>
                  Weekly Job Posting
                </strong>
                <span style={{ fontSize: "13px", color: isLimitReached ? "#b91c1c" : "#475569", fontWeight: "600" }}>
                  {loadingUsage
                    ? "Checking weekly posting allowance..."
                    : isLimitReached
                    ? "Weekly posting limit reached"
                    : `${weeklyUsage?.used_count ?? 0} of ${weeklyUsage?.weekly_limit ?? 5} new jobs used this week`}
                </span>
                {!loadingUsage && isLimitReached && (
                  <span style={{ fontSize: "12px", color: "#b91c1c", marginLeft: "6px" }}>
                    (5 of 5 new jobs used this week)
                  </span>
                )}
              </div>
            </div>

            {weeklyUsage && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "4px 12px",
                  borderRadius: "20px",
                  fontSize: "12px",
                  fontWeight: "700",
                  background: isLimitReached ? "#fee2e2" : "#ede9fe",
                  color: isLimitReached ? "#991b1b" : "#58158f",
                  border: isLimitReached ? "1px solid #f87171" : "1px solid #ddd6fe",
                }}
              >
                {isLimitReached ? "Limit Reached" : `${weeklyUsage.remaining_count} remaining`}
              </div>
            )}
          </div>

          <div style={{ fontSize: "12px", color: isLimitReached ? "#991b1b" : "#64748b", borderTop: isLimitReached ? "1px solid #fecaca" : "1px solid #f1f5f9", paddingTop: "6px" }}>
            ℹ️ Your weekly posting allowance resets on Monday.
          </div>
        </div>

        <form className="profile-form" onSubmit={handleSubmit}>
          <div className="profile-form-grid">
            <label><span>Job Title *</span>
              <input type="text" name="title" placeholder="e.g. Senior React Developer" value={formData.title} onChange={handleChange} required />
            </label>

            <label><span>Job Category *</span>
              <select name="job_category" value={formData.job_category} onChange={handleChange} required>
                {allCategories.map(cat => (
                  <option key={cat.key} value={cat.key}>{cat.label}</option>
                ))}
              </select>
            </label>

            <label><span>Job Subcategory *</span>
              <select name="job_subcategory" value={formData.job_subcategory} onChange={handleChange}>
                {availableSubcats.map(sub => (
                  <option key={sub.key} value={sub.key}>{sub.label}</option>
                ))}
              </select>
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
            <span style={{ fontWeight: '700', color: '#1e293b' }}>Required Professional Certifications / Licenses (Optional)</span>
            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "normal", display: "block", marginBottom: "6px", lineHeight: "1.4" }}>
              Enter only professional certifications or licenses required for this role, for example CPA, PRC License, AWS Certified, NC II. Do not enter education, experience, communication skills, or general qualifications here.
            </span>
            <input type="text" name="required_certifications" placeholder="e.g. CPA, AWS Certified Solutions Architect, PRC Board License" value={formData.required_certifications} onChange={handleChange} />
          </label>

          <label style={{ marginTop: "15px" }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontWeight: '700', color: '#1e293b' }}>Required Skills</span>
              <button type="button" onClick={handleSuggestSkills} disabled={suggesting} style={{ background: 'none', border: 'none', color: '#58158f', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
                {suggesting ? "✨ Analyzing..." : "✨ AI Suggest Skills"}
              </button>
            </div>
            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "normal", display: "block", marginBottom: "6px", lineHeight: "1.4" }}>
              Type a skill and press Enter or comma. You can also paste a comma- or line-separated list of skills.
            </span>
            <SkillTagInput
              skills={formData.required_skills}
              onChange={(newSkills) => setFormData(prev => ({ ...prev, required_skills: newSkills }))}
              placeholder="e.g. React, Node.js, SQL, Problem Solving"
            />
          </label>

          <label style={{ marginTop: "15px" }}>
            <span>Minimum Candidate Match</span>
            <select
              name="minimum_match_percentage"
              value={formData.minimum_match_percentage}
              onChange={handleChange}
            >
              <option value={60}>60%</option>
              <option value={65}>65%</option>
              <option value={70}>70% — Recommended</option>
              <option value={75}>75%</option>
              <option value={80}>80%</option>
              <option value={85}>85%</option>
              <option value={90}>90%</option>
            </select>
            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "normal", marginTop: "2px", lineHeight: "1.4" }}>
              Sets the minimum SkillSync match score a candidate must meet for application eligibility. 70% is the recommended default.
            </span>
          </label>

          {/* ── APPLICATION DOCUMENT REQUIREMENTS ── */}
          <div style={{ marginTop: "24px", background: "#f8fafc", padding: "16px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
            <h3 style={{ margin: "0 0 6px 0", fontSize: "15px", color: "#1e1b4b", fontWeight: "800" }}>📋 Required Application Documents</h3>
            <p style={{ margin: "0 0 12px 0", fontSize: "12px", color: "#64748b" }}>
              Select the documents applicants must prepare to apply for this job.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "10px", marginBottom: "14px" }}>
              {PRESET_REQUIREMENTS.map(preset => {
                const isSelected = appReqs.includes(preset.name);
                return (
                  <label key={preset.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer", background: isSelected ? "#f3e8ff" : "#fff", padding: "8px 12px", borderRadius: "6px", border: isSelected ? "1px solid #c084fc" : "1px solid #cbd5e1" }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleReq(preset.name)}
                    />
                    <span>{preset.icon} {preset.name}</span>
                  </label>
                );
              })}
            </div>

            {/* Custom Requirement Builder */}
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input
                type="text"
                placeholder="+ Add custom requirement (e.g. Barangay Clearance)"
                value={customReqInput}
                onChange={(e) => setCustomReqInput(e.target.value)}
                style={{ flex: 1, padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
              />
              <button
                type="button"
                onClick={handleAddCustomReq}
                style={{ background: "#58158f", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "6px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}
              >
                Add
              </button>
            </div>

            {/* Active Selected Documents Tags */}
            {appReqs.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "12px" }}>
                {appReqs.map(req => (
                  <span key={req} style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#3b82f6", color: "#fff", padding: "4px 10px", borderRadius: "14px", fontSize: "12px", fontWeight: "600" }}>
                    ✓ {req}
                    <button type="button" onClick={() => handleRemoveReq(req)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: "14px", padding: 0, marginLeft: "4px" }}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <label style={{ marginTop: "15px" }}>
            <span>Job Description *</span>
            <textarea className="dashboard-textarea" name="description" placeholder="Describe the responsibilities..." value={formData.description} onChange={handleChange} rows={6} required />
          </label>

          <div className="profile-actions" style={{ marginTop: "24px" }}>
            <button
              type="submit"
              className="profile-save-btn"
              disabled={loading || checkingVerification || !verificationState.canPostJob || isLimitReached}
              style={isLimitReached ? { opacity: 0.6, cursor: "not-allowed", background: "#94a3b8" } : {}}
            >
              {loading
                ? "Posting..."
                : checkingVerification
                ? "Checking Verification..."
                : isLimitReached
                ? "Weekly posting limit reached"
                : "Publish Job Post"}
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