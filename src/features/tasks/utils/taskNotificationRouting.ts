import { router } from "expo-router";

export type TaskDigestFilter = "due_today" | "overdue";

type NotificationLike = {
  typ?: string | null;
  title?: string | null;
  task_id?: number | string | null;
};

/**
 * Digest rows have task_id 0. Their `typ` is `tasks_due_today` or
 * `tasks_overdue` (title is the fallback for older rows).
 */
export function getTaskDigestFilter(
  item: NotificationLike,
): TaskDigestFilter | null {
  const taskId = Number(item.task_id ?? 0);
  if (taskId > 0) return null;

  const typ = (item.typ ?? "").toLowerCase();
  if (typ === "tasks_due_today" || typ === "tasks_due_today_digest") {
    return "due_today";
  }
  if (typ === "tasks_overdue" || typ === "tasks_overdue_digest") {
    return "overdue";
  }

  const title = (item.title ?? "").toLowerCase();
  if (title.includes("due today")) return "due_today";
  if (title.includes("overdue")) return "overdue";
  return null;
}

export function openTaskDigest(filter: TaskDigestFilter): void {
  router.push({
    pathname: "/(tabs)/tasks",
    params: { filter },
  });
}
