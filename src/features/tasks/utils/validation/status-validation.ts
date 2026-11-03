// Compatibility status-transition validation.
import type { TaskStatus } from "../../types/task.types";
import {
  canTransitionStatus,
  getAllowedTransitions,
  isValidTransition,
  type TransitionContext,
} from "../taskStatus";

export interface StatusValidationResult {
  isValid: boolean;
  error?: string;
  allowedTransitions: TaskStatus[];
}

const DEFAULT_CONTEXT: TransitionContext = {
  canEditStatus: true,
  canApproveReject: true,
};

export function validateStatusTransition(
  from: TaskStatus | string,
  to: TaskStatus | string,
  ctx: TransitionContext = DEFAULT_CONTEXT,
): StatusValidationResult {
  const isValid = canTransitionStatus({ status: from }, to, ctx);
  return {
    isValid,
    error: isValid ? undefined : `Cannot transition from "${from}" to "${to}".`,
    allowedTransitions: getAllowedTransitions(from, ctx),
  };
}

export function getAllowedTransitionsFor(
  from: TaskStatus | string,
  ctx: TransitionContext = DEFAULT_CONTEXT,
): TaskStatus[] {
  return getAllowedTransitions(from, ctx);
}

export { isValidTransition };
