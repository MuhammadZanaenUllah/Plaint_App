import type { TaskEntity } from "../types/task.types";

export function buildTaskSearchHaystack(task: TaskEntity): string {
  return [
    task.title,
    String(task.id),
    task.task_assigned_to?.first_name,
    task.task_assigned_to?.last_name,
    task.status,
    task.priority_name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function taskSearchHaystack(task: TaskEntity): string {
  return task.search_haystack ?? buildTaskSearchHaystack(task);
}

export function matchesTaskSearch(task: TaskEntity, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  return !normalized || taskSearchHaystack(task).includes(normalized);
}
