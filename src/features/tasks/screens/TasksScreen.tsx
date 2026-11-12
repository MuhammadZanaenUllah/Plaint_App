import TaskFilterModal from "@/features/tasks/components/filters/TaskFilterModal";
import { TaskDetail } from "@/components/TaskDetailModal";
import TaskModalsHost from "@/features/tasks/components/dashboard/TaskModalsHost";
import TaskStatsBar from "@/features/tasks/components/dashboard/TaskStatsBar";
import TaskList from "@/features/tasks/components/list/TaskList";
import { TASK_TABS } from "@/features/tasks/constants/taskTabs";
import { useTaskActions } from "@/features/tasks/hooks/useTaskActions";
import { useTaskDashboard } from "@/features/tasks/hooks/useTaskDashboard";
import { useTaskDeepLink } from "@/features/tasks/hooks/useTaskDeepLink";
import { useTaskDetailOpener } from "@/features/tasks/hooks/useTaskDetailOpener";
import { useTaskFilterController } from "@/features/tasks/hooks/useTaskFilterController";
import { useTaskDelayedPopup } from "@/features/tasks/hooks/useTaskDelayedPopup";
import { useTaskProjectAssignment } from "@/features/tasks/hooks/useTaskProjectAssignment";
import TaskProjectAssignmentHost from "@/features/tasks/components/shared/TaskProjectAssignmentHost";
import { reportTaskError } from "@/features/tasks/utils/taskError";
import { useTaskStats } from "@/features/tasks/hooks/useTaskStats";
import styles from "./TasksScreen.styles";
import { useTaskTabs } from "@/features/tasks/hooks/useTaskTabs";
import {
  canCreateTask,
  canViewTasks,
  hasPermission,
  hasTasksModule,
  isCompanyAdmin,
  isHead,
  TASK_PERMISSIONS,
} from "@/features/tasks/permissions/taskPermissions";
import { useTaskFiltersStore } from "@/features/tasks/store/taskFiltersStore";
import { useTasksStore } from "@/features/tasks/store/tasksStore";
import { useSearch } from "@/context/SearchContext";
import { useAuth } from "@/hooks/useAuth";
import { useTasks } from "@/hooks/useTasks";
import {
  canAssignTaskToProject,
  canCreateProject,
} from "@/features/projects/permissions/projectPermissions";
import { showError } from "@/utils/toast";
import { StatusBar } from "expo-status-bar";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Dimensions,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSharedValue, withTiming } from "react-native-reanimated";

// Progress is tied directly to the scroll offset:
// - scrolling down collapses over the first 36px
// - scrolling back up stays compact until the actual top
// - pulling past the top expands over 72px of overscroll
const CARD_COLLAPSE_DISTANCE = 36;
const CARD_EXPAND_DISTANCE = 72;

export default function TasksScreen() {
  const { state: authState } = useAuth();
  const canView = canViewTasks(authState.user, authState.company);

  if (!canView) {
    return (
      <View style={styles.root}>
        <StatusBar style="dark" />
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 28,
          }}
        >
          <Text
            style={{
              fontSize: 18,
              fontFamily: "SF_Pro_Semibold",
              color: "#1D1D1D",
              marginBottom: 8,
            }}
          >
            Tasks unavailable
          </Text>
          <Text
            style={{
              fontSize: 13,
              fontFamily: "SF_Pro_Regular",
              color: "#6B7280",
              textAlign: "center",
              lineHeight: 19,
            }}
          >
            Your account does not have the Tasks module or the tasks-list
            permission. Please contact your company admin.
          </Text>
        </View>
      </View>
    );
  }

  return <TasksScreenContent />;
}

