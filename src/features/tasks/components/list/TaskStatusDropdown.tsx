import { ALL_STATUSES, STATUS_COLORS, type StatusType, type TaskRowProps } from "@/components/TaskRow";
import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { triggerHaptic } from "@/utils/haptics";
import { rf } from "@/utils/responsive";

type Props = {
  item: TaskRowProps;
  onSelect: (status: StatusType) => void;
  /** Project rows allow completing directly from any active status. */
  variant?: "default" | "project";
};

function getOptions(
  item: TaskRowProps,
  variant: "default" | "project",
): { label: string; value: StatusType }[] {
  if (item.status === "Pending-Approval") {
    const options: { label: string; value: StatusType }[] = [];
    if (item.canApproveReject === true) {
      options.push(
        { label: "Approve", value: "Completed" },
        { label: "Reject", value: "Rejected" },
      );
    }
    // ATS doers resume from Pending-Approval with the optional-effort modal.
    if (item.canEditStatus === true) {
      options.push(
        { label: "Resume as In Progress", value: "In-Progress" },
        { label: "Resume as Pending", value: "Pending" },
      );
    }
    return options;
  }
  if (item.status === "Completed") {
    const canAnyAction =
      item.canReopen === true ||
      item.canEditStatus === true ||
      item.canApproveReject === true;
    if (!canAnyAction) return [];

    const options: { label: string; value: StatusType }[] = [];

    // Pending, In Progress, On-Hold, Completed – for canReopen or canEditStatus users
    if (item.canReopen === true || item.canEditStatus === true) {
      options.push({ label: "Pending", value: "Pending" });
      options.push({ label: "In Progress", value: "In-Progress" });
      options.push({ label: "On-Hold", value: "On Hold" });
    }

    // Rejected – only for users who can approve/reject
    if (item.canApproveReject === true) {
      options.push({ label: "Rejected", value: "Rejected" });
    }

    return options;
  }
  if (item.canEditStatus !== true) return [];

  // Completing is only offered once the task is active (contract §3.12).
  const statusName = String(item.status);
  const canComplete =
    variant === "project" ||
    statusName === "In-Progress" ||
    statusName === "In Review" ||
    statusName === "In Testing";

  const statuses = ALL_STATUSES.filter(
    (status) =>
      status !== "Pending-Approval" &&
      status !== "Recurring" &&
      status !== "Rejected" &&
      (status !== "Completed" || canComplete) &&
      status !== item.status,
  ).map((status) => ({ label: status, value: status }));

  if ((item.subtaskCount ?? 0) > 0) {
    statuses.push({ label: "Partial Complete", value: "Partial Complete" });
  }

  // Show Rejected option for users who have permission to reject tasks
  // (task creator or company admin). The action handler in useTaskActions
  // routes this to the RejectTaskModal with its own permission guard.
  if (item.canApproveReject === true && item.status !== "Rejected") {
    statuses.push({ label: "Rejected", value: "Rejected" });
  }

  return statuses;
}

const TaskStatusDropdown = memo(function TaskStatusDropdown({
  item,
  onSelect,
  variant = "default",
}: Props) {
  return (
    <>
      {getOptions(item, variant).map(({ label, value }) => {
        const color = STATUS_COLORS[value]?.text ?? "#6B7280";
        const isActive = value === item.status;
        return (
          <TouchableOpacity
            key={value}
            style={[styles.item, isActive && styles.activeItem]}
            onPress={() => {
              triggerHaptic("selection");
              onSelect(value);
            }}
            activeOpacity={0.8}
          >
            <Text style={[styles.label, { color }]} numberOfLines={1} adjustsFontSizeToFit>
              {label}
            </Text>
            {isActive ? <Ionicons name="checkmark" size={13} color={color} /> : null}
          </TouchableOpacity>
        );
      })}
    </>
  );
});

export default TaskStatusDropdown;

const styles = StyleSheet.create({
  item: {
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F9FAFB",
  },
  activeItem: {
    backgroundColor: "#F0FDF9",
  },
  label: {
    flex: 1,
    fontSize: rf(12),
    fontFamily: "SF_Pro_Regular",
  },
});
