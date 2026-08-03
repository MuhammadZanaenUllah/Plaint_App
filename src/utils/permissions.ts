import { UserData } from "@/types/auth.types";
import { TaskListItem } from "@/types/task.types";

// ─── Module Permission Keys (per GET /roles/userPermissions) ──────────────────
// Permission keys follow the "{module}-{action}" convention, e.g.
// "tasks-list", "tasks-create", "tasks-edit", "tasks-delete".
// A user's own permission keys arrive in the login payload as
// `userdata.user_permissions: string[]`.

export const TASK_PERMISSIONS = {
  list: "tasks-list",
  create: "tasks-create",
  edit: "tasks-edit",
  delete: "tasks-delete",
} as const;

/**
 * Check a permission-key list for a required key (e.g. "tasks-create").
 * When `permissions` is undefined the backend did not include the field
 * (legacy accounts), so we default to allowing access rather than locking
 * users out. An explicit empty array denies everything.
 */
export function hasPermission(
  permissions: string[] | undefined,
  required: string
): boolean {
  if (permissions == null) return true;
  return permissions.includes(required);
}

/** True when the current user may create tasks (shows the create-task FAB). */
export function canCreateTask(user?: UserData | null): boolean {
  return hasPermission(user?.user_permissions, TASK_PERMISSIONS.create);
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
