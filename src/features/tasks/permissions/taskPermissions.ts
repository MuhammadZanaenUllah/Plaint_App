// Pure Task permission functions.
// Rules: contract §6 + §12 of the implementation plan.
// IMPORTANT: a missing `can_*` flag must be treated as false.

import type { Company, UserData } from "@/types/auth.types";
import type { TaskListItem } from "../types/task.types";

export type PermissionCompany = Pick<Company, "company_id" | "company_identifier" | "modules"> | null;
export type PermissionUser = UserData | null;

export const TASK_PERMISSIONS = {
  list: "tasks-list",
  create: "tasks-create",
  edit: "tasks-edit",
  delete: "tasks-delete",
} as const;

export const PROJECT_PERMISSIONS = {
  list: "project-list",
  create: "project-create",
  edit: "project-edit",
  delete: "project-delete",
} as const;

export function isCompanyAdmin(user: PermissionUser): boolean {
  return (user?.role_title ?? "").trim().toLowerCase() === "company admin";
}

export function isHead(user: PermissionUser): boolean {
  return String(user?.is_head ?? "").trim().toLowerCase() === "yes";
}

export function hasPermission(user: PermissionUser, permission: string): boolean {
  return Array.isArray(user?.user_permissions) && user.user_permissions.includes(permission);
}

export function hasTasksModule(company: PermissionCompany): boolean {
  return Array.isArray(company?.modules) && company.modules.includes("Tasks");
}

export function hasAdvancedTaskModule(company: PermissionCompany): boolean {
  return Array.isArray(company?.modules) && company.modules.includes("Advanced Task Scheduling");
}

export const hasTaskModule = hasTasksModule;

export function canViewTasks(user: PermissionUser, company: PermissionCompany): boolean {
  return !!user && hasTasksModule(company) && hasPermission(user, TASK_PERMISSIONS.list);
}

export function canCreateTask(user: PermissionUser, company: PermissionCompany): boolean {
  if (!user || !hasTasksModule(company)) return false;
  if (!hasPermission(user, TASK_PERMISSIONS.create)) return false;
  return isCompanyAdmin(user) || isHead(user);
}

export function canOpenTaskDetail(user: PermissionUser, company?: PermissionCompany): boolean {
  if (!user) return false;
  return company ? canViewTasks(user, company) : true;
}

function isCreator(task: Pick<TaskListItem, "created_by">, user: PermissionUser): boolean {
  return !!user && Number(task.created_by) === Number(user.id);
}

function isCompleted(task: Pick<TaskListItem, "status">): boolean {
  return task.status === "Complete" || task.status === "Completed";
}

export function canEditTaskDetails(
  task: TaskListItem,
  user: PermissionUser,
  _company?: PermissionCompany,
): boolean {
  if (!user || !task.can_edit) return false;
  if (!hasPermission(user, TASK_PERMISSIONS.edit)) return false;
  if (isCompleted(task)) return false;
  return true;
}

export function canEditRecurring(
  task: TaskListItem,
  user: PermissionUser,
  company?: PermissionCompany,
): boolean {
  return task.is_recurring && canEditTaskDetails(task, user, company);
}

export function canChangeStatus(task: TaskListItem, _user?: PermissionUser): boolean {
  return task.can_edit_status === true;
}

export function canChangeStatusTo(
  task: TaskListItem,
  user: PermissionUser,
  company: PermissionCompany,
  next: string,
): boolean {
  if (!canChangeStatus(task, user)) return false;
  if (next === "Rejected") return canApproveReject(task, user);
  if (next === "Pending-Approval") return false;
  if (next === "Abandoned") return false;
  if (next === "Partial Complete") return (task.subtask_count ?? 0) > 0;
  return hasTasksModule(company);
}

export function canReassign(
  task: TaskListItem,
  user: PermissionUser,
  company?: PermissionCompany,
): boolean {
  if (!user || !hasPermission(user, TASK_PERMISSIONS.edit)) return false;
  // Only the creator; `can_edit` is true only for the creator.
  return task.can_edit === true && (!company || hasTasksModule(company));
}

