import { compareWorkPreferences } from '../../services/alignment/workAlignment.js';
import '../../styles/connectedRecruitment.css';

export default function WorkAlignmentMini({ preferences, job, compact = false }) {
  const result = compareWorkPreferences(preferences, job);
  return (
    <div className={`cr-alignment-mini cr-${result.status} ${compact ? 'cr-compact' : ''}`}>
      <div className="cr-alignment-meta"><span>WORK SETUP & PREFERENCES</span><strong>{result.label}</strong></div>
      {result.checkedCount > 0 ? <p>{result.details.map(d => `${d.label}: ${d.aligned ? 'aligns' : 'discuss'}`).join(' · ')} <span>({result.checkedCount}/3 checked)</span></p> : <p>Compare working arrangements after you add optional preferences to your profile.</p>}
    </div>
  );
}
