// Swipe-open actions/details panel for a task row. Extracted from
// SingleTaskTable with no behaviour change (AUD-080).

import Avatar from "@/components/Avatar";
import { STATUS_COLORS, StatusType, TaskRowProps } from "@/components/TaskRow";
import Icons from "@/constants/icons";
import { Ionicons } from "@expo/vector-icons";
import { memo, useEffect, useState } from "react";
import { Pressable, Text, TouchableOpacity, View } from "react-native";
import TaskAssigneeDropdown from "./TaskAssigneeDropdown";
import TaskStatusDropdown from "./TaskStatusDropdown";
import {
  ACTION_GRIP_WIDTH,
  ACTION_STRIP_HEIGHT,
  type AssignableOwner,
} from "./taskTableLayout";
import { taskTableStyles as styles } from "./taskTableStyles";
import { WaveChevronBadge } from "./TaskTablePrimitives";

const { HalfSwipeIcon } = Icons;

type SwipeStage = "actions" | "details";

export const TaskSwipeContent = memo(function TaskSwipeContent({
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
  canAssignProject,
  onAddToProjectPress,
  onSprintPress,
  onRemoveTask,
  swipeVariant = "default",
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
  canAssignProject?: boolean;
  onAddToProjectPress?: (task: TaskRowProps) => void;
  onSprintPress?: (task: TaskRowProps) => void;
  onRemoveTask?: (task: TaskRowProps) => void;
  swipeVariant?: "default" | "project";
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
  }, [scrollCloseSignal]);
  const colors = STATUS_COLORS[item.status] ?? {
    bg: "#FEF3C7",
    text: "#D97706",
  };
  const actionStatusLabel = item.status;
  const actionStatusColor = colors.text;
  const canChangeStatus =
    item.canEditStatus === true ||
    item.canApproveReject === true ||
    item.canReopen === true;
  const canChangeProject =
    canAssignProject === true && item._raw?.can_edit === true;
  const showProject = canChangeProject || !!item.project?.trim();
  const showRemove = !!onRemoveTask;
  const showSprint = swipeVariant === "project";
  const sprintLabel = item.sprint?.trim() || "No Sprint";
  const canChangeSprint =
    !!onSprintPress && item.canEditSprint !== false;

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
            style={[styles.actionStatusBoxText, { color: actionStatusColor }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {actionStatusLabel}
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
          {showSprint ? (
            <Text style={[styles.swipeHeaderText, styles.swipeSprintColumn]}>
              Sprint
            </Text>
          ) : (
            <>
              <Text style={[styles.swipeHeaderText, styles.swipeCommentColumn]}>
                {showRemove ? "Remove" : "Comment"}
              </Text>
              {showProject ? (
                <Text
                  style={[styles.swipeHeaderText, styles.swipeProjectColumn]}
                >
                  Project
                </Text>
              ) : null}
            </>
          )}
        </View>
      </View>

      <View style={styles.swipeValues}>
        {canReassign &&
        item.canReassign === true &&
        assignableOwners &&
        assignableOwners.length > 0 ? (
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

        {showSprint ? (
          <View style={styles.swipeSprintColumn}>
            {canChangeSprint ? (
              <TouchableOpacity
                style={styles.swipeSprintCell}
                onPress={() => onSprintPress?.(item)}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Change sprint"
              >
                <Ionicons
                  name="flag-outline"
                  size={15}
                  color={item.sprint?.trim() ? "#00DEAB" : "#9CA3AF"}
                />
                <Text
                  style={[
                    styles.swipeSprintText,
                    !item.sprint?.trim() && styles.swipeSprintTextMuted,
                  ]}
                  numberOfLines={1}
                >
                  {sprintLabel}
                </Text>
                <Ionicons name="chevron-down" size={12} color="#6B7280" />
              </TouchableOpacity>
            ) : (
              <View style={styles.swipeSprintCell}>
                <Ionicons
                  name="flag-outline"
                  size={15}
                  color={item.sprint?.trim() ? "#00A876" : "#9CA3AF"}
                />
                <Text
                  style={[
                    styles.swipeSprintText,
                    !item.sprint?.trim() && styles.swipeSprintTextMuted,
                  ]}
                  numberOfLines={1}
                >
                  {sprintLabel}
                </Text>
              </View>
            )}
          </View>
        ) : (
          <>
            {showRemove ? (
              <TouchableOpacity
                style={[styles.swipeCommentCell, styles.swipeCommentColumn]}
                onPress={() => onRemoveTask?.(item)}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Remove dependency"
              >
                <Ionicons name="trash-outline" size={17} color="#DC2626" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.swipeCommentCell, styles.swipeCommentColumn]}
                onPress={() => onCommentPress?.(item)}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="chatbox-outline" size={18} color="#00DEAB" />
                {item.comment ? (
                  <Text style={styles.swipeCommentCount}>{item.comment}</Text>
                ) : null}
              </TouchableOpacity>
            )}

            {showProject ? (
              canChangeProject ? (
                <TouchableOpacity
                  style={[styles.swipeProjectCell, styles.swipeProjectColumn]}
                  onPress={() => onAddToProjectPress?.(item)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="Add to project"
                >
                  <Ionicons name="folder-outline" size={18} color="#00DEAB" />
                  {item.project?.trim() ? (
                    <Text style={styles.swipeProjectName} numberOfLines={1}>
                      {item.project}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              ) : (
                <View
                  style={[styles.swipeProjectCell, styles.swipeProjectColumn]}
                >
                  <Ionicons name="folder-outline" size={15} color="#00A876" />
                  <Text style={styles.swipeProjectName} numberOfLines={1}>
                    {item.project}
                  </Text>
                </View>
              )
            ) : null}
          </>
        )}
      </View>

      {statusPickerOpen ? (
        <>
          <Pressable
            style={styles.dropdownBackdrop}
            onPress={() => setStatusPickerOpen(false)}
          />
          <View style={styles.swipeDropdown}>
            <TaskStatusDropdown
              item={item}
              variant={swipeVariant}
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
            <TaskAssigneeDropdown
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
