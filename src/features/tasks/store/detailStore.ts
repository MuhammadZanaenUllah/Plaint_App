// Task detail store
// Phase 1 — Foundation
// Zustand store for open task detail, notes, dependencies, effort history

import create from "zustand";
import { TaskListItem, ViewTaskData } from "../types/task.types";
import { parseApiResponse, extractError } from "../api/error-extractor";

interface DetailState {
  task: ViewTaskData | null;
  isLoading: boolean;
  error?: string;
  notes_loading: boolean;
  dependencies_loading: boolean;
  effort_history_loading: boolean;
}

const initialState: DetailState = {
  task: null,
  isLoading: false,
  error: undefined,
  notes_loading: false,
  dependencies_loading: false,
  effort_history_loading: false,
};

export type DetailStore = ReturnType<typeof detailStore>;

export const detailStore = create<DetailState>((set) => ({
  ...initialState,

  loadTask: async (taskId: number) => {
    set({ isLoading: true, error: undefined });
    try {
      const data = await apiGet<ViewTaskData>(`/tasks/view/${taskId}`, {});
      const { body, good } = parseApiResponse(/* dummy response */ {});
      // In real usage, the apiGet wrapper would handle this
      set({ task: data, isLoading: false });
    } catch (err: any) {
      set({ error: extractError(err.message), isLoading: false });
    }
  },

  clearDetail: () => set({ ...initialState, task: null }),
}));