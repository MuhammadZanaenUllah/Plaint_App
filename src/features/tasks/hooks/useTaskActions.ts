// Dashboard list actions (Phase 2 keeps the legacy action behavior; Phase 3
// rewrites this hook with the contract status/rollback rules).

import { useCallback } from "react";
import type { AssignableOwner } from "@/components/SingleTaskTable";
import type { StatusType, TaskRowProps } from "@/components/TaskRow";
import { reassignTask } from "@/services/api/tasks.service";
import { uiStatusToApi } from "@/utils/statusMapper";
import { showError } from "@/utils/toast";
import type { TaskListItem, UpdateTaskStatusRequest } from "@/types/task.types";

type Options = {
  companyId: number | undefined;
  companyIdentifier: string;
  assignedToMe: TaskListItem[];
  updateTaskStatusApi: (
    taskId: number,
    data: UpdateTaskStatusRequest,
  ) => Promise<void>;
  refresh: () => void;
  onReject: (taskId: number) => void;
};

export function useTaskActions({
  companyId,
  companyIdentifier,
  assignedToMe,
  updateTaskStatusApi,
  refresh,
  onReject,
}: Options) {
  const handleStatusChange = useCallback(
    async (targetTask: TaskRowProps, newStatus: StatusType) => {
      if (!targetTask.id || !companyId) return;

      if (newStatus === "Rejected") {
        onReject(Number(targetTask.id));
        return;
      }

      if (
        newStatus === "In-Progress" ||
        (newStatus as string) === "In Progress"
      ) {
        const hasOtherInProgress = assignedToMe.some(
          (task) =>
            ((task.status as string) === "In Progress" ||
              (task.status as string) === "In-Progress" ||
              (task.status as string) === "in_progress") &&
            String(task.id) !== String(targetTask.id),
        );
        if (hasOtherInProgress) {
          showError(
            "Action Not Allowed",
            "Another task is already in progress. You can only have one task in progress at a time.",
          );
          return;
        }
      }

      const apiStatus = uiStatusToApi(newStatus);
      try {
        await updateTaskStatusApi(Number(targetTask.id), {
          status: apiStatus,
          company_id: companyId,
          company_identifier: companyIdentifier,
        });
      } catch (error) {
        showError(
          "Status Update Failed",
          error instanceof Error
            ? error.message
            : "Failed to update task status.",
        );
      }
    },
    [assignedToMe, companyId, companyIdentifier, onReject, updateTaskStatusApi],
  );

  const handleAssigneeChange = useCallback(
    async (targetTask: TaskRowProps, owner: AssignableOwner) => {
      if (!targetTask.id || !companyId) return;
      try {
        await reassignTask(Number(targetTask.id), {
          asigned_to: owner.id,
          assignee: owner.id,
          company_id: companyId,
          company_identifier: companyIdentifier,
        });
        refresh();
      } catch {
        showError("Error", "Failed to reassign task. Please try again.");
      }
    },
    [companyId, companyIdentifier, refresh],
  );

  return { handleStatusChange, handleAssigneeChange };
}
