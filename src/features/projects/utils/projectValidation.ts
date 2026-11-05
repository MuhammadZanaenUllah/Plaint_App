// Pure Project/Sprint validators. No React, no API calls.
// Contract references: §4.1-§4.3, FLOW-P-003, FLOW-P-006.

import type { CanonicalProjectStatus } from "../types/project.types";
import { toPktDateOnly } from "@/features/tasks/utils/taskDate";

export type ValidationErrors = Record<string, string>;
export type ValidationResult = { valid: boolean; errors: ValidationErrors };

const CANONICAL_PROJECT_STATUSES: CanonicalProjectStatus[] = [
  "Planning",
  "In Progress",
  "On Hold",
  "Completed",
  "Abandoned",
];

function result(errors: ValidationErrors): ValidationResult {
  return { valid: Object.keys(errors).length === 0, errors };
}

function isIsoOrDateOnly(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) ||
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/.test(value)
  );
}

export type ProjectForm = {
  name?: string;
  dueDate?: string | null;
  status?: string;
};

export function validateProject(form: ProjectForm): ValidationResult {
  const errors: ValidationErrors = {};
  if (!form.name?.trim()) errors.name = "Project name is required.";
  if (!form.dueDate) errors.dueDate = "Project due date is required.";
  else if (!isIsoOrDateOnly(form.dueDate)) errors.dueDate = "Due date must be a valid date.";
  if (form.status && !CANONICAL_PROJECT_STATUSES.includes(form.status as CanonicalProjectStatus)) {
    errors.status = "Status must be Planning, In Progress, On Hold, Completed or Abandoned.";
  }
  return result(errors);
}

export type SprintForm = {
  name?: string;
  dueDate?: string | null;
  projectDueDate?: string | null;
};

function isAfterDay(a: string, b: string): boolean {
  const aDay = toPktDateOnly(a);
  const bDay = toPktDateOnly(b);
  if (!aDay || !bDay) return a > b;
  return aDay > bDay;
}

export function validateSprint(form: SprintForm): ValidationResult {
  const errors: ValidationErrors = {};
  if (!form.name?.trim()) errors.name = "Please enter sprint name and due date.";
  if (!form.dueDate) errors.dueDate = "Please enter sprint name and due date.";
  else if (!isIsoOrDateOnly(form.dueDate)) errors.dueDate = "Due date must be a valid date.";

  if (form.dueDate && form.projectDueDate && isAfterDay(form.dueDate, form.projectDueDate)) {
    errors.dueDate = "Sprint date cannot be later than the project due date.";
  }
  return result(errors);
}

export function validateSprintAssignment(
  sprintDueDate: string | null | undefined,
  taskDueDate: string | null | undefined,
): ValidationResult {
  const errors: ValidationErrors = {};
  if (sprintDueDate && taskDueDate && isAfterDay(taskDueDate, sprintDueDate)) {
    errors.sprint =
      "Task due date exceeds the sprint due date. Choose another sprint or adjust the task date.";
  }
  return result(errors);
}

export function validateSprintDateForTasks(
  sprintDueDate: string | null | undefined,
  taskDueDates: (string | null | undefined)[],
): ValidationResult {
  const errors: ValidationErrors = {};
  if (!sprintDueDate) {
    errors.dueDate = "Sprint due date is required.";
    return result(errors);
  }
  const lateTask = taskDueDates.find(
    (taskDueDate) => taskDueDate && isAfterDay(taskDueDate, sprintDueDate),
  );
  if (lateTask) {
    errors.dueDate =
      "Sprint date cannot be earlier than the due date of a task in this sprint.";
  }
  return result(errors);
}

export function canMarkProjectCompleted(openTaskCount: number): ValidationResult {
  const errors: ValidationErrors = {};
  if (openTaskCount > 0) {
    errors.status = `Cannot mark project as Completed. ${openTaskCount} task(s) is/are still open.`;
  }
  return result(errors);
}
