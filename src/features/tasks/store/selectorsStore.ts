// Task selectors store
// Phase 1 — Foundation
// Memoized computed values derived from tasks store

import create from "zustand";
import { TaskListItem, TaskStatus, TaskPriority } from "../types/task.types";
import { TaskTabId } from "../constants/taskTabs";

interface SelectorsState {
  // Filtered tasks based on active filters
  filteredTasks: TaskListItem[];

  // Computed counts per tab
  tabCounts: Record<TaskTabId, number>;

  // Search highlight
  searchMatches: TaskListItem[];

  // Quick stats
  totalCount: number;
  dueTodayCount: number;
  completeCount: number;
  pendingApprovalCount: number;
  recurringCount: number;

  // Active filter values
  activeTab: TaskTabId;
  searchQuery: string;
}

const initialState: SelectorsState = {
  filteredTasks: [],
  tabCounts: {
    all: 0,
    today: 0,
    week: 0,
    overdue: 0,
    created: 0,
    assigned: 0,
    pendingApproval: 0,
    recurring: 0,
    completed: 0,
  },
  searchMatches: [],
  totalCount: 0,
  dueTodayCount: 0,
  completeCount: 0,
  pendingApprovalCount: 0,
  recurringCount: 0,
  activeTab: "all",
  searchQuery: "",
};

export type SelectorsStore = ReturnType<typeof selectorsStore>;

export const selectorsStore = create<SelectorsState>((set) => ({
  ...initialState,

  // Update filtered tasks based on current state
  updateFilteredTasks: (tasks: TaskListItem[], state: any) => {
    const { activeTab, searchQuery, filterStatus, filterPriority, filterAssignee } = state || {};

    let result = [...tasks];

    // Filter by tab
    if (activeTab) {
      // Simple tab filtering - in production would use proper PKT rules
      if (activeTab === "today") {
        result = result.filter((t) => /* due today PKT check */ true);
      } else if (activeTab === "overdue") {
        result = result.filter((t) => /* overdue PKT check */ true);
      } else if (activeTab === "completed") {
        result = result.filter((t) => t.status === "Complete");
      }
      // ... other tabs
    }

    // Filter by search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description?.toLowerCase().includes(q) ?? false) ||
          (t.assignee?.full_name?.toLowerCase().includes(q) ?? false) ||
          (t.created_by?.toString().includes(q) ?? false)
      );
    }

    // Filter by status
    if (filterStatus) {
      result = result.filter((t) => t.status === filterStatus);
    }

    // Filter by priority
    if (filterPriority) {
      result = result.filter((t) => t.priority === filterPriority);
    }

    set({ filteredTasks: result });
  },

  // Update tab counts
  updateTabCounts: (tasks: TaskListItem[], tabCounts: Record<TaskTabId, number>) =>
    set({ tabCounts }),

  // Update search matches
  setSearchMatches: (matches: TaskListItem[]) => set({ searchMatches: matches }),

  // Set active tab and reset
  setActiveTab: (tab: TaskTabId) => set({ activeTab: tab, searchQuery: "" }),

  // Set search query
  setSearchQuery: (query: string) => set({ searchQuery: query }),

  // Get total count
  getTotalCount: (tasks: TaskListItem[]) => tasks.length,

  // Get due today count (placeholder - would use PKT logic)
  getDueTodayCount: (tasks: TaskListItem[], serverTimePKT: string) => {
    // Placeholder - actual implementation uses pkt-date-formatter
    return tasks.filter((t) => /* isDueTodayPKT(t.due_date, serverTimePKT) */ true).length;
  },

  // Get complete count
  getCompleteCount: (tasks: TaskListItem[]) =>
    tasks.filter((t) => t.status === "Complete").length,

  // Get pending approval count
  getPendingApprovalCount: (tasks: TaskListItem[]) =>
    tasks.filter((t) => t.status === "Pending-Approval").length,

  // Get recurring count
  getRecurringCount: (tasks: TaskListItem[]) =>
    tasks.filter((t) => t.is_recurring).length,
}));