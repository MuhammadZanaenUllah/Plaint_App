import { apiDelete, apiGet, apiPost } from "./client";
import {
  CreateProjectRequest,
  CreateProjectResponse,
  DeleteAttachmentResponse,
  DeleteProjectResponse,
  GetAllProjectsResponse,
  GetProjectDetailResponse,
  GetProjectUsersResponse,
  GetProjectsListResponse,
  UpdateProjectRequest,
  UpdateProjectResponse,
  UploadAttachmentResponse,
} from "@/types/project.types";

// ─── Projects (ProjectServices.js /projects/*) ─────────────────────────────────

export async function getAllProjects(
  companyId: number
): Promise<GetAllProjectsResponse> {
  return apiGet<GetAllProjectsResponse>("/projects", { company_id: companyId });
}

export async function getAllProjectsForAssignment(
  companyId: number
): Promise<GetAllProjectsResponse> {
  return apiGet<GetAllProjectsResponse>("/projects", {
    company_id: companyId,
    scope: "all",
  });
}

export async function getProjectsList(
  companyId: number
): Promise<GetProjectsListResponse> {
  return apiGet<GetProjectsListResponse>("/projects/list", {
    company_id: companyId,
  });
}

export async function createProject(
  body: CreateProjectRequest
): Promise<CreateProjectResponse> {
  return apiPost<CreateProjectResponse>("/projects/create", body);
}

export async function updateProject(
  id: number,
  body: UpdateProjectRequest
): Promise<UpdateProjectResponse> {
  return apiPost<UpdateProjectResponse>(`/projects/update/${id}`, body);
}

export async function deleteProject(
  id: number
): Promise<DeleteProjectResponse> {
  return apiDelete<DeleteProjectResponse>(`/projects/delete/${id}`);
}

export async function getProjectDetail(
  id: number
): Promise<GetProjectDetailResponse> {
  return apiGet<GetProjectDetailResponse>(`/projects/detail/${id}`);
}

export async function uploadProjectAttachment(
  projectId: number,
  formData: FormData
): Promise<UploadAttachmentResponse> {
  return apiPost<UploadAttachmentResponse>(
    `/projects/attachments/${projectId}`,
    formData,
    true
  );
}

export async function deleteProjectAttachment(
  attachmentId: number
): Promise<DeleteAttachmentResponse> {
  return apiPost<DeleteAttachmentResponse>(
    `/projects/attachmentdelete/${attachmentId}`
  );
}

// ─── Project Users (UserService.getProjectUsers) ───────────────────────────────

export async function getProjectUsers(
  companyId: number
): Promise<GetProjectUsersResponse> {
  return apiGet<GetProjectUsersResponse>("/username/project-users", {
    company_id: companyId,
  });
}