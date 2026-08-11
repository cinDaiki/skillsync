/**
 * SkillSync Centralized Recruitment & Status Classification Engine
 * Single Source of Truth for Application & Interview Statuses across Workspace
 */

export const TERMINAL_APPLICATION_STATUSES = [
  "hired",
  "rejected",
  "withdrawn",
  "accepted",
  "closed"
];

export const ACTIVE_APPLICATION_STATUSES = [
  "applied",
  "pending",
  "reviewing",
  "under review",
  "shortlisted",
  "interview_scheduled",
  "interview_completed",
  "interview stage"
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

export function isTerminalApplicationStatus(status) {
  if (!status) return false;
  return TERMINAL_APPLICATION_STATUSES.includes(String(status).toLowerCase().trim());
}

export function isActiveApplicationStatus(status) {
  if (!status) return true;
  const s = String(status).toLowerCase().trim();
  return !TERMINAL_APPLICATION_STATUSES.includes(s);
}

export function isActiveInterviewStatus(status) {
  if (!status) return false;
  return ACTIVE_INTERVIEW_STATUSES.includes(String(status).toUpperCase().trim());
}

export function normalizeApplicationStatus(status) {
  if (!status) return "applied";
  const s = String(status).toLowerCase().trim();
  if (s === "pending") return "applied";
  if (s === "under review") return "reviewing";
  if (s === "interview stage") return "interview_scheduled";
  return s;
}
