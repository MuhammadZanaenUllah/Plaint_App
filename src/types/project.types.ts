// ─── Project Module Types ─────────────────────────────────────────────────────
// Mirrors the PLANIT Backend Project API contract exactly (ProjectServices.js).

export type ProjectStatus = "Planning" | "In Progress" | "Pending" | "Completed";

export type Project = {
  id: number;
  name: string;
  status: ProjectStatus;
  due_date?: string | null;
  owner?: number;
  description?: string;
};

// GET /projects          → { Good: true, data: { projects: [...] } }
export type GetAllProjectsResponse = {
  Good: boolean;
  data: { projects: Project[] };
};

// GET /projects/list     → { Good: true, projects: [...] } (top-level, not nested)
export type GetProjectsListResponse = {
  Good: boolean;
  projects: Pick<Project, "id" | "name">[];
};

// POST /projects/create
export type CreateProjectRequest = {
  name: string;
  owner: number;
  status: ProjectStatus;
  description?: string;
  company_id: number;
  due_date?: string;
};

export type CreateProjectResponse = {
  Good: boolean;
  data: { id: number };
};

// POST /projects/update/:id — full edit, or partial (status/owner/due_date) updates
export type UpdateProjectRequest = {
  name?: string;
  owner?: number;
  status?: ProjectStatus | string;
  description?: string;
  due_date?: string;
  company_id?: number;
  company_identifier?: string;
};

export type UpdateProjectResponse = {
  Good: boolean;
  data: string;
};

// DELETE /projects/delete/:id
export type DeleteProjectResponse = {
  Good: boolean;
  data: string;
};

// GET /projects/detail/:id — status/priority are TOP-LEVEL siblings of data
export type ProjectAttachment = {
  id: number;
  attachment: string;
};

export type ProjectSprint = {
  id: number;
  title: string;
  date?: string;
  start_date?: string;
  end_date?: string;
  status?: string;
};

export type ProjectDetail = {
  name: string;
  status: ProjectStatus;
  description: string;
  due_date: string;
  attachments: ProjectAttachment[];
  owner: number;
  created_by: number;
  created_by_user: { id: number; first_name: string; last_name?: string };
  tasks: import("./task.types").TaskListItem[];
  sprints?: ProjectSprint[];
};

export type GetProjectDetailResponse = {
  Good: boolean;
  data: ProjectDetail;
  status: string[];
  priority: { id: number; name: string }[];
};

// POST /projects/attachments/:projectId
export type UploadAttachmentResponse = {
  Good: boolean;
};

// POST /projects/attachmentdelete/:attachmentId
export type DeleteAttachmentResponse = {
  Good: boolean;
};

// GET /username/project-users?company_id=  → { Good: true, data: { user: [...] } }
export type ProjectUser = {
  id: number;
  first_name: string;
  last_name: string;
};

export type GetProjectUsersResponse = {
  Good: boolean;
  data: { user: ProjectUser[] };
};