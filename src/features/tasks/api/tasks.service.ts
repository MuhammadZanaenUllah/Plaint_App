// Task API services
// Phase 1 — Foundation
// Aligned with TASK_MODULE_BACKEND_CONTRACT.md

import { apiGet, apiPost, apiDelete, apiUpload } from "@/services/api/client";
import { API_BASE_URL } from "@/config/env";
import { parseApiResponse, extractError, isAuthFailure, isBusinessError, isServerError } from "@/features/tasks/api/error-extractor";
import { TaskListItem, TaskListResponse, ViewTaskData, CreateTaskPayload, UpdateTaskPayload } from "@/features/tasks/types/task.types";
import { TaskOwner } from "@/features/tasks/types/task.types";
import { hasAdvancedTaskModule } from "@/features/tasks/utils/status/effort-rules";
import { TaskStatus, TaskPriority } from "@/features/tasks/types/task.types";

const BASE_URL = API_BASE_URL;

// ---- API-T-01: /tasks/all ----
export async function getAllTasks(
  companyId: number,
  options: { exclude_complete?: boolean; stale?: boolean; limit?: number; page?: number } = {}
): Promise<TaskListResponse> {
  const params: Record<string, string | number> = {};
  if (options.exclude_complete) params["exclude_complete"] = "true";
  if (options.stale) params["wait_fresh"] = "1";
  if (options.limit) params.limit = options.limit;
  if (options.page) params.page = options.page;

  const res = await apiGet<TaskListResponse>(`/tasks/all?company_id=${companyId}`, params);
  const { body, good } = parseApiResponse(res);

  if (!good) {
    throw new Error(extractError((body as any)?.error || (body as any)?.message));
  }

  return body as TaskListResponse;
}

// ---- API-T-02: /tasks/duetoday ----
export async function getDueTodayTasks(
  companyId: number,
  options: { stale?: boolean } = {}
): Promise<TaskListResponse> {
  const params: Record<string, string | number> = {};
  if (options.stale) params["wait_fresh"] = "1";

  const res = await apiGet<TaskListResponse>(`/tasks/duetoday?company_id=${companyId}`, params);
  const { body, good } = parseApiResponse(res);

  if (!good) {
    throw new Error(extractError((body as any)?.error || (body as any)?.message));
  }

  return body as TaskListResponse;
}

// ---- API-T-04: /tasks/filter ----
export async function getFilteredTasks(
  companyId: number,
  filter: "recurring" | "complete" | "pending_approval" | string,
  options: { limit?: number; page?: number } = {}
): Promise<TaskListResponse> {
  const params: Record<string, string | number> = { filter };
  if (options.limit) params.limit = options.limit;
  if (options.page) params.page = options.page;

  const res = await apiGet<TaskListResponse>(`/tasks/filter?company_id=${companyId}`, params);
  const { body, good } = parseApiResponse(res);

  if (!good) {
    throw new Error(extractError((body as any)?.error || (body as any)?.message));
  }

  return body as TaskListResponse;
}

// ---- API-T-05: /tasks/delayed-popup ----
export async function getDelayedPopup(companyId: number): Promise<{ task: TaskListItem; next_check_at: string }> {
  const res = await apiGet<{ task: TaskListItem; next_check_at: string }>(`/tasks/delayed-popup?company_id=${companyId}`);
  const { body, good } = parseApiResponse(res);

  if (!good) {
    throw new Error(extractError((body as any)?.error || (body as any)?.message));
  }

  return body as { task: TaskListItem; next_check_at: string };
}

// ---- API-T-06: /tasks/view/:taskId ----
export async function viewTask(taskId: number): Promise<ViewTaskData> {
  const res = await apiPost<ViewTaskData>(`/tasks/view/${taskId}`, {});
  const { body, good } = parseApiResponse(res);

  if (!good) {
    throw new Error(extractError((body as any)?.error || (body as any)?.message));
  }

  return body as ViewTaskData;
}

// ---- API-T-08: /tasks/create ----
export async function createTask(payload: CreateTaskPayload & { company_id: number; company_identifier: string }): Promise<TaskListItem> {
  // CONV-01: Send company_id and company_identifier on writes
  const body = {
    ...payload,
    company_id: payload.company_id,
    company_identifier: payload.company_identifier,
  };

  const res = await apiPost<{ task: TaskListItem }>(`/tasks/create`, body);
  const { body: result, good } = parseApiResponse(res);

  if (!good) {
    throw new Error(extractError((result as any)?.error || (result as any)?.message));
  }

  return result.task;
}

// ---- API-T-12: /tasks/updatetaskstatus/:id ----
export async function updateTaskStatus(taskId: number, status: TaskStatus): Promise<TaskListItem> {
  const res = await apiPost<{ task: TaskListItem }>(`/tasks/updatetaskstatus/${taskId}`, { status });
  const { body, good } = parseApiResponse(res);

  if (!good) {
    throw new Error(extractError((body as any)?.error || (body as any)?.message));
  }

  return body.task;
}

// ---- API-T-13: /tasks/updateasignedto/:id ----
export async function reassignTask(taskId: number, assigneeId: number): Promise<TaskListItem> {
  const res = await apiPost<{ task: TaskListItem }>(`/tasks/updateasignedto/${taskId}`, { assignee: assigneeId });
  const { body, good } = parseApiResponse(res);

  if (!good) {
    throw new Error(extractError((body as any)?.error || (body as any)?.message));
  }

  return body.task;
}

