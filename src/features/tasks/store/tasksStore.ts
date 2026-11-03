// Task normalized store
// Phase 1 — Foundation
// Zustand store for task entities, buckets, owners, priorities, statuses
// Compatible with Chat: preserves useTasks().state.taskOwners shape

import create from "zustand";
import { TaskListItem, TaskOwner, TaskListResponse, TaskStatus, TaskPriority } from "../types/task.types";
import { parseApiResponse, extractError } from "../api/error-extractor";
import { TaskStatus as TaskApiStatus } from "../types/task.types";

// Store shape
export interface TasksState {
  // Buckets
  assignedToMe: TaskListItem[];
  createdByMe: TaskListItem[];
  allOtherTasks: TaskListItem[];

  // Entity map (id → TaskListItem) for O(1) lookups
  byId: Record<number, TaskListItem>;

  // Owners
  owners: TaskOwner[];
  priorities: { id: number; name: string; color: string }[];

  // State
  statusList: TaskStatus[];
  isLoading: boolean;
  error?: string;
  lastRefresh: number; // epoch ms

  // ATS flag
  hasAdvancedTaskModule: boolean;

  // Pagination
  page: number;
  hasMore: boolean;

  // Socket pending patches
  pendingPatches: Record<number, { status?: TaskStatus; due_date?: string; effort_hours?: number }>;
}

// Initial state
const initialState: TasksState = {
  assignedToMe: [],
  createdByMe: [],
  allOtherTasks: [],
  byId: {},
  owners: [],
  priorities: [],
  statusList: ["Pending", "In-Progress", "On-Hold", "Complete", "Pending-Approval", "Rejected"],
  isLoading: false,
  error: undefined,
  lastRefresh: 0,
  hasAdvancedTaskModule: false,
  page: 1,
  hasMore: true,
  pendingPatches: {},
};

// Create store type
export type TasksStore = ReturnType<typeof tasksStore>;

