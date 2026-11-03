// Opens the detail modal from a dashboard row, loading /view for full data.

import { useCallback } from "react";
import type { TaskDetail } from "@/components/TaskDetailModal";
import type { TaskRowProps } from "@/components/TaskRow";
import { viewTask } from "@/services/api/tasks.service";

type Options = {
  companyId: number | null;
  onOpen: (detail: TaskDetail, tab: "details" | "comments") => void;
};

export function useTaskDetailOpener({ companyId, onOpen }: Options) {
  const openTask = useCallback(
    async (task: TaskRowProps, tab: "details" | "comments" = "details") => {
      const raw = (task as TaskRowProps & { _raw?: Record<string, unknown> })._raw;
      if (!raw) return;

      let description = (raw.description as string | undefined) ?? "";
      let effortHours: number | undefined;
      let effortUnit: string | undefined;
      let projectName: string | undefined;

      try {
        const detailRes = await viewTask(Number(raw.id), companyId ?? 0);
        if (detailRes.Good && detailRes.data) {
          const detailTask = detailRes.data.task;
          description = detailTask?.description ?? description;
          effortHours = detailTask?.effort_hours ?? undefined;
          effortUnit = detailTask?.effort_unit ?? undefined;
          projectName = detailTask?.project_name ?? undefined;
        }
      } catch {
        // fall back to list data
      }

      const detail = {
        title: (raw.title as string) ?? "",
        assignedTo: task.assignedTo,
        assignedToInitials: task.assignedToInitials,
        dueDate: task.dueDate,
        priority: (raw.priority_name as string) ?? "Medium",
        priorityColor: (raw.priority_color as string) ?? "#F59E0B",
        approvalRequired: raw.approval_required ? "Yes" : "No",
        status: task.status as TaskDetail["status"],
        recurringTask: raw.is_recurring ? "Yes" : "No",
        dependencies: [],
        description,
        attachments: [],
        taskId: Number(raw.id),
        companyId: companyId ?? 0,
        canEditStatus: Boolean(raw.can_edit_status),
        effortHours,
        effortUnit,
        projectName,
      } as unknown as TaskDetail;

      onOpen(detail, tab);
    },
    [companyId, onOpen],
  );

  const openComments = useCallback(
    (task: TaskRowProps) => openTask(task, "comments"),
    [openTask],
  );

  return { openTask, openComments };
}
