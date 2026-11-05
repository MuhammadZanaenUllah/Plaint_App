// Pure action-routing rules shared by the list, detail and project screens.
// Contract references: §3.12, §3.18, §3.19, §8.4, §8.5, §8.9, §9.3.

import {
  isCompletedStatus,
  isInProgressStatus,
  isOnHoldStatus,
  normalizeApiStatus,
} from "./taskStatus";

export function isCompletionReady(status: string): boolean {
  return (
    isInProgressStatus(status) ||
    status === "In Review" ||
    status === "In Testing" ||
    status === "Pending-Approval"
  );
}

/** ATS Complete/On-Hold -> Pending/In-Progress must use /tasks/reopen. */
export function shouldRouteAtsReopen(
  currentStatus: string,
  requestedStatus: string,
  isAts: boolean,
): boolean {
  if (!isAts) return false;
  const current = normalizeApiStatus(currentStatus);
  const requested = normalizeApiStatus(requestedStatus);
  return (
    (isCompletedStatus(current) || isOnHoldStatus(current)) &&
    (requested === "Pending" || requested === "In-Progress")
  );
}

/** ATS Pending-Approval -> Pending/In-Progress uses the Resume modal. */
export function shouldRouteAtsResume(
  currentStatus: string,
  requestedStatus: string,
  isAts: boolean,
): boolean {
  if (!isAts) return false;
  const current = normalizeApiStatus(currentStatus);
  const requested = normalizeApiStatus(requestedStatus);
  return (
    current === "Pending-Approval" &&
    (requested === "Pending" || requested === "In-Progress")
  );
}

/** ATS recalculate safety-net trigger (contract §8.9). */
export function shouldRecalculateAfterStatus(
  currentStatus: string,
  requestedStatus: string,
  isAts: boolean,
): boolean {
  if (!isAts) return false;
  const current = normalizeApiStatus(currentStatus);
  const requested = normalizeApiStatus(requestedStatus);
  return (
    requested === "Complete" ||
    requested === "Pending" ||
    current === "On-Hold" ||
    current === "Partial Complete" ||
    current === "Pending-Approval"
  );
}

/** Contract dependency picker: only open, non-held tasks are candidates. */
export function isDependencyCandidateStatus(status: string): boolean {
  const normalized = normalizeApiStatus(String(status));
  if (isCompletedStatus(normalized)) return false;
  if (isOnHoldStatus(normalized)) return false;
  if (normalized === "Abandoned") return false;
  const raw = String(status).trim().toLowerCase();
  return raw !== "closed" && raw !== "cancelled" && raw !== "canceled";
}

export function shouldRecalculateAfterReassign(isAts: boolean): boolean {
  return isAts;
}

export function dependencyErrorMessage(message?: string | null): string {
  if (/circular/i.test(message ?? "")) {
    return "Circular dependency: this would create a dependency loop";
  }
  return (message ?? "").trim() || "Could not add dependency";
}

export function isNewCriticalFirst(
  orderedIds: (number | string)[],
  newTaskId: number | string,
): boolean {
  return orderedIds.length > 0 && Number(orderedIds[0]) === Number(newTaskId);
}

export function replacePlaceholderId(
  orderedIds: (number | string)[],
  placeholderId: number | string,
  realId: number | string,
): number[] {
  return orderedIds.map((id) =>
    Number(id) === Number(placeholderId) ? Number(realId) : Number(id),
  );
}
