import { useState } from 'react';
import { readAuthoritativeJobMatch, reviewSignal } from '../../services/evaluation/hrFitValidation.js';
import { compareWorkPreferences } from '../../services/alignment/workAlignment.js';
import ConnectedStatusStrip from './ConnectedStatusStrip.jsx';
import '../../styles/connectedRecruitment.css';

export default function ApplicantAlignmentSummary({ applicant, interview, evaluation }) {
  const [expanded, setExpanded] = useState(false);
  const match = readAuthoritativeJobMatch(applicant);
  const rating = Number.isInteger(evaluation?.technical_rating) ? evaluation.technical_rating : null;
  const signal = reviewSignal(match.score, rating);
  const snapshot = applicant?.applicant_snapshot || {};
  const requirements = snapshot.job_alignment_requirements || applicant?.jobs || {};
  // Employer sees ONLY the fields explicitly opted into the frozen application snapshot.
  const workplace = compareWorkPreferences(snapshot.shared_work_preferences, requirements);
  return (
    <section className="cr-applicant-summary" aria-label="Application alignment">
      <div className="cr-applicant-summary-head">
        <div><span className="cr-eyebrow">APPLICATION ALIGNMENT</span><h4>Job & recruiter review</h4></div>
        <button type="button" className="cr-text-button" onClick={() => setExpanded(v => !v)} aria-expanded={expanded}>{expanded ? 'Less detail ↑' : 'View alignment ↓'}</button>
      </div>
      <div className="cr-fact-row">
        <div><span>Job Match</span><strong>{match.available ? `${Math.round(match.score)}%` : 'Not evaluated'}</strong></div>
        <div><span>HR role assessment</span><strong>{rating == null ? 'Awaiting review' : `${rating} / 5`}</strong></div>
        <div><span>Work preferences</span><strong>{workplace.label}</strong></div>
      </div>
      {signal.status === 'disagreement' && <div className="cr-review-alert" role="status"><strong>Review recommended</strong> · System and HR assessments differ. Verify role-related evidence before deciding.</div>}
      {expanded && <div className="cr-applicant-details">
        <ConnectedStatusStrip status={applicant?.status} interviewStatus={interview?.status} audience="employer" />
        <p className="cr-muted">Match scores are system calculations. Recruiter assessments are independent and do not overwrite them.</p>
        <p className="cr-muted">Work preferences: {workplace.checkedCount ? workplace.details.map(d => `${d.label} (${d.aligned ? 'aligned' : 'discuss'})`).join(' · ') : 'Not shared or insufficient comparable information.'}</p>
        <p className="cr-muted">{signal.message}</p>
      </div>}
    </section>
  );
}
