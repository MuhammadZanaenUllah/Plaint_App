// Task status constants
// Phase 1 — Foundation

import { TaskStatus } from "../types/task.types";

export const STATUS_COLORS: Record<TaskStatus, { bg: string; fg: string }> = {
  Pending: { bg: "#FEF3C7", fg: "#D97706" },
  "In-Progress": { bg: "#DBEAFE", fg: "#2563EB" },
  "On-Hold": { bg: "#FFEDD5", fg: "#C2410C" },
  Complete: { bg: "#D1FAE5", fg: "#059669" },
  "Pending-Approval": { bg: "#EDE9FE", fg: "#7C3AED" },
  Rejected: { bg: "#FEE2E2", fg: "#DC2626" },
};

export const STATUS_DISPLAY: Record<TaskStatus, string> = {
  Pending: "Pending",
  "In-Progress": "In Progress",
  "On-Hold": "On Hold",
  Complete: "Completed",
  "Pending-Approval": "Pending Approval",
  Rejected: "Rejected",
};

export const ALL_STATUSES: TaskStatus[] = [
  "Pending",
  "In-Progress",
  "On-Hold",
  "Complete",
  "Pending-Approval",
  "Rejected",
];