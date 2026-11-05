// Task dependency services (contract §3.25).

import { apiGetWithStatus, apiPostWithStatus } from "@/services/api/client";
import type {
  AddDependencyRequest,
  DependencyData,
  RemoveDependencyRequest,
} from "../types/task.types";
import { TASK_REQUEST_TIMEOUT_MS } from "../constants/taskConstants";
import { normalizeApiResponse, type ApiResult } from "./apiResult";

/** `company_id` is required in practice; without it the backend returns []. */
export async function getDependencies(
  taskId: number,
  companyId: number,
): Promise<ApiResult<DependencyData[]>> {
  const response = await apiGetWithStatus<unknown>(
    `/tasks/dependencies/${taskId}`,
    { company_id: companyId },
    { timeoutMs: TASK_REQUEST_TIMEOUT_MS },
  );
  return normalizeApiResponse<DependencyData[]>(response.body, response.status);
}

export async function addDependency(
  data: AddDependencyRequest,
): Promise<ApiResult<DependencyData>> {
  const response = await apiPostWithStatus<unknown>(
    "/tasks/dependencies/add",
    data,
    false,
    { timeoutMs: TASK_REQUEST_TIMEOUT_MS },
  );
  return normalizeApiResponse<DependencyData>(response.body, response.status);
}

export async function removeDependency(
  data: RemoveDependencyRequest,
): Promise<ApiResult<string>> {
  const response = await apiPostWithStatus<unknown>(
    "/tasks/dependencies/remove",
    data,
    false,
    { timeoutMs: TASK_REQUEST_TIMEOUT_MS },
  );
  return normalizeApiResponse<string>(response.body, response.status);
}
