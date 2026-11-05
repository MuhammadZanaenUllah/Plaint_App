import type { TaskEntity } from "../types/task.types";
import type { TaskTabId } from "../constants/taskTabs";
import {
  getWeekRange,
  isPktPast,
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

export function uniqueByRecurrenceOrigin(tasks: TaskEntity[]): TaskEntity[] {
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

export function uniqueTasksFromBuckets(state: TaskBuckets): TaskEntity[] {
  const allTasks = [
    ...fromIds(state, state.assignedToMeIds),
    ...fromIds(state, state.createdByMeIds),
    ...fromIds(state, state.allOtherTaskIds),
  ];
  return [...new Map(allTasks.map((task) => [task.id, task])).values()];
}

export function isActiveForTabs(task: TaskEntity): boolean {
  return !isCompletedStatus(task.status) && task.status !== "Pending-Approval";
}

export function activeTasksFromBuckets(state: TaskBuckets): TaskEntity[] {
  return uniqueTasksFromBuckets(state).filter(isActiveForTabs);
}

export type ActiveTabContext = {
  now: Date;
  todayDay: string;
  todayStartDay: string;
  week: { from: string; to: string };
  isAts: boolean;
};

export function createActiveTabContext(
  now: Date = new Date(),
  options: { isAts?: boolean } = {},
): ActiveTabContext {
  return {
    now,
    todayDay: toPktDateOnly(now),
    todayStartDay: toPktDateOnly(pktTodayStart(now)),
    week: getWeekRange(now),
    isAts: options.isAts === true,
  };
}

/** Tab membership for an already-active task (today/week/overdue/all). */
export function matchesActiveTab(
  task: TaskEntity,
  tab: TaskTabId,
  context: ActiveTabContext,
): boolean {
  if (!task.due_date) return tab === "all";
  switch (tab) {
    case "today": {
      if (toPktDateOnly(task.due_date) !== context.todayDay) return false;
      if (!context.isAts) return true;
      // ATS tasks with a scheduled time stay in Due Today until that time
      // passes (contract: due >= now). Date-only ATS tasks cover the day.
      if (!task.due_date.includes("T")) return true;
      const due = parseTaskDate(task.due_date);
      return !!due && due.getTime() >= context.now.getTime();
    }
    case "week": {
      const dueDate = toPktDateOnly(task.due_date);
      return dueDate >= context.week.from && dueDate < context.week.to;
    }
    case "overdue": {
      if (
        task.status === "Partial Complete" ||
        isOnHoldStatus(task.status)
      ) {
        return false;
      }
      if (context.isAts && task.due_date.includes("T")) {
        return isPktPast(task.due_date, context.now);
      }
      return toPktDateOnly(task.due_date) < context.todayStartDay;
    }
    case "all":
    default:
      return true;
  }
}

export function selectTabEntities(
  state: TaskBuckets,
  tab: TaskTabId,
  now: Date = new Date(),
  options: { isAts?: boolean } = {},
): TaskEntity[] {
  const uniqueTasks = uniqueTasksFromBuckets(state);
  const activeTasks = activeTasksFromBuckets(state);
  const activeContext = createActiveTabContext(now, options);

  switch (tab) {
    case "created":
      return fromIds(state, state.createdByMeIds).filter(isActiveForTabs);
    case "assigned":
      return fromIds(state, state.assignedToMeIds).filter(isActiveForTabs);
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
    case "today":
      return uniqueByRecurrenceOrigin(
        activeTasks.filter((task) => matchesActiveTab(task, tab, activeContext)),
      );
    case "week":
    case "overdue":
      return activeTasks.filter((task) =>
        matchesActiveTab(task, tab, activeContext),
      );
    case "all":
    default:
      return activeTasks;
  }
}