// ---- API-T-14: /tasks/update due date ----
export async function updateTaskDueDate(taskId: number, dueDate: string | null): Promise<TaskListItem> {
  const res = await apiPost<{ task: TaskListItem }>(`/tasks/updatetaskduedate/${taskId}`, { due_date: dueDate });
  const { body, good } = parseApiResponse(res);

  if (!good) {
    throw new Error(extractError((body as any)?.error || (body as any)?.message));
  }

  return body.task;
}

// ---- API-T-17: /tasks/approve/:id ----
export async function approveTask(taskId: number): Promise<TaskListItem> {
  const res = await apiPost<{ task: TaskListItem }>(`/tasks/approve/${taskId}`, {});
  const { body, good } = parseApiResponse(res);

  if (!good) {
    throw new Error(extractError((body as any)?.error || (body as any)?.message));
  }

  return body.task;
}

// ---- API-T-18: /tasks/reject/:id ----
export async function rejectTask(taskId: number, reason: string, effortHours?: number): Promise<TaskListItem> {
  const payload: { reason: string; effort_hours?: number } = { reason };
  if (effortHours !== undefined) payload.effort_hours = effortHours;

  const res = await apiPost<{ task: TaskListItem }>(`/tasks/reject/${taskId}`, payload);
  const { body, good } = parseApiResponse(res);

  if (!good) {
    throw new Error(extractError((body as any)?.error || (body as any)?.message));
  }

  return body.task;
}

// ---- API-T-19: /tasks/reopen/:id ----
export async function reopenTask(taskId: number, priority: TaskPriority, effortHours: number, bumpToFront?: boolean): Promise<TaskListItem> {
  const payload: { priority: TaskPriority; effort_hours: number; bump_to_front?: boolean } = { priority, effort_hours: effortHours };
  if (bumpToFront !== undefined) payload.bump_to_front = bumpToFront;

  const res = await apiPost<{ task: TaskListItem }>(`/tasks/reopen/${taskId}`, payload);
  const { body, good } = parseApiResponse(res);

  if (!good) {
    throw new Error(extractError((body as any)?.error || (body as any)?.message));
  }

  return body.task;
}

// ---- API-T-21: /tasks/reschedule-reopened/:id ----
// Dead path per contract - not implemented
// export async function rescheduleReopened(taskId: number): Promise<void> { ... }

// ---- API-T-22: /tasks/extend-delayed/:id ----
export async function extendDelayed(taskId: number, additionalHours: number): Promise<TaskListItem> {
  const res = await apiPost<{ task: TaskListItem }>(`/tasks/extend-delayed/${taskId}`, { additional_hours: additionalHours });
  const { body, good } = parseApiResponse(res);

  if (!good) {
    throw new Error(extractError((body as any)?.error || (body as any)?.message));
  }

  return body.task;
}

// ---- API-T-23: /tasks/updatetaskproject/:id ----
export async function updateTaskProject(taskId: number, projectId: number | null, sprintId: number | null): Promise<TaskListItem> {
  const payload: { project_id: number | null; sprint_id: number | null } = { project_id: projectId, sprint_id: sprintId };
  const res = await apiPost<{ task: TaskListItem }>(`/tasks/updatetaskproject/${taskId}`, payload);
  const { body, good } = parseApiResponse(res);

  if (!good) {
    throw new Error(extractError((body as any)?.error || (body as any)?.message));
  }

  return body.task;
}

// ---- API-T-26: /tasks/dependencies/:id ----
export async function getDependencies(taskId: number): Promise<{ id: number; title: string; created_by: number }[]> {
  const res = await apiGet<{ dependencies: Array<{ id: number; title: string; created_by: number }> }>(`/tasks/dependencies/${taskId}`);
  const { body, good } = parseApiResponse(res);

  if (!good) {
    throw new Error(extractError((body as any)?.error || (body as any)?.message));
  }

  return body.dependencies;
}

// ---- API-T-27: /tasks/dependencies/add ----
export async function addDependency(taskId: number, dependsOnId: number): Promise<TaskListItem> {
  const res = await apiPost<{ task: TaskListItem }>(`/tasks/dependencies/add`, { task_id: taskId, depends_on: dependsOnId });
  const { body, good } = parseApiResponse(res);

  if (!good) {
    throw new Error(extractError((body as any)?.error || (body as any)?.message));
  }

  return body.task;
}

// ---- API-T-28: /tasks/dependencies/remove ----
export async function removeDependency(taskId: number, dependencyId: number): Promise<TaskListItem> {
  const res = await apiPost<{ task: TaskListItem }>(`/tasks/dependencies/remove`, { task_id: taskId, dependency_id: dependencyId });
  const { body, good } = parseApiResponse(res);

  if (!good) {
    throw new Error(extractError((body as any)?.error || (body as any)?.message));
  }

  return body.task;
}

// ---- API-T-29: /tasks/reorder-critical ----
export async function reorderCritical(taskIds: number[], currentTaskId?: number): Promise<{ blockedTasks: number[] }> {
  const res = await apiPost<{ blockedTasks: number[] }>(`/tasks/reorder-critical`, { ordered_ids: taskIds, current_task_id: currentTaskId });
  const { body, good } = parseApiResponse(res);

  if (!good) {
    throw new Error(extractError((body as any)?.error || (body as any)?.message));
  }

  return body;
}

// ---- API-T-25: /tasks/migrate-priorities ----
// DO NOT USE - admin only, out of scope

// ---- API-T-24: /tasks/migrate-effort-to-minutes ----
// DO NOT USE - admin only, out of scope

export {
  BASE_URL,
  parseApiResponse,
  extractError,
  isAuthFailure,
  isBusinessError,
  isServerError,
};