import { qualificationTier, readAuthoritativeJobMatch, reviewSignal } from '../../services/evaluation/hrFitValidation.js';
import { compareWorkPreferences } from '../../services/alignment/workAlignment.js';

/** Informational only; HR evaluation and applicant scoring remain fully independent. */
export default function ApplicantFitInsights({ applicant, recruiterRoleRating = null }) {
  const match = readAuthoritativeJobMatch(applicant);
  const tier = qualificationTier(match.score);
  const signal = reviewSignal(match.score, recruiterRoleRating);
  // No inference from residence, education, name, resume prose, or personality.
  // Optional explicit preference records may be passed by a future consented workflow.
  const workplace = compareWorkPreferences(
    applicant?.applicant_snapshot?.shared_work_preferences,
    applicant?.applicant_snapshot?.job_alignment_requirements || applicant?.jobs
  );

  return (
    <section className="fit-insights" aria-labelledby="fit-insights-heading">
      <div className="fit-insights-head">
        <div>
          <h4 id="fit-insights-heading">System Job Match & HR Review</h4>
          <p>Saved application match when available, alongside an independent recruiter draft.</p>
        </div>
        <strong className="fit-insights-match" aria-label="Authoritative job match">
          {match.available ? `${Math.round(match.score)}%` : 'N/A'}
        </strong>
      </div>
      <div className="fit-insights-row"><span>System recommendation</span><strong>{tier}</strong></div>
      <div className="fit-insights-row"><span>Recruiter role-specific rating (draft)</span><strong>{recruiterRoleRating == null ? 'Not yet assessed' : `${recruiterRoleRating}/5 stars (HR)`}</strong></div>
      <div className="fit-insights-signal" role="status">
        <strong>{signal.title}</strong>
        <p>{signal.message}</p>
      </div>
      <div className="fit-insights-row"><span>Workplace alignment</span><strong>{workplace.label}</strong></div>
      <p className="fit-insights-disclaimer">Workplace alignment requires explicitly shared work preferences; it cannot be determined from a resume. Communication is reviewed separately from personality or culture.</p>
      <p className="fit-insights-disclaimer">Your rating is not saved until you submit the private evaluation. These signals do not change Job Match, determine hiring, or establish predictive accuracy.</p>
    </section>
  );
}
