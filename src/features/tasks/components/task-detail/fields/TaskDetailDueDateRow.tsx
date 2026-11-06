// Estimated-completion / due-date row for the task-detail sheet
// (AUD-081 phase 3).

import { TaskDetailInfoRow } from "../TaskDetailInfoRow";
import { taskDetailFieldStyles as styles } from "../taskDetailFieldStyles";
import { Ionicons } from "@expo/vector-icons";
import { Text, TouchableOpacity } from "react-native";

type Props = {
  display: string;
  canEdit: boolean;
  isAts: boolean;
  onPress: () => void;
};

export function TaskDetailDueDateRow({
  display,
  canEdit,
  isAts,
  onPress,
}: Props) {
  return (
    <TaskDetailInfoRow
      icon="calendar-outline"
      label="Est. Completion:"
      labelExtra={
        <Ionicons
          name="information-circle-outline"
          size={12}
          color="#9CA3AF"
          style={{ marginLeft: 2 }}
        />
      }
    >
      <TouchableOpacity
        activeOpacity={0.7}
        disabled={!canEdit || isAts}
        style={(!canEdit || isAts) && { opacity: 0.7 }}
        onPress={onPress}
      >
        <Text style={styles.infoValue}>{display}</Text>
      </TouchableOpacity>
    </TaskDetailInfoRow>
  );
}
