import type { SelectedFile } from "@/features/attachments/types/attachment.types";
import {
  CREATE_STATUSES,
  RECURRING_PERIODS,
} from "@/features/tasks/constants/taskConstants";
import { toMinutes } from "@/features/tasks/utils/taskEffort";
import { toPktDateOnly } from "@/features/tasks/utils/taskDate";
import { normalizeApiStatus } from "@/features/tasks/utils/taskStatus";
import { validateAttachment } from "@/features/tasks/utils/taskValidation";
import type {
  CreateTaskFormState,
  CreateTaskValidationResult,
} from "./createTaskTypes";

function result(
  errors: Record<string, string>,
  message?: string,
): CreateTaskValidationResult {
  return {
    valid: Object.keys(errors).length === 0,
    errors,
    message: message ?? Object.values(errors)[0],
  };
}

export function validateCreateTaskForm(
  form: CreateTaskFormState,
  ctx: { isAts: boolean },
): CreateTaskValidationResult {
  const errors: Record<string, string> = {};

  if (!form.title.trim()) errors.title = "Task title is required.";
  if (!form.assignTo) errors.assignee = "Please assign a user.";

  if (ctx.isAts) {
    const minutes = toMinutes(form.effortValue, form.effortUnit);
    if (!form.effortValue.trim()) {
      errors.effort = "Effort is required";
    } else if (minutes <= 0) {
      errors.effort = "Effort hours must be greater than 0";
    }
  } else if (!form.dueDate) {
    errors.dueDate = "Please select a due date.";
  } else {
    const dueDate = toPktDateOnly(form.dueDate);
    const today = toPktDateOnly(new Date());
    if (!dueDate) errors.dueDate = "Due date must be in YYYY-MM-DD format.";
    else if (dueDate < today) errors.dueDate = "Due date cannot be in the past.";
  }

  if (!CREATE_STATUSES.includes(normalizeApiStatus(form.status))) {
    errors.status = "Status must be Pending, In-Progress, On-Hold or Complete.";
  }

  if (form.taskPriority === "critical" && !ctx.isAts) {
    errors.taskPriority = "Critical priority is only available in ATS companies.";
  }

  if (form.isRecurring) {
    if (!form.recurringPeriod || !RECURRING_PERIODS.includes(form.recurringPeriod)) {
      errors.recurrence = "Please select a recurrence period for recurring tasks!";
    } else {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.recurringTime)) {
        errors.recurringTime = "Recurring time must be HH:mm (24-hour).";
      }

      if (form.recurringTotalCount.trim()) {
        const total = Number(form.recurringTotalCount);
        if (!Number.isInteger(total) || total < 0) {
          errors.recurringTotalCount =
            "Total count cannot be negative (0 means no limit).";
        }
      }

      if (form.recurringPeriod === "weekly" && !form.recurringWeekDay) {
        errors.recurringWeekDay = "Choose a weekday for a weekly recurrence.";
      }

      if (form.recurringPeriod === "monthly") {
        const day = Number(form.recurringMonthDate);
        if (!Number.isInteger(day) || day < 1 || day > 31) {
          errors.recurringMonthDate =
            "Monthly recurrence needs a day between 1 and 31.";
        }
      }

      if (form.recurringPeriod === "annually") {
        const month = Number(form.recurringAnnualMonth);
        const day = Number(form.recurringAnnualDate);
        if (!Number.isInteger(month) || month < 1 || month > 12) {
          errors.recurringAnnualMonth =
            "Annual recurrence needs a month between 1 and 12.";
        }
        if (!Number.isInteger(day) || day < 1 || day > 31) {
          errors.recurringAnnualDate =
            "Annual recurrence needs a day between 1 and 31.";
        }
      }
    }
  }

  if (form.dependsOn.length) {
    if (!ctx.isAts) {
      errors.dependsOn = "Dependencies are only available in ATS companies.";
    } else if (form.dependsOn.some((id) => !Number.isFinite(id) || id <= 0)) {
      errors.dependsOn = "Dependency ids must be positive task ids.";
    }
  }

  return result(errors);
}

export function validateCreateTaskAttachments(files: SelectedFile[]): {
  valid: boolean;
  message?: string;
} {
  for (const file of files) {
    const validation = validateAttachment(file);
    if (!validation.valid) {
      return {
        valid: false,
        message: `"${file.name}": ${Object.values(validation.errors)[0]}`,
      };
    }
  }
  return { valid: true };
}
