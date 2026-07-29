import Icons from "@/constants/icons";
import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { STATUS_COLORS, StatusType, TaskRowProps, PRIORITY_ACCENT_COLORS } from "./TaskRow";

const { FilterIconBlack } = Icons;

type Props = {
  sectionTitle: string;
  tasks: TaskRowProps[];
  onTaskPress?: (task: TaskRowProps) => void;
  onStatusChange?: (task: TaskRowProps, newStatus: StatusType) => void;
  onFilterPress?: () => void;
  loading?: boolean;
  emptyText?: string;
  activeFilterCount?: number;
};

type SwipeStage = "actions" | "details";
type OpenSwipeRow = { index: number; stage: SwipeStage } | null;
type Metrics = ReturnType<typeof getTableMetrics>;
type StatusOverrides = Record<string, StatusType>;

const ROW_HEIGHT = 39;
const DETAIL_ROW_HEIGHT = 91;
const ACTION_REVEAL_WIDTH = 176;
const ACTION_STRIP_HEIGHT = 39;
const MAX_TABLE_WIDTH = 640;
const MIN_TABLE_WIDTH = 320;
const SWIPE_GREEN = "#12D6AA";
const GRIP_CHEVRONS = [0, 1, 2, 3, 4, 5];
const ALL_STATUSES: StatusType[] = [
  "Pending",
  "In-Progress",
  "Rejected",
  "Completed",
  "Pending-Approval",
  "Recurring",
];

function getTaskKey(task: TaskRowProps, index: number) {
  return task.id ?? `${index}:${task.title}:${task.dueDate}`;
}

function clamp(value: number, min: number, max: number) {
  "worklet";
  return Math.min(max, Math.max(min, value));
}

function getTableMetrics(windowWidth: number) {
  const tableWidth = Math.max(
    MIN_TABLE_WIDTH,
    Math.min(windowWidth - 32, MAX_TABLE_WIDTH),
  );
  const innerPadding = 6;
  const contentWidth = tableWidth - innerPadding * 2;
  const leadingWidth = 32;
  const actionWidth = 26;
  const dataWidth = contentWidth - leadingWidth - actionWidth;
  const dueDateWidth = Math.max(80, Math.round(dataWidth * 0.3));
  const createdByWidth = Math.max(88, Math.round(dataWidth * 0.31));
  const titleWidth = Math.max(
    104,
    dataWidth - dueDateWidth - createdByWidth,
  );

  return {
    tableWidth,
    innerPadding,
    leadingWidth,
    titleWidth,
    createdByWidth,
    dueDateWidth,
    actionWidth,
    swipeContentWidth: Math.min(410, tableWidth),
  };
}

function SingleTaskTable({
  sectionTitle,
  tasks,
  onTaskPress,
  onStatusChange,
  onFilterPress,
  loading = false,
  emptyText = "No tasks found.",
  activeFilterCount = 0,
}: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const metrics = useMemo(() => getTableMetrics(windowWidth), [windowWidth]);
  const [statusOverrides, setStatusOverrides] = useState<StatusOverrides>({});
  const [openSwipeRow, setOpenSwipeRow] = useState<OpenSwipeRow>(null);
  const [isSwipeDragging, setIsSwipeDragging] = useState(false);
  const [rowViewportHeight, setRowViewportHeight] = useState(0);
  const [rowContentHeight, setRowContentHeight] = useState(0);

  const augmentedTasks = useMemo(
    () =>
      tasks.map((task, index) => ({
        ...task,
        status: statusOverrides[getTaskKey(task, index)] ?? task.status,
      })),
    [statusOverrides, tasks],
  );

  const handleStatusChange = useCallback(
    (task: TaskRowProps, rowIndex: number, nextStatus: StatusType) => {
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
    setOpenSwipeRow({ index, stage });
  }, []);

  const closeSwipe = useCallback(() => {
    setOpenSwipeRow(null);
  }, []);

  const shouldEnableRowScroll =
    rowContentHeight > rowViewportHeight + 1 && !isSwipeDragging;

  return (
    <View style={[styles.container, { width: metrics.tableWidth }]}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{sectionTitle}</Text>
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
                <FilterIconBlack
                  width={18}
                  height={18}
                  color={pressed || activeFilterCount > 0 ? "#fff" : undefined}
                />
                {activeFilterCount > 0 ? (
                  <View style={styles.filterBadge}>
                    <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
                  </View>
                ) : null}
              </View>
            )}
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.tableHeader, { paddingHorizontal: metrics.innerPadding }]}>
        <View style={{ width: metrics.leadingWidth }} />
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

      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.rowsScroll}
        keyboardShouldPersistTaps="always"
        scrollEnabled={shouldEnableRowScroll}
        bounces={shouldEnableRowScroll}
        alwaysBounceVertical={false}
        onLayout={(event) =>
          setRowViewportHeight(event.nativeEvent.layout.height)
        }
        onContentSizeChange={(_width, height) => setRowContentHeight(height)}
        nestedScrollEnabled
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
                onToggleComplete={handleToggleComplete}
                onStatusChange={handleStatusChange}
              />
            ))
          : null}
      </ScrollView>
    </View>
  );
}

