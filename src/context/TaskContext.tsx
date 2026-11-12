import { resetTaskStores, useTasksStore } from "@/features/tasks/store";
import { useTaskSocketBridge } from "@/features/tasks/socket/taskSocketBridge";
import {
  getDependencies,
  getMentionUsers,
  getTaskNotes,
  isApprovalRequiredMessage,
  updateTask as updateTaskRequest,
  updateTaskStatus as updateTaskStatusRequest,
  viewTask as viewTaskRequest,
} from "@/features/tasks/api/taskApi";
import { applyLocalTaskUpdate } from "@/features/tasks/utils/taskLocalPatch";
import { useAuth } from "@/hooks/useAuth";
import {
  DependencyData,
  MentionUser,
  TaskFilter,
  TaskListItem,
  TaskListResponse,
  TaskNote,
  TaskOwner,
  TaskPriority,
  UpdateTaskRequest,
  UpdateTaskStatusRequest,
  ViewTaskData,
} from "@/types/task.types";
import { useShallow } from "zustand/react/shallow";
import {
  MappedTaskRow,
  mapTaskListResponse,
} from "@/utils/statusMapper";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";

type TaskState = {
  assignedToMe: TaskListItem[];
  createdByMe: TaskListItem[];
  allOtherTasks: TaskListItem[];
  priorities: TaskPriority[];
  taskOwners: TaskOwner[];
  statusList: string[];
  completeCount: number;
  completedPage: number;
  hasMoreCompleted: boolean;
  loading: boolean;
  error: string | null;
  activeFilter: TaskFilter | null;
  // True while only the Phase-1 (due-today) slice has loaded and the full
  // company task list (Phase 2) is still in flight â€” stat counts derived
  // from the full list (All Tasks, Delayed, etc.) are momentarily incomplete
  // during this window, so screens should show a placeholder for those
  // instead of a wrong number.
  isPartialLoad: boolean;
};

type TaskAction =
  | {
      type: "LOAD_SUCCESS";
      data: TaskListResponse;
      partial?: boolean;
    }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "SET_FILTER"; filter: TaskFilter | null }
  | { type: "LOGOUT" };

const initialState: TaskState = {
  assignedToMe: [],
  createdByMe: [],
  allOtherTasks: [],
  priorities: [],
  taskOwners: [],
  statusList: [],
  completeCount: 0,
  completedPage: 0,
  hasMoreCompleted: false,
  loading: false,
  error: null,
  activeFilter: null,
  isPartialLoad: false,
};

function taskReducer(state: TaskState, action: TaskAction): TaskState {
  switch (action.type) {
    case "LOAD_SUCCESS":
      return {
        ...state,
        assignedToMe: action.data.tasks_assigned_to_me,
        createdByMe: action.data.tasksByme,
        allOtherTasks: action.data.all_other_tasks,
        priorities: action.data.priority,
        taskOwners: action.data.task_owner,
        statusList: action.data.status,
        completeCount: action.data.complete_count ?? state.completeCount,
        loading: false,
        error: null,
        isPartialLoad: action.partial ?? false,
      };
    case "SET_LOADING":
      return { ...state, loading: action.loading };
    case "SET_ERROR":
      return { ...state, error: action.error, loading: false };
    case "SET_FILTER":
      return { ...state, activeFilter: action.filter };
    case "LOGOUT":
      return initialState;
    default:
      return state;
  }
}

export type TaskContextValue = {
  state: TaskState;
  companyId: number | null;
  mappedAssignedToMe: MappedTaskRow[];
  mappedCreatedByMe: MappedTaskRow[];
  mappedAllOtherTasks: MappedTaskRow[];
  allMappedTasks: MappedTaskRow[];
  dueTodayCount: number;
  totalCount: number;
  fetchAllTasks: (
    companyId: number,
    options?: { silent?: boolean },
  ) => Promise<void>;
  fetchRecurring: (companyId: number, options?: { force?: boolean }) => Promise<void>;
  fetchCompletedPage: (companyId: number, page: number) => Promise<boolean>;
  updateTask: (taskId: number, data: UpdateTaskRequest) => Promise<any>;
  updateTaskStatusApi: (
    taskId: number,
    data: UpdateTaskStatusRequest,
  ) => Promise<void>;
  viewTask: (taskId: number) => Promise<ViewTaskData | null>;
  fetchNotes: (
    taskId: number,
    companyId?: number,
    companyIdentifier?: string,
  ) => Promise<TaskNote[]>;
  fetchMentionUsers: (companyId: number) => Promise<MentionUser[]>;
  getDependencies: (
    taskId: number,
    companyId: number,
  ) => Promise<DependencyData[]>;
};

