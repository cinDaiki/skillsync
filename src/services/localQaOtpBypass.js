/**
 * localQaOtpBypass.js
 *
 * Dedicated fail-closed security guard for LOCAL development OTP bypass.
 * Bypasses ONLY the second-step adaptive sign-in OTP for 3 exact QA test fixtures.
 *
 * Guards (ALL must be satisfied):
 * 1. import.meta.env.DEV === true (Vite dev mode)
 * 2. import.meta.env.VITE_LOCAL_QA_OTP_BYPASS === 'true' (explicit opt-in flag)
 * 3. Browser window origin is strictly localhost or 127.0.0.1
 * 4. Active Supabase URL is strictly pointing to local Supabase (127.0.0.1:54321 / localhost:54321)
 * 5. Normalized email is strictly one of:
 *    - jobseeker.test@example.com
 *    - employer.test@example.com
 *    - admin.test@example.com
 *
 * FAILS CLOSED on any error, hosted domain, remote Supabase instance, or non-matching email.
 */

export const LOCAL_QA_EMAILS = new Set([
  'jobseeker.test@example.com',
  'employer.test@example.com',
  'admin.test@example.com'
]);

export function isLocalQaOtpBypassAllowed(rawEmail, customSupabaseUrl = null) {
  try {
    // 1. Guard: Normalized email must be in allowlist
    if (!rawEmail || typeof rawEmail !== 'string') return false;
    const email = rawEmail.trim().toLowerCase();
    if (!LOCAL_QA_EMAILS.has(email)) return false;

    // 2. Guard: Must be in development mode (never true in production bundle)
    const metaEnv = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
    const procEnv = (typeof process !== 'undefined' && process.env) ? process.env : {};

    const isDev = metaEnv.DEV === true || (metaEnv.DEV === undefined && procEnv.NODE_ENV !== 'production' && procEnv.DEV === 'true');
    if (!isDev) return false;

    // 3. Guard: Explicit opt-in feature flag must be string 'true'
    const bypassFlag = (metaEnv.VITE_LOCAL_QA_OTP_BYPASS || procEnv.VITE_LOCAL_QA_OTP_BYPASS || '').trim();
    if (bypassFlag !== 'true') {
      return false;
    }

    // 4. Guard: Browser origin must be strictly localhost or 127.0.0.1
    if (typeof window !== 'undefined' && window.location) {
      const hostname = (window.location.hostname || '').toLowerCase();
      const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
      if (!isLocalHost) return false;

      // Fail-closed against any hosted domain
      if (hostname.includes('vercel.app') || hostname.includes('skillsync')) {
        return false;
      }
    } else {
      // Non-browser execution fails closed unless in testing
      if (procEnv.NODE_ENV === 'production') return false;
    }

    // 5. Guard: Active Supabase backend must be local Supabase (port 54321)
    const activeUrl = (customSupabaseUrl || metaEnv.VITE_SUPABASE_URL || procEnv.VITE_SUPABASE_URL || '').trim().toLowerCase();
    const isLocalBackend = 
      activeUrl.startsWith('http://127.0.0.1:54321') || 
      activeUrl.startsWith('http://localhost:54321');

    if (!isLocalBackend) return false;

    // Fail-closed against any hosted Supabase project ref
    if (activeUrl.includes('supabase.co')) {
      return false;
    }

    // All guards satisfied
    return true;
  } catch {
    // Fail closed on any exception
    return false;
  }
}
