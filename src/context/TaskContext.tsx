import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useReducer,
  useState,
} from "react";
import * as tasksService from "@/services/api/tasks.service";
import { useAuth } from "@/hooks/useAuth";
import {
  TaskListItem,
  TaskListResponse,
  TaskPriority,
  TaskOwner,
  TaskNote,
  MentionUser,
  AddNoteRequest,
  TaskFilter,
  CreateTaskRequest,
  UpdateTaskStatusRequest,
  ViewTaskData,
  DependencyData,
  AddDependencyRequest,
  RemoveDependencyRequest,
  ReorderCriticalRequest,
  RecalculateScheduleRequest,
  RescheduleReopenedRequest,
  ReopenTaskRequest,
  ApproveTaskRequest,
  RejectTaskRequest,
} from "@/types/task.types";
import { MappedTaskRow, mapTaskListResponse } from "@/utils/statusMapper";
import { extractErrorMessage } from "@/utils/errorHandler";

type TaskState = {
  assignedToMe: TaskListItem[];
  createdByMe: TaskListItem[];
  allOtherTasks: TaskListItem[];
  priorities: TaskPriority[];
  taskOwners: TaskOwner[];
  statusList: string[];
  loading: boolean;
  error: string | null;
  activeFilter: TaskFilter | null;
  // True while only the Phase-1 (due-today) slice has loaded and the full
  // company task list (Phase 2) is still in flight — stat counts derived
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
          p.id === action.priority.id ? action.priority : p
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
  fetchAllTasks: (companyId: number, options?: { silent?: boolean }) => Promise<void>;
  fetchDueToday: (companyId: number) => Promise<void>;
  fetchFiltered: (companyId: number, filter: TaskFilter) => Promise<void>;
  setActiveFilter: (filter: TaskFilter | null) => void;
  createTask: (data: CreateTaskRequest) => Promise<number>;
  updateTaskStatusLocal: (taskId: string, status: string) => void;
  updateTaskStatusApi: (taskId: number, data: UpdateTaskStatusRequest) => Promise<void>;
  refreshTasks: (companyId: number) => Promise<void>;
  viewTask: (taskId: number) => Promise<ViewTaskData | null>;
  addNote: (
    taskId: number,
    data: AddNoteRequest,
    file?: { uri: string; name: string; type: string }
  ) => Promise<void>;
  fetchNotes: (
    taskId: number,
    companyId?: number,
    companyIdentifier?: string
  ) => Promise<TaskNote[]>;
  fetchMentionUsers: (companyId: number) => Promise<MentionUser[]>;
  deleteNote: (
    noteId: number,
    companyId: number,
    companyIdentifier: string
  ) => Promise<void>;
  pinNote: (
    noteId: number,
    pinned: boolean,
    companyId: number,
    companyIdentifier: string
  ) => Promise<void>;
  approveTask: (taskId: number, companyId: number, companyIdentifier: string) => Promise<void>;
  rejectTask: (taskId: number, companyId: number, companyIdentifier: string, reason: string, additionalHours: number) => Promise<void>;
  deleteTask: (taskId: number) => Promise<void>;
  recalculateSchedule: (taskId: number, data: RecalculateScheduleRequest) => Promise<void>;
  getDependencies: (taskId: number, companyId: number) => Promise<DependencyData[]>;
  addDependency: (data: AddDependencyRequest) => Promise<void>;
  removeDependency: (data: RemoveDependencyRequest) => Promise<void>;
  reorderCritical: (data: ReorderCriticalRequest) => Promise<{ blockedTasks: { id: number; title: string }[] }>;
  rescheduleReopened: (taskId: number, data: RescheduleReopenedRequest) => Promise<void>;
  reopenTask: (taskId: number, data: ReopenTaskRequest) => Promise<void>;
  applyPriorityUpdate: (
    action: "create" | "update" | "delete",
    data: { id: number; name?: string; color?: string; order?: number; company_id?: number }
  ) => void;
  applyJobStatusUpdate: (
    action: "create" | "update" | "delete",
    data: { id: number; name?: string; company_id?: number; status?: number }
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
  const [filteredMappedTasks, setFilteredMappedTasks] = useState<MappedTaskRow[]>([]);

  const { state: authState } = useAuth();
  const companyId = authState.company?.company_id ?? null;

  const mappedAssignedToMe = useMemo(
    () =>
      mapTaskListResponse({
        tasks_assigned_to_me: state.assignedToMe,
        tasksByme: [],
        all_other_tasks: [],
        task_owner: state.taskOwners,
        priority: [],
        status: [],
      }).assignedToMe,
    [state.assignedToMe, state.taskOwners]
  );

  const mappedCreatedByMe = useMemo(
    () =>
      mapTaskListResponse({
        tasks_assigned_to_me: [],
        tasksByme: state.createdByMe,
        all_other_tasks: [],
        task_owner: state.taskOwners,
        priority: [],
        status: [],
      }).createdByMe,
    [state.createdByMe, state.taskOwners]
  );

  const mappedAllOtherTasks = useMemo(
    () =>
      mapTaskListResponse({
        tasks_assigned_to_me: [],
        tasksByme: [],
        all_other_tasks: state.allOtherTasks,
        task_owner: state.taskOwners,
        priority: [],
        status: [],
      }).allOtherTasks,
    [state.allOtherTasks, state.taskOwners]
  );

  const allMappedTasks = useMemo(() => {
    const response: TaskListResponse = {
      tasks_assigned_to_me: state.assignedToMe,
      tasksByme: state.createdByMe,
      all_other_tasks: state.allOtherTasks,
      task_owner: state.taskOwners,
      priority: [],
      status: [],
    };
    const mapped = mapTaskListResponse(response);
    return [...mapped.assignedToMe, ...mapped.createdByMe, ...mapped.allOtherTasks];
  }, [state.assignedToMe, state.createdByMe, state.allOtherTasks, state.taskOwners]);

  const totalCount = allMappedTasks.length;

  // /tasks/all + /tasks/duetoday are unpaginated (fetch the whole company's
  // task list every call), so overlapping requests are pure waste. Dedupe
  // concurrent calls onto a single in-flight request instead of firing one
  // per caller (mount + a same-instant socket refetch + pull-to-refresh, etc).
  const inFlightFetchRef = useRef<Promise<void> | null>(null);

  const fetchAllTasks = useCallback(
    async (companyId: number, options?: { silent?: boolean }) => {
      if (inFlightFetchRef.current) {
        console.log(`[TaskContext] fetchAllTasks already in flight — awaiting existing request instead of firing a new one`);
        return inFlightFetchRef.current;
      }

      // /tasks/all is unpaginated and returns the whole company's task list
      // (500+ tasks for some companies), while /tasks/duetoday returns just
      // today's slice. The web app documents this as a two-phase load:
      // duetoday first for an almost-instant first paint, then the full list
      // fills in behind it. Mirror that here for foreground loads so the
      // screen isn't stuck on a spinner for the full, heavier request.
      const mergeArrays = (a: TaskListItem[] = [], b: TaskListItem[] = []) => {
        const map = new Map<number, TaskListItem>();
        for (const t of a ?? []) map.set(t.id, t);
        for (const t of b ?? []) if (!map.has(t.id)) map.set(t.id, t);
        return [...map.values()];
      };

      const applyDueTodayCount = (data: TaskListResponse) => {
        setDueTodayCount(
          data.tasks_assigned_to_me.length +
            data.tasksByme.length +
            data.all_other_tasks.length
        );
      };

      const run = async () => {
      console.log(`[TaskContext] fetchAllTasks called with companyId=${companyId}, silent=${options?.silent}`);
      if (!options?.silent) {
        dispatch({ type: "SET_LOADING", loading: true });
      }
      setFilteredMappedTasks([]);
    try {
      if (options?.silent) {
        // Background refresh (socket/pull-to-refresh) — no spinner is
        // showing, so fetch both in parallel as before; there's nothing to
        // paint sooner by staggering them.
        const [res, todayRes] = await Promise.all([
          tasksService.getAllTasks(companyId),
          tasksService.getDueTodayTasks(companyId),
        ]);

        if (res.Good && res.data) {
          const mergedData: TaskListResponse = {
            ...res.data,
            tasks_assigned_to_me: mergeArrays(res.data.tasks_assigned_to_me, todayRes.data?.tasks_assigned_to_me),
            tasksByme: mergeArrays(res.data.tasksByme, todayRes.data?.tasksByme),
            all_other_tasks: mergeArrays(res.data.all_other_tasks, todayRes.data?.all_other_tasks),
          };
          dispatch({ type: "LOAD_SUCCESS", data: mergedData });
          dispatch({ type: "SET_FILTER", filter: null });
          if (todayRes.Good && todayRes.data) applyDueTodayCount(todayRes.data);
        } else {
          console.error(`[TaskContext] getAllTasks failed:`, res.message);
          dispatch({ type: "SET_ERROR", error: res.message ?? "Failed to load tasks" });
        }
        return;
      }

      // Foreground load — Phase 1: today's tasks only, paints almost
      // instantly and turns off the loading spinner.
      const todayRes = await tasksService.getDueTodayTasks(companyId);
      if (todayRes.Good && todayRes.data) {
        dispatch({ type: "LOAD_SUCCESS", data: todayRes.data, partial: true });
        dispatch({ type: "SET_FILTER", filter: null });
        applyDueTodayCount(todayRes.data);
      }

      // Phase 2: the full (unpaginated) company task list, merged in once
      // it arrives — no spinner, the screen already has Phase 1's data.
      const res = await tasksService.getAllTasks(companyId);
      console.log(`[TaskContext] getAllTasks response Good=${res.Good}, data keys:`, res.data ? Object.keys(res.data) : "null");

      if (res.Good && res.data) {
        const mergedData: TaskListResponse = {
          ...res.data,
          tasks_assigned_to_me: mergeArrays(res.data.tasks_assigned_to_me, todayRes.data?.tasks_assigned_to_me),
          tasksByme: mergeArrays(res.data.tasksByme, todayRes.data?.tasksByme),
          all_other_tasks: mergeArrays(res.data.all_other_tasks, todayRes.data?.all_other_tasks),
        };

        const taskCount = (mergedData.tasks_assigned_to_me?.length ?? 0) +
          (mergedData.tasksByme?.length ?? 0) +
          (mergedData.all_other_tasks?.length ?? 0);
        console.log(`[TaskContext] Loaded ${taskCount} tasks total (assigned_to_me: ${mergedData.tasks_assigned_to_me?.length ?? 0}, by_me: ${mergedData.tasksByme?.length ?? 0}, other: ${mergedData.all_other_tasks?.length ?? 0})`);

        dispatch({ type: "LOAD_SUCCESS", data: mergedData });
        dispatch({ type: "SET_FILTER", filter: null });
      } else if (!todayRes.Good) {
        console.error(`[TaskContext] getAllTasks failed:`, res.message);
        dispatch({ type: "SET_ERROR", error: res.message ?? "Failed to load tasks" });
      }
    } catch (error) {
      console.error(`[TaskContext] fetchAllTasks error:`, error);
      dispatch({ type: "SET_ERROR", error: extractErrorMessage(error) });
    }
      };

      const promise = run().finally(() => {
        inFlightFetchRef.current = null;
      });
      inFlightFetchRef.current = promise;
      return promise;
    },
    []
  );

  const fetchDueToday = useCallback(async (companyId: number) => {
    dispatch({ type: "SET_LOADING", loading: true });
    try {
      const res = await tasksService.getDueTodayTasks(companyId);
      if (res.Good && res.data) {
        dispatch({ type: "LOAD_SUCCESS", data: res.data });
      } else {
        dispatch({ type: "SET_ERROR", error: res.message ?? "Failed to load due today tasks" });
      }
    } catch (error) {
      dispatch({ type: "SET_ERROR", error: extractErrorMessage(error) });
    }
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
    []
  );

  const setActiveFilter = useCallback((filter: TaskFilter | null) => {
    dispatch({ type: "SET_FILTER", filter });
  }, []);

  const createTask = useCallback(
    async (data: CreateTaskRequest): Promise<number> => {
      const res = await tasksService.createTask(data);
      if (res.Good && res.data && typeof res.data === "object" && "id" in res.data) {
        return (res.data as { id: number }).id;
      }
      throw new Error(typeof res.data === "string" ? res.data : "Failed to create task");
    },
    []
  );

  const updateTaskStatusLocal = useCallback((taskId: string, status: string) => {
    const update = (items: TaskListItem[]): TaskListItem[] =>
      items.map((t) =>
        String(t.id) === taskId
          ? { ...t, status: status as TaskListItem["status"] }
          : t
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
  }, [state]);

  const refreshTasks = useCallback(
    async (companyId: number) => {
      await fetchAllTasks(companyId, { silent: true });
    },
    [fetchAllTasks]
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
    [companyId]
  );

  const addNoteToTask = useCallback(
    async (
      taskId: number,
      data: AddNoteRequest,
      file?: { uri: string; name: string; type: string }
    ) => {
      const res = await tasksService.addNote(taskId, data, file);
      if (!res.Good) {
        throw new Error(res.message ?? "Failed to add comment");
      }
    },
    []
  );

  const fetchNotes = useCallback(
    async (
      taskId: number,
      companyId?: number,
      companyIdentifier?: string
    ): Promise<TaskNote[]> => {
      const res = await tasksService.getTaskNotes(
        taskId,
        companyId,
        companyIdentifier
      );
      if (res.Good && Array.isArray(res.data)) {
        return res.data;
      }
      return [];
    },
    []
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
    []
  );

  const deleteNoteById = useCallback(
    async (noteId: number, companyId: number, companyIdentifier: string) => {
      const res = await tasksService.deleteNote(noteId, {
        company_id: companyId,
        company_identifier: companyIdentifier,
      });
      if (!res.Good) {
        throw new Error(res.message ?? "Failed to delete comment");
      }
    },
    []
  );

  const pinNoteById = useCallback(
    async (
      noteId: number,
      pinned: boolean,
      companyId: number,
      companyIdentifier: string
    ) => {
      const res = await tasksService.pinNote(noteId, {
        pin_top: pinned ? 1 : 0,
        company_id: companyId,
        company_identifier: companyIdentifier,
      });
      if (!res.Good) {
        throw new Error(res.message ?? "Failed to pin comment");
      }
    },
    []
  );

  const approveTaskById = useCallback(async (taskId: number, companyId: number, companyIdentifier: string) => {
    const res = await tasksService.approveTask(taskId, {
      company_id: companyId,
      company_identifier: companyIdentifier,
    });
    if (!res.Good) {
      throw new Error(typeof res.data === "string" ? res.data : "Failed to approve task");
    }
  }, []);

  const rejectTaskById = useCallback(async (taskId: number, companyId: number, companyIdentifier: string, reason: string, additionalHours: number) => {
    const res = await tasksService.rejectTask(taskId, {
      company_id: companyId,
      company_identifier: companyIdentifier,
      reason,
      additional_hours: additionalHours,
    });
    if (!res.Good) {
      throw new Error(typeof res.data === "string" ? res.data : "Failed to reject task");
    }
  }, []);

  const deleteTaskById = useCallback(async (taskId: number) => {
    const res = await tasksService.deleteTask(taskId);
    if (!res.Good) {
      throw new Error(typeof res.data === "string" ? res.data : "Failed to delete task");
    }
  }, []);

  const recalculateScheduleById = useCallback(async (taskId: number, data: RecalculateScheduleRequest) => {
    try {
      await tasksService.recalculateSchedule(taskId, data);
    } catch {
      // fire-and-forget, scheduling result arrives via socket
    }
  }, []);

  const getDependenciesByTaskId = useCallback(async (taskId: number, companyId: number): Promise<DependencyData[]> => {
    const res = await tasksService.getDependencies(taskId, companyId);
    if (res.Good && Array.isArray(res.data)) {
      return res.data;
    }
    return [];
  }, []);

  const addDependencyAction = useCallback(async (data: AddDependencyRequest) => {
    const res = await tasksService.addDependency(data);
    if (!res.Good) {
      throw new Error(typeof res.data === "string" ? res.data : "Failed to add dependency");
    }
  }, []);

  const removeDependencyAction = useCallback(async (data: RemoveDependencyRequest) => {
    const res = await tasksService.removeDependency(data);
    if (!res.Good) {
      throw new Error(typeof res.data === "string" ? res.data : "Failed to remove dependency");
    }
  }, []);

  const reorderCriticalAction = useCallback(async (data: ReorderCriticalRequest) => {
    const res = await tasksService.reorderCritical(data);
    if (res.Good && res.data) {
      return { blockedTasks: (res.data as any).blockedTasks ?? [] };
    }
    return { blockedTasks: [] };
  }, []);

  const rescheduleReopenedAction = useCallback(async (taskId: number, data: RescheduleReopenedRequest) => {
    const res = await tasksService.rescheduleReopened(taskId, data);
    if (!res.Good) {
      throw new Error(typeof res.data === "string" ? res.data : "Failed to reschedule task");
    }
  }, []);

  const reopenTaskAction = useCallback(async (taskId: number, data: ReopenTaskRequest) => {
    const res = await tasksService.reopenTask(taskId, data);
    if (!res.Good) {
      throw new Error(typeof res.data === "string" ? res.data : "Failed to reopen task");
    }
  }, []);

  const applyPriorityUpdate = useCallback(
    (
      action: "create" | "update" | "delete",
      data: { id: number; name?: string; color?: string; order?: number; company_id?: number }
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
    []
  );

  const applyJobStatusUpdate = useCallback(
    (
      action: "create" | "update" | "delete",
      data: { id: number; name?: string; company_id?: number; status?: number }
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
    []
  );

  const applyScheduleUpdate = useCallback(
    (data: { id: number; due_date?: string; remaining_effort_hours?: number }) => {
      if (!data?.id) return;
      dispatch({
        type: "PATCH_TASK_SCHEDULE",
        taskId: Number(data.id),
        patch: {
          due_date: data.due_date,
          remaining_effort_hours: data.remaining_effort_hours,
        },
      });
    },
    []
  );

  const updateTaskStatusApi = useCallback(
    async (taskId: number, data: UpdateTaskStatusRequest) => {
      const res = await tasksService.updateTaskStatus(taskId, data);
      if (!res.Good) {
        throw new Error(typeof res.data === "string" ? res.data : "Failed to update task status");
      }
    },
    []
  );

  const logout = useCallback(() => {
    setFilteredMappedTasks([]);
    dispatch({ type: "LOGOUT" });
  }, []);

  const value: TaskContextValue = useMemo(
    () => ({
      state,
      companyId,
      mappedAssignedToMe,
      mappedCreatedByMe,
      mappedAllOtherTasks,
      allMappedTasks,
      filteredMappedTasks,
      dueTodayCount,
      totalCount,
      fetchAllTasks,
      fetchDueToday,
      fetchFiltered,
      setActiveFilter,
      createTask,
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
      rescheduleReopened: rescheduleReopenedAction,
      reopenTask: reopenTaskAction,
      applyPriorityUpdate,
      applyJobStatusUpdate,
      applyScheduleUpdate,
      logout,
    }),
    [
      state,
      companyId,
      mappedAssignedToMe,
      mappedCreatedByMe,
      mappedAllOtherTasks,
      allMappedTasks,
      filteredMappedTasks,
      dueTodayCount,
      totalCount,
      fetchAllTasks,
      fetchDueToday,
      fetchFiltered,
      setActiveFilter,
      createTask,
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
      rescheduleReopenedAction,
      reopenTaskAction,
      applyPriorityUpdate,
      applyJobStatusUpdate,
      logout,
    ]
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
