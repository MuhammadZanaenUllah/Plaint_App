// Pure Project/Sprint permission functions.
// Project permissions use the `project-*` keys and require the Tasks module.

import type { Company, UserData } from "@/types/auth.types";
import {
  canCreateProject as canCreateProjectTaskModule,
  canDeleteProject as canDeleteProjectTaskModule,
  canEditProject as canEditProjectTaskModule,
  canViewProjects as canViewProjectsTaskModule,
  hasPermission,
  hasTasksModule,
} from "@/features/tasks/permissions/taskPermissions";

export type PermissionCompany = Pick<Company, "company_id" | "company_identifier" | "modules"> | null;
export type PermissionUser = UserData | null;

export const PROJECT_PERMISSIONS = {
  list: "project-list",
  create: "project-create",
  edit: "project-edit",
  delete: "project-delete",
} as const;

export function canViewProjects(user: PermissionUser, company: PermissionCompany): boolean {
  return canViewProjectsTaskModule(user, company);
}

export function canCreateProject(user: PermissionUser, company: PermissionCompany): boolean {
  return canCreateProjectTaskModule(user, company);
}

export function canEditProject(user: PermissionUser, company: PermissionCompany): boolean {
  return canEditProjectTaskModule(user, company);
}

export function canDeleteProject(user: PermissionUser, company: PermissionCompany): boolean {
  return canDeleteProjectTaskModule(user, company);
}

export function canAssignTaskToProject(
  user: PermissionUser,
  company: PermissionCompany,
): boolean {
  return (
    hasTasksModule(company) &&
    hasPermission(user, "tasks-edit") &&
    hasPermission(user, PROJECT_PERMISSIONS.list)
  );
}

export function canCreateSprint(
  user: PermissionUser,
  company: PermissionCompany,
  project: { owner?: number; created_by?: number } | null,
): boolean {
  if (!user || !canViewProjects(user, company)) return false;
  // Project owner or creator may create sprints (contract §4.3).
  if (!project) return false;
  return Number(project.owner) === Number(user.id) || Number(project.created_by) === Number(user.id);
}

export function canDeleteSprint(
  user: PermissionUser,
  company: PermissionCompany,
  project: { owner?: number; created_by?: number } | null,
): boolean {
  return canCreateSprint(user, company, project);
}
