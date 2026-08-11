import "./Profile.css";
import { useEffect, useState } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { supabase } from "../../services/supabase";
import { syncApplicantSnapshot } from "../../services/applicationService";
import {
  getCurrentUser,
  getCandidateProfileByUserId,
  saveCandidateProfile,
  setCurrentUser,
} from "../../services/localStorageService";
import { uploadVerificationDocument, uploadCertificateFile, getCertificateSignedUrl } from "../../services/api";
import { runMatchingForCandidate } from "../../services/matchingEngine";
import ProfilePictureUploader from "../../components/common/ProfilePictureUploader";
import { isDevMode } from "../../services/devMode";

const defaultProfile = {
  fullName: "",
  email: "",
  contactNumber: "",
  address: "",
  profilePictureUrl: "",
  visibility: true,
  portfolioLinks: {
    portfolioUrl: "",
    githubUrl: "",
    linkedinUrl: "",
    twitterUrl: ""
  },
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
  verificationStatus: "Pending Verification",
  idImageUrl: "",
  selfieImageUrl: "",
  verificationDate: null,
};

function parseSkills(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === "string" && raw.length > 0) {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function parseJsonField(raw, defaultVal = []) {
  if (!raw) return defaultVal;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error("Error parsing JSON field:", e);
    return defaultVal;
  }
}

