// Pure permission functions for Task Module
// Phase 1 — Foundation
// Rules must match Section 12 of TASK_MODULE_BACKEND_CONTRACT.md

import { TaskListItem } from "../types/task.types";
import { UserData } from "@/types/auth.types";

export interface UserContext {
  user: UserData | null;
  company: { company_id?: number; modules?: string[]; company_identifier?: string } | null;
}

export function isCompanyAdmin(user: UserData | null): boolean {
  if (!user) return false;
  const roleTitle = user.role_title?.trim().toLowerCase() ?? "";
  return roleTitle === "company admin";
}

export function isHead(user: UserData | null): boolean {
  if (!user) return false;
  const isHead = user.is_head !== undefined && user.is_head !== null;
  const value = String(user.is_head).trim().toLowerCase();
  return value !== "" && value !== "0" && value !== "false" && value !== "no";
}

export function hasTaskModule(company: { modules?: string[] } | null): boolean {
  if (!company?.modules) return false;
  return company.modules.some((m) => m === "Advanced Task Scheduling");
}

export function canViewTasks(user: UserData | null, company: { modules?: string[] } | null): boolean {
  if (!user) return false;
  if (!hasTaskModule(company)) return false;
  return true;
}

export function canCreateTask(user: UserData | null, company: { modules?: string[]; company_identifier?: string } | null): boolean {
  if (!user) return false;
  const admin = isCompanyAdmin(user);
  const head = isHead(user);
  return (admin || head) ? true : false;
}

export function canOpenTaskDetail(user: UserData | null): boolean {
  if (!user) return false;
  return true;
}

export function canEditTaskDetails(task: TaskListItem, user: UserData | null): boolean {
  if (!user || !task.can_edit) return false;
  if (task.status === "Complete") return false;
  return true;
}

export function canEditRecurring(task: TaskListItem, user: UserData | null): boolean {
  if (!user || !task.can_edit) return false;
  return true;
}

export function canChangeStatus(task: TaskListItem, user: UserData | null): boolean {
  if (!user || !task.can_edit_status) return false;
  return true;
}

export function canReassign(task: TaskListItem, user: UserData | null): boolean {
  if (!user || !task.can_edit) return false;
  return true;
}

export function canEditDueDate(task: TaskListItem, user: UserData | null, isAts: boolean): boolean {
  if (!user || task.status === "On-Hold") return false;
  if (!user?.can_edit) return false;
  return true;
}

export function canApproveReject(task: TaskListItem, user: UserData | null): boolean {
  if (!user) return false;
  if (task.status !== "Pending-Approval") return false;
  const admin = isCompanyAdmin(user);
  const creator = task.created_by === user.id;
  return admin || creator;
}

export function canReopen(task: TaskListItem, user: UserData | null, isAts: boolean): boolean {
  if (!user || task.status !== "Complete") return false;
  const creator = task.created_by === user.id;
  if (!creator) return false;
  if (isAts) {
    return (task.effort_hours ?? 0) > 0;
  }
  return true;
}

export function canManageAttachments(task: TaskListItem, user: UserData | null): boolean {
  if (!user || !task.can_edit) return false;
  if (task.status === "Complete") return false;
  return true;
}

export function canAssignProject(task: TaskListItem, user: UserData | null): boolean {
  if (!user || !task.can_edit) return false;
  return true;
}

export function canComment(user: UserData | null): boolean {
  if (!user) return false;
  return true;
}

export function canEditDeleteNote(note, user: UserData | null): boolean {
  if (!user) return false;
  return true;
}

export function canPinOrReact(user: UserData | null): boolean {
  if (!user) return false;
  return true;
}

export function canCreateProject(user: UserData | null): boolean {
  if (!user) return false;
  return true; // placeholder
}

export function canEditProject(project, user: UserData | null): boolean {
  if (!user) return false;
  return true; // placeholder
}

export function canCreateSprint(project, user: UserData | null): boolean {
  if (!user) return false;
  return true; // placeholder
}