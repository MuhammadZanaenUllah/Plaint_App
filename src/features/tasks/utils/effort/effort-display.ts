// Compatibility helpers for effort state. Canonical logic lives in ../taskEffort.ts.
import { formatEffort, toMinutes, toEffortPayload, type EffortUnit } from "../taskEffort";

export type { EffortUnit } from "../taskEffort";

export interface EffortState {
  minutes: number; // always minutes
  unit: EffortUnit; // display unit
  display: string;
}

export function initEffort(minutes: number, unit: EffortUnit = "hours"): EffortState {
  const value = Math.max(0, toMinutes(minutes, "minutes"));
  return { minutes: value, unit, display: formatEffort(value, unit) };
}

export function updateEffort(
  current: EffortState,
  deltaMinutes: number,
  unit: EffortUnit = current.unit,
): EffortState {
  return initEffort(current.minutes + deltaMinutes, unit);
}

/** Always returns minutes, which is what the API expects. */
export function formatEffortForPayload(state: EffortState): number {
  return toEffortPayload(state.minutes);
}
