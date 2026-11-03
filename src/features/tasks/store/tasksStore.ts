// Normalized Task store (Zustand).
// Phase 1: scaffolding only. No screen consumes it yet; TaskContext remains the
// compatibility facade for Chat and the existing UI.

import { create } from "zustand";
import { getAllTasks, getDueTodayTasks, getFilteredTasks } from "../api/taskApi";
import type { ApiResult } from "../api/apiResult";
import type {
  TaskEntity,
  TaskFilter,
  TaskListItem,
  TaskListResponse,
  TaskOwner,
  TaskPriority,
} from "../types/task.types";
import { normalizeApiStatus } from "../utils/taskStatus";

export type TaskBucket = "assignedToMe" | "createdByMe" | "allOtherTasks";

export type TasksState = {
  // Normalized entities
  byId: Record<number, TaskEntity>;

  // Bucket membership (ids only)
  assignedToMeIds: number[];
  createdByMeIds: number[];
  allOtherTaskIds: number[];

  // Lookup data
  owners: TaskOwner[];
  priorities: TaskPriority[];
  statusList: string[];
  teamMemberIds: number[];
  completeCount: number;

  // Load state
  isLoading: boolean;
  error: string | null;
  lastRefresh: number;
  stale: boolean;
  hasMoreCompleted: boolean;
  completedPage: number;

  // Actions
  loadDashboard: (companyId: number, options?: { force?: boolean }) => Promise<void>;
  loadAll: (
    companyId: number,
    options?: { waitFresh?: boolean; excludeComplete?: boolean },
  ) => Promise<void>;
  loadDueToday: (companyId: number) => Promise<void>;
  loadFiltered: (
    companyId: number,
    filter: TaskFilter,
    options?: { limit?: number; page?: number; waitFresh?: boolean },
  ) => Promise<void>;
  loadCompletedPage: (companyId: number, page: number) => Promise<void>;
  upsertTask: (task: TaskListItem | TaskEntity) => void;
  patchTask: (taskId: number, patch: Partial<TaskEntity>) => void;
  removeTask: (taskId: number) => void;
  reset: () => void;
};

const initialState = {
  byId: {} as Record<number, TaskEntity>,
  assignedToMeIds: [] as number[],
  createdByMeIds: [] as number[],
  allOtherTaskIds: [] as number[],
  owners: [] as TaskOwner[],
  priorities: [] as TaskPriority[],
  statusList: [] as string[],
  teamMemberIds: [] as number[],
  completeCount: 0,
  isLoading: false,
  error: null as string | null,
  lastRefresh: 0,
  stale: false,
  hasMoreCompleted: false,
  completedPage: 0,
};

// In-flight dedupe per company+endpoint.
const inFlight = new Map<string, Promise<unknown>>();

function dedupe<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;
  const promise = run().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

function toEntity(row: TaskListItem | TaskEntity): TaskEntity {
  const source = row as unknown as Record<string, unknown>;
  return {
    ...(row as unknown as TaskEntity),
    id: Number(row.id),
    status: normalizeApiStatus(String(row.status)) as TaskEntity["status"],
    due_date: (source.due_date as string | null | undefined) ?? null,
    start_date: (source.start_date as string | null | undefined) ?? null,
    assignee: Number(source.assignee ?? 0),
    asigned_to: Number(source.asigned_to ?? 0),
    created_by: Number(source.created_by ?? 0),
    project_id: source.project_id === undefined ? null : (source.project_id as number | null),
    sprint_id: source.sprint_id === undefined ? null : (source.sprint_id as number | null),
    approval_required: Number(source.approval_required ?? 0) === 1 ? 1 : 0,
  };
}

function idsOf(rows: TaskListItem[] | undefined): number[] {
  return (rows ?? []).map((row) => Number(row.id)).filter((id) => Number.isFinite(id));
}

function bucketIds(response: TaskListResponse) {
  return {
    assignedToMeIds: idsOf(response.tasks_assigned_to_me),
    createdByMeIds: idsOf(response.tasksByme),
    allOtherTaskIds: idsOf(response.all_other_tasks),
  };
}

function entitiesFrom(
  response: TaskListResponse,
  existing: Record<number, TaskEntity> = {},
): Record<number, TaskEntity> {
  const next = { ...existing };
  const rows = [
    ...(response.tasks_assigned_to_me ?? []),
    ...(response.tasksByme ?? []),
    ...(response.all_other_tasks ?? []),
  ];
  for (const row of rows) {
    const entity = toEntity(row);
    if (Number.isFinite(entity.id)) next[entity.id] = entity;
  }
  return next;
}

async function listWithStaleRetry<T extends TaskListResponse>(
  run: (waitFresh: boolean) => Promise<ApiResult<T>>,
): Promise<ApiResult<T>> {
  const first = await run(false);
  if (!first.ok || !first.stale) return first;
  return run(true);
}

function lookupPatch(response: TaskListResponse, state: TasksState) {
  return {
    ...bucketIds(response),
    owners: response.task_owner ?? state.owners,
    priorities: response.priority ?? state.priorities,
    statusList: response.status ?? state.statusList,
    teamMemberIds: (response.team_member_ids ?? []).map(Number),
  };
}

