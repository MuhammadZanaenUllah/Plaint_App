// Canonical Task types aligned with TASK_MODULE_BACKEND_CONTRACT.md.
//
// This file is the single source of truth for Task Module types.
// `src/types/task.types.ts` re-exports everything here so existing imports keep
// working during the migration.
//
// Compatibility notes:
// - Legacy display values ("On Hold", "Completed", "Recurring") remain in the
//   unions so the current UI keeps compiling until Phases 2-5 migrate it.
// - Contract values ("On-Hold", "Complete", "Partial Complete", "Abandoned")
//   are the values new code must send/read.
// - `assignee` is the CREATOR id and `asigned_to` is the DOER id (contract §2.6).
// - `effort_hours` is always MINUTES, despite the field name.

export type TaskStatus =
  // Contract values
  | "Pending"
  | "In-Progress"
  | "On-Hold"
  | "Pending-Approval"
  | "Rejected"
  | "Complete"
  | "Partial Complete"
  | "Abandoned"
  // Legacy display aliases used by the pre-Phase-2 UI/data
  | "On Hold"
  | "Completed"
  | "Recurring";

export type CanonicalTaskStatus =
  | "Pending"
  | "In-Progress"
  | "On-Hold"
  | "Pending-Approval"
  | "Rejected"
  | "Complete"
  | "Partial Complete"
  | "Abandoned";

export type UiTaskStatus =
  | "Pending"
  | "In-Progress"
  | "On Hold"
  | "Completed"
  | "Partial Complete"
  | "Pending-Approval"
  | "Rejected"
  | "Recurring";

export type TaskPriorityLevel = "normal" | "critical";

export type RecurringPeriod =
  | "daily"
  | "weekly"
  | "monthly"
  | "annually"
  | "quarterly"
  | "semiannually"
  // Legacy spelling kept for old UI code; new code must send "semiannually".
  | "semi-annually";

export type TaskFilter =
  | "delayed"
  | "due_in_7_days"
  | "created_by_me"
  | "assigned_to_me"
  | "pending_approval"
  | "recurring"
  | "complete";

export type TaskOwner = {
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  email?: string;
  company_id?: number;
  image: string | null;
};

export type MentionUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  email?: string;
  image?: string | null;
};

/** Company priority object (legacy, still returned by list endpoints). */
export type TaskPriority = {
  id: number;
  name: string;
  color: string;
  order: number | null;
  company_id?: number;
};

export type TaskPerson = {
  id: number;
  first_name: string;
  last_name: string;
  image: string;
  role: number;
  email?: string;
  department?: number;
  is_head?: string;
};

/** Legacy row shape. Kept while the existing UI still consumes it. */
export type TaskListItem = {
  id: number;
  title: string;
  status: TaskStatus;
  due_date: string;
  priority: number;
  task_priority: TaskPriorityLevel;
  critical_order: number | null;
  assignee: number; // CREATOR id (contract §2.6)
  asigned_to: number; // DOER id (single "s", contract §2.6)
  parent_id: number;
  company_id: number;
  is_recurring: boolean;
  approval_required: number;
  created_by: number;
  module: string;
  project_id: number;
  sprint_id: number | null;
  subtask_count: number;
  notes_count: number;
  can_edit: boolean;
  can_edit_status: boolean;
  can_edit_subtask: boolean;
  description?: string;
  rejection_reason?: string;
  task_assignee: TaskPerson;
  task_assigned_to: TaskPerson;
  priority_color: string;
  priority_name: string;
  updatedAt: string;
  createdAt?: string;
  completed_at?: string | null;
  effort_hours?: number; // minutes
  effort_unit?: string;
  start_date?: string;
  project_name?: string | null;
  recurring_period?: RecurringPeriod | null;
  recurring_time?: string | null;
  recurring_total_count?: number;
  recurring_completed_count?: number;
  recurring_exclude_days?: string[];
  recurrence_origin_id?: number | null;
};

/**
 * Canonical Task row per contract §3.1. Use this in new code.
 * Fields that the list endpoints do not return are optional.
 */
export type TaskEntity = {
  id: number;
  title: string;
  status: CanonicalTaskStatus;
  due_date: string | null;
  start_date?: string | null;
  priority: number;
  priority_name?: string | null;
  priority_color?: string | null;
  task_priority: TaskPriorityLevel;
  critical_order: number | null;
  assignee: number; // CREATOR id
  asigned_to: number; // DOER id
  task_assignee?: TaskPerson | null;
  task_assigned_to?: TaskPerson | null;
  parent_id: number;
  company_id: number;
  is_recurring: boolean;
  recurring_period?: RecurringPeriod | null;
  recurring_time?: string | null;
  recurring_total_count?: number;
  recurring_completed_count?: number;
  recurring_exclude_days?: string[];
  recurrence_origin_id?: number | null;
  last_recurrence_spawned?: string | null;
  approval_required: 0 | 1;
  created_by: number;
  module: string;
  project_id: number | null;
  project_name?: string | null;
  sprint_id: number | null;
  subtask_count: number;
  notes_count: number;
  can_edit: boolean;
  can_edit_status: boolean;
  can_edit_subtask: boolean;
  effort_hours?: number; // minutes
  effort_unit?: string;
  updatedAt?: string;
  completed_at?: string | null;
};

