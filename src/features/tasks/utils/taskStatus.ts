// Canonical task status utilities.
// New code must send contract values ("On-Hold", "Complete", "Partial Complete").
// Legacy display aliases are normalized at the boundary.

import { STATUS_DISPLAY } from "../constants/taskConstants";
import type { CanonicalTaskStatus, TaskStatus } from "../types/task.types";

const API_STATUS_MAP: Record<string, CanonicalTaskStatus | "Recurring"> = {
  pending: "Pending",
  "in-progress": "In-Progress",
  inprogress: "In-Progress",
  "in progress": "In-Progress",
  in_progress: "In-Progress",
  "on-hold": "On-Hold",
  onhold: "On-Hold",
  "on hold": "On-Hold",
  on_hold: "On-Hold",
  "pending-approval": "Pending-Approval",
  pendingapproval: "Pending-Approval",
  pending_approval: "Pending-Approval",
  rejected: "Rejected",
  complete: "Complete",
  completed: "Complete",
  done: "Complete",
  "partial complete": "Partial Complete",
  "partial-complete": "Partial Complete",
  partial_complete: "Partial Complete",
  abandoned: "Abandoned",
  recurring: "Recurring",
};

export function normalizeApiStatus(value: string | null | undefined): TaskStatus {
  if (!value) return "Pending";
  const normalized = API_STATUS_MAP[value.trim().toLowerCase()];
  return (normalized ?? value) as TaskStatus;
}

export function toApiStatus(status: TaskStatus | string): string {
  switch (status) {
    case "On Hold":
      return "On-Hold";
    case "Completed":
      return "Complete";
    case "Recurring":
      // Recurring is a template marker, not a status that is sent to /updatetaskstatus.
      return "Pending";
    default:
      return status;
  }
}

export function isCompletedStatus(status: TaskStatus | string): boolean {
  return status === "Complete" || status === "Completed";
}

export function isInProgressStatus(status: TaskStatus | string): boolean {
  return status === "In-Progress" || status === "In Progress";
}

export function isOnHoldStatus(status: TaskStatus | string): boolean {
  return status === "On-Hold" || status === "On Hold";
}

export function isPendingApprovalStatus(status: TaskStatus | string): boolean {
  return status === "Pending-Approval";
}

export function isAbandonedStatus(status: TaskStatus | string): boolean {
  return status === "Abandoned";
}

export function statusLabel(status: TaskStatus | string): string {
  return STATUS_DISPLAY[status as TaskStatus] ?? String(status);
}

export function getDisplayStatus(status: TaskStatus | string): TaskStatus {
  return normalizeApiStatus(status);
}

// ---- Transitions ----

export type TransitionContext = {
  canEditStatus: boolean;
  canApproveReject: boolean;
  subtaskCount?: number;
  isAts?: boolean;
};

const BASE_TRANSITIONS: Record<string, TaskStatus[]> = {
  Pending: ["In-Progress", "On-Hold", "Complete"],
  "In-Progress": ["Pending", "On-Hold", "Complete"],
  "On-Hold": ["Pending", "In-Progress", "Complete"],
  Complete: ["Pending", "In-Progress", "On-Hold"], // reopen via API
  "Pending-Approval": ["Complete", "Pending", "In-Progress"],
  Rejected: ["Pending", "In-Progress", "Complete"],
  Recurring: [],
  "Partial Complete": ["Complete", "In-Progress"],
  Abandoned: [],
};

export function getAllowedTransitions(
  current: TaskStatus | string,
  ctx: TransitionContext,
): TaskStatus[] {
  const normalized = normalizeApiStatus(String(current));
  const transitions = BASE_TRANSITIONS[normalized] ?? [];
  return transitions.filter((next) => canTransitionStatus({ status: current }, next, ctx));
}

export function canTransitionStatus(
  task: { status: TaskStatus | string; subtask_count?: number },
  next: TaskStatus | string,
  ctx: TransitionContext,
): boolean {
  if (!ctx.canEditStatus) return false;

  const current = normalizeApiStatus(String(task.status));
  const target = normalizeApiStatus(String(next));

  if (target === "Pending-Approval") return false; // server-set only
  if (target === "Abandoned") return false; // project cascade only
  if (target === "Recurring") return false;
  if (target === "Rejected") {
    // Reject is only valid from Pending-Approval via /tasks/reject.
    return current === "Pending-Approval" && ctx.canApproveReject;
  }
  if (target === "Partial Complete") {
    return (task.subtask_count ?? ctx.subtaskCount ?? 0) > 0;
  }

  return (BASE_TRANSITIONS[current] ?? []).includes(target);
}

// ---- Legacy exports used by the current UI ----

export const uiStatusToApi = new Proxy({} as Record<TaskStatus, TaskStatus>, {
  get: (_target, key: string) => toApiStatus(key as TaskStatus) as TaskStatus,
});

export const apiStatusToUi = new Proxy({} as Record<TaskStatus, TaskStatus>, {
  get: (_target, key: string) => normalizeApiStatus(key),
});

export const VALID_TRANSITIONS: Record<string, TaskStatus[]> = BASE_TRANSITIONS;

export function isValidTransition(from: TaskStatus | string, to: TaskStatus | string): boolean {
  return (BASE_TRANSITIONS[normalizeApiStatus(String(from))] ?? []).includes(
    normalizeApiStatus(String(to)),
  );
}
