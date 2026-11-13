// Priority chip + expanded options for the create-task sheet (AUD-081 phase 1).

import type { TaskPriorityLevel } from "@/features/tasks/types/task.types";
import { Ionicons } from "@expo/vector-icons";
import { Text, TouchableOpacity, View } from "react-native";
import { PRIORITY_OPTIONS } from "../createTaskOptions";
import { createTaskFieldStyles as styles } from "../createTaskFieldStyles";

export function CreatePriorityChip({
  effectivePriority,
  onPress,
}: {
  effectivePriority: TaskPriorityLevel;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.designChip, styles.designChipDark]}
      onPress={onPress}
    >
      <Ionicons name="star" size={14} color="#FFF" />
      <Text
        allowFontScaling={false}
        style={[styles.designChipText, styles.designChipTextWhite]}
      >
        {effectivePriority === "critical" ? "Critical" : "Normal"}
      </Text>
    </TouchableOpacity>
  );
}

export function CreatePriorityPanel({
  isAdvanced,
  effectivePriority,
  onSelectPriority,
}: {
  isAdvanced: boolean;
  effectivePriority: TaskPriorityLevel;
  onSelectPriority: (priority: TaskPriorityLevel) => void;
}) {
  return (
    <View style={styles.inlineOptionsRow}>
      {(isAdvanced
        ? PRIORITY_OPTIONS
        : PRIORITY_OPTIONS.filter((p) => p.value === "normal")
      ).map((p) => {
        const isSelected = effectivePriority === p.value;
        return (
          <TouchableOpacity
            key={p.value}
            style={[
              styles.pillBtn,
              isSelected
                ? p.value === "critical"
                  ? styles.pillRed
                  : styles.pillTeal
                : styles.pillGrey,
            ]}
            onPress={() => onSelectPriority(p.value)}
          >
            {isSelected ? (
              <Ionicons name="checkmark" size={12} color="#fff" />
            ) : (
              <View style={[styles.pillDot, { backgroundColor: p.dot }]} />
            )}
            <Text
              allowFontScaling={false}
              style={[styles.pillText, isSelected && styles.pillTextWhite]}
            >
              {p.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
