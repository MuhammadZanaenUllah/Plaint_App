import Avatar from "@/components/Avatar";
import Icons from "@/constants/icons";
import { triggerHaptic } from "@/utils/haptics";
import { showInfo } from "@/utils/toast";
import { Ionicons } from "@expo/vector-icons";
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
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  runOnJS,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import {
  ALL_STATUSES,
  STATUS_COLORS,
  StatusType,
  TaskRowProps,
} from "./TaskRow";

const { FilterIcon, LeftWaveIcon, RightWaveIcon, HalfSwipeIcon } = Icons;

// Minimal person shape — decoupled from the task-owner roster's own type so
// this presentational component doesn't need to import from task.types.
export type AssignableOwner = {
  id: number;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  image?: string | null;
};

function getOwnerDisplayName(owner: AssignableOwner): string {
  const full = owner.full_name?.trim();
  if (full) return full;
  return `${owner.first_name ?? ""} ${owner.last_name ?? ""}`.trim();
}

function getOwnerInitials(owner: AssignableOwner): string {
  if (owner.first_name || owner.last_name) {
    return (
      (owner.first_name?.[0] ?? "") + (owner.last_name?.[0] ?? "")
    ).toUpperCase();
  }
  const parts = owner.full_name?.trim().split(/\s+/) ?? [];
  if (parts.length >= 2)
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0]?.[0]?.toUpperCase() ?? "?";
}

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
  // Inline reassignment from the swiped-open row — gated to users who can
  // also create tasks (same permission, checked by the caller).
  canReassign?: boolean;
  assignableOwners?: AssignableOwner[];
  onAssigneeChange?: (task: TaskRowProps, owner: AssignableOwner) => void;
};

type SwipeStage = "actions" | "details";
type OpenSwipeRow = { index: number; stage: SwipeStage } | null;
type Metrics = ReturnType<typeof getTableMetrics>;
type StatusOverrides = Record<string, StatusType>;
type AssigneeOverride = { name: string; initials: string; avatar?: string };
type AssigneeOverrides = Record<string, AssigneeOverride>;

const ROW_HEIGHT = 35;
const DETAIL_ROW_HEIGHT = 85;
const ACTION_REVEAL_WIDTH = 176;
const ACTION_STRIP_HEIGHT = 35;
const ACTION_GRIP_WIDTH = (29 / 25) * ACTION_STRIP_HEIGHT;
const MAX_TABLE_WIDTH = 640;
const MIN_TABLE_WIDTH = 320;
const SWIPE_GREEN = "#00DFAB";

function getTaskKey(task: TaskRowProps, index: number) {
  return task.id ?? `${index}:${task.title}:${task.dueDate}`;
}

function clamp(value: number, min: number, max: number) {
  "worklet";
  return Math.min(max, Math.max(min, value));
}

function getTableMetrics(windowWidth: number) {
  // Governs the header bar, section header, and data columns (title/created
  // by/due date) — unchanged from the original symmetric 16px-each-side inset,
  // so none of that sizing shifts.
  const insetTableWidth = Math.max(
    MIN_TABLE_WIDTH,
    Math.min(windowWidth - 32, MAX_TABLE_WIDTH),
  );
  // The container's actual box width — on phones (the common, unclamped
  // case) this is the full window width so the row can be edge-flush on
  // BOTH sides: the closed row's chevron reaches the true right edge, and
  // the swiped-open "details" panel's back arrow reaches the true left
  // edge (it renders inside the parent tableShell's left padding via
  // `leftCompensation` below). On wide/web screens where this clamps to
  // MAX_TABLE_WIDTH, keep the original centered-card treatment instead.
  const naturalTableWidth = windowWidth;
  const tableWidth = Math.max(
    MIN_TABLE_WIDTH,
    Math.min(naturalTableWidth, MAX_TABLE_WIDTH),
  );
  const tableWidthClamped = tableWidth !== naturalTableWidth;
  // Only needed in the unclamped case — compensates the parent tableShell's
  // left padding so visible content (headers, row data) lands exactly where
  // it did before, while the container box itself now starts at the true
  // screen edge.
  const leftCompensation = tableWidthClamped ? 0 : 16;
  const innerPadding = 6;
  const contentWidth = insetTableWidth - innerPadding * 2;
  const leadingWidth = 32;
  const actionWidth = 26;
  const dataWidth = contentWidth - leadingWidth - actionWidth;
  const dueDateWidth = Math.max(105, Math.round(dataWidth * 0.32));
  const createdByWidth = Math.max(100, Math.round(dataWidth * 0.31));
  const titleWidth = Math.max(85, dataWidth - dueDateWidth - createdByWidth);

  return {
    tableWidth,
    tableWidthClamped,
    leftCompensation,
    innerPadding,
    leadingWidth,
    titleWidth,
    createdByWidth,
    dueDateWidth,
    actionWidth,
    // No separate cap — the "details" panel always spans the full row width
    // so its back-arrow always reaches the true left edge on every device
    // size, matching the closed row's chevron on the right.
    swipeContentWidth: tableWidth,
  };
}

