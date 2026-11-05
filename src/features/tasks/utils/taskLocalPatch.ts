// Pure local-update helper for the legacy TaskContext facade (AUD-001).
// IMPORTANT: `assign_to` is the DOER. `assignee` is the CREATOR (contract §2.6)
// and must never be overwritten by an update payload.

import { toApiStatus } from "./taskStatus";

export type LocalTaskUpdate = {
  title?: string;
  due_date?: string | null;
  priority?: number;
  status?: string;
  description?: string;
  is_recurring?: boolean;
  approval_required?: number;
  effort_hours?: number;
  effort_unit?: string;
  task_priority?: "normal" | "critical";
  assign_to?: number;
  project_id?: number | null;
};

export function applyLocalTaskUpdate<T extends { id: number }>(
  task: T,
  update: LocalTaskUpdate,
): T {
  const next = { ...task } as Record<string, unknown>;

  if (update.title !== undefined) next.title = update.title;
  if (update.due_date !== undefined && update.due_date !== null) {
    next.due_date = update.due_date;
  }
  if (update.priority !== undefined) next.priority = update.priority;
  if (update.status !== undefined) {
    next.status = toApiStatus(update.status);
  }
  if (update.description !== undefined) next.description = update.description;
  if (update.is_recurring !== undefined) next.is_recurring = update.is_recurring;
  if (update.approval_required !== undefined) {
    next.approval_required = update.approval_required;
  }
  if (update.effort_hours !== undefined) next.effort_hours = update.effort_hours;
  if (update.effort_unit !== undefined) next.effort_unit = update.effort_unit;
  if (update.task_priority !== undefined) {
    next.task_priority = update.task_priority;
  }
  // Doer only. Keep the existing creator (`assignee`) untouched.
  if (update.assign_to !== undefined) next.asigned_to = update.assign_to;
  if (update.project_id !== undefined && update.project_id !== null) {
    next.project_id = update.project_id;
  }

  return next as T;
}
