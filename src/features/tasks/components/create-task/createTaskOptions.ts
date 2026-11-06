// Create-task field options shared by the extracted field components (AUD-081).
// Values are moved verbatim from CreateTaskModal to avoid behavior changes.

import {
  CREATE_STATUSES,
  STATUS_COLORS,
  STATUS_DISPLAY,
} from "@/features/tasks/constants/taskConstants";
import type { TaskPriorityLevel } from "@/features/tasks/types/task.types";

export type EffortUnit = "minutes" | "hours" | "days";

export type CreateTaskActivePanel =
  | "assigned"
  | "dueDate"
  | "priority"
  | "approval"
  | "status"
  | "recurring"
  | null;

// Advanced Task Module effort/duration unit — matches the web app's
// Minutes/Hours/Days switcher on the "Hrs" chip.
export const EFFORT_UNITS: { value: EffortUnit; label: string; abbrev: string }[] = [
  { value: "minutes", label: "Minutes", abbrev: "Min" },
  { value: "hours", label: "Hours", abbrev: "Hrs" },
  { value: "days", label: "Days", abbrev: "Days" },
];

export const PRIORITY_OPTIONS: {
  value: TaskPriorityLevel;
  label: string;
  dot: string;
}[] = [
  { value: "normal", label: "Normal", dot: "#0DDFAB" },
  { value: "critical", label: "Critical", dot: "#FF4444" },
];

// Contract §3.8: create accepts only Pending, In-Progress, On-Hold or Complete.
// Recurring is a template flag, not a status; Rejected/Pending-Approval are
// server-driven transitions, not create-time choices.
export const STATUSES = CREATE_STATUSES.map((status) => ({
  value: status,
  label: STATUS_DISPLAY[status] ?? status,
  color: STATUS_COLORS[status]?.fg ?? "#00DFAB",
}));
