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

/**
 * Helper to extract certificate storage path from full URL, signed URL, or relative path
 */
export function extractCertificateStoragePath(filePathOrUrl) {
  if (!filePathOrUrl || typeof filePathOrUrl !== 'string') return null;

  const markers = [
    '/storage/v1/object/public/certificates/',
    '/storage/v1/object/sign/certificates/',
    '/storage/v1/object/authenticated/certificates/',
    '/storage/v1/object/certificates/'
  ];

  for (const marker of markers) {
    const idx = filePathOrUrl.indexOf(marker);
    if (idx !== -1) {
      return decodeURIComponent(filePathOrUrl.slice(idx + marker.length).split('?')[0]);
    }
  }

  const fallback = filePathOrUrl.indexOf('/certificates/');
  if (fallback !== -1) {
    return decodeURIComponent(filePathOrUrl.slice(fallback + '/certificates/'.length).split('?')[0]);
  }

  return filePathOrUrl.split('?')[0];
}

/**
 * Generates a fresh authorized signed URL for viewing private certificate files
 */
export async function getCertificateSignedUrl(filePathOrUrl, expiresSec = 86400) {
  if (!filePathOrUrl) return { url: null, error: new Error('No certificate path specified') };

  const storagePath = extractCertificateStoragePath(filePathOrUrl);
  if (!storagePath) return { url: null, error: new Error('Invalid certificate path') };

  const { data, error } = await supabase.storage
    .from('certificates')
    .createSignedUrl(storagePath, expiresSec);

  if (error || !data?.signedUrl) {
    console.warn('[Certificates] Failed to generate signed URL for:', storagePath, error?.message);
    return { url: null, error };
  }

  return { url: data.signedUrl, error: null };
}

// Upload Certificate File to Supabase Storage
export const uploadCertificateFile = async (file, userId) => {
  const fileExt = file.name.split('.').pop();
  const fileName = `${userId}/cert_${Date.now()}.${fileExt}`;
  
  const { data, error } = await supabase.storage
    .from('certificates')
    .upload(fileName, file, { upsert: true });
  
  if (error) return { data: null, error };
  
  // Storage bucket 'certificates' is private (public: false).
  // Generate initial signed URL while also storing the relative object path
  const { data: signedData, error: signedErr } = await supabase.storage
    .from('certificates')
    .createSignedUrl(fileName, 60 * 60 * 24);
  
  if (signedData?.signedUrl) {
    return { data: signedData.signedUrl, storagePath: fileName, error: null };
  }

  return { data: fileName, storagePath: fileName, error: signedErr };
}

/**
 * Helper to extract bucket and object storage path from full URL, signed URL, or relative path
 */
export function extractVerificationStorageInfo(filePathOrUrl) {
  if (!filePathOrUrl || typeof filePathOrUrl !== 'string') {
    return { bucket: 'resumes', path: null };
  }

  const cleanUrl = filePathOrUrl.split('?')[0];

  // 1. Employer verification bucket
  const empMarkers = [
    '/storage/v1/object/public/employer_verification/',
    '/storage/v1/object/sign/employer_verification/',
    '/storage/v1/object/authenticated/employer_verification/',
    '/employer_verification/'
  ];
  for (const marker of empMarkers) {
    const idx = cleanUrl.indexOf(marker);
    if (idx !== -1) {
      return {
        bucket: 'employer_verification',
        path: decodeURIComponent(cleanUrl.slice(idx + marker.length))
      };
    }
  }

  // 2. Resumes bucket (includes candidate ID/selfie under verifications/ subfolder)
  const resumeMarkers = [
    '/storage/v1/object/public/resumes/',
    '/storage/v1/object/sign/resumes/',
    '/storage/v1/object/authenticated/resumes/',
    '/resumes/'
  ];
  for (const marker of resumeMarkers) {
    const idx = cleanUrl.indexOf(marker);
    if (idx !== -1) {
      return {
        bucket: 'resumes',
        path: decodeURIComponent(cleanUrl.slice(idx + marker.length))
      };
    }
  }

  // 3. Verifications subfolder marker
  const verifIdx = cleanUrl.indexOf('/verifications/');
  if (verifIdx !== -1) {
    return {
      bucket: 'resumes',
      path: decodeURIComponent(cleanUrl.slice(verifIdx + 1))
    };
  }

  // 4. Relative paths
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    if (cleanUrl.startsWith('verifications/')) {
      return { bucket: 'resumes', path: cleanUrl };
    }
    return { bucket: 'employer_verification', path: cleanUrl };
  }

  // Fallback for unrecognized URLs
  return { bucket: 'resumes', path: cleanUrl };
}

export function extractVerificationStoragePath(filePathOrUrl) {
  const { path } = extractVerificationStorageInfo(filePathOrUrl);
  return path || filePathOrUrl;
}

/**
 * Generates a short-lived authorized signed URL for viewing private verification documents
 */
export async function getPrivateDocumentSignedUrl(filePathOrUrl, expiresSec = 3600) {
  if (!filePathOrUrl) return { url: null, error: new Error('No document path specified') };

  const { bucket, path } = extractVerificationStorageInfo(filePathOrUrl);
  if (!path || path.startsWith('http://') || path.startsWith('https://')) {
    // Could not parse clean storage path, return original URL safely
    return { url: filePathOrUrl, error: null };
  }

  // 1. Attempt primary resolved bucket
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresSec);

  if (data?.signedUrl && !error) {
    return { url: data.signedUrl, error: null };
  }

  // 2. Fallback bucket attempt if primary fails
  const fallbackBucket = bucket === 'resumes' ? 'employer_verification' : 'resumes';
  const { data: fallbackData } = await supabase.storage
    .from(fallbackBucket)
    .createSignedUrl(path, expiresSec);

  if (fallbackData?.signedUrl) {
    return { url: fallbackData.signedUrl, error: null };
  }

  // Return original URL if signed URL attempts fail
  return { url: filePathOrUrl, error };
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