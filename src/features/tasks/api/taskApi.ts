// Task REST API services (contract §3).
// Every function returns ApiResult<T>; nothing is silently swallowed.
// Forbidden endpoints are intentionally absent:
//   /tasks/statusupdate, GET /tasks/:id, /tasks/updateleadsource,
//   /tasks/reschedule-reopened, /tasks/migrate-*.

import {
  apiGetWithStatus,
  apiPostWithStatus,
  type ApiHttpResponse,
} from "@/services/api/client";
import type {
  CreateTaskRequest,
  CreateTaskResult,
  CriticalForUserResponse,
  DelayedPopupResponse,
  DependencyData,
  ExtendDelayedRequest,
  RecalculateScheduleRequest,
  RejectTaskRequest,
  ReopenTaskRequest,
  ReorderCriticalRequest,
  TaskEntity,
  TaskFilter,
  TaskListItem,
  TaskListResponse,
  TaskNote,
  UpdateAssigneeRequest,
  UpdateDueDateRequest,
  UpdateProjectRequest,
  UpdateTaskRequest,
  UpdateTaskStatusRequest,
  ViewTaskData,
} from "../types/task.types";
import { failureResult, normalizeApiResponse, successResult, type ApiResult } from "./apiResult";
import { measureApi } from "../dev/counters";
import { TASK_REQUEST_TIMEOUT_MS } from "../constants/taskConstants";
import { toApiStatus } from "../utils/taskStatus";
import {
  addNote,
  deleteNote,
  getMentionUsers,
  getTaskNotes,
  pinNote,
  updateNote,
  updateNoteReaction,
} from "./taskNotesApi";
import {
  deleteAttachment,
  uploadAttachment,
} from "./taskAttachmentsApi";
import {
  addDependency,
  getDependencies,
  removeDependency,
} from "./taskDependenciesApi";

export type ListOptions = {
  waitFresh?: boolean;
  limit?: number;
  page?: number;
  excludeComplete?: boolean;
};

function listParams(companyId: number, options: ListOptions = {}) {
  const params: Record<string, string | number> = { company_id: companyId };
  if (options.excludeComplete) params.exclude_complete = "true";
  if (options.waitFresh) params.wait_fresh = "1";
  if (options.limit !== undefined) params.limit = options.limit;
  if (options.page !== undefined) params.page = options.page;
  return params;
}

async function getResult<T>(
  path: string,
  params?: Record<string, string | number>,
): Promise<ApiResult<T>> {
  const response = await apiGetWithStatus<T>(path, params, {
    timeoutMs: TASK_REQUEST_TIMEOUT_MS,
  });
  return normalizeApiResponse<T>(response.body, response.status);
}

async function postResult<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
  const response = await apiPostWithStatus<T>(path, body, false, {
    timeoutMs: TASK_REQUEST_TIMEOUT_MS,
  });
  return normalizeApiResponse<T>(response.body, response.status);
}

async function postRaw(
  path: string,
  body?: unknown,
): Promise<ApiHttpResponse<unknown>> {
  return apiPostWithStatus<unknown>(path, body, false, {
    timeoutMs: TASK_REQUEST_TIMEOUT_MS,
  });
}

// ---- API-T-01: GET /tasks/all ----
export async function getAllTasks(
  companyId: number,
  options: ListOptions = {},
): Promise<ApiResult<TaskListResponse>> {
  return measureApi("getAllTasks", () =>
    getResult<TaskListResponse>("/tasks/all", listParams(companyId, options)),
  );
}

// ---- API-T-02: GET /tasks/duetoday ----
export async function getDueTodayTasks(
  companyId: number,
  options: Omit<ListOptions, "excludeComplete"> = {},
): Promise<ApiResult<TaskListResponse>> {
  return measureApi("getDueTodayTasks", () =>
    getResult<TaskListResponse>("/tasks/duetoday", listParams(companyId, options)),
  );
}

// ---- API-T-04: GET /tasks/filter ----
export async function getFilteredTasks(
  companyId: number,
  filter: TaskFilter,
  options: ListOptions = {},
): Promise<ApiResult<TaskListResponse>> {
  const params = listParams(companyId, options);
  params.filter = filter;
  return measureApi("getFilteredTasks", () =>
    getResult<TaskListResponse>("/tasks/filter", params),
  );
}

