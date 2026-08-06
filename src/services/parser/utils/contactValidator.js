/**
 * contactValidator.js
 * Validates extracted contact fields.
 * Rejects placeholders, malformed values, and known-bad patterns.
 */

// ── Known placeholder / test values to reject ──────────────────────────────
const INVALID_EMAILS = new Set([
  'email@example.com', 'user@example.com', 'test@test.com',
  'name@email.com', 'yourname@gmail.com', 'example@example.com',
  'email@domain.com', 'info@example.com',
])

const INVALID_PHONES = new Set([
  '0000000000', '1111111111', '1234567890', '1234567',
  '00000000000', '09000000000',
])

// ── Compiled patterns ─────────────────────────────────────────────────────
const EMAIL_REGEX    = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/
const PHONE_DIGITS   = /\d/g
const LINKEDIN_REGEX = /^(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9\-_%]+\/?$/i
const GITHUB_REGEX   = /^(?:https?:\/\/)?(?:www\.)?github\.com\/[a-zA-Z0-9\-_%]+\/?$/i
const URL_REGEX      = /^https?:\/\/[^\s<>"]{5,}$/i

// ── Validators ────────────────────────────────────────────────────────────

/**
 * Validate an email address.
 * @param {string|null} email
 * @returns {{ valid: boolean, reason: string|null }}
 */
export function validateEmail(email) {
  if (!email) return { valid: false, reason: 'No email provided' }
  const e = email.trim().toLowerCase()
  if (!EMAIL_REGEX.test(e))    return { valid: false, reason: 'Invalid email format' }
  if (INVALID_EMAILS.has(e))   return { valid: false, reason: 'Placeholder email detected' }
  if (e.length > 254)          return { valid: false, reason: 'Email too long' }
  return { valid: true, reason: null }
}

/**
 * Validate a phone number.
 * Must contain 7–15 digits and not be a known placeholder.
 * @param {string|null} phone
 * @returns {{ valid: boolean, normalized: string|null, reason: string|null }}
 */
export function validatePhone(phone) {
  if (!phone) return { valid: false, normalized: null, reason: 'No phone provided' }
  const digits = (phone.match(PHONE_DIGITS) || []).join('')

  if (digits.length < 7)   return { valid: false, normalized: null, reason: 'Too few digits' }
  if (digits.length > 15)  return { valid: false, normalized: null, reason: 'Too many digits' }
  if (INVALID_PHONES.has(digits)) return { valid: false, normalized: null, reason: 'Placeholder phone detected' }
  if (/^(\d)\1{6,}$/.test(digits)) return { valid: false, normalized: null, reason: 'Repeated digit pattern' }

  // Normalize Philippine numbers: 09xx-xxx-xxxx → +639xxxxxxxxx
  let normalized = phone.trim()
  if (digits.length === 11 && digits.startsWith('09')) {
    normalized = '+63' + digits.slice(1)
  } else if (digits.length === 10 && digits.startsWith('9') && !digits.startsWith('1')) {
    normalized = '+63' + digits
  }

  return { valid: true, normalized, reason: null }
}

/**
 * Validate a LinkedIn URL.
 * @param {string|null} url
 * @returns {{ valid: boolean, normalized: string|null, reason: string|null }}
 */
export function validateLinkedIn(url) {
  if (!url) return { valid: false, normalized: null, reason: 'No LinkedIn URL provided' }
  const u = url.trim()
  if (!LINKEDIN_REGEX.test(u)) return { valid: false, normalized: null, reason: 'Not a valid LinkedIn profile URL' }

  const normalized = u.startsWith('http') ? u : 'https://' + u
  return { valid: true, normalized, reason: null }
}

/**
 * Validate a GitHub URL.
 * @param {string|null} url
 * @returns {{ valid: boolean, normalized: string|null, reason: string|null }}
 */
export function validateGitHub(url) {
  if (!url) return { valid: false, normalized: null, reason: 'No GitHub URL provided' }
  const u = url.trim()
  if (!GITHUB_REGEX.test(u)) return { valid: false, normalized: null, reason: 'Not a valid GitHub profile URL' }

  const normalized = u.startsWith('http') ? u : 'https://' + u
  return { valid: true, normalized, reason: null }
}

/**
 * Validate a portfolio URL.
 * Any valid HTTPS URL that is not LinkedIn or GitHub.
 * @param {string|null} url
 * @returns {{ valid: boolean, normalized: string|null, reason: string|null }}
 */
export function validatePortfolio(url) {
  if (!url) return { valid: false, normalized: null, reason: 'No portfolio URL provided' }
  const u = url.trim()
  if (!URL_REGEX.test(u))          return { valid: false, normalized: null, reason: 'Not a valid URL' }
  if (/linkedin\.com/i.test(u))    return { valid: false, normalized: null, reason: 'This is a LinkedIn URL' }
  if (/github\.com/i.test(u))      return { valid: false, normalized: null, reason: 'This is a GitHub URL' }
  return { valid: true, normalized: u, reason: null }
}
