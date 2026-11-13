// Task-status chip + options for the create-task sheet (AUD-081 phase 1).

import type { TaskStatus } from "@/features/tasks/types/task.types";
import { statusLabel } from "@/features/tasks/utils/taskStatus";
import { Ionicons } from "@expo/vector-icons";
import { Text, TouchableOpacity, View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { createTaskFieldStyles as styles } from "../createTaskFieldStyles";
import { STATUSES } from "../createTaskOptions";

export function CreateStatusChip({
  active,
  effectiveStatus,
  onPress,
}: {
  active: boolean;
  effectiveStatus: TaskStatus;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.designChip, (active || !!effectiveStatus) && styles.designChipDark]}
      onPress={onPress}
    >
      <Ionicons
        name="sync-circle-outline"
        size={14}
        color={active || !!effectiveStatus ? "#FFF" : "#6B7280"}
      />
      <Text
        allowFontScaling={false}
        style={[
          styles.designChipText,
          (active || !!effectiveStatus) && styles.designChipTextWhite,
        ]}
      >
        {statusLabel(effectiveStatus)}
      </Text>
    </TouchableOpacity>
  );
}

export function CreateStatusPanel({
  effectiveStatus,
  onSelectStatus,
}: {
  effectiveStatus: TaskStatus;
  onSelectStatus: (status: TaskStatus) => void;
}) {
  return (
    <View style={{ width: "100%", marginVertical: 6 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        disallowInterruption
        contentContainerStyle={{
          gap: 8,
          paddingHorizontal: 2,
        }}
      >
        {STATUSES.map((s) => {
          const isSelected = effectiveStatus === s.value;
          return (
            <TouchableOpacity
              key={s.value}
              style={[
                styles.pillBtn,
                isSelected ? { backgroundColor: s.color } : styles.pillGrey,
              ]}
              onPress={() => onSelectStatus(s.value)}
            >
              {isSelected ? (
                <Ionicons name="checkmark" size={12} color="#fff" />
              ) : (
                <View style={[styles.pillDot, { backgroundColor: s.color }]} />
              )}
              <Text
                allowFontScaling={false}
                style={[styles.pillText, isSelected && styles.pillTextWhite]}
              >
                {s.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
