import { createClient } from '@supabase/supabase-js'

const metaEnv = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
const procEnv = (typeof process !== 'undefined' && process.env) ? process.env : {};

const supabaseUrl = metaEnv.VITE_SUPABASE_URL || procEnv.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = metaEnv.VITE_SUPABASE_ANON_KEY || procEnv.VITE_SUPABASE_ANON_KEY || 'placeholderKey';

if ((!metaEnv.VITE_SUPABASE_URL && !procEnv.VITE_SUPABASE_URL) || (!metaEnv.VITE_SUPABASE_ANON_KEY && !procEnv.VITE_SUPABASE_ANON_KEY)) {
  console.warn(
    '[SkillSync] Warning: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Using fallback client for offline/local mode.'
  )
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