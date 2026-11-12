// Status picker overlay for the task-detail sheet (AUD-081 phase 4).

import { STATUS_COLORS, type StatusType } from "@/components/TaskRow";
import { normalizeApiStatus } from "@/features/tasks/utils/taskStatus";
import { Ionicons } from "@expo/vector-icons";
import ModalCloseButton from "@/components/ModalCloseButton";
import {
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { taskDetailPickerStyles as styles } from "../taskDetailPickerStyles";

type Props = {
  visible: boolean;
  onClose: () => void;
  options: string[];
  editStatus: string;
  onSelect: (status: string) => void;
};

export function TaskDetailStatusPicker({
  visible,
  onClose,
  options,
  editStatus,
  onSelect,
}: Props) {
  if (!visible) return null;

  return (
    <Pressable style={styles.popoverOverlay} onPress={onClose}>
      <Pressable style={styles.popoverCard} onPress={(e) => e.stopPropagation()}>
        <View style={styles.popoverHeader}>
          <Text style={styles.popoverTitle}>Select Status</Text>
          <ModalCloseButton onPress={onClose} />
        </View>
        <ScrollView style={{ maxHeight: 260 }}>
          {options.map((status) => {
            const isSelected =
              normalizeApiStatus(String(editStatus)) ===
              normalizeApiStatus(status);
            return (
              <TouchableOpacity
                key={status}
                style={[
                  styles.popoverRow,
                  isSelected && styles.popoverRowSelected,
                ]}
                onPress={() => onSelect(status)}
              >
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor:
                        STATUS_COLORS[status as StatusType]?.bg ?? "#00DEAB",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      {
                        color:
                          STATUS_COLORS[status as StatusType]?.text ?? "#fff",
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
          })}
        </ScrollView>
      </Pressable>
    </Pressable>
  );
}