/** List response from `/tasks/all`, `/tasks/duetoday` and `/tasks/filter`. */
export type TaskListResponse = {
  task_owner: TaskOwner[];
  priority: TaskPriority[];
  status: string[];
  tasks_assigned_to_me: TaskListItem[];
  tasksByme: TaskListItem[];
  all_other_tasks: TaskListItem[];
  // Contract additions
  team_member_ids?: string[];
  complete_count?: number;
  stale?: boolean;
  has_more?: boolean;
};

export type TaskNote = {
  id: number;
  notes: string;
  user_id: number;
  user_name: string;
  user_image: string;
  pin_top: number;
  is_edited: number | boolean;
  reactions: { user_id: number; user_name: string; emoji: string }[];
  reply_to:
    | {
        note_id?: number;
        user_id: number;
        content: string;
        id?: number;
        user_name?: string;
      }
    | null;
  created_at: string;
  createdAt?: string;
  attachment_file?: string;
  extension?: string;
  mentions?: number[];
};

export type TaskAttachment = {
  id: number;
  attachment: string;
  original_name?: string;
  extension?: string;
  module?: string;
  created_by?: number;
  mod_id?: number;
  created_at?: string;
  updated_at?: string;
  company_id?: number;
};

export type SubTask = {
  id: number;
  title: string;
  status: TaskStatus;
  due_date: string;
  subtask_count: number;
};

export type EffortHistoryEntry = {
  value: number; // minutes
  unit: string;
  action: "create" | "update" | "delay_extension" | "rejection" | "reopen" | "approval_resume";
  from_status: string;
  to_status: string;
  changed_at: string;
  changed_by: number;
  changed_by_name: string;
  changed_by_image?: string | null;
};

export type TaskDetail = {
  id: number;
  title: string;
  description: string; // HTML
  status: TaskStatus;
  due_date: string | null;
  start_date: string | null;
  priority: string;
  priority_name?: string | null;
  priority_color?: string | null;
  task_priority: TaskPriorityLevel;
  critical_order: number | null;
  approval_required: number;
  parent_id: number;
  parent_title?: string;
  project_id: number | null;
  sprint_id: number | null;
  module: string;
  company_id: number;
  asigned_to: number | { id: number; first_name?: string; last_name?: string; full_name?: string; image?: string | null };
  assignee?: number | { id: number; first_name?: string; last_name?: string; full_name?: string; image?: string | null };
  created_by:
    | number
    | { id: number; first_name?: string; last_name?: string; full_name?: string; image?: string | null };
  task_assigned_to?: TaskPerson;
  asignedd_to?: TaskPerson;
  task_assignee?: TaskPerson;
  can_edit: boolean;
  can_edit_status: boolean;
  can_edit_subtask: boolean;
  is_recurring: boolean;
  recurring_period: RecurringPeriod | null;
  recurring_time: string | null;
  recurring_total_count: number;
  recurring_completed_count?: number;
  recurring_exclude_days: string[];
  recurring_week_day: string | null;
  recurring_month_date: string | number | null;
  recurring_annual_month: string | number | null;
  recurring_annual_date: string | number | null;
  effort_hours: number; // minutes
  effort_unit: string;
  effort_history?: EffortHistoryEntry[];
  completed_at: string | null;
  completed_late?: string | number | boolean | null;
  rejection_reason?: string;
  notes_count?: number;
  subtask_count: number;
  sub_tasks: SubTask[];
  task_notes: TaskNote[];
  task_notifications: unknown[];
  task_notes_attachments: unknown[];
  task_attachments: TaskAttachment[];
  created_at?: string;
  updated_at?: string;
  // Legacy fields kept for the current detail modal; not returned by /view.
  project_name?: string | null;
  sprint_name?: string | null;
  actual_completion?: string;
  effort_logs?: unknown[];
  effort_logs_count?: number;
};

export type ViewTaskData = {
  task: TaskDetail;
};

export type CreateTaskRequest = {
  title: string;
  company_identifier: string;
  company_id: number;
  assign_to: number;
  due_date: string | null; // YYYY-MM-DD or null for ATS
  task_priority: TaskPriorityLevel;
  bump_to_front: boolean;
  status: string;
  description: string; // HTML
  is_recurring: boolean;
  recurring_period: RecurringPeriod | null;
  recurring_time: string | null;
  recurring_total_count: number;
  recurring_exclude_days: string[];
  recurring_week_day: string | null;
  recurring_month_date: number | null;
  recurring_annual_month: number | null;
  recurring_annual_date: number | null;
  approval_required: number;
  project_id: number | null;
  sprint_id: number | null;
  parent_id: number;
  effort_hours?: number; // minutes; ATS only
  effort_unit?: string;
  depends_on?: number[];
};

export type CreateTaskResult = {
  id: number;
  planningHold: boolean;
  message?: string;
  task?: TaskListItem;
};

