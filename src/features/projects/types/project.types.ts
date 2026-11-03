// Canonical Project and Sprint types aligned with TASK_MODULE_BACKEND_CONTRACT.md
// Phase 1 — Foundation

export interface ProjectListItem {
  id: number;
  name: string;
  status: "Planning" | "In Progress" | "On Hold" | "Completed" | "Abandoned";
  due_date: string | null; // ISO date
  created_by?: number;
  company_id?: number;
  task_count?: number;
  visible_to?: "admin" | "head" | "owned" | "created" | "involved";
}

export interface ProjectDetailData {
  id: number;
  name: string;
  status: "Planning" | "In Progress" | "On Hold" | "Completed" | "Abandoned";
  due_date: string; // ISO
  description?: string;
  company_id: number;
  created_by: number;
  owner?: { id: number; name: string; initials?: string };
  tasks?: TaskListItem[]; // populated when requested
  attachments?: Array<{ id: number; name: string; extension: string; size?: number; uploadedAt: string }>;
  sprints?: SprintListItem[];
  createdAt: string;
}

export interface SprintListItem {
  id: number;
  name: string;
  due_date: string; // ISO
  status: "Planning" | "In Progress" | "Completed";
  created_by?: number;
  tasks_count?: number;
}

export interface SprintCreatePayload {
  name: string;
  due_date: string; // ISO
  project_id: number;
  company_id: number;
  created_by: number;
}

export interface ProjectEditRights {
  can_edit: boolean;
  can_change_status: boolean;
  can_assign_tasks: boolean;
  can_manage_attachments: boolean;
  can_delete: boolean;
}