// Create task form validation
// Phase 1 — Foundation

import { TaskStatus, TaskPriority, CreateTaskPayload, TaskOwner } from "../types/task.types";
import { hasAdvancedTaskModule } from "../utils/status/effort-rules";
import { TaskPerson } from "../types/task.types";

export interface CreateTaskValidationErrors {
  title?: string;
  due_date?: string;
  assignee?: string;
  status?: string;
  priority?: string;
  recurring?: string;
  attachments?: string;
}

export interface CreateTaskValidationResult {
  errors: CreateTaskValidationErrors;
  isValid: boolean;
  payload: CreateTaskPayload;
}

export function validateCreateTask(
  title: string,
  description: string,
  assignedToId: number | null,
  dueDate: string | null,
  priority: string,
  status: string,
  isRecurring: boolean,
  recurringPeriod: string | null,
  companyModules: string[] | null
): CreateTaskValidationResult {
  const errors: CreateTaskValidationErrors = {};
  const payload: CreateTaskPayload = {
    title: title.trim(),
    description,
    assign_to: assignedToId,
    due_date: dueDate,
    priority: priority as TaskPriority,
    status: status as TaskStatus,
    approval_required: 0,
    is_recurring: isRecurring,
    depends_on: [],
    project_id: null,
    sprint_id: null,
    effort_hours: undefined,
    effort_unit: undefined,
  };

  // VAL-01: Title required
  if (!payload.title) {
    errors.title = "Title is required";
  }

  // VAL-05: Due date required for normal companies
  const isATS = hasAdvancedTaskModule(companyModules ?? []);
  if (!isATS && !dueDate) {
    errors.due_date = "Due date is required for normal tasks";
  } else if (isATS && dueDate) {
    // ATS: due date is read-only, should be null
    errors.due_date = "Due date should be empty for ATS tasks";
  }

  // VAL-06: Assignee from task_owner; default me
  if (!assignedToId) {
    errors.assignee = "Assignee is required";
  }

  // VAL-07: Status options - only Pending/In-Progress/On-Hold/Complete for create
  const validStatuses: TaskStatus[] = ["Pending", "In-Progress", "On-Hold", "Complete"];
  if (!validStatuses.includes(payload.status as TaskStatus)) {
    errors.status = `Invalid status. Must be one of: ${validStatuses.join(", ")}`;
  }

  // VAL-12: Critical only ATS
  const isCritical = payload.priority === "critical";
  if (isCritical && !isATS) {
    errors.priority = "Critical priority is only available for ATS companies";
  }

  return {
    errors,
    isValid: Object.keys(errors).length === 0,
    payload,
  };
}