// ---- API-T-05: GET /tasks/delayed-popup ----
export async function getDelayedPopup(companyId: number): Promise<ApiResult<DelayedPopupResponse>> {
  return measureApi("getDelayedPopup", () =>
    getResult<DelayedPopupResponse>("/tasks/delayed-popup", {
      company_id: companyId,
    }),
  );
}

// ---- API-T-03: GET /tasks/critical-for-user ----
export async function getCriticalForUser(
  companyId: number,
  userId: number,
): Promise<ApiResult<CriticalForUserResponse>> {
  return measureApi("getCriticalForUser", () =>
    getResult<CriticalForUserResponse>("/tasks/critical-for-user", {
      company_id: companyId,
      user_id: userId,
    }),
  );
}

// ---- API-T-06: POST /tasks/view/:id ----
export async function viewTask(
  taskId: number,
  companyId?: number,
): Promise<ApiResult<ViewTaskData>> {
  return measureApi("viewTask", () =>
    postResult<ViewTaskData>(`/tasks/view/${taskId}`, {
      company_id: companyId,
    }),
  );
}

// ---- API-T-08: POST /tasks/create ----
// The reply includes top-level `planning_hold` / `message` when the task's
// project is still in Planning (contract §3.8). `data` is the saved task.
export async function createTask(
  payload: CreateTaskRequest,
): Promise<ApiResult<CreateTaskResult>> {
  const response = await measureApi("createTask", () =>
    postRaw("/tasks/create", payload),
  );
  const normalized = normalizeApiResponse<unknown>(response.body, response.status);
  if (!normalized.ok) return normalized;

  const raw = response.body as Record<string, unknown> | null;
  const data =
    raw && typeof raw.data === "object" && raw.data !== null
      ? (raw.data as Record<string, unknown>)
      : null;
  const id = Number(data?.id ?? raw?.id);
  if (!Number.isFinite(id) || id <= 0) {
    return failureResult(
      "The task was created, but the server did not return its id.",
      response.status,
      response.body,
    );
  }

  return successResult(
    {
      id,
      planningHold: raw?.planning_hold === true,
      message:
        typeof raw?.message === "string" ? raw.message : normalized.message,
      task: data ? (data as unknown as CreateTaskResult["task"]) : undefined,
    },
    response.body,
  );
}

// ---- API-T-10: POST /tasks/update/:id ----
// Sends the website payload. Deliberately strips project_id/sprint_id:
// the backend writes them whenever present and would detach the task.
// Effort is sent only when provided (ATS callers only).
export async function updateTask(
  taskId: number,
  payload: UpdateTaskRequest,
): Promise<ApiResult<{ message: string }>> {
  const {
    project_id: _projectId,
    sprint_id: _sprintId,
    effort_hours,
    effort_unit,
    ...rest
  } = payload;

  const body: Record<string, unknown> = { ...rest, status: toApiStatus(rest.status) };
  if (effort_hours !== undefined) body.effort_hours = effort_hours;
  if (effort_unit !== undefined) body.effort_unit = effort_unit;

  const response = await measureApi("updateTask", () =>
    postRaw(`/tasks/update/${taskId}`, body),
  );
  const normalized = normalizeApiResponse<unknown>(response.body, response.status);
  if (!normalized.ok) return normalized;
  return successResult(
    { message: normalized.message ?? "Record has Been Updated" },
    normalized.raw,
  );
}

// ---- API-T-12: POST /tasks/updatetaskstatus/:id ----
export async function updateTaskStatus(
  taskId: number,
  payload: UpdateTaskStatusRequest,
): Promise<ApiResult<string>> {
  return measureApi("updateTaskStatus", () =>
    postResult<string>(`/tasks/updatetaskstatus/${taskId}`, {
      ...payload,
      status: toApiStatus(payload.status),
    }),
  );
}

// ---- API-T-13: POST /tasks/updateasignedto/:id ----
export async function reassignTask(
  taskId: number,
  payload: UpdateAssigneeRequest,
): Promise<ApiResult<string>> {
  return measureApi("reassignTask", () =>
    postResult<string>(`/tasks/updateasignedto/${taskId}`, {
      assignee: payload.assignee,
      asigned_to: payload.asigned_to,
      company_id: payload.company_id,
      company_identifier: payload.company_identifier,
    }),
  );
}

