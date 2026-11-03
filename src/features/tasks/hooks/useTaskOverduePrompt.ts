// App-driven overdue summary and delay escalation prompt.
// Phase 6 will replace the device-side scan with GET /tasks/delayed-popup.

import { useCallback, useEffect, useRef, useState } from "react";
import { extendDelayedTask } from "@/services/api/tasks.service";
import { showError, showInfo, showSuccess } from "@/utils/toast";
import type { DashboardRow } from "./useTaskDashboard";

type DelayTask = { id: number; title: string; assignedTo: string };

type Options = {
  rows: DashboardRow[];
  companyId: number | null;
  currentUserId: number;
  partial?: boolean;
};

export function useTaskOverduePrompt({ rows, companyId, currentUserId, partial = false }: Options) {
  const [delayTask, setDelayTask] = useState<DelayTask | null>(null);
  const summaryShownRef = useRef(false);
  const promptedIdsRef = useRef<Set<number>>(new Set());
  const promptedThisSessionRef = useRef(false);

  useEffect(() => {
    if (!companyId || rows.length === 0 || partial) return;
    const nowMs = Date.now();

    if (!summaryShownRef.current) {
      summaryShownRef.current = true;
      let overdueCount = 0;
      for (const row of rows) {
        if (row.status === "Completed") continue;
        const due = row._raw?.due_date;
        if (!due) continue;
        const ms = Date.parse(due);
        if (!Number.isNaN(ms) && ms < nowMs) overdueCount++;
      }
      if (overdueCount > 0) {
        showInfo(
          "Overdue Tasks",
          `You have ${overdueCount} overdue task${overdueCount === 1 ? "" : "s"} that need attention.`,
        );
      }
    }

    if (
      currentUserId > 0 &&
      !delayTask &&
      !promptedThisSessionRef.current
    ) {
      let earliest: DashboardRow | null = null;
      let earliestMs = Number.POSITIVE_INFINITY;

      for (const row of rows) {
        if (row.status === "Completed") continue;
        if (row._raw?.created_by !== currentUserId) continue;
        if (row._raw?.asigned_to === currentUserId) continue;
        const id = Number(row.id);
        if (promptedIdsRef.current.has(id)) continue;
        const due = row._raw?.due_date;
        if (!due) continue;
        const ms = Date.parse(due);
        if (Number.isNaN(ms) || ms >= nowMs) continue;
        if (ms < earliestMs) {
          earliestMs = ms;
          earliest = row;
        }
      }

      if (earliest) {
        promptedThisSessionRef.current = true;
        promptedIdsRef.current.add(Number(earliest.id));
        const assignee = earliest._raw?.task_assigned_to;
        const assigneeName =
          `${assignee?.first_name ?? ""} ${assignee?.last_name ?? ""}`.trim() ||
          `User #${earliest._raw?.asigned_to ?? ""}`;
        setDelayTask({
          id: Number(earliest.id),
          title: earliest._raw?.title ?? "Task",
          assignedTo: assigneeName,
        });
      }
    }
  }, [companyId, currentUserId, delayTask, partial, rows]);

  const closeDelay = useCallback(() => setDelayTask(null), []);

  const extendDelay = useCallback(
    async (effort: string, unit: string) => {
      if (!delayTask || !companyId) return;
      const additional = Number(effort);
      if (!additional || additional <= 0) return;

      const unitMap: Record<string, "minutes" | "hours" | "days"> = {
        Mins: "minutes",
        Hours: "hours",
        Days: "days",
      };

      const target = delayTask;
      setDelayTask(null);
      try {
        await extendDelayedTask(target.id, {
          additional_effort: additional,
          unit: unitMap[unit] ?? "minutes",
          company_id: companyId,
        });
        showSuccess("Task Extended", `Due date extended by ${effort} ${unit}.`);
      } catch {
        showError("Update Failed", "Could not extend the task due date.");
      }
    },
    [companyId, delayTask],
  );

  return { delayTask, closeDelay, extendDelay };
}
