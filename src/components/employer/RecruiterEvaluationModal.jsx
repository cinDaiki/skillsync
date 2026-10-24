import { useEffect, useRef, useState } from 'react';
import { saveInterviewEvaluation } from '../../services/interviewService';
import ApplicantFitInsights from './ApplicantFitInsights';
import './RecruiterEvaluationModal.css';

export default function RecruiterEvaluationModal({ applicant, interview, employerId, saved, onClose, onSaved }) {
  const [techRating, setTechRating] = useState(saved?.technical_rating ?? '');
  const [commRating, setCommRating] = useState(saved?.communication_rating ?? '');
  const [recommendation, setRecommendation] = useState(saved?.overall_recommendation || 'Consider');
  const [notes, setNotes] = useState(saved?.evaluation_notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    if (interview?.status !== 'COMPLETED' || !employerId) {
      setError('A completed interview is required before saving an evaluation.');
      return;
    }
    if (![techRating, commRating].every(value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 5)) {
      setError('Select both ratings before saving.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await saveInterviewEvaluation({ interviewId: interview.id, employerId, notes, techRating: Number(techRating), commRating: Number(commRating), recommendation });
      if (result.error) throw result.error;
      await onSaved();
    } catch (failure) {
      setError(failure.message || 'Could not save the evaluation. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function handleKeys(event) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (!saving) onClose();
    }
    if (event.key === 'Tab') {
      const controls = [...dialogRef.current.querySelectorAll('button, select, textarea')].filter(el => !el.disabled);
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    }
  }

  return (
    <div className="recruiter-evaluation-backdrop">
      <section className="recruiter-evaluation-dialog" role="dialog" aria-modal="true" aria-labelledby="recruiter-evaluation-title" ref={dialogRef} tabIndex={-1} onKeyDown={handleKeys}>
        <header><h2 id="recruiter-evaluation-title">Private Recruiter Evaluation</h2><button type="button" aria-label="Close evaluation" onClick={onClose} disabled={saving}>×</button></header>
        <form onSubmit={submit}>
          <p>For {applicant.name || applicant.profiles?.full_name || applicant.displayName || 'Candidate'} · {applicant.job_title || applicant.jobs?.title || 'Position'}</p>
          <p className="recruiter-evaluation-notice">Private employer record. Candidates cannot view these ratings or notes.</p>
          <ApplicantFitInsights applicant={applicant} recruiterRoleRating={techRating === '' ? null : Number(techRating)} />
          <p>Rate evidence from the interview or a work sample against the job requirements.</p>
          <label htmlFor="evaluation-role-rating">Role-specific skills (1–5)</label>
          <select id="evaluation-role-rating" value={techRating} onChange={e => setTechRating(e.target.value)} required disabled={saving}>
            <option value="" disabled>Select a rating</option>{[1,2,3,4,5].map(n => <option key={n} value={n}>{n} / 5</option>)}
          </select>
          <label htmlFor="evaluation-communication-rating">Job-related communication and collaboration (1–5)</label>
          <select id="evaluation-communication-rating" value={commRating} onChange={e => setCommRating(e.target.value)} required disabled={saving}>
            <option value="" disabled>Select a rating</option>{[1,2,3,4,5].map(n => <option key={n} value={n}>{n} / 5</option>)}
          </select>
          <label htmlFor="evaluation-recommendation">Overall recommendation</label>
          <select id="evaluation-recommendation" value={recommendation} onChange={e => setRecommendation(e.target.value)} disabled={saving}>
            <option>Strong Hire</option><option>Hire</option><option value="Consider">Keep Under Consideration</option><option value="No Hire">Do Not Hire / Reject</option>
          </select>
          <label htmlFor="evaluation-private-notes">Private evaluation notes</label>
          <textarea id="evaluation-private-notes" rows={4} value={notes} onChange={e => setNotes(e.target.value)} disabled={saving} />
          {error && <p role="alert">{error}</p>}
          <footer><button type="button" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Private Evaluation'}</button></footer>
        </form>
      </section>
    </div>
  );
}
