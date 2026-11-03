// Pure Task validators. No React, no API calls.
// Contract references: §3.8, §3.10, §3.18, §3.19, §7, §8, §9, §11.

import {
  ALLOWED_EXTENSIONS,
  CREATE_STATUSES,
  MAX_UPLOAD_BYTES,
  RECURRING_PERIODS,
  type EffortUnit,
} from "../constants/taskConstants";
import type { RecurringPeriod, TaskPriorityLevel, TaskStatus } from "../types/task.types";
import { toMinutes } from "./taskEffort";
import { normalizeApiStatus, toApiStatus } from "./taskStatus";

export type ValidationErrors = Record<string, string>;

export type ValidationResult = {
  valid: boolean;
  errors: ValidationErrors;
};

export type TaskValidationContext = {
  isAts: boolean;
  hasTasksModule?: boolean;
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function isDateOnly(value: string): boolean {
  if (!DATE_ONLY.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function result(errors: ValidationErrors): ValidationResult {
  return { valid: Object.keys(errors).length === 0, errors };
}

export type CreateTaskForm = {
  title: string;
  description?: string;
  assignTo: number | null;
  dueDate: string | null;
  taskPriority: TaskPriorityLevel;
  status: string;
  approvalRequired?: boolean;
  isRecurring?: boolean;
  recurringPeriod?: RecurringPeriod | null;
  recurringTime?: string | null;
  recurringTotalCount?: number;
  recurringExcludeDays?: string[];
  recurringWeekDay?: string | null;
  recurringMonthDate?: number | null;
  recurringAnnualMonth?: number | null;
  recurringAnnualDate?: number | null;
  effortValue?: number | string;
  effortUnit?: EffortUnit;
  dependsOn?: number[];
  taskId?: number; // for update / dependency self-check
  projectId?: number | null;
  sprintId?: number | null;
};

export function validateCreateTask(
  form: CreateTaskForm,
  ctx: TaskValidationContext,
): ValidationResult {
  const errors: ValidationErrors = {};

  if (!form.title?.trim()) errors.title = "Title is required.";
  if (!form.assignTo) errors.assignee = "Assignee is required.";

  if (ctx.isAts) {
    if (!form.effortValue || toMinutes(form.effortValue, form.effortUnit ?? "hours") <= 0) {
      errors.effort = "Effort is required and must be greater than 0.";
    }
    if (form.dueDate) errors.dueDate = "ATS tasks are scheduled by the engine; due date must be empty.";
  } else {
    if (!form.dueDate) errors.dueDate = "Due date is required.";
    else validateDueDateInto(form.dueDate, errors, "dueDate");
  }

  if (!CREATE_STATUSES.includes(normalizeApiStatus(form.status))) {
    errors.status = "Status must be Pending, In-Progress, On-Hold or Complete.";
  }

  if (form.taskPriority === "critical" && !ctx.isAts) {
    errors.taskPriority = "Critical priority is only available in ATS companies.";
  }

  if (form.isRecurring) {
    Object.assign(errors, validateRecurrenceInto(form));
  }

  if (form.dependsOn?.length) {
    if (form.taskId && form.dependsOn.some((id) => Number(id) === Number(form.taskId))) {
      errors.dependsOn = "A task cannot depend on itself.";
    }
    if (form.dependsOn.some((id) => !Number.isFinite(Number(id)) || Number(id) <= 0)) {
      errors.dependsOn = "Dependency ids must be positive task ids.";
    }
  }

  return result(errors);
}

export type UpdateTaskForm = CreateTaskForm & {
  priority: number;
};

export function validateUpdateTask(
  form: UpdateTaskForm,
  ctx: TaskValidationContext,
): ValidationResult {
  const errors: ValidationErrors = {};
  if (!form.title?.trim()) errors.title = "Title is required.";
  if (!form.assignTo) errors.assignee = "Assignee is required.";
  if (!Number.isFinite(Number(form.priority)) || Number(form.priority) <= 0) {
    errors.priority = "A company priority is required.";
  }

  if (form.dueDate) validateDueDateInto(form.dueDate, errors, "dueDate");
  if (ctx.isAts) {
    if (form.effortValue !== undefined && form.effortValue !== "") {
      if (toMinutes(form.effortValue, form.effortUnit ?? "hours") < 0) {
        errors.effort = "Effort cannot be negative.";
      }
    }
  } else if (form.effortValue !== undefined && form.effortValue !== "") {
    errors.effort = "Normal companies must not send effort.";
  }

  if (form.taskPriority === "critical" && !ctx.isAts) {
    errors.taskPriority = "Critical priority is only available in ATS companies.";
  }

  if (form.isRecurring) Object.assign(errors, validateRecurrenceInto(form));

  return result(errors);
}

function validateDueDateInto(value: string, errors: ValidationErrors, key: string): void {
  if (!isDateOnly(value)) {
    errors[key] = "Due date must be in YYYY-MM-DD format.";
  }
}

export function validateDueDate(
  dueDate: string | null,
  options: {
    isAts?: boolean;
    required?: boolean;
    sprintDueDate?: string | null;
    subtaskDueDate?: string | null;
  } = {},
): ValidationResult {
  const errors: ValidationErrors = {};
  if (!dueDate) {
    if (options.required && !options.isAts) errors.dueDate = "Due date is required.";
    return result(errors);
  }
  validateDueDateInto(dueDate, errors, "dueDate");
  if (options.isAts) {
    errors.dueDate = "ATS due dates are scheduled by the engine and cannot be edited.";
  }
  if (options.sprintDueDate && dueDate > options.sprintDueDate) {
    errors.dueDate = "Task due date cannot exceed the sprint due date.";
  }
  if (options.subtaskDueDate && dueDate < options.subtaskDueDate) {
    errors.dueDate = "Due date cannot be before a subtask due date.";
  }
  return result(errors);
}

export type RecurrenceForm = Pick<
  CreateTaskForm,
  | "isRecurring"
  | "recurringPeriod"
  | "recurringTime"
  | "recurringTotalCount"
  | "recurringExcludeDays"
  | "recurringWeekDay"
  | "recurringMonthDate"
  | "recurringAnnualMonth"
  | "recurringAnnualDate"
>;

export function validateRecurrence(form: RecurrenceForm): ValidationResult {
  return result(validateRecurrenceInto(form));
}

function validateRecurrenceInto(form: RecurrenceForm): ValidationErrors {
  const errors: ValidationErrors = {};
  if (!form.isRecurring) return errors;

  if (!form.recurringPeriod || !RECURRING_PERIODS.includes(form.recurringPeriod)) {
    errors.recurrence = "A recurring period is required.";
    return errors;
  }

  if (!form.recurringTime || !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.recurringTime)) {
    errors.recurringTime = "Recurring time must be HH:mm (24-hour).";
  }

  if (form.recurringTotalCount !== undefined && form.recurringTotalCount < 0) {
    errors.recurringTotalCount = "Total count cannot be negative (0 means no limit).";
  }

  if (form.recurringPeriod === "weekly" && !form.recurringWeekDay) {
    errors.recurringWeekDay = "Choose a weekday for a weekly recurrence.";
  }
  if (form.recurringPeriod === "monthly") {
    const day = Number(form.recurringMonthDate);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      errors.recurringMonthDate = "Monthly recurrence needs a day between 1 and 31.";
    }
  }
  if (form.recurringPeriod === "annually") {
    const month = Number(form.recurringAnnualMonth);
    const day = Number(form.recurringAnnualDate);
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      errors.recurringAnnualMonth = "Annual recurrence needs a month between 1 and 12.";
    }
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      errors.recurringAnnualDate = "Annual recurrence needs a day between 1 and 31.";
    }
  }

  return errors;
}

