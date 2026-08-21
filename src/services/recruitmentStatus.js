/**
 * SkillSync Centralized Recruitment & Status Classification Engine
 * Single Source of Truth for Application & Interview Statuses across Workspace
 */

export const SCREENING_STATUSES = [
  "applied",
  "pending",
  "reviewing",
  "under review",
  "shortlisted"
];

export const INTERVIEW_STAGE_STATUSES = [
  "interview_scheduled",
  "interview stage",
  "interview"
];

export const DECISION_PENDING_STATUSES = [
  "interview_completed"
];

export const TERMINAL_APPLICATION_STATUSES = [
  "hired",
  "accepted",
  "rejected",
  "withdrawn",
  "closed"
];

export const ACTIVE_INTERVIEW_STATUSES = [
  "PENDING_CONFIRMATION",
  "CONFIRMED",
  "RESCHEDULE_REQUESTED"
];

export const TERMINAL_INTERVIEW_STATUSES = [
  "COMPLETED",
  "CANCELLED",
  "DECLINED"
];

export function normalizeApplicationStatus(status) {
  if (!status) return "applied";
  const s = String(status).toLowerCase().trim();
  if (s === "pending" || s === "submitted") return "applied";
  if (s === "under review" || s === "under_review") return "reviewing";
  if (s === "interview stage" || s === "interview") return "interview_scheduled";
  if (s === "accepted") return "hired";
  return s;
}

export function isScreeningStatus(status) {
  if (!status) return true;
  const s = normalizeApplicationStatus(status);
  return SCREENING_STATUSES.includes(s);
}

export function isInterviewStage(status) {
  if (!status) return false;
  const s = normalizeApplicationStatus(status);
  return INTERVIEW_STAGE_STATUSES.includes(s);
}

export function isDecisionPending(status, interviewStatus = "") {
  if (isTerminalApplication(status)) return false;
  if (interviewStatus && String(interviewStatus).toUpperCase().trim() === "COMPLETED") return true;
  if (!status) return false;
  const s = normalizeApplicationStatus(status);
  return s === "interview_completed";
}

export function isHired(status) {
  if (!status) return false;
  const s = normalizeApplicationStatus(status);
  return s === "hired";
}

export function isRejected(status) {
  if (!status) return false;
  const s = normalizeApplicationStatus(status);
  return s === "rejected";
}

export function isTerminalApplication(status) {
  if (!status) return false;
  const s = normalizeApplicationStatus(status);
  return TERMINAL_APPLICATION_STATUSES.includes(s);
}

export function isActiveApplicant(status) {
  if (!status) return true;
  const s = normalizeApplicationStatus(status);
  return !isTerminalApplication(s);
}

export function isActiveInterviewStatus(status) {
  if (!status) return false;
  return ACTIVE_INTERVIEW_STATUSES.includes(String(status).toUpperCase().trim());
}

export function deduplicateByApplicationId(list) {
  if (!Array.isArray(list)) return [];
  const map = new Map();
  list.forEach(item => {
    if (item && item.id && !map.has(item.id)) {
      map.set(item.id, item);
    }
  });
  return Array.from(map.values());
}

/**
 * Resolves candidate-facing recruitment progress, stage indicators, and status messages.
 *
 * @param {string} appStatus - Status of the application record
 * @param {string} invStatus - Status of any associated interview record
 * @returns {object} Candidate stage information and visual step definitions
 */
