import React from "react";
import AnimatedFAB from "@/components/AnimatedFAB";
import CreateTaskModal from "@/components/CreateTaskModal";
import RejectTaskModal from "@/components/RejectTaskModal";
import TaskDelay from "@/components/taskdelay";
import TaskDetailModal, { TaskDetail } from "@/components/TaskDetailModal";

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
  onRejectClose: () => void;
  onRejectSuccess: () => void;
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
  onRejectClose,
  onRejectSuccess,
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
    </>
  );
}
