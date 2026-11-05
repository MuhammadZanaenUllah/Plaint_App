// Effort-history presentation (contract §3.6 / §11).
// The API gives each entry's `value` in minutes and an action. Extension and
// rejection rows are additive deltas; the other actions set the new total.
// Build a before/delta/after row so the detail can render the change clearly.

export type EffortHistoryLike = {
  value?: number | string | null;
  unit?: string | null;
  action?: string | null;
  from_status?: string | null;
  to_status?: string | null;
  changed_at?: string | null;
};

export type EffortHistoryRow = {
  before: number;
  delta: number;
  after: number;
  unit: string;
  action: string;
  fromStatus: string;
  toStatus: string;
  changedAt: string;
};

const ADDITIVE_ACTIONS = new Set(["delay_extension", "rejection"]);

export function buildEffortHistoryRows(
  entries: EffortHistoryLike[],
): EffortHistoryRow[] {
  const sorted = entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const aTime = a.entry.changed_at
        ? new Date(a.entry.changed_at).getTime()
        : NaN;
      const bTime = b.entry.changed_at
        ? new Date(b.entry.changed_at).getTime()
        : NaN;
      if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
        return aTime - bTime;
      }
      return a.index - b.index;
    })
    .map(({ entry }) => entry);

  let running = 0;
  return sorted.map((entry) => {
    const value = Number(entry.value ?? 0);
    const numeric = Number.isFinite(value) ? Math.max(0, value) : 0;
    const action = String(entry.action ?? "update");
    const additive = ADDITIVE_ACTIONS.has(action);
    const before = additive ? running : 0;
    const after = additive ? running + numeric : numeric;
    running = after;
    return {
      before,
      delta: after - before,
      after,
      unit: entry.unit || "hours",
      action,
      fromStatus: entry.from_status ?? "",
      toStatus: entry.to_status ?? "",
      changedAt: entry.changed_at ?? "",
    };
  });
}
