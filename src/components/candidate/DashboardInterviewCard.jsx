import { Link } from 'react-router-dom';

export default function DashboardInterviewCard({ interview }) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(interview.scheduled_date || '')
    ? new Date(`${interview.scheduled_date}T00:00:00`) : null;
  const validDate = date && !Number.isNaN(date.getTime());
  const online = interview.interview_type === 'ONLINE';
  const confirmed = interview.status === 'CONFIRMED';
  let meetingUrl = null;
  try {
    const url = new URL(interview.meeting_url);
    if (['https:', 'http:'].includes(url.protocol)) meetingUrl = url.href;
  } catch { /* A missing or invalid link must not become a generic meeting link. */ }

  return (
    <div className="interview-card-item">
      <div className="interview-time-box">
        <strong>{validDate ? date.getDate() : '—'}</strong>
        <span>{validDate ? date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Date pending'}</span>
      </div>
      <div className="interview-details">
        <h4>{interview.job_title || 'Interview'}</h4>
        <p>{confirmed ? 'Confirmed' : interview.status === 'RESCHEDULE_REQUESTED' ? 'New time requested' : 'Awaiting your confirmation'}</p>
        <p>{online ? `Online · ${interview.platform || 'Platform to be confirmed'}` : `Walk-in · ${interview.address || 'Location to be confirmed'}`}</p>
        <small>Time: {interview.scheduled_time || 'To be confirmed'}</small>
      </div>
      {confirmed && online && meetingUrl ? (
        <a href={meetingUrl} target="_blank" rel="noreferrer" className="join-link">Join call</a>
      ) : (
        <Link to="/candidate/applications" className="join-link">Review invitation</Link>
      )}
    </div>
  );
}
