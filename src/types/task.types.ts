export type TaskStatus = "Pending" | "In-Progress" | "Complete" | "Pending-Approval" | "Rejected" | "Recurring" | "On-Hold";

export type UiTaskStatus = "Pending" | "In-Progress" | "Completed" | "Pending-Approval" | "Rejected" | "Recurring" | "On-Hold";

export type RecurringPeriod = "daily" | "weekly" | "monthly" | "annually" | "quarterly" | "semi-annually";

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
  email: string;
  company_id: number;
  image: string;
};

export type TaskPriority = {
  id: number;
  name: string;
  color: string;
  company_id: number;
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
  assignee: number;
  asigned_to: number;
  parent_id: number;
  company_id: number;
  is_recurring: boolean;
  approval_required: number;
  created_by: number;
  module: string;
  project_id: number;
  sprint_id: number;
  updatedAt: string;
  createdAt?: string;
  task_assignee: TaskPerson;
  task_assigned_to: TaskPerson;
  priority_color: string;
  priority_name: string;
  subtask_count: number;
  notes_count: number;
  can_edit: boolean;
  can_edit_status: boolean;
  can_edit_subtask: boolean;
  description?: string;
  rejection_reason?: string;
};

export type TaskListResponse = {
  task_owner: TaskOwner[];
  priority: TaskPriority[];
  status: string[];
  tasks_assigned_to_me: TaskListItem[];
  tasksByme: TaskListItem[];
  all_other_tasks: TaskListItem[];
};

export type TaskDetailData = {
  id: number;
  title: string;
  company_id: number;
  asigned_to: number;
  due_date: string;
  priority: number;
  approval_required: number;
  status: TaskStatus;
  description: string;
  created_by: number;
  assignee: number;
  module: string;
  parent_id: number;
  is_recurring: boolean;
  recurring_period: RecurringPeriod | null;
  recurring_time: string | null;
  recurring_total_count: number;
  recurring_completed_count?: number;
  project_id: number;
  sprint_id?: number;
  createdAt: string;
  updatedAt: string;
  rejection_reason?: string;
};

export type CreateTaskRequest = {
  title: string;
  company_identifier: string;
  company_id: number;
  assign_to: number;
  due_date: string;
  priority: number;
  approval_required: number;
  status: string;
  description: string;
  project_id: number;
  is_recurring: boolean;
  recurring_period: RecurringPeriod | null;
  recurring_time: string | null;
  recurring_total_count: number;
  recurring_exclude_days: string[];
  recurring_week_day: string | null;
  recurring_month_date: number | null;
  recurring_annual_month: number | null;
  recurring_annual_date: number | null;
  /** IDs of tasks this task depends on */
  dependency_ids?: number[];
};

export type UpdateTaskRequest = {
  title: string;
  company_id: number;
  company_identifier: string;
  asigned_to: number;
  due_date: string;
  priority: number;
  approval_required: number;
  status: string;
  description: string;
  is_recurring: boolean;
  recurring_period: RecurringPeriod | null;
  recurring_time: string | null;
  recurring_total_count: number;
  recurring_exclude_days: string[];
  project_id: number;
  sprint_id?: number;
};

export type UpdateTaskStatusRequest = {
  status: string;
  company_id: number;
  company_identifier: string;
};

export type UpdateAssigneeRequest = {
  company_id: number;
  company_identifier: string;
  assignee: number;
};

export type RejectTaskRequest = {
  rejection_reason: string;
};

export type UpdateDueDateRequest = {
  duedate: string;
  company_id: number;
  company_identifier: string;
};

export type UpdateProjectRequest = {
  project_id: number;
  company_id: number;
  company_identifier: string;
};

export type UpdateLeadSourceRequest = {
  source: string;
  company_id: number;
  company_identifier: string;
};

export type TaskNote = {
  id: number;
  module: string;
  company_id: number;
  mod_id: number;
  notes: string;
  pin_top: number;
  user_id: number;
  user_name: string;
  user_image: string;
  attachment_file: string | null;
  extension: string | null;
  created_at: string;
  reply_to: { note_id: number; user_id: number } | null;
};

export type AddNoteRequest = {
  notes: string;
  company_id: number;
  company_identifier: string;
  reply_to?: { note_id: number; user_id: number };
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
  reaction: string;
  company_id: number;
  company_identifier: string;
};

export type TaskAttachment = {
  id: number;
  mod_id: number;
  module: string;
  attachment_file: string;
  company_id: number;
  created_at: string;
};

export type DeleteAttachmentRequest = {
  company_id: number;
  company_identifier: string;
};
