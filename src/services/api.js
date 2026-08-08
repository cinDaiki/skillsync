import { supabase } from './supabase.js'

function extractResumeStoragePath(fileUrl) {
  if (!fileUrl) return null

  const markers = [
    '/storage/v1/object/public/resumes/',
    '/storage/v1/object/sign/resumes/',
    '/storage/v1/object/authenticated/resumes/',
  ]

  for (const marker of markers) {
    const index = fileUrl.indexOf(marker)
    if (index !== -1) {
      return decodeURIComponent(fileUrl.slice(index + marker.length).split('?')[0])
    }
  }

  const fallback = fileUrl.indexOf('/resumes/')
  if (fallback !== -1) {
    return decodeURIComponent(fileUrl.slice(fallback + '/resumes/'.length).split('?')[0])
  }

  return null
}

export async function getResumeViewUrl(fileUrl) {
  if (!fileUrl) return { url: null, error: new Error('No resume URL') }

  const storagePath = extractResumeStoragePath(fileUrl)
  if (!storagePath) {
    return { url: fileUrl, error: null }
  }

  const { data, error } = await supabase.storage
    .from('resumes')
    .createSignedUrl(storagePath, 60 * 60)

  if (error || !data?.signedUrl) {
    return { url: fileUrl, error }
  }

  return { url: data.signedUrl, error: null }
}

// Upload resume file to Supabase Storage
export const uploadResume = async (file, userId) => {
  const fileName = `${userId}/${Date.now()}_${file.name}`
  
  const { data, error } = await supabase.storage
    .from('resumes')
    .upload(fileName, file)
  
  if (error) return { data: null, error }
  
  const { data: urlData } = supabase.storage
    .from('resumes')
    .getPublicUrl(fileName)
  
  return { data: urlData.publicUrl, error: null }
}

// Save resume record to database
export const saveResumeRecord = async (applicantId, fileUrl, extractedSkills) => {
  const { data, error } = await supabase
    .from('resumes')
    .insert([{
      applicant_id: applicantId,
      file_url: fileUrl,
      extracted_skills: extractedSkills
    }])
  return { data, error }
}

// Get resume by applicant
export const getResume = async (applicantId) => {
  const { data, error } = await supabase
    .from('resumes')
    .select('*')
    .eq('applicant_id', applicantId)
    .maybeSingle()
  return { data, error }
}

// Upload Verification Document to Supabase Storage
// Uses the existing 'resumes' bucket under 'verifications/' subfolder
export const uploadVerificationDocument = async (file, userId, type) => {
  const fileExt = file.name.split('.').pop();
  const fileName = `verifications/${userId}/${type}_${Date.now()}.${fileExt}`;

  // Try 'resumes' bucket first (guaranteed to exist), then fall back to 'verifications'
  let uploadError = null;
  let publicUrl = null;

  // Attempt 1: resumes bucket (safe, always exists)
  const { error: err1 } = await supabase.storage
    .from('resumes')
    .upload(fileName, file, { upsert: true });

  if (!err1) {
    const { data: urlData } = supabase.storage.from('resumes').getPublicUrl(fileName);
    publicUrl = urlData?.publicUrl;
  } else {
    uploadError = err1;
    // Attempt 2: verifications bucket (if it exists)
    const { error: err2 } = await supabase.storage
      .from('verifications')
      .upload(`${userId}/${type}_${Date.now()}.${fileExt}`, file, { upsert: true });

    if (!err2) {
      const { data: urlData2 } = supabase.storage
        .from('verifications')
        .getPublicUrl(`${userId}/${type}_${Date.now()}.${fileExt}`);
      publicUrl = urlData2?.publicUrl;
      uploadError = null;
    }
  }

  if (uploadError || !publicUrl) {
    return { data: null, error: uploadError || new Error('Upload failed: no public URL returned') };
  }

  return { data: publicUrl, error: null };
}

