// Task filters store
// Phase 1 — Foundation
// Zustand store for active tab, filters, search, pagination

import create from "zustand";
import { TaskTabId, taskTabs, tabLabels } from "../constants/taskTabs";
import { TaskStatus, TaskPriority } from "../types/task.types";

interface FiltersState {
  activeTab: TaskTabId;
  searchQuery: string;
  filterStatus: TaskStatus | null;
  filterPriority: TaskPriority | null;
  filterAssignee: number | null;
  page: number;
  resetOnTabChange: boolean;
}

const initialState: FiltersState = {
  activeTab: "all",
  searchQuery: "",
  filterStatus: null,
  filterPriority: null,
  filterAssignee: null,
  page: 1,
  resetOnTabChange: true,
};

export type FiltersStore = ReturnType<typeof filtersStore>;

export const filtersStore = create<FiltersState>((set) => ({
  ...initialState,

  setActiveTab: (tab: TaskTabId) =>
    set({ activeTab: tab, page: 1, searchQuery: "", filterStatus: null, filterPriority: null }),

  setSearchQuery: (query: string) => set({ searchQuery: query }),

  setFilterStatus: (status: TaskStatus | null) => set({ filterStatus: status }),

  setFilterPriority: (priority: TaskPriority | null) => set({ filterPriority: priority }),

  setFilterAssignee: (id: number | null) => set({ filterAssignee: id }),

  nextPage: () => set({ page: (state) => state.page + 1 }),

  prevPage: () => set({ page: (state) => Math.max(1, state.page - 1) }),

  reset: () => set(initialState),
}));