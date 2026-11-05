// Task socket event types (contract §5). Additive only.
// The shared `src/services/socket/socketService.ts` stays unchanged in Phase 1.

import type { TaskPerson, TaskPriorityLevel, TaskStatus } from "../types/task.types";

export type TaskUpdateAction =
  | "create"
  | "create_subtask"
  | "update"
  | "status_update"
  | "status_change"
  | "critical_reorder"
  | "sprint_assigned"
  | "schedule_update"
  | "delete"
  | "add_note"
  | "update_note"
  | "delete_note"
  | "update_note_pin"
  | "update_note_reaction"
  | "add_attachment"
  | "delete_attachment";

export type TaskSocketPayload = {
  company_id: number | string;
  action: TaskUpdateAction;
  data: Record<string, unknown>;
  assignee?: number;
  asigned_to?: number;
};

export type SocketCreatePayload = {
  id: number | string;
  title: string;
  status: TaskStatus;
  due_date: string | null;
  start_date?: string | null;
  priority?: number;
  task_priority?: TaskPriorityLevel;
  critical_order?: number | null;
  assignee?: number;
  asigned_to?: number;
  task_assignee?: TaskPerson;
  task_assigned_to?: TaskPerson;
  project_id?: number | null;
  sprint_id?: number | null;
  parent_id?: number;
  is_recurring?: boolean;
  approval_required?: 0 | 1;
  created_by?: number;
  company_id: number | string;
};

export type SocketUpdatePayload = Partial<SocketCreatePayload> & {
  id: number | string;
};

export type SocketStatusUpdatePayload = {
  id: number | string;
  status: TaskStatus;
  completed_at?: string;
  rejection_reason?: string;
  effort_hours?: number;
  task_priority?: TaskPriorityLevel;
};

export type SocketScheduleUpdatePayload = {
  id: number | string;
  start_date?: string | null;
  due_date?: string | null;
  effort_hours?: number;
  remaining_effort_hours?: number;
  project_id?: number;
  parent_id?: number;
};

export type SocketCriticalReorderPayload = {
  id: number | string;
  critical_order: number;
}[];

export type SocketSprintAssignedPayload = {
  id: number | string;
  project_id: number;
  sprint_id: number | null;
};

export type SocketDeletePayload = {
  id: number | string;
  parent_id?: number;
};

export type SocketAddNotePayload = {
  task_id: number | string;
  note?: unknown;
};

export type SocketUpdateNotePayload = {
  id: number | string;
  task_id?: number | string;
};

export type SocketDeleteNotePayload = SocketUpdateNotePayload;

export type SocketNotePinPayload = SocketUpdateNotePayload & { pin_top?: number | boolean };

export type SocketNoteReactionPayload = SocketUpdateNotePayload & {
  reactions?: { user_id: number; user_name: string; emoji: string }[];
};

export type SocketAttachmentPayload = {
  id?: number | string;
  task_id?: number | string;
  attachment_id?: number | string;
};

export type SocketProjectUpdatePayload = {
  company_id?: number | string;
  action: string;
  data?: Record<string, unknown>;
};

export type SocketPriorityUpdatePayload = {
  company_id?: number | string;
  action: "create" | "update" | "delete" | "status_update";
  data?: Record<string, unknown>;
};

export type SocketUserUpdatePayload = {
  company_id?: number | string;
  action: "create" | "update" | "delete" | string;
  data?: Record<string, unknown>;
};

export type SocketSchedulingSettingsUpdatePayload = {
  company_id?: number | string;
  action: "create" | "update";
  data?: Record<string, unknown>;
};
