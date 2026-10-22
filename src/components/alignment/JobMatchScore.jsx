import { explainJobMatch, wholeMatchContributions, readJobMatchEvidence } from '../../services/jobMatchEvidence.js';
import './JobMatchScore.css';

const iconPaths = {
  skills: 'm9 12 2 2 4-4 M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  transferable: 'M8 7h11l-3-3 M16 17H5l3 3 M19 7l-3 3 M5 17l3-3',
  education: 'm3 9 9-5 9 5-9 5-9-5 M6 11v6l6 3 6-3v-6 M21 9v7',
  experience: 'M9 7V4h6v3 M4 7h16v13H4V7 M4 12l8 3 8-3 M12 12v4',
  credentials: 'M16 9a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M9 13l-2 7 5-2 5 2-2-7',
  semantic: 'M5 3h10l4 4v14H5V3 M14 3v5h5 M8 12h8 M8 16h6',
};
const clean = value => typeof value === 'string' ? value.trim() : '';
const stated = value => !!clean(value) && !/^(not specified|none|n\/a)$/i.test(clean(value));
const count = value => Array.isArray(value) ? value.length : 0;

function criterionCopy(row, evidence) {
  const strength = row.compatibility === 100 ? 'Meets scoring rule' : row.compatibility > 0 ? 'Partial match' : 'Not found';
  switch (row.key) {
    case 'skills': return count(evidence.required_skills)
      ? { summary: `${row.found.length} of ${count(evidence.required_skills)} required skills found`, status: row.compatibility === 100 ? 'Skills matched' : 'Skills to improve' }
      : { summary: 'No required skills were listed', status: 'Default rule', baseline: true };
    case 'transferable': return count(evidence.required_transferable)
      ? { summary: `${evidence.matched_required_transferable_count} of ${count(evidence.required_transferable)} transferable skills found`, status: strength }
      : { summary: 'No transferable requirement set', status: 'Default rule', baseline: true, note: 'Default points are not verified skill evidence.' };
    case 'education': return {
      summary: stated(evidence.required_education) ? `Required: ${evidence.required_education}` : 'No education requirement set',
      detail: clean(evidence.candidate_education) ? `Resume: ${evidence.candidate_education}` : 'No education recorded',
      status: stated(evidence.required_education) ? strength : 'Default rule', baseline: !stated(evidence.required_education),
    };
    case 'experience': return {
      summary: stated(evidence.experience_required) ? `Required: ${evidence.experience_required}` : 'No experience requirement set',
      detail: typeof evidence.candidate_years === 'number' ? `Resume: ${evidence.candidate_years} years` : 'No experience recorded',
      status: stated(evidence.experience_required) ? strength : 'Default rule', baseline: !stated(evidence.experience_required),
    };
    case 'credentials': return { summary: row.included ? `${row.found.length} of ${count(evidence.required_certifications)} certifications found` : 'No certification required', status: strength };
    default: return { summary: row.included ? 'Resume and job text compared' : 'Text comparison unavailable', status: 'Supporting context', note: row.included ? 'Text similarity is not proof of qualifications.' : null };
  }
}

export default function JobMatchScore({ application, score, calculation, historical = false, evidenceError = null, loading = false }) {
  const match = application ? readJobMatchEvidence(application) : { score, calculation, historical };
  const available = typeof match.score === 'number' && Number.isFinite(match.score) && match.score >= 0 && match.score <= 100;
  const explanation = available ? explainJobMatch(match.calculation, match.score) : null;
  const rows = explanation ? wholeMatchContributions(explanation) : [];
  const included = rows.filter(row => row.included);
  const calculatedDate = explanation?.calculatedAt ? new Date(explanation.calculatedAt) : null;
  return (
    <section className="job-match-score" aria-label="Job Match Score">
      <div className="jms-heading"><div><strong>Job Match Score</strong><p className="jms-context">{match.historical ? 'Saved with your application' : 'Based on your current resume'}</p></div><b>{available ? `${Math.round(match.score)}%` : 'Not evaluated'}</b></div>
      <details className="jms-breakdown">
        <summary>How this score was calculated<span className="jms-disclosure" aria-hidden="true">⌄</span></summary>
        {loading ? <p role="status">Loading calculation details…</p> : explanation ? <>
          <div className="jms-intro"><strong>Where your points came from</strong><span>Each card adds points to your total.</span></div>
          <div className="jms-grid">{rows.map(row => {
            const copy = criterionCopy(row, explanation.evidence);
            return <article className={`jms-criterion${!row.included ? ' jms-excluded' : ''}${copy.baseline ? ' jms-baseline' : ''}`} key={row.key} aria-label={row.label}>
              <div className="jms-card-heading">
                <span className="jms-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={iconPaths[row.key]} /></svg></span>
                <h4>{row.label}</h4>
                <strong className="jms-points">{row.included ? <><span>+{row.displayPoints}</span><small>points</small></> : <small>Not counted</small>}</strong>
              </div>
              <p className="jms-card-summary">{copy.summary}</p>
              {copy.detail && <p className="jms-card-detail">{copy.detail}</p>}
              {row.included && <><div className="jms-strength" aria-hidden="true"><span style={{ transform: `scaleX(${row.compatibility / 100})` }} /></div><span className="jms-status">{copy.status}</span></>}
              {!!row.found?.length && <div className="jms-skill-group"><span>Found</span><ul aria-label={`${row.label} found`}>{row.found.map(skill => <li className="jms-found" key={skill}>{skill}</li>)}</ul></div>}
              {!!row.missing?.length && <div className="jms-skill-group"><span>Missing</span><ul aria-label={`${row.label} missing`}>{row.missing.map(skill => <li className="jms-missing" key={skill}>{skill}</li>)}</ul></div>}
              {copy.note && <p className="jms-card-note">{copy.note}</p>}
            </article>;
          })}</div>
          <div className="jms-total" aria-label="Contribution total"><div><span>Points added together</span><strong>{included.map(row => row.displayPoints).join(' + ')} = {Math.round(explanation.score)}</strong></div><b>{Math.round(explanation.score)}<small> / 100 points</small></b></div>
          <p className="jms-rounding">Shown as whole points, adjusted to add up to your saved score. The calculation keeps full precision.</p>
          <p className="jms-record">{calculatedDate && !Number.isNaN(calculatedDate.getTime()) ? `Calculated ${calculatedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · ` : ''}Based on saved resume and job requirements.{match.historical ? ' Later resume edits do not change this result.' : ' Submitted applications keep their saved result.'}</p>
        </> : <p role={evidenceError ? 'status' : undefined}>{!available ? 'No authoritative match has been recorded yet.' : match.historical ? 'This application has a saved score, but its calculation details were not recorded. A newer resume cannot explain this earlier result.' : evidenceError ? 'Your score is shown above, but its calculation details could not be loaded. Please retry Recalculate. If this continues, the matching service needs to be updated.' : 'Your score is shown above. Calculation details have not been saved yet. Use Recalculate to request a new calculation.'}</p>}
      </details>
      <small className="jms-disclaimer">Job alignment only. HR makes the hiring decision.</small>
    </section>
  );
}
