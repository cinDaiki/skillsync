import { explainJobMatch, formatMatchPoints, readJobMatchEvidence } from '../../services/jobMatchEvidence.js';
import './JobMatchScore.css';

export default function JobMatchScore({ application, score, calculation, historical = false, evidenceError = null, loading = false }) {
  const match = application ? readJobMatchEvidence(application) : { score, calculation, historical };
  const available = typeof match.score === 'number' && Number.isFinite(match.score) && match.score >= 0 && match.score <= 100;
  const explanation = available ? explainJobMatch(match.calculation, match.score) : null;
  return (
    <section className="job-match-score" aria-label="Job Match Score">
      <div className="jms-heading"><strong>Job Match Score</strong><b>{available ? `${Math.round(match.score)}%` : 'Not evaluated'}</b></div>
      <p className="jms-context">{match.historical ? 'Saved when this application was submitted. Later resume edits do not change this result.' : 'Latest calculated match. A submitted application may have an earlier saved result.'}</p>
      <details>
        <summary>How this score was calculated</summary>
        {loading ? <p role="status">Loading calculation details…</p> : explanation ? <>
          <p>Each criterion earns contribution points. Add the points and round to the nearest whole number for the Job Match Score.</p>
          <div className="jms-table-wrap"><table>
            <caption>Calculation evidence and contribution points</caption>
            <thead><tr><th scope="col">Criterion and evidence</th><th scope="col">Points earned / available</th></tr></thead>
            <tbody>{explanation.rows.map(row => <tr key={row.key}>
              <td><strong>{row.label}</strong><p>{row.basis}</p>
                {row.included && <p>Rule result: {row.compatibility} out of 100. Calculation: {row.compatibility} ÷ 100 × {formatMatchPoints(row.maximum)} available points.</p>}
                {!!row.found?.length && <p className="jms-found">Matched: {row.found.join(', ')}</p>}
                {!!row.missing?.length && <p className="jms-missing">Not found: {row.missing.join(', ')}</p>}
                <small>Source: {row.source}</small></td>
              <td>{row.included ? `${formatMatchPoints(row.points)} / ${formatMatchPoints(row.maximum)}` : 'Not included'}</td>
            </tr>)}</tbody>
            <tfoot><tr><th scope="row">Total before rounding</th><td>{formatMatchPoints(explanation.total)} / 100 points</td></tr></tfoot>
          </table></div>
          <p className="jms-equation">{explanation.rows.filter(r => r.included).map(r => formatMatchPoints(r.points)).join(' + ')} = {formatMatchPoints(explanation.total)} points before rounding.</p>
          <small>Contribution = criterion compatibility (out of 100) × available points ÷ 100. Criteria excluded from the calculation contribute no points. Displayed decimals are rounded individually.</small>
          <p className="jms-context">Calculated {(explanation.calculatedAt ? new Date(explanation.calculatedAt).toLocaleString() : 'Date unavailable')} · Scoring version: {explanation.version}</p>
        </> : <p role={evidenceError ? 'status' : undefined}>{!available ? 'No authoritative match has been recorded yet.' : match.historical ? 'This application has a saved score, but its calculation details were not recorded. A newer resume cannot explain this earlier result.' : evidenceError ? 'Your score is shown above, but its calculation details could not be loaded. Please retry Recalculate. If this continues, the matching service needs to be updated.' : 'Your score is shown above. Calculation details have not been saved yet. Use Recalculate to request a new calculation.'}</p>}
      </details>
      <small>Job match describes alignment with job requirements, not the probability of being hired. HR makes the hiring decision.</small>
    </section>
  );
}
