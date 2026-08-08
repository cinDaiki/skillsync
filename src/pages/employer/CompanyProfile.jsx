import { useEffect, useState } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { supabase } from "../../services/supabase";
import { uploadEmployerVerification, uploadCompanyBranding } from "../../services/api";
import ProfilePictureUploader from "../../components/common/ProfilePictureUploader";
import { setCurrentUser, getCurrentUser } from "../../services/localStorageService";
import { isDevMode } from "../../services/devMode";

export default function CompanyProfile() {
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });
  const [activeTab, setActiveTab] = useState("details");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState("");

  const [company, setCompany] = useState({
    companyName: "",
    industry: "",
    companySize: "",
    location: "",
    website: "",
    contactEmail: "",
    contactNumber: "",
    about: "",
    verification_status: "Pending",
    id_image_url: "",
    selfie_image_url: "",
    business_permit_url: "",
    sec_registration_url: "",
    company_logo_url: "",
    cover_photo_url: ""
  });

  const [uploadFiles, setUploadFiles] = useState({
    id_image: null,
    selfie_image: null,
    business_permit: null,
    sec_registration: null,
    company_logo: null,
    cover_photo: null
  });

  useEffect(() => {
    loadCompanyProfile();
  }, []);

  async function loadCompanyProfile() {
    setLoading(true);

    // DEV MODE: no Supabase session — read user from localStorage
    if (isDevMode()) {
      const stored = getCurrentUser();
      if (stored?.id) {
        setUserId(stored.id);
        setProfilePhotoUrl(stored.profile_picture_url || '');
        setCompany(prev => ({ ...prev, contactEmail: stored.email || '' }));
        setIsEditing(true);
      }
      setLoading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    setUserId(user.id);

    // Load personal profile picture from profiles table
    const { data: prof } = await supabase
      .from("profiles")
      .select("profile_picture_url")
      .eq("id", user.id)
      .maybeSingle();
    if (prof?.profile_picture_url) setProfilePhotoUrl(prof.profile_picture_url);

    const { data, error } = await supabase
      .from("employer_profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (data) {
      setCompany({
        companyName: data.company_name || "",
        industry: data.industry || "",
        companySize: data.company_size || "",
        location: data.location || "",
        website: data.website || "",
        contactEmail: data.contact_email || user.email || "",
        contactNumber: data.contact_number || "",
        about: data.about || "",
        verification_status: data.verification_status || "Pending",
        id_image_url: data.id_image_url || "",
        selfie_image_url: data.selfie_image_url || "",
        business_permit_url: data.business_permit_url || "",
        sec_registration_url: data.sec_registration_url || "",
        company_logo_url: data.company_logo_url || "",
        cover_photo_url: data.cover_photo_url || ""
      });
      setIsEditing(false);
    } else {
      setCompany(prev => ({ ...prev, contactEmail: user.email }));
      setIsEditing(true);
    }
    setLoading(false);
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setCompany(prev => ({ ...prev, [name]: value }));
  }

  function handleFileChange(e) {
    const { name, files } = e.target;
    if (files && files[0]) {
      setUploadFiles(prev => ({ ...prev, [name]: files[0] }));
    }
  }

  function handlePhotoChange(newUrl) {
    setProfilePhotoUrl(newUrl);
    const stored = getCurrentUser();
    if (stored) setCurrentUser({ ...stored, profile_picture_url: newUrl });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!userId) return;

    if (!company.companyName.trim() || !company.industry.trim() || !company.location.trim()) {
      setMessage({ text: "Please fill in all required fields (Name, Industry, Location).", type: "error" });
      return;
    }

    setSaving(true);
    setMessage({ text: "", type: "" });

    try {
      let finalData = {
        id: userId,
        company_name: company.companyName,
        industry: company.industry,
        company_size: company.companySize,
        location: company.location,
        website: company.website,
        contact_email: company.contactEmail,
        contact_number: company.contactNumber,
        about: company.about,
        id_image_url: company.id_image_url || null,
        selfie_image_url: company.selfie_image_url || null,
        business_permit_url: company.business_permit_url || null,
        sec_registration_url: company.sec_registration_url || null,
        company_logo_url: company.company_logo_url || null,
        cover_photo_url: company.cover_photo_url || null,
        updated_at: new Date().toISOString()
      };

      // Upload Identity & Verification files to PRIVATE storage
      if (uploadFiles.id_image) {
        const { data, error: idErr } = await uploadEmployerVerification(uploadFiles.id_image, userId, "valid_id");
        if (idErr) throw idErr;
        if (data) finalData.id_image_url = data;
      }
      if (uploadFiles.selfie_image) {
        const { data, error: selfieErr } = await uploadEmployerVerification(uploadFiles.selfie_image, userId, "selfie");
        if (selfieErr) throw selfieErr;
        if (data) finalData.selfie_image_url = data;
      }
      if (uploadFiles.business_permit) {
        const { data, error: permitErr } = await uploadEmployerVerification(uploadFiles.business_permit, userId, "permit");
        if (permitErr) throw permitErr;
        if (data) finalData.business_permit_url = data;
      }
      if (uploadFiles.sec_registration) {
        const { data, error: secErr } = await uploadEmployerVerification(uploadFiles.sec_registration, userId, "sec");
        if (secErr) throw secErr;
        if (data) finalData.sec_registration_url = data;
      }

      // Upload Public Branding files
      if (uploadFiles.company_logo) {
        const { data, error: logoErr } = await uploadCompanyBranding(uploadFiles.company_logo, userId, "logo");
        if (logoErr) throw logoErr;
        if (data) finalData.company_logo_url = data;
      }
      if (uploadFiles.cover_photo) {
        const { data, error: coverErr } = await uploadCompanyBranding(uploadFiles.cover_photo, userId, "cover");
        if (coverErr) throw coverErr;
        if (data) finalData.cover_photo_url = data;
      }

      // 1. Upsert into employer_profiles with explicit conflict target
      console.log("[CompanyProfile] employer_profiles upsert payload:", finalData);
      const { error: empError } = await supabase
        .from("employer_profiles")
        .upsert([finalData], { onConflict: "id" });

      if (empError) {
        console.error("[CompanyProfile] employer_profiles upsert error:", {
          message: empError.message,
          code: empError.code,
          details: empError.details,
          hint: empError.hint,
          status: empError.status
        });
        throw empError;
      }

      // 2. Sync valid profile fields to public.profiles table (only columns that exist on profiles table)
      const profileUpdates = {
        contact_number: company.contactNumber,
        updated_at: new Date().toISOString()
      };
      if (finalData.id_image_url) profileUpdates.id_image_url = finalData.id_image_url;
      if (finalData.selfie_image_url) profileUpdates.selfie_image_url = finalData.selfie_image_url;

      console.log("[CompanyProfile] profiles update payload:", profileUpdates);
      const { error: profError } = await supabase
        .from("profiles")
        .update(profileUpdates)
        .eq("id", userId);

      if (profError) {
        console.error("[CompanyProfile] profiles update error:", {
          message: profError.message,
          code: profError.code,
          details: profError.details,
          hint: profError.hint,
          status: profError.status
        });
        throw profError;
      }

      setMessage({
        text: "Profile saved successfully. Your verification documents have been submitted for review.",
        type: "success"
      });
      setIsEditing(false);
      
      // Clear file inputs
      setUploadFiles({
        id_image: null, selfie_image: null, business_permit: null, sec_registration: null, company_logo: null, cover_photo: null
      });
      
      loadCompanyProfile();
    } catch (error) {
      console.error("[CompanyProfile] Save Technical Error:", error);
      setMessage({
        text: "Unable to save profile. Please try again.",
        type: "error"
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleViewDocument(filePathOrUrl) {
    if (!filePathOrUrl) {
      setMessage({ text: "No document file uploaded yet.", type: "error" });
      return;
    }
    try {
      const { getPrivateDocumentSignedUrl } = await import("../../services/api");
      const { url, error } = await getPrivateDocumentSignedUrl(filePathOrUrl);
      if (error || !url) {
        console.error("[CompanyProfile] Document signed URL error:", error);
        setMessage({ text: "Unable to load verification document. Access denied or link expired.", type: "error" });
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error("[CompanyProfile] Document viewing exception:", err);
      setMessage({ text: "Unable to open document. Please try again.", type: "error" });
    }
  }

  if (loading) {
    return <DashboardLayout role="employer" title="Company"><p>Loading profile...</p></DashboardLayout>;
  }

  const hasCompanyInfo = company.companyName || company.industry || company.location;

  return (
    <DashboardLayout
      role="employer"
      title="Company Profile"
      subtitle="Manage your identity verification and company branding."
    >
      <section className="dashboard-panel">
        <div className="panel-header company-panel-header">
          <div className="panel-header-content">
            <h2>{activeTab === 'details' ? "Company Information" : "Verification & Branding"}</h2>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              className={`panel-action ${activeTab === 'details' ? 'primary' : 'secondary'}`} 
              onClick={() => setActiveTab('details')}
              style={{ background: activeTab === 'details' ? '#58158f' : '#e2e8f0', color: activeTab === 'details' ? '#fff' : '#333' }}
            >
              Details
            </button>
            <button 
              className={`panel-action ${activeTab === 'verification' ? 'primary' : 'secondary'}`} 
              onClick={() => setActiveTab('verification')}
              style={{ background: activeTab === 'verification' ? '#58158f' : '#e2e8f0', color: activeTab === 'verification' ? '#fff' : '#333' }}
            >
              Verification
            </button>
            {!isEditing && hasCompanyInfo && (
              <button type="button" className="panel-action" onClick={() => setIsEditing(true)}>
                Edit Profile
              </button>
            )}
          </div>
        </div>

        {message.text && (
          <div className={`profile-message ${message.type === 'error' ? 'error-message' : 'success-message'}`} style={{ color: message.type === 'error' ? 'red' : 'green', padding: '10px', marginBottom: '15px', background: message.type === 'error' ? '#fee2e2' : '#dcfce7', borderRadius: '6px' }}>
            {message.text}
          </div>
        )}

        <form className="profile-form" onSubmit={handleSubmit}>
          {activeTab === 'details' ? (
            <>
              {/* Personal profile picture */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '16px 0 24px', borderBottom: '2px solid #f3f0fe', marginBottom: '20px' }}>
                <ProfilePictureUploader
                  currentUrl={profilePhotoUrl}
                  name={company.companyName || (getCurrentUser()?.full_name || "")}
                  userId={userId}
                  role="employer"
                  onPhotoChange={handlePhotoChange}
                  size={80}
                  disabled={saving}
                />
                <div>
                  <p style={{ margin: '0 0 4px', fontWeight: 700, color: '#1e1b4b', fontSize: '15px' }}>Your Profile Photo</p>
                  <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>This is your personal photo, separate from your company logo.</p>
                </div>
              </div>
              <div className="profile-form-grid">
                <label><span>Company Name *</span>
                  <input type="text" name="companyName" value={company.companyName} onChange={handleChange} disabled={!isEditing} />
                </label>
                <label><span>Industry *</span>
                  <input type="text" name="industry" value={company.industry} onChange={handleChange} disabled={!isEditing} />
                </label>
                <label><span>Company Size</span>
                  <input type="text" name="companySize" placeholder="e.g. 50-200" value={company.companySize} onChange={handleChange} disabled={!isEditing} />
                </label>
                <label><span>Company Location *</span>
                  <input type="text" name="location" value={company.location} onChange={handleChange} disabled={!isEditing} />
                </label>
                <label><span>Website</span>
                  <input type="text" name="website" value={company.website} onChange={handleChange} disabled={!isEditing} />
                </label>
                <label><span>Contact Email</span>
                  <input type="email" name="contactEmail" value={company.contactEmail} onChange={handleChange} disabled={!isEditing} />
                </label>
                <label><span>Contact Number</span>
                  <input type="text" name="contactNumber" value={company.contactNumber} onChange={handleChange} disabled={!isEditing} />
                </label>
              </div>
              <label style={{ marginTop: '15px' }}><span>About the Company</span>
                <textarea className="dashboard-textarea" name="about" value={company.about} onChange={handleChange} disabled={!isEditing} rows={4} />
              </label>
            </>
          ) : (
            <div className="verification-tab">
              <div style={{ padding: '16px', background: company.verification_status === 'Verified' || company.verification_status === 'Approved' ? '#dcfce7' : '#fef9c3', borderRadius: '8px', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, color: company.verification_status === 'Verified' || company.verification_status === 'Approved' ? '#166534' : '#854d0e' }}>
                  Verification Status: {company.verification_status}
                </h3>
                <p style={{ fontSize: '13px', margin: '4px 0 0 0', color: '#475569' }}>
                  {company.verification_status === 'Verified' || company.verification_status === 'Approved' ? 'Your identity and business are verified. You can post jobs.' : 'Please upload your ID and business permits to get verified.'}
                </p>
              </div>

              <div className="profile-form-grid">
                <label><span>Government ID (PDF/Image)</span>
                  <input type="file" name="id_image" accept="image/*,.pdf" onChange={handleFileChange} disabled={!isEditing} />
                  {company.id_image_url && (
                    <button type="button" onClick={() => handleViewDocument(company.id_image_url)} style={{ background: "none", border: "none", color: "#58158f", fontSize: "12px", textDecoration: "underline", cursor: "pointer", textAlign: "left", padding: 0 }}>
                      🔒 View Uploaded ID (Secure Signed Link)
                    </button>
                  )}
                </label>
                <label><span>Selfie with ID</span>
                  <input type="file" name="selfie_image" accept="image/*" onChange={handleFileChange} disabled={!isEditing} />
                  {company.selfie_image_url && (
                    <button type="button" onClick={() => handleViewDocument(company.selfie_image_url)} style={{ background: "none", border: "none", color: "#58158f", fontSize: "12px", textDecoration: "underline", cursor: "pointer", textAlign: "left", padding: 0 }}>
                      🔒 View Uploaded Selfie (Secure Signed Link)
                    </button>
                  )}
                </label>
                <label><span>Business Permit</span>
                  <input type="file" name="business_permit" accept="image/*,.pdf" onChange={handleFileChange} disabled={!isEditing} />
                  {company.business_permit_url && (
                    <button type="button" onClick={() => handleViewDocument(company.business_permit_url)} style={{ background: "none", border: "none", color: "#58158f", fontSize: "12px", textDecoration: "underline", cursor: "pointer", textAlign: "left", padding: 0 }}>
                      🔒 View Business Permit (Secure Signed Link)
                    </button>
                  )}
                </label>
                <label><span>SEC Registration</span>
                  <input type="file" name="sec_registration" accept="image/*,.pdf" onChange={handleFileChange} disabled={!isEditing} />
                  {company.sec_registration_url && (
                    <button type="button" onClick={() => handleViewDocument(company.sec_registration_url)} style={{ background: "none", border: "none", color: "#58158f", fontSize: "12px", textDecoration: "underline", cursor: "pointer", textAlign: "left", padding: 0 }}>
                      🔒 View SEC Registration (Secure Signed Link)
                    </button>
                  )}
                </label>
                <label><span>Company Logo</span>
                  <input type="file" name="company_logo" accept="image/*" onChange={handleFileChange} disabled={!isEditing} />
                  {company.company_logo_url && <a href={company.company_logo_url} target="_blank" rel="noreferrer" style={{ fontSize: '12px' }}>View Logo</a>}
                </label>
              </div>
            </div>
          )}

          {isEditing && (
            <div className="profile-actions" style={{ marginTop: '20px' }}>
              <button type="submit" className="profile-save-btn" disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </button>
              <button type="button" className="profile-cancel-btn" onClick={() => { setIsEditing(false); loadCompanyProfile(); }}>
                Cancel
              </button>
            </div>
          )}
        </form>
      </section>
    </DashboardLayout>
  );
}