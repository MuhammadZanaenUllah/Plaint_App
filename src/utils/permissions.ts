import { UserData } from "@/types/auth.types";
import { TaskListItem } from "@/types/task.types";

/**
 * True when the user is a department head. The login payload includes the
 * user's `is_head` flag (`userdata.is_head`, a string). Any non-empty value
 * that isn't a "false"-style marker ("0", "false", "no") counts as head, so
 * both "1" and "yes" style values are accepted.
 */
export function isUserHead(user?: UserData | null): boolean {
  if (!user?.is_head) return false;
  const value = String(user.is_head).trim().toLowerCase();
  return value !== "" && value !== "0" && value !== "false" && value !== "no";
}

/** True when the current user may create tasks (shows the create-task FAB).
 *  Product rule: only users with the `is_head` attribute may create tasks. */
export function canCreateTask(user?: UserData | null): boolean {
  return isUserHead(user);
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
