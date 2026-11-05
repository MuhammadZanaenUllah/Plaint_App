// Project REST API services (contract §4).

import {
  apiGetWithStatus,
  apiPostWithStatus,
  apiUploadWithStatus,
} from "@/services/api/client";
import type {
  CreateProjectPayload,
  ProjectAttachment,
  ProjectDetailData,
  ProjectEntity,
  ProjectUser,
  UpdateProjectRequest,
} from "../types/project.types";
import { normalizeApiResponse, successResult, type ApiResult } from "@/features/tasks/api/apiResult";
import { measureApi } from "@/features/tasks/dev/counters";
import {
  TASK_REQUEST_TIMEOUT_MS,
  TASK_UPLOAD_TIMEOUT_MS,
} from "@/features/tasks/constants/taskConstants";

type ProjectListPayload = { projects?: ProjectEntity[] };

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

export async function getAllProjects(
  companyId: number,
  options: { lite?: boolean; scope?: "all" } = {},
): Promise<ApiResult<ProjectEntity[]>> {
  const params: Record<string, string | number> = { company_id: companyId };
  if (options.lite) params.lite = "true";
  if (options.scope) params.scope = options.scope;

  const normalized = await measureApi("getAllProjects", () =>
    getResult<ProjectListPayload>("/projects", params),
  );
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
  const response = await measureApi("getProjectDetail", () =>
    apiGetWithStatus<unknown>(`/projects/detail/${projectId}`, undefined, {
      timeoutMs: TASK_REQUEST_TIMEOUT_MS,
    }),
  );
  const normalized = normalizeApiResponse<ProjectDetailData>(
    response.body,
    response.status,
  );
  if (!normalized.ok) return normalized;

  const raw = response.body as Record<string, unknown> | null;
  return successResult(
    {
      project: normalized.data,
      status: Array.isArray(raw?.status) ? (raw.status as string[]) : [],
      priority: Array.isArray(raw?.priority)
        ? (raw.priority as { id: number; name: string }[])
        : [],
    },
    response.body,
  );
}

export async function createProject(
  payload: CreateProjectPayload,
): Promise<ApiResult<{ id: number }>> {
  return measureApi("createProject", () =>
    postResult<{ id: number }>("/projects/create", payload),
  );
}

export async function updateProject(
  projectId: number,
  payload: UpdateProjectRequest,
): Promise<ApiResult<string>> {
  return measureApi("updateProject", () =>
    postResult<string>(`/projects/update/${projectId}`, payload),
  );
}

export async function uploadProjectAttachment(
  projectId: number,
  formData: FormData,
): Promise<ApiResult<{ id?: number; attachment?: string }>> {
  const response = await measureApi("uploadProjectAttachment", () =>
    apiUploadWithStatus<unknown>(`/projects/attachments/${projectId}`, formData, {
      timeoutMs: TASK_UPLOAD_TIMEOUT_MS,
    }),
  );
  return normalizeApiResponse(response.body, response.status);
}

export async function deleteProjectAttachment(
  attachmentId: number,
): Promise<ApiResult<string>> {
  return measureApi("deleteProjectAttachment", () =>
    postResult<string>(`/projects/attachmentdelete/${attachmentId}`, {}),
  );
}

export async function getProjectUsers(
  companyId: number,
): Promise<ApiResult<ProjectUser[]>> {
  const normalized = await measureApi("getProjectUsers", () =>
    getResult<{ user?: ProjectUser[] }>("/username/project-users", {
      company_id: companyId,
    }),
  );
  if (!normalized.ok) return normalized;
  return successResult(normalized.data?.user ?? [], normalized.raw);
}

export type { ProjectAttachment };
