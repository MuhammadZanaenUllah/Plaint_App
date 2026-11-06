// Task-status row for the task-detail sheet (AUD-081 phase 3).

import { STATUS_COLORS, type StatusType } from "@/components/TaskRow";
import { TaskDetailInfoRow } from "../TaskDetailInfoRow";
import { taskDetailFieldStyles as styles } from "../taskDetailFieldStyles";
import { Text, TouchableOpacity, View } from "react-native";

type Props = {
  status: string;
  canEditStatus: boolean;
  canApproveRejectNow: boolean;
  onPress: () => void;
};

export function TaskDetailStatusRow({
  status,
  canEditStatus,
  canApproveRejectNow,
  onPress,
}: Props) {
  const disabled = !canEditStatus && !canApproveRejectNow;

  return (
    <TaskDetailInfoRow icon="sync-outline" label="Task Status:">
      <TouchableOpacity
        activeOpacity={0.7}
        disabled={disabled}
        style={disabled && { opacity: 0.7 }}
        onPress={onPress}
      >
        <View
          style={[
            styles.badge,
            {
              backgroundColor:
                STATUS_COLORS[status as StatusType]?.bg ?? "#D1FAE5",
            },
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              {
                color: STATUS_COLORS[status as StatusType]?.text ?? "#059669",
              },
            ]}
          >
            {status === "In-Progress"
              ? "In Progress"
              : status === "On-Hold"
                ? "On Hold"
                : status}
          </Text>
        </View>
      </TouchableOpacity>
    </TaskDetailInfoRow>
  );
}