const CustomPullToRefreshBadge = memo(function CustomPullToRefreshBadge({
  pullDistance,
  refreshing,
}: {
  pullDistance: SharedValue<number>;
  refreshing: boolean;
}) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (refreshing) {
      rotation.value = withRepeat(
        withTiming(360, { duration: 800, easing: Easing.linear }),
        -1,
        false,
      );
    } else {
      rotation.value = 0;
    }
  }, [refreshing, rotation]);

  const animStyle = useAnimatedStyle(() => {
    if (refreshing) {
      return {
        transform: [
          { translateY: 10 },
          { scale: 1 },
          { rotate: `${rotation.value}deg` },
        ],
        opacity: 1,
      };
    }
    const dist = pullDistance.value;
    const progress = Math.min(1, Math.max(0, dist / 60));
    const translateY = Math.min(20, dist * 0.35);
    const scale = 0.4 + progress * 0.6;
    const opacity = Math.min(1, dist / 20);
    const rot = progress * 180;

    return {
      transform: [{ translateY }, { scale }, { rotate: `${rot}deg` }],
      opacity,
    };
  });

  return (
    <Animated.View
      style={[styles.pullContainer, animStyle]}
      pointerEvents="none"
    >
      <View style={styles.pullBadge}>
        <Svg width={20} height={20} viewBox="0 0 32 32" fill="none">
          <Circle
            cx={16}
            cy={16}
            r={13}
            stroke="#00DEAB"
            strokeWidth={3}
            strokeDasharray="52 28"
            strokeLinecap="round"
          />
        </Svg>
      </View>
    </Animated.View>
  );
});

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
}: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const metrics = useMemo(() => getTableMetrics(windowWidth), [windowWidth]);
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
  const [previewRowIndex, setPreviewRowIndex] = useState<number | null>(null);
  if (sectionTitle !== lastSectionTitle) {
    setLastSectionTitle(sectionTitle);
    if (openSwipeRow !== null) setOpenSwipeRow(null);
    if (previewRowIndex !== null) setPreviewRowIndex(null);
  }
  const [isSwipeDragging, setIsSwipeDragging] = useState(false);
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
  useLayoutEffect(() => {
    rowsScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [sectionTitle]);

  const augmentedTasks = useMemo(
    () =>
      tasks.map((task, index) => {
        const key = getTaskKey(task, index);
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
    (task: TaskRowProps, rowIndex: number, owner: AssignableOwner) => {
      const displayName = getOwnerDisplayName(owner);
      setAssigneeOverrides((previous) => ({
        ...previous,
        [getTaskKey(task, rowIndex)]: {
          name: displayName.split(/\s+/)[0] ?? displayName,
          initials: getOwnerInitials(owner),
          avatar: owner.image ?? undefined,
        },
      }));
      onAssigneeChange?.(task, owner);
    },
    [onAssigneeChange],
  );

  const handleStatusChange = useCallback(
    (task: TaskRowProps, rowIndex: number, nextStatus: StatusType) => {
      if (task.canEditStatus === false) {
        showInfo("Not Allowed", "You don't have permission to change this task's status.");
        return;
      }
      triggerHaptic("success");
      setStatusOverrides((previous) => ({
        ...previous,
        [getTaskKey(task, rowIndex)]: nextStatus,
      }));
      onStatusChange?.(task, nextStatus);
    },
    [onStatusChange],
  );

  const handleToggleComplete = useCallback(
    (task: TaskRowProps, rowIndex: number) => {
      handleStatusChange(
        task,
        rowIndex,
        task.status === "Completed" ? "Pending" : "Completed",
      );
    },
    [handleStatusChange],
  );

  const openSwipe = useCallback((index: number, stage: SwipeStage) => {
    triggerHaptic("light");
    setOpenSwipeRow({ index, stage });
  }, []);

  const closeSwipe = useCallback(() => {
    setOpenSwipeRow(null);
  }, []);

  const shouldEnableRowScroll =
    rowContentHeight > rowViewportHeight + 1 && !isSwipeDragging;

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
      style={[
        styles.container,
        {
          width: metrics.tableWidth,
          alignSelf: metrics.tableWidthClamped ? "center" : "flex-end",
        },
      ]}
    >
      <View
        style={[styles.sectionHeader, { marginLeft: metrics.leftCompensation }]}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>{sectionTitle}</Text>
          {/* <View style={styles.syncSubRow}>
            <Animated.View style={refreshing ? syncIconAnimStyle : undefined}>
              <Ionicons
                name="sync-outline"
                size={12}
                color={refreshing ? "#00DEAB" : "#9CA3AF"}
              />
            </Animated.View>
            <Text
              style={[
                styles.syncSubText,
                refreshing && styles.syncSubTextActive,
              ]}
            >
              {refreshing ? "Syncing tasks..." : `Updated ${timeAgoText}`}
            </Text>
          </View> */}
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
        <Text style={[styles.colHead, { width: metrics.titleWidth }]}>
          Task Title
        </Text>
        <Text style={[styles.colHead, { width: metrics.createdByWidth }]}>
          Created By
        </Text>
        <Text style={[styles.colHead, { width: metrics.dueDateWidth }]}>
          Due Date
        </Text>
        <View style={{ width: metrics.actionWidth }} />
      </View>

      {/* Custom Pull-To-Refresh Badge */}
      <CustomPullToRefreshBadge
        pullDistance={pullDistance}
        refreshing={refreshing}
      />

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
        onContentSizeChange={(_width, height) => setRowContentHeight(height)}
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
              progressViewOffset={Platform.OS === "android" ? -1000 : undefined}
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
          ? augmentedTasks.map((task, rowIndex) => (
              <SwipeTaskRow
                key={getTaskKey(task, rowIndex)}
                item={task}
                rowIndex={rowIndex}
                metrics={metrics}
                isOpen={openSwipeRow?.index === rowIndex}
                stage={
                  openSwipeRow?.index === rowIndex ? openSwipeRow.stage : null
                }
                onOpenSwipe={openSwipe}
                onCloseSwipe={closeSwipe}
                onSwipeDragStateChange={setIsSwipeDragging}
                onTaskPress={onTaskPress}
                onCommentPress={onCommentPress}
                onToggleComplete={handleToggleComplete}
                onStatusChange={handleStatusChange}
                isPreviewOpen={previewRowIndex === rowIndex}
                onPreviewStart={() => setPreviewRowIndex(rowIndex)}
                onPreviewEnd={() => setPreviewRowIndex(null)}
                canReassign={canReassign}
                assignableOwners={assignableOwners}
                onAssigneeSelect={(owner) =>
                  handleAssigneeChange(task, rowIndex, owner)
                }
                scrollCloseSignal={scrollCloseSignal}
              />
            ))
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
    </View>
  );
}

export default memo(SingleTaskTable);

const WAVE_BADGE_WIDTH = 10;
const WAVE_BADGE_HEIGHT = 30;

// RightWaveIcon's flat edge is on the right (matches the row's closed-state
// chevron, clipped by the screen's right edge, bulging left into the row).
// LeftWaveIcon is its mirror — flat edge on the left, for the swipe-details
// panel's back button. Both already have their arrow glyph baked into the
// asset, so no separate Ionicons overlay is needed.
function WaveChevronBadge({ mirrored = false }: { mirrored?: boolean }) {
  const WaveIcon = mirrored ? LeftWaveIcon : RightWaveIcon;
  return <WaveIcon width={WAVE_BADGE_WIDTH} height={WAVE_BADGE_HEIGHT} />;
}

const SwipeTaskRow = memo(function SwipeTaskRow({
  item,
  rowIndex,
  metrics,
  isOpen,
  stage,
  onOpenSwipe,
  onCloseSwipe,
  onSwipeDragStateChange,
  onTaskPress,
  onCommentPress,
  onToggleComplete,
  onStatusChange,
  isPreviewOpen,
  onPreviewStart,
  onPreviewEnd,
  canReassign,
  assignableOwners,
  onAssigneeSelect,
  scrollCloseSignal,
}: {
  item: TaskRowProps;
  rowIndex: number;
  metrics: Metrics;
  isOpen: boolean;
  stage: SwipeStage | null;
  onOpenSwipe: (rowIndex: number, stage: SwipeStage) => void;
  onCloseSwipe: () => void;
  onSwipeDragStateChange: (dragging: boolean) => void;
  onTaskPress?: (task: TaskRowProps) => void;
  onCommentPress?: (task: TaskRowProps) => void;
  onToggleComplete: (task: TaskRowProps, rowIndex: number) => void;
  onStatusChange: (
    task: TaskRowProps,
    rowIndex: number,
    status: StatusType,
  ) => void;
  isPreviewOpen: boolean;
  scrollCloseSignal?: number;
  onPreviewStart: () => void;
  onPreviewEnd: () => void;
  canReassign?: boolean;
  assignableOwners?: AssignableOwner[];
  onAssigneeSelect: (owner: AssignableOwner) => void;
}) {
  const translateX = useSharedValue(0);
  const gestureStartX = useSharedValue(0);
  const wrapHeight = useSharedValue(ROW_HEIGHT);
  const hasStarted = useSharedValue(false);
  const currentStage = isOpen ? stage : null;
  const revealWidth =
    currentStage === "details"
      ? metrics.swipeContentWidth
      : currentStage === "actions"
        ? ACTION_REVEAL_WIDTH
        : 0;
  const rowHeight =
    currentStage === "details"
      ? DETAIL_ROW_HEIGHT
      : currentStage === "actions"
        ? ROW_HEIGHT + 32
        : ROW_HEIGHT;

  useEffect(() => {
    const springConfig = {
      damping: 24,
      stiffness: 260,
      mass: 0.85,
      overshootClamping: true,
    };
    translateX.value = withSpring(-revealWidth, springConfig);
    wrapHeight.value = withSpring(rowHeight, springConfig);
  }, [revealWidth, rowHeight, translateX, wrapHeight]);

  const animatedWrapStyle = useAnimatedStyle(() => ({
    minHeight: wrapHeight.value,
  }));

  const settleSwipe = useCallback(
    (nextStage: SwipeStage | null) => {
      if (nextStage) {
        onOpenSwipe(rowIndex, nextStage);
      } else {
        onCloseSwipe();
      }
    },
    [onCloseSwipe, onOpenSwipe, rowIndex],
  );

  const animatedRowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-12, 12])
        .failOffsetY([-18, 18])
        .onBegin(() => {
          // eslint-disable-next-line react-hooks/immutability
          gestureStartX.value = translateX.value;
        })
        .onStart((event) => {
          // eslint-disable-next-line react-hooks/immutability
          hasStarted.value = true;
          if (!isOpen && event.translationX > 0) return;
          runOnJS(onSwipeDragStateChange)(true);
        })
        .onUpdate((event) => {
          if (!isOpen && event.translationX > 0) return;
          // eslint-disable-next-line react-hooks/immutability
          translateX.value = clamp(
            gestureStartX.value + event.translationX,
            -metrics.swipeContentWidth,
            0,
          );
        })
        .onFinalize((event) => {
          runOnJS(onSwipeDragStateChange)(false);
          // Skip settling if the gesture never actually activated (e.g. a
          // tap that stayed under the activeOffsetX threshold) — otherwise
          // a stray touch could snap an already-resting row.
          if (!hasStarted.value) return;

          // eslint-disable-next-line react-hooks/immutability
          hasStarted.value = false;
          // Always runs — even when the ScrollView/list steals the gesture
          // mid-swipe (fail/cancel) — so the row can't get stuck half-open
          // with no matching onEnd to snap it into a resting position.
          const releaseX = clamp(
            gestureStartX.value + event.translationX,
            -metrics.swipeContentWidth,
            0,
          );
          const projectedX = clamp(
            releaseX + event.velocityX * 0.06,
            -metrics.swipeContentWidth,
            0,
          );

          if (event.velocityX > 400 || projectedX > -40) {
            runOnJS(settleSwipe)(null);
            return;
          }

          if (
            gestureStartX.value < -ACTION_REVEAL_WIDTH * 1.2 &&
            projectedX > -metrics.swipeContentWidth * 0.65
          ) {
            if (projectedX > -ACTION_REVEAL_WIDTH * 0.8) {
              runOnJS(settleSwipe)(null);
            } else {
              runOnJS(settleSwipe)("actions");
            }
            return;
          }

          if (projectedX < -metrics.swipeContentWidth * 0.6) {
            runOnJS(settleSwipe)("details");
            return;
          }

          if (projectedX < -ACTION_REVEAL_WIDTH * 0.35) {
            runOnJS(settleSwipe)("actions");
            return;
          }

          runOnJS(settleSwipe)(null);
        }),
    [
      gestureStartX,
      hasStarted,
      isOpen,
      metrics.swipeContentWidth,
      onSwipeDragStateChange,
      settleSwipe,
      translateX,
    ],
  );

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={[
          styles.rowWrap,
          animatedWrapStyle,
          { zIndex: isOpen ? 1000 - rowIndex : 1 },
        ]}
      >
        <Animated.View
          style={[
            styles.swipeContent,
            animatedWrapStyle,
            {
              width: metrics.swipeContentWidth,
              overflow: currentStage === "details" ? "visible" : "hidden",
            },
          ]}
        >
          <TaskSwipeContent
            item={item}
            stage={currentStage ?? "actions"}
            onClose={onCloseSwipe}
            onBackToActions={() => onOpenSwipe(rowIndex, "actions")}
            onRevealDetails={() => onOpenSwipe(rowIndex, "details")}
            onStatusSelect={(nextStatus) =>
              onStatusChange(item, rowIndex, nextStatus)
            }
            onCommentPress={onCommentPress}
            canReassign={canReassign}
            assignableOwners={assignableOwners}
            onAssigneeSelect={onAssigneeSelect}
            scrollCloseSignal={scrollCloseSignal}
          />
        </Animated.View>

        <Animated.View style={animatedRowStyle}>
          <View
            style={[
              styles.row,
              {
                minHeight: ROW_HEIGHT,
                paddingLeft: metrics.innerPadding + metrics.leftCompensation,
              },
            ]}
          >
            <LeadingCell
              item={item}
              width={metrics.leadingWidth}
              isExpanded={isPreviewOpen}
              onToggle={() => onToggleComplete(item, rowIndex)}
            />
            <TaskCellContent
              item={item}
              columnKey="title"
              width={metrics.titleWidth}
              onPress={() => onTaskPress?.(item)}
              onLongPressStart={onPreviewStart}
              onLongPressEnd={onPreviewEnd}
            />
            <TaskCellContent
              item={item}
              columnKey="createdBy"
              width={metrics.createdByWidth}
            />
            <TaskCellContent
              item={item}
              columnKey="dueDate"
              width={metrics.dueDateWidth}
            />
            {currentStage === null && (
              <TouchableOpacity
                style={styles.actionPress}
                onPress={() => onOpenSwipe(rowIndex, "actions")}
                activeOpacity={0.8}
              >
                <WaveChevronBadge />
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
});

