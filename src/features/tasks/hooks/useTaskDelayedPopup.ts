// Server-driven delay popup (contract §3.5, §3.22, §16 T-036).
//
// The backend decides which delayed task the creator should see and when to
// check again (`next_check_at`). The device only remembers session dismissals.

import {
  extendDelayedTask,
  getDelayedPopup,
} from "@/features/tasks/api/taskApi";
import { useTasksStore } from "@/features/tasks/store/tasksStore";
import type { DelayedPopupTask } from "@/features/tasks/types/task.types";
import { showError, showSuccess } from "@/utils/toast";
import { useCallback, useEffect, useRef, useState } from "react";

const MIN_DELAY_MS = 1_000;
const MAX_DELAY_MS = 6 * 60 * 60 * 1_000;
const INITIAL_DELAY_MS = 800;

type DelayTask = { id: number; title: string; assignedTo: string };

type Options = { companyId: number | null };

function clampDelay(ms: number): number {
  if (!Number.isFinite(ms)) return MAX_DELAY_MS;
  return Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, ms));
}

function assigneeName(task: DelayedPopupTask): string {
  const person =
    task.task_assigned_to ?? task.task_assignee ?? null;
  const full = `${person?.first_name ?? ""} ${person?.last_name ?? ""}`.trim();
  if (full) return full;
  return `User #${task.asigned_to ?? ""}`;
}

export function useTaskDelayedPopup({ companyId }: Options) {
  const [delayTask, setDelayTask] = useState<DelayTask | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const dismissedRef = useRef<Set<number>>(new Set());
  const delayTaskRef = useRef<DelayTask | null>(null);

  useEffect(() => {
    delayTaskRef.current = delayTask;
  }, [delayTask]);


  useEffect(() => {
    dismissedRef.current = new Set();
    const timer = setTimeout(() => setDelayTask(null), 0);
    return () => clearTimeout(timer);
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = async () => {
      if (cancelled) return;
      let nextDelay = MAX_DELAY_MS;

      try {
        const result = await getDelayedPopup(companyId);
        if (!cancelled && result.ok) {
          const data = result.data;
          const candidate = (data.tasks ?? []).find(
            (task) => !dismissedRef.current.has(Number(task.id)),
          );

          // Do not replace a popup the user is currently looking at.
          if (candidate && !delayTaskRef.current) {
            setDelayTask({
              id: Number(candidate.id),
              title: candidate.title,
              assignedTo: assigneeName(candidate),
            });
          }

          const nextCheck = data.next_check_at
            ? Date.parse(data.next_check_at)
            : NaN;
          const serverTime = data.server_time
            ? Date.parse(data.server_time)
            : NaN;
          if (Number.isFinite(nextCheck) && Number.isFinite(serverTime)) {
            nextDelay = clampDelay(nextCheck - serverTime);
          }
        }
      } catch {
        // Network failure: retry on the maximum interval.
      }

      if (!cancelled) {
        timer = setTimeout(run, nextDelay);
      }
    };

    const initial = setTimeout(run, INITIAL_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(initial);
      if (timer) clearTimeout(timer);
    };
  }, [companyId, refreshKey]);

  const closeDelay = useCallback(() => {
    const current = delayTaskRef.current;
    if (current) dismissedRef.current.add(current.id);
    setDelayTask(null);
    setRefreshKey((key) => key + 1);
  }, []);

  const extendDelay = useCallback(
    async (effort: string, unitLabel: string) => {
      const current = delayTaskRef.current;
      if (!current || !companyId) return;
      const additional = Number(effort);
      if (!Number.isFinite(additional) || additional <= 0) return;

      const unitMap: Record<string, "minutes" | "hours" | "days"> = {
        Mins: "minutes",
        Hours: "hours",
        Days: "days",
      };
      const unit = unitMap[unitLabel] ?? "minutes";

      const result = await extendDelayedTask(current.id, {
        additional_effort: additional,
        unit,
        company_id: companyId,
      });

      if (!result.ok) {
        showError("Update Failed", result.message);
        return;
      }

      const data = result.data ?? {};
      useTasksStore.getState().patchTask(current.id, {
        ...(data.due_date !== undefined ? { due_date: data.due_date } : {}),
        ...(data.start_date !== undefined ? { start_date: data.start_date } : {}),
        ...(data.effort_hours !== undefined
          ? { effort_hours: data.effort_hours }
          : {}),
      });
      if (data.due_date === undefined && data.effort_hours === undefined) {
        useTasksStore
          .getState()
          .loadDashboard(companyId, { silent: true, force: true })
          .catch(() => {});
      }

      dismissedRef.current.add(current.id);
      setDelayTask(null);
      setRefreshKey((key) => key + 1);
      showSuccess("Task Extended", `Due date extended by ${effort} ${unitLabel}.`);
    },
    [companyId],
  );

  return { delayTask, closeDelay, extendDelay };
}


