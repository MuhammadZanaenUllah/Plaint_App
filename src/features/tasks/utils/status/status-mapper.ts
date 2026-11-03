// Status mapper for Task Module
// Maps between UI status strings and API status values
// Phase 1 — Foundation

import { TaskStatus } from "../types/task.types";

export const uiStatusToApi: Record<TaskStatus, TaskStatus> = {
  Pending: "Pending",
  "In-Progress": "In-Progress",
  "On-Hold": "On-Hold",
  Complete: "Complete",
  "Pending-Approval": "Pending-Approval",
  Rejected: "Rejected",
};

export const apiStatusToUi: Record<TaskStatus, TaskStatus> = {
  Complete: "Complete",
  "In-Progress": "In-Progress",
  "On-Hold": "On-Hold",
  Pending: "Pending",
  "Pending-Approval": "Pending-Approval",
  Rejected: "Rejected",
};

// Valid status transitions (who can initiate)
export const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  Pending: ["In-Progress", "Complete", "Rejected", "Pending-Approval"],
  "In-Progress": ["Pending", "On-Hold", "Complete", "Rejected"],
  "On-Hold": ["Pending", "In-Progress", "Complete", "Rejected"],
  Complete: ["Rejected"], // only via reject; reopen is separate
  "Pending-Approval": ["Complete", "Rejected"], // approve moves to Complete, reject stays Pending-Approval or goes to Rejected
  Rejected: ["Pending", "In-Progress", "Complete"], // can reopen/reject out of
};

export function isValidTransition(from: TaskStatus, to: TaskStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}