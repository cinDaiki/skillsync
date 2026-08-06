import { supabase } from './supabase'
import { getCurrentUser as getStoredUser } from './localStorageService'
import {
  isDevMode,
  devSignIn,
  devSignUp,
  devSignOut,
  devGetCurrentUser,
} from './devMode'

// ─── Sign Up ──────────────────────────────────────────────────────────────────

export const signUp = async (email, password, fullName, role) => {
  // DEV MODE: register locally, never contact Supabase Auth
  if (isDevMode()) {
    return devSignUp(email, password, fullName, role)
  }

  // PRODUCTION: original Supabase implementation
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, role }
    }
  })
  return { data, error }
}

// ─── Sign In ──────────────────────────────────────────────────────────────────

export const signIn = async (email, password) => {
  // DEV MODE: validate against local accounts, never contact Supabase Auth
  if (isDevMode()) {
    return devSignIn(email, password)
  }

  // PRODUCTION: original Supabase implementation
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })
  return { data, error }
}

// ─── Sign Out ─────────────────────────────────────────────────────────────────

// Sign Out — always clear local session even if Supabase is slow
export const signOut = async () => {
  const storedUser = getStoredUser()

  localStorage.removeItem("skillsync_user")
  localStorage.removeItem("skillsync_candidate_profile")
  if (storedUser?.id) {
    localStorage.removeItem(`skillsync_candidate_profile_${storedUser.id}`)
  }

  document.body.style.overflow = ""

  // DEV MODE: skip Supabase call entirely
  if (isDevMode()) {
    return devSignOut()
  }

  // PRODUCTION: original Supabase implementation
  try {
    await Promise.race([
      supabase.auth.signOut(),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ])
  } catch {
    // Local session already cleared
  }

  return { error: null }
}

// ─── Get Current User ─────────────────────────────────────────────────────────

export const getCurrentUser = async () => {
  // DEV MODE: read from localStorage instead of hitting Supabase
  if (isDevMode()) {
    return devGetCurrentUser()
  }

  // PRODUCTION: original Supabase implementation
  const { data: { user } } = await supabase.auth.getUser()
  return user
}