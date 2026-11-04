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
import { useSearch } from "@/context/SearchContext";
import { useAuth } from "@/hooks/useAuth";
import { useTasks } from "@/hooks/useTasks";
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
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

const SCROLL_COMPACT_THRESHOLD = 8;

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
  const [refreshing, setRefreshing] = useState(false);

  const statsScrollRef = useRef<ScrollView>(null);
  const cardLayoutsRef = useRef<Record<string, { x: number; width: number }>>({});

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

  const handleRefresh = useCallback(async () => {
    if (!companyId) return;
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
    rows: dashboard.allRows,
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
    [companyId, dashboard.completedPage, fetchCompletedPage, fetchRecurring],
  );

  const handleScrollOffset = useCallback(
    (offsetY: number) => {
      setIsHeaderCompact(offsetY > SCROLL_COMPACT_THRESHOLD);
    },
    [setIsHeaderCompact],
  );

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
    allRows: dashboard.allRows,
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
          compact={isHeaderCompact}
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
          hasTasks={dashboard.allRows.length > 0}
          stale={dashboard.partial || dashboard.stale}
          activeFilterCount={filters.activeFilterCount}
          hasMore={tabs.hasMore}
          loadingMore={tabs.loadingMore}
          refreshing={refreshing}
          containerStyle={styles.tableShell}
          assignableOwners={taskState.taskOwners}
          canReassign={canReassign}
          onRetry={handleRefresh}
          onRefresh={handleRefresh}
          onLoadMore={tabs.loadMore}
          onFilterPress={filters.open}
          onTaskPress={openTask}
          onCommentPress={openComments}
          onStatusChange={actions.handleStatusChange}
          onAssigneeChange={actions.handleAssigneeChange}
          onScrollOffsetChange={handleScrollOffset}
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
        onRejectClose={() => {
          setRejectModalVisible(false);
          setRejectTargetTaskId(null);
        }}
        onRejectSuccess={() =>
          actions.handleRejectSuccess(rejectTargetTaskId ?? 0)
        }
      />
    </View>
  );
}
