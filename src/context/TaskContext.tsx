import { resetTaskStores, useTasksStore } from "@/features/tasks/store";
import { useAuth } from "@/hooks/useAuth";
import * as tasksService from "@/services/api/tasks.service";
import {
  AddDependencyRequest,
  AddNoteRequest,
  CreateTaskRequest,
  DependencyData,
  MentionUser,
  RecalculateScheduleRequest,
  RemoveDependencyRequest,
  ReopenTaskRequest,
  ReorderCriticalRequest,
  TaskFilter,
  TaskListItem,
  TaskListResponse,
  TaskNote,
  TaskOwner,
  TaskPriority,
  UiTaskStatus,
  UpdateTaskRequest,
  UpdateTaskStatusRequest,
  ViewTaskData,
} from "@/types/task.types";
import { extractErrorMessage } from "@/utils/errorHandler";
import { useShallow } from "zustand/react/shallow";
import {
  MappedTaskRow,
  mapTaskListResponse,
  uiStatusToApi,
} from "@/utils/statusMapper";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
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
  | { type: "LOGOUT" }
  | {
      type: "PRIORITY_CREATE";
      priority: TaskPriority;
    }
  | {
      type: "PRIORITY_UPDATE";
      priority: TaskPriority;
    }
  | {
      type: "PRIORITY_DELETE";
      priorityId: number;
    }
  | {
      type: "JOBSTATUS_CREATE";
      statusName: string;
    }
  | {
      type: "JOBSTATUS_UPDATE";
      statusId: number;
      statusName: string;
    }
  | {
      type: "JOBSTATUS_DELETE";
      statusId: number;
    }
  | {
      type: "PATCH_TASK_SCHEDULE";
      taskId: number;
      patch: {
        due_date?: string;
        remaining_effort_hours?: number;
      };
    };

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
    case "PRIORITY_CREATE":
      return {
        ...state,
        priorities: [...state.priorities, action.priority],
      };
    case "PRIORITY_UPDATE":
      return {
        ...state,
        priorities: state.priorities.map((p) =>
          p.id === action.priority.id ? action.priority : p,
        ),
      };
    case "PRIORITY_DELETE":
      return {
        ...state,
        priorities: state.priorities.filter((p) => p.id !== action.priorityId),
      };
    case "JOBSTATUS_CREATE":
      return {
        ...state,
        statusList: [...state.statusList, action.statusName],
      };
    case "JOBSTATUS_UPDATE":
      return state;
    case "JOBSTATUS_DELETE":
      return state;
    case "PATCH_TASK_SCHEDULE": {
      const patchTask = (list: TaskListItem[]) =>
        list.map((task) => {
          if (task.id !== action.taskId) return task;
          return {
            ...task,
            ...(action.patch.due_date !== undefined
              ? { due_date: action.patch.due_date }
              : {}),
            ...(action.patch.remaining_effort_hours !== undefined
              ? { effort_hours: action.patch.remaining_effort_hours }
              : {}),
          };
        });
      return {
        ...state,
        assignedToMe: patchTask(state.assignedToMe),
        createdByMe: patchTask(state.createdByMe),
        allOtherTasks: patchTask(state.allOtherTasks),
      };
    }
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
  filteredMappedTasks: MappedTaskRow[];
  dueTodayCount: number;
  totalCount: number;
  fetchAllTasks: (
    companyId: number,
    options?: { silent?: boolean },
  ) => Promise<void>;
  fetchDueToday: (companyId: number) => Promise<void>;
  fetchRecurring: (companyId: number, options?: { force?: boolean }) => Promise<void>;
  fetchFiltered: (companyId: number, filter: TaskFilter) => Promise<void>;
  fetchCompletedPage: (companyId: number, page: number) => Promise<boolean>;
  setActiveFilter: (filter: TaskFilter | null) => void;
  createTask: (data: CreateTaskRequest) => Promise<number>;
  updateTask: (taskId: number, data: UpdateTaskRequest) => Promise<any>;
  assignTaskToProject: (
    taskId: number,
    projectId: number,
    companyId: number,
    companyIdentifier: string,
  ) => Promise<void>;
  updateTaskStatusLocal: (taskId: string, status: string) => void;
  updateTaskStatusApi: (
    taskId: number,
    data: UpdateTaskStatusRequest,
  ) => Promise<void>;
  refreshTasks: (companyId: number) => Promise<void>;
  viewTask: (taskId: number) => Promise<ViewTaskData | null>;
  addNote: (
    taskId: number,
    data: AddNoteRequest,
    file?: { uri: string; name: string; type: string },
  ) => Promise<void>;
  fetchNotes: (
    taskId: number,
    companyId?: number,
    companyIdentifier?: string,
  ) => Promise<TaskNote[]>;
  fetchMentionUsers: (companyId: number) => Promise<MentionUser[]>;
  deleteNote: (
    noteId: number,
    companyId: number,
    companyIdentifier: string,
  ) => Promise<void>;
  pinNote: (
    noteId: number,
    pinned: boolean,
    companyId: number,
    companyIdentifier: string,
  ) => Promise<void>;
  approveTask: (
    taskId: number,
    companyId: number,
    companyIdentifier: string,
  ) => Promise<void>;
  rejectTask: (
    taskId: number,
    companyId: number,
    companyIdentifier: string,
    reason: string,
    additionalHours: number,
  ) => Promise<void>;
  deleteTask: (taskId: number) => Promise<void>;
  recalculateSchedule: (
    taskId: number,
    data: RecalculateScheduleRequest,
  ) => Promise<void>;
  getDependencies: (
    taskId: number,
    companyId: number,
  ) => Promise<DependencyData[]>;
  addDependency: (data: AddDependencyRequest) => Promise<void>;
  removeDependency: (data: RemoveDependencyRequest) => Promise<void>;
  reorderCritical: (
    data: ReorderCriticalRequest,
  ) => Promise<{ blockedTasks: { id: number; title: string }[] }>;
  reopenTask: (taskId: number, data: ReopenTaskRequest) => Promise<void>;
  applyPriorityUpdate: (
    action: "create" | "update" | "delete",
    data: {
      id: number;
      name?: string;
      color?: string;
      order?: number;
      company_id?: number;
    },
  ) => void;
  applyJobStatusUpdate: (
    action: "create" | "update" | "delete",
    data: { id: number; name?: string; company_id?: number; status?: number },
  ) => void;
  applyScheduleUpdate: (data: {
    id: number;
    due_date?: string;
    remaining_effort_hours?: number;
  }) => void;
  logout: () => void;
};

