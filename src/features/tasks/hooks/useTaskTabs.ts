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
  const paginationKey = `${companyId ?? 0}:${activeTab}:${totalCount}`;
  const [paginationState, setPaginationState] = useState<{
    key: string;
    error: boolean;
  }>({ key: paginationKey, error: false });
  const paginationError =
    paginationState.key === paginationKey ? paginationState.error : false;
  const loadingMoreRef = useRef(false);

  const pageSize =
    activeTab === "completed" ? COMPLETED_PAGE_SIZE : TASK_PAGE_SIZE;
  const visibleCount = page * pageSize;
  const hasMore =
    visibleCount < totalCount ||
    (activeTab === "completed" && hasMoreCompleted);

  const resetPagination = useCallback(() => {
    setPage(1);
    setPaginationState({ key: paginationKey, error: false });
  }, [paginationKey, setPage]);

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
      setPaginationState({ key: paginationKey, error: false });
      try {
        const startedAt = Date.now();
        const loaded = await fetchCompletedPage(companyId, completedPage + 1);
        const remaining = 180 - (Date.now() - startedAt);
        if (remaining > 0) {
          await new Promise((resolve) => setTimeout(resolve, remaining));
        }
        setPaginationState({ key: paginationKey, error: !loaded });
        if (loaded) setPage(page + 1);
      } catch {
        setPaginationState({ key: paginationKey, error: true });
      } finally {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
      return;
    }

    // Locally revealed pages are synchronous; keep the footer loader visible
    // for a short beat so the user can see that the next batch is arriving.
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setPaginationState({ key: paginationKey, error: false });
    try {
      await new Promise((resolve) => setTimeout(resolve, 150));
      if (!loadingMoreRef.current) return;
      setPage(useTaskFiltersStore.getState().page + 1);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [
    activeTab,
    companyId,
    completedPage,
    fetchCompletedPage,
    hasMore,
    hasMoreCompleted,
    loadingMore,
    page,
    paginationKey,
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
    paginationError,
    loadMore,
    resetPagination,
  };
}
