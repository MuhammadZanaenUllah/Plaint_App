// Canonical Task types aligned with TASK_MODULE_BACKEND_CONTRACT.md
// Phase 1 — Foundation

export interface TaskOwner {
  id: number;
  first_name: string;
  last_name: string;
  full_name?: string;
  email?: string;
  company_id?: number;
  image?: string;
}

export interface TaskPerson {
  id: number;
  name: string;
  initials?: string;
}

export type TaskStatus =
  | "Pending"
  | "In-Progress"
  | "On-Hold"
  | "Complete"
  | "Pending-Approval"
  | "Rejected";

export type TaskPriority = "normal" | "critical";

export interface TaskListItem {
  id: number;
  title: string;
  status: TaskStatus;
  due_date: string | null; // YYYY-MM-DD (normal) / null (ATS)
  priority: TaskPriority;
  task_priority?: "normal" | "critical";
  critical_order?: number | null;
  assignee?: TaskPerson; // creator
  asigned_to?: TaskPerson; // doer
  project_id?: number;
  sprint_id?: number;
  is_recurring: boolean;
  recurring_config?: {
    period: "daily" | "weekly" | "monthly" | "annually" | "semi-annually";
    time?: string; // HH:mm
    count?: number;
    exclude_days?: number[];
    week_day?: number; // 0-6 for weekly
    month_day?: number; // 1-31 for monthly
    annual_month?: number; // 1-12 for annually
    annual_day?: number; // 1-31 for annually
  };
  approval_required?: 0 | 1;
  created_by?: number;
  module?: string;
  subtask_count?: number;
  notes_count?: number;
  can_edit?: boolean;
  can_edit_status?: boolean;
  can_edit_subtask?: boolean;
  priority_color?: string;
  priority_name?: string;
  effort_hours: number; // always minutes stored
  effort_unit?: "minutes" | "hours" | "days"; // UI display only; stored as minutes
  depends_on?: number[];
  parent_id?: number;
  project_name?: string;
  sprint_name?: string;
  effort_logs?: Array<{ id: number; hours: number; date: string; description?: string }>;
}

export interface TaskListResponse {
  tasks_assigned_to_me: TaskListItem[];
  tasks_created_by_me: TaskListItem[];
  all_other_tasks: TaskListItem[];
  task_owners: TaskOwner[];
  priorities: { id: number; name: string; color: string }[];
  status_list: TaskStatus[];
  total_count: number;
  due_today_count: number;
  complete_count: number;
  team_member_ids: number[];
  has_advanced_task_module: boolean;
}

export interface CreateTaskPayload {
  title: string;
  description: string; // HTML from editor
  assign_to?: number; // doer id (assignee)
  due_date: string | null; // YYYY-MM-DD or null for ATS
  priority: TaskPriority;
  status: TaskStatus;
  approval_required?: 0 | 1;
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
  project_id?: number;
  sprint_id?: number;
  effort_hours?: number; // minutes; omit for normal companies
  effort_unit?: "minutes" | "hours" | "days"; // UI only
}

export interface UpdateTaskPayload {
  title?: string;
  description?: string; // HTML
  due_date?: string | null; // YYYY-MM-DD or null
  priority?: TaskPriority;
  status?: TaskStatus;
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
  effort_hours?: number; // minutes; omit for normal
  effort_unit?: "minutes" | "hours" | "days"; // UI only
}

export interface ViewTaskData {
  task: TaskListItem;
  owners: TaskOwner[];
}

export interface TaskDetailsTabState {
  details: boolean;
  comments: boolean;
  attachments: boolean;
  dependencies: boolean;
  effort_history: boolean;
  reopen_modal: boolean;
  resume_modal: boolean;
}

export interface TaskEditRights {
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
}