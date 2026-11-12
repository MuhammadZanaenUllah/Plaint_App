import { useCallback } from "react";
import type { AssignableOwner } from "@/components/SingleTaskTable";
import type { StatusType, TaskRowProps } from "@/components/TaskRow";
import {
  approveTask,
  recalculateSchedule,
  reassignTask,
} from "../api/taskApi";
import {
  canApproveReject,
  canChangeStatus,
  canChangeStatusTo,
  canReassign,
  canReopen,
  type PermissionCompany,
  type PermissionUser,
} from "../permissions/taskPermissions";
import { useTasksStore } from "../store/tasksStore";
import type { TaskListItem, UpdateTaskStatusRequest } from "../types/task.types";
import {
  canTransitionStatus,
  isCompletedStatus,
  normalizeApiStatus,
  toApiStatus,
} from "../utils/taskStatus";
import {
  isCompletionReady,
  shouldRecalculateAfterStatus,
  shouldRouteAtsReopen,
  shouldRouteAtsResume,
} from "../utils/taskActionRules";
import { taskErrorMessage } from "../utils/taskError";
import { showError, showInfo, showSuccess } from "@/utils/toast";

type Options = {
  companyId: number | undefined;
  companyIdentifier: string;
  company: PermissionCompany;
  user: PermissionUser;
  isAts: boolean;
  updateTaskStatusApi: (
    taskId: number,
    data: UpdateTaskStatusRequest,
  ) => Promise<void>;
  refresh: () => void;
  onReject: (taskId: number) => void;
  onReopen: (taskId: number) => void;
  onResume: (taskId: number, status: "In-Progress" | "Pending") => void;
};

function getTask(row: TaskRowProps): TaskListItem | undefined {
  return row._raw;
}

function getTaskId(row: TaskRowProps): number {
  return Number(row.id);
}

