// Project REST API services (contract §4).

import { apiGet, apiPost, apiUpload } from "@/services/api/client";
import type {
  CreateProjectPayload,
  ProjectAttachment,
  ProjectDetailData,
  ProjectEntity,
  ProjectUser,
  UpdateProjectRequest,
} from "../types/project.types";
import { normalizeApiResponse, successResult, type ApiResult } from "@/features/tasks/api/apiResult";

type ProjectListPayload = { projects?: ProjectEntity[] };

export async function getAllProjects(
  companyId: number,
  options: { lite?: boolean; scope?: "all" } = {},
): Promise<ApiResult<ProjectEntity[]>> {
  const params: Record<string, string | number> = { company_id: companyId };
  if (options.lite) params.lite = "true";
  if (options.scope) params.scope = options.scope;

  const body = await apiGet<unknown>("/projects", params);
  const normalized = normalizeApiResponse<ProjectListPayload>(body);
  if (!normalized.ok) return normalized;
  return successResult(normalized.data?.projects ?? [], normalized.raw);
}

export async function getProjectDetail(projectId: number): Promise<
  ApiResult<{
    project: ProjectDetailData;
    status: string[];
    priority: { id: number; name: string }[];
  }>
> {
  const body = await apiGet<unknown>(`/projects/detail/${projectId}`);
  const normalized = normalizeApiResponse<ProjectDetailData>(body);
  if (!normalized.ok) return normalized;

  const raw = body as Record<string, unknown> | null;
  return successResult(
    {
      project: normalized.data,
      status: Array.isArray(raw?.status) ? (raw.status as string[]) : [],
      priority: Array.isArray(raw?.priority)
        ? (raw.priority as { id: number; name: string }[])
        : [],
    },
    body,
  );
}

export async function createProject(
  payload: CreateProjectPayload,
): Promise<ApiResult<{ id: number }>> {
  const body = await apiPost<unknown>("/projects/create", payload);
  return normalizeApiResponse<{ id: number }>(body);
}

export async function updateProject(
  projectId: number,
  payload: UpdateProjectRequest,
): Promise<ApiResult<string>> {
  const body = await apiPost<unknown>(`/projects/update/${projectId}`, payload);
  return normalizeApiResponse<string>(body);
}

export async function uploadProjectAttachment(
  projectId: number,
  formData: FormData,
): Promise<ApiResult<{ id?: number; attachment?: string }>> {
  const body = await apiUpload<unknown>(`/projects/attachments/${projectId}`, formData);
  return normalizeApiResponse(body);
}

export async function deleteProjectAttachment(
  attachmentId: number,
): Promise<ApiResult<string>> {
  const body = await apiPost<unknown>(`/projects/attachmentdelete/${attachmentId}`, {});
  return normalizeApiResponse<string>(body);
}

export async function getProjectUsers(
  companyId: number,
): Promise<ApiResult<ProjectUser[]>> {
  const body = await apiGet<unknown>("/username/project-users", { company_id: companyId });
  const normalized = normalizeApiResponse<{ user?: ProjectUser[] }>(body);
  if (!normalized.ok) return normalized;
  return successResult(normalized.data?.user ?? [], normalized.raw);
}

export type { ProjectAttachment };
