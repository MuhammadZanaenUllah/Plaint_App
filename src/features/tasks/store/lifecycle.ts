// Task store lifecycle shared by TaskContext and Auth logout.

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
