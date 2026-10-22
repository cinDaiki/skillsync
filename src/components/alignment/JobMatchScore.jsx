import { explainJobMatch, formatMatchPoints, readJobMatchEvidence } from '../../services/jobMatchEvidence.js';
import './JobMatchScore.css';

export default function JobMatchScore({ application, score, calculation, historical = false, showScore = true }) {
  const match = application ? readJobMatchEvidence(application) : { score, calculation, historical };
  const available = typeof match.score === 'number' && Number.isFinite(match.score) && match.score >= 0 && match.score <= 100;
  const explanation = available ? explainJobMatch(match.calculation, match.score) : null;
  return (
    <section className="job-match-score" aria-label="Job Match Score">
      {showScore && <div className="jms-heading"><strong>Job Match Score</strong><b>{available ? `${Math.round(match.score)}%` : 'Not evaluated'}</b></div>}
      <p className="jms-context">{match.historical ? 'Saved when this application was submitted. Later resume edits do not change this result.' : 'Latest calculated match. A submitted application may have an earlier saved result.'}</p>
      <details>
        <summary>How this score was calculated</summary>
        {explanation ? <>
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
        </> : <p>{available ? 'This score has no saved calculation evidence. Historical details cannot be reconstructed from a newer resume. For a current match, use Recalculate to save a new calculation.' : 'No authoritative match has been recorded yet.'}</p>}
      </details>
      <small>Job match describes alignment with job requirements, not the probability of being hired. HR makes the hiring decision.</small>
    </section>
  );
}
