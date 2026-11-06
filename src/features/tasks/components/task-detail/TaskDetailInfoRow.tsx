// Shared label/value row for the task-detail fields (AUD-081 phase 3).

import { taskDetailFieldStyles as styles } from "./taskDetailFieldStyles";
import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Text, View } from "react-native";

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  labelExtra?: ReactNode;
  children: ReactNode;
};

export function TaskDetailInfoRow({
  icon,
  label,
  labelExtra,
  children,
}: Props) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoLabelWrap}>
        <Ionicons
          name={icon}
          size={16}
          color="#AAAAAA"
          style={{ marginRight: 6 }}
        />
        <Text style={styles.infoLabel}>{label}</Text>
        {labelExtra}
      </View>
      <View style={styles.infoValueWrap}>{children}</View>
    </View>
  );
}