export default memo(SingleTaskTable);

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
  onToggleComplete,
  onStatusChange,
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
  onToggleComplete: (task: TaskRowProps, rowIndex: number) => void;
  onStatusChange: (
    task: TaskRowProps,
    rowIndex: number,
    status: StatusType,
  ) => void;
}) {
  const translateX = useSharedValue(0);
  const gestureStartX = useSharedValue(0);
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
    translateX.value = withSpring(-revealWidth, {
      damping: 24,
      stiffness: 260,
      mass: 0.85,
      overshootClamping: true,
    });
  }, [revealWidth, translateX]);

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
        .onEnd((event) => {
          runOnJS(onSwipeDragStateChange)(false);
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
        })
        .onFinalize(() => {
          runOnJS(onSwipeDragStateChange)(false);
        }),
    [
      gestureStartX,
      isOpen,
      metrics.swipeContentWidth,
      onSwipeDragStateChange,
      settleSwipe,
      translateX,
    ],
  );

  return (
    <GestureDetector gesture={panGesture}>
      <View
        style={[
          styles.rowWrap,
          {
            minHeight: rowHeight,
            zIndex: isOpen ? 1000 - rowIndex : 1,
          },
        ]}
      >
        <View
          style={[
            styles.swipeContent,
            {
              width: metrics.swipeContentWidth,
              minHeight: rowHeight,
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
          />
        </View>

        <Animated.View style={animatedRowStyle}>
          <View
            style={[
              styles.row,
              {
                minHeight: ROW_HEIGHT,
                paddingHorizontal: metrics.innerPadding,
              },
            ]}
          >
            <LeadingCell
              item={item}
              width={metrics.leadingWidth}
              onToggle={() => onToggleComplete(item, rowIndex)}
            />
            <TaskCellContent
              item={item}
              columnKey="title"
              width={metrics.titleWidth}
              onPress={() => onTaskPress?.(item)}
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
            <TouchableOpacity
              style={[styles.actionPress, { width: metrics.actionWidth }]}
              onPress={() =>
                isOpen ? onCloseSwipe() : onOpenSwipe(rowIndex, "actions")
              }
              activeOpacity={0.8}
            >
              <View style={styles.chevronBadge}>
                <Ionicons
                  name={isOpen ? "chevron-forward" : "chevron-back"}
                  size={12}
                  color="#fff"
                />
              </View>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </GestureDetector>
  );
});

const LeadingCell = memo(function LeadingCell({
  item,
  width,
  onToggle,
}: {
  item: TaskRowProps;
  width: number;
  onToggle: () => void;
}) {
  const isCompleted = item.status === "Completed";
  const normKey = (item.priorityName ?? "").charAt(0).toUpperCase() + (item.priorityName ?? "").slice(1).toLowerCase();
  const accentColor = PRIORITY_ACCENT_COLORS[normKey] ?? "#00DEAB";

  return (
    <View style={[styles.leadingCell, { width }]}>
      <View style={[styles.accent, { backgroundColor: accentColor }]} />
      <TouchableOpacity
        style={styles.checkboxWrap}
        onPress={onToggle}
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
}: {
  item: TaskRowProps;
  columnKey: "title" | "createdBy" | "dueDate";
  width: number;
  onPress?: () => void;
}) {
  const isCompleted = item.status === "Completed";

  if (columnKey === "title") {
    return (
      <TouchableOpacity
        style={[styles.titleCell, { width }]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <Text
          style={[styles.titleText, isCompleted && styles.strikethrough]}
          numberOfLines={1}
        >
          {item.title}
        </Text>
        {item.extraCount ? (
          <View style={styles.extraBadge}>
            <Ionicons name="copy-outline" size={11} color="#6B7280" />
            <Text style={styles.extraText}>+{item.extraCount}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  }

  if (columnKey === "createdBy") {
    const creatorAvatarUri =
      item.createdByAvatar ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(
        item.createdBy || "U",
      )}&background=00DEAB&color=fff&rounded=false`;

    return (
      <View style={[styles.userCell, { width }]}>
        <Image source={{ uri: creatorAvatarUri }} style={styles.avatarImage} />
        <Text style={styles.cellText} numberOfLines={1}>
          {item.createdBy}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.dateCell, { width }]}>
      <Ionicons
        name="calendar-outline"
        size={16}
        color="#00DEAB"
        style={styles.dateIcon}
      />
      <Text style={styles.cellText} numberOfLines={1}>
        {item.dueDate}
      </Text>
    </View>
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
      {ALL_STATUSES.map((status) => {
        const color = STATUS_COLORS[status]?.text ?? "#6B7280";
        const isActive = status === currentStatus;

        return (
          <TouchableOpacity
            key={status}
            style={[styles.dropdownItem, isActive && styles.dropdownItemActive]}
            onPress={() => onSelect(status)}
            activeOpacity={0.8}
          >
            {/* <View style={[styles.dot, { backgroundColor: color }]} /> */}
            <Text style={[styles.dropdownText, { color }]} numberOfLines={1} adjustsFontSizeToFit>
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

const TaskSwipeContent = memo(function TaskSwipeContent({
  item,
  stage,
  onClose,
  onBackToActions,
  onRevealDetails,
  onStatusSelect,
}: {
  item: TaskRowProps;
  stage: SwipeStage;
  onClose: () => void;
  onBackToActions: () => void;
  onRevealDetails: () => void;
  onStatusSelect: (status: StatusType) => void;
}) {
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);

  useEffect(() => {
    if (stage !== "details") {
      setStatusPickerOpen(false);
    }
  }, [stage]);
  const colors = STATUS_COLORS[item.status] ?? {
    bg: "#FEF3C7",
    text: "#D97706",
  };
  const actionStatusLabel = item.status;
  const actionStatusColor = colors.text;

  if (stage === "actions") {
    return (
      <View style={styles.swipePanel}>
        <View style={styles.actionStrip}>
          <TouchableOpacity
            style={styles.actionGrip}
            onPress={onClose}
            activeOpacity={0.8}
          >
            {GRIP_CHEVRONS.map((item) => (
              <Ionicons
                key={item}
                name="chevron-back"
                size={13}
                color="#0CBF98"
                style={styles.actionGripIcon}
              />
            ))}
          </TouchableOpacity>
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

        <View
          style={[
            styles.actionStatusBox,
            { backgroundColor: colors.bg },
          ]}
        >
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
      <View style={styles.swipeHeader}>
        <TouchableOpacity
          style={styles.detailsBackButton}
          onPress={onBackToActions}
          activeOpacity={0.8}
        >
          <View style={styles.chevronBadge}>
            <Ionicons name="chevron-forward" size={12} color="#fff" />
          </View>
        </TouchableOpacity>
        <Text style={[styles.swipeHeaderText, styles.swipeAssignedColumn]}>
          Assigned to
        </Text>
        <Text style={[styles.swipeHeaderText, styles.swipeStatusColumn]}>
          Status
        </Text>
        <Text style={[styles.swipeHeaderText, styles.swipeCommentColumn]}>
          Comment
        </Text>
        <Text style={[styles.swipeHeaderText, styles.swipeProjectColumn]}>
          Project
        </Text>
      </View>

      <View style={styles.swipeValues}>
        <View style={[styles.swipeUserCell, styles.swipeAssignedColumn]}>
          <View style={styles.initialsAssignee}>
            <Text style={styles.initialsText}>
              {item.assignedToInitials || item.assignedTo?.[0] || "?"}
            </Text>
          </View>
          <Text style={styles.cellText} numberOfLines={1}>
            {item.assignedTo}
          </Text>
        </View>

        <View style={styles.swipeStatusColumn}>
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
        </View>

        <View style={[styles.swipeCommentCell, styles.swipeCommentColumn]}>
          <Ionicons name="chatbox-outline" size={16} color="#D1D5DB" />
          {item.extraCount ? (
            <Text style={styles.extraText}>+{item.extraCount}</Text>
          ) : null}
        </View>

        <View style={[styles.swipeProjectCell, styles.swipeProjectColumn]}>
          <TouchableOpacity
            style={styles.addProjectButton}
            onPress={onClose}
            activeOpacity={0.75}
          >
            <Ionicons name="add" size={14} color="#D1D5DB" />
            <Text style={styles.cellText} numberOfLines={1}>
              {item.project || "Add project"}
            </Text>
          </TouchableOpacity>
        </View>
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
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignSelf: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: "SF_Pro_Medium",
    color: "#1F2937",
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
    height: 31,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E5E7EB",
    borderRadius: 4,
    marginBottom: 8,
  },
  colHead: {
    fontSize: 12,
    fontFamily: "SF_Pro_Medium",
    color: "#1F2937",
    textAlign: "center",
  },
  rowsScroll: {
    flex: 1,
  },
  rowWrap: {
    position: "relative",
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
  },
  accent: {
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
    fontSize: 12,
    color: "#1F2937",
    fontFamily: "SF_Pro_Medium",
  },
  strikethrough: {
    color: "#9CA3AF",
    textDecorationLine: "line-through",
  },
  extraBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 6,
  },
  extraText: {
    fontSize: 11,
    color: "#6B7280",
    marginLeft: 2,
    fontFamily: "SF_Pro_Regular",
  },
  userCell: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 6,
  },
  avatarImage: {
    width: 21,
    height: 21,
    borderRadius: 2,
    marginRight: 6,
    backgroundColor: "#E5E7EB",
  },
  initialsCreator: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: "#00DEAB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  initialsAssignee: {
    width: 24,
    height: 24,
    borderRadius: 2,
    backgroundColor: "#00DEAB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  initialsText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  cellText: {
    minWidth: 0,
    flexShrink: 1,
    fontSize: 12,
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
    height: ROW_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  chevronBadge: {
    width: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: "#18181B",
    alignItems: "center",
    justifyContent: "center",
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
    backgroundColor: SWIPE_GREEN,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 62,
    paddingRight: 8,
    overflow: "hidden",
  },
  actionGrip: {
    position: "absolute",
    left: -30,
    top: 0,
    width: 88,
    height: ACTION_STRIP_HEIGHT,
    borderTopLeftRadius: ACTION_STRIP_HEIGHT / 2,
    borderBottomLeftRadius: ACTION_STRIP_HEIGHT / 2,
    backgroundColor: SWIPE_GREEN,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingLeft: 12,
    overflow: "hidden",
  },
  actionGripIcon: {
    marginLeft: -6,
  },
  actionButton: {
    flex: 1,
    height: ACTION_STRIP_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    overflow: "hidden",
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
  swipeHeader: {
    height: 37,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 4,
    paddingRight: 10,
    backgroundColor: "#00DEAB",
    // borderTopLeftRadius: 8,
    // borderTopRightRadius: 8,
    borderRadius:8,
  },
  detailsBackButton: {
    width: 26,
    height: 37,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 2,
  },
  swipeHeaderText: {
    fontSize: 12.5,
    color: "#050505",
    fontFamily: "SF_Pro_Medium",
  },
  swipeAssignedColumn: {
    flex: 1.2,
    minWidth: 82,
  },
  swipeStatusColumn: {
    flex: 0.95,
    minWidth: 70,
  },
  swipeCommentColumn: {
    flex: 0.9,
    minWidth: 66,
  },
  swipeProjectColumn: {
    flex: 1.15,
    minWidth: 78,
  },
  swipeValues: {
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 10,
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
  swipeProjectCell: {
    minWidth: 0,
    justifyContent: "center",
  },
  addProjectButton: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
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
  dropdownItem: {
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    // paddingVertical: 2,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
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
});
