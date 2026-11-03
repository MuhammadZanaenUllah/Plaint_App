// Socket event types aligned with TASK_MODULE_BACKEND_CONTRACT.md §5 and §13
// Phase 1 — Foundation

import { TaskStatus, TaskPriority } from "../types/task.types";
import { TaskPerson } from "../types/task.types";

// Socket event payloads (server → client)

export interface SocketCreatePayload {
  id: number;
  title: string;
  status: TaskStatus;
  due_date: string | null;
  priority: TaskPriority;
  assignee?: TaskPerson;
  asigned_to?: TaskPerson;
  project_id?: number;
  sprint_id?: number;
  is_recurring: boolean;
  recurring_config?: {
    period: "daily" | "weekly" | "monthly" | "annually" | "semi-annually";
    time?: string;
    count?: number;
    exclude_days?: number[];
    week_day?: number;
    month_day?: number;
    annual_month?: number;
    annual_day?: number;
  };
  depends_on?: number[];
  created_by: number;
  company_id: number;
}

export interface SocketUpdatePayload {
  id: number;
  status?: TaskStatus;
  due_date?: string | null;
  priority?: TaskPriority;
  approval_required?: 0 | 1;
  is_recurring?: boolean;
  recurring_config?:
    | {
        period: "daily" | "weekly" | "monthly" | "annually" | "semi-annually";
        time?: string;
        count?: number;
        exclude_days?: number[];
        week_day?: number;
        month_day?: number;
        annual_month?: number;
        annual_day?: number;
      }
    | null;
  depends_on?: number[];
  project_id?: number;
  sprint_id?: number;
  effort_hours?: number;
  effort_unit?: "minutes" | "hours" | "days";
}

export interface SocketStatusUpdatePayload {
  id: number;
  status: TaskStatus;
  effort_hours?: number;
  task_priority?: TaskPriority;
  completed_at?: string;
  rejection_reason?: string;
}

export interface SocketScheduleUpdatePayload {
  id: number;
  start_date?: string; // ISO
  due_date?: string; // YYYY-MM-DD (normal) / ISO (ATS)
  project_id?: number;
  parent_id?: number;
  remaining_effort_hours?: number;
  effort_hours?: number;
}

export interface SocketCriticalReorderPayload {
  id: number;
  critical_order: number;
  blocked_tasks?: number;
}

export interface SocketSprintAssignedPayload {
  id: number;
  project_id: number;
  sprint_id: number;
}

export interface SocketDeletePayload {
  id: number;
  parent_id?: number;
}

export interface SocketAddNotePayload {
  task_id: string; // string from backend
  note: {
    id: number;
    text: string;
    created_at: string;
    created_by: number;
    mentions?: Array<{ id: number; name: string }>;
  };
}

export interface SocketUpdateNotePayload {
  id: number;
  task_id: string;
  text: string;
}

export interface SocketDeleteNotePayload {
  id: number;
  task_id: string;
}

export interface SocketUpdateNotePinPayload {
  id: number;
  task_id: string;
  pin_top: boolean;
}

export interface SocketUpdateNoteReactionPayload {
  id: number;
  task_id: string;
  reactions: Record<string, number>; // emoji → count
}

export interface SocketAddAttachmentPayload {
  task_id: number;
  attachment: {
    id: number;
    original_name: string;
    extension: string;
    size: number;
    url: string;
    uploadedAt: string;
  };
}

export interface SocketDeleteAttachmentPayload {
  id: number;
  task_id: number;
  attachment_id: number;
}

export interface SocketProjectUpdatePayload {
  company_id: number;
  action: "update_permissions" | "role_update";
  roleId?: number;
  permissions: string[];
}

export interface SocketPriorityUpdatePayload {
  create?: Array<{ data: { id: number; name: string; color: string; order: number } }>;
  update?: Array<{ data: { id: number; name: string; color: string; order: number } }>;
  delete?: Array<{ data: { id: number } }>;
  status_update?: SocketStatusUpdatePayload;
}

export interface SocketUserUpdatePayload {
  company_id: number;
  action: "update_permissions" | "role_update";
  roleId?: number;
  permissions: string[];
}

export interface SocketSchedulingSettingsUpdatePayload {
  create?: Array<{ data: { id: number; [key: string]: any } }>;
  update?: Array<{ data: { id: number; [key: string]: any } }>;
}