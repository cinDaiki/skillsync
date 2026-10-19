import { supabase } from '../supabase.js';
import { validatedWorkPreferences } from './workAlignment.js';

/** RLS restricts this table to the owner. Employer reads consented application snapshot, not this table. */
export async function getCandidateWorkPreferences(userId) {
  if (!userId) return { data: null, error: new Error('Missing candidate ID') };
  const { data, error } = await supabase.from('candidate_work_preferences')
    .select('work_setup, work_schedule, travel_requirement, share_on_application')
    .eq('user_id', userId).maybeSingle();
  return { data: data || null, error };
}

export async function saveCandidateWorkPreferences(userId, form) {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user || user.id !== userId) return { data: null, error: new Error('Not authorized to edit preferences') };
  let values;
  try { values = validatedWorkPreferences(form); }
  catch (error) { return { data: null, error }; }
  return supabase.from('candidate_work_preferences').upsert({ user_id: userId, ...values }, { onConflict: 'user_id' })
    .select('work_setup, work_schedule, travel_requirement, share_on_application').single();
}
