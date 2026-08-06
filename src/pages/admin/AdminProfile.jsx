import { useEffect, useState } from 'react'
import DashboardLayout from '../../components/layout/DashboardLayout'
import ProfilePictureUploader from '../../components/common/ProfilePictureUploader'
import { getCurrentUser, setCurrentUser } from '../../services/localStorageService'
import { supabase } from '../../services/supabase'
import { isDevMode } from '../../services/devMode'
import './AdminProfile.css'

export default function AdminProfile() {
  const [adminUser, setAdminUser] = useState(null)
  const [photoUrl, setPhotoUrl] = useState('')
  const [message, setMessage] = useState({ text: '', type: '' })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAdminProfile()
  }, [])

  async function loadAdminProfile() {
    setLoading(true)

    // Read base info from localStorage (always available)
    const stored = getCurrentUser()
    if (stored) {
      setAdminUser(stored)
      setPhotoUrl(stored.profile_picture_url || '')
    }

    // Dev mode: don't query Supabase
    if (isDevMode()) {
      setLoading(false)
      return
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      // Fetch fresh profile_picture_url from DB
      const { data: profile } = await supabase
        .from('profiles')
        .select('profile_picture_url, full_name, email')
        .eq('id', user.id)
        .maybeSingle()

      if (profile?.profile_picture_url) {
        setPhotoUrl(profile.profile_picture_url)
        // Sync to localStorage
        if (stored) {
          setCurrentUser({ ...stored, profile_picture_url: profile.profile_picture_url })
        }
      }
    } catch {
      // Non-fatal
    } finally {
      setLoading(false)
    }
  }

  function handlePhotoChange(newUrl) {
    setPhotoUrl(newUrl)

    // Update local state and localStorage
    const stored = getCurrentUser()
    if (stored) {
      const updated = { ...stored, profile_picture_url: newUrl }
      setCurrentUser(updated)
      setAdminUser(updated)
    }

    setMessage({
      text: newUrl ? 'Profile picture updated successfully!' : 'Profile picture removed.',
      type: 'success',
    })

    // Auto-clear message after 4 seconds
    setTimeout(() => setMessage({ text: '', type: '' }), 4000)
  }

  const displayName = adminUser?.full_name || adminUser?.email || 'Administrator'
  const displayEmail = adminUser?.email || ''
  const userId = adminUser?.id

  return (
    <DashboardLayout
      role="admin"
      title="Admin Profile"
      subtitle="Manage your administrator account and profile picture."
    >
      <div className="admin-profile-shell">

        {/* Status message */}
        {message.text && (
          <div className={`admin-profile-msg ${message.type}`}>
            {message.text}
          </div>
        )}

        {/* Hero card with avatar */}
        <div className="admin-profile-hero">
          <ProfilePictureUploader
            currentUrl={photoUrl}
            name={displayName}
            userId={userId}
            role="admin"
            onPhotoChange={handlePhotoChange}
            size={100}
            disabled={loading}
          />

          <div className="admin-profile-hero-info">
            <h2>{displayName}</h2>
            <p>{displayEmail}</p>
            <div className="admin-profile-badge">🛡 Administrator</div>
          </div>
        </div>

        {/* Account info card */}
        <div className="admin-profile-card">
          <h3>Account Information</h3>
          <div className="admin-profile-grid">
            <div className="admin-profile-field">
              <label>Full Name</label>
              <span>{displayName}</span>
            </div>
            <div className="admin-profile-field">
              <label>Email Address</label>
              <span>{displayEmail || '—'}</span>
            </div>
            <div className="admin-profile-field">
              <label>Role</label>
              <span>Administrator</span>
            </div>
            <div className="admin-profile-field">
              <label>Photo Status</label>
              <span>{photoUrl ? '✅ Uploaded' : '⬜ No photo yet'}</span>
            </div>
          </div>
        </div>

        {/* Instructions card */}
        <div className="admin-profile-card">
          <h3>📷 How to Update Your Photo</h3>
          <p style={{ color: '#6b7280', fontSize: '14px', lineHeight: '1.6', margin: 0 }}>
            Click the avatar circle or the <strong>Upload Photo</strong> button above to select a
            new profile picture. Accepted formats: <strong>JPG, PNG, WebP, GIF</strong> — max{' '}
            <strong>5 MB</strong>. Your photo will appear in the sidebar and top bar immediately
            after upload. Use <strong>Replace Photo</strong> to swap to a different image, or{' '}
            <strong>Remove photo</strong> to revert to the letter initial.
          </p>
        </div>

      </div>
    </DashboardLayout>
  )
}