const LeadingCell = memo(function LeadingCell({
  item,
  width,
  isExpanded,
  onToggle,
}: {
  item: TaskRowProps;
  width: number;
  isExpanded?: boolean;
  onToggle: () => void;
}) {
  const isCompleted = item.status === "Completed";
  const canToggle = item.canEditStatus !== false;
  const priority = item.taskPriority?.toLowerCase() ?? "normal";

  const priorityLabel =
    item.priorityName ||
    (priority === "critical"
      ? "Critical"
      : priority === "high"
        ? "High"
        : priority === "medium"
          ? "Medium"
          : priority === "low"
            ? "Low"
            : "Normal");

  const accentColor =
    priority === "critical"
      ? "#FF4D4F"
      : priority === "high"
        ? "#FF9500"
        : priority === "medium"
          ? "#F59E0B"
          : priority === "low"
            ? "#3B82F6"
            : "#0DDFAB";

  return (
    <View style={[styles.leadingCell, { width }]}>
      {isExpanded ? (
        <Animated.View
          entering={FadeIn.duration(120)}
          exiting={FadeOut.duration(120)}
          style={[styles.accentExpandedBadge, { backgroundColor: accentColor }]}
        >
          <Text style={styles.accentExpandedText}>{priorityLabel}</Text>
        </Animated.View>
      ) : (
        <View style={[styles.accent, { backgroundColor: accentColor }]} />
      )}

      <TouchableOpacity
        style={[styles.checkboxWrap, !canToggle && { opacity: 0.5 }]}
        onPress={() => {
          triggerHaptic("success");
          onToggle();
        }}
        activeOpacity={0.7}
      >
        {isCompleted ? (
          <View style={styles.checkCircle}>
            <Ionicons name="checkmark" size={15} color="#fff" />
          </View>
        ) : (
          <View style={styles.checkbox} />
        )}
      </TouchableOpacity>
    </View>
  );
});

