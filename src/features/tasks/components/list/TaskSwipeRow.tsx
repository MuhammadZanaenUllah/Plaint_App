// Swipeable task row (gesture + closed/actions/details states). Extracted from
// SingleTaskTable with no behaviour change (AUD-080).

import { StatusType, TaskRowProps } from "@/components/TaskRow";
import { renderCounters } from "@/features/tasks/dev/counters";
import { memo, useCallback, useEffect, useMemo } from "react";
import { TouchableOpacity, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
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

export const SwipeTaskRow = memo(function SwipeTaskRow({
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
  canReassign,
  assignableOwners,
  onAssigneeSelect,
  canAssignProject,
  onAddToProjectPress,
  onSprintPress,
  scrollCloseSignal,
  columns,
  readOnly,
}: {
  item: TaskRowProps;
  rowIndex: number;
  metrics: TableMetrics;
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
  scrollCloseSignal?: number;
  canReassign?: boolean;
  assignableOwners?: AssignableOwner[];
  onAssigneeSelect: (owner: AssignableOwner) => void;
  canAssignProject?: boolean;
  onAddToProjectPress?: (task: TaskRowProps) => void;
  onSprintPress?: (task: TaskRowProps) => void;
  columns: SingleTaskTableColumn[];
  readOnly?: boolean;
}) {
  renderCounters.row(item.id ?? item.title);
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
          gestureStartX.value = translateX.value;
        })
        .onStart((event) => {
          hasStarted.value = true;
          if (!isOpen && event.translationX > 0) return;
          runOnJS(onSwipeDragStateChange)(true);
        })
        .onUpdate((event) => {
          if (!isOpen && event.translationX > 0) return;
          translateX.value = clamp(
            gestureStartX.value + event.translationX,
            -metrics.swipeContentWidth,
            0,
          );
        })
        .onFinalize((event) => {
          runOnJS(onSwipeDragStateChange)(false);
          // Skip settling if the gesture never actually activated (e.g. a
          // tap that stayed under the activeOffsetX threshold) â€” otherwise
          // a stray touch could snap an already-resting row.
          if (!hasStarted.value) return;

          hasStarted.value = false;
          // Always runs â€” even when the ScrollView/list steals the gesture
          // mid-swipe (fail/cancel) â€” so the row can't get stuck half-open
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
            canAssignProject={canAssignProject}
            onAddToProjectPress={onAddToProjectPress}
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
              onToggle={() => onToggleComplete(item, rowIndex)}
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
            {!readOnly && currentStage === null && (
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