// ---- API-T-14: POST /tasks/updatetaskduedate/:id ----
export async function updateTaskDueDate(
  taskId: number,
  payload: UpdateDueDateRequest,
): Promise<ApiResult<string>> {
  return measureApi("updateTaskDueDate", () =>
    postResult<string>(`/tasks/updatetaskduedate/${taskId}`, payload),
  );
}

// ---- API-T-17: POST /tasks/approve/:id ----
export async function approveTask(
  taskId: number,
  company: { company_id: number; company_identifier: string },
): Promise<ApiResult<string>> {
  return measureApi("approveTask", () =>
    postResult<string>(`/tasks/approve/${taskId}`, company),
  );
}

// ---- API-T-18: POST /tasks/reject/:id ----
export async function rejectTask(
  taskId: number,
  payload: RejectTaskRequest,
): Promise<ApiResult<{ message: string; status?: string }>> {
  const response = await measureApi("rejectTask", () =>
    postRaw(`/tasks/reject/${taskId}`, payload),
  );
  const normalized = normalizeApiResponse<string>(response.body, response.status);
  if (!normalized.ok) return normalized;
  const raw = response.body as Record<string, unknown> | null;
  return successResult(
    {
      message: normalized.data ?? "Task has been rejected.",
      status: typeof raw?.status === "string" ? raw.status : undefined,
    },
    response.body,
  );
}

// ---- API-T-19: POST /tasks/reopen/:id ----
export async function reopenTask(
  taskId: number,
  payload: ReopenTaskRequest,
): Promise<ApiResult<string>> {
  return measureApi("reopenTask", () =>
    postResult<string>(`/tasks/reopen/${taskId}`, {
      ...payload,
      status: toApiStatus(payload.status),
    }),
  );
}

// ---- API-T-21: POST /tasks/recalculate/:id ----
export async function recalculateSchedule(
  taskId: number,
  payload: RecalculateScheduleRequest,
): Promise<ApiResult<unknown>> {
  return measureApi("recalculateSchedule", () =>
    postResult<unknown>(`/tasks/recalculate/${taskId}`, payload),
  );
}

// ---- API-T-22: POST /tasks/extend-delayed/:id ----
// The server is the only place that converts units. Do not pre-convert.
export async function extendDelayedTask(
  taskId: number,
  payload: ExtendDelayedRequest,
): Promise<ApiResult<{ id?: number; start_date?: string; due_date?: string; effort_hours?: number }>> {
  return measureApi("extendDelayed", () =>
    postResult<{ id?: number; start_date?: string; due_date?: string; effort_hours?: number }>(
      `/tasks/extend-delayed/${taskId}`,
      payload,
    ),
  );
}

// ---- API-T-23: POST /tasks/updatetaskproject/:id ----
export async function updateTaskProject(
  taskId: number,
  payload: UpdateProjectRequest,
): Promise<ApiResult<string>> {
  return measureApi("updateTaskProject", () =>
    postResult<string>(`/tasks/updatetaskproject/${taskId}`, payload),
  );
}

// ---- API-T-29: POST /tasks/reorder-critical ----
export async function reorderCritical(
  payload: ReorderCriticalRequest,
): Promise<ApiResult<{ blockedTasks: { id: number; title: string }[] }>> {
  const response = await measureApi("reorderCritical", () =>
    postRaw("/tasks/reorder-critical", payload),
  );
  const normalized = normalizeApiResponse<unknown>(response.body, response.status);
  if (!normalized.ok) return normalized;
  const raw = response.body as Record<string, unknown> | null;
  const blocked = Array.isArray(raw?.blockedTasks) ? raw.blockedTasks : [];
  return successResult({ blockedTasks: blocked as { id: number; title: string }[] }, response.body);
}

// ---- Notes / mentions ----
export {
  addNote,
  getMentionUsers,
  getTaskNotes,
  updateNote,
  pinNote,
  deleteNote,
  updateNoteReaction,
};

// ---- Attachments ----
export { uploadAttachment, deleteAttachment };

// ---- Dependencies ----
export { addDependency, getDependencies, removeDependency };

// ---- Convenience re-exports for consumers ----
export type {
  DependencyData,
  TaskEntity,
  TaskListItem,
  TaskNote,
  TaskListResponse,
};

/** True when a successful status response means the task became Pending-Approval. */
export function isApprovalRequiredMessage(message: string | undefined): boolean {
  return (message ?? "").toLowerCase().includes("approval is required");
}
