// Pagination/virtualization state for the dashboard.

import { useCallback, useRef, useState } from "react";
import { useTaskFiltersStore } from "../store/taskFiltersStore";
import type { TaskTabId } from "../constants/taskTabs";
import {
  COMPLETED_PAGE_SIZE,
  TASK_PAGE_SIZE,
} from "../constants/taskConstants";

type Options = {
  companyId: number | null;
  activeTab: TaskTabId;
  totalCount: number;
  completedPage: number;
  hasMoreCompleted: boolean;
  fetchCompletedPage: (companyId: number, page: number) => Promise<boolean>;
};

export function useTaskTabs({
  companyId,
  activeTab,
  totalCount,
  completedPage,
  hasMoreCompleted,
  fetchCompletedPage,
}: Options) {
  const page = useTaskFiltersStore((store) => store.page);
  const setPage = useTaskFiltersStore((store) => store.setPage);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);

  const pageSize =
    activeTab === "completed" ? COMPLETED_PAGE_SIZE : TASK_PAGE_SIZE;
  const visibleCount = page * pageSize;
  const hasMore =
    visibleCount < totalCount ||
    (activeTab === "completed" && hasMoreCompleted);

  const resetPagination = useCallback(() => setPage(1), [setPage]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || loadingMore) return;
    if (!hasMore) return;

    if (
      activeTab === "completed" &&
      companyId &&
      visibleCount >= totalCount &&
      hasMoreCompleted
    ) {
      loadingMoreRef.current = true;
      setLoadingMore(true);
      try {
        const loaded = await fetchCompletedPage(companyId, completedPage + 1);
        if (loaded) setPage(page + 1);
      } finally {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
      return;
    }

    setPage(page + 1);
  }, [
    activeTab,
    companyId,
    completedPage,
    fetchCompletedPage,
    hasMore,
    hasMoreCompleted,
    loadingMore,
    page,
    setPage,
    totalCount,
    visibleCount,
  ]);

  return {
    page,
    pageSize,
    visibleCount,
    hasMore,
    loadingMore,
    loadMore,
    resetPagination,
  };
}
