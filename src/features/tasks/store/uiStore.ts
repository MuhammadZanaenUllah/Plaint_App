// Task UI store
// Phase 1 — Foundation
// Zustand store for modal visibility, targets, and UI state

import create from "zustand";
import { TaskListItem } from "../types/task.types";

interface UiState {
  // Modal visibility
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

  // Modal targets
  editTaskId: number | null;
  rejectReason: string;
  reopenPriority: "normal" | "critical";
  reopenEffort: number;
  orderTaskIds: number[];

  // Haptics/keyboard
  lastActionTime: number;
}

const initialState: UiState = {
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

  editTaskId: null,
  rejectReason: "",
  reopenPriority: "normal",
  reopenEffort: 0,
  orderTaskIds: [],

  lastActionTime: 0,
};

export type UiStore = ReturnType<typeof uiStore>;

export const uiStore = create<UiState>((set) => ({
  ...initialState,

  // Create modal
  setCreateModalVisible: (visible: boolean) => set({ createModalVisible: visible }),

  // Detail modal
  setDetailModalVisible: (visible: boolean) => set({ detailModalVisible: visible }),

  // Reject modal
  setRejectModalVisible: (visible: boolean, reason?: string) =>
    set({ rejectModalVisible: visible, rejectReason: reason || "" }),

  // Reopen modal
  setReopenModalVisible: (visible: boolean, priority: "normal" | "critical", effort: number) =>
    set({ reopenModalVisible: visible, reopenPriority: priority, reopenEffort: effort }),

  // Resume modal
  setResumeModalVisible: (visible: boolean) => set({ resumeModalVisible: visible }),

  // Dependency modal
  setDependencyModalVisible: (visible: boolean) => set({ dependencyModalVisible: visible }),

  // Attachment modal
  setAttachmentModalVisible: (visible: boolean) => set({ attachmentModalVisible: visible }),

  // Critical prompt
  setCriticalPromptVisible: (visible: boolean) => set({ criticalPromptVisible: visible }),

  // Order critical modal
  setOrderCriticalModalVisible: (visible: boolean, taskIds: number[]) =>
    set({ orderCriticalModalVisible: visible, orderTaskIds: taskIds }),

  // Delay popup
  setDelayPopupVisible: (visible: boolean) => set({ delayPopupVisible: visible }),

  // Set edit task ID
  setEditTaskId: (id: number | null) => set({ editTaskId: id }),

  // Set reject reason
  setRejectReason: (reason: string) => set({ rejectReason: reason }),

  // Set reopen state
  setReopenState: (priority: "normal" | "critical", effort: number) =>
    set({ reopenPriority: priority, reopenEffort: effort }),

  // Set ordered task IDs
  setOrderTaskIds: (ids: number[]) => set({ orderTaskIds: ids }),

  // Haptics timestamp
  setLastActionTime: (time: number) => set({ lastActionTime: time }),
}));