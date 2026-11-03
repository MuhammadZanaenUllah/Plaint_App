// Dashboard data hook. Reads the normalized Zustand store and applies the
// active tab/search/filter rules. The screen only renders what this returns.

import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type { TaskRowProps } from "@/components/TaskRow";
import { mapTaskListItem } from "@/utils/statusMapper";
import { useTaskFiltersStore } from "../store/taskFiltersStore";
import { useTasksStore } from "../store/tasksStore";
import {
  applyTaskFilters,
  selectTasksForTab,
  sortTasks,
} from "../store/selectors";
import { useTaskTabCounts } from "./useTaskTabCounts";
import type { TaskEntity, TaskListItem, TaskOwner } from "../types/task.types";

export type DashboardRow = TaskRowProps & { _raw: TaskListItem };

const PAGE_SIZE = 20;
const COMPLETED_PAGE_SIZE = 50;

function toDashboardRow(entity: TaskEntity, owners: TaskOwner[]): DashboardRow {
  const raw = entity as unknown as TaskListItem;
  const mapped = mapTaskListItem(raw, owners);
  return {
    ...mapped,
    // Missing permission flags must be treated as false (contract §6).
    canEditStatus: raw.can_edit_status === true,
    _raw: raw,
  };
}

export function useTaskDashboard(isAts: boolean) {
  const store = useTasksStore(
    useShallow((state) => ({
      byId: state.byId,
      assignedToMeIds: state.assignedToMeIds,
      createdByMeIds: state.createdByMeIds,
      allOtherTaskIds: state.allOtherTaskIds,
      recurringIds: state.recurringIds,
      pendingApprovalIds: state.pendingApprovalIds,
      completedIds: state.completedIds,
      owners: state.owners,
      priorities: state.priorities,
      statusList: state.statusList,
      completeCount: state.completeCount,
      dueTodayCount: state.dueTodayCount,
      completedPage: state.completedPage,
      hasMoreCompleted: state.hasMoreCompleted,
      isLoading: state.isLoading,
      isPartialLoad: state.isPartialLoad,
      error: state.error,
      stale: state.stale,
      lastRefresh: state.lastRefresh,
    })),
  );

  const filters = useTaskFiltersStore(
    useShallow((state) => ({
      activeTab: state.activeTab,
      searchQuery: state.searchQuery,
      status: state.status,
      priority: state.priority,
      createdBy: state.createdBy,
      assignedTo: state.assignedTo,
      dueFrom: state.dueFrom,
      dueTo: state.dueTo,
      page: state.page,
    })),
  );

  // Tab boundaries are evaluated against the session clock. Refreshing the
  // dashboard keeps the data current; recomputing `now` per render would make
  // the memoized tab rules unstable.
  const [now] = useState(() => new Date());

  const rows = useMemo(() => {
    const scoped = selectTasksForTab(store, filters.activeTab, now, { isAts });
    const filtered = applyTaskFilters(scoped, filters);
    return (filters.activeTab === "completed" ? filtered : sortTasks(filtered)).map(
      (entity) => toDashboardRow(entity, store.owners),
    );
  }, [store, filters, now, isAts]);

  const allRows = useMemo(
    () => Object.values(store.byId).map((entity) => toDashboardRow(entity, store.owners)),
    [store.byId, store.owners],
  );

  const countFilters = useMemo(
    () => ({
      searchQuery: filters.searchQuery,
      status: filters.status,
      priority: filters.priority,
      createdBy: filters.createdBy,
      assignedTo: filters.assignedTo,
      dueFrom: filters.dueFrom,
      dueTo: filters.dueTo,
    }),
    [
      filters.searchQuery,
      filters.status,
      filters.priority,
      filters.createdBy,
      filters.assignedTo,
      filters.dueFrom,
      filters.dueTo,
    ],
  );

  const counts = useTaskTabCounts(store, now, isAts, countFilters);

  const hasActiveFilters =
    !!filters.searchQuery ||
    !!filters.status ||
    !!filters.priority ||
    filters.createdBy.length > 0 ||
    filters.assignedTo.length > 0 ||
    !!filters.dueFrom ||
    !!filters.dueTo;

  const pageSize = filters.activeTab === "completed" ? COMPLETED_PAGE_SIZE : PAGE_SIZE;
  const visibleCount = filters.page * pageSize;
  const visibleRows = useMemo(
    () => rows.slice(0, visibleCount),
    [rows, visibleCount],
  );

  return {
    rows,
    allRows,
    visibleRows,
    counts,
    pageSize,
    visibleCount,
    totalCount: rows.length,
    loading: store.isLoading,
    error: store.error,
    partial: store.isPartialLoad,
    stale: store.stale,
    completeCount: store.completeCount,
    dueTodayCount: store.dueTodayCount,
    completedPage: store.completedPage,
    hasMoreCompleted: store.hasMoreCompleted,
    filters,
    hasActiveFilters,
  };
}