export type UpdateTaskRequest = {
  company_id: number;
  company_identifier: string;
  title: string;
  assign_to: number;
  due_date: string | null;
  priority: number;
  status: string;
  description: string; // HTML
  is_recurring: boolean;
  recurring_period: RecurringPeriod | null;
  recurring_time: string | null;
  recurring_total_count: number;
  recurring_exclude_days: string[];
  recurring_week_day?: string | null;
  recurring_month_date?: number | string | null;
  recurring_annual_month?: number | string | null;
  recurring_annual_date?: number | string | null;
  approval_required: number;
  effort_hours?: number; // minutes; ATS only
  effort_unit?: string;
  task_priority: TaskPriorityLevel;
  bump_to_front?: boolean;
  // Legacy-only fields. New Task API code must NOT send these.
  project_id?: number;
  sprint_id?: number | null;
};

export type UpdateTaskStatusRequest = {
  status: string;
  company_id: number;
  company_identifier: string;
  effort_hours?: number; // minutes; used only when leaving Pending-Approval (ATS resume)
};

export type UpdateAssigneeRequest = {
  asigned_to: number;
  company_id: number;
  company_identifier: string;
  assignee: number;
};

export type RejectTaskRequest = {
  company_id: number;
  company_identifier: string;
  reason: string;
  additional_hours: number; // minutes
  reject_type?: "requirement_changed" | "not_completed"; // ATS only
};

export type ApproveTaskRequest = {
  company_id: number;
  company_identifier: string;
};

export type UpdateDueDateRequest = {
  duedate: string;
  company_id: number;
  company_identifier: string;
};

export type ExtendDelayedRequest = {
  additional_effort: number;
  unit?: "minutes" | "hours" | "days";
  company_id?: number;
};

export type UpdateProjectRequest = {
  project_id: number;
  sprint_id?: number | null;
  company_id: number;
  company_identifier: string;
};

export type UpdateLeadSourceRequest = {
  source: string;
  company_id: number;
  company_identifier: string;
};

export type AddNoteRequest = {
  notes: string;
  company_id: number;
  company_identifier: string;
  reply_to?: { id: number; user_name: string; content: string };
  mentions?: number[];
};

export type UpdateNoteRequest = {
  notes: string;
  company_id: number;
  company_identifier: string;
};

export type PinNoteRequest = {
  pin_top: number;
  company_id: number;
  company_identifier: string;
};

export type DeleteNoteRequest = {
  company_id: number;
  company_identifier: string;
};

export type NoteReactionRequest = {
  emoji: string;
  company_id: number;
  user_id: number;
  user_name: string;
};

export type DeleteAttachmentRequest = {
  company_id: number;
  company_identifier: string;
};

export type RecalculateScheduleRequest = {
  company_id: number;
  company_identifier: string;
  completed_at?: string;
};

export type DependencyData = {
  dependency_id?: number;
  task_id: number; // blocker id
  title: string;
  task_priority?: string;
  due_date: string;
  status: TaskStatus | string;
  assigned_to: { id?: number; full_name: string; image: string | null };
  created_by: { id?: number; full_name: string; image: string | null };
  priority_color?: string | null;
  priority_name?: string | null;
  type?: string;
};

export type AddDependencyRequest = {
  task_id: number;
  depends_on: number;
  company_id: number;
  company_identifier: string;
};

export type RemoveDependencyRequest = {
  task_id: number;
  depends_on: number;
  company_id: number;
  company_identifier: string;
};

export type ReorderCriticalRequest = {
  orderedIds: (number | string)[];
  company_id: number;
};

export type ReorderCriticalResponse = {
  Good: boolean;
  data?: string;
  blockedTasks: { id: number; title: string }[];
};

export type RescheduleReopenedRequest = {
  company_id: number;
  company_identifier: string;
  effort_hours: number;
};

export type ReopenTaskRequest = {
  company_id: number;
  company_identifier: string;
  status: string;
  priority: string; // "normal" | "critical"
  effort_hours: number; // minutes > 0
  effort_unit: string;
  bump_to_front: boolean;
};

// ---- New canonical helper types (Phase 1+) ----

export type DelayedPopupTask = TaskEntity & {
  remaining_effort_hours?: number;
};

export type DelayedPopupResponse = {
  tasks: DelayedPopupTask[];
  next_check_at: string | null;
  server_time: string;
};

export type CriticalForUserResponse = {
  tasks: TaskEntity[];
};

export type TaskListEnvelope = {
  Good: boolean;
  stale?: boolean;
  data: TaskListResponse;
};

export type TaskDetailsTabState = {
  details: boolean;
  comments: boolean;
  attachments: boolean;
  dependencies: boolean;
  effort_history: boolean;
  reopen_modal: boolean;
  resume_modal: boolean;
};

export type TaskEditRights = {
  can_edit: boolean;
  can_edit_status: boolean;
  can_edit_subtask: boolean;
  can_delete: boolean;
  can_approve: boolean;
  can_reject: boolean;
  can_reopen: boolean;
  can_resume: boolean;
  can_assign_project: boolean;
  can_assign_sprint: boolean;
};
