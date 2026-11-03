// Compatibility re-export. Selectors are pure functions in selectors.ts.
import { useTasksStore } from "./tasksStore";

export * from "./selectors";

// Phase 1 keeps a no-op store alias for code that still imports selectorsStore.
export const useSelectorsStore = useTasksStore;
export const selectorsStore = useTasksStore;