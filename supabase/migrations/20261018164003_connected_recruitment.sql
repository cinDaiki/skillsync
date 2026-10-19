-- SkillSync Phase 6 | APPROVED STAGING ONLY
-- IMPORTANT: Create a migration with `supabase migration new connected_recruitment` and paste this SQL into it.
-- Apply ONLY to approved staging project zjzymrpifutqubffvhyt after review and backup.
-- No migration is run by this package. Never apply to blekdvuovbfpuaepjvfq.

create table if not exists public.candidate_work_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  work_setup text null check (work_setup is null or work_setup in ('On-site','Hybrid','Remote','Flexible')),
  work_schedule text null check (work_schedule is null or work_schedule in ('Day shift','Night shift','Rotating shifts','Flexible')),
  travel_requirement text null check (travel_requirement is null or travel_requirement in ('None','Occasional','Regular','Flexible')),
  share_on_application boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.candidate_work_preferences enable row level security;
revoke all on public.candidate_work_preferences from anon;
grant select, insert, update on public.candidate_work_preferences to authenticated;
-- DO NOT GRANT read access to employers: shared preferences must come from frozen application snapshots.

drop policy if exists candidate_work_preferences_select_own on public.candidate_work_preferences;
create policy candidate_work_preferences_select_own on public.candidate_work_preferences
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists candidate_work_preferences_insert_own on public.candidate_work_preferences;
create policy candidate_work_preferences_insert_own on public.candidate_work_preferences
for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists candidate_work_preferences_update_own on public.candidate_work_preferences;
create policy candidate_work_preferences_update_own on public.candidate_work_preferences
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- Employer-stated logistics; no sensitive personal data, no automated eligibility gates.
alter table public.jobs add column if not exists work_schedule text null;
alter table public.jobs add column if not exists travel_requirement text null;

-- Existing job records remain unspecified, and must show 'Not assessed'.
-- Intentionally no blanket INSERT/UPDATE grants on jobs: existing job policies still apply.
-- Confirm on staging that employer-created jobs expose these fields to the authorized employer and candidate.

-- Server-owned immutable application alignment snapshot. Do not accept client-authored
-- match scores, shared preferences, or job requirement snapshots as authoritative.
-- This trigger runs for BOTH the existing submit_job_application RPC and legacy direct inserts.
create or replace function public.freeze_two_way_application_alignment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_score numeric;
  v_job record;
  v_pref record;
  v_details jsonb;
begin
  -- An authenticated candidate must never insert a record as another applicant.
  -- The canonical RPC also enforces this; retain defense in depth for direct inserts.
  if auth.uid() is not null and auth.uid() <> new.applicant_id then
    raise exception 'FORBIDDEN: application applicant_id does not match caller';
  end if;
  -- Client-authored claims are always discarded before regenerating trusted fields.
  new.applicant_snapshot := coalesce(new.applicant_snapshot, '{}'::jsonb)
    - 'application_time_match_score'
    - 'application_time_match_source'
    - 'shared_work_preferences'
    - 'job_alignment_requirements';

  select work_setup, work_schedule, travel_requirement into v_job
    from public.jobs where id = new.job_id;
  if found then
    v_details := jsonb_strip_nulls(jsonb_build_object(
      'work_setup', v_job.work_setup,
      'work_schedule', v_job.work_schedule,
      'travel_requirement', v_job.travel_requirement
    ));
    new.applicant_snapshot := jsonb_set(new.applicant_snapshot, '{job_alignment_requirements}', v_details, true);
  end if;

  select work_setup, work_schedule, travel_requirement into v_pref
    from public.candidate_work_preferences
    where user_id = new.applicant_id and share_on_application = true;
  if found then
    v_details := jsonb_strip_nulls(jsonb_build_object(
      'work_setup', v_pref.work_setup,
      'work_schedule', v_pref.work_schedule,
      'travel_requirement', v_pref.travel_requirement
    ));
    if v_details <> '{}'::jsonb then
      new.applicant_snapshot := jsonb_set(new.applicant_snapshot, '{shared_work_preferences}', v_details, true);
    end if;
  end if;

  select match_score into v_score from public.job_matches
    where user_id = new.applicant_id and job_id = new.job_id;
  if found and v_score between 0 and 100 then
    new.applicant_snapshot := jsonb_set(new.applicant_snapshot, '{application_time_match_score}', to_jsonb(v_score), true);
    new.applicant_snapshot := jsonb_set(new.applicant_snapshot, '{application_time_match_source}', '"job_matches"'::jsonb, true);
  end if;
  return new;
end;
$$;

revoke all on function public.freeze_two_way_application_alignment() from PUBLIC, anon, authenticated;
drop trigger if exists trg_freeze_two_way_application_alignment on public.applications;
create trigger trg_freeze_two_way_application_alignment
before insert on public.applications
for each row execute function public.freeze_two_way_application_alignment();

notify pgrst, 'reload schema';
