// Swipeable task row (gesture + closed/actions/details states). Extracted from
// SingleTaskTable with no behaviour change (AUD-080).

import { StatusType, TaskRowProps } from "@/components/TaskRow";
import { renderCounters } from "@/features/tasks/dev/counters";
import { resolveSwipeSettle } from "@/features/tasks/utils/taskSwipeSettle";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { TouchableOpacity, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import {
  ACTION_REVEAL_WIDTH,
  DETAIL_ROW_HEIGHT,
  ROW_HEIGHT,
  clamp,
  type AssignableOwner,
  type SingleTaskTableColumn,
  type TableMetrics,
} from "./taskTableLayout";
import { taskTableStyles as styles } from "./taskTableStyles";
import { TaskCellContent } from "./TaskRowCells";
import { LeadingCell } from "./TaskRowLeadingCell";
import { TaskSwipeContent } from "./TaskSwipeContent";
import { WaveChevronBadge } from "./TaskTablePrimitives";

export type SwipeStage = "actions" | "details";

const SWIPE_SPRING = {
  damping: 24,
  stiffness: 260,
  mass: 0.85,
  overshootClamping: true,
};

export const SwipeTaskRow = memo(function SwipeTaskRow({
  item,
  taskKey,
  rowIndex,
  metrics,
  isOpen,
  stage,
  onOpenSwipe,
  onCloseSwipe,
  onTaskPress,
  onCommentPress,
  onToggleComplete,
  onStatusChange,
  canReassign,
  assignableOwners,
  onAssigneeChange,
  canAssignProject,
  onAddToProjectPress,
  onSprintPress,
  onRemoveTask,
  swipeVariant = "default",
  scrollCloseSignal,
  columns,
  readOnly,
}: {
  item: TaskRowProps;
  taskKey: string;
  rowIndex: number;
  metrics: TableMetrics;
  isOpen: boolean;
  stage: SwipeStage | null;
  onOpenSwipe: (taskKey: string, stage: SwipeStage) => void;
  onCloseSwipe: () => void;
  onTaskPress?: (task: TaskRowProps) => void;
  onCommentPress?: (task: TaskRowProps) => void;
  onToggleComplete: (task: TaskRowProps) => void;
  onStatusChange: (task: TaskRowProps, status: StatusType) => void;
  scrollCloseSignal?: number;
  canReassign?: boolean;
  assignableOwners?: AssignableOwner[];
  onAssigneeChange: (task: TaskRowProps, owner: AssignableOwner) => void;
  canAssignProject?: boolean;
  onAddToProjectPress?: (task: TaskRowProps) => void;
  onSprintPress?: (task: TaskRowProps) => void;
  onRemoveTask?: (task: TaskRowProps) => void;
  swipeVariant?: "default" | "project";
  columns: SingleTaskTableColumn[];
  readOnly?: boolean;
}) {
  renderCounters.row(item.id ?? item.title);
  const translateX = useSharedValue(0);
  const gestureStartX = useSharedValue(0);
  const wrapHeight = useSharedValue(ROW_HEIGHT);
  const hasStarted = useSharedValue(false);
  const isDragging = useSharedValue(false);
  const isOpenValue = useSharedValue(isOpen);
  const hasMountedRef = useRef(false);
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
    isOpenValue.value = isOpen;
  }, [isOpen, isOpenValue]);

  useEffect(() => {
    // Do not fight the live gesture. The finalize handler snaps immediately on
    // the UI thread; this effect handles state driven from outside the gesture.
    if (isDragging.value) return;
    if (!hasMountedRef.current) {
      // Avoid scheduling a spring for every row that mounts while scrolling.
      hasMountedRef.current = true;
      translateX.value = -revealWidth;
      wrapHeight.value = rowHeight;
      return;
    }
    translateX.value = withSpring(-revealWidth, SWIPE_SPRING);
    wrapHeight.value = withSpring(rowHeight, SWIPE_SPRING);
  }, [revealWidth, rowHeight, translateX, wrapHeight, isDragging]);

  const animatedWrapStyle = useAnimatedStyle(() => ({
    minHeight: wrapHeight.value,
  }));

  const settleSwipe = useCallback(
    (nextStage: SwipeStage | null) => {
      if (nextStage) {
        onOpenSwipe(taskKey, nextStage);
      } else {
        onCloseSwipe();
      }
    },
    [onCloseSwipe, onOpenSwipe, taskKey],
  );

  const handleAssigneeSelect = useCallback(
    (owner: AssignableOwner) => onAssigneeChange(item, owner),
    [item, onAssigneeChange],
  );

  const handleBackToActions = useCallback(
    () => onOpenSwipe(taskKey, "actions"),
    [onOpenSwipe, taskKey],
  );

  const handleRevealDetails = useCallback(
    () => onOpenSwipe(taskKey, "details"),
    [onOpenSwipe, taskKey],
  );

  const handleStatusSelect = useCallback(
    (nextStatus: StatusType) => onStatusChange(item, nextStatus),
    [item, onStatusChange],
  );

  const animatedRowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-12, 12])
        .failOffsetY([-20, 20])
        .onBegin(() => {
          cancelAnimation(translateX);
          cancelAnimation(wrapHeight);
          isDragging.value = true;
          gestureStartX.value = translateX.value;
        })
        .onStart((event) => {
          if (!isOpenValue.value && event.translationX > 0) return;
          hasStarted.value = true;
        })
        .onUpdate((event) => {
          if (!isOpenValue.value && event.translationX > 0) return;
          translateX.value = clamp(
            gestureStartX.value + event.translationX,
            -metrics.swipeContentWidth,
            0,
          );
        })
        .onFinalize((event) => {
          isDragging.value = false;
          if (!hasStarted.value) {
            // A tap/scroll began while a spring was running. onBegin cancelled
            // it, so restore the current open/closed resting position.
            const restingReveal = isOpenValue.value
              ? stage === "details"
                ? metrics.swipeContentWidth
                : ACTION_REVEAL_WIDTH
              : 0;
            const restingHeight = isOpenValue.value
              ? stage === "details"
                ? DETAIL_ROW_HEIGHT
                : ROW_HEIGHT + 32
              : ROW_HEIGHT;
            translateX.value = withSpring(-restingReveal, SWIPE_SPRING);
            wrapHeight.value = withSpring(restingHeight, SWIPE_SPRING);
            return;
          }

          hasStarted.value = false;
          const releaseX = clamp(
            gestureStartX.value + event.translationX,
            -metrics.swipeContentWidth,
            0,
          );
          const nextStage = resolveSwipeSettle({
            startX: gestureStartX.value,
            releaseX,
            velocityX: event.velocityX,
            contentWidth: metrics.swipeContentWidth,
            actionWidth: ACTION_REVEAL_WIDTH,
          });
          const targetX =
            nextStage === "details"
              ? -metrics.swipeContentWidth
              : nextStage === "actions"
                ? -ACTION_REVEAL_WIDTH
                : 0;
          const targetHeight =
            nextStage === "details"
              ? DETAIL_ROW_HEIGHT
              : nextStage === "actions"
                ? ROW_HEIGHT + 32
                : ROW_HEIGHT;

          // Snap on the UI thread immediately; only update the open-row state
          // through JS after the gesture ends.
          translateX.value = withSpring(targetX, SWIPE_SPRING);
          wrapHeight.value = withSpring(targetHeight, SWIPE_SPRING);
          runOnJS(settleSwipe)(nextStage);
        }),
    [
      gestureStartX,
      hasStarted,
      isDragging,
      isOpenValue,
      metrics.swipeContentWidth,
      settleSwipe,
      stage,
      translateX,
      wrapHeight,
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
            onBackToActions={handleBackToActions}
            onRevealDetails={handleRevealDetails}
            onStatusSelect={handleStatusSelect}
            onCommentPress={onCommentPress}
            canReassign={canReassign}
            assignableOwners={assignableOwners}
            onAssigneeSelect={handleAssigneeSelect}
            canAssignProject={canAssignProject}
            onAddToProjectPress={onAddToProjectPress}
            onSprintPress={onSprintPress}
            onRemoveTask={onRemoveTask}
            swipeVariant={swipeVariant}
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
              readOnly={readOnly}
              onToggle={() => onToggleComplete(item)}
            />
            {columns.map((key) => (
              <TaskCellContent
                key={key}
                item={item}
                columnKey={key}
                width={metrics.columnWidths[key]!}
                onPress={key === "title" ? () => onTaskPress?.(item) : undefined}
                onSprintPress={
                  key === "sprint" ? () => onSprintPress?.(item) : undefined
                }
              />
            ))}
            {/* Swipe affordance — also shown on read-only dependency rows. */}
            {currentStage === null && (
              <TouchableOpacity
                style={styles.actionPress}
                onPress={() => onOpenSwipe(taskKey, "actions")}
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
