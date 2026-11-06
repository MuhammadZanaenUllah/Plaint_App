// Leading (priority accent + completion checkbox) cell for a task row.
// Extracted from SingleTaskTable with no behaviour change (AUD-080).

import type { TaskRowProps } from "@/components/TaskRow";
import { triggerHaptic } from "@/utils/haptics";
import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { TouchableOpacity, View } from "react-native";
import { taskTableStyles as styles } from "./taskTableStyles";

export const LeadingCell = memo(function LeadingCell({
  item,
  width,
  readOnly,
  onToggle,
}: {
  item: TaskRowProps;
  width: number;
  readOnly?: boolean;
  onToggle: () => void;
}) {
  const isCompleted = item.status === "Completed";
  const canToggle = item.canEditStatus === true;
  const priority = item.taskPriority?.toLowerCase() ?? "normal";

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
      <View style={[styles.accent, { backgroundColor: accentColor }]} />

      {readOnly ? (
        <View style={styles.checkboxWrap}>
          {isCompleted ? (
            <View style={styles.checkCircle}>
              <Ionicons name="checkmark" size={15} color="#fff" />
            </View>
          ) : (
            <View style={styles.checkbox} />
          )}
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.checkboxWrap, !canToggle && { opacity: 0.5 }]}
          disabled={!canToggle}
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
      )}
    </View>
  );
});
