// Recurring-task chip for the create-task sheet (AUD-081 phase 1).

import type { RecurringPeriod } from "@/features/tasks/types/task.types";
import { Ionicons } from "@expo/vector-icons";
import { Text, TouchableOpacity } from "react-native";
import { createTaskFieldStyles as styles } from "../createTaskFieldStyles";

export function CreateRecurringChip({
  isRecurringEnabled,
  recurringPeriod,
  onPress,
}: {
  isRecurringEnabled: boolean;
  recurringPeriod: RecurringPeriod | null;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.designChip, isRecurringEnabled && styles.designChipDark]}
      onPress={onPress}
    >
      <Ionicons
        name="alarm-outline"
        size={14}
        color={isRecurringEnabled ? "#FFF" : "#6B7280"}
      />
      <Text
        allowFontScaling={false}
        style={[
          styles.designChipText,
          isRecurringEnabled && styles.designChipTextWhite,
        ]}
      >
        {isRecurringEnabled && recurringPeriod
          ? `Recurring: ${recurringPeriod}`
          : "Recurring Task"}
      </Text>
    </TouchableOpacity>
  );
}
