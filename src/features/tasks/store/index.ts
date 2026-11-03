// Task Store — re-exports for @/features/tasks/store import
// Phase 1 — Foundation
// No circular dependency on TaskContext — useTasksCompatibility is exported
// directly from TaskContext.tsx. This store provides the Zustand task state.

// Re-exports from the tasksStore (the actual Zustand store)
export { useTasks } from "./tasksStore";
export { tasksStore } from "./tasksStore";
// useTasksCompatibility is exported from TaskContext.tsx, not from here,
// to avoid circular dependency: store ↔ context
// export { useTasksCompatibility } from "../context/TaskContext";  // REMOVED

export { taskLifecycle } from "./lifecycleStore";
export { filtersStore } from "./filtersStore";
export { uiStore } from "./uiStore";
export { selectorsStore } from "./selectorsStore";
export { projectsStore } from "./projectsStore";