// Memoized per-tab counts for the dashboard.

import { useMemo } from "react";
import type { TaskTabId } from "../constants/taskTabs";
import { selectTabCounts } from "../store/selectors";
import type { TasksState } from "../store/tasksStore";
import type { TaskFiltersState } from "../store/taskFiltersStore";

type CountState = Pick<
  TasksState,
  | "byId"
  | "assignedToMeIds"
  | "createdByMeIds"
  | "allOtherTaskIds"
  | "recurringIds"
  | "pendingApprovalIds"
  | "completedIds"
  | "completeCount"
>;

type CountFilters = Pick<
  TaskFiltersState,
  "searchQuery" | "status" | "priority" | "createdBy" | "assignedTo" | "dueFrom" | "dueTo"
>;

export function useTaskTabCounts(
  state: CountState,
  now: Date,
  isAts: boolean,
  filters: CountFilters,
): Record<TaskTabId, number> {
  return useMemo(
    () => selectTabCounts(state, now, { isAts, filters }),
    [state, now, isAts, filters],
  );
}
