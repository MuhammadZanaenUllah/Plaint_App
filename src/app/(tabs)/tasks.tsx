import CreateTaskModal from "@/components/CreateTaskModal";
import FilterModal from "@/components/FilterModal";
import StatCard from "@/components/StatCard";
import TaskDetailModal, { TaskDetail } from "@/components/TaskDetailModal";
import { StatusType, TaskRowProps } from "@/components/TaskRow";
import TaskTable from "@/components/TaskTable";
import Icons from "@/constants/icons";
import { MaterialIcons } from "@expo/vector-icons";
import { getTaskDetail } from "@/services/api/tasks.service";
import { useAuth } from "@/hooks/useAuth";
import { useTasks } from "@/hooks/useTasks";
import { useTaskSocket } from "@/hooks/useTaskSocket";
import { uiStatusToApi } from "@/utils/statusMapper";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from "react-native";

const { AllTaskIcon: AllTasksIcon, AssignIcon, CompletedIcon, CreatedIcon, DelayIcon, DueTodayIcon, RecurringIcon, SevenDayIcon: SevendayIcon } = Icons;

const pad = (n: number) => String(n).padStart(2, "0");

export default function TasksScreen() {
  const { state: authState } = useAuth();
  const {
    state: taskState,
    allMappedTasks,
    totalCount,
    fetchAllTasks,
    fetchDueToday,
    fetchFiltered,
    mappedAssignedToMe,
    mappedCreatedByMe,
    updateTaskStatusApi,
  } = useTasks();

  useTaskSocket();

  const [activeTab, setActiveTab] = useState("all");
  const [filterVisible, setFilterVisible] = useState(false);
  const [createVisible, setCreateVisible] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskDetail | null>(null);
  const [activeStatusFilter, setActiveStatusFilter] = useState<string | null>(null);
  const [activePriorityFilter, setActivePriorityFilter] = useState<string | null>(null);
  const [activeStartDateFilter, setActiveStartDateFilter] = useState<Date | null>(null);
  const [activeEndDateFilter, setActiveEndDateFilter] = useState<Date | null>(null);

  const companyId = authState.company?.company_id;

  useEffect(() => {
    if (companyId) {
      fetchAllTasks(companyId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const handleTabPress = useCallback(
    (tabId: string) => {
      setActiveTab(tabId);
      if (companyId) {
        fetchAllTasks(companyId);
      }
    },
    [companyId, fetchAllTasks]
  );

  const companyIdentifier = authState.company?.company_identifier ?? "";

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
        fetchAllTasks(companyId);
      } catch {
        // status change failed silently
      }
    },
    [companyId, companyIdentifier, updateTaskStatusApi, fetchAllTasks]
  );

  const handleFilterApply = useCallback(
    (filters: {
      status: string | null;
      priority: string | null;
      startDate?: Date | null;
      endDate?: Date | null;
    }) => {
      console.log("[TasksScreen] Filter Applied:", {
        status: filters.status,
        priority: filters.priority,
        startDate: filters.startDate ? filters.startDate.toISOString() : null,
        endDate: filters.endDate ? filters.endDate.toISOString() : null,
      });
      setActiveStatusFilter(filters.status);
      setActivePriorityFilter(filters.priority);
      setActiveStartDateFilter(filters.startDate ?? null);
      setActiveEndDateFilter(filters.endDate ?? null);
    },
    []
  );

  const handleFilterReset = useCallback(() => {
    console.log("[TasksScreen] Filter Reset");
    setActiveStatusFilter(null);
    setActivePriorityFilter(null);
    setActiveStartDateFilter(null);
    setActiveEndDateFilter(null);
  }, []);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (activeStatusFilter) count++;
    if (activePriorityFilter) count++;
    if (activeStartDateFilter || activeEndDateFilter) count++;
    return count;
  }, [activeStatusFilter, activePriorityFilter, activeStartDateFilter, activeEndDateFilter]);

  const handleTaskPress = useCallback(async (task: TaskRowProps) => {
    const raw = (task as any)._raw;
    if (!raw) return;
    let description = raw.description ?? "";
    try {
      const detailRes = await getTaskDetail(raw.id);
      if (detailRes.Good && detailRes.data?.priority?.[0]) {
        description = detailRes.data.priority[0].description ?? description;
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
      subtasks: [],
      dependencies: [],
      description,
      attachments: [],
      taskId: raw.id,
      companyId: companyId ?? 0,
      canEditStatus: raw.can_edit_status,
    } as any);
  }, [companyId]);

  const statuses = ["Pending", "In-Progress", "Rejected", "Pending-Approval", "Completed", "Recurring", "On-Hold"];
  const priorities = ["Normal", "Critical"];
  const priorityColors: Record<string, string> = {
    Normal: "#0DDFAB",
    Critical: "#FF4444",
  };
  const statusColors: Record<string, string> = {
    Pending: "#DFA70D",
    "In-Progress": "#607EF9",
    Rejected: "#FF0000",
    "Pending-Approval": "#1D1D1D",
    Completed: "#1CB333",
    "On-Hold": "#0DDFD8",
  };

  const mapRowWithRaw = useCallback(
    (row: import("@/utils/statusMapper").MappedTaskRow): TaskRowProps & { _raw: import("@/types/task.types").TaskListItem } => ({
      id: row.id,
      title: row.title,
      createdBy: row.createdBy,
      createdByInitials: row.createdByInitials,
      assignedTo: row.assignedTo,
      assignedToInitials: row.assignedToInitials,
      dueDate: row.dueDate,
      status: row.status,
      priorityName: row.priorityName,
      project: row.project,
      extraCount: row.extraCount,
      _raw: row._raw,
    }),
    []
  );

  const tasksMap = useMemo<Record<string, (TaskRowProps & { _raw: import("@/types/task.types").TaskListItem })[]>>(() => {
    const all = allMappedTasks.map(mapRowWithRaw);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const weekEnd = new Date(tomorrowStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const sortByDueDate = (tasks: (TaskRowProps & { _raw: import("@/types/task.types").TaskListItem })[]) =>
      [...tasks].sort((a, b) => {
        if (!a._raw?.due_date) return 1;
        if (!b._raw?.due_date) return -1;
        return new Date(a._raw.due_date).getTime() - new Date(b._raw.due_date).getTime();
      });

    return {
      all: sortByDueDate(all.filter((t) => t.status !== "Completed")),
      today: all
        .filter((t) => {
          if (t.status === "Completed") return false;
          if (!t._raw?.due_date) return false;
          const d = new Date(t._raw.due_date);
          return d >= todayStart && d < tomorrowStart;
        })
        .sort((a, b) => {
          const timeA = new Date(a._raw.due_date).getTime() % 86400000;
          const timeB = new Date(b._raw.due_date).getTime() % 86400000;
          if (timeA !== timeB) return timeA - timeB;
          const createdA = new Date(a._raw.createdAt || 0).getTime();
          const createdB = new Date(b._raw.createdAt || 0).getTime();
          return createdA - createdB;
        }),
      week: sortByDueDate(
        all.filter((t) => {
          if (t.status === "Completed") return false;
          if (!t._raw?.due_date) return false;
          const d = new Date(t._raw.due_date);
          return d >= tomorrowStart && d < weekEnd;
        })
      ),
      overdue: all
        .filter((t) => {
          if (t.status === "Completed") return false;
          if (!t._raw?.due_date) return false;
          const d = new Date(t._raw.due_date);
          return d < todayStart;
        })
        .sort((a, b) => {
          const dateA = new Date(a._raw.due_date).getTime();
          const dateB = new Date(b._raw.due_date).getTime();
          return dateA - dateB;
        }),
      created: sortByDueDate(mappedCreatedByMe.map(mapRowWithRaw).filter((t) => t.status !== "Completed")),
      assigned: sortByDueDate(mappedAssignedToMe.map(mapRowWithRaw).filter((t) => t.status !== "Completed")),
      recurring: sortByDueDate(
        all.filter((t) => t._raw?.is_recurring === true && t.status !== "Completed")
      ),
      completed: [...all.filter((t) => t.status === "Completed")].sort((a, b) => {
        const timeA = new Date(a._raw.updatedAt || a._raw.createdAt || 0).getTime();
        const timeB = new Date(b._raw.updatedAt || b._raw.createdAt || 0).getTime();
        return timeB - timeA;
      }),
    };
  }, [allMappedTasks, mappedCreatedByMe, mappedAssignedToMe, mapRowWithRaw]);

  const getTabCategoryScope = useCallback(
    (tabId: string) => {
      const all = allMappedTasks.map(mapRowWithRaw);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const tomorrowStart = new Date(todayStart);
      tomorrowStart.setDate(tomorrowStart.getDate() + 1);
      const weekEnd = new Date(tomorrowStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const sortByDueDate = (tasks: (TaskRowProps & { _raw: import("@/types/task.types").TaskListItem })[]) =>
        [...tasks].sort((a, b) => {
          if (!a._raw?.due_date) return 1;
          if (!b._raw?.due_date) return -1;
          return new Date(a._raw.due_date).getTime() - new Date(b._raw.due_date).getTime();
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
            })
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
          return sortByDueDate(all.filter((t) => t._raw?.is_recurring === true));
        case "completed":
          return all.filter((t) => t.status === "Completed");
        case "all":
        default:
          return all;
      }
    },
    [allMappedTasks, mappedCreatedByMe, mappedAssignedToMe, mapRowWithRaw]
  );

  // Stable sort: Critical tasks first, Normal (and others) after. Preserves relative order within each group.
  const sortByCritical = useCallback(
    (tasks: (TaskRowProps & { _raw: import("@/types/task.types").TaskListItem })[]) => {
      const criticals: typeof tasks = [];
      const others: typeof tasks = [];
      for (const t of tasks) {
        if (t._raw?.priority_name?.toLowerCase() === "critical") {
          criticals.push(t);
        } else {
          others.push(t);
        }
      }
      return [...criticals, ...others];
    },
    []
  );

  const displayedTasks = useMemo(() => {
    let tasks = getTabCategoryScope(activeTab);
    console.log(`[TasksScreen] Calculating displayedTasks for activeTab="${activeTab}". Base category tasks count:`, tasks.length);

    if (activeStatusFilter) {
      if (activeStatusFilter === "Recurring") {
        tasks = tasks.filter((t) => t._raw?.is_recurring === true || t.status === "Recurring");
      } else {
        tasks = tasks.filter((t) => t.status === activeStatusFilter);
      }
      console.log(`[TasksScreen] After status filter ("${activeStatusFilter}"):`, tasks.length);
    } else {
      if (activeTab === "completed") {
        tasks = tasks.filter((t) => t.status === "Completed");
      } else {
        tasks = tasks.filter((t) => t.status !== "Completed");
      }
    }

    if (activePriorityFilter) {
      tasks = tasks.filter(
        (t) => t._raw?.priority_name?.toLowerCase() === activePriorityFilter.toLowerCase()
      );
      console.log(`[TasksScreen] After priority filter ("${activePriorityFilter}"):`, tasks.length);
    }

    if (activeStartDateFilter || activeEndDateFilter) {
      const startMs = activeStartDateFilter ? new Date(activeStartDateFilter).setHours(0, 0, 0, 0) : null;
      const endMs = activeEndDateFilter ? new Date(activeEndDateFilter).setHours(23, 59, 59, 999) : null;

      console.log(`[TasksScreen] Applying Date Filter: Start=${startMs ? new Date(startMs).toISOString() : "None"}, End=${endMs ? new Date(endMs).toISOString() : "None"}`);

      tasks = tasks.filter((t) => {
        if (!t._raw?.due_date) {
          console.log(`[TasksScreen] Skipping "${t.title}": due_date is missing`);
          return false;
        }
        const taskDate = new Date(t._raw.due_date);
        const taskMs = taskDate.getTime();
        if (isNaN(taskMs)) {
          console.log(`[TasksScreen] Skipping "${t.title}": invalid due_date "${t._raw.due_date}"`);
          return false;
        }

        if (startMs !== null && taskMs < startMs) {
          console.log(`[TasksScreen] Skipping "${t.title}" (${t._raw.due_date}): before start date`);
          return false;
        }

        if (endMs !== null && taskMs > endMs) {
          console.log(`[TasksScreen] Skipping "${t.title}" (${t._raw.due_date}): after end date`);
          return false;
        }

        return true;
      });

      console.log(`[TasksScreen] After date range filter:`, tasks.length);
    }

    // Always sort Critical tasks to the top, preserving relative order within each group
    return sortByCritical(tasks);
  }, [
    activeTab,
    getTabCategoryScope,
    activeStatusFilter,
    activePriorityFilter,
    activeStartDateFilter,
    activeEndDateFilter,
    sortByCritical,
  ]);

  const statsList = useMemo(() => {
    return [
      { label: "All Tasks", count: pad(taskState.loading ? 0 : tasksMap.all.length), iconName: <AllTasksIcon />, id: "all" },
      { label: "Due Today", count: pad(tasksMap.today.length), iconName: <DueTodayIcon />, id: "today" },
      { label: "Due in 7 days", count: pad(tasksMap.week.length), iconName: <SevendayIcon />, id: "week" },
      { label: "Delayed", count: pad(tasksMap.overdue.length), iconName: <DelayIcon />, id: "overdue" },
      { label: "Created by me", count: pad(tasksMap.created.length), iconName: <CreatedIcon />, id: "created" },
      { label: "Assigned to me", count: pad(tasksMap.assigned.length), iconName: <AssignIcon />, id: "assigned" },
      { label: "Recurring", count: pad(tasksMap.recurring.length), iconName: <RecurringIcon />, id: "recurring" },
      { label: "Completed", count: pad(tasksMap.completed.length), iconName: <CompletedIcon />, id: "completed" },
    ];
  }, [taskState.loading, totalCount, tasksMap]);

  if (taskState.loading && totalCount === 0) {
    return (
      <View style={styles.root}>
        <View style={styles.safe}>
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <ActivityIndicator size="large" color="#00DEAB" />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.safe}>
        <FilterModal
          visible={filterVisible}
          onClose={() => setFilterVisible(false)}
          statuses={statuses}
          statusColors={statusColors}
          priorities={priorities}
          priorityColors={priorityColors}
          showPriority={true}
          initialStatus={activeStatusFilter}
          initialPriority={activePriorityFilter}
          initialStartDate={activeStartDateFilter}
          initialEndDate={activeEndDateFilter}
          onApply={handleFilterApply}
          onReset={handleFilterReset}
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
            />
          ))}
        </ScrollView>

        <View style={styles.tableShell}>
          <TaskTable
            sectionTitle={statsList.find((s) => s.id === activeTab)?.label ?? "All Tasks"}
            tasks={displayedTasks}
            onTaskPress={handleTaskPress}
            onStatusChange={handleStatusChange}
            onFilterPress={() => setFilterVisible(true)}
            loading={taskState.loading}
            activeFilterCount={activeFilterCount}
          />
        </View>
      </View>

      <TouchableOpacity style={styles.fab} activeOpacity={0.85} onPress={() => setCreateVisible(true)}>
        <MaterialIcons name="add" size={35} color="black" />
      </TouchableOpacity>

      <CreateTaskModal visible={createVisible} onClose={() => setCreateVisible(false)} />
      <TaskDetailModal visible={!!selectedTask} onClose={() => setSelectedTask(null)} task={selectedTask} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff", position: "relative" },
  safe: { flex: 1 },
  statsScroll: { maxHeight: 50 },
  statsContent: { paddingHorizontal: 16, paddingBottom: 15, gap: 6 },
  tableShell: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 120,
  },
  fab: {
    position: "absolute",
    bottom: 100,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#00DEAB",
    alignItems: "center",
    justifyContent: "center",
  },
  fabIcon: { fontSize: 28, color: "#fff", lineHeight: 32 },
});