const TaskContext = createContext<TaskContextValue | null>(null);

export function TaskProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(taskReducer, initialState);
  const [dueTodayCount, setDueTodayCount] = useState(0);
  const [filteredMappedTasks, setFilteredMappedTasks] = useState<
    MappedTaskRow[]
  >([]);

  const { state: authState } = useAuth();
  const companyId = authState.company?.company_id ?? null;
  const previousCompanyIdRef = useRef(companyId);

  useEffect(() => {
    if (
      previousCompanyIdRef.current !== null &&
      companyId !== previousCompanyIdRef.current
    ) {
      resetTaskStores();
      dispatch({ type: "LOGOUT" });
      setDueTodayCount(0);
      setFilteredMappedTasks([]);
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
    const nextAllOtherTasks = mergeRows(state.allOtherTasks, [
      ...storeSnapshot.allOtherTaskIds,
      ...storeSnapshot.recurringIds,
      ...storeSnapshot.completedIds,
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
      setFilteredMappedTasks([]);
      dispatch({ type: "SET_FILTER", filter: null });
      dispatch({ type: "SET_ERROR", error: null });
      await useTasksStore.getState().loadDashboard(companyId, {
        force: !!options?.silent,
        silent: !!options?.silent,
      });
    },
    [],
  );

  const fetchDueToday = useCallback(
    async (companyId: number) => {
      dispatch({ type: "SET_ERROR", error: null });
      await useTasksStore.getState().loadDueToday(companyId);
    },
    [],
  );

  const fetchRecurring = useCallback(async (companyId: number) => {
    await useTasksStore.getState().loadRecurring(companyId);
  }, []);

  const fetchFiltered = useCallback(
    async (companyId: number, filter: TaskFilter) => {
      dispatch({ type: "SET_LOADING", loading: true });
      try {
        const res = await tasksService.getFilteredTasks(companyId, filter);
        if (res.Good && res.data) {
          const mapped = mapTaskListResponse(res.data);
          setFilteredMappedTasks([
            ...mapped.assignedToMe,
            ...mapped.createdByMe,
            ...mapped.allOtherTasks,
          ]);
          dispatch({ type: "LOAD_SUCCESS", data: res.data });
          dispatch({ type: "SET_FILTER", filter });
        } else {
          dispatch({
            type: "SET_ERROR",
            error: res.message ?? "Failed to load filtered tasks",
          });
        }
      } catch (error) {
        dispatch({ type: "SET_ERROR", error: extractErrorMessage(error) });
      }
    },
    [],
  );

  const setActiveFilter = useCallback((filter: TaskFilter | null) => {
    dispatch({ type: "SET_FILTER", filter });
  }, []);

  const fetchCompletedPage = useCallback(
    async (companyId: number, page: number) => {
      return useTasksStore.getState().loadCompletedPage(companyId, page);
    },
    [],
  );

  const createTask = useCallback(
    async (data: CreateTaskRequest): Promise<number> => {
      const res = await tasksService.createTask(data);
      if (
        res.Good &&
        res.data &&
        typeof res.data === "object" &&
        "id" in res.data
      ) {
        return (res.data as { id: number }).id;
      }
      throw new Error(
        typeof res.data === "string" ? res.data : "Failed to create task",
      );
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

  const refreshTasks = useCallback(
    async (companyId: number) => {
      await fetchAllTasks(companyId, { silent: true });
    },
    [fetchAllTasks],
  );

  const viewTaskAction = useCallback(
    async (taskId: number): Promise<ViewTaskData | null> => {
      const cId = companyId ?? 0;
      const res = await tasksService.viewTask(taskId, cId);
      if (res.Good && res.data) {
        return res.data;
      }
      return null;
    },
    [companyId],
  );

  const addNoteToTask = useCallback(
    async (
      taskId: number,
      data: AddNoteRequest,
      file?: { uri: string; name: string; type: string },
    ) => {
      const res = await tasksService.addNote(taskId, data, file);
      if (!res.Good) {
        console.log(res.message ?? "Failed to add comment");
      }
    },
    [],
  );

  const fetchNotes = useCallback(
    async (
      taskId: number,
      companyId?: number,
      companyIdentifier?: string,
    ): Promise<TaskNote[]> => {
      const res = await tasksService.getTaskNotes(
        taskId,
        companyId,
        companyIdentifier,
      );
      if (res.Good && Array.isArray(res.data)) {
        return res.data;
      }
      return [];
    },
    [],
  );

  const fetchMentionUsers = useCallback(
    async (companyId: number): Promise<MentionUser[]> => {
      const res = await tasksService.getMentionUsers(companyId);
      const users = res.data?.user;
      if (Array.isArray(users)) {
        return users;
      }
      return [];
    },
    [],
  );

  const deleteNoteById = useCallback(
    async (noteId: number, companyId: number, companyIdentifier: string) => {
      const res = await tasksService.deleteNote(noteId, {
        company_id: companyId,
        company_identifier: companyIdentifier,
      });
      if (!res.Good) {
        console.log(res.message ?? "Failed to delete comment");
      }
    },
    [],
  );

  const pinNoteById = useCallback(
    async (
      noteId: number,
      pinned: boolean,
      companyId: number,
      companyIdentifier: string,
    ) => {
      const res = await tasksService.pinNote(noteId, {
        pin_top: pinned ? 1 : 0,
        company_id: companyId,
        company_identifier: companyIdentifier,
      });
      if (!res.Good) {
        console.log(res.message ?? "Failed to pin comment");
      }
    },
    [],
  );

  const approveTaskById = useCallback(
    async (taskId: number, companyId: number, companyIdentifier: string) => {
      const res = await tasksService.approveTask(taskId, {
        company_id: companyId,
        company_identifier: companyIdentifier,
      });
      if (!res.Good) {
        console.log(
          typeof res.data === "string" ? res.data : "Failed to approve task",
        );
      }
    },
    [],
  );

  const rejectTaskById = useCallback(
    async (
      taskId: number,
      companyId: number,
      companyIdentifier: string,
      reason: string,
      additionalHours: number,
    ) => {
      const res = await tasksService.rejectTask(taskId, {
        company_id: companyId,
        company_identifier: companyIdentifier,
        reason,
        additional_hours: additionalHours,
      });
      if (!res.Good) {
        console.log(
          typeof res.data === "string" ? res.data : "Failed to reject task",
        );
      }
    },
    [],
  );

  const deleteTaskById = useCallback(async (taskId: number) => {
    const res = await tasksService.deleteTask(taskId);
    if (!res.Good) {
      console.log(
        typeof res.data === "string" ? res.data : "Failed to delete task",
      );
    }
  }, []);

  const recalculateScheduleById = useCallback(
    async (taskId: number, data: RecalculateScheduleRequest) => {
      try {
        await tasksService.recalculateSchedule(taskId, data);
      } catch {
        // fire-and-forget, scheduling result arrives via socket
      }
    },
    [],
  );

  const getDependenciesByTaskId = useCallback(
    async (taskId: number, companyId: number): Promise<DependencyData[]> => {
      const res = await tasksService.getDependencies(taskId, companyId);
      if (res.Good && Array.isArray(res.data)) {
        return res.data;
      }
      return [];
    },
    [],
  );

  const addDependencyAction = useCallback(
    async (data: AddDependencyRequest) => {
      const res = await tasksService.addDependency(data);
      if (!res.Good) {
        console.log(
          typeof res.data === "string" ? res.data : "Failed to add dependency",
        );
      }
    },
    [],
  );

  const removeDependencyAction = useCallback(
    async (data: RemoveDependencyRequest) => {
      const res = await tasksService.removeDependency(data);
      if (!res.Good) {
        console.log(
          typeof res.data === "string"
            ? res.data
            : "Failed to remove dependency",
        );
      }
    },
    [],
  );

  const reorderCriticalAction = useCallback(
    async (data: ReorderCriticalRequest) => {
      const res = await tasksService.reorderCritical(data);
      if (res.Good && res.data) {
        return { blockedTasks: (res.data as any).blockedTasks ?? [] };
      }
      return { blockedTasks: [] };
    },
    [],
  );

  const reopenTaskAction = useCallback(
    async (taskId: number, data: ReopenTaskRequest) => {
      const res = await tasksService.reopenTask(taskId, data);
      if (!res.Good) {
        console.log(
          typeof res.data === "string" ? res.data : "Failed to reopen task",
        );
      }
    },
    [],
  );

  const applyPriorityUpdate = useCallback(
    (
      action: "create" | "update" | "delete",
      data: {
        id: number;
        name?: string;
        color?: string;
        order?: number;
        company_id?: number;
      },
    ) => {
      switch (action) {
        case "create":
          dispatch({
            type: "PRIORITY_CREATE",
            priority: {
              id: data.id,
              name: data.name ?? "",
              color: data.color ?? "#999999",
              order: data.order ?? null,
              company_id: data.company_id ?? 0,
            },
          });
          break;
        case "update":
          dispatch({
            type: "PRIORITY_UPDATE",
            priority: {
              id: data.id,
              name: data.name ?? "",
              color: data.color ?? "#999999",
              order: data.order ?? null,
              company_id: data.company_id ?? 0,
            },
          });
          break;
        case "delete":
          dispatch({ type: "PRIORITY_DELETE", priorityId: data.id });
          break;
      }
    },
    [],
  );

  const applyJobStatusUpdate = useCallback(
    (
      action: "create" | "update" | "delete",
      data: { id: number; name?: string; company_id?: number; status?: number },
    ) => {
      switch (action) {
        case "create":
          if (data.name) {
            dispatch({ type: "JOBSTATUS_CREATE", statusName: data.name });
          }
          break;
        case "update":
        case "delete":
          break;
      }
    },
    [],
  );

  const applyScheduleUpdate = useCallback(
    (data: {
      id: number;
      due_date?: string;
      remaining_effort_hours?: number;
    }) => {
      if (!data?.id) return;
      dispatch({
        type: "PATCH_TASK_SCHEDULE",
        taskId: Number(data.id),
        patch: {
          due_date: data.due_date,
          remaining_effort_hours: data.remaining_effort_hours,
        },
      });
      useTasksStore.getState().patchTask(Number(data.id), {
        due_date: data.due_date,
        effort_hours: data.remaining_effort_hours,
      });
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
          const patched: TaskListItem = {
            ...t,
            title: data.title,
            due_date: data.due_date ?? t.due_date,
            priority: data.priority,
            status: uiStatusToApi(data.status as UiTaskStatus),
            description: data.description,
            is_recurring: data.is_recurring,
            approval_required: data.approval_required,
            effort_hours: data.effort_hours,
            effort_unit: data.effort_unit,
            task_priority: data.task_priority,
            asigned_to: data.assign_to,
            assignee: data.assign_to,
            project_id: data.project_id != null ? data.project_id : t.project_id,
          };
          if (newOwner && data.assign_to !== t.asigned_to) {
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
      useTasksStore.getState().patchTask(taskId, {
        title: data.title,
        due_date: data.due_date,
        priority: data.priority,
        status: uiStatusToApi(data.status as UiTaskStatus) as import("@/features/tasks/types/task.types").TaskEntity["status"],
        is_recurring: data.is_recurring,
        approval_required: data.approval_required === 1 ? 1 : 0,
        effort_hours: data.effort_hours,
        effort_unit: data.effort_unit,
        task_priority: data.task_priority,
        asigned_to: data.assign_to,
        assignee: data.assign_to,
        ...(data.project_id != null ? { project_id: data.project_id } : {}),
        ...(newOwner
          ? {
              task_assigned_to: {
                id: newOwner.id,
                first_name: newOwner.first_name,
                last_name: newOwner.last_name,
                image: newOwner.image ?? "",
                role: 0,
              },
            }
          : {}),
      });
    },
    [state],
  );

  const assignTaskToProject = useCallback(
    async (
      taskId: number,
      projectId: number,
      companyId: number,
      companyIdentifier: string,
    ) => {
      // Local optimistic update
      const update = (items: TaskListItem[]): TaskListItem[] =>
        items.map((t) => (t.id === taskId ? { ...t, project_id: projectId } : t));

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
      useTasksStore.getState().patchTask(taskId, { project_id: projectId });

      const res = await tasksService.updateTaskProject(taskId, {
        project_id: projectId,
        company_id: companyId,
        company_identifier: companyIdentifier,
      });

      if (!res.Good) {
        throw new Error(
          typeof res.data === "string" ? res.data : "Failed to assign project",
        );
      }
    },
    [state],
  );

  const updateTaskStatusApi = useCallback(
    async (taskId: number, data: UpdateTaskStatusRequest) => {
      updateTaskStatusLocal(String(taskId), data.status);
      const res = await tasksService.updateTaskStatus(taskId, data);
      if (!res.Good) {
        console.log(
          typeof res.data === "string"
            ? res.data
            : "Failed to update task status",
        );
      }
    },
    [updateTaskStatusLocal],
  );

  const updateTask = useCallback(
    async (taskId: number, data: UpdateTaskRequest) => {
      updateTaskLocal(taskId, data);
      const res = await tasksService.updateTask(taskId, data);
      if (!res.Good) {
        throw new Error(
          typeof res.data === "string" ? res.data : "Failed to update task",
        );
      }
      return res;
    },
    [updateTaskLocal],
  );

  const logout = useCallback(() => {
    resetTaskStores();
    setFilteredMappedTasks([]);
    dispatch({ type: "LOGOUT" });
  }, []);

  const value: TaskContextValue = useMemo(
    () => ({
      state: effectiveState,
      companyId,
      mappedAssignedToMe,
      mappedCreatedByMe,
      mappedAllOtherTasks,
      allMappedTasks,
      filteredMappedTasks,
      dueTodayCount: storeSnapshot.dueTodayCount || dueTodayCount,
      totalCount,
      fetchAllTasks,
      fetchDueToday,
      fetchRecurring,
      fetchFiltered,
      fetchCompletedPage,
      setActiveFilter,
      createTask,
      updateTask,
      assignTaskToProject,
      updateTaskStatusLocal,
      updateTaskStatusApi,
      refreshTasks,
      viewTask: viewTaskAction,
      addNote: addNoteToTask,
      fetchNotes,
      fetchMentionUsers,
      deleteNote: deleteNoteById,
      pinNote: pinNoteById,
      approveTask: approveTaskById,
      rejectTask: rejectTaskById,
      deleteTask: deleteTaskById,
      recalculateSchedule: recalculateScheduleById,
      getDependencies: getDependenciesByTaskId,
      addDependency: addDependencyAction,
      removeDependency: removeDependencyAction,
      reorderCritical: reorderCriticalAction,
      reopenTask: reopenTaskAction,
      applyPriorityUpdate,
      applyJobStatusUpdate,
      applyScheduleUpdate,
      logout,
    }),
    [
      effectiveState,
      companyId,
      mappedAssignedToMe,
      mappedCreatedByMe,
      mappedAllOtherTasks,
      allMappedTasks,
      filteredMappedTasks,
      dueTodayCount,
      storeSnapshot.dueTodayCount,
      totalCount,
      fetchAllTasks,
      fetchDueToday,
      fetchRecurring,
      fetchFiltered,
      fetchCompletedPage,
      setActiveFilter,
      createTask,
      updateTask,
      assignTaskToProject,
      updateTaskStatusLocal,
      updateTaskStatusApi,
      refreshTasks,
      viewTaskAction,
      addNoteToTask,
      fetchNotes,
      fetchMentionUsers,
      deleteNoteById,
      pinNoteById,
      approveTaskById,
      rejectTaskById,
      deleteTaskById,
      recalculateScheduleById,
      getDependenciesByTaskId,
      addDependencyAction,
      removeDependencyAction,
      reorderCriticalAction,
      reopenTaskAction,
      applyPriorityUpdate,
      applyJobStatusUpdate,
      applyScheduleUpdate,
      logout,
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
