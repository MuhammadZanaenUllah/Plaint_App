// Priority row for the task-detail sheet (AUD-081 phase 3).

import type { TaskPriorityLevel } from "@/features/tasks/types/task.types";
import { TaskDetailInfoRow } from "../TaskDetailInfoRow";
import { taskDetailFieldStyles as styles } from "../taskDetailFieldStyles";
import { Text, TouchableOpacity, View } from "react-native";

type Props = {
  hasTaskPriority: boolean;
  editTaskPriority: TaskPriorityLevel;
  companyPriorityName: string;
  canEdit: boolean;
  isAts: boolean;
  onPress: () => void;
};

export function TaskDetailPriorityRow({
  hasTaskPriority,
  editTaskPriority,
  companyPriorityName,
  canEdit,
  isAts,
  onPress,
}: Props) {
  const disabled = !canEdit || (hasTaskPriority && !isAts);

  return (
    <TaskDetailInfoRow icon="star-outline" label="Priority:">
      <TouchableOpacity
        activeOpacity={0.7}
        disabled={disabled}
        style={disabled && { opacity: 0.7 }}
        onPress={onPress}
      >
        <View
          style={[
            styles.taskPriorityBadge,
            editTaskPriority === "critical"
              ? styles.taskPriorityBadgeCritical
              : styles.taskPriorityBadgeNormal,
          ]}
        >
          <View
            style={[
              styles.taskPriorityDot,
              {
                backgroundColor:
                  editTaskPriority === "critical" ? "#EF4444" : "#00A876",
              },
            ]}
          />
          <Text
            style={[
              styles.taskPriorityBadgeText,
              {
                color:
                  editTaskPriority === "critical" ? "#EF4444" : "#00A876",
              },
            ]}
          >
            {hasTaskPriority
              ? editTaskPriority === "critical"
                ? "Critical"
                : "Normal"
              : companyPriorityName}
          </Text>
        </View>
      </TouchableOpacity>
    </TaskDetailInfoRow>
  );
}
