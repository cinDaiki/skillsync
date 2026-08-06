/**
 * avatarService.js — Profile Picture Management
 * Shared service for all user roles: candidate, employer, admin
 *
 * Storage: reuses the existing 'resumes' bucket under the 'avatars/' subfolder
 * Pattern: avatars/{userId}/avatar_{timestamp}.{ext}
 */

import { supabase } from './supabase'
import { isDevMode } from './devMode'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract the storage path from a public avatar URL so we can delete it.
 */
function extractAvatarStoragePath(url) {
  if (!url) return null
  const marker = '/storage/v1/object/public/resumes/'
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  return decodeURIComponent(url.slice(idx + marker.length).split('?')[0])
}

// ─── Upload ───────────────────────────────────────────────────────────────────

/**
 * Upload a new avatar to Supabase Storage.
 * Returns { url: string|null, error: Error|null }
 */
export async function uploadAvatar(file, userId) {
  if (!file || !userId) {
    return { url: null, error: new Error('File and User ID are required.') }
  }

  // Validate file type
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  if (!allowed.includes(file.type)) {
    return { url: null, error: new Error('Only JPG, PNG, WebP, or GIF images are allowed.') }
  }

  // Validate file size (max 5 MB)
  if (file.size > 5 * 1024 * 1024) {
    return { url: null, error: new Error('Image must be smaller than 5 MB.') }
  }

  // DEV MODE: no real Supabase storage — use a local object URL so the
  // preview works instantly without any network call or RLS check.
  if (isDevMode()) {
    const objectUrl = URL.createObjectURL(file)
    return { url: objectUrl, error: null }
  }

  const ext = file.name.split('.').pop() || 'jpg'
  const path = `avatars/${userId}/avatar_${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('resumes')
    .upload(path, file, { upsert: true, contentType: file.type })

  if (uploadError) {
    return { url: null, error: uploadError }
  }

  const { data: urlData } = supabase.storage.from('resumes').getPublicUrl(path)
  const url = urlData?.publicUrl
    ? `${urlData.publicUrl}?t=${Date.now()}`
    : null

  return { url, error: null }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Delete the old avatar from storage (best-effort, never throws).
 */
export async function deleteOldAvatar(oldUrl) {
  if (!oldUrl) return
  const path = extractAvatarStoragePath(oldUrl)
  if (!path || !path.startsWith('avatars/')) return
  try {
    await supabase.storage.from('resumes').remove([path])
  } catch {
    // Non-fatal — stale files are acceptable
  }
}

// ─── DB Update ────────────────────────────────────────────────────────────────

/**
 * Persist the new avatar URL to the correct database table.
 * - candidate / admin → `profiles` table
 * - employer          → `profiles` table (personal photo)
 */
export async function persistAvatarUrl(userId, role, url) {
  if (!userId) return { error: new Error('No user ID') }

  // DEV MODE: no Supabase auth session — skip DB write to avoid RLS error.
  // The URL is already stored in localStorage via syncAvatarToLocalStorage.
  if (isDevMode()) return { error: null }

  // All roles write to `profiles` for their personal photo
  const { error } = await supabase
    .from('profiles')
    .update({ profile_picture_url: url || '' })
    .eq('id', userId)

  return { error }
}

// ─── Remove ───────────────────────────────────────────────────────────────────

/**
 * Remove profile picture: delete from storage + clear DB field.
 */
export async function removeAvatar(userId, role, currentUrl) {
  await deleteOldAvatar(currentUrl)
  return persistAvatarUrl(userId, role, '')
}

// ─── localStorage sync ────────────────────────────────────────────────────────

/**
 * Sync the new avatar URL into localStorage skillsync_user so the topbar
 * updates immediately without a page refresh.
 */
export function syncAvatarToLocalStorage(url) {
  try {
    const raw = localStorage.getItem('skillsync_user')
    if (!raw) return
    const user = JSON.parse(raw)
    user.profile_picture_url = url || ''
    localStorage.setItem('skillsync_user', JSON.stringify(user))
  } catch {
    // Non-fatal
  }
}
