// Status transition validation
// Phase 1 — Foundation

import { TaskStatus } from "../types/task.types";
import { isValidTransition } from "../utils/status/status-mapper";

export interface StatusValidationResult {
  isValid: boolean;
  error?: string;
  allowedTransitions: TaskStatus[];
}

export function validateStatusTransition(
  from: TaskStatus,
  to: TaskStatus
): StatusValidationResult {
  const allowed = isValidTransition(from, to)
    ? [to]
    : Object.keys(VALID_TRANSITIONS[from] || {}).filter(
        (s) => isValidTransition(from, s as TaskStatus)
      ) as TaskStatus[];

  if (isValidTransition(from, to)) {
    return { isValid: true, allowedTransitions: [to] };
  }

  return {
    isValid: false,
    error: `Cannot transition from "${from}" to "${to}".`,
    allowedTransitions: allowed,
  };
}

export function getAllowedTransitions(from: TaskStatus): TaskStatus[] {
  return isValidTransition(from, from) ? [from] : Object.keys(VALID_TRANSITIONS[from] || {}) as TaskStatus[];
}