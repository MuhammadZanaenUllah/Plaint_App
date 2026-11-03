// Normalized Task store (Zustand), consumed by the task dashboard and exposed
// to legacy screens through TaskContext.

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
import { isCompletedStatus, normalizeApiStatus } from "../utils/taskStatus";

export type TaskBucket = "assignedToMe" | "createdByMe" | "allOtherTasks";

export type TasksState = {
  // Normalized entities
  byId: Record<number, TaskEntity>;

  // Bucket membership (ids only)
  assignedToMeIds: number[];
  createdByMeIds: number[];
  allOtherTaskIds: number[];
  recurringIds: number[];
  pendingApprovalIds: number[];
  completedIds: number[];

  // Lookup data
  owners: TaskOwner[];
  priorities: TaskPriority[];
  statusList: string[];
  teamMemberIds: number[];
  completeCount: number;
  dueTodayCount: number;

  // Load state
  isLoading: boolean;
  isPartialLoad: boolean;
  error: string | null;
  lastRefresh: number;
  stale: boolean;
  hasMoreCompleted: boolean;
  completedPage: number;
  queryIds: Partial<Record<TaskFilter, number[]>>;

  // Actions
  loadDashboard: (
    companyId: number,
    options?: { force?: boolean; silent?: boolean },
  ) => Promise<void>;
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
  loadRecurring: (companyId: number) => Promise<void>;
  loadPendingApproval: (companyId: number) => Promise<void>;
  loadCompletedPage: (companyId: number, page: number) => Promise<boolean>;
  applyBuckets: (
    response: TaskListResponse,
    options?: { merge?: boolean },
  ) => void;
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
  recurringIds: [] as number[],
  pendingApprovalIds: [] as number[],
  completedIds: [] as number[],
  owners: [] as TaskOwner[],
  priorities: [] as TaskPriority[],
  statusList: [] as string[],
  teamMemberIds: [] as number[],
  completeCount: 0,
  dueTodayCount: 0,
  isLoading: false,
  isPartialLoad: false,
  error: null as string | null,
  lastRefresh: 0,
  stale: false,
  hasMoreCompleted: false,
  completedPage: 0,
  queryIds: {} as Partial<Record<TaskFilter, number[]>>,
};

// In-flight dedupe per company+endpoint.
const inFlight = new Map<string, Promise<unknown>>();
let storeEpoch = 0;

function dedupe<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;
  const promise = run().finally(() => {
    if (inFlight.get(key) === promise) inFlight.delete(key);
  });
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
  return [
    ...new Set(
      (rows ?? [])
        .map((row) => Number(row.id))
        .filter((id) => Number.isFinite(id)),
    ),
  ];
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

function mergeIds(first: number[], second: number[]): number[] {
  return [...new Set([...first, ...second])];
}

function mergeResponses(
  first: TaskListResponse,
  second: TaskListResponse,
): TaskListResponse {
  const mergeRows = (a: TaskListItem[] = [], b: TaskListItem[] = []) => {
    const rows = new Map<number, TaskListItem>();
    for (const row of a) rows.set(Number(row.id), row);
    for (const row of b) {
      const id = Number(row.id);
      if (!rows.has(id)) rows.set(id, row);
    }
    return [...rows.values()];
  };
  return {
    ...second,
    ...first,
    task_owner: first.task_owner?.length ? first.task_owner : second.task_owner,
    priority: first.priority?.length ? first.priority : second.priority,
    status: first.status?.length ? first.status : second.status,
    team_member_ids: first.team_member_ids?.length
      ? first.team_member_ids
      : second.team_member_ids,
    complete_count: first.complete_count ?? second.complete_count,
    tasks_assigned_to_me: mergeRows(
      first.tasks_assigned_to_me,
      second.tasks_assigned_to_me,
    ),
    tasksByme: mergeRows(first.tasksByme, second.tasksByme),
    all_other_tasks: mergeRows(first.all_other_tasks, second.all_other_tasks),
  };
}

