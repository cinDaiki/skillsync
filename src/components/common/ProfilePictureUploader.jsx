/**
 * ProfilePictureUploader — Reusable Enterprise Profile Picture Component
 *
 * Features:
 *  • Circular avatar preview (real photo or letter-initial fallback)
 *  • Click-to-upload with camera icon overlay
 *  • Replace / remove photo
 *  • File validation: images only, max 5 MB
 *  • Loading spinner during upload
 *  • Calls `onPhotoChange(newUrl)` after successful upload/removal
 *
 * Props:
 *  currentUrl   {string}   — current photo URL (empty string / null = show initials)
 *  name         {string}   — display name (used for initial fallback)
 *  userId       {string}   — Supabase user ID
 *  role         {string}   — "candidate" | "employer" | "admin"
 *  onPhotoChange {fn}      — callback(newUrl: string)
 *  size         {number}   — avatar diameter in px (default: 96)
 *  disabled     {boolean}  — disables upload (e.g. when parent form is saving)
 */

import { useRef, useState } from 'react'
import {
  uploadAvatar,
  deleteOldAvatar,
  persistAvatarUrl,
  removeAvatar,
  syncAvatarToLocalStorage,
} from '../../services/avatarService'
import './ProfilePictureUploader.css'

export default function ProfilePictureUploader({
  currentUrl = '',
  name = '',
  userId,
  role = 'candidate',
  onPhotoChange,
  size = 96,
  disabled = false,
}) {
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const initial = name ? name.charAt(0).toUpperCase() : '?'
  const hasPhoto = Boolean(currentUrl)

  // Unique ID per instance so multiple uploaders on one page don't clash
  const inputId = `ppu-input-${userId || 'local'}-${role}`

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setError('')
    setUploading(true)

    try {
      // 1. Upload new photo to storage
      const { url, error: uploadError } = await uploadAvatar(file, userId)
      if (uploadError) throw uploadError

      // 2. Delete old photo from storage (best-effort)
      if (currentUrl) await deleteOldAvatar(currentUrl)

      // 3. Persist URL to DB
      const { error: dbError } = await persistAvatarUrl(userId, role, url)
      if (dbError) throw dbError

      // 4. Sync to localStorage so topbar updates immediately
      syncAvatarToLocalStorage(url)

      // 5. Notify parent
      onPhotoChange?.(url)
    } catch (err) {
      setError(err.message || 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
      // Reset input so the same file can be re-selected
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleRemove() {
    if (!currentUrl || !userId) return
    setError('')
    setUploading(true)

    try {
      const { error: removeError } = await removeAvatar(userId, role, currentUrl)
      if (removeError) throw removeError

      syncAvatarToLocalStorage('')
      onPhotoChange?.('')
    } catch (err) {
      setError(err.message || 'Could not remove photo.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="ppu-wrapper" style={{ '--ppu-size': `${size}px` }}>
      {/* Hidden file input */}
      <input
        id={inputId}
        ref={inputRef}
        className="ppu-input"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleFileChange}
        disabled={disabled || uploading}
      />

      {/* Clickable avatar circle */}
      <label
        htmlFor={inputId}
        className="ppu-avatar-ring"
        role="button"
        tabIndex={disabled || uploading ? -1 : 0}
        aria-label="Upload profile picture"
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      >
        {hasPhoto ? (
          <div className="ppu-avatar-img">
            <img
              src={currentUrl}
              alt={name || 'Profile picture'}
              draggable={false}
            />
          </div>
        ) : (
          <div className="ppu-avatar-initials">{initial}</div>
        )}

        {/* Hover overlay */}
        {!uploading && !disabled && (
          <div className="ppu-overlay" aria-hidden="true">
            <span className="ppu-overlay-icon">📷</span>
            <span className="ppu-overlay-text">{hasPhoto ? 'Change' : 'Upload'}</span>
          </div>
        )}

        {/* Upload spinner */}
        {uploading && (
          <div className="ppu-spinner-ring">
            <div className="ppu-spinner" />
          </div>
        )}
      </label>

      {/* Action buttons */}
      <div className="ppu-actions">
        <label
          htmlFor={inputId}
          className={`ppu-upload-label${disabled || uploading ? ' disabled' : ''}`}
        >
          📷 {hasPhoto ? 'Replace Photo' : 'Upload Photo'}
        </label>

        {hasPhoto && (
          <button
            type="button"
            className="ppu-remove-btn"
            onClick={handleRemove}
            disabled={disabled || uploading}
          >
            ✕ Remove photo
          </button>
        )}
      </div>

      {/* Validation / upload error */}
      {error && <p className="ppu-error">{error}</p>}
    </div>
  )
}
