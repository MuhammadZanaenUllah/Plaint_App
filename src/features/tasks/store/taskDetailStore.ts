// Task detail store (Zustand). Scaffolding for Phases 5-7.

import { create } from "zustand";
import { getDependencies } from "../api/taskDependenciesApi";
import { getTaskNotes } from "../api/taskNotesApi";
import { viewTask } from "../api/taskApi";
import type { DependencyData, TaskDetail, TaskNote } from "../types/task.types";

export type DetailState = {
  taskId: number | null;
  task: TaskDetail | null;
  notes: TaskNote[];
  dependencies: DependencyData[];
  isLoading: boolean;
  notesLoading: boolean;
  dependenciesLoading: boolean;
  error: string | null;

  loadTask: (taskId: number, companyId?: number) => Promise<void>;
  loadNotes: (taskId: number, companyId?: number, companyIdentifier?: string) => Promise<void>;
  loadDependencies: (taskId: number, companyId: number) => Promise<void>;
  clear: () => void;
};

const initialState = {
  taskId: null as number | null,
  task: null as TaskDetail | null,
  notes: [] as TaskNote[],
  dependencies: [] as DependencyData[],
  isLoading: false,
  notesLoading: false,
  dependenciesLoading: false,
  error: null as string | null,
};

export const useTaskDetailStore = create<DetailState>()((set) => ({
  ...initialState,

  loadTask: async (taskId, companyId) => {
    set({ isLoading: true, error: null, taskId });
    const result = await viewTask(taskId, companyId);
    if (!result.ok) {
      set({ isLoading: false, error: result.message });
      return;
    }
    set({ task: result.data.task, isLoading: false, error: null });
  },

  loadNotes: async (taskId, companyId, companyIdentifier) => {
    set({ notesLoading: true });
    const result = await getTaskNotes(taskId, companyId, companyIdentifier);
    if (!result.ok) {
      set({ notesLoading: false, error: result.message });
      return;
    }
    set({ notes: result.data ?? [], notesLoading: false });
  },

  loadDependencies: async (taskId, companyId) => {
    set({ dependenciesLoading: true });
    const result = await getDependencies(taskId, companyId);
    if (!result.ok) {
      set({ dependenciesLoading: false, error: result.message });
      return;
    }
    set({ dependencies: result.data ?? [], dependenciesLoading: false });
  },

  clear: () => set({ ...initialState }),
}));

export const taskDetailStore = useTaskDetailStore;