// Upload Certificate File to Supabase Storage
export const uploadCertificateFile = async (file, userId) => {
  const fileExt = file.name.split('.').pop();
  const fileName = `${userId}/cert_${Date.now()}.${fileExt}`;
  
  const { data, error } = await supabase.storage
    .from('certificates')
    .upload(fileName, file);
  
  if (error) return { data: null, error };
  
  const { data: urlData } = supabase.storage
    .from('certificates')
    .getPublicUrl(fileName);
  
  return { data: urlData.publicUrl, error: null };
}

/**
 * Helper to extract object storage path from full URL or return plain relative path
 */
export function extractVerificationStoragePath(filePathOrUrl) {
  if (!filePathOrUrl) return null;
  if (!filePathOrUrl.startsWith("http")) return filePathOrUrl; // Already a relative path

  const markers = [
    '/storage/v1/object/public/employer_verification/',
    '/storage/v1/object/sign/employer_verification/',
    '/storage/v1/object/authenticated/employer_verification/',
    '/storage/v1/object/public/company_branding/',
    '/storage/v1/object/sign/company_branding/'
  ];

  for (const marker of markers) {
    const idx = filePathOrUrl.indexOf(marker);
    if (idx !== -1) {
      return decodeURIComponent(filePathOrUrl.slice(idx + marker.length).split('?')[0]);
    }
  }

  const fallback = filePathOrUrl.indexOf('/employer_verification/');
  if (fallback !== -1) {
    return decodeURIComponent(filePathOrUrl.slice(fallback + '/employer_verification/'.length).split('?')[0]);
  }

  return filePathOrUrl;
}

/**
 * Generates a short-lived authorized signed URL for viewing private verification documents
 */
export async function getPrivateDocumentSignedUrl(filePathOrUrl, expiresSec = 3600) {
  if (!filePathOrUrl) return { url: null, error: new Error('No document path specified') };

  const storagePath = extractVerificationStoragePath(filePathOrUrl);
  if (!storagePath) return { url: filePathOrUrl, error: null };

  // Generate 1-hour authorized signed URL from private employer_verification bucket
  const { data, error } = await supabase.storage
    .from('employer_verification')
    .createSignedUrl(storagePath, expiresSec);

  if (error || !data?.signedUrl) {
    // Attempt fallback from resumes/verifications bucket if legacy
    const { data: resData } = await supabase.storage
      .from('resumes')
      .createSignedUrl(storagePath, expiresSec);
    if (resData?.signedUrl) return { url: resData.signedUrl, error: null };

    return { url: filePathOrUrl, error };
  }

  return { url: data.signedUrl, error: null };
}

/**
 * Upload an employer identity verification document (ID, Selfie, Permit, SEC) to PRIVATE storage
 * Stores storage path, NOT a public URL.
 */
export async function uploadEmployerVerification(file, userId, docType = 'doc') {
  if (!file || !userId) return { data: null, error: new Error('File and User ID required') };

  const fileExt = file.name.split('.').pop();
  const storagePath = `${userId}/${docType}_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

  console.log("[Verification Upload] bucket:", "employer_verification");
  console.log("[Verification Upload] path:", storagePath);
  
  // Upload to private 'employer_verification' bucket
  const { data: uploadResult, error: uploadError } = await supabase.storage
    .from('employer_verification')
    .upload(storagePath, file, { upsert: true });

  if (uploadError) {
    console.error("[Verification Upload] upload error:", uploadError);
    return { data: null, error: uploadError };
  }

  console.log("[Verification Upload] upload result:", uploadResult);

  // Return the relative storage object path for private security
  return { data: storagePath, error: null };
}

/**
 * Upload public company branding (Logo or Cover Photo)
 */
export async function uploadCompanyBranding(file, userId, brandType = 'logo') {
  if (!file || !userId) return { data: null, error: new Error('File and User ID required') };

  const fileExt = file.name.split('.').pop();
  const fileName = `${userId}/${brandType}_${Date.now()}.${fileExt}`;
  
  const { error: uploadError } = await supabase.storage
    .from('company_branding')
    .upload(fileName, file, { upsert: true });
    
  if (uploadError) return { data: null, error: uploadError };

  const { data: urlData } = supabase.storage
    .from('company_branding')
    .getPublicUrl(fileName);
  
  return { data: urlData?.publicUrl || fileName, error: null };
}