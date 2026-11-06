// Effort picker overlay for the task-detail sheet (AUD-081 phase 4).

import { Ionicons } from "@expo/vector-icons";
import {
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { taskDetailPickerStyles as styles } from "../taskDetailPickerStyles";

type EffortUnit = "minutes" | "hours" | "days";

type Props = {
  visible: boolean;
  onClose: () => void;
  value: string;
  unit: string;
  onChangeValue: (value: string) => void;
  onBlur: () => void;
  onSelectUnit: (unit: EffortUnit) => void;
};

export function TaskDetailEffortPicker({
  visible,
  onClose,
  value,
  unit,
  onChangeValue,
  onBlur,
  onSelectUnit,
}: Props) {
  if (!visible) return null;

  return (
    <Pressable style={styles.popoverOverlay} onPress={onClose}>
      <Pressable style={styles.popoverCard} onPress={(e) => e.stopPropagation()}>
        <View style={styles.popoverHeader}>
          <Text style={styles.popoverTitle}>Effort</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={20} color="#1D1D1D" />
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <TextInput
            style={styles.inlineEffortInput}
            value={value}
            autoFocus
            onChangeText={onChangeValue}
            onBlur={onBlur}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor="#9CA3AF"
          />
          <View style={{ flexDirection: "row", gap: 4 }}>
            {(["hours", "minutes", "days"] as const).map((nextUnit) => (
              <TouchableOpacity
                key={nextUnit}
                style={[
                  styles.inlineUnitChip,
                  unit === nextUnit && styles.inlineUnitChipActive,
                ]}
                onPress={() => onSelectUnit(nextUnit)}
              >
                <Text
                  style={[
                    styles.inlineUnitChipText,
                    unit === nextUnit && { color: "#fff" },
                  ]}
                >
                  {nextUnit}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Pressable>
    </Pressable>
  );
}