// Create store
export const tasksStore = create<TasksState>((set, get) => ({
  // Spread initial state
  ...initialState,

  // Load tasks (two-phase: duetoday + all)
  loadTasks: async (companyId: number, force = false) => {
    if (!force && !get().hasMore && get().page > 1) return;
    set({ isLoading: true, error: undefined });

    try {
      // Phase 1: load due today
      const dueToday = await apiGet<TaskListResponse>(`/tasks/duetoday?company_id=${companyId}`, {});
      // Phase 2: load all (with exclude_complete)
      const all = await apiGet<TaskListResponse>(`/tasks/all?company_id=${companyId}&exclude_complete=true`, {});

      // Merge by ID to deduplicate
      const mergeById = (arr: TaskListItem[]) => {
        const map: Record<number, TaskListItem> = {};
        arr.forEach((t) => { map[t.id] = t; });
        return Object.values(map);
      };

      const merged = [...mergeById(dueToday.tasks ?? []), ...mergeById(all.tasks ?? {})];

      // Build entity map
      const byId: Record<number, TaskListItem> = {};
      merged.forEach((t) => { byId[t.id] = t; });

      // Build buckets
      const assignedToMe = merged.filter((t) => t.asigned_to?.some((a) => a.id === companyId) || (t.assignee?.id === companyId));
      const createdByMe = merged.filter((t) => (t.assignee?.id ?? t.created_by) === companyId);
      const allOther = merged.filter(
        (t) => !assignedToMe.some((a) => a.id === t.id) && !createdByMe.some((a) => a.id === t.id)
      );

      set({
        assignedToMe,
        createdByMe,
        allOtherTasks: allOther,
        byId,
        owners: all.owners ?? [],
        priorities: all.priorities ?? [],
        statusList: all.status_list ?? ["Pending", "In-Progress", "On-Hold", "Complete", "Pending-Approval", "Rejected"],
        hasAdvancedTaskModule: all.has_advanced_task_module ?? false,
        isLoading: false,
        lastRefresh: Date.now(),
      });
    } catch (err: any) {
      set({ error: extractError(err.message), isLoading: false });
    }
  },

  // Load page of tasks (infinite scroll)
  loadMoreTasks: async (companyId: number) => {
    const newPage = get().page + 1;
    set({ page: newPage });

    try {
      const res = await apiGet<TaskListResponse>(`/tasks/all?company_id=${companyId}&exclude_complete=true&page=${newPage}`, {});
      const { body, good } = parseApiResponse(res);

      if (!good) throw new Error(extractError((body as any)?.error || (body as any)?.message));

      const items = body.tasks ?? [];
      set((state) => {
        const newById = { ...state.byId };
        items.forEach((t) => { newById[t.id] = t; });

        return {
          byId: newById,
          hasMore: (body.tasks ?? []).length > 0,
          page: newPage,
        };
      });
    } catch (err: any) {
      set({ error: extractError(err.message), page: get().page - 1 });
    }
  },

  // Select a task (move to correct bucket on open)
  selectTask: (taskId: number) => {
    const task = get().byId[taskId];
    if (!task) return;

    set(state => {
      const newAssigned = [...state.assignedToMe].filter(t => t.id !== taskId);
      const newCreated = [...state.createdByMe].filter(t => t.id !== taskId);
      const newAllOther = [...state.allOtherTasks].filter(t => t.id !== taskId);

      // Put in assigned bucket if doer matches company
      const newAssignedBucket = [task, ...newAssigned.filter(t => /* doer matches */ true)];

      return {
        assignedToMe: newAssignedBucket,
        createdByMe: [...newCreated],
        allOtherTasks: [...newAllOther],
      };
    });
  },

  // Add task via socket create
  addTaskViaSocket: (task: TaskListItem) => {
    set(state => {
      const newById = { ...state.byId, [task.id]: task };

      // Add to assigned bucket if doer matches
      const newAssigned = task.asigned_to?.some((a: { id: number }) => a.id === companyId
        ? [task, ...state.assignedToMe.filter(t => t.id !== task.id)]
        : state.assignedToMe.filter(t => t.id !== task.id));

      // Created-by-me if assignee is current user
      const newCreated = task.assignee?.id === companyId
        ? [task, ...state.createdByMe.filter(t => t.id !== task.id)]
        : state.createdByMe.filter(t => t.id !== task.id);

      // All other tasks minus this one
      const newAllOther = state.allOtherTasks.filter(t => t.id !== task.id);

      return {
        byId: newById,
        assignedToMe: newAssigned,
        createdByMe: newCreated,
        allOtherTasks: newAllOther,
      };
    });
  },

  // Patch task via socket update
  patchTask: (taskId: number, patches: { status?: TaskStatus; due_date?: string; effort_hours?: number }) => {
    set(state => {
      const newById = { ...state.byId };
      if (newById[taskId]) {
        Object.assign(newById[taskId], patches);
      }
      return { byId: newById, pendingPatches: { ...state.pendingPatches, [taskId]: patches } };
    });
  },

  // Clear pending patch after apply
  clearPendingPatch: (taskId: number) =>
    set(state => {
      const pendingPatches = { ...state.pendingPatches };
      delete pendingPatches[taskId];
      return { pendingPatches };
    }),

  // Reset on logout/company change
  resetOnCompanyChange: () => set(initialState),
}));

// Export memoized selectors
export type TasksStoreState = TasksState;

export const useTasks = () => {
  const store = tasksStore.getState();

  return {
    // Buckets
    assignedToMe,
    createdByMe,
    allOtherTasks,

    // Entity map
    byId,

    // Owners & priorities
    owners: store.owners,
    priorities: store.priorities,
    statusList: store.statusList,

    // State
    isLoading: store.isLoading,
    error: store.error,
    lastRefresh: store.lastRefresh,
    hasAdvancedTaskModule: store.hasAdvancedTaskModule,

    // Pagination
    page: store.page,
    hasMore: store.hasMore,

    // Compatibility facade for Chat
    // Must preserve this exact shape
    taskOwners: store.owners.map((o: TaskOwner) => ({
      id: o.id,
      first_name: o.first_name,
      last_name: o.last_name,
      full_name: o.full_name,
      email: o.email,
      company_id: o.company_id,
      image: o.image,
    })),

    // Internal store methods (for use within components)
    loadTasks: store.loadTasks,
    loadMoreTasks: store.loadMoreTasks,
    selectTask: store.selectTask,
    patchTask: store.patchTask,
    clearPendingPatch: store.clearPendingPatch,
    resetOnCompanyChange: store.resetOnCompanyChange,
  };
};

// Initial load counter (dev)
let initCount = 0;
if (initCount === 0) {
  initCount++;
}