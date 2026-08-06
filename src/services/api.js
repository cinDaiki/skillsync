import { supabase } from './supabase'

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
 * Upload an employer identity verification document (ID or Selfie)
 */
export async function uploadEmployerVerification(file, userId) {
  if (!file || !userId) return { data: null, error: new Error('File and User ID required') };

  const fileExt = file.name.split('.').pop();
  const fileName = `${userId}-${Math.random().toString(36).substring(7)}.${fileExt}`;
  
  const { error: uploadError } = await supabase.storage
    .from('employer_verification')
    .upload(fileName, file);
    
  if (uploadError) return { data: null, error: uploadError };

  const { data: urlData } = supabase.storage
    .from('employer_verification')
    .getPublicUrl(fileName);
  
  return { data: urlData.publicUrl, error: null };
}

/**
 * Upload company branding or permit documents
 */
export async function uploadCompanyBranding(file, userId) {
  if (!file || !userId) return { data: null, error: new Error('File and User ID required') };

  const fileExt = file.name.split('.').pop();
  const fileName = `${userId}-${Math.random().toString(36).substring(7)}.${fileExt}`;
  
  const { error: uploadError } = await supabase.storage
    .from('company_branding')
    .upload(fileName, file);
    
  if (uploadError) return { data: null, error: uploadError };

  const { data: urlData } = supabase.storage
    .from('company_branding')
    .getPublicUrl(fileName);
  
  return { data: urlData.publicUrl, error: null };
}