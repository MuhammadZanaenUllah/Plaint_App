// Compatibility re-exports. Canonical API result contract lives in apiResult.ts.
import { normalizeApiResponse } from "./apiResult";

export {
  normalizeApiResponse,
  extractApiMessage,
  isUnauthenticated,
  isNonJson,
  successResult,
  failureResult,
  fromError,
  type ApiResult,
} from "./apiResult";

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface TaskApiResponse {
  success: boolean;
  task?: unknown;
  tasks?: unknown[];
  total?: number;
  due_today_count?: number;
  complete_count?: number;
  error?: string;
  data?: unknown;
}

export function parseApiResponse(body: unknown, status = 0) {
  const result = normalizeApiResponse<unknown>(body, status);
  return {
    body,
    good: result.ok,
    error: result.ok ? undefined : result.message,
    result,
  };
}

export function successTaskResponse<T>(data: T): TaskApiResponse {
  return { success: true, data };
}

export function errorTaskResponse(msg: string): TaskApiResponse {
  return { success: false, error: msg };
}