export function useTaskActions({
  companyId,
  companyIdentifier,
  company,
  user,
  isAts,
  updateTaskStatusApi,
  refresh,
  onReject,
  onReopen,
  onResume,
}: Options) {
  const recalculate = useCallback(
    async (taskId: number, completedAt?: string) => {
      if (!isAts || !companyId) return;
      try {
        const result = await recalculateSchedule(taskId, {
          company_id: companyId,
          company_identifier: companyIdentifier,
          completed_at: completedAt,
        });
        if (!result.ok) {
          showError("Schedule Update Failed", result.message);
        }
      } catch (error) {
        showError(
          "Schedule Update Failed",
          taskErrorMessage(error, "Failed to recalculate the task schedule."),
        );
      }
    },
    [companyId, companyIdentifier, isAts],
  );

  const handleStatusChange = useCallback(
    async (targetTask: TaskRowProps, newStatus: StatusType) => {
      const task = getTask(targetTask);
      const taskId = getTaskId(targetTask);
      if (!task || !Number.isFinite(taskId) || !companyId) {
        showError("Status Update Failed", "Task details are unavailable. Refresh and try again.");
        return;
      }

      const currentStatus = normalizeApiStatus(String(task.status));
      const requestedStatus = normalizeApiStatus(String(newStatus));

      if (requestedStatus === "Rejected") {
        if (!canApproveReject(task, user)) {
          showInfo("Not Allowed", "Only the task creator or company admin can reject this task.");
          return;
        }
        // ATS and normal both use the reject modal from the list.
        onReject(taskId);
        return;
      }

      // ATS Complete/On-Hold reopening needs the priority + effort modal.
      if (shouldRouteAtsReopen(currentStatus, requestedStatus, isAts)) {
        if (!canReopen(task, user, company)) {
          showInfo("Not Allowed", "Only the task creator can reopen this task.");
          return;
        }
        onReopen(taskId);
        return;
      }

      // ATS Pending-Approval doers use the Resume modal from the list.
      if (shouldRouteAtsResume(currentStatus, requestedStatus, isAts)) {
        if (!canChangeStatus(task, user)) {
          showInfo("Not Allowed", "You don't have permission to change this task's status.");
          return;
        }
        onResume(taskId, requestedStatus as "In-Progress" | "Pending");
        return;
      }

      if (requestedStatus === "Complete" && currentStatus === "Pending-Approval") {
        if (!canApproveReject(task, user)) {
          showInfo("Not Allowed", "Only the task creator or company admin can approve this task.");
          return;
        }
        let result: Awaited<ReturnType<typeof approveTask>>;
        try {
          result = await approveTask(taskId, {
            company_id: companyId,
            company_identifier: companyIdentifier,
          });
        } catch (error) {
          showError(
            "Approval Failed",
            taskErrorMessage(error, "Failed to approve task."),
          );
          return;
        }
        if (!result.ok) {
          showError("Approval Failed", result.message);
          return;
        }
        const completedAt = new Date().toISOString();
        useTasksStore.getState().patchTask(taskId, {
          status: "Complete",
          completed_at: completedAt,
        });
        showSuccess("Success", result.message ?? "Task approved successfully.");
        await recalculate(taskId, completedAt);
        refresh();
        return;
      }

      if (isCompletedStatus(currentStatus)) {
        if (currentStatus !== "Complete") {
          showInfo("Not Allowed", "Only the task creator can reopen a completed task.");
          return;
        }
        const canReopenTask = canReopen(task, user, company);
        const canEditSt = task.can_edit_status === true;

        if (requestedStatus === "On-Hold") {
          if (!canEditSt && !canReopenTask) {
            showInfo("Not Allowed", "You don't have permission to change this task's status.");
            return;
          }
          // Fall through to updateTaskStatusApi
        } else if (requestedStatus === "Pending" || requestedStatus === "In-Progress") {
          if (!canReopenTask && !canEditSt) {
            showInfo("Not Allowed", "Only the task creator can reopen a completed task.");
            return;
          }
          // Fall through to updateTaskStatusApi
        } else {
          // Any other status (e.g. Complete→Complete) is not a valid transition
          return;
        }
      } else {
        if (!canChangeStatus(task, user) || !canChangeStatusTo(task, user, company, requestedStatus)) {
          showInfo("Not Allowed", "You don't have permission to change this task's status.");
          return;
        }
        const transitionAllowed = canTransitionStatus(
          { status: currentStatus, subtask_count: task.subtask_count },
          requestedStatus,
          {
            canEditStatus: task.can_edit_status === true,
            canApproveReject: canApproveReject(task, user),
            subtaskCount: task.subtask_count,
            isAts,
          },
        );
        const completionFromSupportedStatus =
          requestedStatus === "Complete" && isCompletionReady(String(currentStatus));
        if (!transitionAllowed && !completionFromSupportedStatus) {
          showInfo("Status Not Allowed", "This task cannot be moved to that status.");
          return;
        }
      }

      if (
        requestedStatus === "Complete" &&
        !isCompletionReady(String(currentStatus))
      ) {
        showInfo(
          "Status Not Allowed",
          "Please set the task to 'In Progress' before marking it as complete.",
        );
        return;
      }

      const nextStatus = toApiStatus(requestedStatus);
      const shouldRecalculate = shouldRecalculateAfterStatus(
        currentStatus,
        requestedStatus,
        isAts,
      );

      try {
        await updateTaskStatusApi(taskId, {
          status: nextStatus,
          company_id: companyId,
          company_identifier: companyIdentifier,
        });
        const liveTask = useTasksStore.getState().byId[taskId];
        if (liveTask?.status === "Pending-Approval") {
          showInfo(
            "Approval Required",
            "You cannot mark the status as complete because approval is required. Please ask your team lead to mark the task as complete.",
          );
        } else {
          showSuccess("Success", "Task status updated.");
          if (shouldRecalculate) {
            await recalculate(
              taskId,
              requestedStatus === "Complete" ? new Date().toISOString() : undefined,
            );
          }
        }
        refresh();
      } catch (error) {
        showError(
          "Status Update Failed",
          taskErrorMessage(error, "Failed to update task status."),
        );
      }
    },
    [
      company,
      companyId,
      companyIdentifier,
      isAts,
      onReject,
      onReopen,
      onResume,
      recalculate,
      refresh,
      updateTaskStatusApi,
      user,
    ],
  );

  const handleAssigneeChange = useCallback(
    async (targetTask: TaskRowProps, owner: AssignableOwner) => {
      const task = getTask(targetTask);
      const taskId = getTaskId(targetTask);
      if (!task || !Number.isFinite(taskId) || !companyId) return;
      if (!canReassign(task, user, company)) {
        showInfo("Not Allowed", "Only the task creator with task edit permission can reassign this task.");
        return;
      }

      const current = useTasksStore.getState().byId[taskId];
      const previous = current
        ? {
            asigned_to: current.asigned_to,
            task_assigned_to: current.task_assigned_to,
          }
        : undefined;
      const assignedPerson = {
        id: owner.id,
        first_name: owner.first_name ?? "",
        last_name: owner.last_name ?? "",
        image: owner.image ?? "",
        role: 0,
        email: undefined,
      };

      useTasksStore.getState().patchTask(taskId, {
        asigned_to: owner.id,
        task_assigned_to: assignedPerson,
      });

      let result: Awaited<ReturnType<typeof reassignTask>>;
      try {
        result = await reassignTask(taskId, {
          assignee: owner.id,
          asigned_to: owner.id,
          company_id: companyId,
          company_identifier: companyIdentifier,
        });
      } catch (error) {
        if (previous) useTasksStore.getState().patchTask(taskId, previous);
        showError(
          "Reassignment Failed",
          taskErrorMessage(error, "Failed to reassign task."),
        );
        return;
      }
      if (!result.ok) {
        if (previous) useTasksStore.getState().patchTask(taskId, previous);
        showError("Reassignment Failed", result.message);
        return;
      }

      await recalculate(taskId);
      refresh();
    },
    [company, companyId, companyIdentifier, recalculate, refresh, user],
  );

  const handleRejectSuccess = useCallback(
    async (taskId: number, newStatus?: string) => {
      const status = normalizeApiStatus(newStatus ?? "Rejected");
      useTasksStore.getState().patchTask(taskId, {
        status: status as never,
        completed_at: status === "Complete" ? new Date().toISOString() : null,
      });
      // Contract §8.9: recalculate after reject; the caller passes the new
      // status so an ATS reject that became In Progress/Pending is not
      // overwritten with "Rejected" (AUD-027).
      await recalculate(taskId, new Date().toISOString());
      refresh();
    },
    [recalculate, refresh],
  );

  const handleReopenSuccess = useCallback(
    async (taskId: number, status: string) => {
      useTasksStore.getState().patchTask(taskId, {
        status: normalizeApiStatus(status) as never,
        completed_at: null,
      });
      await recalculate(taskId);
      refresh();
    },
    [recalculate, refresh],
  );

  const handleResumeSuccess = useCallback(
    async (taskId: number, status: string) => {
      useTasksStore.getState().patchTask(taskId, {
        status: normalizeApiStatus(status) as never,
      });
      await recalculate(taskId);
      refresh();
    },
    [recalculate, refresh],
  );

  const handleReopen = useCallback(
    async (targetTask: TaskRowProps, status: "Pending" | "In-Progress") => {
      await handleStatusChange(targetTask, status);
    },
    [handleStatusChange],
  );

  return {
    handleStatusChange,
    handleAssigneeChange,
    handleRejectSuccess,
    handleReopen,
    handleReopenSuccess,
    handleResumeSuccess,
  };
}
