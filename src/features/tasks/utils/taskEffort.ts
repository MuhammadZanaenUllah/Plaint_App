// Effort conversion utilities.
// The backend stores MINUTES. `effort_unit` is display-only.
// Days convert as 8 working hours (contract §8.6).

import {
  EFFORT_UNITS,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  type EffortUnit,
} from "../constants/taskConstants";

export { EFFORT_UNITS, type EffortUnit };

function finiteOrZero(value: number | string): number {
  const numeric = typeof value === "string" ? Number.parseFloat(value) : value;
  return Number.isFinite(numeric) ? numeric : 0;
}

export function toMinutes(value: number | string, unit: EffortUnit = "hours"): number {
  const numeric = finiteOrZero(value);
  switch (unit) {
    case "minutes":
      return Math.round(numeric);
    case "days":
      return Math.round(numeric * MINUTES_PER_DAY);
    case "hours":
    default:
      return Math.round(numeric * MINUTES_PER_HOUR);
  }
}

export function fromMinutes(minutes: number, unit: EffortUnit = "hours"): number {
  const numeric = finiteOrZero(minutes);
  switch (unit) {
    case "minutes":
      return numeric;
    case "days":
      return numeric / MINUTES_PER_DAY;
    case "hours":
    default:
      return numeric / MINUTES_PER_HOUR;
  }
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Human-readable effort. Under 60 minutes is shown in minutes (Q-BE-05). */
export function formatEffort(minutes: number, unit: EffortUnit = "hours"): string {
  const value = finiteOrZero(minutes);
  if (value <= 0) return "—";
  if (unit === "minutes" || value < MINUTES_PER_HOUR) {
    return `${Math.round(value)} min`;
  }
  if (unit === "days") {
    const days = value / MINUTES_PER_DAY;
    return `${trimNumber(days)} ${days === 1 ? "day" : "days"}`;
  }
  const hours = value / MINUTES_PER_HOUR;
  return `${trimNumber(hours)} hr`;
}

export const displayEffort = formatEffort;

export function clampEffort(minutes: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  return Math.min(max, Math.max(min, finiteOrZero(minutes)));
}

/** The only correct value to put in a payload `effort_hours`. */
export function toEffortPayload(minutes: number): number {
  return clampEffort(Math.round(finiteOrZero(minutes)));
}

// ---- Legacy function names used by the current UI ----

export function minutesToDisplay(minutes: number, unit: EffortUnit = "hours"): string {
  return formatEffort(minutes, unit);
}

export function displayToMinutes(value: string | number, unit: EffortUnit = "hours"): number {
  return toMinutes(value, unit);
}

export function validateEffortInput(
  value: number | string,
  unit: EffortUnit = "hours",
): { valid: boolean; minutes: number; display: string } {
  const minutes = toMinutes(value, unit);
  return { valid: minutes >= 0, minutes, display: formatEffort(minutes, unit) };
}
