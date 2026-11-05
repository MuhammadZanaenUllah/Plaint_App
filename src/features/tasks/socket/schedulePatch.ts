// Pure schedule_update patch helpers (contract §5.2, AUD-002).
// A schedule event may carry only some keys. Build and merge patches from the
// keys that are actually present (including explicit nulls) so an absent key
// never overwrites an earlier value inside the 350 ms batch window.

export type SchedulePatch = {
  start_date?: string | null;
  due_date?: string | null;
  effort_hours?: number;
  remaining_effort_hours?: number;
};

const SCHEDULE_KEYS: (keyof SchedulePatch)[] = [
  "start_date",
  "due_date",
  "effort_hours",
  "remaining_effort_hours",
];

export function buildSchedulePatch(
  input: Record<string, unknown>,
): SchedulePatch {
  const patch: SchedulePatch = {};
  if (input.start_date !== undefined) {
    patch.start_date = (input.start_date as string | null) ?? null;
  }
  if (input.due_date !== undefined) {
    patch.due_date = (input.due_date as string | null) ?? null;
  }
  if (input.effort_hours !== undefined) {
    patch.effort_hours = Number(input.effort_hours);
  }
  if (input.remaining_effort_hours !== undefined) {
    patch.remaining_effort_hours = Number(input.remaining_effort_hours);
  }
  return patch;
}

/** Merge only defined values; explicit null is a real value and is kept. */
export function mergeSchedulePatch(
  current: SchedulePatch | undefined,
  next: SchedulePatch,
): SchedulePatch {
  const merged: SchedulePatch = { ...(current ?? {}) };
  for (const key of SCHEDULE_KEYS) {
    if (next[key] !== undefined) {
      (merged as Record<string, unknown>)[key] = next[key];
    }
  }
  return merged;
}
