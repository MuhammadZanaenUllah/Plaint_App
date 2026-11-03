// Effort rules for ATS vs normal companies
// Phase 1 — Foundation

import { TaskStatus, TaskPriority, EffortState, EffortUnit } from "../types/task.types";
import { initEffort, updateEffort, formatEffortForPayload } from "../utils/effort/effort-display";

export const EFFORT_RULES = {
  // Normal companies: do not send effort; UI hides effort field
  normal: {
    sendEffort: false,
    uiHidden: true,
    defaultStatus: "In-Progress" as TaskStatus,
  },
  // ATS companies: effort required, in minutes
  ats: {
    sendEffort: true,
    uiHidden: false,
    defaultStatus: "Pending" as TaskStatus,
  },
};

// Determine company ATS status from modules
export function hasAdvancedTaskModule(modules: string[] | undefined): boolean {
  if (!modules) return false;
  return modules.some((m) => m === "Advanced Task Scheduling");
}

// Get effort state based on ATS flag and company modules
export function getEffortState(
  minutes: number,
  isATS: boolean,
  currentUnit: EffortUnit = "hours"
): EffortState {
  const rules = isATS ? EFFORT_RULES.ats : EFFORT_RULES.normal;
  return initEffort(minutes, rules.uiHidden ? "minutes" : currentUnit);
}

// Convert effort state for API payload
export function effortStateToPayload(state: EffortState): number {
  return formatEffortForPayload(state);
}