function lookupPatch(response: TaskListResponse, state: TasksState) {
  const allRows = [
    ...(response.tasks_assigned_to_me ?? []),
    ...(response.tasksByme ?? []),
    ...(response.all_other_tasks ?? []),
  ];
  return {
    ...bucketIds(response),
    recurringIds: allRows
      .filter((task) => task.is_recurring)
      .map((task) => Number(task.id)),
    pendingApprovalIds: allRows
      .filter((task) => task.status === "Pending-Approval")
      .map((task) => Number(task.id)),
    owners: response.task_owner ?? state.owners,
    priorities: response.priority ?? state.priorities,
    statusList: response.status ?? state.statusList,
    teamMemberIds: response.team_member_ids
      ? response.team_member_ids.map(Number)
      : state.teamMemberIds,
  };
}

export const useTasksStore = create<TasksState>()((set, get) => ({
  ...initialState,

  loadDashboard: async (companyId, options = {}) => {
    if (get().isLoading && !options.force) return;
    const epoch = storeEpoch;
    set({ isLoading: !options.silent, error: null });
    try {
      const loadDue = () =>
        dedupe(`due:${companyId}`, () =>
          listWithStaleRetry((waitFresh) =>
            getDueTodayTasks(companyId, { waitFresh }),
          ),
        );
      const loadAll = () =>
        dedupe(`all:${companyId}`, () =>
          listWithStaleRetry((waitFresh) =>
            getAllTasks(companyId, { waitFresh, excludeComplete: true }),
          ),
        );

      if (options.force) {
        const [due, all] = await Promise.all([loadDue(), loadAll()]);
        if (epoch !== storeEpoch) return;
        if (!due.ok || !all.ok) {
          set({
            isLoading: false,
            error: !due.ok ? due.message : !all.ok ? all.message : null,
          });
          return;
        }
        const merged = mergeResponses(all.data, due.data);
        set((state) => ({
          byId: entitiesFrom(merged, state.byId),
          ...lookupPatch(merged, state),
          completeCount: merged.complete_count ?? state.completeCount,
          dueTodayCount:
            idsOf([
              ...(due.data.tasks_assigned_to_me ?? []),
              ...(due.data.tasksByme ?? []),
              ...(due.data.all_other_tasks ?? []),
            ]).length,
          stale: !!due.stale || !!all.stale,
          isPartialLoad: false,
          isLoading: false,
          error: null,
          lastRefresh: Date.now(),
        }));
        return;
      }

      const due = await loadDue();
      if (epoch !== storeEpoch) return;
      if (!due.ok) {
        set({ isLoading: false, error: due.message });
        return;
      }
      set((state) => ({
        byId: entitiesFrom(due.data, state.byId),
        ...lookupPatch(due.data, state),
        dueTodayCount:
          idsOf([
            ...(due.data.tasks_assigned_to_me ?? []),
            ...(due.data.tasksByme ?? []),
            ...(due.data.all_other_tasks ?? []),
          ]).length,
        isPartialLoad: true,
        stale: !!due.stale,
        isLoading: false,
        lastRefresh: Date.now(),
      }));

      const all = await loadAll();
      if (epoch !== storeEpoch) return;
      if (!all.ok) {
        set({ isLoading: false, error: all.message });
        return;
      }
      const merged = mergeResponses(all.data, due.data);
      set((state) => ({
        byId: entitiesFrom(merged, state.byId),
        ...lookupPatch(merged, state),
        completeCount: merged.complete_count ?? state.completeCount,
        dueTodayCount:
          idsOf([
            ...(due.data.tasks_assigned_to_me ?? []),
            ...(due.data.tasksByme ?? []),
            ...(due.data.all_other_tasks ?? []),
          ]).length,
        stale: !!due.stale || !!all.stale,
        isPartialLoad: false,
        isLoading: false,
        error: null,
        lastRefresh: Date.now(),
      }));
    } catch (error) {
      if (epoch !== storeEpoch) return;
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to load tasks.",
      });
    }
  },

  loadAll: async (companyId, options = {}) => {
    const epoch = storeEpoch;
    set({ isLoading: true, error: null });
    let result: ApiResult<TaskListResponse>;
    try {
      result = await dedupe(`all:${companyId}`, () =>
        listWithStaleRetry((waitFresh) =>
          getAllTasks(companyId, {
            waitFresh: waitFresh || options.waitFresh,
            excludeComplete: options.excludeComplete ?? true,
          }),
        ),
      );
    } catch (error) {
      if (epoch !== storeEpoch) return;
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to load tasks.",
      });
      return;
    }
    if (epoch !== storeEpoch) return;
    if (!result.ok) {
      set({ isLoading: false, error: result.message });
      return;
    }
    set((state) => ({
      byId: entitiesFrom(result.data, state.byId),
      ...lookupPatch(result.data, state),
      completeCount: result.data.complete_count ?? state.completeCount,
      isPartialLoad: false,
      stale: !!result.stale || !!result.data.stale,
      isLoading: false,
      error: null,
      lastRefresh: Date.now(),
    }));
  },

  loadDueToday: async (companyId) => {
    const epoch = storeEpoch;
    set({ isLoading: true, error: null });
    let result: ApiResult<TaskListResponse>;
    try {
      result = await dedupe(`due:${companyId}`, () =>
        listWithStaleRetry((waitFresh) =>
          getDueTodayTasks(companyId, { waitFresh }),
        ),
      );
    } catch (error) {
      if (epoch !== storeEpoch) return;
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to load tasks.",
      });
      return;
    }
    if (epoch !== storeEpoch) return;
    if (!result.ok) {
      set({ isLoading: false, error: result.message });
      return;
    }
    set((state) => ({
      byId: entitiesFrom(result.data, state.byId),
      ...lookupPatch(result.data, state),
      dueTodayCount: idsOf([
        ...(result.data.tasks_assigned_to_me ?? []),
        ...(result.data.tasksByme ?? []),
        ...(result.data.all_other_tasks ?? []),
      ]).length,
      isPartialLoad: true,
      isLoading: false,
      error: null,
      lastRefresh: Date.now(),
    }));
  },

  loadFiltered: async (companyId, filter, options = {}) => {
    const epoch = storeEpoch;
    set({ isLoading: true, error: null });
    const key = `filter:${companyId}:${filter}:${options.page ?? 1}:${options.limit ?? ""}`;
    let result: ApiResult<TaskListResponse>;
    try {
      result = await dedupe(key, () =>
        listWithStaleRetry((waitFresh) =>
          getFilteredTasks(companyId, filter, {
            waitFresh: waitFresh || options.waitFresh,
            limit: options.limit,
            page: options.page,
          }),
        ),
      );
    } catch (error) {
      if (epoch !== storeEpoch) return;
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to load tasks.",
      });
      return;
    }
    if (epoch !== storeEpoch) return;
    if (!result.ok) {
      set({ isLoading: false, error: result.message });
      return;
    }
    const ids = idsOf([
      ...(result.data.tasks_assigned_to_me ?? []),
      ...(result.data.tasksByme ?? []),
      ...(result.data.all_other_tasks ?? []),
    ]);
    set((state) => ({
      byId: entitiesFrom(result.data, state.byId),
      owners: result.data.task_owner ?? state.owners,
      priorities: result.data.priority ?? state.priorities,
      statusList: result.data.status ?? state.statusList,
      queryIds: { ...state.queryIds, [filter]: ids },
      recurringIds: filter === "recurring" ? ids : state.recurringIds,
      completedIds:
        filter === "complete" && !options.page ? ids : state.completedIds,
      completeCount: result.data.complete_count ?? state.completeCount,
      stale: !!result.stale || !!result.data.stale,
      isLoading: false,
      error: null,
      lastRefresh: Date.now(),
    }));
  },

  loadRecurring: async (companyId) => {
    if (get().queryIds.recurring) return;
    await get().loadFiltered(companyId, "recurring");
  },

  loadPendingApproval: async (companyId) => {
    await get().loadAll(companyId, { excludeComplete: false });
    set((state) => ({
      pendingApprovalIds: Object.values(state.byId)
        .filter((task) => task.status === "Pending-Approval")
        .map((task) => task.id),
    }));
  },

  applyBuckets: (response, options = {}) => {
    set((state) => {
      const ids = bucketIds(response);
      const buckets = options.merge
        ? {
            assignedToMeIds: mergeIds(state.assignedToMeIds, ids.assignedToMeIds),
            createdByMeIds: mergeIds(state.createdByMeIds, ids.createdByMeIds),
            allOtherTaskIds: mergeIds(state.allOtherTaskIds, ids.allOtherTaskIds),
          }
        : ids;
      const nextState = {
        ...state,
        ...buckets,
        byId: entitiesFrom(response, state.byId),
        owners: response.task_owner ?? state.owners,
        priorities: response.priority ?? state.priorities,
        statusList: response.status ?? state.statusList,
        teamMemberIds: response.team_member_ids
          ? response.team_member_ids.map(Number)
          : state.teamMemberIds,
        completeCount: response.complete_count ?? state.completeCount,
      };
      return {
        ...nextState,
        recurringIds: Object.values(nextState.byId)
          .filter((task) => task.is_recurring)
          .map((task) => task.id),
        pendingApprovalIds: Object.values(nextState.byId)
          .filter((task) => task.status === "Pending-Approval")
          .map((task) => task.id),
      };
    });
  },

  loadCompletedPage: async (companyId, page) => {
    const epoch = storeEpoch;
    set({ isLoading: true, error: null });
    let result: ApiResult<TaskListResponse>;
    try {
      result = await dedupe(`complete:${companyId}:${page}`, () =>
        listWithStaleRetry((waitFresh) =>
          getFilteredTasks(companyId, "complete", {
            limit: 50,
            page,
            waitFresh,
          }),
        ),
      );
    } catch (error) {
      if (epoch !== storeEpoch) return false;
      set({
        isLoading: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to load completed tasks.",
      });
      return false;
    }
    if (epoch !== storeEpoch) return false;
    if (!result.ok) {
      set({ isLoading: false, error: result.message });
      return false;
    }

    // Completed rows are stored in `byId`; the completed tab selects from all
    // entities and re-sorts by completed_at on the device (backend bug §3.4).
    set((state) => ({
      byId: entitiesFrom(result.data, state.byId),
      completedIds: page === 1
        ? idsOf([
            ...(result.data.tasks_assigned_to_me ?? []),
            ...(result.data.tasksByme ?? []),
            ...(result.data.all_other_tasks ?? []),
          ])
        : mergeIds(
            state.completedIds,
            idsOf([
              ...(result.data.tasks_assigned_to_me ?? []),
              ...(result.data.tasksByme ?? []),
              ...(result.data.all_other_tasks ?? []),
            ]),
          ),
      completedPage: page,
      hasMoreCompleted:
        result.data.has_more ??
        idsOf([
          ...(result.data.tasks_assigned_to_me ?? []),
          ...(result.data.tasksByme ?? []),
          ...(result.data.all_other_tasks ?? []),
        ]).length === 50,
      completeCount: result.data.complete_count ?? state.completeCount,
      isLoading: false,
      error: null,
      stale: !!result.stale || !!result.data.stale,
      lastRefresh: Date.now(),
    }));
    return true;
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
      const updated = { ...existing, ...patch };
      const wasCompleted = isCompletedStatus(existing.status);
      const isCompleted = isCompletedStatus(updated.status);
      const completedIds =
        wasCompleted === isCompleted
          ? state.completedIds
          : isCompleted
            ? mergeIds(state.completedIds, [taskId])
            : state.completedIds.filter((id) => id !== taskId);
      const wasPendingApproval = existing.status === "Pending-Approval";
      const isPendingApproval = updated.status === "Pending-Approval";
      const pendingApprovalIds =
        wasPendingApproval === isPendingApproval
          ? state.pendingApprovalIds
          : isPendingApproval
            ? mergeIds(state.pendingApprovalIds, [taskId])
            : state.pendingApprovalIds.filter((id) => id !== taskId);
      const wasRecurring = existing.is_recurring;
      const isRecurring = updated.is_recurring;
      const recurringIds =
        wasRecurring === isRecurring
          ? state.recurringIds
          : isRecurring
            ? mergeIds(state.recurringIds, [taskId])
            : state.recurringIds.filter((id) => id !== taskId);

      return {
        byId: { ...state.byId, [taskId]: updated },
        completedIds,
        completeCount: Math.max(
          0,
          state.completeCount + Number(isCompleted) - Number(wasCompleted),
        ),
        pendingApprovalIds,
        recurringIds,
      };
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
    storeEpoch += 1;
    inFlight.clear();
    set({ ...initialState });
  },
}));

/** Non-reactive access for service and compatibility-facade code. */
export const tasksStore = useTasksStore;
export type TasksStoreApi = typeof useTasksStore;
