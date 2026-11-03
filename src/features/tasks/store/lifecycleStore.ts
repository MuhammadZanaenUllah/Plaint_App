// Task store lifecycle
// Phase 1 — Foundation
// Reset stores on logout or company change

import { tasksStore } from "./tasksStore";
import { filtersStore } from "./filtersStore";
import { uiStore } from "./uiStore";
import { selectorsStore } from "./selectorsStore";

export const taskLifecycle = {
  // Reset all task stores on company change or logout
  resetOnCompanyChange: () => {
    tasksStore.getState().resetOnCompanyChange();
    filtersStore.getState().reset();
    uiStore.getState().reset();
    selectorsStore.getState().reset();
  },

  // Reset on auth logout
  resetOnLogout: () => {
    tasksStore.getState().resetOnCompanyChange();
    // Clear any socket pending patches, etc.
  },

  // Subscribe to auth state changes for auto-reset
  subscribe: (authStore: any, callback: () => void) => {
    // In real implementation, subscribe to AuthContext changes
    // and call callback.resetOnCompanyChange() when company changes
    return () => {};
  },
};