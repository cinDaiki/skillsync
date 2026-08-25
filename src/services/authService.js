import { supabase } from './supabase'
import { getCurrentUser as getStoredUser } from './localStorageService'
import {
  isDevMode,
  devSignIn,
  devSignUp,
  devSignOut,
  devGetCurrentUser,
  devGetLoginGateStatus,
  devCheckSessionTrust,
  devRequestLoginVerification,
  devVerifyLoginVerification,
  devRequestRegistrationVerification,
  devVerifyRegistrationVerification,
  devCompleteRegistration,
} from './devMode'

// ─── Device Token Handling ───────────────────────────────────────────────────

const DEVICE_TOKEN_KEY = "skillsync_device_token";

/**
 * getOrCreateDeviceToken
 * Generates and persists a 256-bit high-entropy random hex token.
 * Kept exclusively in localStorage and sent only to server-side hashing endpoints.
 */
export const getOrCreateDeviceToken = () => {
  try {
    let token = localStorage.getItem(DEVICE_TOKEN_KEY);
    if (!token || typeof token !== "string" || token.length < 64) {
      const bytes = new Uint8Array(32);
      if (typeof window !== "undefined" && window.crypto && window.crypto.getRandomValues) {
        window.crypto.getRandomValues(bytes);
      } else {
        // Fallback for non-browser runtime
        for (let i = 0; i < 32; i++) {
          bytes[i] = Math.floor(Math.random() * 256);
        }
      }
      token = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      localStorage.setItem(DEVICE_TOKEN_KEY, token);
    }
    return token;
  } catch {
    return null;
  }
};

// ─── Registration Email Verification Flow ─────────────────────────────────────

/**
 * requestRegistrationVerification
 * Requests a 6-digit registration OTP dispatched via Brevo without creating an auth user.
 */
export const requestRegistrationVerification = async (email) => {
  if (isDevMode()) {
    return devRequestRegistrationVerification(email);
  }

  const { data, error } = await supabase.functions.invoke('request-registration-verification', {
    body: { email: email?.toLowerCase()?.trim() },
    method: 'POST',
  });
  return { data, error };
};

/**
 * verifyRegistrationVerification
 * Verifies the 6-digit registration OTP and returns a single-use 256-bit completion token.
 */
export const verifyRegistrationVerification = async ({ challengeId, email, otp }) => {
  if (isDevMode()) {
    return devVerifyRegistrationVerification(challengeId, email, otp);
  }

  const { data, error } = await supabase.functions.invoke('verify-registration-verification', {
    body: {
      challenge_id: challengeId,
      email: email?.toLowerCase()?.trim(),
      otp: otp?.trim(),
    },
    method: 'POST',
  });
  return { data, error };
};

/**
 * completeRegistration
 * Authoritatively creates the Supabase Auth user and profile using the one-time completion token.
 */
export const completeRegistration = async ({
  challengeId,
  email,
  completionToken,
  password,
  fullName,
  role,
}) => {
  if (isDevMode()) {
    return devCompleteRegistration({ email, password, fullName, role });
  }

  const { data, error } = await supabase.functions.invoke('complete-registration', {
    body: {
      challenge_id: challengeId,
      email: email?.toLowerCase()?.trim(),
      completion_token: completionToken?.trim(),
      password,
      full_name: fullName?.trim(),
      role: role?.toLowerCase()?.trim(),
    },
    method: 'POST',
  });
  return { data, error };
};

// ─── Legacy / Fallback Sign Up ────────────────────────────────────────────────

export const signUp = async (email, password, fullName, role) => {
  if (isDevMode()) {
    return devSignUp(email, password, fullName, role)
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, role }
    }
  })
  return { data, error }
}

// ─── Sign In (Password) ───────────────────────────────────────────────────────

export const signIn = async (email, password) => {
  if (isDevMode()) {
    return devSignIn(email, password)
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })
  return { data, error }
}

// ─── Adaptive Login & Step-Up Security ───────────────────────────────────────

/**
 * getLoginGateStatus
 * Authoritative check for user profile presence, role, and suspension status.
 */
export const getLoginGateStatus = async () => {
  if (isDevMode()) {
    return devGetLoginGateStatus()
  }

  const { data, error } = await supabase.rpc('get_login_gate_status')
  return { data, error }
}

/**
 * checkSessionTrust
 * Checks if the current session or device is already trusted.
 */
export const checkSessionTrust = async (rawDeviceToken) => {
  if (isDevMode()) {
    return devCheckSessionTrust()
  }

  const token = rawDeviceToken || getOrCreateDeviceToken()
  const { data, error } = await supabase.rpc('check_session_trust_status', {
    p_device_token: token,
  })
  return { data, error }
}

/**
 * requestLoginVerification
 * Invokes the Edge Function to create a 10-minute challenge and dispatch OTP via Brevo.
 */
export const requestLoginVerification = async () => {
  if (isDevMode()) {
    return devRequestLoginVerification()
  }

  const { data, error } = await supabase.functions.invoke('request-login-verification', {
    method: 'POST',
  })
  return { data, error }
}

/**
 * verifyLoginVerification
 * Verifies the 6-digit OTP challenge and optionally registers the trusted device.
 */
export const verifyLoginVerification = async ({
  challengeId,
  otp,
  rememberDevice = true,
  deviceToken,
  deviceName,
}) => {
  if (isDevMode()) {
    return devVerifyLoginVerification(challengeId, otp)
  }

  const token = deviceToken || getOrCreateDeviceToken()
  const name =
    deviceName ||
    (typeof navigator !== "undefined"
      ? `${navigator.platform || "Device"} - ${navigator.userAgent.slice(0, 40)}`
      : "Browser Device")

  const { data, error } = await supabase.functions.invoke('verify-login-verification', {
    body: {
      challenge_id: challengeId,
      otp: otp?.trim(),
      remember_device: Boolean(rememberDevice),
      device_token: token,
      device_name: name,
    },
  })
  return { data, error }
}

/**
 * listTrustedDevices
 * Lists all active trusted devices for the authenticated, verified user.
 */
export const listTrustedDevices = async () => {
  const { data, error } = await supabase.rpc('list_trusted_devices')
  return { data, error }
}

/**
 * revokeTrustedDevice
 * Revokes a specific trusted device.
 */
export const revokeTrustedDevice = async (deviceId) => {
  const { data, error } = await supabase.rpc('revoke_trusted_device', {
    p_device_id: deviceId,
  })
  return { data, error }
}

/**
 * revokeAllTrustedDevices
 * Revokes all trusted devices for the user.
 */
export const revokeAllTrustedDevices = async () => {
  const { data, error } = await supabase.rpc('revoke_all_trusted_devices')
  return { data, error }
}

// ─── Sign Out ─────────────────────────────────────────────────────────────────

export const signOut = async () => {
  const storedUser = getStoredUser()

  localStorage.removeItem("skillsync_user")
  localStorage.removeItem("skillsync_candidate_profile")
  if (storedUser?.id) {
    localStorage.removeItem(`skillsync_candidate_profile_${storedUser.id}`)
  }

  document.body.style.overflow = ""

  if (isDevMode()) {
    return devSignOut()
  }

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
  if (isDevMode()) {
    return devGetCurrentUser()
  }

  const { data: { user } } = await supabase.auth.getUser()
  return user
}