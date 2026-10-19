/** SkillSync Phase 6 — deliberate, auditable, non-personality workplace comparison.
 * Does NOT alter the six-factor job match, applicant eligibility, or hiring decisions.
 */
export const WORK_SETUP_OPTIONS = ['On-site', 'Hybrid', 'Remote', 'Flexible'];
export const WORK_SCHEDULE_OPTIONS = ['Day shift', 'Night shift', 'Rotating shifts', 'Flexible'];
export const TRAVEL_OPTIONS = ['None', 'Occasional', 'Regular', 'Flexible'];

const FIELD_LABELS = {
  work_setup: 'Work setup',
  work_schedule: 'Schedule',
  travel_requirement: 'Travel'
};

const clean = value => typeof value === 'string' ? value.trim().toLowerCase().replace(/[-\s_]+/g, ' ') : '';
const aliases = {
  'onsite': 'on site',
  'on site': 'on site',
  'office': 'on site',
  'day': 'day shift',
  'days': 'day shift',
  'night': 'night shift',
  'rotating': 'rotating shifts',
  'occasional travel': 'occasional',
  'regular travel': 'regular',
  'no travel': 'none',
};
const norm = x => aliases[clean(x)] || clean(x);

/** Both candidate AND job must specify a field. Unsupported values are left unassessed. */
const supported = {
  work_setup: new Set(WORK_SETUP_OPTIONS.map(norm)),
  work_schedule: new Set(WORK_SCHEDULE_OPTIONS.map(norm)),
  travel_requirement: new Set(TRAVEL_OPTIONS.map(norm))
};

export function compareWorkPreferences(candidate = null, job = null) {
  const c = candidate || {};
  const j = job || {};
  const results = [];
  for (const field of Object.keys(FIELD_LABELS)) {
    const preferred = norm(c[field]);
    const offered = norm(j[field]);
    if (!supported[field].has(preferred) || !supported[field].has(offered)) continue;
    const aligned = preferred === 'flexible' || offered === 'flexible' || preferred === offered;
    results.push({ field, label: FIELD_LABELS[field], preferred: c[field], offered: j[field], aligned });
  }
  if (!results.length) return { status: 'not_assessed', label: 'Not assessed', details: [], checkedCount: 0, total: 3 };
  const differences = results.filter(item => !item.aligned);
  return {
    status: differences.length ? 'needs_discussion' : 'aligned',
    label: differences.length ? 'Needs discussion' : 'Preferences align',
    details: results,
    checkedCount: results.length,
    total: 3,
  };
}

/** Only a deliberate opt-in may put these fields into a frozen application snapshot. */
export function sharedPreferenceSnapshot(record) {
  if (record?.share_on_application !== true) return null;
  const snapshot = {};
  for (const [field, choices] of Object.entries({
    work_setup: WORK_SETUP_OPTIONS,
    work_schedule: WORK_SCHEDULE_OPTIONS,
    travel_requirement: TRAVEL_OPTIONS
  })) {
    const value = record[field];
    if (typeof value === 'string' && choices.some(x => norm(x) === norm(value))) snapshot[field] = value;
  }
  return Object.keys(snapshot).length ? snapshot : null;
}

export function validatedWorkPreferences(form) {
  const fields = {};
  for (const [key, choices] of Object.entries({
    work_setup: WORK_SETUP_OPTIONS,
    work_schedule: WORK_SCHEDULE_OPTIONS,
    travel_requirement: TRAVEL_OPTIONS,
  })) {
    const value = form?.[key] || '';
    if (value && !choices.includes(value)) throw new Error(`Invalid ${key} selection.`);
    fields[key] = value || null;
  }
  fields.share_on_application = form?.share_on_application === true;
  return fields;
}

export function linkedRecruitmentStage(applicationStatus, interviewStatus) {
  const app = String(applicationStatus || 'applied').trim().toLowerCase();
  const inv = String(interviewStatus || '').trim().toUpperCase();
  if (['hired', 'accepted'].includes(app)) return { step: 5, label: 'Hired', next: 'Hiring decision recorded', complete: true };
  if (['rejected', 'withdrawn', 'cancelled'].includes(app)) return { step: 5, label: app === 'rejected' ? 'Not selected' : 'Closed', next: 'Application is closed', complete: true };
  if (app === 'interview_completed' || inv === 'COMPLETED') return { step: 4, label: 'Interview complete', next: 'Employer reviews evaluation and hiring decision', complete: false };
  if (inv === 'DECLINED') return { step: 3, label: 'Interview declined', next: 'Employer reviewing next steps', complete: false };
  if (inv === 'CANCELLED') return { step: 3, label: 'Interview cancelled', next: 'Employer to arrange next steps', complete: false };
  if (inv === 'RESCHEDULE_REQUESTED') return { step: 3, label: 'Reschedule requested', next: 'Employer to propose a new interview time', complete: false };
  if (inv === 'PENDING_CONFIRMATION') return { step: 3, label: 'Awaiting interview response', next: 'Candidate: confirm, decline, or request a new time', complete: false };
  if (inv === 'CONFIRMED' || app.includes('interview')) return { step: 3, label: 'Interview scheduled', next: 'Attend or complete the scheduled interview', complete: false };
  if (['shortlisted'].includes(app)) return { step: 2, label: 'Shortlisted', next: 'Employer may invite the candidate for an interview', complete: false };
  if (['reviewing', 'under_review'].includes(app)) return { step: 2, label: 'Under review', next: 'Employer reviewing submitted qualifications', complete: false };
  return { step: 1, label: 'Application received', next: 'Employer to review the application', complete: false };
}
