import { UserData } from "@/types/auth.types";
import { TaskListItem } from "@/types/task.types";

/**
 * True when the user is a department head. The login payload includes the
 * user's `is_head` flag (`userdata.is_head`, a string). Any non-empty value
 * that isn't a "false"-style marker ("0", "false", "no") counts as head, so
 * both "1" and "yes" style values are accepted.
 */
export function isUserHead(user?: UserData | null): boolean {
  if (!user) return false;
  if (user.is_head !== undefined && user.is_head !== null) {
    const value = String(user.is_head).trim().toLowerCase();
    return value !== "" && value !== "0" && value !== "false" && value !== "no";
  }
  return false;
}

/** True when the current user may create tasks (shows the create-task FAB).
 *  Product rule: only users with the `is_head` attribute may create tasks. */
export function canCreateTask(user?: UserData | null): boolean {
  return isUserHead(user);
}

/** True when the user holds a given module+action permission key (e.g. "chat-list"). */
export function hasPermission(
  user: UserData | null | undefined,
  permission: string
): boolean {
  if (!user) return false;
  return (user.user_permissions ?? []).includes(permission);
}

/** True when the current user has permission to create a project (shows "Add to project"). */
export function canCreateProject(user?: UserData | null): boolean {
  return hasPermission(user, "project-create");
}

// ── Chat (1:1 DMs + channels) ────────────────────────────────────────────────

/** Any chat read access — gates the DM inbox and the Channels view. */
export function canViewChat(user?: UserData | null): boolean {
  return hasPermission(user, "chat-list");
}

/** Create channels (incl. adding a channel under a project). */
export function canCreateChannel(user?: UserData | null): boolean {
  return hasPermission(user, "chat-create");
}

/** Edit a channel (rename, manage members). */
export function canEditChannel(user?: UserData | null): boolean {
  return hasPermission(user, "chat-edit");
}

/** Delete a channel. */
export function canDeleteChannel(user?: UserData | null): boolean {
  return hasPermission(user, "chat-delete");
}

// ── Projects ─────────────────────────────────────────────────────────────────

/** Any project read access — gates the Projects view / project group chats. */
export function canViewProjects(user?: UserData | null): boolean {
  return hasPermission(user, "project-list");
}

export function canEditProject(user?: UserData | null): boolean {
  return hasPermission(user, "project-edit");
}

export function canDeleteProject(user?: UserData | null): boolean {
  return hasPermission(user, "project-delete");
}

/** True when the user has project permissions to view, edit, create, or delete projects */
export function canAccessProjectsQuickMenu(user?: UserData | null): boolean {
  if (!user) return false;
  return (
    hasPermission(user, "project-list") ||
    hasPermission(user, "project-edit") ||
    hasPermission(user, "project-create") ||
    hasPermission(user, "project-delete")
  );
}

// ── Tasks ────────────────────────────────────────────────────────────────────

/** Any task read access. */
export function canViewTasks(user?: UserData | null): boolean {
  return hasPermission(user, "tasks-list");
}

export function canEditTask(task: TaskListItem, userId: number): boolean {
  return task.can_edit === true || task.created_by === userId;
}

export function canEditStatus(task: TaskListItem): boolean {
  return task.can_edit_status === true;
}

export function canDeleteTask(task: TaskListItem, userId: number): boolean {
  return task.created_by === userId;
}

export function canReassignTask(task: TaskListItem, userId: number): boolean {
  return task.created_by === userId;
}

export function canApproveReject(
  task: TaskListItem,
  userId: number,
  isAdmin: boolean
): boolean {
  return task.created_by === userId || isAdmin;
}

export function canCreateSubtask(
  task: TaskListItem,
  userId: number,
  isAdmin: boolean
): boolean {
  return task.can_edit_subtask === true || task.created_by === userId || isAdmin;
}
