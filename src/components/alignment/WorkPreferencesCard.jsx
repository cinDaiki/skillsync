import { useEffect, useState } from 'react';
import { getCandidateWorkPreferences, saveCandidateWorkPreferences } from '../../services/alignment/workPreferencesService.js';
import { WORK_SETUP_OPTIONS, WORK_SCHEDULE_OPTIONS, TRAVEL_OPTIONS } from '../../services/alignment/workAlignment.js';
import '../../styles/connectedRecruitment.css';

const EMPTY = { work_setup: '', work_schedule: '', travel_requirement: '', share_on_application: false };
const FIELDS = [
  { field: 'work_setup', label: 'Preferred work setup', choices: WORK_SETUP_OPTIONS },
  { field: 'work_schedule', label: 'Preferred schedule', choices: WORK_SCHEDULE_OPTIONS },
  { field: 'travel_requirement', label: 'Travel availability', choices: TRAVEL_OPTIONS },
];

/** Optional preferences do not change skills matching or application eligibility. */
export default function WorkPreferencesCard({ userId }) {
  const [values, setValues] = useState(EMPTY);
  const [savedValues, setSavedValues] = useState(EMPTY);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!userId) return;
    setLoading(true);
    getCandidateWorkPreferences(userId).then(({ data, error }) => {
      if (cancelled) return;
      if (error) setMessage({ type: 'warning', text: 'Work preferences are unavailable. Ask your administrator to enable the Phase 6 staging migration.' });
      else { setValues({ ...EMPTY, ...(data || {}) }); setSavedValues({ ...EMPTY, ...(data || {}) }); setMessage(null); }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [userId]);

  async function save() {
    setSaving(true);
    const { data, error } = await saveCandidateWorkPreferences(userId, values);
    if (error) setMessage({ type: 'warning', text: error.message || 'Could not save preferences.' });
    else {
      setValues({ ...EMPTY, ...data });
      setSavedValues({ ...EMPTY, ...data });
      setMessage({ type: 'success', text: 'Work preferences saved. Existing applications will not change.' });
      setEditing(false);
    }
    setSaving(false);
  }

  return (
    <section className="cr-card cr-preference-card" aria-label="Work preferences">
      <div className="cr-card-heading">
        <div><span className="cr-eyebrow">WORKPLACE ALIGNMENT</span><h2>How you prefer to work</h2><p>Help identify suitable working arrangements. These preferences do not change your Job Match percentage.</p></div>
        {!editing && <button type="button" className="cr-button cr-button-secondary" disabled={loading || !userId} onClick={() => setEditing(true)}>Edit preferences</button>}
      </div>
      {message && <p className={`cr-message cr-${message.type}`} role="status">{message.text}</p>}
      {!editing ? (
        <div className="cr-preference-summary">
          {FIELDS.map(({ field, label }) => <div key={field}><span>{label}</span><strong>{values[field] || 'Not specified'}</strong></div>)}
          <p className="cr-muted">Sharing with employers: <strong>{values.share_on_application ? 'Enabled for new applications' : 'Off'}</strong></p>
        </div>
      ) : (
        <div className="cr-preference-form">
          <div className="cr-preference-grid">
            {FIELDS.map(({ field, label, choices }) => <label key={field} className="cr-field"><span>{label}</span><select value={values[field] || ''} onChange={e => setValues(v => ({ ...v, [field]: e.target.value }))}><option value="">No preference stated</option>{choices.map(choice => <option key={choice} value={choice}>{choice}</option>)}</select></label>)}
          </div>
          <label className="cr-consent"><input type="checkbox" checked={values.share_on_application === true} onChange={e => setValues(v => ({ ...v, share_on_application: e.target.checked }))}/><span>Share these specific working preferences with an employer <strong>only when I submit a new application</strong>.</span></label>
          <p className="cr-muted">You can change this for future applications. Already submitted application snapshots stay unchanged.</p>
          <div className="cr-inline-actions"><button type="button" className="cr-button cr-button-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save preferences'}</button><button type="button" className="cr-button cr-button-secondary" disabled={saving} onClick={() => { setValues(savedValues); setEditing(false); }}>Cancel</button></div>
        </div>
      )}
    </section>
  );
}
