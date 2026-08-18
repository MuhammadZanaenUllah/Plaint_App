import CreateTaskModal from "@/components/CreateTaskModal";
import FilterModal from "@/components/FilterModal";
import StatCard from "@/components/StatCard";
import TaskDelay from "@/components/taskdelay";
import TaskDetailModal, {
  TaskDetail,
  buildTaskDetailFromViewTask,
} from "@/components/TaskDetailModal";
import { STATUS_COLORS, StatusType, TaskRowProps } from "@/components/TaskRow";
import TaskTable from "@/components/TaskTable";
import { AssignableOwner } from "@/components/SingleTaskTable";
import TaskTableSkeleton from "@/components/TaskTableSkeleton";
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
import { canCreateTask } from "@/utils/permissions";
import { uiStatusToApi } from "@/utils/statusMapper";
import { showError, showInfo, showSuccess } from "@/utils/toast";
import { MaterialIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";

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

export default function TasksScreen() {
  const { state: authState } = useAuth();
  const {
    state: taskState,
    allMappedTasks,
    fetchAllTasks,
    fetchDueToday,
    fetchFiltered,
    mappedAssignedToMe,
    mappedCreatedByMe,
    updateTaskStatusApi,
  } = useTasks();

  useTaskSocket();

  const [activeTab, setActiveTab] = useState("today");
  const [filterVisible, setFilterVisible] = useState(false);
  const [createVisible, setCreateVisible] = useState(false);
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
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const loadMoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Overdue / delayed-task notifications (in-app, app-driven) ────────────
  const [delayTask, setDelayTask] = useState<{
    id: number;
    title: string;
    assignedTo: string;
  } | null>(null);
  const overdueToastShownRef = useRef(false);
  const delayPromptedIdsRef = useRef<Set<number>>(new Set());
  const currentUserId = authState.user?.id ?? 0;

  const companyIdentifier = authState.company?.company_identifier ?? "";

  const companyId = authState.company?.company_id;

  // Search text from the shared header search bar (SearchProvider in the tab layout).
  const { searchText, isHeaderCompact, setIsHeaderCompact } = useSearch();

  // Collapses the shared header's search bar + shrinks the stat cards once
  // the task list has scrolled past a small threshold.
  const SCROLL_COMPACT_THRESHOLD = 8;
  const handleTableScrollOffset = useCallback(
    (offsetY: number) => {
      setIsHeaderCompact(offsetY > SCROLL_COMPACT_THRESHOLD);
    },
    [setIsHeaderCompact],
  );

  // Restart at page 1 whenever the search query changes — adjust state during
  // render (lint-safe, mirrors the notification pagination reset pattern).
  const [lastSearchText, setLastSearchText] = useState(searchText);
  if (lastSearchText !== searchText) {
    setLastSearchText(searchText);
    setVisibleCount(PAGE_SIZE);
  }

  // Create-task visibility is driven by the logged-in user's `is_head`
  // attribute (`userdata.is_head` from the login payload). Only department
  // heads ever see the create-task FAB.
  const canCreate = useMemo(
    () => canCreateTask(authState.user),
    [authState.user],
  );

  useEffect(() => {
    if (companyId) {
      console.log(
        `[TasksScreen] Initial fetchAllTasks with companyId=${companyId}`,
      );
      fetchAllTasks(companyId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // ── App-driven overdue / delay notifications (changes1.md §8.4-8.5) ─────
  // The app detects overdue tasks client-side (due_date in the past and not
  // completed) and surfaces them in-app: a one-time summary toast plus, for
  // tasks the current user assigned to someone else, the TaskDelay escalation
  // popup (once per task per session).
  useEffect(() => {
    if (!companyId || allMappedTasks.length === 0) return;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const overdue = allMappedTasks.filter((t) => {
      if (t.status === "Completed") return false;
      const d = t._raw?.due_date ? new Date(t._raw.due_date) : null;
      return d && !isNaN(d.getTime()) && d.getTime() < todayStart.getTime();
    });

    if (overdue.length > 0 && !overdueToastShownRef.current) {
      overdueToastShownRef.current = true;
      showInfo(
        "Overdue Tasks",
        `You have ${overdue.length} overdue task${overdue.length === 1 ? "" : "s"} that need attention.`,
      );
    }

    // Escalation popup for the assigner (current user created the task and
    // assigned it to someone else).
    if (currentUserId > 0 && !delayTask) {
      const myDelayed = overdue
        .filter(
          (t) =>
            t._raw?.created_by === currentUserId &&
            t._raw.asigned_to !== currentUserId,
        )
        .sort((a, b) => {
          const da = a._raw?.due_date ? new Date(a._raw.due_date).getTime() : 0;
          const db = b._raw?.due_date ? new Date(b._raw.due_date).getTime() : 0;
          return da - db;
        })
        .find((t) => !delayPromptedIdsRef.current.has(Number(t.id)));

      if (myDelayed) {
        delayPromptedIdsRef.current.add(Number(myDelayed.id));
        const assignee = myDelayed._raw?.task_assigned_to;
        const assigneeName =
          `${assignee?.first_name ?? ""} ${assignee?.last_name ?? ""}`.trim() ||
          `User #${myDelayed._raw?.asigned_to ?? ""}`;
        setDelayTask({
          id: Number(myDelayed.id),
          title: myDelayed._raw?.title ?? "Task",
          assignedTo: assigneeName,
        });
      }
    }
  }, [allMappedTasks, companyId, currentUserId, delayTask]);

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
      setActiveTab(tabId);
      setVisibleCount(PAGE_SIZE);
      // Cancel any in-flight "load more" so a late page increment can't bleed
      // into the freshly-switched tab.
      if (loadMoreTimerRef.current) {
        clearTimeout(loadMoreTimerRef.current);
        loadMoreTimerRef.current = null;
      }
      setLoadingMore(false);
      // Tabs are client-side filters over the loaded dataset — only the "all"
      // tab performs a backend refresh (per documented design). This avoids
      // redundant full-list requests on every tab switch.
      if (tabId === "all" && companyId) {
        fetchAllTasks(companyId, { silent: true });
      }
    },
    [companyId, fetchAllTasks],
  );

  const handleStatusChange = useCallback(
    async (targetTask: TaskRowProps, newStatus: StatusType) => {
      if (!targetTask.id || !companyId) return;
      const apiStatus = uiStatusToApi(newStatus);
      try {
        await updateTaskStatusApi(Number(targetTask.id), {
          status: apiStatus,
          company_id: companyId,
          company_identifier: companyIdentifier,
        });
        fetchAllTasks(companyId, { silent: true });
      } catch {
        // status change failed silently
      }
    },
    [companyId, companyIdentifier, updateTaskStatusApi, fetchAllTasks],
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

  // Restart the visible list at page 1 (and cancel any pending "load more") so
  // the newly-filtered results start from the top.
  const handleOpenFilter = useCallback(() => {
    setFilterVisible(true);
  }, []);

  const resetPagination = useCallback(() => {
    if (loadMoreTimerRef.current) {
      clearTimeout(loadMoreTimerRef.current);
      loadMoreTimerRef.current = null;
    }
    setLoadingMore(false);
    setVisibleCount(PAGE_SIZE);
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

  // ── Deep-link handling (e.g. task_mention push notification) ───────────
  // Opening a push notification for a task navigates here with a `taskId`
  // param; resolve the task and open the detail modal (once per param value).
  const { taskId: taskIdParam } = useLocalSearchParams<{ taskId?: string }>();
  const deepLinkHandledRef = useRef<string | null>(null);

  useEffect(() => {
    const rawId = taskIdParam ? String(taskIdParam) : "";
    if (!rawId || rawId === deepLinkHandledRef.current) return;
    const targetId = Number(rawId);
    if (isNaN(targetId) || !companyId) return;

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
      } catch {
        // silent — fall back to the plain tasks list
      } finally {
        router.setParams({ taskId: undefined });
      }
    };

    openDeepLinkedTask();
  }, [taskIdParam, allMappedTasks, companyId, handleTaskPress]);

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
      assignedTo: row.assignedTo,
      assignedToInitials: row.assignedToInitials,
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

  const tabCounts = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const weekEnd = new Date(tomorrowStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    let all = 0;
    let today = 0;
    let week = 0;
    let overdue = 0;
    let recurring = 0;
    let completed = 0;

    for (const t of allMappedTasks) {
      if (t.status === "Completed") {
        completed++;
        continue;
      }
      all++;
      if (t._raw?.is_recurring === true) recurring++;
      if (t._raw?.due_date) {
        const d = new Date(t._raw.due_date);
        const ms = d.getTime();
        if (!isNaN(ms)) {
          if (ms >= todayStart.getTime() && ms < tomorrowStart.getTime())
            today++;
          if (ms >= tomorrowStart.getTime() && ms < weekEnd.getTime()) week++;
          if (ms < todayStart.getTime()) overdue++;
        }
      }
    }

    const created = mappedCreatedByMe.filter(
      (t) => t.status !== "Completed",
    ).length;
    const assigned = mappedAssignedToMe.filter(
      (t) => t.status !== "Completed",
    ).length;

    return {
      all,
      today,
      week,
      overdue,
      created,
      assigned,
      recurring,
      completed,
    };
  }, [allMappedTasks, mappedCreatedByMe, mappedAssignedToMe]);

  const getTabCategoryScope = useCallback(
    (tabId: string) => {
      const all = allMappedTasks.map(mapRowWithRaw);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const tomorrowStart = new Date(todayStart);
      tomorrowStart.setDate(tomorrowStart.getDate() + 1);
      const weekEnd = new Date(tomorrowStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const sortByDueDate = (
        tasks: (TaskRowProps & {
          _raw: import("@/types/task.types").TaskListItem;
        })[],
      ) =>
        [...tasks].sort((a, b) => {
          if (!a._raw?.due_date) return 1;
          if (!b._raw?.due_date) return -1;
          return (
            new Date(a._raw.due_date).getTime() -
            new Date(b._raw.due_date).getTime()
          );
        });

      switch (tabId) {
        case "today":
          return all.filter((t) => {
            if (!t._raw?.due_date) return false;
            const d = new Date(t._raw.due_date);
            return d >= todayStart && d < tomorrowStart;
          });
        case "week":
          return sortByDueDate(
            all.filter((t) => {
              if (!t._raw?.due_date) return false;
              const d = new Date(t._raw.due_date);
              return d >= tomorrowStart && d < weekEnd;
            }),
          );
        case "overdue":
          return all.filter((t) => {
            if (!t._raw?.due_date) return false;
            const d = new Date(t._raw.due_date);
            return d < todayStart;
          });
        case "created":
          return sortByDueDate(mappedCreatedByMe.map(mapRowWithRaw));
        case "assigned":
          return sortByDueDate(mappedAssignedToMe.map(mapRowWithRaw));
        case "recurring":
          return sortByDueDate(
            all.filter((t) => t._raw?.is_recurring === true),
          );
        case "completed":
          return all.filter((t) => t.status === "Completed");
        case "all":
        default:
          return all;
      }
    },
    [allMappedTasks, mappedCreatedByMe, mappedAssignedToMe, mapRowWithRaw],
  );

  // Sort: Critical tasks first (by critical_order ascending), then normal tasks (by due_date).
  const sortByCritical = useCallback(
    (
      tasks: (TaskRowProps & {
        _raw: import("@/types/task.types").TaskListItem;
      })[],
    ) => {
      const criticals: typeof tasks = [];
      const others: typeof tasks = [];
      for (const t of tasks) {
        if (t._raw?.task_priority === "critical") {
          criticals.push(t);
        } else {
          others.push(t);
        }
      }
      criticals.sort((a, b) => {
        const orderA = a._raw?.critical_order ?? 999;
        const orderB = b._raw?.critical_order ?? 999;
        if (orderA !== orderB) return orderA - orderB;
        return (
          new Date(a._raw.due_date || 0).getTime() -
          new Date(b._raw.due_date || 0).getTime()
        );
      });
      return [...criticals, ...others];
    },
    [],
  );

  const displayedTasks = useMemo(() => {
    let tasks = getTabCategoryScope(activeTab);
    console.log(
      `[TasksScreen] Calculating displayedTasks for activeTab="${activeTab}". Base category tasks count:`,
      tasks.length,
    );
    if (tasks.length > 0) {
      const ids = tasks.map((t) => t.id ?? "no-id").slice(0, 5);
      console.log(
        `[TasksScreen] First 5 task ids in displayedTasks: [${ids.join(", ")}]`,
      );
      const raw572 = tasks.find((t) => t.id === "572");
      console.log(
        `[TasksScreen] Task id=572 found in displayedTasks: ${!!raw572}, title: "${raw572?.title}"`,
      );
    }

    if (activeStatusFilter) {
      if (activeStatusFilter === "Recurring") {
        tasks = tasks.filter(
          (t) => t._raw?.is_recurring === true || t.status === "Recurring",
        );
      } else {
        tasks = tasks.filter((t) => t.status === activeStatusFilter);
      }
      console.log(
        `[TasksScreen] After status filter ("${activeStatusFilter}"):`,
        tasks.length,
      );
    } else {
      if (activeTab === "completed") {
        tasks = tasks.filter((t) => t.status === "Completed");
      } else {
        tasks = tasks.filter((t) => t.status !== "Completed");
      }
    }

    if (activePriorityFilter) {
      // Priority in this app is the scheduling tier (`task_priority`:
      // "normal" | "critical"), NOT the free-form `priority_name` string.
      const tier = activePriorityFilter.toLowerCase();
      tasks = tasks.filter((t) => t._raw?.task_priority === tier);
      console.log(
        `[TasksScreen] After priority filter ("${activePriorityFilter}"):`,
        tasks.length,
      );
    }

    if (activeCreatedByFilter) {
      const ids = Array.isArray(activeCreatedByFilter)
        ? activeCreatedByFilter
        : [activeCreatedByFilter];
      if (ids.length > 0) {
        tasks = tasks.filter((t) => ids.includes(Number(t._raw?.created_by)));
      }
    }

    if (activeAssignedToFilter) {
      const ids = Array.isArray(activeAssignedToFilter)
        ? activeAssignedToFilter
        : [activeAssignedToFilter];
      if (ids.length > 0) {
        tasks = tasks.filter((t) => ids.includes(Number(t._raw?.asigned_to)));
      }
    }

    if (activeStartDateFilter || activeEndDateFilter) {
      const startMs = activeStartDateFilter
        ? new Date(activeStartDateFilter).setHours(0, 0, 0, 0)
        : null;
      const endMs = activeEndDateFilter
        ? new Date(activeEndDateFilter).setHours(23, 59, 59, 999)
        : null;

      console.log(
        `[TasksScreen] Applying Date Filter: Start=${startMs ? new Date(startMs).toISOString() : "None"}, End=${endMs ? new Date(endMs).toISOString() : "None"}`,
      );

      tasks = tasks.filter((t) => {
        if (!t._raw?.due_date) {
          console.log(
            `[TasksScreen] Skipping "${t.title}": due_date is missing`,
          );
          return false;
        }
        const taskDate = new Date(t._raw.due_date);
        const taskMs = taskDate.getTime();
        if (isNaN(taskMs)) {
          console.log(
            `[TasksScreen] Skipping "${t.title}": invalid due_date "${t._raw.due_date}"`,
          );
          return false;
        }

        if (startMs !== null && taskMs < startMs) {
          console.log(
            `[TasksScreen] Skipping "${t.title}" (${t._raw.due_date}): before start date`,
          );
          return false;
        }

        if (endMs !== null && taskMs > endMs) {
          console.log(
            `[TasksScreen] Skipping "${t.title}" (${t._raw.due_date}): after end date`,
          );
          return false;
        }

        return true;
      });

      console.log(`[TasksScreen] After date range filter:`, tasks.length);
    }

    // Text search from the header search bar — matches title, id, assignee,
    // status, priority and project/description text.
    const query = searchText.trim().toLowerCase();
    if (query) {
      tasks = tasks.filter((t) => {
        const haystack = [
          t.title,
          t.id,
          t.assignedTo,
          t.status,
          t._raw?.description,
          t._raw?.priority_name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      });
    }

    // Always sort Critical tasks to the top, preserving relative order within each group
    return sortByCritical(tasks);
  }, [
    activeTab,
    getTabCategoryScope,
    activeStatusFilter,
    activePriorityFilter,
    activeCreatedByFilter,
    activeAssignedToFilter,
    activeStartDateFilter,
    activeEndDateFilter,
    searchText,
    sortByCritical,
  ]);

  // ─── Infinite pagination over the fully-filtered/sorted tab dataset ──────
  const hasMore = visibleCount < displayedTasks.length;

  const loadMore = useCallback(() => {
    // Re-entrancy guard: only one page increment per render cycle. Prevents
    // duplicate pagination calls from rapid onScroll / onContentSizeChange.
    if (loadingMoreRef.current || loadingMore) return;
    loadingMoreRef.current = true;
    // Show the footer spinner briefly while the next batch "loads".
    setLoadingMore(true);
    loadMoreTimerRef.current = setTimeout(() => {
      setVisibleCount((prev) => prev + PAGE_SIZE);
      setLoadingMore(false);
    }, 350);
  }, [loadingMore]);

  useEffect(() => {
    loadingMoreRef.current = false;
  }, [visibleCount]);

  useEffect(() => {
    return () => {
      if (loadMoreTimerRef.current) {
        clearTimeout(loadMoreTimerRef.current);
        loadMoreTimerRef.current = null;
      }
    };
  }, []);

  const visibleTasks = useMemo(
    () => displayedTasks.slice(0, visibleCount),
    [displayedTasks, visibleCount],
  );

  const handleRefresh = useCallback(async () => {
    if (!companyId) return;
    if (loadMoreTimerRef.current) {
      clearTimeout(loadMoreTimerRef.current);
      loadMoreTimerRef.current = null;
    }
    setLoadingMore(false);
    setRefreshing(true);
    try {
      await fetchAllTasks(companyId, { silent: true });
      setVisibleCount(PAGE_SIZE);
    } finally {
      setRefreshing(false);
    }
  }, [companyId, fetchAllTasks]);

  // While only Phase 1 (due-today) has loaded, every count other than
  // "Due Today" itself is derived from an incomplete task list — show a
  // placeholder instead of a temporarily-wrong number for those.
  const partial = taskState.isPartialLoad;
  const statCount = (n: number) => (partial ? "···" : pad(n));

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
        label: "Recurring",
        count: statCount(tabCounts.recurring),
        iconName: <RecurringIcon />,
        id: "recurring",
      },
      {
        label: "Completed",
        count: statCount(tabCounts.completed),
        iconName: <CompletedIcon />,
        id: "completed",
      },
    ];
  }, [tabCounts, partial]);

  // Whenever tasks are loading, show the skeleton (with the real, live stat-card
  // filter bar above). This covers every load path — initial fetch, logout+login,
  // and app re-open with restored context — so the skeleton is always used and
  // never the inline TaskTable spinner. Silent refetches (pull-to-refresh, "all"
  // tab, status changes, create task) keep `loading` false, so they continue to
  // render the normal table with their own refresh/footer behavior unchanged.
  if (taskState.loading) {
    return (
      <View style={styles.root}>
        <View style={styles.safe}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.statsScroll}
            contentContainerStyle={styles.statsContent}
          >
            {statsList.map((s) => (
              <StatCard
                key={s.id}
                label={s.label}
                count={s.count}
                iconName={s.iconName}
                active={activeTab === s.id}
                onPress={() => handleTabPress(s.id)}
                compact={isHeaderCompact}
              />
            ))}
          </ScrollView>

          <View style={styles.tableShell}>
            <TaskTableSkeleton />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.safe}>
        <FilterModal
          visible={filterVisible}
          onClose={() => setFilterVisible(false)}
          statuses={statuses}
          statusColors={statusColors}
          priorities={priorities}
          priorityColors={priorityColors}
          showPriority={true}
          owners={taskState.taskOwners}
          showCreatedBy
          showAssignedTo
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

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.statsScroll}
          contentContainerStyle={styles.statsContent}
        >
          {statsList.map((s) => (
            <StatCard
              key={s.id}
              label={s.label}
              count={s.count}
              iconName={s.iconName}
              active={activeTab === s.id}
              onPress={() => handleTabPress(s.id)}
              compact={isHeaderCompact}
            />
          ))}
        </ScrollView>

        <View style={styles.tableShell}>
          <TaskTable
            sectionTitle={
              statsList.find((s) => s.id === activeTab)?.label ?? "Due Today"
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
          />
        </View>
      </View>

      {canCreate ? (
        <TouchableOpacity
          style={styles.fab}
          activeOpacity={0.85}
          onPress={() => setCreateVisible(true)}
        >
          <MaterialIcons name="add" size={35} color="black" />
        </TouchableOpacity>
      ) : null}

      {canCreate ? (
        <CreateTaskModal
          visible={createVisible}
          onClose={() => setCreateVisible(false)}
          onCreated={() => handleTabPress("created")}
        />
      ) : null}
      <TaskDetailModal
        visible={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        task={selectedTask}
        initialTab={detailInitialTab}
      />
      <TaskDelay
        visible={!!delayTask}
        taskTitle={delayTask?.title ?? ""}
        assignedTo={delayTask?.assignedTo ?? ""}
        onClose={() => setDelayTask(null)}
        onExtend={handleExtendDelay}
      />
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
    paddingBottom: 12,
    gap: 6,
    alignItems: "center",
  },
  tableShell: {
    flex: 1,
    paddingLeft: 16,
    paddingTop: 8,
    paddingBottom: 0,
  },
  fab: {
    position: "absolute",
    bottom: 80,
    right: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#00DEAB",
    alignItems: "center",
    justifyContent: "center",
  },
  fabIcon: { fontSize: 28, color: "#fff", lineHeight: 32 },
});
