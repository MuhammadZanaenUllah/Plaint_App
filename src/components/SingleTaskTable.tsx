import Icons from "@/constants/icons";
import { triggerHaptic } from "@/utils/haptics";
import { showInfo } from "@/utils/toast";
import { getOwnerDisplayName } from "@/features/tasks/components/list/TaskAssigneeDropdown";
import { renderCounters } from "@/features/tasks/dev/counters";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  type LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { StatusType, TaskRowProps } from "./TaskRow";
import {
  DEFAULT_COLUMN_HEADINGS,
  DEFAULT_COLUMNS,
  getOwnerInitials,
  getTableMetrics,
  getTaskIdentityKey,
  getTaskKey,
  type AssignableOwner,
  type SingleTaskTableColumn,
} from "@/features/tasks/components/list/taskTableLayout";
import { ReadOnlyRow } from "@/features/tasks/components/list/TaskReadOnlyRow";
import { SwipeTaskRow } from "@/features/tasks/components/list/TaskSwipeRow";
import { CustomPullToRefreshBadge } from "@/features/tasks/components/list/TaskTablePrimitives";
import { taskTableStyles as styles } from "@/features/tasks/components/list/taskTableStyles";

export type { AssignableOwner, SingleTaskTableColumn };
export { DEFAULT_COLUMNS };

const { FilterIcon } = Icons;

type Props = {
  sectionTitle: string;
  tasks: TaskRowProps[];
  onTaskPress?: (task: TaskRowProps) => void;
  onCommentPress?: (task: TaskRowProps) => void;
  onStatusChange?: (task: TaskRowProps, newStatus: StatusType) => void;
  onFilterPress?: () => void;
  loading?: boolean;
  emptyText?: string;
  activeFilterCount?: number;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  onScrollOffsetChange?: (offsetY: number) => void;
  // Inline reassignment from the swiped-open row.
  canReassign?: boolean;
  assignableOwners?: AssignableOwner[];
  onAssigneeChange?: (task: TaskRowProps, owner: AssignableOwner) => void;
  canAssignProject?: boolean;
  onAddToProjectPress?: (task: TaskRowProps) => void;
  onSprintPress?: (task: TaskRowProps) => void;
  /** Read-only dependency tables render a remove action cell. */
  onRemoveTask?: (task: TaskRowProps) => void;
  // Optional column configuration. When omitted, the classic task layout is
  // used (Title / Created By / Due Date, fitted to the window without
  // horizontal scrolling). When provided, only the listed columns render —
  // in the given order — and the table becomes horizontally scrollable if
  // the combined widths exceed the available width.
  columns?: SingleTaskTableColumn[];
  columnHeadings?: Partial<Record<SingleTaskTableColumn, string>>;
  // When true, the leading completion checkbox and the swipe-to-change
  // affordances are suppressed so the table is purely read-only.
  readOnly?: boolean;
  // When true, the table fills its parent width cleanly (no edge-flush
  // compensation) — for embedding inside a padded container like a modal.
  contained?: boolean;
  // When true, the row list virtualizes off-screen rows via FlatList instead
  // of keeping every row mounted in a ScrollView — cuts memory/JS-thread cost
  // for long lists (e.g. many delayed tasks) on low-end Android. Opt-in and
  // only safe when this table is NOT nested inside another vertical
  // ScrollView — the Dependencies/Project-tasks embeddings render inside a
  // BottomSheetScrollView/ScrollView and must keep the default rendering.
  virtualized?: boolean;
};

type SwipeStage = "actions" | "details";
type OpenSwipeRow = { taskKey: string; stage: SwipeStage } | null;
type StatusOverrides = Record<string, StatusType>;
type AssigneeOverride = { name: string; initials: string; avatar?: string };
type AssigneeOverrides = Record<string, AssigneeOverride>;