const TaskCellContent = memo(function TaskCellContent({
  item,
  columnKey,
  width,
  onPress,
  onLongPressStart,
  onLongPressEnd,
}: {
  item: TaskRowProps;
  columnKey: "title" | "createdBy" | "dueDate";
  width: number;
  onPress?: () => void;
  onLongPressStart?: () => void;
  onLongPressEnd?: () => void;
}) {
  const isCompleted = item.status === "Completed";

  if (columnKey === "title") {
    return (
      <TouchableOpacity
        style={[styles.titleCell, { width }]}
        onPressIn={() => {
          triggerHaptic("light");
          onLongPressStart?.();
        }}
        onPressOut={() => {
          onLongPressEnd?.();
        }}
        onPress={() => {
          onPress?.();
        }}
        activeOpacity={0.7}
      >
        <Text
          style={[styles.titleText, isCompleted && styles.strikethrough]}
          numberOfLines={1}
        >
          {item.title}
        </Text>
      </TouchableOpacity>
    );
  }

  if (columnKey === "createdBy") {
    return (
      <TouchableOpacity
        style={[styles.userCell, { width }]}
        onPress={() => {
          triggerHaptic("light");
          onPress?.();
        }}
        activeOpacity={0.7}
      >
        <Avatar
          name={item.createdBy}
          imagePath={item.createdByAvatar}
          size={24}
          borderRadius={6}
          fontSize={10}
          style={styles.avatarImage}
        />
        <Text style={styles.cellText} numberOfLines={1}>
          {item.createdBy}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.dateCell, { width }]}
      onPress={() => {
        triggerHaptic("light");
        onPress?.();
      }}
      activeOpacity={0.7}
    >
      <Ionicons
        name="calendar-outline"
        size={16}
        color="#00DEAB"
        style={styles.dateIcon}
      />
      <Text style={styles.cellText} numberOfLines={1}>
        {item.dueDate}
      </Text>
    </TouchableOpacity>
  );
});

