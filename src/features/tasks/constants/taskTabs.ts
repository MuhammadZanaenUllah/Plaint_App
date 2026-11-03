// Task tab definitions for dashboard
// Phase 1 — Foundation

export const taskTabs = {
  all: "all" as const,
  today: "today" as const,
  week: "week" as const,
  overdue: "overdue" as const,
  created: "created" as const,
  assigned: "assigned" as const,
  pendingApproval: "pendingApproval" as const,
  recurring: "recurring" as const,
  completed: "completed" as const,
} as const;

export type TaskTabKey = keyof typeof taskTabs;

export type TaskTabId =
  | "all"
  | "today"
  | "week"
  | "overdue"
  | "created"
  | "assigned"
  | "pendingApproval"
  | "recurring"
  | "completed";

export const tabLabels: Record<TaskTabId, string> = {
  all: "All Tasks",
  today: "Due Today",
  week: "Due in 7 Days",
  overdue: "Delayed",
  created: "Created by Me",
  assigned: "Assigned to Me",
  pendingApproval: "Pending Approval",
  recurring: "Recurring",
  completed: "Completed",
};

export const tabRules: Record<TaskTabId, "include" | "exclude" | "conditional"> = {
  all: "include",
  today: "include",
  week: "include",
  overdue: "include",
  created: "include",
  assigned: "include",
  pendingApproval: "include",
  recurring: "include",
  completed: "include",
};