export const useTasksStore = create<TasksState>()((set, get) => ({
  ...initialState,

  loadDashboard: async (companyId, options = {}) => {
    if (get().isLoading && !options.force) return;
    set({ isLoading: true, error: null });

    const due = await dedupe(`due:${companyId}`, () =>
      listWithStaleRetry((waitFresh) => getDueTodayTasks(companyId, { waitFresh })),
    );
    if (!due.ok) {
      set({ isLoading: false, error: due.message });
      return;
    }

    // Phase 1: show today's tasks immediately.
    set((state) => ({
      byId: entitiesFrom(due.data, state.byId),
      ...lookupPatch(due.data, state),
      lastRefresh: Date.now(),
    }));

    const all = await dedupe(`all:${companyId}`, () =>
      listWithStaleRetry((waitFresh) =>
        getAllTasks(companyId, { waitFresh, excludeComplete: true }),
      ),
    );
    if (!all.ok) {
      set({ isLoading: false, error: all.message });
      return;
    }

    set((state) => ({
      byId: entitiesFrom(all.data, state.byId),
      ...lookupPatch(all.data, state),
      completeCount: all.data.complete_count ?? state.completeCount,
      stale: !!all.data.stale,
      isLoading: false,
      error: null,
      lastRefresh: Date.now(),
    }));
  },

  loadAll: async (companyId, options = {}) => {
    set({ isLoading: true, error: null });
    const result = await dedupe(`all:${companyId}`, () =>
      listWithStaleRetry((waitFresh) =>
        getAllTasks(companyId, {
          waitFresh: waitFresh || options.waitFresh,
          excludeComplete: options.excludeComplete ?? true,
        }),
      ),
    );
    if (!result.ok) {
      set({ isLoading: false, error: result.message });
      return;
    }
    set((state) => ({
      byId: entitiesFrom(result.data, state.byId),
      ...lookupPatch(result.data, state),
      completeCount: result.data.complete_count ?? state.completeCount,
      stale: !!result.data.stale,
      isLoading: false,
      error: null,
      lastRefresh: Date.now(),
    }));
  },

  loadDueToday: async (companyId) => {
    set({ isLoading: true, error: null });
    const result = await dedupe(`due:${companyId}`, () =>
      listWithStaleRetry((waitFresh) => getDueTodayTasks(companyId, { waitFresh })),
    );
    if (!result.ok) {
      set({ isLoading: false, error: result.message });
      return;
    }
    set((state) => ({
      byId: entitiesFrom(result.data, state.byId),
      ...lookupPatch(result.data, state),
      isLoading: false,
      error: null,
      lastRefresh: Date.now(),
    }));
  },

  loadFiltered: async (companyId, filter, options = {}) => {
    set({ isLoading: true, error: null });
    const key = `filter:${companyId}:${filter}:${options.page ?? 1}:${options.limit ?? ""}`;
    const result = await dedupe(key, () =>
      getFilteredTasks(companyId, filter, {
        waitFresh: options.waitFresh,
        limit: options.limit,
        page: options.page,
      }),
    );
    if (!result.ok) {
      set({ isLoading: false, error: result.message });
      return;
    }
    set((state) => ({
      byId: entitiesFrom(result.data, state.byId),
      ...lookupPatch(result.data, state),
      isLoading: false,
      error: null,
      lastRefresh: Date.now(),
    }));
  },

  loadCompletedPage: async (companyId, page) => {
    set({ isLoading: true, error: null });
    const result = await dedupe(`complete:${companyId}:${page}`, () =>
      getFilteredTasks(companyId, "complete", { limit: 50, page }),
    );
    if (!result.ok) {
      set({ isLoading: false, error: result.message });
      return;
    }

    // Completed rows are stored in `byId`; the completed tab selects from all
    // entities and re-sorts by completed_at on the device (backend bug §3.4).
    set((state) => ({
      byId: entitiesFrom(result.data, state.byId),
      completedPage: page,
      hasMoreCompleted:
        (result.data as TaskListResponse & { has_more?: boolean }).has_more === true,
      isLoading: false,
      error: null,
      lastRefresh: Date.now(),
    }));
  },

  upsertTask: (task) => {
    const entity = toEntity(task);
    if (!Number.isFinite(entity.id)) return;
    set((state) => ({ byId: { ...state.byId, [entity.id]: entity } }));
  },

  patchTask: (taskId, patch) => {
    set((state) => {
      const existing = state.byId[taskId];
      if (!existing) return state;
      return { byId: { ...state.byId, [taskId]: { ...existing, ...patch } } };
    });
  },

  removeTask: (taskId) => {
    set((state) => {
      const byId = { ...state.byId };
      delete byId[taskId];
      const without = (ids: number[]) => ids.filter((id) => id !== taskId);
      return {
        byId,
        assignedToMeIds: without(state.assignedToMeIds),
        createdByMeIds: without(state.createdByMeIds),
        allOtherTaskIds: without(state.allOtherTaskIds),
      };
    });
  },

  reset: () => {
    inFlight.clear();
    set({ ...initialState });
  },
}));

/** Non-reactive access for service code (store is not consumed by UI yet). */
export const tasksStore = useTasksStore;
export type TasksStoreApi = typeof useTasksStore;
