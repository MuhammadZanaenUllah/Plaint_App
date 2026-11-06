// Due-date picker overlay for the task-detail sheet (AUD-081 phase 4).

import CalendarPicker from "@/components/CalendarPicker";
import { Ionicons } from "@expo/vector-icons";
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
  value: Date | null;
  isAts: boolean;
  onSelect: (date: Date) => void;
  onDone: () => void;
};

export function TaskDetailDueDatePicker({
  visible,
  onClose,
  value,
  isAts,
  onSelect,
  onDone,
}: Props) {
  if (!visible) return null;

  return (
    <Pressable style={styles.popoverOverlay} onPress={onClose}>
      <Pressable
        style={[styles.popoverCard, { maxWidth: 360 }]}
        onPress={(e) => e.stopPropagation()}
      >
        <View style={styles.popoverHeader}>
          <Text style={styles.popoverTitle}>Select Due Date</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={20} color="#1D1D1D" />
          </TouchableOpacity>
        </View>
        <CalendarPicker
          startDate={value}
          endDate={value}
          disablePast={!isAts}
          onSelectStart={onSelect}
          onSelectEnd={onSelect}
          onDone={onDone}
          compact
        />
      </Pressable>
    </Pressable>
  );
}
