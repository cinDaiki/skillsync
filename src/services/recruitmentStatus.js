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
