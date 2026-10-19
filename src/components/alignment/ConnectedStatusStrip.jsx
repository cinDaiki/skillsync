import { linkedRecruitmentStage } from '../../services/alignment/workAlignment.js';
import '../../styles/connectedRecruitment.css';

/** Shared application lifecycle — never a separate client-authored application status. */
export default function ConnectedStatusStrip({ status, interviewStatus, audience = 'candidate' }) {
  const stage = linkedRecruitmentStage(status, interviewStatus);
  return <div className="cr-status-strip" aria-label={`Recruitment progress: ${stage.label}`}>
    <div className="cr-status-top"><strong>{stage.label}</strong><span>Step {stage.step} of 5</span></div>
    <div className="cr-status-dots" aria-hidden="true">{[1,2,3,4,5].map(stepNum => <span key={stepNum} className={stepNum <= stage.step ? 'reached' : ''}/>)}</div>
    <p>{audience === 'employer' && stage.step === 1 ? 'Review the submitted qualifications and decide the next step.' : stage.next}</p>
  </div>;
}
