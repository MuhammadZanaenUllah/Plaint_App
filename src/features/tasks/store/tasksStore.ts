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
import { buildTaskSearchHaystack } from "../utils/taskSearch";
import { createInflightDedupe } from "../utils/inflightDedupe";
import { createRequestTracker } from "../utils/requestGeneration";
import { listWithStaleRetry } from "../utils/staleRetry";
import {
  mergeIds,
  moveTaskToBucket,
  resolveTaskBucket,
  withoutId,
} from "../utils/taskBuckets";
import { COMPLETED_PAGE_SIZE } from "../constants/taskConstants";

// The deployed backend answers the paged Completed request with a 200 but
// `Good:false` ("Internal server error"). Keep the paged implementation for
// when the backend fix lands, but do not issue a request that is known to
// fail: the non-paged Completed list already supports local paging.
const COMPLETED_SERVER_PAGING_ENABLED = false;

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
  currentUserId: number;

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
  setCurrentUserId: (userId: number) => void;
  loadDashboard: (
    companyId: number,
    options?: { force?: boolean; silent?: boolean },
  ) => Promise<void>;
  loadAll: (
    companyId: number,
    options?: { waitFresh?: boolean; excludeComplete?: boolean },
  ) => Promise<void>;
  loadFiltered: (
    companyId: number,
    filter: TaskFilter,
    options?: {
      limit?: number;
      page?: number;
      waitFresh?: boolean;
      force?: boolean;
      silent?: boolean;
    },
  ) => Promise<void>;
  loadRecurring: (companyId: number, options?: { force?: boolean }) => Promise<void>;
  loadCompletedPage: (companyId: number, page: number) => Promise<boolean>;
  refreshLookups: (companyId: number) => Promise<void>;
  applyBuckets: (
    response: TaskListResponse,
    options?: { merge?: boolean },
  ) => void;
  upsertTask: (task: TaskListItem | TaskEntity) => void;
  applyCreatedTask: (task: TaskListItem | TaskEntity, currentUserId: number) => void;
  patchTask: (taskId: number, patch: Partial<TaskEntity>) => void;
  removeTask: (taskId: number) => void;
  clearError: () => void;
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
  currentUserId: 0,
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
const inFlight = createInflightDedupe();
const dedupe = inFlight.run;
const requestTracker = createRequestTracker();
let storeEpoch = 0;

function toEntity(row: TaskListItem | TaskEntity): TaskEntity {
  const source = row as unknown as Record<string, unknown>;
  const entity: TaskEntity = {
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
  return { ...entity, search_haystack: buildTaskSearchHaystack(entity) };
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
    ownersById: Object.fromEntries(
      (response.task_owner ?? state.owners).map((owner) => [owner.id, owner]),
    ),
    priorities: response.priority ?? state.priorities,
    prioritiesById: Object.fromEntries(
      (response.priority ?? state.priorities).map((priority) => [priority.id, priority]),
    ),
    statusList: response.status ?? state.statusList,
    teamMemberIds: response.team_member_ids
      ? response.team_member_ids.map(Number)
      : state.teamMemberIds,
  };
}

/** Merge bucket membership without dropping due-today/standalone buckets. */
function mergeBucketState(
  state: TasksState,
  ids: ReturnType<typeof bucketIds>,
): {
  assignedToMeIds: number[];
  createdByMeIds: number[];
  allOtherTaskIds: number[];
} {
  return {
    assignedToMeIds: mergeIds(state.assignedToMeIds, ids.assignedToMeIds),
    createdByMeIds: mergeIds(state.createdByMeIds, ids.createdByMeIds),
    allOtherTaskIds: mergeIds(state.allOtherTaskIds, ids.allOtherTaskIds),
  };
}

