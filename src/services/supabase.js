import { createClient } from '@supabase/supabase-js'

const env = import.meta.env || {};
const supabaseUrl = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    '[SkillSync] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
    'Set them in your environment before running the app.'
  )
}

const hasCreds = supabaseUrl && supabaseUrl.trim() && supabaseKey && supabaseKey.trim();
const isTesting = typeof process !== 'undefined' && process.env.TESTING === 'true';

export const supabase = hasCreds
  ? createClient(supabaseUrl, supabaseKey)
  : (isTesting
      ? {
          // Mock Supabase client for testing/CLI execution only
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
            delete: () => ({ eq: () => Promise.resolve({ data: null, error: null }) })
          })
        }
      : createClient(supabaseUrl || '', supabaseKey || '') // Crash normally if credentials are missing in dev/prod
    );