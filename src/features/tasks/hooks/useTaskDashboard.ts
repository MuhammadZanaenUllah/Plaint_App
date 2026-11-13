// Dashboard data hook. Reads the normalized Zustand store and applies the
// active tab/search/filter rules. The screen only renders what this returns.

import { useEffect, useMemo, useState } from "react";
import {
  COMPLETED_PAGE_SIZE,
  TASK_PAGE_SIZE,
} from "../constants/taskConstants";
import { useShallow } from "zustand/react/shallow";
import type { TaskRowProps } from "@/components/TaskRow";
import {
  canApproveReject,
  canReassign as canReassignTask,
  canReopen as canReopenTask,
  type PermissionCompany,
  type PermissionUser,
} from "../permissions/taskPermissions";
import { mapTaskListItem } from "@/utils/statusMapper";
import { useTaskFiltersStore } from "../store/taskFiltersStore";
import { useTasksStore } from "../store/tasksStore";
import {
  applyTaskFilters,
  selectTasksForTab,
  sortTasks,
} from "../store/selectors";
import { useTaskTabCounts } from "./useTaskTabCounts";
import { isNetworkErrorMessage } from "../utils/taskError";
import type { TaskEntity, TaskListItem, TaskOwner } from "../types/task.types";

export type DashboardRow = TaskRowProps & { _raw: TaskListItem };

type DashboardRowCacheEntry = {
  owners: TaskOwner[];
  user: PermissionUser;
  company: PermissionCompany;
  row: DashboardRow;
};

// Entity objects are stable for unchanged tasks, so paging only has to map
// the newly-arrived rows instead of re-mapping the whole loaded completed set.
const dashboardRowCache = new WeakMap<TaskEntity, DashboardRowCacheEntry>();

function toDashboardRow(
  entity: TaskEntity,
  owners: TaskOwner[],
  user: PermissionUser,
  company: PermissionCompany,
): DashboardRow {
  const cached = dashboardRowCache.get(entity);
  if (
    cached &&
    cached.owners === owners &&
    cached.user === user &&
    cached.company === company
  ) {
    return cached.row;
  }
  const raw = entity as unknown as TaskListItem;
  const mapped = mapTaskListItem(raw, owners);
  const isComplete = raw.status === "Complete" || raw.status === "Completed";
  const row: DashboardRow = {
    ...mapped,
    // Missing permission flags must be treated as false (contract §6).
    canEditStatus: raw.can_edit_status === true,
    canApproveReject: canApproveReject(raw, user),
    canReopen: isComplete && canReopenTask(raw, user, company),
    canReassign: canReassignTask(raw, user, company),
    subtaskCount: raw.subtask_count ?? 0,
    _raw: raw,
  };
  dashboardRowCache.set(entity, { owners, user, company, row });
  return row;
}

export function useTaskDashboard(
  isAts: boolean,
  user: PermissionUser,
  company: PermissionCompany,
) {
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

  // ATS Due Today/Delayed compare against "now". Refresh it every 30 seconds
  // so a task leaves Due Today when its scheduled time passes (contract §8.4,
  // VAL-41/42).
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Keep pagination out of this memo: changing `page` must not re-filter or
  // re-sort every task. Only the filter values themselves invalidate it.
  const filterValues = useMemo(
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

  const filteredEntities = useMemo(() => {
    const scoped = selectTasksForTab(store, filters.activeTab, now, { isAts });
    const filtered = applyTaskFilters(scoped, filterValues);
    return filters.activeTab === "completed" ? filtered : sortTasks(filtered);
  }, [store, filters.activeTab, filterValues, now, isAts]);

  const hasCriticalTask = useMemo(
    () =>
      isAts
        ? false
        : Object.values(store.byId).some(
            (task) => task.task_priority === "critical",
          ),
    [isAts, store.byId],
  );

  const hasAnyTask = Object.keys(store.byId).length > 0;

  const counts = useTaskTabCounts(store, now, isAts, filterValues);

  const hasActiveFilters =
    !!filters.searchQuery ||
    !!filters.status ||
    !!filters.priority ||
    filters.createdBy.length > 0 ||
    filters.assignedTo.length > 0 ||
    !!filters.dueFrom ||
    !!filters.dueTo;

  const pageSize =
    filters.activeTab === "completed" ? COMPLETED_PAGE_SIZE : TASK_PAGE_SIZE;
  const visibleCount = filters.page * pageSize;
  // Map only the rows the list can currently render. Mapping thousands of
  // completed rows up front was the main JS-thread cost while paging.
  const visibleRows = useMemo(
    () =>
      filteredEntities
        .slice(0, visibleCount)
        .map((entity) => toDashboardRow(entity, store.owners, user, company)),
    [filteredEntities, visibleCount, store.owners, user, company],
  );

  return {
    rows: visibleRows,
    visibleRows,
    counts,
    pageSize,
    visibleCount,
    totalCount: filteredEntities.length,
    hasCriticalTask,
    hasAnyTask,
    loading: store.isLoading,
    error: store.error,
    offline: isNetworkErrorMessage(store.error),
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