export function canEditDueDate(
  task: TaskListItem,
  user: PermissionUser,
  isAtsOrCompany: boolean | PermissionCompany,
): boolean {
  const isAts =
    typeof isAtsOrCompany === "boolean"
      ? isAtsOrCompany
      : hasAdvancedTaskModule(isAtsOrCompany ?? null);
  if (isAts) return false; // ATS due date is read-only
  if (!user || !hasPermission(user, TASK_PERMISSIONS.edit)) return false;
  if (task.can_edit !== true) return false;
  if (isCompleted(task) || task.status === "On-Hold" || task.status === "On Hold") return false;
  return true;
}

export function canApproveReject(task: TaskListItem, user: PermissionUser): boolean {
  if (!user) return false;
  if (task.status !== "Pending-Approval") return false;
  return isCompanyAdmin(user) || isCreator(task, user);
}

export function canReopen(
  task: TaskListItem,
  user: PermissionUser,
  _company?: PermissionCompany,
): boolean {
  if (!user) return false;
  if (!isCreator(task, user)) return false;
  // ATS /reopen requires a NEW effort value in the modal, not an existing one.
  return isCompleted(task) || task.status === "On-Hold" || task.status === "On Hold";
}

export function canManageAttachments(
  task: TaskListItem,
  user: PermissionUser,
  company?: PermissionCompany,
): boolean {
  return canEditTaskDetails(task, user, company);
}

export function canAssignProject(
  task: TaskListItem,
  user: PermissionUser,
  company?: PermissionCompany,
): boolean {
  return (
    canEditTaskDetails(task, user, company) && hasPermission(user, PROJECT_PERMISSIONS.list)
  );
}

export function canAssignSprint(
  task: TaskListItem,
  user: PermissionUser,
  company?: PermissionCompany,
): boolean {
  return canAssignProject(task, user, company);
}

export function canComment(user: PermissionUser, company?: PermissionCompany): boolean {
  return !!user && hasPermission(user, TASK_PERMISSIONS.list) && (!company || hasTasksModule(company));
}

export function canEditDeleteNote(
  note: { user_id?: number },
  user: PermissionUser,
): boolean {
  if (!user) return false;
  return Number(note.user_id) === Number(user.id) && hasPermission(user, TASK_PERMISSIONS.edit);
}

export function canPinOrReact(user: PermissionUser): boolean {
  return hasPermission(user, TASK_PERMISSIONS.edit);
}

export function canCreateSubtask(): boolean {
  return false; // subtask creation UI is out of scope (contract T-044)
}

export function canDeleteTask(
  task: TaskListItem,
  user: PermissionUser,
  company: PermissionCompany,
): boolean {
  return (
    !!user &&
    hasPermission(user, TASK_PERMISSIONS.delete) &&
    hasTasksModule(company) &&
    (task.can_edit === true || task.can_edit_status === true)
  );
}

// ---- Project permissions ----

export function canViewProjects(user: PermissionUser, company: PermissionCompany): boolean {
  return !!user && hasTasksModule(company) && hasPermission(user, PROJECT_PERMISSIONS.list);
}

export function canCreateProject(user: PermissionUser, company: PermissionCompany): boolean {
  return canViewProjects(user, company) && hasPermission(user, PROJECT_PERMISSIONS.create);
}

export function canEditProject(user: PermissionUser, company: PermissionCompany): boolean {
  return canViewProjects(user, company) && hasPermission(user, PROJECT_PERMISSIONS.edit);
}

export function canDeleteProject(user: PermissionUser, company: PermissionCompany): boolean {
  return canViewProjects(user, company) && hasPermission(user, PROJECT_PERMISSIONS.delete);
}

export function canManageProjectAttachments(
  user: PermissionUser,
  company: PermissionCompany,
): boolean {
  return canEditProject(user, company);
}
