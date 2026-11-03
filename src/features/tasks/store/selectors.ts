// Pure selectors for the Task stores. No React imports.
// Phase 1 scaffolding; Phase 2 connects these to the dashboard.

import type { TaskTabId } from "../constants/taskTabs";
import type { TaskEntity } from "../types/task.types";
import type { TasksState } from "./tasksStore";
import type { TaskFiltersState } from "./taskFiltersStore";
import {
  getWeekRange,
  isPktPast,
  isPktToday,
  toPktDateOnly,
} from "../utils/taskDate";
import { isCompletedStatus, normalizeApiStatus } from "../utils/taskStatus";

export function selectAllEntities(state: Pick<TasksState, "byId">): TaskEntity[] {
  return Object.values(state.byId);
}

export function selectTaskById(
  state: Pick<TasksState, "byId">,
  taskId: number | string | null | undefined,
): TaskEntity | undefined {
  if (taskId === null || taskId === undefined) return undefined;
  return state.byId[Number(taskId)];
}

function byBucket(
  state: Pick<TasksState, "byId" | "assignedToMeIds" | "createdByMeIds" | "allOtherTaskIds">,
  ids: number[],
): TaskEntity[] {
  return ids.map((id) => state.byId[id]).filter(Boolean);
}

export function selectAllTaskEntities(
  state: Pick<TasksState, "byId" | "assignedToMeIds" | "createdByMeIds" | "allOtherTaskIds">,
): TaskEntity[] {
  return [
    ...byBucket(state, state.assignedToMeIds),
    ...byBucket(state, state.createdByMeIds),
    ...byBucket(state, state.allOtherTaskIds),
  ];
}

export function selectTasksForTab(
  state: Pick<TasksState, "byId" | "assignedToMeIds" | "createdByMeIds" | "allOtherTaskIds">,
  tab: TaskTabId,
  now: Date = new Date(),
): TaskEntity[] {
  const weekRange = getWeekRange(now);

  switch (tab) {
    case "created":
      return byBucket(state, state.createdByMeIds);
    case "assigned":
      return byBucket(state, state.assignedToMeIds);
    case "completed":
      return Object.values(state.byId)
        .filter((task) => isCompletedStatus(task.status))
        .sort((a, b) =>
          String(b.completed_at ?? "").localeCompare(String(a.completed_at ?? "")),
        );
    case "pendingApproval":
      return Object.values(state.byId).filter(
        (task) => task.status === "Pending-Approval",
      );
    case "recurring":
      return Object.values(state.byId).filter((task) => task.is_recurring);
    case "today":
      return selectAllTaskEntities(state).filter(
        (task) => !isCompletedStatus(task.status) && isPktToday(task.due_date, now),
      );
    case "week":
      return selectAllTaskEntities(state).filter((task) => {
        if (!task.due_date || isCompletedStatus(task.status)) return false;
        const date = task.due_date.slice(0, 10);
        return date >= weekRange.from && date < weekRange.to;
      });
    case "overdue": {
      const today = toPktDateOnly(now);
      return selectAllTaskEntities(state).filter((task) => {
        if (!task.due_date || isCompletedStatus(task.status)) return false;
        // Timed due dates are delayed once the time passes; date-only tasks are
        // delayed from the start of the next PKT day.
        return task.due_date.includes("T")
          ? isPktPast(task.due_date, now)
          : task.due_date.slice(0, 10) < today;
      });
    }
    case "all":
    default:
      return selectAllTaskEntities(state).filter(
        (task) =>
          !isCompletedStatus(task.status) && task.status !== "Pending-Approval",
      );
  }
}

export function applyTaskFilters(
  tasks: TaskEntity[],
  filters: Pick<
    TaskFiltersState,
    "searchQuery" | "status" | "priority" | "createdBy" | "assignedTo" | "dueFrom" | "dueTo"
  >,
): TaskEntity[] {
  let result = tasks;

  if (filters.status) {
    result = result.filter(
      (task) => normalizeApiStatus(String(task.status)) === normalizeApiStatus(String(filters.status)),
    );
  }
  if (filters.priority) {
    result = result.filter((task) => task.task_priority === filters.priority);
  }
  if (filters.createdBy?.length) {
    const ids = filters.createdBy.map(Number);
    result = result.filter((task) => ids.includes(Number(task.created_by)));
  }
  if (filters.assignedTo?.length) {
    const ids = filters.assignedTo.map(Number);
    result = result.filter((task) => ids.includes(Number(task.asigned_to)));
  }
  if (filters.dueFrom) {
    result = result.filter((task) => (task.due_date ?? "").slice(0, 10) >= filters.dueFrom!);
  }
  if (filters.dueTo) {
    result = result.filter((task) => (task.due_date ?? "").slice(0, 10) <= filters.dueTo!);
  }
  if (filters.searchQuery?.trim()) {
    const query = filters.searchQuery.trim().toLowerCase();
    result = result.filter((task) => {
      const haystack = [
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
      return haystack.includes(query);
    });
  }

  return result;
}

export function sortTasks(tasks: TaskEntity[]): TaskEntity[] {
  return [...tasks].sort((a, b) => {
    const aCritical = a.task_priority === "critical" ? 0 : 1;
    const bCritical = b.task_priority === "critical" ? 0 : 1;
    if (aCritical !== bCritical) return aCritical - bCritical;

    const aOrder = a.critical_order ?? Number.MAX_SAFE_INTEGER;
    const bOrder = b.critical_order ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;

    const aDue = a.due_date ?? "9999-12-31";
    const bDue = b.due_date ?? "9999-12-31";
    if (aDue !== bDue) return aDue.localeCompare(bDue);

    return Number(a.id) - Number(b.id);
  });
}

export function selectTabCounts(
  state: Pick<TasksState, "byId" | "assignedToMeIds" | "createdByMeIds" | "allOtherTaskIds" | "completeCount">,
  now: Date = new Date(),
): Record<TaskTabId, number> {
  const tabs: TaskTabId[] = [
    "all",
    "today",
    "week",
    "overdue",
    "created",
    "assigned",
    "pendingApproval",
    "recurring",
    "completed",
  ];
  return tabs.reduce(
    (acc, tab) => {
      acc[tab] = tab === "completed"
        ? state.completeCount || selectTasksForTab(state, tab, now).length
        : selectTasksForTab(state, tab, now).length;
      return acc;
    },
    {} as Record<TaskTabId, number>,
  );
}
