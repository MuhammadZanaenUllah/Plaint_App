// Effort conversion utilities (minutes ↔ display units)
// Phase 1 — Foundation

// Convert stored minutes to display format
export function minutesToDisplay(minutes: number, unit: "minutes" | "hours" | "days"): string {
  if (unit === "minutes") return `${minutes} min`;
  if (unit === "hours") {
    const hours = minutes / 60;
    if (hours % 1 === 0) return `${hours} hr`;
    return `${minutes / 60} hr`;
  }
  if (unit === "days") {
    const days = minutes / (60 * 24);
    if (days % 1 === 0) return `${days} day`;
    return `${(minutes / (60 * 24)).toFixed(1)} day`;
  }
  return `${minutes} min`;
}

// Convert display value to stored minutes
export function displayToMinutes(value: string | number, unit: "minutes" | "hours" | "days"): number {
  const val = typeof value === "string" ? parseFloat(value) : value;
  if (unit === "minutes") return Math.round(val);
  if (unit === "hours") return Math.round(val * 60);
  if (unit === "days") return Math.round(val * 60 * 24);
  return Math.round(val);
}

// Validate effort unit and value
export function validateEffortInput(
  value: number | string,
  unit: "minutes" | "hours" | "days"
): { valid: boolean; minutes: number; display: string } {
  const minutes = displayToMinutes(value, unit);
  const display = minutesToDisplay(minutes, unit);
  return {
    valid: minutes >= 0,
    minutes,
    display,
  };
}