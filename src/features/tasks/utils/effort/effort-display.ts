// Effort display utility for UI
// Phase 1 — Foundation

import { minutesToDisplay, displayToMinutes, validateEffortInput } from "./minutes-converter";

export type EffortUnit = "minutes" | "hours" | "days";

export interface EffortState {
  minutes: number; // always stored as minutes
  unit: EffortUnit; // UI display unit
  display: string; // e.g. "2 hr", "30 min", "0.5 day"
}

export function initEffort(minutes: number, unit: EffortUnit = "hours"): EffortState {
  const { valid, minutes: m, display: d } = validateEffortInput(minutes, unit);
  return {
    minutes: valid ? m : 0,
    unit,
    display: d,
  };
}

export function updateEffort(
  current: EffortState,
  deltaMinutes: number,
  unit: EffortUnit = "hours"
): EffortState {
  const newMinutes = current.minutes + deltaMinutes;
  return initEffort(newMinutes, unit);
}

export function formatEffortForPayload(state: EffortState): number {
  // Always send minutes to backend
  return state.minutes;
}