// Task dependency services (contract §3.25).

import { apiGet, apiPost } from "@/services/api/client";
import type {
  AddDependencyRequest,
  DependencyData,
  RemoveDependencyRequest,
} from "../types/task.types";
import { normalizeApiResponse, type ApiResult } from "./apiResult";

/** `company_id` is required in practice; without it the backend returns []. */
export async function getDependencies(
  taskId: number,
  companyId: number,
): Promise<ApiResult<DependencyData[]>> {
  const body = await apiGet<unknown>(`/tasks/dependencies/${taskId}`, {
    company_id: companyId,
  });
  return normalizeApiResponse<DependencyData[]>(body);
}

export async function addDependency(
  data: AddDependencyRequest,
): Promise<ApiResult<DependencyData>> {
  const body = await apiPost<unknown>("/tasks/dependencies/add", data);
  return normalizeApiResponse<DependencyData>(body);
}

export async function removeDependency(
  data: RemoveDependencyRequest,
): Promise<ApiResult<string>> {
  const body = await apiPost<unknown>("/tasks/dependencies/remove", data);
  return normalizeApiResponse<string>(body);
}
