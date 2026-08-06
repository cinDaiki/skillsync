/**
 * devMode.js — SkillSync Offline Development/Test Mode
 *
 * When VITE_DEV_MODE=true in .env:
 *   - All authentication is handled locally (no Supabase Auth calls)
 *   - Pre-defined test accounts are available
 *   - Newly registered accounts are stored in localStorage
 *   - RoleRoute reads from localStorage instead of Supabase session
 *
 * When VITE_DEV_MODE=false (default / production):
 *   - This file is imported but none of its auth functions are called
 *   - All Supabase code runs exactly as before
 */

// ─── Toggle check ─────────────────────────────────────────────────────────────

export function isDevMode() {
  if (import.meta.env.PROD) {
    return false
  }
  return import.meta.env.VITE_DEV_MODE === "true";
}

// ─── Storage keys ─────────────────────────────────────────────────────────────

const SESSION_KEY   = "skillsync_user";          // existing key — used by RoleRoute & dashboards
const DEV_USERS_KEY = "skillsync_dev_users";     // extra registered dev accounts

// ─── Pre-defined test accounts ────────────────────────────────────────────────

export const DEV_ACCOUNTS = [
  {
    id:        "dev-admin-0001",
    email:     "admin@test.com",
    password:  "SkillSync#Admin1",
    role:      "admin",
    full_name: "Dev Admin",
  },
  {
    id:        "dev-employer-0001",
    email:     "employer@test.com",
    password:  "SkillSync#Employer1",
    role:      "employer",
    full_name: "Dev Employer",
  },
  {
    id:        "dev-jobseeker-0001",
    email:     "jobseeker@test.com",
    password:  "SkillSync#Seeker1",
    role:      "candidate",
    full_name: "Dev Job Seeker",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Read all dynamically registered dev users from localStorage */
function getDevUsers() {
  try {
    const raw = localStorage.getItem(DEV_USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Persist a newly registered dev user */
function saveDevUser(user) {
  const users = getDevUsers();
  // Prevent duplicate emails
  const filtered = users.filter((u) => u.email !== user.email);
  filtered.push(user);
  localStorage.setItem(DEV_USERS_KEY, JSON.stringify(filtered));
}

/** Find a user by email across built-in + registered accounts */
function findDevAccount(email) {
  const allAccounts = [...DEV_ACCOUNTS, ...getDevUsers()];
  return allAccounts.find(
    (u) => u.email.toLowerCase() === email.toLowerCase()
  ) || null;
}

/** Write the session to localStorage (same key RoleRoute already reads) */
function persistSession(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    id:             user.id,
    email:          user.email,
    role:           user.role,
    full_name:      user.full_name || "",
    is_dev_session: true,
  }));
}

// ─── Dev Auth API ─────────────────────────────────────────────────────────────

/**
 * devSignIn — validates credentials locally, sets session in localStorage.
 * Returns the same shape as supabase.auth.signInWithPassword()
 */
export async function devSignIn(email, password) {
  const account = findDevAccount(email);

  if (!account || account.password !== password) {
    return {
      data:  { user: null, session: null },
      error: { message: "Invalid email or password." },
    };
  }

  persistSession(account);

  // Return a user object that mirrors the Supabase user shape
  const user = {
    id:            account.id,
    email:         account.email,
    role:          account.role,
    full_name:     account.full_name,
    user_metadata: { role: account.role, full_name: account.full_name },
  };

  return {
    data:  { user, session: { user } },
    error: null,
  };
}

/**
 * devSignUp — validates fields, stores user in localStorage, returns success.
 * Returns the same shape as supabase.auth.signUp()
 */
export async function devSignUp(email, password, fullName, role) {
  // Check if email already taken
  if (findDevAccount(email)) {
    return {
      data:  { user: null, session: null },
      error: { message: "An account with this email already exists." },
    };
  }

  const newUser = {
    id:        `dev-${role}-${Date.now()}`,
    email:     email.toLowerCase().trim(),
    password,                               // stored only in localStorage dev store
    role:      role || "candidate",
    full_name: fullName || "",
  };

  saveDevUser(newUser);
  // Do NOT auto-login — mimic production flow (sign in separately)

  const user = {
    id:            newUser.id,
    email:         newUser.email,
    user_metadata: { role: newUser.role, full_name: newUser.full_name },
  };

  return {
    data:  { user, session: null },
    error: null,
  };
}

/**
 * devSignOut — clears the dev session from localStorage.
 * Returns the same shape as supabase.auth.signOut()
 */
export async function devSignOut() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem("skillsync_candidate_profile");
  return { error: null };
}

/**
 * devGetCurrentUser — reads the persisted dev session.
 * Returns the same shape as supabase.auth.getUser()
 */
export function devGetCurrentUser() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw);
    // In dev mode, trust any user that has id and role in localStorage
    if (!user?.id || !user?.role) return null;
    return user;
  } catch {
    return null;
  }
}

/**
 * devGetSession — returns a fake session object for RoleRoute.
 * Mirrors the shape of supabase.auth.getSession()
 */
export function devGetSession() {
  const user = devGetCurrentUser();
  if (!user) return { data: { session: null } };

  // Build a fake profile that mirrors Supabase profile shape
  const fakeProfile = {
    role:      user.role,
    full_name: user.full_name,
    email:     user.email,
  };

  return {
    data: {
      session: {
        user: {
          id:            user.id,
          email:         user.email,
          user_metadata: { role: user.role, full_name: user.full_name },
        },
      },
    },
    fakeProfile, // bonus: RoleRoute can skip the profile DB query
  };
}
