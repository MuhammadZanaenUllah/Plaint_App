import type { TaskEntity } from "../types/task.types";
import type { TaskTabId } from "../constants/taskTabs";
import {
  getWeekRange,
  isPktPast,
  isPktToday,
  parseTaskDate,
  pktTodayStart,
  toPktDateOnly,
} from "./taskDate";
import {
  isCompletedStatus,
  isOnHoldStatus,
} from "./taskStatus";

type TaskBuckets = Pick<
  import("../store/tasksStore").TasksState,
  | "byId"
  | "assignedToMeIds"
  | "createdByMeIds"
  | "allOtherTaskIds"
  | "recurringIds"
  | "pendingApprovalIds"
  | "completedIds"
>;

function fromIds(state: TaskBuckets, ids: number[]): TaskEntity[] {
  return ids
    .map((id) => state.byId[id])
    .filter((task): task is TaskEntity => Boolean(task));
}

function uniqueByRecurrenceOrigin(tasks: TaskEntity[]): TaskEntity[] {
  const seen = new Set<number>();
  return tasks.filter((task) => {
    const originId =
      task.recurrence_origin_id ?? (task.is_recurring ? task.id : null);
    if (originId === null) return true;
    if (seen.has(originId)) return false;
    seen.add(originId);
    return true;
  });
}

export function selectTabEntities(
  state: TaskBuckets,
  tab: TaskTabId,
  now: Date = new Date(),
  options: { isAts?: boolean } = {},
): TaskEntity[] {
  const allTasks = [
    ...fromIds(state, state.assignedToMeIds),
    ...fromIds(state, state.createdByMeIds),
    ...fromIds(state, state.allOtherTaskIds),
  ];
  const uniqueTasks = [
    ...new Map(allTasks.map((task) => [task.id, task])).values(),
  ];
  const activeTasks = uniqueTasks.filter(
    (task) =>
      !isCompletedStatus(task.status) &&
      task.status !== "Pending-Approval",
  );
  const week = getWeekRange(now);

  switch (tab) {
    case "created":
      return fromIds(state, state.createdByMeIds);
    case "assigned":
      return fromIds(state, state.assignedToMeIds);
    case "completed": {
      const completed = state.completedIds.length
        ? fromIds(state, state.completedIds)
        : Object.values(state.byId).filter((task) =>
            isCompletedStatus(task.status),
          );
      return completed.sort((a, b) =>
        String(b.completed_at ?? "").localeCompare(
          String(a.completed_at ?? ""),
        ),
      );
    }
    case "pendingApproval":
      return (state.pendingApprovalIds.length
        ? fromIds(state, state.pendingApprovalIds)
        : uniqueTasks.filter((task) => task.status === "Pending-Approval")
      ).filter((task) => task.status === "Pending-Approval");
    case "recurring":
      return state.recurringIds.length
        ? fromIds(state, state.recurringIds)
        : Object.values(state.byId).filter((task) => task.is_recurring);
    case "today": {
      const today = activeTasks.filter((task) => {
        if (!task.due_date) return false;
        if (options.isAts) {
          const due = parseTaskDate(task.due_date);
          return !!due && due.getTime() >= now.getTime();
        }
        return isPktToday(task.due_date, now);
      });
      return uniqueByRecurrenceOrigin(today);
    }
    case "week":
      return activeTasks.filter((task) => {
        if (!task.due_date) return false;
        const dueDate = toPktDateOnly(task.due_date);
        return dueDate >= week.from && dueDate < week.to;
      });
    case "overdue":
      return activeTasks.filter((task) => {
        if (
          !task.due_date ||
          task.status === "Partial Complete" ||
          isOnHoldStatus(task.status)
        ) {
          return false;
        }
        if (options.isAts) return isPktPast(task.due_date, now);
        return toPktDateOnly(task.due_date) < toPktDateOnly(pktTodayStart(now));
      });
    case "all":
    default:
      return activeTasks.filter((task) => task.status !== "Pending-Approval");
  }
}
