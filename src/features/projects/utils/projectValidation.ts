// Pure Project/Sprint validators. No React, no API calls.
// Contract references: §4.1-§4.3, §17 P-005/P-006/P-007.

import type { CanonicalProjectStatus } from "../types/project.types";
import {
  formatTaskDueDatePkt,
  toPktDateOnly,
} from "@/features/tasks/utils/taskDate";

export type ValidationErrors = Record<string, string>;
export type ValidationResult = { valid: boolean; errors: ValidationErrors };

const CANONICAL_PROJECT_STATUSES: CanonicalProjectStatus[] = [
  "Planning",
  "In Progress",
  "On Hold",
  "Completed",
  "Abandoned",
];

const CASCADE_STATUSES: CanonicalProjectStatus[] = [
  "Planning",
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

export type ProjectBoundItem = {
  name?: string;
  title?: string;
  due_date?: string | null;
};

export type ProjectForm = {
  name?: string;
  dueDate?: string | null;
  status?: string;
  sprints?: ProjectBoundItem[];
  tasks?: ProjectBoundItem[];
};

function dateLabel(value: string | null | undefined): string {
  return value ? formatTaskDueDatePkt(value) : "-";
}

export function validateProject(form: ProjectForm): ValidationResult {
  const errors: ValidationErrors = {};

  if (!form.name?.trim()) errors.name = "Project name is required";

  if (!form.dueDate) {
    errors.dueDate = "Due date is required for a project";
  } else if (!isIsoOrDateOnly(form.dueDate)) {
    errors.dueDate = "Due date must be a valid date.";
  } else {
    const dueDay = toPktDateOnly(form.dueDate);
    const lateSprint = (form.sprints ?? []).find(
      (sprint) =>
        sprint.due_date && toPktDateOnly(sprint.due_date) > dueDay,
    );
    if (lateSprint) {
      errors.dueDate = `Project due date cannot be before sprint "${lateSprint.name ?? "Sprint"}" due date (${dateLabel(lateSprint.due_date)}). Update or remove that sprint first.`;
    } else {
      const lateTask = (form.tasks ?? []).find(
        (task) => task.due_date && toPktDateOnly(task.due_date) > dueDay,
      );
      if (lateTask) {
        errors.dueDate = `Project due date cannot be before task "${lateTask.title ?? "Task"}" due date (${dateLabel(lateTask.due_date)}). Update or remove that task first.`;
      }
    }
  }

  if (
    form.status &&
    !CANONICAL_PROJECT_STATUSES.includes(form.status as CanonicalProjectStatus)
  ) {
    errors.status =
      "Status must be Planning, In Progress, On Hold, Completed or Abandoned.";
  }
  return result(errors);
}

/** Latest sprint/task due date; project due date must not be earlier. */
export function latestProjectDependencyDate(
  sprints: ProjectBoundItem[] = [],
  tasks: ProjectBoundItem[] = [],
): string | null {
  const values = [...sprints, ...tasks]
    .map((item) => item.due_date)
    .filter((value): value is string => !!value);
  if (values.length === 0) return null;
  return values.reduce((latest, value) =>
    toPktDateOnly(value) > toPktDateOnly(latest) ? value : latest,
  );
}

/** Completed is blocked unless the project is currently In Progress. */
export function requiresInProgressBeforeCompleted(
  currentStatus: string,
  targetStatus: string,
): boolean {
  return (
    targetStatus === "Completed" &&
    currentStatus !== "Completed" &&
    currentStatus !== "In Progress"
  );
}

/** Status changes that cascade to the project's open tasks. */
export function shouldWarnProjectStatusCascade(
  currentStatus: string,
  targetStatus: string,
): boolean {
  return (
    currentStatus !== targetStatus &&
    CASCADE_STATUSES.includes(targetStatus as CanonicalProjectStatus)
  );
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
  if (!form.name?.trim()) errors.name = "Please enter sprint name and due date";
  if (!form.dueDate) errors.dueDate = "Please enter sprint name and due date";
  else if (!isIsoOrDateOnly(form.dueDate)) errors.dueDate = "Due date must be a valid date.";

  if (form.dueDate && form.projectDueDate && isAfterDay(form.dueDate, form.projectDueDate)) {
    errors.dueDate = `Sprint date cannot be later than project due date (${dateLabel(form.projectDueDate)}).`;
  }
  return result(errors);
}

export function validateSprintAssignment(
  sprintDueDate: string | null | undefined,
  taskDueDate: string | null | undefined,
): ValidationResult {
  const errors: ValidationErrors = {};
  if (sprintDueDate && taskDueDate && isAfterDay(taskDueDate, sprintDueDate)) {
    errors.sprint = `Task due date (${dateLabel(taskDueDate)}) exceeds sprint due date (${dateLabel(sprintDueDate)}). Please update the task due date first.`;
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