export const useTasksStore = create<TasksState>()((set, get) => ({
  ...initialState,

  setCurrentUserId: (userId) => {
    set({ currentUserId: Number.isFinite(Number(userId)) ? Number(userId) : 0 });
  },

  loadDashboard: async (companyId, options = {}) => {
    if (get().isLoading && !options.force) return;
    const epoch = storeEpoch;
    const token = requestTracker.begin(`dashboard:${companyId}`);
    set({ isLoading: !options.silent, error: null });
    try {
      const runList = <T,>(
        key: string,
        run: () => Promise<T>,
        force: boolean,
      ) => (force ? run() : dedupe(key, run));

      const loadDue = () =>
        runList(`due:${companyId}`, () =>
          listWithStaleRetry((waitFresh) =>
            getDueTodayTasks(companyId, { waitFresh }),
          ),
        options.force === true);
      const loadAll = () =>
        runList(`all:${companyId}`, () =>
          listWithStaleRetry((waitFresh) =>
            getAllTasks(companyId, { waitFresh, excludeComplete: true }),
          ),
        options.force === true);

      const applyDashboard = (
        due: TaskListResponse,
        all: TaskListResponse,
        stale: boolean,
        partial: boolean,
      ) => {
        const merged = mergeResponses(all, due);
        set((state) => {
          const ids = bucketIds(merged);
          return {
            byId: entitiesFrom(merged, state.byId),
            ...lookupPatch(merged, state),
            ...mergeBucketState(state, ids),
            recurringIds: mergeIds(
              state.recurringIds,
              lookupPatch(merged, state).recurringIds,
            ),
            pendingApprovalIds: mergeIds(
              state.pendingApprovalIds,
              lookupPatch(merged, state).pendingApprovalIds,
            ),
            completeCount: merged.complete_count ?? state.completeCount,
            dueTodayCount:
              idsOf([
                ...(due.tasks_assigned_to_me ?? []),
                ...(due.tasksByme ?? []),
                ...(due.all_other_tasks ?? []),
              ]).length,
            stale,
            isPartialLoad: partial,
            isLoading: false,
            error: null,
            lastRefresh: Date.now(),
          };
        });
      };

      if (options.force) {
        const [due, all] = await Promise.all([loadDue(), loadAll()]);
        if (storeEpoch !== epoch || !requestTracker.isCurrent(token)) return;
        if (!due.ok || !all.ok) {
          set({
            isLoading: false,
            error: !due.ok ? due.message : !all.ok ? all.message : null,
          });
          return;
        }
        applyDashboard(due.data, all.data, !!due.stale || !!all.stale, false);
        void get()
          .loadRecurring(companyId, { force: true })
          .catch(() => undefined);
        return;
      }

      // Start both requests together. The previous sequential due-then-all
      // waterfall doubled the time before the dashboard could render.
      const allPromise = loadAll();
      const due = await loadDue();
      if (storeEpoch !== epoch || !requestTracker.isCurrent(token)) return;
      if (!due.ok) {
        // The all-tasks request may still be in flight; consume its result so
        // a late rejection cannot surface as an unhandled promise.
        void allPromise.catch(() => undefined);
        set({ isLoading: false, error: due.message });
        return;
      }
      // Paint the due-today slice immediately while the full list finishes.
      set((state) => ({
        byId: entitiesFrom(due.data, state.byId),
        ...lookupPatch(due.data, state),
        ...mergeBucketState(state, bucketIds(due.data)),
        recurringIds: mergeIds(
          state.recurringIds,
          lookupPatch(due.data, state).recurringIds,
        ),
        pendingApprovalIds: mergeIds(
          state.pendingApprovalIds,
          lookupPatch(due.data, state).pendingApprovalIds,
        ),
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

      const all = await allPromise;
      if (storeEpoch !== epoch || !requestTracker.isCurrent(token)) return;
      if (!all.ok) {
        set({ isLoading: false, error: all.message });
        return;
      }
      applyDashboard(due.data, all.data, !!due.stale || !!all.stale, false);
      void get()
        .loadRecurring(companyId)
        .catch(() => undefined);
    } catch (error) {
      if (storeEpoch !== epoch || !requestTracker.isCurrent(token)) return;
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to load tasks.",
      });
    }
  },

  loadAll: async (companyId, options = {}) => {
    const epoch = storeEpoch;
    const token = requestTracker.begin(`all:${companyId}`);
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
      if (storeEpoch !== epoch || !requestTracker.isCurrent(token)) return;
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to load tasks.",
      });
      return;
    }
    if (storeEpoch !== epoch || !requestTracker.isCurrent(token)) return;
    if (!result.ok) {
      set({ isLoading: false, error: result.message });
      return;
    }
    set((state) => {
      const ids = bucketIds(result.data);
      const lookup = lookupPatch(result.data, state);
      return {
        byId: entitiesFrom(result.data, state.byId),
        ...lookup,
        ...mergeBucketState(state, ids),
        recurringIds: mergeIds(state.recurringIds, lookup.recurringIds),
        pendingApprovalIds: mergeIds(
          state.pendingApprovalIds,
          lookup.pendingApprovalIds,
        ),
        completeCount: result.data.complete_count ?? state.completeCount,
        isPartialLoad: false,
        stale: !!result.stale || !!result.data.stale,
        isLoading: false,
        error: null,
        lastRefresh: Date.now(),
      };
    });
  },

  loadFiltered: async (companyId, filter, options = {}) => {
    const epoch = storeEpoch;
    const key = `filter:${companyId}:${filter}:${options.page ?? 1}:${options.limit ?? ""}`;
    // Generation is per logical endpoint, so an older page/longer filter reply
    // cannot overwrite a newer reply for the same filter (AUD-006).
    const token = requestTracker.begin(`filter:${companyId}:${filter}`);
    const silent = options.silent === true;
    if (!silent) set({ isLoading: true, error: null });
    let result: ApiResult<TaskListResponse>;
    const run = () =>
      listWithStaleRetry((waitFresh) =>
        getFilteredTasks(companyId, filter, {
          waitFresh: waitFresh || options.waitFresh,
          limit: options.limit,
          page: options.page,
        }),
      );
    try {
      result = options.force ? await run() : await dedupe(key, run);
    } catch (error) {
      if (storeEpoch !== epoch || !requestTracker.isCurrent(token)) return;
      if (silent) return;
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to load tasks.",
      });
      return;
    }
    if (storeEpoch !== epoch || !requestTracker.isCurrent(token)) return;
    if (!result.ok) {
      if (silent) return;
      set({ isLoading: false, error: result.message });
      return;
    }
    const rows = [
      ...(result.data.tasks_assigned_to_me ?? []),
      ...(result.data.tasksByme ?? []),
      ...(result.data.all_other_tasks ?? []),
    ];
    const ids = idsOf(rows);
    set((state) => ({
      byId: entitiesFrom(result.data, state.byId),
      owners: result.data.task_owner ?? state.owners,
      priorities: result.data.priority ?? state.priorities,
      statusList: result.data.status ?? state.statusList,
      queryIds: { ...state.queryIds, [filter]: ids },
      recurringIds: filter === "recurring" ? ids : state.recurringIds,
      pendingApprovalIds:
        filter === "pending_approval"
          ? rows
              .filter((task) => task.status === "Pending-Approval")
              .map((task) => Number(task.id))
          : state.pendingApprovalIds,
      completedIds:
        filter === "complete" && !options.page ? ids : state.completedIds,
      completeCount: result.data.complete_count ?? state.completeCount,
      stale: !!result.stale || !!result.data.stale,
      isLoading: false,
      error: silent ? state.error : null,
      lastRefresh: Date.now(),
    }));
  },

  loadRecurring: async (companyId, options = {}) => {
    if (!options.force && get().queryIds.recurring) return;
    await get().loadFiltered(companyId, "recurring", {
      waitFresh: options.force === true,
      force: options.force === true,
      silent: true,
    });
  },

  loadCompletedPage: async (companyId, page) => {
    const epoch = storeEpoch;
    const key = `complete:${companyId}:${page}`;
    // One generation for the completed pager, not one per page number.
    const token = requestTracker.begin(`complete:${companyId}`);
    // Loading page N+1 must never clear the rows the user is already reading.
    // On the very first completed-page load, hide any locally-known completed
    // ids until the full initial page arrives so the tab never flashes a
    // partial single row before the batch.
    const firstCompletedLoad = page === 1 && get().completedPage === 0;
    const hasExistingRows =
      !firstCompletedLoad && (get().completedIds.length > 0 || page > 1);
    set({
      error: null,
      isLoading: !hasExistingRows,
      ...(firstCompletedLoad ? { completedIds: [] as number[] } : null),
    });

    const applyCompletedFallback = (
      data: TaskListResponse,
      fallbackStale: boolean,
    ) => {
      const fallbackRows = [
        ...(data.tasks_assigned_to_me ?? []),
        ...(data.tasksByme ?? []),
        ...(data.all_other_tasks ?? []),
      ].filter((row) =>
        isCompletedStatus(normalizeApiStatus(String(row.status))),
      );
      const fallbackIds = idsOf(fallbackRows);
      set((state) => {
        const byId = entitiesFrom(data, state.byId);
        const keep = new Set<number>([
          ...fallbackIds,
          ...state.assignedToMeIds,
          ...state.createdByMeIds,
          ...state.allOtherTaskIds,
          ...state.recurringIds,
          ...state.pendingApprovalIds,
        ]);
        for (const id of state.completedIds) {
          if (!keep.has(id)) delete byId[id];
        }
        return {
          byId,
          completedIds: fallbackIds,
          completedPage: 1,
          hasMoreCompleted: false,
          completeCount: Math.max(
            state.completeCount,
            data.complete_count ?? 0,
            fallbackIds.length,
          ),
          isLoading: false,
          error: null,
          stale: fallbackStale,
          isPartialLoad: false,
          lastRefresh: Date.now(),
        };
      });
    };

    // The deployed backend currently rejects the paged completed request with
    // a 200/Good:false "Internal server error". Fall back to the same filter
    // without paging, then to the full task list, instead of leaving the tab
    // permanently broken. The response is still virtualized on the client.
    const runCompletedFallback = async (failureMessage: string) => {
      try {
        const filtered = await dedupe(`complete-fallback:${companyId}`, () =>
          listWithStaleRetry((waitFresh) =>
            getFilteredTasks(companyId, "complete", { waitFresh }),
          ),
        );
        if (storeEpoch !== epoch || !requestTracker.isCurrent(token)) {
          return false;
        }
        if (filtered.ok) {
          applyCompletedFallback(
            filtered.data,
            !!filtered.stale || !!filtered.data.stale,
          );
          return true;
        }
      } catch {
        // Try the full-list fallback below.
      }

      try {
        const allResult = await dedupe(`complete-fallback-all:${companyId}`, () =>
          listWithStaleRetry((waitFresh) =>
            getAllTasks(companyId, { waitFresh }),
          ),
        );
        if (storeEpoch !== epoch || !requestTracker.isCurrent(token)) {
          return false;
        }
        if (allResult.ok) {
          applyCompletedFallback(
            allResult.data,
            !!allResult.stale || !!allResult.data.stale,
          );
          return true;
        }
      } catch {
        // Surface the original paged failure below.
      }

      set({ isLoading: false, error: failureMessage });
      return false;
    };

    if (!COMPLETED_SERVER_PAGING_ENABLED) {
      return runCompletedFallback("Could not load completed tasks. Please try again.");
    }

    let result: ApiResult<TaskListResponse>;
    try {
      result = await dedupe(key, () =>
        listWithStaleRetry((waitFresh) =>
          getFilteredTasks(companyId, "complete", {
            limit: COMPLETED_PAGE_SIZE,
            page,
            waitFresh,
          }),
        ),
      );
    } catch (error) {
      if (storeEpoch !== epoch || !requestTracker.isCurrent(token)) return false;
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load completed tasks.";
      if (page === 1) return runCompletedFallback(message);
      set({ isLoading: false, error: message });
      return false;
    }
    if (storeEpoch !== epoch || !requestTracker.isCurrent(token)) return false;
    if (!result.ok) {
      if (page === 1) return runCompletedFallback(result.message);
      set({ isLoading: false, error: result.message });
      return false;
    }

    const pageIds = idsOf([
      ...(result.data.tasks_assigned_to_me ?? []),
      ...(result.data.tasksByme ?? []),
      ...(result.data.all_other_tasks ?? []),
    ]);

    set((state) => {
      // Keep every fetched page for the session. Pruning loaded pages makes
      // older rows vanish while the user scrolls and breaks backward
      // scrolling; FlatList virtualization keeps the rendered window small.
      const completedIds =
        page === 1 ? pageIds : mergeIds(state.completedIds, pageIds);
      const byId = entitiesFrom(result.data, state.byId);
      if (page === 1) {
        // A refresh replaces page 1. Drop stale completed entities that are
        // no longer in the refreshed page and are not referenced elsewhere.
        const keep = new Set<number>([
          ...completedIds,
          ...state.assignedToMeIds,
          ...state.createdByMeIds,
          ...state.allOtherTaskIds,
          ...state.recurringIds,
          ...state.pendingApprovalIds,
        ]);
        for (const id of state.completedIds) {
          if (!keep.has(id)) delete byId[id];
        }
      }
      return {
        byId,
        completedIds,
        completedPage: page,
        hasMoreCompleted:
          result.data.has_more ?? pageIds.length === COMPLETED_PAGE_SIZE,
        completeCount: result.data.complete_count ?? state.completeCount,
        isLoading: false,
        error: null,
        stale: !!result.stale || !!result.data.stale,
        lastRefresh: Date.now(),
      };
    });
    return true;
  },

  refreshLookups: async (companyId) => {
    const epoch = storeEpoch;
    const token = requestTracker.begin(`lookup:${companyId}`);
    let result: ApiResult<TaskListResponse>;
    try {
      result = await dedupe(`all:${companyId}`, () =>
        listWithStaleRetry((waitFresh) =>
          getAllTasks(companyId, { waitFresh, excludeComplete: true }),
        ),
      );
    } catch {
      return;
    }
    if (storeEpoch !== epoch || !requestTracker.isCurrent(token)) return;
    if (!result.ok) return;
    set((state) => {
      const lookup = lookupPatch(result.data, state);
      return {
        byId: entitiesFrom(result.data, state.byId),
        owners: lookup.owners,
        priorities: lookup.priorities,
        statusList: lookup.statusList,
        teamMemberIds: lookup.teamMemberIds,
        stale: !!result.stale || !!result.data.stale,
        lastRefresh: Date.now(),
      };
    });
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

  upsertTask: (task) => {
    const entity = toEntity(task);
    if (!Number.isFinite(entity.id)) return;
    set((state) => ({ byId: { ...state.byId, [entity.id]: entity } }));
  },

  /**
   * Insert a task returned by /tasks/create and place it in the right buckets
   * immediately, so the dashboard shows it without a full /tasks/all refetch.
   */
  applyCreatedTask: (task, currentUserId) => {
    const base = toEntity(task);
    if (!Number.isFinite(base.id)) return;
    set((state) => {
      const idOf = (value: unknown): number => {
        if (typeof value === "object" && value !== null) {
          return Number((value as { id?: unknown }).id ?? 0);
        }
        return Number(value ?? 0);
      };
      const creatorId =
        idOf(base.created_by) ||
        idOf(base.assignee) ||
        idOf(base.task_assignee?.id) ||
        0;
      const doerId =
        idOf(base.asigned_to) ||
        idOf(base.task_assigned_to?.id) ||
        0;
      const personFor = (id: number) => {
        const owner = state.owners.find((entry) => Number(entry.id) === id);
        if (!owner) return undefined;
        return {
          id: owner.id,
          first_name: owner.first_name,
          last_name: owner.last_name,
          image: owner.image ?? "",
          role: 0,
          email: owner.email,
          company_id: owner.company_id,
        };
      };

      const entity: TaskEntity = {
        ...base,
        task_assignee: base.task_assignee ?? personFor(creatorId),
        task_assigned_to: base.task_assigned_to ?? personFor(doerId),
        can_edit: base.can_edit ?? creatorId === Number(currentUserId),
        can_edit_status:
          base.can_edit_status ??
          (creatorId === Number(currentUserId) || doerId === Number(currentUserId)),
        can_edit_subtask:
          base.can_edit_subtask ??
          (creatorId === Number(currentUserId) || doerId === Number(currentUserId)),
        subtask_count: base.subtask_count ?? 0,
        notes_count: base.notes_count ?? 0,
      };

      const without = (ids: number[]) => ids.filter((id) => id !== entity.id);
      const add = (ids: number[]) => mergeIds(ids, [entity.id]);
      const bucket = resolveTaskBucket(entity, currentUserId);

      let assignedToMeIds = without(state.assignedToMeIds);
      let createdByMeIds = without(state.createdByMeIds);
      let allOtherTaskIds = without(state.allOtherTaskIds);
      if (bucket === "assignedToMe") assignedToMeIds = add(assignedToMeIds);
      else if (bucket === "createdByMe") createdByMeIds = add(createdByMeIds);
      else allOtherTaskIds = add(allOtherTaskIds);

      const completed = isCompletedStatus(entity.status);
      const pendingApproval = entity.status === "Pending-Approval";

      return {
        byId: { ...state.byId, [entity.id]: entity },
        assignedToMeIds,
        createdByMeIds,
        allOtherTaskIds,
        recurringIds: entity.is_recurring
          ? add(state.recurringIds)
          : without(state.recurringIds),
        pendingApprovalIds: pendingApproval
          ? add(state.pendingApprovalIds)
          : without(state.pendingApprovalIds),
        completedIds: completed ? add(state.completedIds) : without(state.completedIds),
        completeCount: completed && !state.completedIds.includes(entity.id)
          ? state.completeCount + 1
          : state.completeCount,
        lastRefresh: Date.now(),
      };
    });
  },

  patchTask: (taskId, patch) => {
    set((state) => {
      const existing = state.byId[taskId];
      if (!existing) return state;
      const merged = { ...existing, ...patch };
      const updated = {
        ...merged,
        search_haystack: buildTaskSearchHaystack(merged),
      };
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

      const creatorChanged =
        patch.assignee !== undefined || patch.created_by !== undefined;
      const doerChanged = patch.asigned_to !== undefined;
      const buckets =
        (creatorChanged || doerChanged) && state.currentUserId > 0
          ? moveTaskToBucket(
              {
                assignedToMeIds: state.assignedToMeIds,
                createdByMeIds: state.createdByMeIds,
                allOtherTaskIds: state.allOtherTaskIds,
              },
              taskId,
              resolveTaskBucket(updated, state.currentUserId),
            )
          : {
              assignedToMeIds: state.assignedToMeIds,
              createdByMeIds: state.createdByMeIds,
              allOtherTaskIds: state.allOtherTaskIds,
            };

      return {
        byId: { ...state.byId, [taskId]: updated },
        ...buckets,
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

  clearError: () => set({ error: null }),

  removeTask: (taskId) => {
    set((state) => {
      const existing = state.byId[taskId];
      const byId = { ...state.byId };
      delete byId[taskId];
      return {
        byId,
        assignedToMeIds: withoutId(state.assignedToMeIds, taskId),
        createdByMeIds: withoutId(state.createdByMeIds, taskId),
        allOtherTaskIds: withoutId(state.allOtherTaskIds, taskId),
        recurringIds: withoutId(state.recurringIds, taskId),
        pendingApprovalIds: withoutId(state.pendingApprovalIds, taskId),
        completedIds: withoutId(state.completedIds, taskId),
        completeCount: Math.max(
          0,
          state.completeCount - (existing && isCompletedStatus(existing.status) ? 1 : 0),
        ),
      };
    });
  },

  reset: () => {
    storeEpoch += 1;
    inFlight.clear();
    requestTracker.clear();
    set({ ...initialState });
  },
}));

/** Non-reactive access for service and compatibility-facade code. */
export const tasksStore = useTasksStore;
export type TasksStoreApi = typeof useTasksStore;
