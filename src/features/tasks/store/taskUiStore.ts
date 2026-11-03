// Task UI/modal state. Scaffolding for Phases 4-6.

import { create } from "zustand";
import type { TaskPriorityLevel } from "../types/task.types";

export type TaskUiState = {
  createModalVisible: boolean;
  detailModalVisible: boolean;
  rejectModalVisible: boolean;
  reopenModalVisible: boolean;
  resumeModalVisible: boolean;
  dependencyModalVisible: boolean;
  attachmentModalVisible: boolean;
  criticalPromptVisible: boolean;
  orderCriticalModalVisible: boolean;
  delayPopupVisible: boolean;

  activeTaskId: number | null;
  rejectReason: string;
  reopenPriority: TaskPriorityLevel;
  reopenEffortMinutes: number;
  orderTaskIds: number[];

  setCreateModalVisible: (visible: boolean) => void;
  setDetailModalVisible: (visible: boolean, taskId?: number | null) => void;
  setRejectModalVisible: (visible: boolean) => void;
  setReopenModalVisible: (visible: boolean) => void;
  setResumeModalVisible: (visible: boolean) => void;
  setDependencyModalVisible: (visible: boolean) => void;
  setAttachmentModalVisible: (visible: boolean) => void;
  setCriticalPromptVisible: (visible: boolean) => void;
  setOrderCriticalModalVisible: (visible: boolean, taskIds?: number[]) => void;
  setDelayPopupVisible: (visible: boolean) => void;
  setActiveTaskId: (taskId: number | null) => void;
  setRejectReason: (reason: string) => void;
  setReopenState: (priority: TaskPriorityLevel, effortMinutes: number) => void;
  setOrderTaskIds: (ids: number[]) => void;
  reset: () => void;
};

const initialState = {
  createModalVisible: false,
  detailModalVisible: false,
  rejectModalVisible: false,
  reopenModalVisible: false,
  resumeModalVisible: false,
  dependencyModalVisible: false,
  attachmentModalVisible: false,
  criticalPromptVisible: false,
  orderCriticalModalVisible: false,
  delayPopupVisible: false,
  activeTaskId: null as number | null,
  rejectReason: "",
  reopenPriority: "normal" as TaskPriorityLevel,
  reopenEffortMinutes: 0,
  orderTaskIds: [] as number[],
};

export const useTaskUiStore = create<TaskUiState>()((set) => ({
  ...initialState,

  setCreateModalVisible: (visible) => set({ createModalVisible: visible }),
  setDetailModalVisible: (visible, taskId) =>
    set((state) => ({
      detailModalVisible: visible,
      activeTaskId: taskId === undefined ? state.activeTaskId : taskId,
    })),
  setRejectModalVisible: (visible) => set({ rejectModalVisible: visible }),
  setReopenModalVisible: (visible) => set({ reopenModalVisible: visible }),
  setResumeModalVisible: (visible) => set({ resumeModalVisible: visible }),
  setDependencyModalVisible: (visible) => set({ dependencyModalVisible: visible }),
  setAttachmentModalVisible: (visible) => set({ attachmentModalVisible: visible }),
  setCriticalPromptVisible: (visible) => set({ criticalPromptVisible: visible }),
  setOrderCriticalModalVisible: (visible, taskIds) =>
    set((state) => ({
      orderCriticalModalVisible: visible,
      orderTaskIds: taskIds ?? state.orderTaskIds,
    })),
  setDelayPopupVisible: (visible) => set({ delayPopupVisible: visible }),
  setActiveTaskId: (activeTaskId) => set({ activeTaskId }),
  setRejectReason: (rejectReason) => set({ rejectReason }),
  setReopenState: (reopenPriority, reopenEffortMinutes) =>
    set({ reopenPriority, reopenEffortMinutes }),
  setOrderTaskIds: (orderTaskIds) => set({ orderTaskIds }),
  reset: () => set({ ...initialState }),
}));

export const uiStore = useTaskUiStore;
