// ATS / effort rules. Canonical effort utilities live in ../taskEffort.ts.
import type { TaskStatus } from "../../types/task.types";
import { initEffort, updateEffort, formatEffortForPayload, type EffortState } from "../effort/effort-display";

export type { EffortState };

export function hasAdvancedTaskModule(modules: string[] | undefined | null): boolean {
  if (!modules) return false;
  return modules.includes("Advanced Task Scheduling");
}

export function hasTasksModule(modules: string[] | undefined | null): boolean {
  if (!modules) return false;
  return modules.includes("Tasks");
}

export const EFFORT_RULES = {
  normal: {
    sendEffort: false,
    uiHidden: true,
    defaultStatus: "In-Progress" as TaskStatus,
  },
  ats: {
    sendEffort: true,
    uiHidden: false,
    defaultStatus: "Pending" as TaskStatus,
  },
};

export function getEffortState(
  minutes: number,
  isATS: boolean,
  currentUnit: "minutes" | "hours" | "days" = "hours",
): EffortState {
  return initEffort(minutes, isATS ? currentUnit : "minutes");
}

export function effortStateToPayload(state: EffortState): number {
  return formatEffortForPayload(state);
}

export { initEffort, updateEffort };
