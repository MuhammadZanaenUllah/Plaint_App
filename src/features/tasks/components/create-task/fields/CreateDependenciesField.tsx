// Dependencies chip for the create-task sheet (ATS only, AUD-081 phase 1).

import { Ionicons } from "@expo/vector-icons";
import { Text, TouchableOpacity } from "react-native";
import { createTaskFieldStyles as styles } from "../createTaskFieldStyles";

export function CreateDependenciesChip({
  selectedCount,
  onPress,
}: {
  selectedCount: number;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.designChip,
        selectedCount > 0 && styles.designChipDark,
      ]}
      onPress={onPress}
    >
      <Ionicons
        name="git-compare-outline"
        size={14}
        color={selectedCount > 0 ? "#FFF" : "#6B7280"}
      />
      <Text
        allowFontScaling={false}
        style={[
          styles.designChipText,
          selectedCount > 0 && styles.designChipTextWhite,
        ]}
      >
        {selectedCount > 0
          ? `${selectedCount} Dep${selectedCount > 1 ? "s" : ""}`
          : "Dependencies"}
      </Text>
    </TouchableOpacity>
  );
}
