// Pure selectors for the Task stores. No React imports.

import type { TaskTabId } from "../constants/taskTabs";
import type { TaskEntity } from "../types/task.types";
import type { TasksState } from "./tasksStore";
import type { TaskFiltersState } from "./taskFiltersStore";
import { normalizeApiStatus } from "../utils/taskStatus";
import { selectTabEntities } from "../utils/taskTabRules";
import { matchesTaskSearch } from "../utils/taskSearch";
import { sortTasksByDueDate } from "../utils/taskSort";

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
  state: Pick<
    TasksState,
    | "byId"
    | "assignedToMeIds"
    | "createdByMeIds"
    | "allOtherTaskIds"
    | "recurringIds"
    | "pendingApprovalIds"
    | "completedIds"
  >,
  tab: TaskTabId,
  now: Date = new Date(),
  options: { isAts?: boolean } = {},
): TaskEntity[] {
  return selectTabEntities(state, tab, now, options);
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
    result = result.filter((task) =>
      matchesTaskSearch(task, filters.searchQuery),
    );
  }

  return result;
}

export function sortTasks(tasks: TaskEntity[]): TaskEntity[] {
  return sortTasksByDueDate(tasks);
}

export function selectTabCounts(
  state: Pick<
    TasksState,
    | "byId"
    | "assignedToMeIds"
    | "createdByMeIds"
    | "allOtherTaskIds"
    | "recurringIds"
    | "pendingApprovalIds"
    | "completedIds"
    | "completeCount"
  >,
  now: Date = new Date(),
  options: {
    isAts?: boolean;
    filters?: Pick<
      TaskFiltersState,
      "searchQuery" | "status" | "priority" | "createdBy" | "assignedTo" | "dueFrom" | "dueTo"
    >;
  } = {},
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
      const rows = selectTasksForTab(state, tab, now, { isAts: options.isAts });
      acc[tab] = options.filters
        ? applyTaskFilters(rows, options.filters).length
        : rows.length;
      return acc;
    },
    {} as Record<TaskTabId, number>,
  );
}
