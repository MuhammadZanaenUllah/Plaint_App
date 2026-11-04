import { ALL_STATUSES, STATUS_COLORS, type StatusType, type TaskRowProps } from "@/components/TaskRow";
import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { triggerHaptic } from "@/utils/haptics";
import { rf } from "@/utils/responsive";

type Props = {
  item: TaskRowProps;
  onSelect: (status: StatusType) => void;
};

function getOptions(item: TaskRowProps): { label: string; value: StatusType }[] {
  if (item.status === "Pending-Approval") {
    return item.canApproveReject === true
      ? [
          { label: "Approve", value: "Completed" },
          { label: "Reject", value: "Rejected" },
        ]
      : [];
  }
  if (item.status === "Completed") {
    return item.canReopen === true
      ? [
          { label: "Reopen as Pending", value: "Pending" },
          { label: "Reopen as In Progress", value: "In-Progress" },
        ]
      : [];
  }
  if (item.canEditStatus !== true) return [];

  // Completing is only offered once the task is active (contract §3.12).
  const statusName = String(item.status);
  const canComplete =
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
  return statuses;
}

const TaskStatusDropdown = memo(function TaskStatusDropdown({ item, onSelect }: Props) {
  return (
    <>
      {getOptions(item).map(({ label, value }) => {
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
