// Project API services
// Phase 1 — Foundation
// Aligned with TASK_MODULE_BACKEND_CONTRACT.md §4

import { apiGet, apiPost } from "@/services/api/client";
import { API_BASE_URL } from "@/config/env";
import { parseApiResponse, extractError } from "@/features/tasks/api/error-extractor";
import { ProjectListItem, ProjectDetailData, SprintListItem, SprintCreatePayload } from "@/features/projects/types/project.types";

const BASE_URL = API_BASE_URL;

// ---- API-P-01: /projects ----
export async function getVisibleProjects(companyId: number): Promise<ProjectListItem[]> {
  const res = await apiGet<ProjectListItem[]>(`/projects?company_id=${companyId}`, {});
  const { body, good } = parseApiResponse(res);

  if (!good) {
    throw new Error(extractError((body as any)?.error || (body as any)?.message));
  }

  return body as ProjectListItem[];
}

// ---- API-P-02: /projects?scope=all&lite=true ----
export async function getAllProjectsForPicker(companyId: number): Promise<ProjectListItem[]> {
  const res = await apiGet<ProjectListItem[]>(`/projects?company_id=${companyId}&scope=all&lite=true`, {});
  const { body, good } = parseApiResponse(res);

  if (!good) {
    throw new Error(extractError((body as any)?.error || (body as any)?.message));
  }

  return body as ProjectListItem[];
}

// ---- API-P-04: /projects/create ----
export async function createProject(payload: {
  name: string;
  due_date: string;
  company_id: number;
  company_identifier: string;
}): Promise<ProjectListItem> {
  const body = { ...payload, company_id: payload.company_id, company_identifier: payload.company_identifier };
  const res = await apiPost<{ project: ProjectListItem }>(`/projects/create`, body);
  const { body: result, good } = parseApiResponse(res);

  if (!good) {
    throw new Error(extractError((result as any)?.error || (result as any)?.message));
  }

  return result.project;
}

// ---- API-P-05: /projects/update/:id ----
export async function updateProject(projectId: number, payload: {
  status?: string;
  due_date?: string;
}): Promise<ProjectListItem> {
  const res = await apiPost<{ project: ProjectListItem }>(`/projects/update/${projectId}`, payload);
  const { body, good } = parseApiResponse(res);

  if (!good) {
    throw new Error(extractError((body as any)?.error || (body as any)?.message));
  }

  return body.project;
}

// ---- API-P-06: /projects/delete/:id ----
// NO UI - out of scope

// ---- API-P-07: /projects/detail/:id ----
export async function getProjectDetail(projectId: number): Promise<ProjectDetailData> {
  const res = await apiGet<ProjectDetailData>(`/projects/detail/${projectId}`, {});
  const { body, good } = parseApiResponse(res);

  if (!good) {
    throw new Error(extractError((body as any)?.error || (body as any)?.message));
  }

  return body;
}

// ---- API-P-08: /projects/attachments/:projectId ----
// PARTIALLY IMPLEMENTED - placeholder

// ---- API-P-09: /projects/attachmentdelete/:attachmentId ----
// PARTIALLY IMPLEMENTED - placeholder

// ---- API-P-10: /username/project-users ----
export async function getProjectUsers(username: string): Promise<{ id: number; name: string; role: string }[]> {
  const res = await apiGet<{ users: Array<{ id: number; name: string; role: string }> }>(
    `/username/project-users?username=${username}`,
    {}
  );
  const { body, good } = parseApiResponse(res);

  if (!good) {
    throw new Error(extractError((body as any)?.error || (body as any)?.message));
  }

  return body.users;
}

// ---- API-S-01: /sprints?company_id=&project_id= ----
export async function getProjectSprints(companyId: number, projectId: number): Promise<SprintListItem[]> {
  const res = await apiGet<SprintListItem[]>(`/sprints?company_id=${companyId}&project_id=${projectId}`, {});
  const { body, good } = parseApiResponse(res);

  if (!good) {
    throw new Error(extractError((body as any)?.error || (body as any)?.message));
  }

  return body;
}

// ---- API-S-02: /sprints/create ----
export async function createSprint(payload: SprintCreatePayload): Promise<SprintListItem> {
  const res = await apiPost<SprintListItem>(`/sprints/create`, payload);
  const { body, good } = parseApiResponse(res);

  if (!good) {
    throw new Error(extractError((body as any)?.error || (body as any)?.message));
  }

  return body;
}

// ---- API-S-03: /sprints/update/:id ----
export async function updateSprint(projectId: number, sprintId: number, payload: { due_date: string }): Promise<SprintListItem> {
  const res = await apiPost<SprintListItem>(`/sprints/update/${sprintId}`, payload);
  const { body, good } = parseApiResponse(res);

  if (!good) {
    throw new Error(extractError((body as any)?.error || (body as any)?.message));
  }

  return body;
}

// ---- API-S-04: /sprints/delete/:id ----
// Delete sets tasks' sprint_id = null; out of mobile scope for now

export {
  BASE_URL,
  parseApiResponse,
  extractError,
};