const TaskContext = createContext<TaskContextValue | null>(null);

export function TaskProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(taskReducer, initialState);

  const { state: authState } = useAuth();
  const companyId = authState.company?.company_id ?? null;
  const previousCompanyIdRef = useRef(companyId);

  useTaskSocketBridge({
    companyId,
    currentUserId: authState.user?.id ?? 0,
    isAts: authState.hasAdvancedTaskModule === true,
  });

  useEffect(() => {
    useTasksStore.getState().setCurrentUserId(authState.user?.id ?? 0);
  }, [authState.user?.id]);

  useEffect(() => {
    if (
      previousCompanyIdRef.current !== null &&
      companyId !== previousCompanyIdRef.current
    ) {
      resetTaskStores();
      dispatch({ type: "LOGOUT" });
    }
    previousCompanyIdRef.current = companyId;
  }, [companyId]);

  const storeSnapshot = useTasksStore(
    useShallow((store) => ({
      byId: store.byId,
      assignedToMeIds: store.assignedToMeIds,
      createdByMeIds: store.createdByMeIds,
      allOtherTaskIds: store.allOtherTaskIds,
      completedIds: store.completedIds,
      recurringIds: store.recurringIds,
      owners: store.owners,
      priorities: store.priorities,
      statusList: store.statusList,
      completeCount: store.completeCount,
      dueTodayCount: store.dueTodayCount,
      completedPage: store.completedPage,
      hasMoreCompleted: store.hasMoreCompleted,
      isLoading: store.isLoading,
      isPartialLoad: store.isPartialLoad,
      error: store.error,
      stale: store.stale,
    })),
  );

  const rowsFromStore = useCallback(
    (ids: number[]): TaskListItem[] =>
      ids.reduce<TaskListItem[]>((acc, id) => {
        const task = storeSnapshot.byId[id];
        if (!task) return acc;
        acc.push({ ...task } as TaskListItem);
        return acc;
      }, []),
    [storeSnapshot.byId],
  );

  const mergeRows = useCallback(
    (legacyRows: TaskListItem[], ids: number[]) => {
      const rows = new Map(legacyRows.map((task) => [Number(task.id), task]));
      for (const task of rowsFromStore(ids)) {
        if (!rows.has(Number(task.id))) rows.set(Number(task.id), task);
      }
      return [...rows.values()];
    },
    [rowsFromStore],
  );

  const effectiveState = useMemo(() => {
    const nextAssignedToMe = mergeRows(
      state.assignedToMe,
      storeSnapshot.assignedToMeIds,
    );
    const nextCreatedByMe = mergeRows(
      state.createdByMe,
      storeSnapshot.createdByMeIds,
    );
    // Completed rows are paged separately in the dashboard store. Merging
    // thousands of them into the legacy list here duplicated every completed
    // row and mapped them again for code that only needs active tasks.
    const nextAllOtherTasks = mergeRows(state.allOtherTasks, [
      ...storeSnapshot.allOtherTaskIds,
      ...storeSnapshot.recurringIds,
    ]);

    return {
      ...state,
      assignedToMe: nextAssignedToMe,
      createdByMe: nextCreatedByMe,
      allOtherTasks: nextAllOtherTasks,
      taskOwners:
        state.taskOwners.length > 0 ? state.taskOwners : storeSnapshot.owners,
      priorities:
        state.priorities.length > 0 ? state.priorities : storeSnapshot.priorities,
      statusList:
        state.statusList.length > 0 ? state.statusList : storeSnapshot.statusList,
      completeCount: storeSnapshot.completeCount || state.completeCount,
      completedPage: storeSnapshot.completedPage,
      hasMoreCompleted: storeSnapshot.hasMoreCompleted,
      loading: state.loading || storeSnapshot.isLoading,
      error: state.error ?? storeSnapshot.error,
      isPartialLoad:
        state.isPartialLoad ||
        storeSnapshot.isPartialLoad ||
        storeSnapshot.stale,
    };
  }, [mergeRows, state, storeSnapshot]);

  useEffect(() => {
    if (
      state.assignedToMe.length === 0 &&
      state.createdByMe.length === 0 &&
      state.allOtherTasks.length === 0 &&
      state.taskOwners.length === 0 &&
      state.priorities.length === 0 &&
      state.statusList.length === 0 &&
      state.completeCount === 0
    ) {
      return;
    }
    useTasksStore.getState().applyBuckets(
      {
        tasks_assigned_to_me: state.assignedToMe,
        tasksByme: state.createdByMe,
        all_other_tasks: state.allOtherTasks,
        task_owner: state.taskOwners,
        priority: state.priorities,
        status: state.statusList,
        complete_count: state.completeCount,
      },
      { merge: state.isPartialLoad },
    );
  }, [
    state.assignedToMe,
    state.createdByMe,
    state.allOtherTasks,
    state.taskOwners,
    state.priorities,
    state.statusList,
    state.completeCount,
    state.isPartialLoad,
  ]);

  const mappedAssignedToMe = useMemo(
    () =>
      mapTaskListResponse({
        tasks_assigned_to_me: effectiveState.assignedToMe,
        tasksByme: [],
        all_other_tasks: [],
        task_owner: effectiveState.taskOwners,
        priority: [],
        status: [],
      }).assignedToMe,
    [effectiveState.assignedToMe, effectiveState.taskOwners],
  );

  const mappedCreatedByMe = useMemo(
    () =>
      mapTaskListResponse({
        tasks_assigned_to_me: [],
        tasksByme: effectiveState.createdByMe,
        all_other_tasks: [],
        task_owner: effectiveState.taskOwners,
        priority: [],
        status: [],
      }).createdByMe,
    [effectiveState.createdByMe, effectiveState.taskOwners],
  );

  const mappedAllOtherTasks = useMemo(
    () =>
      mapTaskListResponse({
        tasks_assigned_to_me: [],
        tasksByme: [],
        all_other_tasks: effectiveState.allOtherTasks,
        task_owner: effectiveState.taskOwners,
        priority: [],
        status: [],
      }).allOtherTasks,
    [effectiveState.allOtherTasks, effectiveState.taskOwners],
  );

  // Reuses the already-mapped arrays above instead of re-running
  // mapTaskListItem over every task a second time â€” /tasks/all returns
  // 500+ tasks for some companies, so this used to double the per-tab-switch
  // mapping cost for no reason.
  const allMappedTasks = useMemo(
    () => {
      const unique = new Map<number, MappedTaskRow>();
      for (const task of [
        ...mappedAssignedToMe,
        ...mappedCreatedByMe,
        ...mappedAllOtherTasks,
      ]) {
        unique.set(Number(task.id), task);
      }
      return [...unique.values()];
    },
    [mappedAssignedToMe, mappedCreatedByMe, mappedAllOtherTasks],
  );

  const totalCount = allMappedTasks.length;

  const fetchAllTasks = useCallback(
    async (companyId: number, options?: { silent?: boolean }) => {
      dispatch({ type: "SET_ERROR", error: null });
      await useTasksStore.getState().loadDashboard(companyId, {
        force: !!options?.silent,
        silent: !!options?.silent,
      });
    },
    [],
  );

  const fetchRecurring = useCallback(
    async (companyId: number, options?: { force?: boolean }) => {
      await useTasksStore.getState().loadRecurring(companyId, options);
    },
    [],
  );

  const fetchCompletedPage = useCallback(
    async (companyId: number, page: number) => {
      return useTasksStore.getState().loadCompletedPage(companyId, page);
    },
    [],
  );

  const updateTaskStatusLocal = useCallback(
    (taskId: string, status: string) => {
      const update = (items: TaskListItem[]): TaskListItem[] =>
        items.map((t) =>
          String(t.id) === taskId
            ? { ...t, status: status as TaskListItem["status"] }
            : t,
        );
      dispatch({
        type: "LOAD_SUCCESS",
        data: {
          tasks_assigned_to_me: update(state.assignedToMe),
          tasksByme: update(state.createdByMe),
          all_other_tasks: update(state.allOtherTasks),
          task_owner: state.taskOwners,
          priority: state.priorities,
          status: state.statusList,
        },
      });
      useTasksStore.getState().patchTask(Number(taskId), {
        status: status as import("@/features/tasks/types/task.types").TaskEntity["status"],
      });
    },
    [state],
  );

  const viewTaskAction = useCallback(
    async (taskId: number): Promise<ViewTaskData | null> => {
      const cId = companyId ?? 0;
      const result = await viewTaskRequest(taskId, cId);
      return result.ok ? result.data : null;
    },
    [companyId],
  );

  const fetchNotes = useCallback(
    async (
      taskId: number,
      companyId?: number,
      companyIdentifier?: string,
    ): Promise<TaskNote[]> => {
      const result = await getTaskNotes(taskId, companyId, companyIdentifier);
      return result.ok && Array.isArray(result.data) ? result.data : [];
    },
    [],
  );

  const fetchMentionUsers = useCallback(
    async (companyId: number): Promise<MentionUser[]> => {
      const result = await getMentionUsers(companyId);
      const users = result.ok ? result.data?.user : undefined;
      return Array.isArray(users) ? users : [];
    },
    [],
  );

  const getDependenciesByTaskId = useCallback(
    async (taskId: number, companyId: number): Promise<DependencyData[]> => {
      const result = await getDependencies(taskId, companyId);
      return result.ok && Array.isArray(result.data) ? result.data : [];
    },
    [],
  );

  // Patches a task's fields across all three local buckets immediately â€”
  // mirrors updateTaskStatusLocal's approach (see that comment). /tasks/all
  // is slow and unpaginated; refetching it right after a write can race the
  // backend and momentarily (or, if the user navigates away before the
  // write has propagated, indefinitely from the user's perspective) show
  // stale data over the correct optimistic state. Patching locally makes
  // the task list correct instantly, independent of any refetch timing.
  const updateTaskLocal = useCallback(
    (taskId: number, data: UpdateTaskRequest) => {
      const newOwner =
        data.assign_to != null
          ? state.taskOwners.find((o) => o.id === data.assign_to) ??
            useTasksStore
              .getState()
              .owners.find((o) => o.id === data.assign_to)
          : undefined;

      const update = (items: TaskListItem[]): TaskListItem[] =>
        items.map((t) => {
          if (t.id !== taskId) return t;
          // `assign_to` is the DOER. Never write it into `assignee` (CREATOR).
          const patched = applyLocalTaskUpdate(t, {
            title: data.title,
            due_date: data.due_date,
            priority: data.priority,
            status: data.status,
            description: data.description,
            is_recurring: data.is_recurring,
            approval_required: data.approval_required,
            effort_hours: data.effort_hours,
            effort_unit: data.effort_unit,
            task_priority: data.task_priority,
            assign_to: data.assign_to,
            project_id: data.project_id,
          });
          if (newOwner && data.assign_to != null && data.assign_to !== t.asigned_to) {
            patched.task_assigned_to = {
              id: newOwner.id,
              first_name: newOwner.first_name,
              last_name: newOwner.last_name,
              image: newOwner.image ?? "",
              role: 0,
            };
          }
          return patched;
        });

      dispatch({
        type: "LOAD_SUCCESS",
        data: {
          tasks_assigned_to_me: update(state.assignedToMe),
          tasksByme: update(state.createdByMe),
          all_other_tasks: update(state.allOtherTasks),
          task_owner: state.taskOwners,
          priority: state.priorities,
          status: state.statusList,
        },
      });

      const store = useTasksStore.getState();
      const existing = store.byId[taskId];
      if (existing) {
        const next = applyLocalTaskUpdate(existing, {
          title: data.title,
          due_date: data.due_date,
          priority: data.priority,
          status: data.status,
          description: data.description,
          is_recurring: data.is_recurring,
          approval_required: data.approval_required === 1 ? 1 : 0,
          effort_hours: data.effort_hours,
          effort_unit: data.effort_unit,
          task_priority: data.task_priority,
          assign_to: data.assign_to,
          project_id: data.project_id,
        });
        const { search_haystack: _haystack, ...patch } = next;
        store.patchTask(taskId, patch);
        if (newOwner && data.assign_to != null) {
          store.patchTask(taskId, {
            task_assigned_to: {
              id: newOwner.id,
              first_name: newOwner.first_name,
              last_name: newOwner.last_name,
              image: newOwner.image ?? "",
              role: 0,
            },
          });
        }
      }
    },
    [state],
  );

  const updateTaskStatusApi = useCallback(
    async (taskId: number, data: UpdateTaskStatusRequest) => {
      const task = [
        ...state.assignedToMe,
        ...state.createdByMe,
        ...state.allOtherTasks,
      ].find((item) => Number(item.id) === taskId);
      const previousStatus =
        task?.status ?? useTasksStore.getState().byId[taskId]?.status;
      updateTaskStatusLocal(String(taskId), data.status);
      try {
        const result = await updateTaskStatusRequest(taskId, data);
        if (!result.ok) {
          throw new Error(result.message || "Failed to update task status");
        }
        if (isApprovalRequiredMessage(result.data)) {
          updateTaskStatusLocal(String(taskId), "Pending-Approval");
        } else if (data.status === "Complete" || data.status === "Completed") {
          useTasksStore.getState().patchTask(taskId, {
            completed_at: new Date().toISOString(),
          });
        } else if (previousStatus === "Complete" || previousStatus === "Completed") {
          useTasksStore.getState().patchTask(taskId, { completed_at: null });
        }
      } catch (error) {
        if (previousStatus) {
          updateTaskStatusLocal(String(taskId), previousStatus);
        }
        throw error;
      }
    },
    [state, updateTaskStatusLocal],
  );

  const updateTask = useCallback(
    async (taskId: number, data: UpdateTaskRequest) => {
      const previousStore = useTasksStore.getState();
      const storeSnapshot = {
        byId: previousStore.byId,
        assignedToMeIds: [...previousStore.assignedToMeIds],
        createdByMeIds: [...previousStore.createdByMeIds],
        allOtherTaskIds: [...previousStore.allOtherTaskIds],
        recurringIds: [...previousStore.recurringIds],
        pendingApprovalIds: [...previousStore.pendingApprovalIds],
        completedIds: [...previousStore.completedIds],
        completeCount: previousStore.completeCount,
      };
      const legacySnapshot = {
        assignedToMe: state.assignedToMe,
        createdByMe: state.createdByMe,
        allOtherTasks: state.allOtherTasks,
        taskOwners: state.taskOwners,
        priorities: state.priorities,
        statusList: state.statusList,
        completeCount: state.completeCount,
      };

      updateTaskLocal(taskId, data);
      try {
        // Canonical API deliberately strips project_id/sprint_id and
        // normalizes status to the contract spelling (AUD-077).
        const result = await updateTaskRequest(taskId, data);
        if (!result.ok) {
          throw new Error(result.message || "Failed to update task");
        }
        return result;
      } catch (error) {
        // Roll the optimistic local update back so a rejected save cannot
        // leave server-rejected values on screen (AUD-001).
        useTasksStore.setState(storeSnapshot);
        dispatch({
          type: "LOAD_SUCCESS",
          data: {
            tasks_assigned_to_me: legacySnapshot.assignedToMe,
            tasksByme: legacySnapshot.createdByMe,
            all_other_tasks: legacySnapshot.allOtherTasks,
            task_owner: legacySnapshot.taskOwners,
            priority: legacySnapshot.priorities,
            status: legacySnapshot.statusList,
            complete_count: legacySnapshot.completeCount,
          },
        });
        throw error;
      }
    },
    [state, updateTaskLocal],
  );

  const value: TaskContextValue = useMemo(
    () => ({
      state: effectiveState,
      companyId,
      mappedAssignedToMe,
      mappedCreatedByMe,
      mappedAllOtherTasks,
      allMappedTasks,
      dueTodayCount: storeSnapshot.dueTodayCount,
      totalCount,
      fetchAllTasks,
      fetchRecurring,
      fetchCompletedPage,
      updateTask,
      updateTaskStatusApi,
      viewTask: viewTaskAction,
      fetchNotes,
      fetchMentionUsers,
      getDependencies: getDependenciesByTaskId,
    }),
    [
      effectiveState,
      companyId,
      mappedAssignedToMe,
      mappedCreatedByMe,
      mappedAllOtherTasks,
      allMappedTasks,
      storeSnapshot.dueTodayCount,
      totalCount,
      fetchAllTasks,
      fetchRecurring,
      fetchCompletedPage,
      updateTask,
      updateTaskStatusApi,
      viewTaskAction,
      fetchNotes,
      fetchMentionUsers,
      getDependenciesByTaskId,
    ],
  );

  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
}

export function useTasks(): TaskContextValue {
  const ctx = useContext(TaskContext);
  if (!ctx) {
    throw new Error("useTasks must be used within a TaskProvider");
  }
  return ctx;
}