export function getCandidateStageInfo(appStatus = "applied", invStatus = "") {
  const normApp = normalizeApplicationStatus(appStatus);
  const normInv = invStatus ? String(invStatus).toUpperCase().trim() : "";

  let stage = 1;
  let percent = "0%";
  let statusBadgeText = "APPLIED";
  let statusBadgeClass = "submitted";
  let statusMessage = "Your application has been submitted and is waiting for employer review.";
  let actionIndicator = null;
  const isTerminal = isTerminalApplication(normApp);
  const isHiredVal = isHired(normApp);
  const isRejectedVal = isRejected(normApp);
  const isWithdrawnVal = normApp === "withdrawn";
  const canWithdraw = !isTerminal;

  if (isHiredVal) {
    stage = 5;
    percent = "100%";
    statusBadgeText = "🎉 HIRED";
    statusBadgeClass = "accepted";
    statusMessage = "Congratulations! You were selected for this position.";
  } else if (isRejectedVal) {
    stage = 5;
    percent = "100%";
    statusBadgeText = "NOT SELECTED";
    statusBadgeClass = "rejected";
    statusMessage = "The employer has completed the hiring decision.";
  } else if (isWithdrawnVal) {
    stage = 1;
    percent = "0%";
    statusBadgeText = "WITHDRAWN";
    statusBadgeClass = "withdrawn";
    statusMessage = "You withdrew this application.";
  } else if (normApp === "closed") {
    stage = 5;
    percent = "100%";
    statusBadgeText = "CLOSED";
    statusBadgeClass = "rejected";
    statusMessage = "This job listing is closed.";
  } else if (isDecisionPending(normApp, normInv)) {
    stage = 5;
    percent = "85%";
    statusBadgeText = "DECISION PENDING";
    statusBadgeClass = "pending";
    statusMessage = "Your interview is complete. The employer is reviewing the final decision.";
  } else if (isInterviewStage(normApp) || (normInv && normInv !== "CANCELLED" && normInv !== "DECLINED")) {
    stage = 4;
    percent = "75%";
    statusBadgeText = "INTERVIEW";
    statusBadgeClass = "pending";
    statusMessage = "Your application has reached the interview stage.";

    if (normInv === "PENDING_CONFIRMATION") {
      actionIndicator = "⚠️ Interview confirmation required";
    } else if (normInv === "CONFIRMED") {
      actionIndicator = "🟢 Interview confirmed";
    } else if (normInv === "RESCHEDULE_REQUESTED") {
      actionIndicator = "🔄 Reschedule request sent to employer";
    }
  } else if (normApp === "shortlisted") {
    stage = 3;
    percent = "50%";
    statusBadgeText = "SHORTLISTED";
    statusBadgeClass = "pending";
    statusMessage = "You've been shortlisted for the next recruitment stage.";
  } else if (normApp === "reviewing") {
    stage = 2;
    percent = "25%";
    statusBadgeText = "UNDER REVIEW";
    statusBadgeClass = "submitted";
    statusMessage = "The employer is currently reviewing your application.";
  } else {
    // Applied
    stage = 1;
    percent = "0%";
    statusBadgeText = "APPLIED";
    statusBadgeClass = "submitted";
    statusMessage = "Your application has been submitted and is waiting for employer review.";
  }

  // Build steps array for visual progress track
  const stepLabels = [
    { id: "applied", label: "Applied" },
    { id: "reviewed", label: "Reviewed" },
    { id: "shortlisted", label: "Shortlisted" },
    { id: "interview", label: "Interview" },
    { id: "decision", label: isHiredVal ? "Hired" : isRejectedVal ? "Rejected" : "Decision" }
  ];

  const steps = stepLabels.map((s, idx) => {
    const stepNum = idx + 1;
    let state = "upcoming";
    if (isRejectedVal && stepNum === 5) {
      state = "failed";
    } else if (isHiredVal && stepNum === 5) {
      state = "completed";
    } else if (stepNum < stage) {
      state = "completed";
    } else if (stepNum === stage) {
      state = isTerminal && !isHiredVal ? (isRejectedVal ? "failed" : "completed") : "active";
    }
    return {
      id: s.id,
      label: s.label,
      state
    };
  });

  return {
    stage,
    percent,
    statusBadgeText,
    statusBadgeClass,
    statusMessage,
    actionIndicator,
    isTerminal,
    isHired: isHiredVal,
    isRejected: isRejectedVal,
    isWithdrawn: isWithdrawnVal,
    canWithdraw,
    steps
  };
}
