// Batches engine schedule events (contract §5.2, §16 T-040).
// The website waits 350 ms before applying schedule_update bursts.

import { useTasksStore } from "../store/tasksStore";
import type { TaskEntity } from "../types/task.types";

export type SchedulePatch = {
  start_date?: string | null;
  due_date?: string | null;
  effort_hours?: number;
  remaining_effort_hours?: number;
};

const BATCH_DELAY_MS = 350;
const UNKNOWN_HOLD_MS = 5_000;

const pending = new Map<number, SchedulePatch>();
let timer: ReturnType<typeof setTimeout> | null = null;

function mergePatch(current: SchedulePatch | undefined, next: SchedulePatch): SchedulePatch {
  return { ...current, ...next };
}

function applyPatch(taskId: number, patch: SchedulePatch): boolean {
  const state = useTasksStore.getState();
  if (!state.byId[taskId]) return false;

  const entityPatch: Partial<TaskEntity> & {
    remaining_effort_hours?: number;
  } = {};
  if (patch.start_date !== undefined) entityPatch.start_date = patch.start_date;
  if (patch.due_date !== undefined) entityPatch.due_date = patch.due_date;
  if (patch.effort_hours !== undefined) entityPatch.effort_hours = patch.effort_hours;
  if (patch.remaining_effort_hours !== undefined) {
    entityPatch.remaining_effort_hours = patch.remaining_effort_hours;
  }

  state.patchTask(taskId, entityPatch);
  return true;
}

function flush() {
  timer = null;
  const entries = [...pending.entries()];
  pending.clear();

  for (const [taskId, patch] of entries) {
    if (applyPatch(taskId, patch)) continue;

    // The row was not loaded yet (create/schedule race). Hold it briefly.
    setTimeout(() => {
      applyPatch(taskId, patch);
    }, UNKNOWN_HOLD_MS);
  }
}

export function enqueueScheduleUpdate(taskId: number, patch: SchedulePatch): void {
  if (!Number.isFinite(taskId) || taskId <= 0) return;
  pending.set(taskId, mergePatch(pending.get(taskId), patch));
  if (timer) return;
  timer = setTimeout(flush, BATCH_DELAY_MS);
}

/** Apply a held schedule patch immediately (used after a create event). */
export function flushScheduleForTask(taskId: number): void {
  const patch = pending.get(taskId);
  if (!patch) return;
  pending.delete(taskId);
  applyPatch(taskId, patch);
}

export function resetScheduleBatcher(): void {
  pending.clear();
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

