import React from "react";
import AnimatedFAB from "@/components/AnimatedFAB";
import CreateTaskModal from "@/components/CreateTaskModal";
import RejectTaskModal from "@/components/RejectTaskModal";
import TaskDelay from "@/components/taskdelay";
import TaskDetailModal, { TaskDetail } from "@/components/TaskDetailModal";
import ReopenTaskModal from "@/features/tasks/components/task-detail/ReopenTaskModal";
import ResumeTaskModal from "@/features/tasks/components/task-detail/ResumeTaskModal";

type Props = {
  canCreate: boolean;
  createVisible: boolean;
  onCreateOpen: () => void;
  onCreateClose: () => void;
  onCreated: () => void;
  selectedTask: TaskDetail | null;
  onDetailClose: () => void;
  detailInitialTab: "details" | "comments";
  delayTask: { title: string; assignedTo: string } | null;
  onDelayClose: () => void;
  onExtendDelay: (effort: string, unit: string) => Promise<void>;
  rejectModalVisible: boolean;
  rejectTaskId: number;
  companyId: number;
  companyIdentifier: string;
  isAts: boolean;
  onRejectClose: () => void;
  onRejectSuccess: (newStatus?: string) => void;
  reopenModalVisible: boolean;
  reopenTaskId: number;
  onReopenClose: () => void;
  onReopenSuccess: (status: string) => void;
  resumeModalVisible: boolean;
  resumeTaskId: number;
  resumeTargetStatus: "In-Progress" | "Pending";
  onResumeClose: () => void;
  onResumeSuccess: (status: string) => void;
};

export default function TaskModalsHost({
  canCreate,
  createVisible,
  onCreateOpen,
  onCreateClose,
  onCreated,
  selectedTask,
  onDetailClose,
  detailInitialTab,
  delayTask,
  onDelayClose,
  onExtendDelay,
  rejectModalVisible,
  rejectTaskId,
  companyId,
  companyIdentifier,
  isAts,
  onRejectClose,
  onRejectSuccess,
  reopenModalVisible,
  reopenTaskId,
  onReopenClose,
  onReopenSuccess,
  resumeModalVisible,
  resumeTaskId,
  resumeTargetStatus,
  onResumeClose,
  onResumeSuccess,
}: Props) {
  return (
    <>
      {canCreate ? <AnimatedFAB onPress={onCreateOpen} /> : null}
      {canCreate ? (
        <CreateTaskModal
          visible={createVisible}
          onClose={onCreateClose}
          onCreated={onCreated}
        />
      ) : null}
      <TaskDetailModal
        visible={!!selectedTask}
        onClose={onDetailClose}
        task={selectedTask}
        initialTab={detailInitialTab}
      />
      <TaskDelay
        visible={!!delayTask}
        taskTitle={delayTask?.title ?? ""}
        assignedTo={delayTask?.assignedTo ?? ""}
        onClose={onDelayClose}
        onExtend={onExtendDelay}
      />
      <RejectTaskModal
        visible={rejectModalVisible}
        onClose={onRejectClose}
        taskId={rejectTaskId}
        companyId={companyId}
        companyIdentifier={companyIdentifier}
        onSuccess={onRejectSuccess}
      />
      <ReopenTaskModal
        key={`list-reopen-${reopenTaskId}-${reopenModalVisible ? "open" : "closed"}`}
        visible={reopenModalVisible}
        onClose={onReopenClose}
        taskId={reopenTaskId}
        companyId={companyId}
        companyIdentifier={companyIdentifier}
        isAts={isAts}
        onSuccess={onReopenSuccess}
      />
      <ResumeTaskModal
        key={`list-resume-${resumeTaskId}-${resumeModalVisible ? "open" : "closed"}`}
        visible={resumeModalVisible}
        onClose={onResumeClose}
        taskId={resumeTaskId}
        companyId={companyId}
        companyIdentifier={companyIdentifier}
        targetStatus={resumeTargetStatus}
        onSuccess={() => onResumeSuccess(resumeTargetStatus)}
      />
    </>
  );
}