export function validateReject(
  reason: string,
  additionalMinutes = 0,
  rejectType?: "requirement_changed" | "not_completed",
  isAts = false,
): ValidationResult {
  const errors: ValidationErrors = {};
  if (!reason?.trim()) errors.reason = "A rejection reason is required.";
  if (!Number.isFinite(additionalMinutes) || additionalMinutes < 0) {
    errors.additionalHours = "Additional effort cannot be negative.";
  }
  if (isAts) {
    if (!rejectType) errors.rejectType = "Choose a rejection type.";
    if (rejectType === "requirement_changed" && additionalMinutes <= 0) {
      errors.additionalHours = "Enter the effort to add.";
    }
    if (rejectType === "not_completed" && additionalMinutes !== 0) {
      errors.additionalHours = "Additional effort must be 0 for 'not completed'.";
    }
  }
  return result(errors);
}

export function validateReopen(
  status: string,
  priority: TaskPriorityLevel,
  effortValue: number | string,
  effortUnit: EffortUnit,
  isAts: boolean,
): ValidationResult {
  const errors: ValidationErrors = {};
  const normalized = normalizeApiStatus(status);
  if (normalized !== "In-Progress" && normalized !== "Pending") {
    errors.status = "Reopened tasks must go to In-Progress or Pending.";
  }
  if (priority !== "normal" && priority !== "critical") {
    errors.priority = "Priority must be normal or critical.";
  }
  if (isAts && toMinutes(effortValue, effortUnit) <= 0) {
    errors.effort = "ATS reopen requires effort greater than 0.";
  }
  return result(errors);
}

export type AttachmentLike = {
  name?: string | null;
  size?: number | null;
  extension?: string | null;
};

export function validateAttachment(file: AttachmentLike): ValidationResult {
  const errors: ValidationErrors = {};
  if (file.size !== undefined && file.size !== null) {
    if (file.size <= 0) errors.file = "File is empty.";
    if (file.size > MAX_UPLOAD_BYTES) errors.file = "File exceeds the 30 MB limit.";
  }
  const extension = (file.extension ?? file.name?.split(".").pop() ?? "").toLowerCase();
  if (!extension) {
    errors.file = "Could not determine the file extension.";
  } else if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(extension)) {
    errors.file = `File type .${extension} is not allowed.`;
  }
  return result(errors);
}

/** Build the canonical status value to send to `/updatetaskstatus`. */
export function toStatusPayload(status: TaskStatus | string): string {
  return toApiStatus(status);
}
