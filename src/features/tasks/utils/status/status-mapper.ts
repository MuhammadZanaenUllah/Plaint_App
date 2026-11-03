// Compatibility re-exports. Canonical status utilities live in ../taskStatus.ts.
export {
  normalizeApiStatus,
  toApiStatus,
  isCompletedStatus,
  isInProgressStatus,
  isOnHoldStatus,
  isPendingApprovalStatus,
  isAbandonedStatus,
  statusLabel,
  getDisplayStatus,
  getAllowedTransitions,
  canTransitionStatus,
  uiStatusToApi,
  apiStatusToUi,
  VALID_TRANSITIONS,
  isValidTransition,
  type TransitionContext,
} from "../taskStatus";
