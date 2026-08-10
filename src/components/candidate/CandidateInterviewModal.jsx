import { useState } from "react";

export default function CandidateInterviewModal({
  interview,
  mode, // 'DECLINE' or 'RESCHEDULE'
  onClose,
  onSubmit, // async ({ response, message, preferredDate, preferredTimeRange })
}) {
  const [declineReason, setDeclineReason] = useState("Schedule conflict");
  const [declineMessage, setDeclineMessage] = useState("");
  const [prefDate, setPrefDate] = useState("");
  const [prefTimeRange, setPrefTimeRange] = useState("2:00 PM - 4:00 PM");
  const [rescheduleNote, setRescheduleNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);

    if (mode === "DECLINE") {
      const fullMsg = declineMessage
        ? `${declineReason} - ${declineMessage}`
        : declineReason;
      await onSubmit({
        response: "DECLINED",
        message: fullMsg,
      });
    } else if (mode === "RESCHEDULE") {
      await onSubmit({
        response: "RESCHEDULE_REQUESTED",
        message: rescheduleNote,
        preferredDate: prefDate,
        preferredTimeRange: prefTimeRange,
      });
    }

    setSubmitting(false);
  }

  const isDecline = mode === "DECLINE";

  return (
    <div className="modal-backdrop">
      <div className="modal-dialog candidate-interview-modal">
        <div className="modal-header">
          <h3>
            {isDecline ? "✕ Decline Interview Invitation" : "🔄 Request Another Schedule"}
          </h3>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body-form">
          <div className="modal-applicant-summary">
            <strong>
              {interview?.jobs?.title || "Job Position"} — {interview?.employer_profiles?.company_name || "Employer"}
            </strong>
            <span>
              Current Proposed Schedule: {interview?.scheduled_date} at {interview?.scheduled_time}
            </span>
          </div>

          {isDecline ? (
            <>
              <div className="form-group">
                <label>Reason for Declining *</label>
                <select
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                >
                  <option value="Schedule conflict">Schedule conflict</option>
                  <option value="Unable to attend at this location/platform">
                    Unable to attend at this location/platform
                  </option>
                  <option value="No longer interested in the role">
                    No longer interested in the role
                  </option>
                  <option value="Other">Other reason</option>
                </select>
              </div>

              <div className="form-group">
                <label>Additional Note for Employer (Optional)</label>
                <textarea
                  rows="3"
                  placeholder="Provide any context you'd like to share with the employer..."
                  value={declineMessage}
                  onChange={(e) => setDeclineMessage(e.target.value)}
                />
              </div>
            </>
          ) : (
            <>
              <div className="form-grid-2">
                <div className="form-group">
                  <label>Preferred Date *</label>
                  <input
                    type="date"
                    required
                    value={prefDate}
                    onChange={(e) => setPrefDate(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Preferred Time Range *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 2:00 PM - 4:00 PM"
                    value={prefTimeRange}
                    onChange={(e) => setPrefTimeRange(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Message / Availability Context (Optional)</label>
                <textarea
                  rows="3"
                  placeholder="e.g. I have a prior commitment during the original schedule. Available after 2 PM."
                  value={rescheduleNote}
                  onChange={(e) => setRescheduleNote(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="modal-footer-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={isDecline ? "btn-primary reject" : "btn-primary"}
              disabled={submitting}
            >
              {submitting
                ? "Submitting..."
                : isDecline
                ? "✕ Confirm Decline"
                : "🔄 Send Reschedule Request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
