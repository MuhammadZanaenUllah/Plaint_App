// Canonical Task Module constants.
// Components must stop hard-coding these values; Phases 2-9 consume them.

import type {
  CanonicalTaskStatus,
  RecurringPeriod,
  TaskFilter,
  TaskPriorityLevel,
  TaskStatus,
} from "../types/task.types";

export const PKT_OFFSET_MINUTES = 5 * 60; // UTC+05:00
export const PKT_OFFSET_MS = PKT_OFFSET_MINUTES * 60_000;
export const PKT_TIMEZONE = "Asia/Karachi";

export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024; // 30 MB per contract
export const ALLOWED_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "pdf",
  "doc",
  "docx",
  "csv",
  "txt",
  "zip",
  "rar",
  "sql",
  "ppt",
  "xls",
  "xlsx",
  "svg",
  "webp",
  "avif",
] as const;

export const MINUTES_PER_HOUR = 60;
// The backend converts days as 8 working hours (contract §8.6 / /extend-delayed).
export const MINUTES_PER_DAY = 8 * 60;

export const TASK_STATUSES: CanonicalTaskStatus[] = [
  "Pending",
  "In-Progress",
  "On-Hold",
  "Pending-Approval",
  "Rejected",
  "Complete",
  "Partial Complete",
  "Abandoned",
];

export const CREATE_STATUSES: TaskStatus[] = [
  "Pending",
  "In-Progress",
  "On-Hold",
  "Complete",
];

export const STATUS_PICKER_VALUES: TaskStatus[] = [
  "Pending",
  "In-Progress",
  "On-Hold",
  "Complete",
  "Partial Complete",
];

export const LIST_FILTER_STATUSES: TaskStatus[] = [
  "Pending",
  "In-Progress",
  "On-Hold",
  "Complete",
];

export const PRIORITY_VALUES: TaskPriorityLevel[] = ["normal", "critical"];

// "semiannually" is the backend spelling. Do not send "semi-annually".
export const RECURRING_PERIODS: RecurringPeriod[] = [
  "daily",
  "weekly",
  "monthly",
  "annually",
  "quarterly",
  "semiannually",
];

export const EFFORT_UNITS = ["minutes", "hours", "days"] as const;
export type EffortUnit = (typeof EFFORT_UNITS)[number];

export const TASK_FILTERS: TaskFilter[] = [
  "delayed",
  "due_in_7_days",
  "created_by_me",
  "assigned_to_me",
  "pending_approval",
  "recurring",
  "complete",
];

export const TASK_FILTER_DEFAULTS = {
  activeTab: "today" as const,
  searchQuery: "",
  status: null as TaskStatus | null,
  priority: null as TaskPriorityLevel | null,
  createdBy: [] as number[],
  assignedTo: [] as number[],
  dueFrom: null as string | null,
  dueTo: null as string | null,
  page: 1,
};

export const STATUS_COLORS: Record<TaskStatus, { bg: string; fg: string }> = {
  Pending: { bg: "#FEF3C7", fg: "#D97706" },
  "In-Progress": { bg: "#DBEAFE", fg: "#2563EB" },
  "On-Hold": { bg: "#FFEDD5", fg: "#C2410C" },
  "On Hold": { bg: "#FFEDD5", fg: "#C2410C" },
  Complete: { bg: "#D1FAE5", fg: "#059669" },
  Completed: { bg: "#D1FAE5", fg: "#059669" },
  "Pending-Approval": { bg: "#EDE9FE", fg: "#7C3AED" },
  Rejected: { bg: "#FEE2E2", fg: "#DC2626" },
  Recurring: { bg: "#E0E7FF", fg: "#4338CA" },
  "Partial Complete": { bg: "#CFFAFE", fg: "#0E7490" },
  Abandoned: { bg: "#E5E7EB", fg: "#4B5563" },
};

export const STATUS_DISPLAY: Record<TaskStatus, string> = {
  Pending: "Pending",
  "In-Progress": "In Progress",
  "On-Hold": "On Hold",
  "On Hold": "On Hold",
  Complete: "Completed",
  Completed: "Completed",
  "Pending-Approval": "Pending Approval",
  Rejected: "Rejected",
  Recurring: "Recurring",
  "Partial Complete": "Partial Complete",
  Abandoned: "Abandoned",
};

/** Legacy alias kept for existing imports. Prefer TASK_STATUSES. */
export const ALL_STATUSES: TaskStatus[] = [
  "Pending",
  "In-Progress",
  "On-Hold",
  "Complete",
  "Pending-Approval",
  "Rejected",
  "Partial Complete",
  "Abandoned",
  "Recurring",
];
