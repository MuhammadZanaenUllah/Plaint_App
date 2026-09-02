export type TaskStatus =
  | "Pending"
  | "In-Progress"
  | "On Hold"
  | "Complete"
  | "Pending-Approval"
  | "Rejected"
  | "Recurring";

export type UiTaskStatus =
  | "Pending"
  | "In-Progress"
  | "On Hold"
  | "Completed"
  | "Pending-Approval"
  | "Rejected"
  | "Recurring";

export type RecurringPeriod =
  | "daily"
  | "weekly"
  | "monthly"
  | "annually"
  | "quarterly"
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
};

export type TaskListItem = {
  id: number;
  title: string;
  status: TaskStatus;
  due_date: string;
  priority: number;
  task_priority: "normal" | "critical";
  critical_order: number | null;
  assignee: number;
  asigned_to: number;
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
  effort_hours?: number;
  effort_unit?: string;
};

export type TaskListResponse = {
  task_owner: TaskOwner[];
  priority: TaskPriority[];
  status: string[];
  tasks_assigned_to_me: TaskListItem[];
  tasksByme: TaskListItem[];
  all_other_tasks: TaskListItem[];
};

export type TaskNote = {
  id: number;
  notes: string;
  user_id: number;
  user_name: string;
  user_image: string;
  pin_top: number;
  is_edited: number;
  reactions: { user_id: number; user_name: string; emoji: string }[];
  reply_to: { note_id: number; user_id: number; content: string } | null;
  created_at: string;
};

export type TaskAttachment = {
  id: number;
  attachment: string;
  company_id?: number;
  created_at?: string;
};

export type SubTask = {
  id: number;
  title: string;
  status: TaskStatus;
  due_date: string;
  subtask_count: number;
};

export type ViewTaskData = {
  task: {
    id: number;
    title: string;
    asigned_to:
      | number
      | {
          id: number;
          first_name?: string;
          last_name?: string;
          full_name?: string;
          image?: string | null;
        };
    created_by:
      | number
      | {
          id: number;
          first_name?: string;
          last_name?: string;
          full_name?: string;
          image?: string | null;
        };
    due_date: string;
    start_date: string;
    priority: string;
    task_priority: "normal" | "critical";
    status: TaskStatus;
    description: string;
    is_recurring: boolean;
    recurring_period: RecurringPeriod | null;
    recurring_time: string | null;
    recurring_total_count: number;
    recurring_exclude_days: string[];
    recurring_week_day: string | null;
    recurring_month_date: string | null;
    recurring_annual_month: string | null;
    recurring_annual_date: string | null;
    project_id: number | null;
    project_name: string | null;
    sprint_id: number | null;
    sprint_name: string | null;
    parent_id: number;
    subtask_count: number;
    sub_tasks: SubTask[];
    approval_required: number;
    effort_hours: number;
    effort_unit: string;
    can_edit: boolean;
    can_edit_status: boolean;
    task_notes: TaskNote[];
    task_notifications: any[];
    task_notes_attachments: any[];
    task_attachments: TaskAttachment[];
    created_at?: string;
    completed_at?: string;
    actual_completion?: string;
    effort_logs?: any[];
    effort_logs_count?: number;
  };
};

export type CreateTaskRequest = {
  title: string;
  company_identifier: string;
  company_id: number;
  assign_to: number;
  due_date: string | null;
  task_priority: "normal" | "critical";
  bump_to_front: boolean;
  status: string;
  description: string;
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
  effort_hours: number;
  effort_unit: string;
  depends_on: number[];
};

export type UpdateTaskRequest = {
  company_id: number;
  company_identifier: string;
  title: string;
  assign_to: number;
  due_date: string | null;
  priority: number;
  status: string;
  description: string;
  is_recurring: boolean;
  recurring_period: RecurringPeriod | null;
  recurring_time: string | null;
  recurring_total_count: number;
  recurring_exclude_days: string[];
  project_id: number;
  sprint_id: number | null;
  approval_required: number;
  effort_hours: number;
  effort_unit: string;
  task_priority: "normal" | "critical";
  bump_to_front: boolean;
};

export type UpdateTaskStatusRequest = {
  status: string;
  company_id: number;
  company_identifier: string;
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
  additional_hours: number;
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
  sprint_id?: number;
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
  task_id: number;
  title: string;
  task_priority: string;
  due_date: string;
  status: string;
  assigned_to: { full_name: string; image: string | null };
  created_by: { full_name: string; image: string | null };
  priority_color: string;
  priority_name: string;
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
  priority: string;
  effort_hours: number;
  effort_unit: string;
  bump_to_front: boolean;
};
