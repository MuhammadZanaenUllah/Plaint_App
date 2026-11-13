// Deep-link handling for `?taskId=` and `?filter=` push params.

import { useCallback, useEffect, useRef } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { buildTaskDetailFromViewTask, type TaskDetail } from "@/components/TaskDetailModal";
import { viewTask } from "@/services/api/tasks.service";
import { showError } from "@/utils/toast";
import { useTaskFiltersStore } from "../store/taskFiltersStore";
import type { TaskTabId } from "../constants/taskTabs";
import type { DashboardRow } from "./useTaskDashboard";

type Options = {
  rows: DashboardRow[];
  companyId: number | null;
  loading: boolean;
  onOpenTask: (row: DashboardRow) => void | Promise<void>;
  onOpenDetail: (detail: TaskDetail) => void;
};

export function useTaskDeepLink({
  rows,
  companyId,
  loading,
  onOpenTask,
  onOpenDetail,
}: Options) {
  const { taskId: taskIdParam, filter: filterParam } = useLocalSearchParams<{
    taskId?: string;
    filter?: string;
  }>();
  const handledTaskIdRef = useRef<string | null>(null);

  useEffect(() => {
    const rawFilter = Array.isArray(filterParam) ? filterParam[0] : filterParam;
    if (!rawFilter) return;

    const targetTab: TaskTabId | null =
      rawFilter === "due_today"
        ? "today"
        : rawFilter === "overdue"
          ? "overdue"
          : null;

    if (!targetTab) {
      showError(
        "Invalid task link",
        "This link uses a filter that isn't supported in the app. Please open the task from Tasks.",
      );
      router.setParams({ filter: undefined });
      return;
    }

    useTaskFiltersStore.getState().setActiveTab(targetTab);
    router.setParams({ filter: undefined });
  }, [filterParam]);

  const openTaskById = useCallback(
    async (targetId: number) => {
      const mapped = rows.find((row) => Number(row.id) === targetId);
      if (mapped) {
        await onOpenTask(mapped);
        return;
      }

      try {
        const res = await viewTask(targetId, companyId ?? 0);
        const detail = buildTaskDetailFromViewTask(res?.data, companyId ?? 0);
        if (detail) onOpenDetail(detail);
      } catch (error) {
        console.warn("[TasksScreen] Failed to open deep-linked task:", error);
        showError("Unable to open task", "Please try opening the task again.");
      }
    },
    [companyId, onOpenDetail, onOpenTask, rows],
  );

  useEffect(() => {
    const rawId = Array.isArray(taskIdParam)
      ? String(taskIdParam[0] ?? "")
      : taskIdParam
        ? String(taskIdParam)
        : "";
    if (!rawId || rawId === handledTaskIdRef.current) return;

    const targetId = Number(rawId);
    if (Number.isNaN(targetId)) {
      showError("Invalid task link", "This link does not point to a valid task.");
      router.setParams({ taskId: undefined });
      return;
    }
    if (!companyId || loading) return;

    handledTaskIdRef.current = rawId;
    openTaskById(targetId).finally(() => {
      router.setParams({ taskId: undefined });
    });
  }, [companyId, loading, openTaskById, taskIdParam]);
}
