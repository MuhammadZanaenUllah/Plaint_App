// Task dashboard filter/search/tab state.

import { create } from "zustand";
import { TASK_FILTER_DEFAULTS, type EffortUnit } from "../constants/taskConstants";
import { DEFAULT_TASK_TAB, type TaskTabId } from "../constants/taskTabs";
import type { TaskPriorityLevel, TaskStatus } from "../types/task.types";

export type TaskFiltersState = {
  activeTab: TaskTabId;
  searchQuery: string;
  status: TaskStatus | null;
  priority: TaskPriorityLevel | null;
  createdBy: number[];
  assignedTo: number[];
  dueFrom: string | null;
  dueTo: string | null;
  page: number;
  filterModalVisible: boolean;
  // Future form state (kept here so modals can share it).
  effortUnit: EffortUnit;

  setActiveTab: (tab: TaskTabId) => void;
  setSearchQuery: (query: string) => void;
  setStatus: (status: TaskStatus | null) => void;
  setPriority: (priority: TaskPriorityLevel | null) => void;
  setCreatedBy: (ids: number[]) => void;
  setAssignedTo: (ids: number[]) => void;
  setDueRange: (from: string | null, to: string | null) => void;
  setPage: (page: number) => void;
  setFilterModalVisible: (visible: boolean) => void;
  setEffortUnit: (unit: EffortUnit) => void;
  resetFilters: () => void;
  reset: () => void;
};

const initialState = {
  activeTab: DEFAULT_TASK_TAB,
  searchQuery: TASK_FILTER_DEFAULTS.searchQuery,
  status: TASK_FILTER_DEFAULTS.status,
  priority: TASK_FILTER_DEFAULTS.priority,
  createdBy: [...TASK_FILTER_DEFAULTS.createdBy],
  assignedTo: [...TASK_FILTER_DEFAULTS.assignedTo],
  dueFrom: TASK_FILTER_DEFAULTS.dueFrom,
  dueTo: TASK_FILTER_DEFAULTS.dueTo,
  page: TASK_FILTER_DEFAULTS.page,
  filterModalVisible: false,
  effortUnit: "hours" as EffortUnit,
};

export const useTaskFiltersStore = create<TaskFiltersState>()((set) => ({
  ...initialState,

  setActiveTab: (tab) => set({ activeTab: tab, page: 1 }),
  setSearchQuery: (query) => set({ searchQuery: query, page: 1 }),
  setStatus: (status) => set({ status, page: 1 }),
  setPriority: (priority) => set({ priority, page: 1 }),
  setCreatedBy: (createdBy) => set({ createdBy, page: 1 }),
  setAssignedTo: (assignedTo) => set({ assignedTo, page: 1 }),
  setDueRange: (dueFrom, dueTo) => set({ dueFrom, dueTo, page: 1 }),
  setPage: (page) => set({ page: Math.max(1, page) }),
  setFilterModalVisible: (filterModalVisible) => set({ filterModalVisible }),
  setEffortUnit: (effortUnit) => set({ effortUnit }),
  resetFilters: () =>
    set({
      searchQuery: "",
      status: null,
      priority: null,
      createdBy: [],
      assignedTo: [],
      dueFrom: null,
      dueTo: null,
      page: 1,
      filterModalVisible: false,
    }),
  reset: () => set({ ...initialState }),
}));

export const filtersStore = useTaskFiltersStore;
