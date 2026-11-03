// Task Module stores.
// Phase 1 scaffolding: these stores compile and reset, but no screen consumes
// them yet. `TaskContext` remains the Chat compatibility facade.

export { useTasksStore, tasksStore } from "./tasksStore";
export type { TasksState, TaskBucket } from "./tasksStore";

export { useTaskDetailStore, taskDetailStore } from "./taskDetailStore";
export type { DetailState } from "./taskDetailStore";

export { useTaskFiltersStore, filtersStore } from "./taskFiltersStore";
export type { TaskFiltersState } from "./taskFiltersStore";

export { useTaskUiStore, uiStore } from "./taskUiStore";
export type { TaskUiState } from "./taskUiStore";

export { useProjectsStore, projectsStore } from "./projectsStore";
export type { ProjectsState } from "./projectsStore";

export * from "./selectors";
export { resetTaskStores, resetTaskModuleStores } from "./lifecycle";
