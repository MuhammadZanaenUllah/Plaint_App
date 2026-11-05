// Canonical Project and Sprint types aligned with TASK_MODULE_BACKEND_CONTRACT.md §4.
//
// `src/types/project.types.ts` re-exports this file for backwards compatibility.
//
// Phase 8 removed the invalid "Pending" value. `ProjectStatus` is now a
// backwards-compatible alias of `CanonicalProjectStatus`.

import { TaskListItem } from "@/features/tasks/types/task.types";

export type CanonicalProjectStatus =
  | "Planning"
  | "In Progress"
  | "On Hold"
  | "Completed"
  | "Abandoned";

/** Legacy alias. Phase 8 removed the invalid "Pending" value. */
export type ProjectStatus = CanonicalProjectStatus;

export type Project = {
  id: number;
  name: string;
  status: ProjectStatus;
  due_date?: string | null;
  owner?: number;
  description?: string;
};

// GET /projects -> { Good: true, data: { projects: [...] } }
export type GetAllProjectsResponse = {
  Good: boolean;
  stale?: boolean;
  data: { projects: Project[] };
};

// GET /projects/list -> { Good: true, projects: [...] } (top-level)
export type GetProjectsListResponse = {
  Good: boolean;
  projects: Pick<Project, "id" | "name">[];
};

// POST /projects/create
// Legacy create request used by the unmounted ProjectContext.
export type CreateProjectRequest = {
  name: string;
  owner?: number;
  status: ProjectStatus;
  description?: string;
  company_id: number;
  company_identifier?: string;
  due_date?: string;
};

/** Canonical create payload. `due_date` is required by the contract. */
export type CreateProjectPayload = {
  name: string;
  owner?: number;
  status?: CanonicalProjectStatus;
  description?: string;
  company_id: number;
  company_identifier?: string;
  due_date: string;
};

export type CreateProjectResponse = {
  Good: boolean;
  data: { id: number };
};

// POST /projects/update/:id
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

export type DeleteProjectResponse = {
  Good: boolean;
  data: string;
};

export type ProjectAttachment = {
  id: number;
  attachment: string;
  original_name?: string;
  extension?: string;
};

// Legacy sprint shape returned by the old assumption. New code uses `Sprint`.
export type ProjectSprint = {
  id: number;
  title: string;
  date?: string;
  start_date?: string;
  end_date?: string;
  status?: string;
  name?: string;
  due_date?: string;
};

// Legacy project detail shape. Kept for the unmounted ProjectContext/UI.
export type ProjectDetail = {
  name: string;
  status: ProjectStatus;
  description: string;
  due_date: string;
  attachments: ProjectAttachment[];
  owner: number;
  created_by: number;
  created_by_user: { id: number; first_name: string; last_name?: string };
  tasks: TaskListItem[];
  sprints?: ProjectSprint[];
};

export type GetProjectDetailResponse = {
  Good: boolean;
  data: ProjectDetail;
  status: string[];
  priority: { id: number; name: string }[];
};

export type UploadAttachmentResponse = {
  Good: boolean;
};

export type DeleteAttachmentResponse = {
  Good: boolean;
};

export type ProjectUser = {
  id: number;
  first_name: string;
  last_name: string;
};

export type GetProjectUsersResponse = {
  Good: boolean;
  data: { user: ProjectUser[] };
};

// ---- Canonical Phase 1 types ----

export type ProjectEntity = {
  id: number;
  name: string;
  status: CanonicalProjectStatus;
  due_date: string; // ISO
  description?: string; // HTML
  owner?: number;
  created_by: number;
  company_id: number;
  createdAt?: string;
  updatedAt?: string;
  task_count?: number;
};

/** GET /projects/detail/:id — the contract does NOT return sprints or owner object. */
export type ProjectDetailData = {
  id: number;
  name: string;
  status: CanonicalProjectStatus;
  due_date: string;
  description: string;
  attachments: ProjectAttachment[];
  owner?: number;
  created_by: number;
  company_id: number;
  tasks: TaskListItem[];
  createdAt?: string;
  updatedAt?: string;
};

export type Sprint = {
  id: number;
  name: string;
  project_id: number;
  company_id: number;
  due_date: string; // ISO
  description?: string;
  image?: string | null;
  status: string;
  created_by: number;
  createdAt?: string;
  updatedAt?: string;
  tasks_count?: number;
};

/** UI-friendly alias used by current screens. */
export type SprintListItem = Sprint;

export type SprintCreatePayload = {
  name: string;
  due_date: string; // ISO
  project_id: number;
  company_id: number;
  created_by: number;
  company_identifier?: string;
};

// The backend copies the whole body onto the sprint, so send only the date.
export type SprintUpdatePayload = {
  due_date: string; // ISO
};

export type ProjectEditRights = {
  can_edit: boolean;
  can_change_status: boolean;
  can_assign_tasks: boolean;
  can_manage_attachments: boolean;
  can_delete: boolean;
};