export default function Profile() {
  const [profile, setProfile] = useState(defaultProfile);
  const [skills, setSkills] = useState([]);
  const [education, setEducation] = useState([]);
  const [workExperience, setWorkExperience] = useState([]);
  const [certifications, setCertifications] = useState([]);
  
  const [skillInput, setSkillInput] = useState("");
  const [message, setMessage] = useState({ text: "", type: "success" });
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState(null);
  const [activeTab, setActiveTab] = useState("view");

  // Modals state
  const [showExpModal, setShowExpModal] = useState(false);
  const [editingExpIndex, setEditingExpIndex] = useState(null);
  const [expForm, setExpForm] = useState({
    title: "",
    company: "",
    startDate: "",
    endDate: "",
    description: ""
  });

  const [showEduModal, setShowEduModal] = useState(false);
  const [editingEduIndex, setEditingEduIndex] = useState(null);
  const [eduForm, setEduForm] = useState({
    degree: "",
    school: "",
    field: "",
    gradYear: ""
  });

  const [showCertModal, setShowCertModal] = useState(false);
  const [editingCertIndex, setEditingCertIndex] = useState(null);
  const [certForm, setCertForm] = useState({
    name: "",
    issuer: "",
    date: "",
    credentialId: "",
    file: null,
    fileUrl: ""
  });

  function applyProfileState(data, user) {
    const rawPortfolio = parseJsonField(data.portfolio_links, {});
    const rawSocial = parseJsonField(data.social_links, {});

    setProfile({
      ...defaultProfile,
      fullName: data.full_name || user?.user_metadata?.full_name || "",
      email: data.email || user?.email || "",
      contactNumber: data.contact_number || "",
      address: data.address || "",
      profilePictureUrl: data.profile_picture_url || "",
      visibility: data.visibility !== false,
      portfolioLinks: {
        portfolioUrl: rawPortfolio.portfolioUrl || rawPortfolio.portfolio || "",
        githubUrl: rawSocial.githubUrl || rawSocial.github || "",
        linkedinUrl: rawSocial.linkedinUrl || rawSocial.linkedin || "",
        twitterUrl: rawSocial.twitterUrl || rawSocial.twitter || ""
      },
      verificationStatus: data.verification_status || "Pending Verification",
      idImageUrl: data.id_image_url || "",
      selfieImageUrl: data.selfie_image_url || "",
      verificationDate: data.verification_date || null,
      verificationReason: data.verification_reason || data.rejection_reason || ""
    });

    setSkills(parseSkills(data.skills));
    setEducation(parseJsonField(data.education, []));
    setWorkExperience(parseJsonField(data.work_experience, []));
    setCertifications(parseJsonField(data.certifications, []));
  }

  function cacheProfileLocally(id, nextProfile, nextSkills, nextEdu, nextExp, nextCert) {
    saveCandidateProfile(
      {
        id,
        fullName: nextProfile.fullName,
        full_name: nextProfile.fullName,
        email: nextProfile.email,
        contact_number: nextProfile.contactNumber,
        contactNumber: nextProfile.contactNumber,
        address: nextProfile.address,
        profile_picture_url: nextProfile.profilePictureUrl,
        visibility: nextProfile.visibility,
        portfolio_links: nextProfile.portfolioLinks,
        social_links: nextProfile.portfolioLinks,
        skills: nextSkills,
        education: nextEdu,
        work_experience: nextExp,
        certifications: nextCert
      },
      id
    );
  }

  async function persistProfileToServer(id, nextProfile, nextSkills, nextEdu, nextExp, nextCert) {
    const storedUser = getCurrentUser();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return { error: new Error("No active session") };

    // Package the portfolio and social links
    const portfolioLinks = {
      portfolioUrl: nextProfile.portfolioLinks.portfolioUrl
    };
    const socialLinks = {
      githubUrl: nextProfile.portfolioLinks.githubUrl,
      linkedinUrl: nextProfile.portfolioLinks.linkedinUrl,
      twitterUrl: nextProfile.portfolioLinks.twitterUrl
    };

    const payload = {
      id,
      full_name: nextProfile.fullName.trim(),
      email: nextProfile.email.trim() || session.user.email || storedUser?.email,
      contact_number: nextProfile.contactNumber.trim(),
      address: nextProfile.address.trim(),
      skills: nextSkills.join(","),
      role: storedUser?.role || session.user?.user_metadata?.role || "candidate",
      profile_picture_url: nextProfile.profilePictureUrl,
      visibility: nextProfile.visibility,
      portfolio_links: portfolioLinks,
      social_links: socialLinks,
      education: nextEdu,
      work_experience: nextExp,
      certifications: nextCert,
      verification_status: nextProfile.verificationStatus,
      id_image_url: nextProfile.idImageUrl,
      selfie_image_url: nextProfile.selfieImageUrl,
      verification_date: nextProfile.verificationDate
    };

    let result = await supabase.from("profiles").upsert(payload);

    // Fallback if DB update fails due to schema mismatch (e.g. columns not matching - although user ran it, just to be safe)
    if (result.error) {
      console.warn("DB write failed, trying fallback write:", result.error.message);
      // Remove extra fields and save basic ones
      const { 
        profile_picture_url, visibility, portfolio_links, 
        social_links, education, work_experience, certifications, 
        ...basicPayload 
      } = payload;
      result = await supabase.from("profiles").upsert(basicPayload);
    }

    // Phase 2: Save advanced data to candidate_profiles for AI Matching
    let expYears = 0;
    if (nextExp && nextExp.length > 0) {
      // Rough estimation of years
      expYears = nextExp.length * 2; 
    }
    
    await supabase.from("candidate_profiles").upsert({
      user_id: id,
      course: nextEdu[0]?.field || null,
      degree: nextEdu[0]?.degree || null,
      education_level: nextEdu[0]?.degree || null,
      skills: JSON.stringify(nextSkills),
      certifications: JSON.stringify(nextCert),
      years_experience: expYears,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

    return result;
  }

  function updateStoredUserName(fullName) {
    const stored = getCurrentUser();
    if (!stored) return;
    setCurrentUser({
      ...stored,
      full_name: fullName,
      fullName,
      name: fullName,
    });
  }

  async function loadProfileForUser(user) {
    if (!user?.id) return;
    setUserId(user.id);

    const storedUser = getCurrentUser();
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (data) {
      applyProfileState(data, user);
      cacheProfileLocally(
        user.id, 
        profile, 
        parseSkills(data.skills), 
        parseJsonField(data.education, []),
        parseJsonField(data.work_experience, []),
        parseJsonField(data.certifications, [])
      );
      return;
    }

    const cached = getCandidateProfileByUserId(user.id);
    if (cached) {
      applyProfileState(
        {
          full_name: cached.fullName || cached.full_name || user?.full_name || "",
          email: cached.email || user?.email || "",
          contact_number: cached.contactNumber || cached.contact_number || "",
          address: cached.address || "",
          profile_picture_url: cached.profile_picture_url || "",
          visibility: cached.visibility !== false,
          portfolio_links: cached.portfolio_links || {},
          social_links: cached.social_links || {},
          skills: cached.skills || [],
          education: cached.education || [],
          work_experience: cached.work_experience || [],
          certifications: cached.certifications || []
        },
        { ...user, ...storedUser }
      );
      return;
    }

    // Default loading state
    setProfile({
      ...defaultProfile,
      email: user.email || storedUser?.email || "",
      fullName: user.user_metadata?.full_name || storedUser?.full_name || "",
    });

    if (error) {
      console.warn("Could not load profile from database:", error.message);
    }
  }

  useEffect(() => {
    let active = true;

    async function init() {
      // DEV MODE: no Supabase session — read user from localStorage
      if (isDevMode()) {
        const stored = getCurrentUser();
        if (stored?.id && active) {
          setUserId(stored.id);
          setProfile(prev => ({
            ...prev,
            fullName:          stored.full_name || stored.fullName || prev.fullName,
            email:             stored.email || prev.email,
            profilePictureUrl: stored.profile_picture_url || '',
          }));
        }
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user && active) {
        await loadProfileForUser(session.user);
      }
    }

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (!active) return;
        if (event === "SIGNED_OUT") {
          setProfile(defaultProfile);
          setSkills([]);
          setEducation([]);
          setWorkExperience([]);
          setCertifications([]);
          setUserId(null);
          setSaving(false);
        }
      }
    );

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // Calculate completeness score
  function calculateCompleteness() {
    let score = 10; // Base email
    if (profile.fullName) score += 10;
    if (profile.contactNumber) score += 10;
    if (profile.address) score += 10;
    if (profile.profilePictureUrl || profile.portfolioLinks.linkedinUrl) score += 10;
    if (skills.length > 0) score += 10;
    if (workExperience.length > 0) score += 10;
    if (education.length > 0) score += 10;
    if (profile.verificationStatus === "Verified") {
      score += 20;
    } else if (profile.idImageUrl && profile.selfieImageUrl) {
      score += 10; // Pending verification but uploaded
    }
    return Math.min(100, score);
  }

  const completenessScore = calculateCompleteness();
  const strokeDashoffset = 220 - (220 * completenessScore) / 100;

  function handleChange(e) {
    const { name, value } = e.target;
    setProfile((prev) => ({ ...prev, [name]: value }));
  }

  function handleNestedChange(category, field, value) {
    setProfile((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [field]: value
      }
    }));
  }

  // Profile picture change — keeps state + localStorage in sync
  function handlePhotoChange(newUrl) {
    setProfile(prev => ({ ...prev, profilePictureUrl: newUrl }));
    const stored = getCurrentUser();
    if (stored) setCurrentUser({ ...stored, profile_picture_url: newUrl });
  }

  async function handleAddSkill() {
    const trimmed = skillInput.trim();
    if (!trimmed) return;
    if (skills.includes(trimmed)) return;
    const nextSkills = [...skills, trimmed];
    setSkills(nextSkills);
    setSkillInput("");

    const activeId = userId || getCurrentUser()?.id;
    if (!activeId) return;

    cacheProfileLocally(activeId, profile, nextSkills, education, workExperience, certifications);
    await persistProfileToServer(activeId, profile, nextSkills, education, workExperience, certifications);
    updateStoredUserName(profile.fullName);
    syncApplicantSnapshot(activeId).catch(() => {});
  }

  function handleSkillKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddSkill();
    }
  }

  async function handleRemoveSkill(skill) {
    const nextSkills = skills.filter((s) => s !== skill);
    setSkills(nextSkills);

    const activeId = userId || getCurrentUser()?.id;
    if (!activeId) return;

    cacheProfileLocally(activeId, profile, nextSkills, education, workExperience, certifications);
    await persistProfileToServer(activeId, profile, nextSkills, education, workExperience, certifications);
    syncApplicantSnapshot(activeId).catch(() => {});
  }

  // Work Experience Operations
  function openAddExp() {
    setEditingExpIndex(null);
    setExpForm({ title: "", company: "", startDate: "", endDate: "", description: "" });
    setShowExpModal(true);
  }

  function openEditExp(index) {
    setEditingExpIndex(index);
    setExpForm({ ...workExperience[index] });
    setShowExpModal(true);
  }

  async function saveExperience(e) {
    e.preventDefault();
    let nextExp = [...workExperience];
    if (editingExpIndex !== null) {
      nextExp[editingExpIndex] = expForm;
    } else {
      nextExp.push(expForm);
    }
    setWorkExperience(nextExp);
    setShowExpModal(false);

    const activeId = userId || getCurrentUser()?.id;
    if (activeId) {
      cacheProfileLocally(activeId, profile, skills, education, nextExp, certifications);
      await persistProfileToServer(activeId, profile, skills, education, nextExp, certifications);
      syncApplicantSnapshot(activeId).catch(() => {});
    }
  }

  async function deleteExperience(index) {
    const nextExp = workExperience.filter((_, i) => i !== index);
    setWorkExperience(nextExp);
    
    const activeId = userId || getCurrentUser()?.id;
    if (activeId) {
      cacheProfileLocally(activeId, profile, skills, education, nextExp, certifications);
      await persistProfileToServer(activeId, profile, skills, education, nextExp, certifications);
      syncApplicantSnapshot(activeId).catch(() => {});
    }
  }

  // Education Operations
  function openAddEdu() {
    setEditingEduIndex(null);
    setEduForm({ degree: "", school: "", field: "", gradYear: "" });
    setShowEduModal(true);
  }

  function openEditEdu(index) {
    setEditingEduIndex(index);
    setEduForm({ ...education[index] });
    setShowEduModal(true);
  }

  async function saveEducation(e) {
    e.preventDefault();
    let nextEdu = [...education];
    if (editingEduIndex !== null) {
      nextEdu[editingEduIndex] = eduForm;
    } else {
      nextEdu.push(eduForm);
    }
    setEducation(nextEdu);
    setShowEduModal(false);

    const activeId = userId || getCurrentUser()?.id;
    if (activeId) {
      cacheProfileLocally(activeId, profile, skills, nextEdu, workExperience, certifications);
      await persistProfileToServer(activeId, profile, skills, nextEdu, workExperience, certifications);
      syncApplicantSnapshot(activeId).catch(() => {});
    }
  }

  async function deleteEducation(index) {
    const nextEdu = education.filter((_, i) => i !== index);
    setEducation(nextEdu);

    const activeId = userId || getCurrentUser()?.id;
    if (activeId) {
      cacheProfileLocally(activeId, profile, skills, nextEdu, workExperience, certifications);
      await persistProfileToServer(activeId, profile, skills, nextEdu, workExperience, certifications);
      syncApplicantSnapshot(activeId).catch(() => {});
    }
  }

  // Certifications Operations
  async function handleOpenCertificate(e, fileUrl) {
    e.preventDefault();
    if (!fileUrl) return;

    const { url, error } = await getCertificateSignedUrl(fileUrl);
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      setMessage({ text: "Could not view certificate: " + (error?.message || "File unavailable"), type: "error" });
    }
  }

  function openAddCert() {
    setEditingCertIndex(null);
    setCertForm({ name: "", issuer: "", date: "", credentialId: "", file: null, fileUrl: "" });
    setShowCertModal(true);
  }

  function openEditCert(index) {
    setEditingCertIndex(index);
    setCertForm({ ...certifications[index], file: null });
    setShowCertModal(true);
  }

  async function saveCertification(e) {
    e.preventDefault();
    setSaving(true);
    let finalCertForm = { ...certForm };

    try {
      const activeId = userId || getCurrentUser()?.id;
      if (activeId && certForm.file) {
        const { data: url, error } = await uploadCertificateFile(certForm.file, activeId);
        if (error) throw error;
        finalCertForm.fileUrl = url;
      }
      
      // Clean up file object before saving to JSONB
      delete finalCertForm.file;

      let nextCert = [...certifications];
      if (editingCertIndex !== null) {
        nextCert[editingCertIndex] = finalCertForm;
      } else {
        nextCert.push(finalCertForm);
      }
      setCertifications(nextCert);
      setShowCertModal(false);

      if (activeId) {
        cacheProfileLocally(activeId, profile, skills, education, workExperience, nextCert);
        await persistProfileToServer(activeId, profile, skills, education, workExperience, nextCert);
        syncApplicantSnapshot(activeId).catch(() => {});
      }
    } catch (err) {
      setMessage({ text: "Failed to upload certificate: " + err.message, type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function deleteCertification(index) {
    const nextCert = certifications.filter((_, i) => i !== index);
    setCertifications(nextCert);

    const activeId = userId || getCurrentUser()?.id;
    if (activeId) {
      cacheProfileLocally(activeId, profile, skills, education, workExperience, nextCert);
      await persistProfileToServer(activeId, profile, skills, education, workExperience, nextCert);
      syncApplicantSnapshot(activeId).catch(() => {});
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setMessage({ text: "", type: "success" });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const storedUser = getCurrentUser();
      const activeUserId = session?.user?.id || userId || storedUser?.id;

      if (!activeUserId) {
        setMessage({
          text: "Your session expired. Please sign in again, then save your profile.",
          type: "error",
        });
        return;
      }

      setUserId(activeUserId);

      if (profile.newPassword || profile.confirmPassword) {
        if (!profile.currentPassword) {
          setMessage({
            text: "Please enter your current password before changing it.",
            type: "error",
          });
          return;
        }
        if (profile.newPassword !== profile.confirmPassword) {
          setMessage({
            text: "New password and confirm password do not match.",
            type: "error",
          });
          return;
        }
        if (profile.newPassword.length < 6) {
          setMessage({
            text: "New password must be at least 6 characters.",
            type: "error",
          });
          return;
        }
        const { error: pwError } = await supabase.auth.updateUser({
          password: profile.newPassword,
        });
        if (pwError) {
          setMessage({
            text: "Failed to update password: " + pwError.message,
            type: "error",
          });
          return;
        }
      }

      cacheProfileLocally(activeUserId, profile, skills, education, workExperience, certifications);
      const { error } = await persistProfileToServer(activeUserId, profile, skills, education, workExperience, certifications);

      if (error) {
        setMessage({
          text: "Could not sync to the server (" + error.message + "). Changes saved locally.",
          type: "error",
        });
        return;
      }

      updateStoredUserName(profile.fullName.trim());
      syncApplicantSnapshot(activeUserId).catch(() => {});

      // Trigger AI Matching Engine
      runMatchingForCandidate(activeUserId).catch(console.error);

      setProfile((prev) => ({
        ...prev,
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      }));

      setMessage({ text: "Profile updated successfully!", type: "success" });
      setActiveTab("view");
    } catch (err) {
      setMessage({
        text: err.message || "Something went wrong while saving. Please try again.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleVerificationUpload(e, type) {
    const file = e.target.files[0];
    if (!file) return;
    setSaving(true);
    try {
      const activeId = userId || getCurrentUser()?.id;
      if (!activeId) throw new Error("No active user session");
      
      const { data: url, error } = await uploadVerificationDocument(file, activeId, type);
      if (error) throw error;
      
      const updateKey = type === "id" ? "idImageUrl" : "selfieImageUrl";
      // Status becomes "Under Review" so admin can see it needs attention
      const newStatus = "Under Review";
      const newDate = new Date().toISOString();
      
      setProfile(prev => ({
        ...prev,
        [updateKey]: url,
        verificationStatus: newStatus,
        verificationDate: newDate
      }));
      
      await supabase.from("profiles").update({
        [type === "id" ? "id_image_url" : "selfie_image_url"]: url,
        verification_status: newStatus,
        verification_date: newDate
      }).eq("id", activeId);
      
      try {
        const { addNotification } = await import("../../services/notificationService");
        await addNotification(
          activeId,
          "Identity Verification Submitted",
          `Your ${type === 'id' ? 'Government ID' : 'Selfie image'} has been uploaded and submitted for administrator review.`,
          "system"
        );
      } catch (notifErr) {
        console.warn("Failed sending upload notification:", notifErr);
      }

      setMessage({ text: `${type === 'id' ? 'Valid ID' : 'Selfie image'} uploaded successfully!`, type: "success" });
    } catch (err) {
      setMessage({ text: `Failed to upload: ${err.message}`, type: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardLayout
      role="candidate"
      title="Profile Builder"
      subtitle="Complete your profile to unlock custom AI job matches."
    >
      {/* Profile Completeness Visual */}
      <div className="profile-completeness-banner">
        <div className="completeness-circle-container">
          <svg width="72" height="72">
            <defs>
              <linearGradient id="purple-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#58158f" />
                <stop offset="100%" stopColor="#f13093" />
              </linearGradient>
            </defs>
            <circle className="completeness-circle-bg" cx="36" cy="36" r="32" />
            <circle 
              className="completeness-circle-bar" 
              cx="36" 
              cy="36" 
              r="32" 
              strokeDasharray="220"
              strokeDashoffset={strokeDashoffset}
            />
          </svg>
          <span className="completeness-text">{completenessScore}%</span>
        </div>
        <div className="completeness-info">
          <h3>Profile Completeness Score</h3>
          {completenessScore < 100 ? (
            <p>Complete your profile details, add education, skills, and work history to reach 100% and get noticed by recruiters.</p>
          ) : (
            <p>Excellent! Your profile is 100% complete and fully optimized for automated matching processes.</p>
          )}
        </div>
      </div>

      <section className="dashboard-panel">
        {/* Tab Buttons */}
        <div className="profile-tabs">
          <button
            className={`profile-tab-btn ${activeTab === "view" ? "active" : ""}`}
            onClick={() => { setActiveTab("view"); setMessage({ text: "", type: "success" }); }}
          >
            View Professional Profile
          </button>
          <button
            className={`profile-tab-btn ${activeTab === "edit" ? "active" : ""}`}
            onClick={() => { setActiveTab("edit"); setMessage({ text: "", type: "success" }); }}
          >
            Edit Details & Portfolio
          </button>
          <button
            className={`profile-tab-btn ${activeTab === "experience" ? "active" : ""}`}
            onClick={() => { setActiveTab("experience"); setMessage({ text: "", type: "success" }); }}
          >
            Work Experience ({workExperience.length})
          </button>
          <button
            className={`profile-tab-btn ${activeTab === "education" ? "active" : ""}`}
            onClick={() => { setActiveTab("education"); setMessage({ text: "", type: "success" }); }}
          >
            Education ({education.length})
          </button>
          <button
            className={`profile-tab-btn ${activeTab === "certifications" ? "active" : ""}`}
            onClick={() => { setActiveTab("certifications"); setMessage({ text: "", type: "success" }); }}
          >
            Certifications ({certifications.length})
          </button>
          <button
            className={`profile-tab-btn ${activeTab === "verification" ? "active" : ""}`}
            onClick={() => { setActiveTab("verification"); setMessage({ text: "", type: "success" }); }}
          >
            Identity Verification
          </button>
        </div>

        {message.text && (
          <div
            className="profile-message"
            style={
              message.type === "error"
                ? { background: "#fff1f2", color: "#e11d48", borderColor: "#fecdd3" }
                : {}
            }
          >
            {message.text}
          </div>
        )}

        {/* ── VIEW PROFILE ── */}
        {activeTab === "view" && (
          <div className="profile-view">
            <div className="profile-view-header-row">
              <div className="profile-view-avatar-wrapper">
                <ProfilePictureUploader
                  currentUrl={profile.profilePictureUrl}
                  name={profile.fullName || "C"}
                  userId={userId}
                  role="candidate"
                  onPhotoChange={handlePhotoChange}
                  size={88}
                  disabled={saving}
                />
              </div>
              <div className="profile-view-title">
                <h2>{profile.fullName || "Your Full Name"}</h2>
                <span className={profile.visibility ? "public" : "private"}>
                  {profile.visibility ? "🔓 Public Visibility" : "🔒 Private Search"}
                </span>
              </div>
            </div>

            <div className="profile-view-grid">
              <div className="profile-view-field">
                <span className="profile-view-label">Full Name</span>
                <span className="profile-view-value">{profile.fullName || <em>Not provided</em>}</span>
              </div>
              <div className="profile-view-field">
                <span className="profile-view-label">Email Address</span>
                <span className="profile-view-value">{profile.email || <em>Not provided</em>}</span>
              </div>
              <div className="profile-view-field">
                <span className="profile-view-label">Contact Number</span>
                <span className="profile-view-value">{profile.contactNumber || <em>Not provided</em>}</span>
              </div>
              <div className="profile-view-field">
                <span className="profile-view-label">Address</span>
                <span className="profile-view-value">{profile.address || <em>Not provided</em>}</span>
              </div>
            </div>

            {/* Portfolio and Links */}
            {(profile.portfolioLinks.portfolioUrl || profile.portfolioLinks.linkedinUrl || profile.portfolioLinks.githubUrl) && (
              <div className="profile-section-card">
                <div className="section-card-header">
                  <h3>🔗 Portfolio & Social Links</h3>
                </div>
                <div className="portfolio-links-grid">
                  {profile.portfolioLinks.portfolioUrl && (
                    <a href={profile.portfolioLinks.portfolioUrl} target="_blank" rel="noreferrer" className="portfolio-link-item">
                      <span className="portfolio-link-icon">🌐</span> Portfolio Website
                    </a>
                  )}
                  {profile.portfolioLinks.linkedinUrl && (
                    <a href={profile.portfolioLinks.linkedinUrl} target="_blank" rel="noreferrer" className="portfolio-link-item">
                      <span className="portfolio-link-icon">💼</span> LinkedIn Profile
                    </a>
                  )}
                  {profile.portfolioLinks.githubUrl && (
                    <a href={profile.portfolioLinks.githubUrl} target="_blank" rel="noreferrer" className="portfolio-link-item">
                      <span className="portfolio-link-icon">💻</span> GitHub Portfolio
                    </a>
                  )}
                  {profile.portfolioLinks.twitterUrl && (
                    <a href={profile.portfolioLinks.twitterUrl} target="_blank" rel="noreferrer" className="portfolio-link-item">
                      <span className="portfolio-link-icon">🐦</span> Twitter / X
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Skills View */}
            <div className="profile-section-card">
              <div className="section-card-header">
                <h3>🛠 Professional Skills</h3>
              </div>
              {skills.length > 0 ? (
                <div className="profile-skills-display">
                  {skills.map((skill) => (
                    <span key={skill} className="profile-skill-tag">{skill}</span>
                  ))}
                </div>
              ) : (
                <p style={{ color: "#6b7280" }}>No skills added. Navigate to "Edit Details & Portfolio" to add tags.</p>
              )}
            </div>

            {/* Work History Timeline */}
            <div className="profile-section-card">
              <div className="section-card-header">
                <h3>💼 Work Experience</h3>
              </div>
              {workExperience.length > 0 ? (
                <div className="timeline-container">
                  {workExperience.map((exp, index) => (
                    <div key={index} className="timeline-item">
                      <div className="timeline-badge"></div>
                      <div className="timeline-content">
                        <div className="timeline-item-header">
                          <div>
                            <h4>{exp.title}</h4>
                            <h5>{exp.company}</h5>
                          </div>
                          <span className="timeline-item-date">{exp.startDate} - {exp.endDate || "Present"}</span>
                        </div>
                        {exp.description && <p className="timeline-item-description">{exp.description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: "#6b7280" }}>No work experience added yet.</p>
              )}
            </div>

            {/* Education History Timeline */}
            <div className="profile-section-card">
              <div className="section-card-header">
                <h3>🎓 Education</h3>
              </div>
              {education.length > 0 ? (
                <div className="timeline-container">
                  {education.map((edu, index) => (
                    <div key={index} className="timeline-item">
                      <div className="timeline-badge"></div>
                      <div className="timeline-content">
                        <div className="timeline-item-header">
                          <div>
                            <h4>{edu.degree} in {edu.field}</h4>
                            <h5>{edu.school}</h5>
                          </div>
                          <span className="timeline-item-date">Graduated {edu.gradYear}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: "#6b7280" }}>No education qualifications added yet.</p>
              )}
            </div>

            {/* Certifications List */}
            <div className="profile-section-card">
              <div className="section-card-header">
                <h3>📜 Certifications & Achievements</h3>
              </div>
              {certifications.length > 0 ? (
                <div className="timeline-container">
                  {certifications.map((cert, index) => (
                    <div key={index} className="timeline-item">
                      <div className="timeline-badge"></div>
                      <div className="timeline-content">
                        <div className="timeline-item-header">
                          <div>
                            <h4>{cert.name}</h4>
                            <h5>Issued by {cert.issuer}</h5>
                            {cert.credentialId && <small style={{ color: "#8b8f9c" }}>ID: {cert.credentialId}</small>}
                          </div>
                          <span className="timeline-item-date">{cert.date}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: "#6b7280" }}>No certifications added yet.</p>
              )}
            </div>
          </div>
        )}

        {/* ── EDIT DETAILS & PORTFOLIO ── */}
        {activeTab === "edit" && (
          <form className="profile-form" onSubmit={handleSubmit}>
            <div className="profile-form-grid">
              <label>
                <span>Full Name</span>
                <input
                  name="fullName"
                  type="text"
                  value={profile.fullName}
                  onChange={handleChange}
                  placeholder="Enter your full name"
                  required
                />
              </label>

              <label>
                <span>Email Address</span>
                <input
                  name="email"
                  type="email"
                  value={profile.email}
                  placeholder="you@example.com"
                  disabled
                />
              </label>

              <label>
                <span>Contact Number</span>
                <input
                  name="contactNumber"
                  type="tel"
                  value={profile.contactNumber}
                  onChange={handleChange}
                  placeholder="Enter contact number"
                />
              </label>

              <label>
                <span>Address</span>
                <input
                  name="address"
                  type="text"
                  value={profile.address}
                  onChange={handleChange}
                  placeholder="e.g. Metro Manila, Philippines"
                />
              </label>

              <label>
                <span>Profile Picture URL</span>
                <input
                  name="profilePictureUrl"
                  type="url"
                  value={profile.profilePictureUrl}
                  onChange={handleChange}
                  placeholder="https://example.com/avatar.jpg"
                />
              </label>

              <label>
                <span>Portfolio Website Link</span>
                <input
                  type="url"
                  value={profile.portfolioLinks.portfolioUrl}
                  onChange={(e) => handleNestedChange("portfolioLinks", "portfolioUrl", e.target.value)}
                  placeholder="https://yourwebsite.com"
                />
              </label>

              <label>
                <span>GitHub Link</span>
                <input
                  type="url"
                  value={profile.portfolioLinks.githubUrl}
                  onChange={(e) => handleNestedChange("portfolioLinks", "githubUrl", e.target.value)}
                  placeholder="https://github.com/username"
                />
              </label>

              <label>
                <span>LinkedIn Link</span>
                <input
                  type="url"
                  value={profile.portfolioLinks.linkedinUrl}
                  onChange={(e) => handleNestedChange("portfolioLinks", "linkedinUrl", e.target.value)}
                  placeholder="https://linkedin.com/in/username"
                />
              </label>

              <label>
                <span>Twitter / X Link</span>
                <input
                  type="url"
                  value={profile.portfolioLinks.twitterUrl}
                  onChange={(e) => handleNestedChange("portfolioLinks", "twitterUrl", e.target.value)}
                  placeholder="https://x.com/username"
                />
              </label>
            </div>

            {/* Visibility Toggle Switch */}
            <div className="visibility-card">
              <div className="visibility-info">
                <h4>Search Visibility Setting</h4>
                <p>{profile.visibility ? "Recruiters and employers can search and discover your profile." : "Your profile is hidden from direct database search matches."}</p>
              </div>
              <label className="toggle-switch">
                <input 
                  type="checkbox"
                  checked={profile.visibility}
                  onChange={(e) => setProfile(prev => ({ ...prev, visibility: e.target.checked }))}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            {/* Skills Tag Management */}
            <div className="profile-skills-section">
              <h3>Skills Tags</h3>
              <p>Add tools, languages, and core skills you want matched against job openings.</p>
              <div className="profile-skills-input-row">
                <input
                  type="text"
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={handleSkillKeyDown}
                  placeholder="Press Enter or click Add (e.g. React, Node.js)"
                  className="profile-skill-input"
                />
                <button type="button" className="profile-skill-add-btn" onClick={handleAddSkill}>
                  Add
                </button>
              </div>
              {skills.length > 0 && (
                <div className="profile-skills-display">
                  {skills.map((skill) => (
                    <span key={skill} className="profile-skill-tag">
                      {skill}
                      <button type="button" className="profile-skill-remove" onClick={() => handleRemoveSkill(skill)}>
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Password security section */}
            <div className="profile-password-section">
              <div>
                <h3>Account Security</h3>
                <p>Fill out the password fields below to set a new security credential.</p>
              </div>
              <div className="profile-form-grid">
                <label>
                  <span>Current Password</span>
                  <input
                    name="currentPassword"
                    type="password"
                    value={profile.currentPassword}
                    onChange={handleChange}
                    placeholder="Enter current password"
                  />
                </label>
                <label>
                  <span>New Password</span>
                  <input
                    name="newPassword"
                    type="password"
                    value={profile.newPassword}
                    onChange={handleChange}
                    placeholder="Enter new password"
                  />
                </label>
                <label>
                  <span>Confirm New Password</span>
                  <input
                    name="confirmPassword"
                    type="password"
                    value={profile.confirmPassword}
                    onChange={handleChange}
                    placeholder="Confirm new password"
                  />
                </label>
              </div>
            </div>

            <div className="profile-actions">
              <button className="profile-save-btn" type="submit" disabled={saving}>
                {saving ? "Saving Changes..." : "Save Profile Details"}
              </button>
              <button className="profile-cancel-btn" type="button" onClick={() => setActiveTab("view")}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* ── WORK EXPERIENCE TAB ── */}
        {activeTab === "experience" && (
          <div className="profile-view">
            <div className="section-card-header">
              <h3>💼 Manage Work History</h3>
              <button type="button" className="add-section-item-btn" onClick={openAddExp}>
                + Add Experience
              </button>
            </div>

            {workExperience.length > 0 ? (
              <div className="timeline-container">
                {workExperience.map((exp, index) => (
                  <div key={index} className="timeline-item">
                    <div className="timeline-badge"></div>
                    <div className="timeline-content">
                      <div className="timeline-item-header">
                        <div>
                          <h4>{exp.title}</h4>
                          <h5>{exp.company}</h5>
                        </div>
                        <span className="timeline-item-date">{exp.startDate} - {exp.endDate || "Present"}</span>
                      </div>
                      {exp.description && <p className="timeline-item-description">{exp.description}</p>}
                      <div className="timeline-item-actions">
                        <button type="button" className="timeline-btn edit" onClick={() => openEditExp(index)}>Edit</button>
                        <button type="button" className="timeline-btn delete" onClick={() => deleteExperience(index)}>Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "#6b7280", textAlign: "center", padding: "40px" }}>No experience records. Add one above to enrich your profile details.</p>
            )}
          </div>
        )}

        {/* ── EDUCATION TAB ── */}
        {activeTab === "education" && (
          <div className="profile-view">
            <div className="section-card-header">
              <h3>🎓 Manage Education history</h3>
              <button type="button" className="add-section-item-btn" onClick={openAddEdu}>
                + Add Qualification
              </button>
            </div>

            {education.length > 0 ? (
              <div className="timeline-container">
                {education.map((edu, index) => (
                  <div key={index} className="timeline-item">
                    <div className="timeline-badge"></div>
                    <div className="timeline-content">
                      <div className="timeline-item-header">
                        <div>
                          <h4>{edu.degree} in {edu.field}</h4>
                          <h5>{edu.school}</h5>
                        </div>
                        <span className="timeline-item-date">Graduation: {edu.gradYear}</span>
                      </div>
                      <div className="timeline-item-actions">
                        <button type="button" className="timeline-btn edit" onClick={() => openEditEdu(index)}>Edit</button>
                        <button type="button" className="timeline-btn delete" onClick={() => deleteEducation(index)}>Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "#6b7280", textAlign: "center", padding: "40px" }}>No education records. Add your school or university history.</p>
            )}
          </div>
        )}

        {/* ── CERTIFICATIONS TAB ── */}
        {activeTab === "certifications" && (
          <div className="profile-view">
            <div className="section-card-header">
              <h3>📜 Manage Certifications & Licensure</h3>
              <button type="button" className="add-section-item-btn" onClick={openAddCert}>
                + Add Certification
              </button>
            </div>

            {certifications.length > 0 ? (
              <div className="timeline-container">
                {certifications.map((cert, index) => (
                  <div key={index} className="timeline-item">
                    <div className="timeline-badge"></div>
                    <div className="timeline-content">
                      <div className="timeline-item-header">
                        <div>
                          <h4>{cert.name}</h4>
                          <h5>{cert.issuer}</h5>
                          {cert.credentialId && <small style={{ color: "#8b8f9c", display: "block" }}>Credential ID: {cert.credentialId}</small>}
                          {cert.fileUrl && (
                            <a
                              href="#"
                              onClick={(e) => handleOpenCertificate(e, cert.fileUrl)}
                              style={{ display: "inline-block", marginTop: "4px", fontSize: "12px", color: "#58158f", textDecoration: "none", fontWeight: "bold" }}
                            >
                              📎 View Attached Certificate
                            </a>
                          )}
                        </div>
                        <span className="timeline-item-date">Issued {cert.date}</span>
                      </div>
                      <div className="timeline-item-actions">
                        <button type="button" className="timeline-btn edit" onClick={() => openEditCert(index)}>Edit</button>
                        <button type="button" className="timeline-btn delete" onClick={() => deleteCertification(index)}>Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "#6b7280", textAlign: "center", padding: "40px" }}>No certifications added. Add links to courses, credentials, or licenses you have passed.</p>
            )}
          </div>
        )}

        {/* ── IDENTITY VERIFICATION TAB ── */}
        {activeTab === "verification" && (
          <div className="profile-view">
            <div className="section-card-header">
              <h3>🛡️ Identity Verification</h3>
            </div>
            <div className="profile-section-card">
              <p style={{ marginBottom: "20px", color: "#667085" }}>
                Verify your identity to increase trust with recruiters. Upload a clear photo of a valid Philippine ID and a recent selfie. An admin will review and approve your submission.
              </p>

              {/* ── Status Banner ── */}
              {(() => {
                const vs = profile.verificationStatus;
                const configs = {
                  "Verified": {
                    bg: "#dcfce7", border: "#86efac", color: "#166534",
                    icon: "✅", label: "Identity Verified",
                    msg: "Your identity has been approved by an admin. You can now apply to jobs."
                  },
                  "Approved": {
                    bg: "#dcfce7", border: "#86efac", color: "#166534",
                    icon: "✅", label: "Identity Approved",
                    msg: "Your identity has been approved. You can now apply to jobs."
                  },
                  "Rejected": {
                    bg: "#fee2e2", border: "#fca5a5", color: "#991b1b",
                    icon: "❌", label: "Verification Requires Attention",
                    msg: (profile.verificationReason || profile.rejectionReason)
                      ? `Rejection Reason: "${profile.verificationReason || profile.rejectionReason}". Please re-upload clear, valid documents below to resubmit for review.`
                      : "Your documents could not be approved. Please re-upload a clear, valid ID and selfie to resubmit."
                  },
                  "Under Review": {
                    bg: "#fefce8", border: "#fde68a", color: "#92400e",
                    icon: "⏳", label: "Under Admin Review",
                    msg: "Your documents have been submitted and are being reviewed. You will be able to apply to jobs once approved."
                  },
                };
                const cfg = configs[vs] || {
                  bg: "#f1f5f9", border: "#cbd5e1", color: "#475569",
                  icon: "🔒", label: vs || "Pending Verification",
                  msg: "Upload your valid ID and selfie below to start the verification process."
                };
                return (
                  <div style={{ padding: "16px 20px", background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: "12px", marginBottom: "24px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                      <span style={{ fontSize: "20px" }}>{cfg.icon}</span>
                      <strong style={{ color: cfg.color, fontSize: "15px" }}>{cfg.label}</strong>
                    </div>
                    <p style={{ margin: 0, fontSize: "13px", color: cfg.color }}>{cfg.msg}</p>
                  </div>
                );
              })()}

              {/* ── Upload Grid ── */}
              {profile.verificationStatus !== "Verified" && profile.verificationStatus !== "Approved" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginTop: "8px" }}>
                  {/* Valid ID */}
                  <div style={{
                    border: profile.idImageUrl ? "2px solid #86efac" : "1px dashed #cbd5e1",
                    padding: "20px", borderRadius: "12px",
                    background: profile.idImageUrl ? "#f0fdf4" : "#fff"
                  }}>
                    <h4 style={{ margin: "0 0 6px", fontSize: "14px" }}>
                      📄 Upload Valid ID {profile.idImageUrl && <span style={{ color: "#16a34a", fontSize: "12px" }}>✓ Uploaded</span>}
                    </h4>
                    <p style={{ fontSize: "12px", color: "#6b7280", marginBottom: "12px" }}>
                      National ID, Passport, Driver's License, UMID, PRC ID, PhilHealth
                    </p>
                    {profile.idImageUrl && (
                      <div style={{ marginBottom: "12px", borderRadius: "8px", overflow: "hidden", border: "1px solid #e2e8f0" }}>
                        <img src={profile.idImageUrl} alt="Valid ID" style={{ width: "100%", maxHeight: "160px", objectFit: "cover" }} />
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) => handleVerificationUpload(e, "id")}
                      disabled={saving}
                      style={{ fontSize: "13px" }}
                    />
                  </div>

                  {/* Selfie */}
                  <div style={{
                    border: profile.selfieImageUrl ? "2px solid #86efac" : "1px dashed #cbd5e1",
                    padding: "20px", borderRadius: "12px",
                    background: profile.selfieImageUrl ? "#f0fdf4" : "#fff"
                  }}>
                    <h4 style={{ margin: "0 0 6px", fontSize: "14px" }}>
                      🤳 Capture / Upload Selfie {profile.selfieImageUrl && <span style={{ color: "#16a34a", fontSize: "12px" }}>✓ Uploaded</span>}
                    </h4>
                    <p style={{ fontSize: "12px", color: "#6b7280", marginBottom: "12px" }}>
                      Please ensure your face is clearly visible and well-lit.
                    </p>
                    {profile.selfieImageUrl && (
                      <div style={{ marginBottom: "12px", borderRadius: "8px", overflow: "hidden", border: "1px solid #e2e8f0" }}>
                        <img src={profile.selfieImageUrl} alt="Selfie" style={{ width: "100%", maxHeight: "160px", objectFit: "cover" }} />
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleVerificationUpload(e, "selfie")}
                      disabled={saving}
                      style={{ fontSize: "13px" }}
                    />
                  </div>
                </div>
              )}

              {/* Already verified — show submitted images read-only */}
              {(profile.verificationStatus === "Verified" || profile.verificationStatus === "Approved") && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginTop: "8px" }}>
                  {profile.idImageUrl && (
                    <div style={{ border: "2px solid #86efac", padding: "16px", borderRadius: "12px", background: "#f0fdf4" }}>
                      <p style={{ margin: "0 0 8px", fontSize: "12px", fontWeight: "800", color: "#166534" }}>📄 Your Valid ID</p>
                      <img src={profile.idImageUrl} alt="Valid ID" style={{ width: "100%", borderRadius: "8px", maxHeight: "160px", objectFit: "cover" }} />
                    </div>
                  )}
                  {profile.selfieImageUrl && (
                    <div style={{ border: "2px solid #86efac", padding: "16px", borderRadius: "12px", background: "#f0fdf4" }}>
                      <p style={{ margin: "0 0 8px", fontSize: "12px", fontWeight: "800", color: "#166534" }}>🤳 Your Selfie</p>
                      <img src={profile.selfieImageUrl} alt="Selfie" style={{ width: "100%", borderRadius: "8px", maxHeight: "160px", objectFit: "cover" }} />
                    </div>
                  )}
                </div>
              )}

              {saving && (
                <p style={{ textAlign: "center", color: "#8b18ff", marginTop: "16px", fontSize: "14px" }}>⏳ Uploading document...</p>
              )}
            </div>
          </div>
        )}

      </section>

      {/* ── EXPERIENCE MODAL ── */}
      {showExpModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>{editingExpIndex !== null ? "Edit Experience Detail" : "Add Work Experience"}</h3>
              <button type="button" className="modal-close-btn" onClick={() => setShowExpModal(false)}>×</button>
            </div>
            <form className="modal-form" onSubmit={saveExperience}>
              <label>
                <span>Job Title *</span>
                <input 
                  type="text" 
                  value={expForm.title} 
                  onChange={(e) => setExpForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g. Senior Frontend Engineer" 
                  required
                />
              </label>
              <label>
                <span>Company *</span>
                <input 
                  type="text" 
                  value={expForm.company} 
                  onChange={(e) => setExpForm(prev => ({ ...prev, company: e.target.value }))}
                  placeholder="e.g. Google" 
                  required
                />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <label>
                  <span>Start Date *</span>
                  <input 
                    type="month" 
                    value={expForm.startDate} 
                    onChange={(e) => setExpForm(prev => ({ ...prev, startDate: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  <span>End Date (Leave blank if current)</span>
                  <input 
                    type="month" 
                    value={expForm.endDate} 
                    onChange={(e) => setExpForm(prev => ({ ...prev, endDate: e.target.value }))}
                  />
                </label>
              </div>
              <label>
                <span>Role Description</span>
                <textarea 
                  value={expForm.description} 
                  onChange={(e) => setExpForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe your achievements and daily tasks..."
                  style={{ minHeight: "100px", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                />
              </label>
              <div className="modal-actions">
                <button type="button" className="modal-btn secondary" onClick={() => setShowExpModal(false)}>Cancel</button>
                <button type="submit" className="modal-btn primary">Save Experience</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── EDUCATION MODAL ── */}
      {showEduModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>{editingEduIndex !== null ? "Edit Education Detail" : "Add Education Record"}</h3>
              <button type="button" className="modal-close-btn" onClick={() => setShowEduModal(false)}>×</button>
            </div>
            <form className="modal-form" onSubmit={saveEducation}>
              <label>
                <span>Degree/Qualification *</span>
                <input 
                  type="text" 
                  value={eduForm.degree} 
                  onChange={(e) => setEduForm(prev => ({ ...prev, degree: e.target.value }))}
                  placeholder="e.g. Bachelor of Science" 
                  required
                />
              </label>
              <label>
                <span>Field of Study *</span>
                <input 
                  type="text" 
                  value={eduForm.field} 
                  onChange={(e) => setEduForm(prev => ({ ...prev, field: e.target.value }))}
                  placeholder="e.g. Computer Science" 
                  required
                />
              </label>
              <label>
                <span>School/University *</span>
                <input 
                  type="text" 
                  value={eduForm.school} 
                  onChange={(e) => setEduForm(prev => ({ ...prev, school: e.target.value }))}
                  placeholder="e.g. University of the Philippines" 
                  required
                />
              </label>
              <label>
                <span>Graduation Year *</span>
                <input 
                  type="number" 
                  min="1950" 
                  max="2035" 
                  value={eduForm.gradYear} 
                  onChange={(e) => setEduForm(prev => ({ ...prev, gradYear: e.target.value }))}
                  placeholder="e.g. 2024" 
                  required
                />
              </label>
              <div className="modal-actions">
                <button type="button" className="modal-btn secondary" onClick={() => setShowEduModal(false)}>Cancel</button>
                <button type="submit" className="modal-btn primary">Save Education</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── CERTIFICATIONS MODAL ── */}
      {showCertModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>{editingCertIndex !== null ? "Edit Certification Detail" : "Add Certification Record"}</h3>
              <button type="button" className="modal-close-btn" onClick={() => setShowCertModal(false)}>×</button>
            </div>
            <form className="modal-form" onSubmit={saveCertification}>
              <label>
                <span>Certification Name *</span>
                <input 
                  type="text" 
                  value={certForm.name} 
                  onChange={(e) => setCertForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. AWS Certified Solutions Architect" 
                  required
                />
              </label>
              <label>
                <span>Issuing Organization *</span>
                <input 
                  type="text" 
                  value={certForm.issuer} 
                  onChange={(e) => setCertForm(prev => ({ ...prev, issuer: e.target.value }))}
                  placeholder="e.g. Amazon Web Services" 
                  required
                />
              </label>
              <label>
                <span>Date Issued *</span>
                <input 
                  type="date" 
                  value={certForm.date} 
                  onChange={(e) => setCertForm(prev => ({ ...prev, date: e.target.value }))}
                  required
                />
              </label>
              <label>
                <span>Credential ID (Optional)</span>
                <input 
                  type="text" 
                  value={certForm.credentialId} 
                  onChange={(e) => setCertForm(prev => ({ ...prev, credentialId: e.target.value }))}
                  placeholder="e.g. AWS-12345" 
                />
              </label>
              <label>
                <span>Upload Certificate (Optional)</span>
                <input 
                  type="file" 
                  accept="image/*,.pdf"
                  onChange={(e) => setCertForm(prev => ({ ...prev, file: e.target.files[0] }))}
                />
                {certForm.fileUrl && !certForm.file && (
                  <small style={{ color: "#166534", marginTop: "4px", display: "block" }}>✓ File previously uploaded</small>
                )}
              </label>
              <div className="modal-actions">
                <button type="button" className="modal-btn secondary" onClick={() => setShowCertModal(false)}>Cancel</button>
                <button type="submit" className="modal-btn primary" disabled={saving}>{saving ? "Saving..." : "Save Certification"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </DashboardLayout>
  );
}