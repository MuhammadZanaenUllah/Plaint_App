// Approval-required chip + options for the create-task sheet (AUD-081 phase 1).

import { Ionicons } from "@expo/vector-icons";
import { Text, TouchableOpacity, View } from "react-native";
import { createTaskFieldStyles as styles } from "../createTaskFieldStyles";

export function CreateApprovalChip({
  active,
  selectedApproval,
  onPress,
}: {
  active: boolean;
  selectedApproval: string | null;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.designChip,
        (active || selectedApproval === "Yes") && styles.designChipDark,
      ]}
      onPress={onPress}
    >
      <Ionicons
        name="folder"
        size={16}
        color={active || selectedApproval === "Yes" ? "#FFF" : "#6B7280"}
      />
      <Text
        allowFontScaling={false}
        style={[
          styles.designChipText,
          (active || selectedApproval === "Yes") && styles.designChipTextWhite,
        ]}
      >
        Approval Required
      </Text>
    </TouchableOpacity>
  );
}

export function CreateApprovalPanel({
  selectedApproval,
  onSelectApproval,
}: {
  selectedApproval: string | null;
  onSelectApproval: (value: string) => void;
}) {
  return (
    <View style={{ width: "100%", marginVertical: 6 }}>
      <View style={styles.inlineOptionsRow}>
        <TouchableOpacity
          style={[
            styles.pillBtn,
            selectedApproval === "Yes" ? styles.pillTeal : styles.pillGrey,
          ]}
          onPress={() => onSelectApproval("Yes")}
        >
          <Ionicons
            name="checkmark"
            size={14}
            color={selectedApproval === "Yes" ? "#fff" : "#71717A"}
          />
          <Text
            allowFontScaling={false}
            style={[
              styles.pillText,
              selectedApproval === "Yes" && styles.pillTextWhite,
            ]}
          >
            Yes
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.pillBtn,
            selectedApproval === "No" ? styles.pillTeal : styles.pillGrey,
          ]}
          onPress={() => onSelectApproval("No")}
        >
          <Ionicons
            name="close"
            size={14}
            color={selectedApproval === "No" ? "#fff" : "#71717A"}
          />
          <Text
            allowFontScaling={false}
            style={[
              styles.pillText,
              selectedApproval === "No" && styles.pillTextWhite,
            ]}
          >
            No
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
