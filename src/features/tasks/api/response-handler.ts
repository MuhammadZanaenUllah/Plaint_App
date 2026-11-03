// API response handler for Task Module
// Phase 1 — Foundation

import { TaskListItem, TaskListResponse, ViewTaskData, CreateTaskPayload, UpdateTaskPayload } from "../types/task.types";

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface TaskApiResponse {
  success: boolean;
  task?: TaskListItem;
  tasks?: TaskListItem[];
  total?: number;
  due_today_count?: number;
  complete_count?: number;
  error?: string;
}

/** Parse API response, extracting error message per contract CONV-02 */
export function parseApiResponse(
  res: Response
): { body: unknown; good: boolean; error?: string } {
  const text = res.status === 0 ? "Network error" : res.status >= 500 ? "Server error" : res.status >= 400 ? "Bad request" : "";

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  // CONV-02: Show first string in data, message, msg, or error
  let msg = "";
  if (typeof body === "object" && body !== null) {
    const obj = body as Record<string, unknown>;
    msg =
      (obj as any).data?.trim() ||
      (obj as any).message?.trim() ||
      (obj as any).msg?.trim() ||
      (obj as any).error?.trim();
  }
  if (typeof body === "string" && body.trim()) {
    msg = body.trim();
  }

  const good = (body as any)?.Good === true || (body as any)?.success === true || res.ok;

  return { body, good, error: msg || undefined };
}

/** Build a standardized task API success response */
export function successTaskResponse<T>(data: T): TaskApiResponse {
  return { success: true, data };
}

/** Build a standardized task API error response */
export function errorTaskResponse(msg: string): TaskApiResponse {
  return { success: false, error: msg };
}