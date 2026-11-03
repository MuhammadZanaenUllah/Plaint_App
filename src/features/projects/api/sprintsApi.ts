// Sprint REST API services (contract §4.3).

import { apiDelete, apiGet, apiPost } from "@/services/api/client";
import type {
  Sprint,
  SprintCreatePayload,
  SprintUpdatePayload,
} from "../types/project.types";
import { normalizeApiResponse, successResult, type ApiResult } from "@/features/tasks/api/apiResult";

type SprintListRow = Sprint & { attachments?: unknown[] };

export async function getSprints(
  companyId: number,
  projectId: number,
): Promise<ApiResult<Sprint[]>> {
  const body = await apiGet<unknown>("/sprints", {
    company_id: companyId,
    project_id: projectId,
  });
  const normalized = normalizeApiResponse<SprintListRow[]>(body);
  if (!normalized.ok) return normalized;

  const rows = Array.isArray(normalized.data) ? normalized.data : [];
  return successResult(
    rows.map(({ attachments: _attachments, ...sprint }) => sprint as Sprint),
    normalized.raw,
  );
}

export async function createSprint(payload: SprintCreatePayload): Promise<ApiResult<Sprint>> {
  const body = await apiPost<unknown>("/sprints/create", payload);
  return normalizeApiResponse<Sprint>(body);
}

export async function updateSprint(
  sprintId: number,
  payload: SprintUpdatePayload,
): Promise<ApiResult<Sprint>> {
  const body = await apiPost<unknown>(`/sprints/update/${sprintId}`, payload);
  return normalizeApiResponse<Sprint>(body);
}

export async function deleteSprint(sprintId: number): Promise<ApiResult<string>> {
  const body = await apiDelete<unknown>(`/sprints/delete/${sprintId}`);
  return normalizeApiResponse<string>(body);
}