function SingleTaskTable({
  sectionTitle,
  tasks,
  onTaskPress,
  onCommentPress,
  onStatusChange,
  onFilterPress,
  loading = false,
  emptyText = "No tasks found.",
  activeFilterCount = 0,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  onRefresh,
  refreshing = false,
  onScrollOffsetChange,
  canReassign = false,
  assignableOwners = [],
  onAssigneeChange,
  canAssignProject = false,
  onAddToProjectPress,
  onSprintPress,
  onRemoveTask,
  columns,
  columnHeadings,
  readOnly = false,
  contained = false,
  virtualized = false,
}: Props) {
  renderCounters.table();
  const { width: windowWidth } = useWindowDimensions();
  // Prefer the table's actual available width over the viewport width. The
  // header can collapse/expand above the list without this table reflowing.
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const layoutWidth = measuredWidth ?? windowWidth;
  const handleContainerLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    if (nextWidth <= 0) return;
    setMeasuredWidth((previous) =>
      previous !== null && Math.abs(previous - nextWidth) < 0.5
        ? previous
        : nextWidth,
    );
  }, []);
  const effectiveColumns = useMemo(
    () => columns ?? DEFAULT_COLUMNS,
    [columns],
  );
  const headingFor = useCallback(
    (key: SingleTaskTableColumn) =>
      columnHeadings?.[key] ?? DEFAULT_COLUMN_HEADINGS[key],
    [columnHeadings],
  );
  const metrics = useMemo(
    () => getTableMetrics(layoutWidth, effectiveColumns, contained),
    [layoutWidth, effectiveColumns, contained],
  );
  const [statusOverrides, setStatusOverrides] = useState<StatusOverrides>({});
  const [assigneeOverrides, setAssigneeOverrides] = useState<AssigneeOverrides>(
    {},
  );
  const [openSwipeRow, setOpenSwipeRow] = useState<OpenSwipeRow>(null);
  // Switching stat filters (Due Today, All Tasks, etc.) swaps the row data
  // under an open swipe. Reset it synchronously in the same render pass
  // (rather than a useEffect, which would commit a frame late) — otherwise
  // a swipe started immediately after switching tabs briefly targets a row
  // index carried over from the old list, fighting the close animation.
  const [lastSectionTitle, setLastSectionTitle] = useState(sectionTitle);
  if (sectionTitle !== lastSectionTitle) {
    setLastSectionTitle(sectionTitle);
    if (openSwipeRow !== null) setOpenSwipeRow(null);
  }
  const openTaskKey = openSwipeRow?.taskKey;
  if (
    openTaskKey &&
    !tasks.some((task) => getTaskIdentityKey(task) === openTaskKey)
  ) {
    // The open task left the current tab/filter/page. Reset synchronously so
    // a later task cannot inherit that open state by position.
    setOpenSwipeRow(null);
  }
  const [rowViewportHeight, setRowViewportHeight] = useState(0);
  const [rowContentHeight, setRowContentHeight] = useState(0);

  // Bumped whenever the list starts scrolling — the open Status/Assignee
  // dropdown inside a swiped-open "details" row watches this to close
  // itself, since it otherwise stays floating in place (not anchored to the
  // row it belongs to) as the row scrolls away underneath it.
  const [scrollCloseSignal, setScrollCloseSignal] = useState(0);

  // Scroll back to the top row whenever the tab changes, so switching tabs
  // always lands on the first task instead of wherever the previous tab
  // happened to be scrolled to. useLayoutEffect (not useEffect) so this
  // commits before paint — no visible flash of the old scroll position.
  const rowsScrollRef = useRef<ScrollView>(null);
  const rowsListRef = useRef<FlatList<TaskRowProps>>(null);
  useLayoutEffect(() => {
    if (virtualized) {
      rowsListRef.current?.scrollToOffset({ offset: 0, animated: false });
    } else {
      rowsScrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [sectionTitle, virtualized]);

  const augmentedTasks = useMemo(
    () =>
      tasks.map((task) => {
        const key = getTaskIdentityKey(task);
        const assigneeOverride = assigneeOverrides[key];
        return {
          ...task,
          status: statusOverrides[key] ?? task.status,
          ...(assigneeOverride
            ? {
                assignedTo: assigneeOverride.name,
                assignedToInitials: assigneeOverride.initials,
                assignedToAvatar: assigneeOverride.avatar,
              }
            : null),
        };
      }),
    [statusOverrides, assigneeOverrides, tasks],
  );

  const handleAssigneeChange = useCallback(
    (task: TaskRowProps, owner: AssignableOwner) => {
      if (!task._raw) {
        const displayName = getOwnerDisplayName(owner);
        setAssigneeOverrides((previous) => ({
          ...previous,
          [getTaskIdentityKey(task)]: {
            name: displayName.split(/\s+/)[0] ?? displayName,
            initials: getOwnerInitials(owner),
            avatar: owner.image ?? undefined,
          },
        }));
      }
      onAssigneeChange?.(task, owner);
    },
    [onAssigneeChange],
  );

  const handleStatusChange = useCallback(
    (task: TaskRowProps, nextStatus: StatusType) => {
      if (
        task.canEditStatus !== true &&
        task.canApproveReject !== true &&
        task.canReopen !== true
      ) {
        showInfo(
          "Not Allowed",
          "You don't have permission to change this task's status.",
        );
        return;
      }
      if (nextStatus === "Rejected") {
        if (task.canApproveReject !== true) {
          showInfo("Not Allowed", "Only the task creator or company admin can reject this task.");
          return;
        }
        onStatusChange?.(task, nextStatus);
        return;
      }
      triggerHaptic("success");
      if (!task._raw) {
        setStatusOverrides((previous) => ({
          ...previous,
          [getTaskIdentityKey(task)]: nextStatus,
        }));
      }
      onStatusChange?.(task, nextStatus);
    },
    [onStatusChange],
  );

  const handleToggleComplete = useCallback(
    (task: TaskRowProps) => {
      if (task.status !== "Completed") {
        handleStatusChange(task, "Completed");
      }
    },
    [handleStatusChange],
  );

  const openSwipe = useCallback((taskKey: string, stage: SwipeStage) => {
    triggerHaptic("light");
    setOpenSwipeRow({ taskKey, stage });
  }, []);

  const closeSwipe = useCallback(() => {
    setOpenSwipeRow(null);
  }, []);

  const shouldEnableRowScroll = rowContentHeight > rowViewportHeight + 1;

  const pullDistance = useSharedValue(0);

  // Infinite scroll — fire onLoadMore when the user scrolls near the bottom.
  // Also reports the raw scroll offset so the screen can collapse its header.
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { layoutMeasurement, contentOffset, contentSize } =
        event.nativeEvent;
      onScrollOffsetChange?.(contentOffset.y);

      if (contentOffset.y < 0) {
        pullDistance.value = -contentOffset.y;
      } else {
        pullDistance.value = 0;
      }

      if (!hasMore || loadingMore || loading) return;
      const threshold = 40;
      if (
        layoutMeasurement.height + contentOffset.y >=
        contentSize.height - threshold
      ) {
        onLoadMore?.();
      }
    },
    [
      hasMore,
      loadingMore,
      loading,
      onLoadMore,
      onScrollOffsetChange,
      pullDistance,
    ],
  );

  // If the current page doesn't fill the viewport (e.g. tall screens), load the
  // next page automatically so infinite scroll never dead-ends.
  useEffect(() => {
    if (
      hasMore &&
      !loadingMore &&
      !loading &&
      rowViewportHeight > 0 &&
      rowContentHeight > 0 &&
      rowContentHeight <= rowViewportHeight
    ) {
      onLoadMore?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowContentHeight, rowViewportHeight, hasMore, loading, loadingMore]);

  const [lastUpdatedTime, setLastUpdatedTime] = useState<Date>(new Date());
  const syncRotation = useSharedValue(0);

  useEffect(() => {
    if (refreshing) {
      syncRotation.value = withRepeat(
        withTiming(360, { duration: 850, easing: Easing.linear }),
        -1,
        false,
      );
    } else {
      syncRotation.value = 0;
      setLastUpdatedTime(new Date());
    }
  }, [refreshing, syncRotation]);

  const syncIconAnimStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${syncRotation.value}deg` }],
  }));

  const timeAgoText = useMemo(() => {
    const diffMs = Date.now() - lastUpdatedTime.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "moments ago";
    if (diffMin < 60) return `${diffMin} ${diffMin === 1 ? "min" : "mins"} ago`;
    const diffHr = Math.floor(diffMin / 60);
    return `${diffHr} ${diffHr === 1 ? "hr" : "hrs"} ago`;
  }, [lastUpdatedTime]);

  return (
    <View
      style={{ flex: 1, width: "100%" }}
      onLayout={handleContainerLayout}
    >
      <View
        style={[
          styles.container,
          {
            width: metrics.needsHScroll
              ? metrics.fullTableWidth
              : metrics.tableWidth,
            alignSelf: contained
              ? "stretch"
              : metrics.tableWidthClamped
                ? "center"
                : "flex-end",
          },
        ]}
      >
      <View
        style={[styles.sectionHeader, { marginLeft: metrics.leftCompensation }]}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>{sectionTitle}</Text>
        </View>

        {onFilterPress ? (
          <Pressable
            onPress={onFilterPress}
            style={({ pressed }) => [
              styles.filterBtn,
              pressed && styles.filterBtnPressed,
              activeFilterCount > 0 && styles.filterBtnActive,
            ]}
          >
            {({ pressed }) => (
              <View>
                <FilterIcon width={18} height={18} />
                {activeFilterCount > 0 ? (
                  <View style={styles.filterBadge}>
                    <Text style={styles.filterBadgeText}>
                      {activeFilterCount}
                    </Text>
                  </View>
                ) : null}
              </View>
            )}
          </Pressable>
        ) : null}
      </View>

      {readOnly ? (
        /* Read-only table (e.g. dependencies) — horizontally scrollable so
           every configured column gets its own space and never overlaps. The
           enclosing parent scroll view handles vertical scrolling. */
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          nestedScrollEnabled
          contentContainerStyle={{
            paddingBottom: 8,
          }}
        >
          <View style={{ width: metrics.fullTableWidth }}>
            <View
              style={[
                styles.tableHeader,
                { paddingHorizontal: metrics.innerPadding },
              ]}
            >
              <View style={{ width: 24 }} />
              {effectiveColumns.map((key) => (
                <Text
                  key={key}
                  style={[styles.colHead, { width: metrics.columnWidths[key] }]}
                >
                  {headingFor(key)}
                </Text>
              ))}
              <View style={{ width: metrics.actionWidth }} />
            </View>

            {loading ? (
              <View style={styles.centeredState}>
                <ActivityIndicator size="small" color="#00DEAB" />
              </View>
            ) : augmentedTasks.length === 0 ? (
              <View style={styles.centeredState}>
                <Text style={styles.emptyText}>{emptyText}</Text>
              </View>
            ) : (
              augmentedTasks.map((task, rowIndex) => (
                <ReadOnlyRow
                  key={getTaskKey(task, rowIndex)}
                  item={task}
                  columns={effectiveColumns}
                  columnWidths={metrics.columnWidths}
                  leadingWidth={metrics.leadingWidth}
                  innerPadding={metrics.innerPadding}
                  onTaskPress={onTaskPress}
                  onRemoveTask={onRemoveTask}
                />
              ))
            )}
          </View>
        </ScrollView>
      ) : (
        <>
          {/* Custom Pull-To-Refresh Badge */}
          <CustomPullToRefreshBadge
            pullDistance={pullDistance}
            refreshing={refreshing}
          />

          <View
            style={[
              styles.tableHeader,
              {
                paddingHorizontal: metrics.innerPadding,
                marginLeft: metrics.leftCompensation,
              },
            ]}
          >
            <View style={{ width: 24 }} />
            {effectiveColumns.map((key) => (
              <Text
                key={key}
                style={[styles.colHead, { width: metrics.columnWidths[key] }]}
              >
                {headingFor(key)}
              </Text>
            ))}
            <View style={{ width: metrics.actionWidth }} />
          </View>

          {virtualized ? (
            <FlatList<TaskRowProps>
              ref={rowsListRef}
              data={loading ? [] : augmentedTasks}
              extraData={openSwipeRow}
              keyExtractor={(item, index) => String(getTaskKey(item, index))}
              renderItem={({ item, index }) => {
                const taskKey = getTaskIdentityKey(item);
                return (
                  <SwipeTaskRow
                    item={item}
                    taskKey={taskKey}
                    rowIndex={index}
                    metrics={metrics}
                    isOpen={openSwipeRow?.taskKey === taskKey}
                    stage={
                      openSwipeRow?.taskKey === taskKey
                        ? openSwipeRow.stage
                        : null
                    }
                    onOpenSwipe={openSwipe}
                    onCloseSwipe={closeSwipe}
                    onTaskPress={onTaskPress}
                    onCommentPress={onCommentPress}
                    onToggleComplete={handleToggleComplete}
                    onStatusChange={handleStatusChange}
                    canReassign={canReassign}
                    assignableOwners={assignableOwners}
                    onAssigneeChange={handleAssigneeChange}
                    canAssignProject={canAssignProject}
                    onAddToProjectPress={onAddToProjectPress}
                    onSprintPress={onSprintPress}
                    scrollCloseSignal={scrollCloseSignal}
                    columns={effectiveColumns}
                    readOnly={readOnly}
                  />
                );
              }}
              ListHeaderComponent={
                loading ? (
                  <View style={styles.centeredState}>
                    <ActivityIndicator size="small" color="#00DEAB" />
                  </View>
                ) : null
              }
              ListEmptyComponent={
                !loading ? (
                  <View style={styles.centeredState}>
                    <Text style={styles.emptyText}>{emptyText}</Text>
                  </View>
                ) : null
              }
              ListFooterComponent={
                !loading && augmentedTasks.length > 0 ? (
                  <View style={styles.footerState}>
                    {loadingMore ? (
                      <ActivityIndicator size="small" color="#00DEAB" />
                    ) : null}
                  </View>
                ) : null
              }
              showsVerticalScrollIndicator={false}
              style={styles.rowsScroll}
              contentContainerStyle={styles.rowsScrollContent}
              keyboardShouldPersistTaps="always"
              scrollEnabled={shouldEnableRowScroll}
              bounces={shouldEnableRowScroll || !!onRefresh}
              alwaysBounceVertical={!!onRefresh}
              onLayout={(event) =>
                setRowViewportHeight(event.nativeEvent.layout.height)
              }
              onContentSizeChange={(_width, height) =>
                setRowContentHeight(height)
              }
              onScroll={handleScroll}
              onScrollBeginDrag={() => setScrollCloseSignal((n) => n + 1)}
              scrollEventThrottle={16}
              nestedScrollEnabled
              // FlatList's own end-reached detection (rather than the manual
              // contentOffset/contentSize math in handleScroll, which relies
              // on a plain ScrollView's bounce/contentInset behavior and
              // doesn't reliably fire near the bottom on iOS once rows are
              // virtualized) drives pagination here.
              onEndReachedThreshold={0.4}
              onEndReached={() => {
                if (hasMore && !loadingMore && !loading) onLoadMore?.();
              }}
              // Off-screen rows carry absolutely-positioned overlays (status/
              // assignee dropdowns, the wide "details" swipe panel) that must
              // not be clipped by the recycler — only unmount them, don't
              // also strip their native views while still mounted.
              removeClippedSubviews={false}
              windowSize={7}
              maxToRenderPerBatch={8}
              initialNumToRender={12}
              updateCellsBatchingPeriod={50}
              refreshControl={
                onRefresh ? (
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    colors={["transparent"]}
                    tintColor="transparent"
                    progressBackgroundColor="transparent"
                    progressViewOffset={
                      Platform.OS === "android" ? -1000 : undefined
                    }
                  />
                ) : undefined
              }
            />
          ) : (
            <ScrollView
              ref={rowsScrollRef}
              showsVerticalScrollIndicator={false}
              style={styles.rowsScroll}
              contentContainerStyle={styles.rowsScrollContent}
              keyboardShouldPersistTaps="always"
              scrollEnabled={shouldEnableRowScroll}
              bounces={shouldEnableRowScroll || !!onRefresh}
              alwaysBounceVertical={!!onRefresh}
              onLayout={(event) =>
                setRowViewportHeight(event.nativeEvent.layout.height)
              }
              onContentSizeChange={(_width, height) =>
                setRowContentHeight(height)
              }
              onScroll={handleScroll}
              onScrollBeginDrag={() => setScrollCloseSignal((n) => n + 1)}
              scrollEventThrottle={16}
              nestedScrollEnabled
              refreshControl={
                onRefresh ? (
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    colors={["transparent"]}
                    tintColor="transparent"
                    progressBackgroundColor="transparent"
                    progressViewOffset={
                      Platform.OS === "android" ? -1000 : undefined
                    }
                  />
                ) : undefined
              }
            >
              {loading ? (
                <View style={styles.centeredState}>
                  <ActivityIndicator size="small" color="#00DEAB" />
                </View>
              ) : null}

              {!loading && augmentedTasks.length === 0 ? (
                <View style={styles.centeredState}>
                  <Text style={styles.emptyText}>{emptyText}</Text>
                </View>
              ) : null}

              {!loading
                ? augmentedTasks.map((task, rowIndex) => {
                    const taskKey = getTaskIdentityKey(task);
                    return (
                      <SwipeTaskRow
                        key={getTaskKey(task, rowIndex)}
                        item={task}
                        taskKey={taskKey}
                        rowIndex={rowIndex}
                        metrics={metrics}
                        isOpen={openSwipeRow?.taskKey === taskKey}
                        stage={
                          openSwipeRow?.taskKey === taskKey
                            ? openSwipeRow.stage
                            : null
                        }
                        onOpenSwipe={openSwipe}
                        onCloseSwipe={closeSwipe}
                        onTaskPress={onTaskPress}
                        onCommentPress={onCommentPress}
                        onToggleComplete={handleToggleComplete}
                        onStatusChange={handleStatusChange}
                        canReassign={canReassign}
                        assignableOwners={assignableOwners}
                        onAssigneeChange={handleAssigneeChange}
                        canAssignProject={canAssignProject}
                        onAddToProjectPress={onAddToProjectPress}
                        onSprintPress={onSprintPress}
                        scrollCloseSignal={scrollCloseSignal}
                        columns={effectiveColumns}
                        readOnly={readOnly}
                      />
                    );
                  })
                : null}

              {!loading && augmentedTasks.length > 0 ? (
                <View style={styles.footerState}>
                  {loadingMore ? (
                    <ActivityIndicator size="small" color="#00DEAB" />
                  ) : !hasMore ? (
                    <>{/* <Text style={styles.footerText}>End of list</Text> */}</>
                  ) : null}
                </View>
              ) : null}
            </ScrollView>
          )}
        </>
      )}
      </View>
    </View>
  );
}

export default memo(SingleTaskTable);