const TaskStatusDropdown = memo(function TaskStatusDropdown({
  currentStatus,
  onSelect,
}: {
  currentStatus: StatusType;
  onSelect: (status: StatusType) => void;
}) {
  return (
    <>
      {ALL_STATUSES.filter(
        (s) => s !== "Pending-Approval" && s !== "Recurring",
      ).map((status) => {
        const color = STATUS_COLORS[status]?.text ?? "#6B7280";
        const isActive = status === currentStatus;

        return (
          <TouchableOpacity
            key={status}
            style={[styles.dropdownItem, isActive && styles.dropdownItemActive]}
            onPress={() => {
              triggerHaptic("selection");
              onSelect(status);
            }}
            activeOpacity={0.8}
          >
            {/* <View style={[styles.dot, { backgroundColor: color }]} /> */}
            <Text
              style={[styles.dropdownText, { color }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {status}
            </Text>
            {isActive ? (
              <Ionicons name="checkmark" size={13} color={color} />
            ) : null}
          </TouchableOpacity>
        );
      })}
    </>
  );
});

const AssigneeDropdown = memo(function AssigneeDropdown({
  currentAssigneeName,
  owners,
  onSelect,
}: {
  currentAssigneeName: string;
  owners: AssignableOwner[];
  onSelect: (owner: AssignableOwner) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredOwners = useMemo(() => {
    if (!searchQuery.trim()) return owners;
    const q = searchQuery.toLowerCase().trim();
    return owners.filter((owner) => {
      const name = getOwnerDisplayName(owner).toLowerCase();
      return name.includes(q);
    });
  }, [owners, searchQuery]);

  return (
    <View style={styles.assigneeDropdownContainer}>
      <View style={styles.assigneeSearchRow}>
        <Ionicons name="search-outline" size={12} color="#9CA3AF" />
        <TextInput
          style={styles.assigneeSearchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search..."
          placeholderTextColor="#9CA3AF"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <Ionicons name="close-circle" size={12} color="#9CA3AF" />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        style={styles.assigneeDropdownScroll}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {filteredOwners.length === 0 ? (
          <View style={styles.noUserRow}>
            <Text style={styles.noUserText}>No user found</Text>
          </View>
        ) : (
          filteredOwners.map((owner) => {
            const name = getOwnerDisplayName(owner);
            const isActive = name.split(/\s+/)[0] === currentAssigneeName;

            return (
              <TouchableOpacity
                key={owner.id}
                style={[styles.dropdownItem, isActive && styles.dropdownItemActive]}
                onPress={() => onSelect(owner)}
                activeOpacity={0.8}
              >
                <Avatar
                  name={name}
                  imagePath={owner.image}
                  size={20}
                  borderRadius={5}
                  fontSize={9}
                />
                <Text style={styles.assigneeDropdownText} numberOfLines={1}>
                  {name}
                </Text>
                {isActive ? (
                  <Ionicons name="checkmark" size={12} color="#0DDFAB" />
                ) : null}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
});

const TaskSwipeContent = memo(function TaskSwipeContent({
  item,
  stage,
  onClose,
  onBackToActions,
  onRevealDetails,
  onStatusSelect,
  onCommentPress,
  canReassign,
  assignableOwners,
  onAssigneeSelect,
  scrollCloseSignal,
}: {
  item: TaskRowProps;
  stage: SwipeStage;
  onClose: () => void;
  onBackToActions: () => void;
  onRevealDetails: () => void;
  onStatusSelect: (status: StatusType) => void;
  onCommentPress?: (task: TaskRowProps) => void;
  canReassign?: boolean;
  assignableOwners?: AssignableOwner[];
  onAssigneeSelect: (owner: AssignableOwner) => void;
  scrollCloseSignal?: number;
}) {
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);

  useEffect(() => {
    if (stage !== "details") {
      setStatusPickerOpen(false);
      setAssigneePickerOpen(false);
    }
  }, [stage]);

  // Close whichever picker is open the moment the list starts scrolling —
  // it's not anchored to the row, so otherwise it stays floating in place
  // while the row it belongs to scrolls away underneath it.
  useEffect(() => {
    setStatusPickerOpen(false);
    setAssigneePickerOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollCloseSignal]);
  const colors = STATUS_COLORS[item.status] ?? {
    bg: "#FEF3C7",
    text: "#D97706",
  };
  const actionStatusLabel = item.status;
  const actionStatusColor = colors.text;
  const canChangeStatus = item.canEditStatus !== false;

  if (stage === "actions") {
    return (
      <View style={styles.swipePanel}>
        <View style={styles.actionStrip}>
          <TouchableOpacity
            style={styles.actionGrip}
            onPress={onClose}
            activeOpacity={0.8}
          >
            <HalfSwipeIcon
              width={ACTION_GRIP_WIDTH}
              height={ACTION_STRIP_HEIGHT}
            />
          </TouchableOpacity>
          <View style={styles.actionButtonsBox}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={onRevealDetails}
              activeOpacity={0.8}
            >
              <Text style={styles.actionText}>More</Text>
            </TouchableOpacity>
            <View style={styles.actionButton}>
              <Text style={styles.actionText}>Status</Text>
            </View>
          </View>
        </View>

        <View style={[styles.actionStatusBox, { backgroundColor: colors.bg }]}>
          <Text
            style={[styles.actionStatusBoxText, { color: colors.text }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {item.status}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.swipePanel}>
      <View style={styles.swipeHeaderRow}>
        <TouchableOpacity
          style={styles.detailsBackButton}
          onPress={onBackToActions}
          activeOpacity={0.8}
        >
          <WaveChevronBadge mirrored />
        </TouchableOpacity>
        <View style={styles.swipeHeaderInner}>
          <Text style={[styles.swipeHeaderText, styles.swipeAssignedColumn]}>
            Assigned to
          </Text>
          <Text style={[styles.swipeHeaderText, styles.swipeStatusColumn]}>
            Status
          </Text>
          <Text style={[styles.swipeHeaderText, styles.swipeCommentColumn]}>
            Comment
          </Text>
        </View>
      </View>

      <View style={styles.swipeValues}>
        {canReassign && assignableOwners && assignableOwners.length > 0 ? (
          <TouchableOpacity
            style={[styles.swipeUserCell, styles.swipeAssignedColumn]}
            onPress={() => setAssigneePickerOpen((value) => !value)}
            activeOpacity={0.8}
          >
            <Avatar
              name={item.assignedTo}
              imagePath={item.assignedToAvatar}
              size={24}
              borderRadius={6}
              backgroundColor="#00DEAB"
              fontSize={10}
              style={styles.initialsAssignee}
            />
            <Text style={styles.cellText} numberOfLines={1}>
              {item.assignedTo}
            </Text>
            <Ionicons
              name={assigneePickerOpen ? "chevron-up" : "chevron-down"}
              size={12}
              color="#6B7280"
            />
          </TouchableOpacity>
        ) : (
          <View style={[styles.swipeUserCell, styles.swipeAssignedColumn]}>
            <Avatar
              name={item.assignedTo}
              imagePath={item.assignedToAvatar}
              size={24}
              borderRadius={6}
              backgroundColor="#00DEAB"
              fontSize={10}
              style={styles.initialsAssignee}
            />
            <Text style={styles.cellText} numberOfLines={1}>
              {item.assignedTo}
            </Text>
          </View>
        )}

        <View style={styles.swipeStatusColumn}>
          {canChangeStatus ? (
            <TouchableOpacity
              style={[styles.swipeStatusCell, { backgroundColor: colors.bg }]}
              onPress={() => setStatusPickerOpen((value) => !value)}
              activeOpacity={0.8}
            >
              <Text
                style={[styles.swipeStatusText, { color: colors.text }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {item.status}
              </Text>
              <Ionicons
                name={statusPickerOpen ? "chevron-up" : "chevron-down"}
                size={13}
                color={colors.text}
              />
            </TouchableOpacity>
          ) : (
            <View
              style={[styles.swipeStatusCell, { backgroundColor: colors.bg }]}
            >
              <Text
                style={[styles.swipeStatusText, { color: colors.text }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {item.status}
              </Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[styles.swipeCommentCell, styles.swipeCommentColumn]}
          onPress={() => onCommentPress?.(item)}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chatbox-outline" size={18} color="#00DEAB" />
        </TouchableOpacity>
      </View>

      {statusPickerOpen ? (
        <>
          <Pressable
            style={styles.dropdownBackdrop}
            onPress={() => setStatusPickerOpen(false)}
          />
          <View style={styles.swipeDropdown}>
            <TaskStatusDropdown
              currentStatus={item.status}
              onSelect={(status) => {
                onStatusSelect(status);
                setStatusPickerOpen(false);
              }}
            />
          </View>
        </>
      ) : null}

      {assigneePickerOpen && assignableOwners && assignableOwners.length > 0 ? (
        <>
          <Pressable
            style={styles.dropdownBackdrop}
            onPress={() => setAssigneePickerOpen(false)}
          />
          <View style={styles.assigneeDropdown}>
            <AssigneeDropdown
              currentAssigneeName={item.assignedTo}
              owners={assignableOwners}
              onSelect={(owner) => {
                onAssigneeSelect(owner);
                setAssigneePickerOpen(false);
              }}
            />
          </View>
        </>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignSelf: "center",
  },
  pullContainer: {
    position: "absolute",
    top: 72,
    alignSelf: "center",
    zIndex: 9999,
  },
  pullBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
    marginRight: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "SF_Pro_Medium",
    color: "#1F2937",
  },
  syncSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  syncSubText: {
    fontSize: 12,
    fontFamily: "SF_Pro_Regular",
    color: "#9CA3AF",
  },
  syncSubTextActive: {
    color: "#00DEAB",
    fontFamily: "SF_Pro_Medium",
  },
  filterBtn: {
    width: 35,
    height: 35,
    borderRadius: 8,
    backgroundColor: "#E6E6E6",
    alignItems: "center",
    justifyContent: "center",
  },
  filterBtnPressed: {
    backgroundColor: "#00DEAB",
  },
  filterBtnActive: {
    backgroundColor: "#00DEAB",
  },
  filterBadge: {
    position: "absolute",
    top: -14,
    right: -14,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#1D1D1D",
    alignItems: "center",
    justifyContent: "center",
  },
  filterBadgeText: {
    fontSize: 9,
    fontFamily: "SF_Pro_Bold",
    color: "#0DDFAB",
  },
  tableHeader: {
    height: 26,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E5E7EB",
    borderRadius: 4,
    marginBottom: 4,
    marginRight: 16,
  },
  colHead: {
    fontSize: 10,
    fontFamily: "SF_Pro_Bold",
    fontWeight: "700",
    color: "#1D1D1D",
    textAlign: "left",
  },
  rowsScroll: {
    flex: 1,
  },
  rowsScrollContent: {
    paddingBottom: 110,
  },
  rowWrap: {
    position: "relative",
  },
  previewTooltip: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: "100%",
    marginBottom: 6,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F3F4F6",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  previewPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
  },
  previewPillText: {
    fontSize: 13,
    fontFamily: "SF_Pro_Bold",
    color: "#FFFFFF",
  },
  previewTitleText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
  },
  swipeContent: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    minHeight: ROW_HEIGHT,
    zIndex: 0,
    elevation: 0,
    backgroundColor: "transparent",
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    backgroundColor: "#fff",
  },
  leadingCell: {
    height: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
  },
  accentExpandedBadge: {
    position: "absolute",
    left: 0,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
    zIndex: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  accentExpandedText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontFamily: "SF_Pro_Bold",
  },
  accent: {
    position: "absolute",
    left: 0,
    width: 3.5,
    height: 25,
    borderRadius: 4,
  },
  checkboxWrap: {
    flex: 1,
    height: ROW_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  checkCircle: {
    width: 17,
    height: 17,
    borderRadius: 3,
    backgroundColor: "#00DEAB",
    alignItems: "center",
    justifyContent: "center",
  },
  checkbox: {
    width: 17,
    height: 17,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#F0F0F0",
    backgroundColor: "#fff",
  },
  titleCell: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 8,
  },
  titleText: {
    minWidth: 0,
    flexShrink: 1,
    fontSize: 11,
    color: "#1F2937",
    fontFamily: "SF_Pro_Medium",
  },
  strikethrough: {
    color: "#9CA3AF",
    textDecorationLine: "line-through",
  },
  userCell: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 6,
  },
  avatarImage: {
    marginRight: 6,
  },
  initialsAssignee: {
    marginRight: 6,
  },
  initialsText: { fontSize: 9, fontWeight: "700", color: "#fff" },
  cellText: {
    minWidth: 0,
    flexShrink: 1,
    fontSize: 10.5,
    color: "#1F2937",
    fontFamily: "SF_Pro_Medium",
  },
  dateCell: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 6,
  },
  dateIcon: {
    marginRight: 5,
  },
  actionPress: {
    width: WAVE_BADGE_WIDTH,
    height: ROW_HEIGHT,
    alignItems: "flex-start",
    justifyContent: "center",
    // Floats to the row's true right edge regardless of how wide the data
    // columns are — WaveChevronBadge's own shape already has a flat right
    // edge, so no separate clipping is needed here.
    marginLeft: "auto",
  },
  swipePanel: {
    flex: 1,
    minHeight: ROW_HEIGHT,
    backgroundColor: "transparent",
    position: "relative",
    overflow: "visible",
  },
  actionStrip: {
    position: "absolute",
    top: 0,
    right: 0,
    width: ACTION_REVEAL_WIDTH,
    height: ACTION_STRIP_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: ACTION_GRIP_WIDTH - 1,
    paddingRight: 8,
    overflow: "hidden",
  },
  actionGrip: {
    position: "absolute",
    left: 0,
    top: 0,
    width: ACTION_GRIP_WIDTH,
    height: ACTION_STRIP_HEIGHT,
  },
  actionButtonsBox: {
    flex: 1,
    height: ACTION_STRIP_HEIGHT,
    flexDirection: "row",
    backgroundColor: SWIPE_GREEN,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    overflow: "hidden",
  },
  actionButton: {
    flex: 1,
    height: ACTION_STRIP_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: {
    fontSize: 12,
    color: "#050505",
    fontFamily: "SF_Pro_Medium",
  },
  actionStatusBox: {
    position: "absolute",
    top: ACTION_STRIP_HEIGHT + 4,
    right: 8,
    minHeight: 27,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  actionStatusBoxText: {
    fontSize: 11.5,
    fontFamily: "SF_Pro_Medium",
  },
  actionDropdown: {
    position: "absolute",
    top: ACTION_STRIP_HEIGHT - 1,
    right: 6,
    width: 160,
    zIndex: 9999,
    elevation: 9999,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    overflow: "hidden",
  },
  swipeHeaderRow: {
    height: 37,
    flexDirection: "row",
    alignItems: "center",
  },
  swipeHeaderInner: {
    flex: 1,
    height: 37,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 10,
    paddingRight: 10,
    backgroundColor: "#00DEAB",
    borderRadius: 8,
  },
  detailsBackButton: {
    // WaveChevronBadge's own shape has a flat left edge (mirrored) — sits on
    // the plain panel background, outside the green heading box, with a
    // small gap before it (matches the reference design).
    width: WAVE_BADGE_WIDTH,
    height: 37,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  swipeHeaderText: {
    fontSize: 12.5,
    color: "#050505",
    fontFamily: "SF_Pro_Medium",
  },
  swipeAssignedColumn: {
    flex: 1,
    minWidth: 82,
  },
  swipeStatusColumn: {
    flex: 1,
    minWidth: 70,
  },
  swipeCommentColumn: {
    flex: 1,
    minWidth: 66,
  },
  swipeValues: {
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    // Left inset matches the header's own leading offset (detailsBackButton
    // width + its marginRight, plus swipeHeaderInner's own paddingLeft) so
    // the "Assigned to/Status/Comment" headings line up with the cells below them.
    paddingLeft: WAVE_BADGE_WIDTH + 6 + 10,
    paddingRight: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  swipeUserCell: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 6,
  },
  swipeStatusCell: {
    minHeight: 30,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  swipeStatusText: {
    flex: 1,
    minWidth: 0,
    fontSize: 11.5,
    fontWeight: "600",
    marginRight: 2,
  },
  swipeCommentCell: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 8,
  },
  dropdownBackdrop: {
    position: "absolute",
    top: -500,
    bottom: -500,
    left: -500,
    right: -500,
    zIndex: 9990,
    backgroundColor: "transparent",
  },
  swipeDropdown: {
    position: "absolute",
    top: 52,
    left: 95,
    width: 130,
    zIndex: 9999,
    elevation: 9999,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    overflow: "hidden",
  },
  assigneeDropdown: {
    position: "absolute",
    top: 52,
    left: WAVE_BADGE_WIDTH + 6,
    width: 190,
    zIndex: 9999,
    elevation: 9999,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    overflow: "hidden",
  },
  assigneeDropdownContainer: {
    paddingBottom: 2,
  },
  assigneeSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 6,
    marginHorizontal: 6,
    marginTop: 6,
    marginBottom: 4,
    paddingHorizontal: 6,
    height: 26,
    gap: 4,
  },
  assigneeSearchInput: {
    flex: 1,
    fontSize: 11,
    fontFamily: "SF_Pro_Regular",
    color: "#1D1D1D",
    padding: 0,
    height: 26,
  },
  noUserRow: {
    paddingVertical: 10,
    alignItems: "center",
  },
  noUserText: {
    fontSize: 11,
    color: "#9CA3AF",
    fontFamily: "SF_Pro_Regular",
  },
  assigneeDropdownScroll: {
    maxHeight: 180,
  },
  assigneeDropdownAvatar: {
    width: 20,
    height: 20,
    borderRadius: 5,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  assigneeDropdownAvatarText: {
    fontSize: 9,
    fontFamily: "SF_Pro_Bold",
    color: "#374151",
  },
  assigneeDropdownText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 11,
    fontFamily: "SF_Pro_Regular",
    color: "#1F2937",
  },
  dropdownItem: {
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F9FAFB",
  },
  dropdownItemActive: {
    backgroundColor: "#F0FDF9",
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 4,
    marginRight: 5,
  },
  dropdownText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "SF_Pro_Regular",
  },
  centeredState: {
    paddingVertical: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 13,
    color: "#9CA3AF",
    fontFamily: "SF_Pro_Regular",
  },
  footerState: {
    paddingVertical: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  footerText: {
    fontSize: 12,
    color: "#9CA3AF",
    fontFamily: "SF_Pro_Regular",
  },
});
