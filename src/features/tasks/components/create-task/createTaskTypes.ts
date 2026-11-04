import type { SelectedFile } from "@/features/attachments/types/attachment.types";
import {
  CREATE_STATUSES,
  EFFORT_UNITS,
  STATUS_COLORS,
  type EffortUnit,
} from "@/features/tasks/constants/taskConstants";
import type {
  RecurringPeriod,
  TaskPriorityLevel,
} from "@/features/tasks/types/task.types";

export type CreateTaskFormState = {
  title: string;
  description: string;
  assignTo: number | null;
  assignName: string;
  dueDate: Date | null;
  effortValue: string;
  effortUnit: EffortUnit;
  taskPriority: TaskPriorityLevel;
  status: string;
  approvalRequired: boolean;
  isRecurring: boolean;
  recurringPeriod: RecurringPeriod | null;
  recurringTime: string;
  recurringTotalCount: string;
  recurringExcludeDays: string[];
  recurringWeekDay: string | null;
  recurringMonthDate: string;
  recurringAnnualMonth: string;
  recurringAnnualDate: string;
  projectId: number | null;
  sprintId: number | null;
  parentId: number;
  dependsOn: number[];
  attachments: SelectedFile[];
};

export type CreateTaskPayloadContext = {
  companyId: number;
  companyIdentifier: string;
  isAts: boolean;
};

export type CreateTaskValidationResult = {
  valid: boolean;
  errors: Record<string, string>;
  message?: string;
};

export const RECURRING_PERIOD_OPTIONS: {
  value: RecurringPeriod;
  label: string;
}[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "annually", label: "Annually" },
];

export const CREATE_STATUS_OPTIONS = CREATE_STATUSES.map((status) => ({
  value: status,
  label: status,
  color: STATUS_COLORS[status]?.fg ?? "#00DFAB",
}));

export const PRIORITY_OPTIONS: {
  value: TaskPriorityLevel;
  label: string;
  dot: string;
}[] = [
  { value: "normal", label: "Normal", dot: "#0DDFAB" },
  { value: "critical", label: "Critical", dot: "#FF4444" },
];

export const EFFORT_UNIT_OPTIONS = EFFORT_UNITS.map((unit) => ({
  value: unit,
  label: unit.charAt(0).toUpperCase() + unit.slice(1),
  abbrev: unit === "minutes" ? "Min" : unit === "hours" ? "Hrs" : "Days",
}));

export const DEFAULT_CREATE_TASK_FORM: CreateTaskFormState = {
  title: "",
  description: "",
  assignTo: null,
  assignName: "",
  dueDate: null,
  effortValue: "",
  effortUnit: "hours",
  taskPriority: "normal",
  status: "Pending",
  approvalRequired: false,
  isRecurring: false,
  recurringPeriod: null,
  recurringTime: "09:00",
  recurringTotalCount: "",
  recurringExcludeDays: [],
  recurringWeekDay: null,
  recurringMonthDate: "",
  recurringAnnualMonth: "",
  recurringAnnualDate: "",
  projectId: null,
  sprintId: null,
  parentId: 0,
  dependsOn: [],
  attachments: [],
};

export type CreateTaskFieldErrors = Partial<
  Record<
    | "title"
    | "assignee"
    | "dueDate"
    | "effort"
    | "status"
    | "taskPriority"
    | "approval"
    | "recurrence"
    | "recurringTime"
    | "recurringTotalCount"
    | "recurringWeekDay"
    | "recurringMonthDate"
    | "recurringAnnualMonth"
    | "recurringAnnualDate"
    | "dependsOn"
    | "attachments",
    string
  >
>;
