// Sprint REST API services (contract §4.3).

import {
  apiDeleteWithStatus,
  apiGetWithStatus,
  apiPostWithStatus,
} from "@/services/api/client";
import type {
  Sprint,
  SprintCreatePayload,
  SprintUpdatePayload,
} from "../types/project.types";
import { normalizeApiResponse, successResult, type ApiResult } from "@/features/tasks/api/apiResult";
import { measureApi } from "@/features/tasks/dev/counters";
import { TASK_REQUEST_TIMEOUT_MS } from "@/features/tasks/constants/taskConstants";

type SprintListRow = Sprint & { attachments?: unknown[] };

async function postResult<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
  const response = await apiPostWithStatus<T>(path, body, false, {
    timeoutMs: TASK_REQUEST_TIMEOUT_MS,
  });
  return normalizeApiResponse<T>(response.body, response.status);
}

export async function getSprints(
  companyId: number,
  projectId: number,
): Promise<ApiResult<Sprint[]>> {
  const response = await measureApi("getSprints", () =>
    apiGetWithStatus<unknown>(
      "/sprints",
      {
        company_id: companyId,
        project_id: projectId,
      },
      { timeoutMs: TASK_REQUEST_TIMEOUT_MS },
    ),
  );
  const normalized = normalizeApiResponse<SprintListRow[]>(
    response.body,
    response.status,
  );
  if (!normalized.ok) return normalized;

  const rows = Array.isArray(normalized.data) ? normalized.data : [];
  return successResult(
    rows.map(({ attachments: _attachments, ...sprint }) => sprint as Sprint),
    normalized.raw,
  );
}

export async function createSprint(payload: SprintCreatePayload): Promise<ApiResult<Sprint>> {
  return measureApi("createSprint", () =>
    postResult<Sprint>("/sprints/create", payload),
  );
}

export async function updateSprint(
  sprintId: number,
  payload: SprintUpdatePayload,
): Promise<ApiResult<Sprint>> {
  return measureApi("updateSprint", () =>
    postResult<Sprint>(`/sprints/update/${sprintId}`, payload),
  );
}

export async function deleteSprint(sprintId: number): Promise<ApiResult<string>> {
  const response = await measureApi("deleteSprint", () =>
    apiDeleteWithStatus<unknown>(`/sprints/delete/${sprintId}`, {
      timeoutMs: TASK_REQUEST_TIMEOUT_MS,
    }),
  );
  return normalizeApiResponse<string>(response.body, response.status);
}
