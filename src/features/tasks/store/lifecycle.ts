// Task store lifecycle. Wire into TaskContext/Auth logout in Phase 2.
// Phase 1 only defines the reset helper.

import { useTaskDetailStore } from "./taskDetailStore";
import { useTaskFiltersStore } from "./taskFiltersStore";
import { useProjectsStore } from "./projectsStore";
import { useTasksStore } from "./tasksStore";
import { useTaskUiStore } from "./taskUiStore";

export function resetTaskStores(): void {
  useTasksStore.getState().reset();
  useTaskDetailStore.getState().clear();
  useTaskFiltersStore.getState().reset();
  useTaskUiStore.getState().reset();
  useProjectsStore.getState().reset();
}

/** Alias kept for the plan's store API. */
export const resetTaskModuleStores = resetTaskStores;
