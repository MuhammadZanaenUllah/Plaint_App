import FilterModal from "@/components/FilterModal";
// PROJECT MODULE DISABLED
// import AssignTaskProjectModal from "@/components/AssignTaskProjectModal";
import { AssignableOwner } from "@/components/SingleTaskTable";
import {
  TaskDetail,
  buildTaskDetailFromViewTask,
} from "@/components/TaskDetailModal";
import { STATUS_COLORS, StatusType, TaskRowProps } from "@/components/TaskRow";
import TaskTable from "@/components/TaskTable";
import TaskListSection from "@/features/tasks/components/dashboard/TaskListSection";
import TaskStatsBar from "@/features/tasks/components/dashboard/TaskStatsBar";
import TaskModalsHost from "@/features/tasks/components/dashboard/TaskModalsHost";
import Icons from "@/constants/icons";
import { useSearch } from "@/context/SearchContext";
import { useAuth } from "@/hooks/useAuth";
import { useTasks } from "@/hooks/useTasks";
import { useTaskSocket } from "@/hooks/useTaskSocket";
import {
  extendDelayedTask,
  reassignTask,
  viewTask,
} from "@/services/api/tasks.service";
// PROJECT MODULE DISABLED
// import { canCreateProject, canCreateTask } from "@/utils/permissions";
import { canCreateTask } from "@/utils/permissions";
import { rf } from "@/utils/responsive";
import { uiStatusToApi } from "@/utils/statusMapper";
import { showError, showInfo, showSuccess } from "@/utils/toast";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTaskSearch } from "@/features/tasks/hooks/useTaskSearch";
import { TASK_TABS } from "@/features/tasks/constants/taskTabs";
import { useTaskFiltersStore } from "@/features/tasks/store/taskFiltersStore";
import { isCompletedStatus } from "@/features/tasks/utils/taskStatus";
import { sortTasksByDueDate } from "@/features/tasks/utils/taskSort";
import {
  getWeekRange,
  isPktPast,
  isPktToday,
  parseTaskDate,
  toPktDateOnly,
} from "@/features/tasks/utils/taskDate";
import {
  Dimensions,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

const {
  AllTaskIcon: AllTasksIcon,
  AssignIcon,
  CompletedIcon,
  CreatedIcon,
  DelayIcon,
  DueTodayIcon,
  RecurringIcon,
  SevenDayIcon: SevendayIcon,
} = Icons;

const pad = (n: number) => String(n).padStart(2, "0");

// Infinite pagination batch size — the visible list renders in chunks of this
// many tasks per tab while header counts always reflect the full dataset.
const PAGE_SIZE = 20;
const COMPLETED_PAGE_SIZE = 50;

export default function TasksScreen() {
  const { state: authState } = useAuth();
  const {
    state: taskState,
    allMappedTasks,
    fetchAllTasks,
    fetchCompletedPage,
    fetchRecurring,
    mappedAssignedToMe,
    mappedCreatedByMe,
    updateTaskStatusApi,
    // PROJECT MODULE DISABLED
    // assignTaskToProject,
  } = useTasks();

  useTaskSocket();

  const activeTab = useTaskFiltersStore((store) => store.activeTab);
  const selectedTab = activeTab;
  const visibleCount = useTaskFiltersStore(
    (store) =>
      store.page *
      (store.activeTab === "completed" ? COMPLETED_PAGE_SIZE : PAGE_SIZE),
  );
  const [filterVisible, setFilterVisible] = useState(false);
  const [createVisible, setCreateVisible] = useState(false);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectTargetTaskId, setRejectTargetTaskId] = useState<number | null>(
    null,
  );
  // PROJECT MODULE DISABLED — add-to-project modal state
//   const [projectModalTask, setProjectModalTask] = useState<TaskRowProps | null>(
//     null,
//   );
  const [selectedTask, setSelectedTask] = useState<TaskDetail | null>(null);
  const [detailInitialTab, setDetailInitialTab] = useState<
    "details" | "comments"
  >("details");
  const [activeStatusFilter, setActiveStatusFilter] = useState<string | null>(
    null,
  );
  const [activePriorityFilter, setActivePriorityFilter] = useState<
    string | null
  >(null);
  const [activeStartDateFilter, setActiveStartDateFilter] =
    useState<Date | null>(null);
  const [activeEndDateFilter, setActiveEndDateFilter] = useState<Date | null>(
    null,
  );
  const [activeCreatedByFilter, setActiveCreatedByFilter] = useState<
    number | number[] | null
  >(null);
  const [activeAssignedToFilter, setActiveAssignedToFilter] = useState<
    number | number[] | null
  >(null);

  // Pagination state — how many tasks of the current tab's dataset are visible.
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const setVisibleCount = useCallback(
    (update: number | ((previous: number) => number)) => {
      const filters = useTaskFiltersStore.getState();
      const pageSize =
        filters.activeTab === "completed" ? COMPLETED_PAGE_SIZE : PAGE_SIZE;
      const currentCount = filters.page * pageSize;
      const nextCount =
        typeof update === "function" ? update(currentCount) : update;
      filters.setPage(Math.max(1, Math.ceil(nextCount / pageSize)));
    },
    [],
  );

  // ── Overdue / delayed-task notifications (in-app, app-driven) ────────────
  const [delayTask, setDelayTask] = useState<{
    id: number;
    title: string;
    assignedTo: string;
  } | null>(null);
  const overdueToastShownRef = useRef(false);
  const lastTaskErrorRef = useRef<string | null>(null);
  const delayPromptedIdsRef = useRef<Set<number>>(new Set());
  const hasPromptedDelayThisSessionRef = useRef(false);
  const currentUserId = authState.user?.id ?? 0;

  const statsScrollRef = useRef<ScrollView>(null);
  const cardLayoutsRef = useRef<Record<string, { x: number; width: number }>>(
    {},
  );

  const companyIdentifier = authState.company?.company_identifier ?? "";

  const companyId = authState.company?.company_id;

  // Search text from the shared header search bar (SearchProvider in the tab layout).
  const { searchText, isHeaderCompact, setIsHeaderCompact } = useSearch();
  const debouncedSearchText = useTaskSearch(searchText);

  useEffect(() => {
    useTaskFiltersStore.getState().setSearchQuery(debouncedSearchText);
  }, [debouncedSearchText]);

  // Collapses the shared header's search bar + shrinks the stat cards once
  // the task list has scrolled past a small threshold.
  const SCROLL_COMPACT_THRESHOLD = 8;
  const handleTableScrollOffset = useCallback(
    (offsetY: number) => {
      setIsHeaderCompact(offsetY > SCROLL_COMPACT_THRESHOLD);
    },
    [setIsHeaderCompact],
  );

  // Create-task visibility is driven by the logged-in user's `is_head`
  // attribute (`userdata.is_head` from the login payload). Only department
  // heads ever see the create-task FAB.
  const canCreate = useMemo(
    () => canCreateTask(authState.user),
    [authState.user],
  );
  const canUseOwnerFilter = useMemo(() => {
    const user = authState.user;
    const roleTitle = user?.role_title?.trim().toLowerCase() ?? "";
    const isHead =
      user?.is_head !== undefined &&
      user.is_head !== null &&
      !["", "0", "false", "no"].includes(
        String(user.is_head).trim().toLowerCase(),
      );
    return (
      isHead ||
      user?.is_saas_admin === true ||
      roleTitle.includes("admin") ||
      roleTitle.includes("head")
    );
  }, [authState.user]);

  // PROJECT MODULE DISABLED
  // Add-to-project visibility is driven by user permission "project-create"
  // const canAssignProject = useMemo(
  //   () => canCreateProject(authState.user),
  //   [authState.user],
  // );

  useEffect(() => {
    if (companyId) {
      console.log(
        `[TasksScreen] Initial fetchAllTasks with companyId=${companyId}`,
      );
      fetchAllTasks(companyId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    if (!taskState.error || taskState.error === lastTaskErrorRef.current) return;
    lastTaskErrorRef.current = taskState.error;
    if (allMappedTasks.length > 0) {
      showError("Task loading failed", taskState.error);
    }
  }, [allMappedTasks.length, taskState.error]);

  // ── App-driven overdue / delay notifications (changes1.md §8.4-8.5) ─────
  // The app detects overdue tasks client-side (due_date in the past and not
  // completed) and surfaces them in-app: a one-time summary toast plus, for
  // tasks the current user assigned to someone else, the TaskDelay escalation
  // popup (at most once per session to prevent infinite popup loops & app freeze).
  useEffect(() => {
    if (!companyId) return;

    // 1. One-time summary toast scan across all company tasks (runs ONCE per session)
    if (!overdueToastShownRef.current && allMappedTasks.length > 0) {
      overdueToastShownRef.current = true;
      const nowMs = Date.now();

      let overdueCount = 0;
      for (const t of allMappedTasks) {
        if (t.status === "Completed") continue;
        const raw = t._raw?.due_date;
        if (!raw) continue;
        const ms = Date.parse(raw);
        if (!isNaN(ms) && ms < nowMs) overdueCount++;
      }
      if (overdueCount > 0) {
        showInfo(
          "Overdue Tasks",
          `You have ${overdueCount} overdue task${overdueCount === 1 ? "" : "s"} that need attention.`,
        );
      }
    }

    // 2. Escalation popup for tasks created by current user and assigned to others.
    // Limit to at most 1 prompt per session so accounts with many delayed tasks don't get trapped
    // in an endless loop of sequential modal popups freezing the app.
    if (
      currentUserId > 0 &&
      !delayTask &&
      !hasPromptedDelayThisSessionRef.current &&
      mappedCreatedByMe.length > 0
    ) {
      const nowMs = Date.now();

      let earliest: (typeof mappedCreatedByMe)[number] | null = null;
      let earliestMs = Infinity;

      for (const t of mappedCreatedByMe) {
        if (t.status === "Completed") continue;
        if (t._raw?.created_by !== currentUserId) continue;
        if (t._raw?.asigned_to === currentUserId) continue;
        const taskId = Number(t.id);
        if (delayPromptedIdsRef.current.has(taskId)) continue;
        const raw = t._raw?.due_date;
        if (!raw) continue;
        const ms = Date.parse(raw);
        if (isNaN(ms) || ms >= nowMs) continue; // not overdue
        if (ms < earliestMs) {
          earliestMs = ms;
          earliest = t;
        }
      }

      if (earliest) {
        hasPromptedDelayThisSessionRef.current = true;
        delayPromptedIdsRef.current.add(Number(earliest.id));
        const assignee = earliest._raw?.task_assigned_to;
        const assigneeName =
          `${assignee?.first_name ?? ""} ${assignee?.last_name ?? ""}`.trim() ||
          `User #${earliest._raw?.asigned_to ?? ""}`;
        setDelayTask({
          id: Number(earliest.id),
          title: earliest._raw?.title ?? "Task",
          assignedTo: assigneeName,
        });
      }
    }
  }, [allMappedTasks, mappedCreatedByMe, companyId, currentUserId, delayTask]);

  const handleExtendDelay = useCallback(
    async (effort: string, unit: string) => {
      if (!delayTask || !companyId) return;
      const additional = Number(effort);
      if (!additional || additional <= 0) return;
      const unitMap: Record<string, "minutes" | "hours" | "days"> = {
        Mins: "minutes",
        Hours: "hours",
        Days: "days",
      };
      setDelayTask(null);
      try {
        await extendDelayedTask(delayTask.id, {
          additional_effort: additional,
          unit: unitMap[unit] ?? "minutes",
          company_id: companyId,
        });
        showSuccess("Task Extended", `Due date extended by ${effort} ${unit}.`);
        // No explicit refetch here — the backend broadcasts a `task_update`
        // "schedule_update" event after extending, and the granular socket
        // patch updates due_date / effort_hours without polling.
      } catch {
        showError("Update Failed", "Could not extend the task due date.");
      }
    },
    [delayTask, companyId],
  );

  // useEffect(() => {
  //   console.log(`[TasksScreen] allMappedTasks updated — count: ${allMappedTasks.length}, ids: [${allMappedTasks.map(t => t.id).join(", ")}]`);
  // }, [allMappedTasks]);

  const handleTabPress = useCallback(
    (tabId: string) => {
      setLoadingMore(false);
      const selectedTaskTab = TASK_TABS.find((tab) => tab.id === tabId);
      if (selectedTaskTab) {
        useTaskFiltersStore.getState().setActiveTab(selectedTaskTab.id);
      }
      if (
        tabId === "completed" &&
        companyId &&
        taskState.completedPage === 0
      ) {
        fetchCompletedPage(companyId, 1);
      }
      if (tabId === "recurring" && companyId) {
        fetchRecurring(companyId);
      }

      // Smoothly slide/scroll the horizontal ScrollView to center the selected stat card
      const layout = cardLayoutsRef.current[tabId];
      if (layout && statsScrollRef.current) {
        const screenWidth = Dimensions.get("window").width;
        const scrollToX = Math.max(
          0,
          layout.x + layout.width / 2 - screenWidth / 2,
        );
        statsScrollRef.current.scrollTo({ x: scrollToX, animated: true });
      }

      if (tabId === "all" && companyId) {
        fetchAllTasks(companyId, { silent: true });
      }
    },
    [
      companyId,
      fetchAllTasks,
      fetchCompletedPage,
      fetchRecurring,
      taskState.completedPage,
    ],
  );

  const handleStatusChange = useCallback(
    async (targetTask: TaskRowProps, newStatus: StatusType) => {
      if (!targetTask.id || !companyId) return;

      if (newStatus === "Rejected") {
        setRejectTargetTaskId(Number(targetTask.id));
        setRejectModalVisible(true);
        return;
      }

      if (
        newStatus === "In-Progress" ||
        (newStatus as string) === "In Progress"
      ) {
        const hasOtherInProgress = (taskState.assignedToMe || []).some(
          (t) =>
            ((t.status as string) === "In Progress" ||
              (t.status as string) === "In-Progress" ||
              (t.status as string) === "in_progress") &&
            String(t.id) !== String(targetTask.id),
        );
        if (hasOtherInProgress) {
          showError(
            "Action Not Allowed",
            "Another task is already in progress. You can only have one task in progress at a time.",
          );
          return;
        }
      }

      const apiStatus = uiStatusToApi(newStatus);
      try {
        await updateTaskStatusApi(Number(targetTask.id), {
          status: apiStatus,
          company_id: companyId,
          company_identifier: companyIdentifier,
        });
      } catch (err: any) {
        showError(
          "Status Update Failed",
          err.message || "Failed to update task status.",
        );
      }
    },
    [companyId, companyIdentifier, taskState.assignedToMe, updateTaskStatusApi],
  );

  const handleAssigneeChange = useCallback(
    async (targetTask: TaskRowProps, owner: AssignableOwner) => {
      if (!targetTask.id || !companyId) return;
      try {
        await reassignTask(Number(targetTask.id), {
          asigned_to: owner.id,
          assignee: owner.id,
          company_id: companyId,
          company_identifier: companyIdentifier,
        });
        fetchAllTasks(companyId, { silent: true });
      } catch {
        showError("Error", "Failed to reassign task. Please try again.");
      }
    },
    [companyId, companyIdentifier, fetchAllTasks],
  );

  // Restart the visible list at page 1 so the newly-filtered results start
  // from the top.
  const handleOpenFilter = useCallback(() => {
    setFilterVisible(true);
    useTaskFiltersStore.getState().setFilterModalVisible(true);
  }, []);

  const resetPagination = useCallback(() => {
    setLoadingMore(false);
    useTaskFiltersStore.getState().setPage(1);
  }, []);

  const handleFilterApply = useCallback(
    (filters: {
      status: string | null;
      priority: string | null;
      startDate?: Date | null;
      endDate?: Date | null;
      createdBy?: number | number[] | null;
      assignedTo?: number | number[] | null;
    }) => {
      console.log("[TasksScreen] Filter Applied:", {
        status: filters.status,
        priority: filters.priority,
        startDate: filters.startDate ? filters.startDate.toISOString() : null,
        endDate: filters.endDate ? filters.endDate.toISOString() : null,
        createdBy: filters.createdBy,
        assignedTo: filters.assignedTo,
      });
      setActiveStatusFilter(filters.status);
      setActivePriorityFilter(filters.priority);
      setActiveStartDateFilter(filters.startDate ?? null);
      setActiveEndDateFilter(filters.endDate ?? null);
      setActiveCreatedByFilter(filters.createdBy ?? null);
      setActiveAssignedToFilter(filters.assignedTo ?? null);
      const filterStore = useTaskFiltersStore.getState();
      filterStore.setStatus(filters.status as import("@/types/task.types").TaskStatus | null);
      filterStore.setPriority(
        filters.priority
          ? (filters.priority.toLowerCase() as import("@/types/task.types").TaskPriorityLevel)
          : null,
      );
      filterStore.setDueRange(
        filters.startDate ? toPktDateOnly(filters.startDate) : null,
        filters.endDate ? toPktDateOnly(filters.endDate) : null,
      );
      filterStore.setCreatedBy(
        filters.createdBy === null || filters.createdBy === undefined
          ? []
          : Array.isArray(filters.createdBy)
            ? filters.createdBy
            : [filters.createdBy],
      );
      filterStore.setAssignedTo(
        filters.assignedTo === null || filters.assignedTo === undefined
          ? []
          : Array.isArray(filters.assignedTo)
            ? filters.assignedTo
            : [filters.assignedTo],
      );
      resetPagination();
    },
    [resetPagination],
  );

  const handleFilterReset = useCallback(() => {
    console.log("[TasksScreen] Filter Reset");
    setActiveStatusFilter(null);
    setActivePriorityFilter(null);
    setActiveStartDateFilter(null);
    setActiveEndDateFilter(null);
    setActiveCreatedByFilter(null);
    setActiveAssignedToFilter(null);
    const filterStore = useTaskFiltersStore.getState();
    filterStore.setStatus(null);
    filterStore.setPriority(null);
    filterStore.setCreatedBy([]);
    filterStore.setAssignedTo([]);
    filterStore.setDueRange(null, null);
    resetPagination();
  }, [resetPagination]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (activeStatusFilter) count++;
    if (activePriorityFilter) count++;
    if (activeStartDateFilter || activeEndDateFilter) count++;
    if (activeCreatedByFilter) count++;
    if (activeAssignedToFilter) count++;
    return count;
  }, [
    activeStatusFilter,
    activePriorityFilter,
    activeStartDateFilter,
    activeEndDateFilter,
    activeCreatedByFilter,
    activeAssignedToFilter,
  ]);

  const handleTaskPress = useCallback(
    async (
      task: TaskRowProps,
      targetTab: "details" | "comments" = "details",
    ) => {
      setDetailInitialTab(targetTab);
      const raw = (task as any)._raw;
      if (!raw) return;
      let description = raw.description ?? "";
      let effortHours: number | undefined;
      let effortUnit: string | undefined;
      let projectName: string | undefined;
      try {
        const detailRes = await viewTask(Number(raw.id), companyId ?? 0);
        if (detailRes.Good && detailRes.data) {
          const td = detailRes.data.task;
          description = td?.description ?? description;
          effortHours = td?.effort_hours ?? undefined;
          effortUnit = td?.effort_unit ?? undefined;
          projectName = td?.project_name ?? undefined;
        }
      } catch {
        // fall back to list description
      }
      setSelectedTask({
        title: raw.title,
        assignedTo: task.assignedTo,
        assignedToInitials: task.assignedToInitials,
        dueDate: task.dueDate,
        priority: raw.priority_name ?? "Medium",
        priorityColor: raw.priority_color ?? "#F59E0B",
        approvalRequired: raw.approval_required ? "Yes" : "No",
        status: task.status as any,
        recurringTask: raw.is_recurring ? "Yes" : "No",
        dependencies: [],
        description,
        attachments: [],
        taskId: raw.id,
        companyId: companyId ?? 0,
        canEditStatus: raw.can_edit_status,
        effortHours,
        effortUnit,
        projectName,
      } as any);
    },
    [companyId],
  );

  const handleCommentPress = useCallback(
    (task: TaskRowProps) => {
      handleTaskPress(task, "comments");
    },
    [handleTaskPress],
  );

  // PROJECT MODULE DISABLED — add-to-project entry points
  // const handleAddToProjectPress = useCallback((task: TaskRowProps) => {
  //   setProjectModalTask(task);
  // }, []);

  // const handleAssignProjectToTask = useCallback(
  //   async (projectId: number, project: import("@/types/project.types").Project) => {
  //     if (!projectModalTask?.id || !companyId) return;
  //     const tId = Number(projectModalTask.id);
  //     await assignTaskToProject(tId, projectId, companyId, companyIdentifier);
  //     if (companyId) {
  //       fetchAllTasks(companyId, { silent: true }).catch(() => {});
  //     }
  //   },
  //   [projectModalTask, companyId, companyIdentifier, assignTaskToProject, fetchAllTasks],
  // );

  // ── Deep-link handling (e.g. task_mention push notification) ───────────
  // Opening a push notification for a task navigates here with a `taskId`
  // param; resolve the task and open the detail modal (once per param value).
  const { taskId: taskIdParam, filter: filterParam } = useLocalSearchParams<{
    taskId?: string;
    filter?: string;
  }>();
  const deepLinkHandledRef = useRef<string | null>(null);

  useEffect(() => {
    const rawFilter = Array.isArray(filterParam) ? filterParam[0] : filterParam;
    if (!rawFilter) return;
    const targetTab =
      rawFilter === "due_today"
        ? "today"
        : rawFilter === "overdue"
          ? "overdue"
          : null;
    if (!targetTab) {
      showError("Invalid task filter", `Unsupported filter: ${rawFilter}`);
      router.setParams({ filter: undefined });
      return;
    }
    useTaskFiltersStore.getState().setActiveTab(targetTab);
    router.setParams({ filter: undefined });
  }, [filterParam]);

  useEffect(() => {
    const rawId = Array.isArray(taskIdParam)
      ? String(taskIdParam[0] ?? "")
      : taskIdParam
        ? String(taskIdParam)
        : "";
    if (!rawId || rawId === deepLinkHandledRef.current) return;
    const targetId = Number(rawId);
    if (isNaN(targetId) || !companyId) return;
    if (taskState.loading) return;

    deepLinkHandledRef.current = rawId;

    const openDeepLinkedTask = async () => {
      const mapped = allMappedTasks.find((t) => Number(t.id) === targetId);
      if (mapped) {
        await handleTaskPress(mapped);
        router.setParams({ taskId: undefined });
        return;
      }
      try {
        const res = await viewTask(targetId, companyId);
        const detail = buildTaskDetailFromViewTask(res?.data, companyId);
        if (detail) {
          setSelectedTask(detail);
        }
      } catch (error) {
        console.warn("[TasksScreen] Failed to open deep-linked task:", error);
        showError("Unable to open task", "Please try opening the task again.");
      } finally {
        router.setParams({ taskId: undefined });
      }
    };

    openDeepLinkedTask();
  }, [taskIdParam, allMappedTasks, companyId, handleTaskPress, taskState.loading]);

  // The Status filter intentionally shows only these four, regardless of
  // what other statuses (Rejected, Pending-Approval, Recurring, etc.) exist
  // on the backend.
  const statuses = useMemo(
    () => ["Pending", "In-Progress", "On Hold", "Completed"],
    [],
  );

  const statusColors = useMemo(() => {
    const colors: Record<string, string> = {};
    for (const s of statuses) {
      colors[s] = STATUS_COLORS[s as StatusType]?.text ?? "#9CA3AF";
    }
    return colors;
  }, [statuses]);

  const priorities = ["Normal", "Critical"];
  const priorityColors: Record<string, string> = {
    Normal: "#0DDFAB",
    Critical: "#FF4444",
  };

  const mapRowWithRaw = useCallback(
    (
      row: import("@/utils/statusMapper").MappedTaskRow,
    ): TaskRowProps & { _raw: import("@/types/task.types").TaskListItem } => ({
      id: row.id,
      title: row.title,
      createdBy: row.createdBy,
      createdByInitials: row.createdByInitials,
      createdByAvatar: row.createdByAvatar,
      assignedTo: row.assignedTo,
      assignedToInitials: row.assignedToInitials,
      assignedToAvatar: row.assignedToAvatar,
      dueDate: row.dueDate,
      status: row.status,
      priorityName: row.priorityName,
      taskPriority: row.taskPriority,
      project: row.project,
      canEditStatus: row._raw.can_edit_status ?? true,
      _raw: row._raw,
    }),
    [],
  );

  const allMappedRows = useMemo(
    () => allMappedTasks.map(mapRowWithRaw),
    [allMappedTasks, mapRowWithRaw],
  );
  const createdByMeRows = useMemo(
    () => mappedCreatedByMe.map(mapRowWithRaw),
    [mappedCreatedByMe, mapRowWithRaw],
  );
  const assignedToMeRows = useMemo(
    () => mappedAssignedToMe.map(mapRowWithRaw),
    [mappedAssignedToMe, mapRowWithRaw],
  );

  const getTabCategoryScope = useCallback(
    (tabId: string) => {
      const now = new Date();
      const today = toPktDateOnly(now);
      const weekRange = getWeekRange(now);
      const isAts = authState.hasAdvancedTaskModule === true;

      const sortByDueDate = (tasks: typeof allMappedRows) =>
        sortTasksByDueDate(tasks.map((task) => ({ ...task, due_date: task._raw?.due_date, task_priority: task._raw?.task_priority })));

      switch (tabId) {
        case "today":
          const todayTasks = allMappedRows.filter((task) => {
            const due = task._raw?.due_date;
            if (!due) return false;
            if (isAts) {
              const dueDate = parseTaskDate(due);
              return !!dueDate && dueDate.getTime() >= now.getTime();
            }
            return isPktToday(due, now);
          });
          const seenRecurrenceOrigins = new Set<number>();
          return todayTasks.filter((task) => {
            const originId =
              task._raw?.recurrence_origin_id ??
              (task._raw?.is_recurring ? Number(task.id) : null);
            if (originId === null || originId === undefined) return true;
            if (seenRecurrenceOrigins.has(Number(originId))) return false;
            seenRecurrenceOrigins.add(Number(originId));
            return true;
          });
        case "week":
          return sortByDueDate(allMappedRows.filter((task) => {
            const dueDate = task._raw?.due_date;
            if (!dueDate) return false;
            const dateOnly = toPktDateOnly(dueDate);
            return dateOnly >= weekRange.from && dateOnly < weekRange.to;
          }));
        case "overdue":
          return allMappedRows.filter((task) => {
            const due = task._raw?.due_date;
            if (!due || isCompletedStatus(task._raw?.status ?? task.status)) return false;
            if (
              task._raw?.status === "Partial Complete" ||
              task._raw?.status === "On-Hold" ||
              task._raw?.status === "On Hold"
            ) {
              return false;
            }
            return isAts
              ? isPktPast(due, now)
              : toPktDateOnly(due) < today;
          });
        case "created":
          return sortByDueDate(createdByMeRows);
        case "assigned":
          return sortByDueDate(assignedToMeRows);
        case "recurring":
          return sortByDueDate(
            allMappedRows.filter((t) => t._raw?.is_recurring === true),
          );
        case "completed":
          return allMappedRows
            .filter((task) => isCompletedStatus(task.status))
            .sort((a, b) =>
              String(b._raw?.completed_at ?? "").localeCompare(
                String(a._raw?.completed_at ?? ""),
              ),
            );
        case "pendingApproval":
          return allMappedRows.filter(
            (task) => task.status === "Pending-Approval",
          );
        case "all":
        default:
          return allMappedRows.filter(
            (task) =>
              !isCompletedStatus(task.status) &&
              task.status !== "Pending-Approval",
          );
      }
    },
    [allMappedRows, createdByMeRows, assignedToMeRows, authState.hasAdvancedTaskModule],
  );

  // Apply the shared due-date, priority, then id ordering.
  const sortByCritical = useCallback(
    (
      tasks: (TaskRowProps & {
        _raw: import("@/types/task.types").TaskListItem;
      })[],
    ) => {
      return sortTasksByDueDate(
        tasks.map((task) => ({
          ...task,
          due_date: task._raw?.due_date,
          task_priority: task._raw?.task_priority,
        })),
      );
    },
    [],
  );

  // Applies every active filter (status/priority/created-by/assigned-to/
  // date range/search) to a tab-scoped task array. Shared by displayedTasks
  // (the active tab's rows) and tabCounts (every stat card's count), so a
  // card's number always matches what you'd actually see after tapping it.
  const applyExtraFilters = useCallback(
    (tasks: typeof allMappedRows, tabId: string) => {
      let result = tasks;

      if (tabId === "pendingApproval") {
        result = result.filter(
          (task) => task._raw?.status === "Pending-Approval",
        );
      } else if (activeStatusFilter) {
        if (activeStatusFilter === "Recurring") {
          result = result.filter(
            (t) => t._raw?.is_recurring === true || t.status === "Recurring",
          );
        } else {
          result = result.filter((t) => t.status === activeStatusFilter);
        }
      } else {
        if (tabId === "completed") {
          result = result.filter((t) => isCompletedStatus(t.status));
        } else {
          result = result.filter(
            (t) =>
              !isCompletedStatus(t.status) &&
              t._raw?.status !== "Pending-Approval",
          );
        }
      }

      if (activePriorityFilter) {
        const tier = activePriorityFilter.toLowerCase();
        result = result.filter((t) => t._raw?.task_priority === tier);
      }

      if (activeCreatedByFilter) {
        const ids = Array.isArray(activeCreatedByFilter)
          ? activeCreatedByFilter
          : [activeCreatedByFilter];
        if (ids.length > 0) {
          result = result.filter((t) =>
            ids.includes(Number(t._raw?.created_by)),
          );
        }
      }

      if (activeAssignedToFilter) {
        const ids = Array.isArray(activeAssignedToFilter)
          ? activeAssignedToFilter
          : [activeAssignedToFilter];
        if (ids.length > 0) {
          result = result.filter((t) =>
            ids.includes(Number(t._raw?.asigned_to)),
          );
        }
      }

      if (activeStartDateFilter || activeEndDateFilter) {
        const startMs = activeStartDateFilter
          ? toPktDateOnly(activeStartDateFilter)
          : null;
        const endMs = activeEndDateFilter
          ? toPktDateOnly(activeEndDateFilter)
          : null;

        result = result.filter((t) => {
          if (!t._raw?.due_date) return false;
          const taskDate = toPktDateOnly(t._raw.due_date);
          if (!taskDate) return false;
          if (startMs !== null && taskDate < startMs) return false;
          if (endMs !== null && taskDate > endMs) return false;
          return true;
        });
      }

      const query = debouncedSearchText.trim().toLowerCase();
      if (query) {
        result = result.filter((t) => {
          const haystack = [
            t.title,
            t.id,
            t.assignedTo,
            t.status,
            t._raw?.priority_name,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(query);
        });
      }

      return result;
    },
    [
      activeStatusFilter,
      activePriorityFilter,
      activeCreatedByFilter,
      activeAssignedToFilter,
      activeStartDateFilter,
      activeEndDateFilter,
      debouncedSearchText,
    ],
  );

  // Every stat card's count, recomputed under the currently active filters —
  // each one is the same tab-scope + filter pipeline displayedTasks uses,
  // just run for every tab id instead of only the active one.
  const tabCounts = useMemo(() => {
    const TAB_IDS = [
      "all",
      "today",
      "week",
      "overdue",
      "created",
      "assigned",
      "pendingApproval",
      "recurring",
      "completed",
    ] as const;

    const counts = {} as Record<(typeof TAB_IDS)[number], number>;
    for (const id of TAB_IDS) {
      counts[id] = applyExtraFilters(getTabCategoryScope(id), id).length;
    }
    return counts;
  }, [getTabCategoryScope, applyExtraFilters]);

  const displayedTasks = useMemo(() => {
    const tasks = applyExtraFilters(getTabCategoryScope(activeTab), activeTab);
    return activeTab === "completed" ? tasks : sortByCritical(tasks);
  }, [activeTab, getTabCategoryScope, applyExtraFilters, sortByCritical]);

  // ─── Infinite pagination over the fully-filtered/sorted tab dataset ──────
  const hasMore =
    visibleCount < displayedTasks.length ||
    (activeTab === "completed" && taskState.hasMoreCompleted);

  const loadMore = useCallback(() => {
    if (loadingMoreRef.current || loadingMore) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    if (
      activeTab === "completed" &&
      companyId &&
      visibleCount >= displayedTasks.length &&
      taskState.hasMoreCompleted
    ) {
      fetchCompletedPage(companyId, taskState.completedPage + 1)
        .then((loaded) => {
          if (loaded) {
            setVisibleCount((prev) => prev + COMPLETED_PAGE_SIZE);
          }
        })
        .finally(() => {
          loadingMoreRef.current = false;
          setLoadingMore(false);
        });
      return;
    }
    setVisibleCount((prev) =>
      prev + (activeTab === "completed" ? COMPLETED_PAGE_SIZE : PAGE_SIZE),
    );
    setLoadingMore(false);
  }, [
    activeTab,
    companyId,
    displayedTasks.length,
    fetchCompletedPage,
    loadingMore,
    setVisibleCount,
    taskState.completedPage,
    taskState.hasMoreCompleted,
    visibleCount,
  ]);

  useEffect(() => {
    loadingMoreRef.current = false;
  }, [visibleCount]);

  const visibleTasks = useMemo(
    () => displayedTasks.slice(0, visibleCount),
    [displayedTasks, visibleCount],
  );

  const handleRefresh = useCallback(async () => {
    if (!companyId) return;
    setLoadingMore(false);
    setRefreshing(true);
    try {
      await fetchAllTasks(companyId, { silent: true });
      if (activeTab === "completed") {
        await fetchCompletedPage(companyId, 1);
      } else if (activeTab === "recurring") {
        await fetchRecurring(companyId);
      }
      useTaskFiltersStore.getState().setPage(1);
    } finally {
      setRefreshing(false);
    }
  }, [
    activeTab,
    companyId,
    fetchAllTasks,
    fetchCompletedPage,
    fetchRecurring,
  ]);

  // While only Phase 1 (due-today) has loaded, every count other than
  // "Due Today" itself is derived from an incomplete task list — show a
  // placeholder instead of a temporarily-wrong number for those.
  const partial = taskState.isPartialLoad;
  const statCount = useCallback(
    (count: number) => (partial ? "···" : pad(count)),
    [partial],
  );

  const statsList = useMemo(() => {
    return [
      {
        label: "All Tasks",
        count: statCount(tabCounts.all),
        iconName: <AllTasksIcon />,
        id: "all",
      },
      {
        label: "Due Today",
        count: pad(tabCounts.today),
        iconName: <DueTodayIcon />,
        id: "today",
      },
      {
        label: "Due in 7 days",
        count: statCount(tabCounts.week),
        iconName: <SevendayIcon />,
        id: "week",
      },
      {
        label: "Delayed",
        count: statCount(tabCounts.overdue),
        iconName: <DelayIcon />,
        id: "overdue",
      },
      {
        label: "Created by me",
        count: statCount(tabCounts.created),
        iconName: <CreatedIcon />,
        id: "created",
      },
      {
        label: "Assigned to me",
        count: statCount(tabCounts.assigned),
        iconName: <AssignIcon />,
        id: "assigned",
      },
      {
        label: "Pending Approval",
        count: statCount(tabCounts.pendingApproval),
        iconName: <AllTasksIcon />,
        id: "pendingApproval",
      },
      {
        label: "Recurring",
        count: statCount(tabCounts.recurring),
        iconName: <RecurringIcon />,
        id: "recurring",
      },
      {
        label: "Completed",
        count: statCount(taskState.completeCount || tabCounts.completed),
        iconName: <CompletedIcon />,
        id: "completed",
      },
    ];
  }, [tabCounts, statCount, taskState.completeCount]);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <Pressable style={styles.safe} onPress={() => Keyboard.dismiss()}>
        <FilterModal
          visible={filterVisible}
          onClose={() => {
            setFilterVisible(false);
            useTaskFiltersStore.getState().setFilterModalVisible(false);
          }}
          statuses={statuses}
          statusColors={statusColors}
          priorities={priorities}
          priorityColors={priorityColors}
          showPriority={
            authState.hasAdvancedTaskModule === true ||
            allMappedTasks.some((task) => task.taskPriority === "critical")
          }
          owners={taskState.taskOwners}
          showCreatedBy
          showAssignedTo={canUseOwnerFilter}
          initialStatus={activeStatusFilter}
          initialPriority={activePriorityFilter}
          initialStartDate={activeStartDateFilter}
          initialEndDate={activeEndDateFilter}
          initialCreatedBy={activeCreatedByFilter}
          initialAssignedTo={activeAssignedToFilter}
          onApply={handleFilterApply}
          onReset={handleFilterReset}
          loading={taskState.loading}
        />

        <TaskStatsBar
          items={statsList}
          selectedTab={selectedTab}
          compact={isHeaderCompact}
          scrollRef={statsScrollRef}
          scrollStyle={styles.statsScroll}
          contentContainerStyle={styles.statsContent}
          onPress={handleTabPress}
          onCardLayout={(id, x, width) => {
            cardLayoutsRef.current[id] = { x, width };
          }}
        />

        <TaskListSection
          loading={taskState.loading}
          error={taskState.error}
          hasTasks={allMappedTasks.length > 0}
          stale={taskState.isPartialLoad}
          sectionTitle={
            statsList.find((stat) => stat.id === selectedTab)?.label ??
            "Due Today"
          }
          onRetry={handleRefresh}
          containerStyle={styles.tableShell}
        >
          <View style={styles.tableShell}>
            <TaskTable
              sectionTitle={
                statsList.find((s) => s.id === selectedTab)?.label ??
                "Due Today"
              }
              tasks={visibleTasks}
              onTaskPress={handleTaskPress}
              onCommentPress={handleCommentPress}
              onStatusChange={handleStatusChange}
              onFilterPress={handleOpenFilter}
              loading={taskState.loading}
              activeFilterCount={activeFilterCount}
              hasMore={hasMore}
              loadingMore={loadingMore}
              onLoadMore={loadMore}
              onRefresh={handleRefresh}
              refreshing={refreshing}
              onScrollOffsetChange={handleTableScrollOffset}
              canReassign={canCreate}
              assignableOwners={taskState.taskOwners}
              onAssigneeChange={handleAssigneeChange}
              virtualized
                // PROJECT MODULE DISABLED
                // canAssignProject={canAssignProject}
                // onAddToProjectPress={handleAddToProjectPress}
              />
          </View>
        </TaskListSection>
      </Pressable>

      <TaskModalsHost
        canCreate={canCreate}
        createVisible={createVisible}
        onCreateOpen={() => setCreateVisible(true)}
        onCreateClose={() => setCreateVisible(false)}
        onCreated={() => handleTabPress("created")}
        selectedTask={selectedTask}
        onDetailClose={() => setSelectedTask(null)}
        detailInitialTab={detailInitialTab}
        delayTask={delayTask}
        onDelayClose={() => setDelayTask(null)}
        onExtendDelay={handleExtendDelay}
        rejectModalVisible={rejectModalVisible}
        rejectTaskId={rejectTargetTaskId ?? 0}
        companyId={companyId ?? 0}
        companyIdentifier={companyIdentifier}
        onRejectClose={() => {
          setRejectModalVisible(false);
          setRejectTargetTaskId(null);
        }}
        onRejectSuccess={() => {
          if (companyId) {
            fetchAllTasks(companyId, { silent: true }).catch(() => {});
          }
        }}
      />
      {/* PROJECT MODULE DISABLED
      <AssignTaskProjectModal
        visible={!!projectModalTask}
        task={projectModalTask}
        onClose={() => setProjectModalTask(null)}
        onAssign={handleAssignProjectToTask}
      />
      */}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff", position: "relative" },
  safe: { flex: 1 },
  statsScroll: {
    flexGrow: 0,
  },
  statsContent: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    gap: 6,
    alignItems: "center",
  },
  tableShell: {
    flex: 1,
    paddingLeft: 16,
    paddingTop: 2,
    paddingBottom: 0,
  },
  fab: {
    position: "absolute",
    bottom: 92,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#00DEAB",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 99,
  },
  fabIcon: { fontSize: rf(28), color: "#fff", lineHeight: 32 },
});
