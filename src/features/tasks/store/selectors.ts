// Pure selectors for the Task stores. No React imports.

import type { TaskTabId } from "../constants/taskTabs";
import type { TaskEntity } from "../types/task.types";
import type { TasksState } from "./tasksStore";
import type { TaskFiltersState } from "./taskFiltersStore";
import { isCompletedStatus, normalizeApiStatus } from "../utils/taskStatus";
import {
  activeTasksFromBuckets,
  createActiveTabContext,
  isActiveForTabs,
  matchesActiveTab,
  selectTabEntities,
  uniqueByRecurrenceOrigin,
  uniqueTasksFromBuckets,
} from "../utils/taskTabRules";
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

type TaskFilterValues = Pick<
  TaskFiltersState,
  "searchQuery" | "status" | "priority" | "createdBy" | "assignedTo" | "dueFrom" | "dueTo"
>;

export function matchesTaskFilters(
  task: TaskEntity,
  filters: TaskFilterValues,
): boolean {
  if (
    filters.status &&
    normalizeApiStatus(String(task.status)) !==
      normalizeApiStatus(String(filters.status))
  ) {
    return false;
  }
  if (filters.priority && task.task_priority !== filters.priority) return false;
  if (
    filters.createdBy?.length &&
    !filters.createdBy.map(Number).includes(Number(task.created_by))
  ) {
    return false;
  }
  if (
    filters.assignedTo?.length &&
    !filters.assignedTo.map(Number).includes(Number(task.asigned_to))
  ) {
    return false;
  }
  if (
    filters.dueFrom &&
    (task.due_date ?? "").slice(0, 10) < filters.dueFrom
  ) {
    return false;
  }
  if (filters.dueTo && (task.due_date ?? "").slice(0, 10) > filters.dueTo) {
    return false;
  }
  if (
    filters.searchQuery?.trim() &&
    !matchesTaskSearch(task, filters.searchQuery)
  ) {
    return false;
  }
  return true;
}

export function applyTaskFilters(
  tasks: TaskEntity[],
  filters: TaskFilterValues,
): TaskEntity[] {
  return tasks.filter((task) => matchesTaskFilters(task, filters));
}

function countMatching(
  tasks: TaskEntity[],
  filters: TaskFilterValues | undefined,
): number {
  if (!filters) return tasks.length;
  let total = 0;
  for (const task of tasks) {
    if (matchesTaskFilters(task, filters)) total += 1;
  }
  return total;
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
  const filters = options.filters;
  const uniqueTasks = uniqueTasksFromBuckets(state);
  const activeTasks = activeTasksFromBuckets(state);
  const createdTasks = byBucket(state, state.createdByMeIds).filter(isActiveForTabs);
  const assignedTasks = byBucket(state, state.assignedToMeIds).filter(isActiveForTabs);
  const completedTasks = state.completedIds.length
    ? byBucket(state, state.completedIds)
    : Object.values(state.byId).filter((task) =>
        isCompletedStatus(task.status),
      );
  const pendingTasks = (
    state.pendingApprovalIds.length
      ? byBucket(state, state.pendingApprovalIds)
      : uniqueTasks.filter((task) => task.status === "Pending-Approval")
  ).filter((task) => task.status === "Pending-Approval");
  const recurringTasks = state.recurringIds.length
    ? byBucket(state, state.recurringIds)
    : Object.values(state.byId).filter((task) => task.is_recurring);

  const counts: Record<TaskTabId, number> = {
    all: 0,
    today: 0,
    week: 0,
    overdue: 0,
    created: countMatching(createdTasks, filters),
    assigned: countMatching(assignedTasks, filters),
    pendingApproval: countMatching(pendingTasks, filters),
    recurring: countMatching(recurringTasks, filters),
    completed: countMatching(completedTasks, filters),
  };

  const activeContext = createActiveTabContext(now, options);
  const todayCandidates: TaskEntity[] = [];
  for (const task of activeTasks) {
    if (matchesActiveTab(task, "today", activeContext)) {
      todayCandidates.push(task);
    }
    if (filters && !matchesTaskFilters(task, filters)) continue;
    counts.all += 1;
    if (matchesActiveTab(task, "week", activeContext)) counts.week += 1;
    if (matchesActiveTab(task, "overdue", activeContext)) counts.overdue += 1;
  }
  counts.today = countMatching(uniqueByRecurrenceOrigin(todayCandidates), filters);

  return counts;
}
