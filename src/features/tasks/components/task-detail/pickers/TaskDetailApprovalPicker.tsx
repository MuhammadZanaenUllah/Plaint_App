// Approval-required picker overlay for the task-detail sheet (AUD-081 phase 4).

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
  value: boolean;
  onSelect: (value: boolean) => void;
};

export function TaskDetailApprovalPicker({
  visible,
  onClose,
  value,
  onSelect,
}: Props) {
  if (!visible) return null;

  return (
    <Pressable style={styles.popoverOverlay} onPress={onClose}>
      <Pressable style={styles.popoverCard} onPress={(e) => e.stopPropagation()}>
        <View style={styles.popoverHeader}>
          <Text style={styles.popoverTitle}>Approval Required</Text>
          <ModalCloseButton onPress={onClose} />
        </View>
        {[
          { label: "Yes", value: true },
          { label: "No", value: false },
        ].map((option) => {
          const isSelected = value === option.value;
          return (
            <TouchableOpacity
              key={option.label}
              style={[
                styles.popoverRow,
                isSelected && styles.popoverRowSelected,
              ]}
              onPress={() => onSelect(option.value)}
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
                {option.label}
              </Text>
              {isSelected && (
                <Ionicons name="checkmark" size={16} color="#00DEAB" />
              )}
            </TouchableOpacity>
          );
        })}
      </Pressable>
    </Pressable>
  );
}
