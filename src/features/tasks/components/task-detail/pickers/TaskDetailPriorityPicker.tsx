// Task-priority picker overlay for the task-detail sheet (AUD-081 phase 4).

import type {
  TaskPriority,
  TaskPriorityLevel,
} from "@/features/tasks/types/task.types";
import { Ionicons } from "@expo/vector-icons";
import ModalCloseButton from "@/components/ModalCloseButton";
import {
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { taskDetailPickerStyles as styles } from "../taskDetailPickerStyles";

type Props = {
  visible: boolean;
  onClose: () => void;
  hasTaskPriority: boolean;
  isAts: boolean;
  editTaskPriority: TaskPriorityLevel;
  priorities: TaskPriority[];
  editPriorityId: number | null;
  onSelectTier: (tier: TaskPriorityLevel) => void;
  onSelectPriority: (priority: TaskPriority) => void;
};

export function TaskDetailPriorityPicker({
  visible,
  onClose,
  hasTaskPriority,
  isAts,
  editTaskPriority,
  priorities,
  editPriorityId,
  onSelectTier,
  onSelectPriority,
}: Props) {
  if (!visible) return null;

  return (
    <Pressable style={styles.popoverOverlay} onPress={onClose}>
      <Pressable style={styles.popoverCard} onPress={(e) => e.stopPropagation()}>
        <View style={styles.popoverHeader}>
          <Text style={styles.popoverTitle}>Task Priority</Text>
          <ModalCloseButton onPress={onClose} />
        </View>
        {hasTaskPriority ? (
          (isAts
            ? (["normal", "critical"] as const)
            : (["normal"] as const)
          ).map((tier) => {
            const isSelected = editTaskPriority === tier;
            return (
              <TouchableOpacity
                key={tier}
                style={[
                  styles.popoverRow,
                  isSelected && styles.popoverRowSelected,
                ]}
                onPress={() => onSelectTier(tier)}
              >
                <View
                  style={[
                    styles.taskPriorityBadge,
                    tier === "critical"
                      ? styles.taskPriorityBadgeCritical
                      : styles.taskPriorityBadgeNormal,
                  ]}
                >
                  <View
                    style={[
                      styles.taskPriorityDot,
                      {
                        backgroundColor:
                          tier === "critical" ? "#EF4444" : "#00A876",
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.taskPriorityBadgeText,
                      {
                        color: tier === "critical" ? "#EF4444" : "#00A876",
                      },
                    ]}
                  >
                    {tier === "critical" ? "Critical" : "Normal"}
                  </Text>
                </View>
                {isSelected && (
                  <Ionicons
                    name="checkmark"
                    size={16}
                    color="#00DEAB"
                    style={{ marginLeft: "auto" }}
                  />
                )}
              </TouchableOpacity>
            );
          })
        ) : (
          (priorities ?? []).map((priority) => {
            const isSelected = editPriorityId === priority.id;
            return (
              <TouchableOpacity
                key={priority.id}
                style={[
                  styles.popoverRow,
                  isSelected && styles.popoverRowSelected,
                ]}
                onPress={() => onSelectPriority(priority)}
              >
                <Text
                  style={[
                    styles.popoverRowText,
                    isSelected && {
                      fontFamily: "SF_Pro_Semibold",
                      color: "#00DEAB",
                    },
                  ]}
                >
                  {priority.name}
                </Text>
                {isSelected && (
                  <Ionicons name="checkmark" size={16} color="#00DEAB" />
                )}
              </TouchableOpacity>
            );
          })
        )}
      </Pressable>
    </Pressable>
  );
}
