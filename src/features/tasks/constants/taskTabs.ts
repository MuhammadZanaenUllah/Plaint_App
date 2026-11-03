// Task dashboard tab definitions.

export const taskTabs = {
  all: "all",
  today: "today",
  week: "week",
  overdue: "overdue",
  created: "created",
  assigned: "assigned",
  pendingApproval: "pendingApproval",
  recurring: "recurring",
  completed: "completed",
} as const;

export type TaskTabKey = keyof typeof taskTabs;
export type TaskTabId = (typeof taskTabs)[TaskTabKey];

export type TaskTabDefinition = {
  id: TaskTabId;
  label: string;
};

export const TASK_TABS: TaskTabDefinition[] = [
  { id: "all", label: "All Tasks" },
  { id: "today", label: "Due Today" },
  { id: "week", label: "Due in 7 Days" },
  { id: "overdue", label: "Delayed" },
  { id: "created", label: "Created by Me" },
  { id: "assigned", label: "Assigned to Me" },
  { id: "pendingApproval", label: "Pending Approval" },
  { id: "recurring", label: "Recurring" },
  { id: "completed", label: "Completed" },
];

export const tabLabels: Record<TaskTabId, string> = TASK_TABS.reduce(
  (acc, tab) => {
    acc[tab.id] = tab.label;
    return acc;
  },
  {} as Record<TaskTabId, string>,
);

export const DEFAULT_TASK_TAB: TaskTabId = "today";