function TasksScreenContent() {
  const { state: authState } = useAuth();
  const {
    state: taskState,
    fetchAllTasks,
    fetchCompletedPage,
    fetchRecurring,
    updateTaskStatusApi,
  } = useTasks();

  const companyId = authState.company?.company_id ?? null;
  const companyIdentifier = authState.company?.company_identifier ?? "";
  const isAts = authState.hasAdvancedTaskModule === true;

  const { searchText, isHeaderCompact, setIsHeaderCompact } = useSearch();
  const lastCompactRef = useRef(isHeaderCompact);
  const statsCollapse = useSharedValue(0);
  // True while the full cards are latched at the top after an intentional
  // top overscroll. Starts true so the first render shows full cards.
  const topExpandedRef = useRef(true);
  const collapsedRef = useRef(false);
  const topPullActiveRef = useRef(false);
  const topPullTouchRef = useRef(0);
  const filters = useTaskFilterController(searchText);
  const dashboard = useTaskDashboard(isAts, authState.user, authState.company);

  const tabs = useTaskTabs({
    companyId,
    activeTab: dashboard.filters.activeTab,
    totalCount: dashboard.totalCount,
    completedPage: dashboard.completedPage,
    hasMoreCompleted: dashboard.hasMoreCompleted,
    fetchCompletedPage,
  });

  const [selectedTask, setSelectedTask] = useState<TaskDetail | null>(null);
  const [detailInitialTab, setDetailInitialTab] = useState<"details" | "comments">(
    "details",
  );
  const [createVisible, setCreateVisible] = useState(false);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectTargetTaskId, setRejectTargetTaskId] = useState<number | null>(
    null,
  );
  const [reopenModalVisible, setReopenModalVisible] = useState(false);
  const [reopenTargetTaskId, setReopenTargetTaskId] = useState<number | null>(
    null,
  );
  const [resumeModalVisible, setResumeModalVisible] = useState(false);
  const [resumeTargetTaskId, setResumeTargetTaskId] = useState<number | null>(
    null,
  );
  const [resumeTargetStatus, setResumeTargetStatus] = useState<
    "In-Progress" | "Pending"
  >("In-Progress");
  const [refreshing, setRefreshing] = useState(false);

  const statsScrollRef = useRef<ScrollView>(null);
  const cardLayoutsRef = useRef<Record<string, { x: number; width: number }>>({});
  const refreshingRef = useRef(false);

  const canCreate = useMemo(
    () => canCreateTask(authState.user, authState.company),
    [authState.company, authState.user],
  );
  const canUseOwnerFilter = useMemo(
    () => isCompanyAdmin(authState.user) || isHead(authState.user),
    [authState.user],
  );
  const canReassign = useMemo(
    () =>
      hasTasksModule(authState.company) &&
      hasPermission(authState.user, TASK_PERMISSIONS.edit),
    [authState.company, authState.user],
  );
  const canAssignProject = useMemo(
    () => canAssignTaskToProject(authState.user, authState.company),
    [authState.company, authState.user],
  );
  const canCreateProjectNow = useMemo(
    () => canCreateProject(authState.user, authState.company),
    [authState.company, authState.user],
  );

  const handleRefresh = useCallback(async () => {
    if (!companyId || refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      await fetchAllTasks(companyId, { silent: true });
      if (dashboard.filters.activeTab === "completed") {
        await fetchCompletedPage(companyId, 1);
      } else if (dashboard.filters.activeTab === "recurring") {
        await fetchRecurring(companyId, { force: true });
      }
      tabs.resetPagination();
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, [
    companyId,
    dashboard.filters.activeTab,
    fetchAllTasks,
    fetchCompletedPage,
    fetchRecurring,
    tabs,
  ]);

  const actions = useTaskActions({
    companyId: companyId ?? undefined,
    companyIdentifier,
    company: authState.company,
    user: authState.user,
    isAts,
    updateTaskStatusApi,
    refresh: () => {
      handleRefresh().catch((error) =>
        showError(
          "Refresh Failed",
          error instanceof Error ? error.message : "Failed to refresh tasks.",
        ),
      );
    },
    onReject: (taskId) => {
      setRejectTargetTaskId(taskId);
      setRejectModalVisible(true);
    },
    onReopen: (taskId) => {
      setReopenTargetTaskId(taskId);
      setReopenModalVisible(true);
    },
    onResume: (taskId, status) => {
      setResumeTargetTaskId(taskId);
      setResumeTargetStatus(status);
      setResumeModalVisible(true);
    },
  });

  const assignment = useTaskProjectAssignment({
    companyId: companyId ?? 0,
    companyIdentifier,
    canAssign: canAssignProject,
    canCreateProject: canCreateProjectNow,
    refresh: () => {
      handleRefresh().catch((error) =>
        reportTaskError("Task refresh after assignment failed", error),
      );
    },
  });

  const { openTask, openComments } = useTaskDetailOpener({
    companyId,
    onOpen: (detail, tab) => {
      setSelectedTask(detail);
      setDetailInitialTab(tab);
    },
  });

  const overdue = useTaskDelayedPopup({ companyId });

  useTaskDeepLink({
    rows: dashboard.visibleRows,
    companyId,
    loading: dashboard.loading,
    onOpenTask: openTask,
    onOpenDetail: (detail) => {
      setSelectedTask(detail);
      setDetailInitialTab("details");
    },
  });

  useEffect(() => {
    if (companyId) fetchAllTasks(companyId);
  }, [companyId, fetchAllTasks]);

  const handleTabPress = useCallback(
    (tabId: string) => {
      const tab = TASK_TABS.find((entry) => entry.id === tabId);
      if (!tab) return;

      useTaskFiltersStore.getState().setActiveTab(tab.id);
      // A failed completed page must not leave its banner above another tab.
      useTasksStore.getState().clearError();
      // The list scrolls back to the top on tab change; restore the full cards.
      topExpandedRef.current = true;
      collapsedRef.current = false;
      topPullActiveRef.current = false;
      topPullTouchRef.current = 0;
      statsCollapse.set(0);
      lastCompactRef.current = false;
      setIsHeaderCompact(false);

      if (tab.id === "completed" && companyId && dashboard.completedPage === 0) {
        fetchCompletedPage(companyId, 1);
      }
      if (tab.id === "recurring" && companyId) {
        fetchRecurring(companyId);
      }

      const layout = cardLayoutsRef.current[tabId];
      if (layout && statsScrollRef.current) {
        const screenWidth = Dimensions.get("window").width;
        statsScrollRef.current.scrollTo({
          x: Math.max(0, layout.x + layout.width / 2 - screenWidth / 2),
          animated: true,
        });
      }
    },
    [
      companyId,
      dashboard.completedPage,
      fetchCompletedPage,
      fetchRecurring,
      setIsHeaderCompact,
      statsCollapse,
    ],
  );

  const syncHeaderCompact = useCallback(
    (progress: number) => {
      const nextCompact = progress > 0.5;
      if (nextCompact === lastCompactRef.current) return;
      lastCompactRef.current = nextCompact;
      setIsHeaderCompact(nextCompact);
    },
    [setIsHeaderCompact],
  );

  const handleScrollOffset = useCallback(
    (offsetY: number) => {
      // Android has no negative contentOffset during overscroll; its top-pull
      // path is driven by the touch fallback below.
      if (Platform.OS === "android" && topPullActiveRef.current) return;

      if (offsetY > CARD_COLLAPSE_DISTANCE) {
        topExpandedRef.current = false;
        collapsedRef.current = true;
      }
      if (offsetY <= -CARD_EXPAND_DISTANCE) {
        topExpandedRef.current = true;
        collapsedRef.current = false;
      }

      let progress: number;
      if (offsetY > 0) {
        // Once collapsed, upward scrolling inside the list must not
        // progressively expand the cards again.
        progress = collapsedRef.current
          ? 1
          : Math.min(1, offsetY / CARD_COLLAPSE_DISTANCE);
        if (progress >= 1) collapsedRef.current = true;
      } else if (topExpandedRef.current) {
        progress = 0;
      } else {
        progress = 1 - Math.min(1, -offsetY / CARD_EXPAND_DISTANCE);
        if (progress <= 0) {
          topExpandedRef.current = true;
          collapsedRef.current = false;
        }
      }

      statsCollapse.set(progress);
      syncHeaderCompact(progress);
    },
    [statsCollapse, syncHeaderCompact],
  );

  // Android fallback: track a downward drag while the list is already at the
  // top so cards still respond to an actual top overscroll gesture.
  const handleTopPullChange = useCallback(
    (pullDistance: number) => {
      if (Platform.OS !== "android") return;
      topPullActiveRef.current = true;
      topPullTouchRef.current = pullDistance;
      if (pullDistance >= CARD_EXPAND_DISTANCE) {
        topExpandedRef.current = true;
        collapsedRef.current = false;
      }
      const progress = 1 - Math.min(1, pullDistance / CARD_EXPAND_DISTANCE);
      statsCollapse.set(progress);
      syncHeaderCompact(progress);
    },
    [statsCollapse, syncHeaderCompact],
  );

  const handleTopPullEnd = useCallback(() => {
    if (Platform.OS !== "android") return;
    topPullActiveRef.current = false;
    if (topPullTouchRef.current >= CARD_EXPAND_DISTANCE) {
      topExpandedRef.current = true;
      collapsedRef.current = false;
    }
    const progress = topExpandedRef.current ? 0 : 1;
    statsCollapse.set(withTiming(progress, { duration: 160 }));
    syncHeaderCompact(progress);
    topPullTouchRef.current = 0;
  }, [statsCollapse, syncHeaderCompact]);

  const {
    statsList,
    statuses,
    statusColors,
    priorities,
    priorityColors,
    showPriority,
    sectionTitle,
  } = useTaskStats({
    counts: dashboard.counts,
    completeCount: dashboard.completeCount,
    partial: dashboard.partial,
    isAts,
    hasCriticalTask: dashboard.hasCriticalTask,
    activeTab: dashboard.filters.activeTab,
    hasActiveFilters: dashboard.hasActiveFilters,
  });
  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <Pressable style={styles.safe} onPress={() => Keyboard.dismiss()}>
        <TaskFilterModal
          visible={filters.visible}
          onClose={filters.close}
          statuses={statuses}
          statusColors={statusColors}
          priorities={priorities}
          priorityColors={priorityColors}
          showPriority={showPriority}
          owners={taskState.taskOwners}
          showCreatedBy
          canUseOwnerFilter={canUseOwnerFilter}
          initialStatus={filters.initialStatus}
          initialPriority={filters.initialPriority}
          initialStartDate={filters.initialStartDate}
          initialEndDate={filters.initialEndDate}
          initialCreatedBy={filters.initialCreatedBy}
          initialAssignedTo={filters.initialAssignedTo}
          onApply={filters.apply}
          onReset={filters.reset}
          loading={dashboard.loading}
        />

        <TaskStatsBar
          items={statsList}
          selectedTab={dashboard.filters.activeTab}
          collapseProgress={statsCollapse}
          scrollRef={statsScrollRef}
          scrollStyle={styles.statsScroll}
          contentContainerStyle={styles.statsContent}
          onPress={handleTabPress}
          onCardLayout={(id, x, width) => {
            cardLayoutsRef.current[id] = { x, width };
          }}
        />

        <TaskList
          sectionTitle={sectionTitle}
          tasks={dashboard.visibleRows}
          loading={dashboard.loading}
          error={dashboard.error}
          hasTasks={dashboard.hasAnyTask}
          activeFilterCount={filters.activeFilterCount}
          hasMore={tabs.hasMore}
          loadingMore={tabs.loadingMore}
          paginationError={tabs.paginationError}
          refreshing={refreshing}
          containerStyle={styles.tableShell}
          assignableOwners={taskState.taskOwners}
          canReassign={canReassign}
          onRetry={handleRefresh}
          onRefresh={handleRefresh}
          onLoadMore={tabs.loadMore}
          onRetryLoadMore={tabs.loadMore}
          onFilterPress={filters.open}
          onTaskPress={openTask}
          onCommentPress={openComments}
          onStatusChange={actions.handleStatusChange}
          onAssigneeChange={actions.handleAssigneeChange}
          onScrollOffsetChange={handleScrollOffset}
          onTopPullChange={handleTopPullChange}
          onTopPullEnd={handleTopPullEnd}
          canAssignProject={canAssignProject}
          onAddToProjectPress={assignment.openForTask}
        />
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
        delayTask={overdue.delayTask}
        onDelayClose={overdue.closeDelay}
        onExtendDelay={overdue.extendDelay}
        rejectModalVisible={rejectModalVisible}
        rejectTaskId={rejectTargetTaskId ?? 0}
        companyId={companyId ?? 0}
        companyIdentifier={companyIdentifier}
        isAts={isAts}
        onRejectClose={() => {
          setRejectModalVisible(false);
          setRejectTargetTaskId(null);
        }}
        onRejectSuccess={(newStatus) =>
          actions.handleRejectSuccess(rejectTargetTaskId ?? 0, newStatus)
        }
        reopenModalVisible={reopenModalVisible}
        reopenTaskId={reopenTargetTaskId ?? 0}
        onReopenClose={() => {
          setReopenModalVisible(false);
          setReopenTargetTaskId(null);
        }}
        onReopenSuccess={(status) => {
          void actions.handleReopenSuccess(reopenTargetTaskId ?? 0, status);
          setReopenModalVisible(false);
          setReopenTargetTaskId(null);
        }}
        resumeModalVisible={resumeModalVisible}
        resumeTaskId={resumeTargetTaskId ?? 0}
        resumeTargetStatus={resumeTargetStatus}
        onResumeClose={() => {
          setResumeModalVisible(false);
          setResumeTargetTaskId(null);
        }}
        onResumeSuccess={(status) => {
          void actions.handleResumeSuccess(resumeTargetTaskId ?? 0, status);
          setResumeModalVisible(false);
          setResumeTargetTaskId(null);
        }}
      />

      <TaskProjectAssignmentHost
        controller={assignment}
        companyId={companyId ?? 0}
        companyIdentifier={companyIdentifier}
      />
    </View>
  );
}
