// FilterModal controller. Keeps the shared FilterModal's display values in sync
// with the dashboard filters store.

import { useCallback, useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useTaskFiltersStore } from "../store/taskFiltersStore";
import { useTaskSearch } from "./useTaskSearch";
import { normalizeApiStatus } from "../utils/taskStatus";
import { parseTaskDate, toPktDateOnly } from "../utils/taskDate";
import { apiStatusToUi } from "@/utils/statusMapper";

export type TaskFilterApplyPayload = {
  status: string | null;
  priority: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  createdBy?: number | number[] | null;
  assignedTo?: number | number[] | null;
};

function idsToValue(ids: number[]): number | number[] | null {
  if (ids.length === 0) return null;
  return ids.length === 1 ? ids[0] : ids;
}

export function useTaskFilterController(searchText: string) {
  const debouncedSearch = useTaskSearch(searchText);
  const filters = useTaskFiltersStore(
    useShallow((state) => ({
      status: state.status,
      priority: state.priority,
      createdBy: state.createdBy,
      assignedTo: state.assignedTo,
      dueFrom: state.dueFrom,
      dueTo: state.dueTo,
      filterModalVisible: state.filterModalVisible,
    })),
  );

  useEffect(() => {
    useTaskFiltersStore.getState().setSearchQuery(debouncedSearch);
  }, [debouncedSearch]);

  const open = useCallback(() => {
    useTaskFiltersStore.getState().setFilterModalVisible(true);
  }, []);

  const close = useCallback(() => {
    useTaskFiltersStore.getState().setFilterModalVisible(false);
  }, []);

  const apply = useCallback((payload: TaskFilterApplyPayload) => {
    const store = useTaskFiltersStore.getState();
    store.setStatus(
      payload.status ? normalizeApiStatus(payload.status) : null,
    );
    store.setPriority(
      payload.priority
        ? (payload.priority.toLowerCase() as "normal" | "critical")
        : null,
    );
    store.setDueRange(
      payload.startDate ? toPktDateOnly(payload.startDate) : null,
      payload.endDate ? toPktDateOnly(payload.endDate) : null,
    );
    store.setCreatedBy(
      payload.createdBy === null || payload.createdBy === undefined
        ? []
        : Array.isArray(payload.createdBy)
          ? payload.createdBy
          : [payload.createdBy],
    );
    store.setAssignedTo(
      payload.assignedTo === null || payload.assignedTo === undefined
        ? []
        : Array.isArray(payload.assignedTo)
          ? payload.assignedTo
          : [payload.assignedTo],
    );
    store.setFilterModalVisible(false);
  }, []);

  const reset = useCallback(() => {
    useTaskFiltersStore.getState().resetFilters();
  }, []);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.status) count++;
    if (filters.priority) count++;
    if (filters.createdBy.length) count++;
    if (filters.assignedTo.length) count++;
    if (filters.dueFrom || filters.dueTo) count++;
    return count;
  }, [filters]);

  const initialStatus = filters.status ? apiStatusToUi(filters.status) : null;
  const initialPriority = filters.priority
    ? filters.priority === "critical"
      ? "Critical"
      : "Normal"
    : null;
  const initialStartDate = filters.dueFrom ? parseTaskDate(filters.dueFrom) : null;
  const initialEndDate = filters.dueTo ? parseTaskDate(filters.dueTo) : null;

  return {
    visible: filters.filterModalVisible,
    open,
    close,
    apply,
    reset,
    activeFilterCount,
    initialStatus,
    initialPriority,
    initialStartDate,
    initialEndDate,
    initialCreatedBy: idsToValue(filters.createdBy),
    initialAssignedTo: idsToValue(filters.assignedTo),
  };
}
