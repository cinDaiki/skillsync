import { createClient } from '@supabase/supabase-js'

const metaEnv = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
const procEnv = (typeof process !== 'undefined' && process.env) ? process.env : {};

const rawUrl = (metaEnv.VITE_SUPABASE_URL || procEnv.VITE_SUPABASE_URL || '').trim();
const rawKey = (metaEnv.VITE_SUPABASE_ANON_KEY || procEnv.VITE_SUPABASE_ANON_KEY || '').trim();

// Security check: Ensure no accidental fallback or service_role key
if (rawKey.includes('service_role')) {
  console.error('[SkillSync] CRITICAL SECURITY WARNING: service_role key must NEVER be exposed in client code!');
}

let supabaseUrl = rawUrl;
let supabaseKey = rawKey;

// Preview Backend Isolation Guard:
// If running on a Vercel preview domain (*.vercel.app), guarantee that runtime
// requests NEVER contact Production Supabase.
// If supabaseUrl is not pointing to Staging or is missing in Preview, enforce Staging backend.
const STAGING_URL = 'https://zjzymrpifutqubffvhyt.supabase.co';
const STAGING_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqenltcnBpZnV0cXViZmZ2aHl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0MTgzODgsImV4cCI6MjEwNTk5NDM4OH0.D6LLkFwhWYUDih8qpkClfG-V2lwbTl68OvCfob2r_gc';

if (typeof window !== 'undefined') {
  const host = window.location.hostname.toLowerCase();
  const isVercelPreview = host.includes('vercel.app') && !host.startsWith('skillsync-prod');
  if (isVercelPreview && supabaseUrl !== STAGING_URL) {
    console.warn('[SkillSync] Preview domain detected without Staging backend. Enforcing Staging backend isolation.');
    supabaseUrl = STAGING_URL;
    supabaseKey = STAGING_ANON_KEY;
  }
}

if (!supabaseUrl || !supabaseKey) {
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') {
    console.error(
      '[SkillSync] CRITICAL: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in production build. Application cannot connect to Supabase.'
    );
  } else {
    console.warn(
      '[SkillSync] Warning: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Configure .env with valid credentials.'
    );
  }
}

const hasCreds = supabaseUrl && supabaseUrl.trim() && supabaseKey && supabaseKey.trim();
const isTesting = typeof process !== 'undefined' && process.env.TESTING === 'true';

function initSupabaseClient() {
  if (!hasCreds) {
    if (isTesting) {
      return {
        from: () => ({
          select: () => ({ 
            eq: () => ({ 
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
              order: () => Promise.resolve({ data: [], error: null })
            }),
            in: () => ({ 
              eq: () => Promise.resolve({ data: [], error: null }) 
            })
          }),
          upsert: () => Promise.resolve({ data: null, error: null }),
          insert: () => Promise.resolve({ data: null, error: null }),
          update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
          delete: () => ({ eq: () => Promise.resolve({ data: null, error: null }) })
        })
      };
    }
    return createClient(supabaseUrl || '', supabaseKey || '');
  }

  // Use browser window singleton to prevent "Multiple GoTrueClient instances" warnings during Vite HMR
  if (typeof window !== 'undefined') {
    if (!window.__skillsync_supabase_client__) {
      window.__skillsync_supabase_client__ = createClient(supabaseUrl, supabaseKey);
    }
    return window.__skillsync_supabase_client__;
  }

  return createClient(supabaseUrl, supabaseKey);
}

export const supabase = initSupabaseClient();