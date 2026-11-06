// Assigned-to row for the task-detail sheet (AUD-081 phase 3).

import Avatar from "@/components/Avatar";
import { TaskDetailInfoRow } from "../TaskDetailInfoRow";
import { taskDetailFieldStyles as styles } from "../taskDetailFieldStyles";
import { Text, TouchableOpacity } from "react-native";

type Props = {
  name: string;
  image?: string | null;
  canEdit: boolean;
  onPress: () => void;
};

export function TaskDetailAssigneeRow({
  name,
  image,
  canEdit,
  onPress,
}: Props) {
  return (
    <TaskDetailInfoRow icon="people-outline" label="Assigned to:">
      <TouchableOpacity
        style={[styles.assignedRow, !canEdit && { opacity: 0.7 }]}
        activeOpacity={0.7}
        disabled={!canEdit}
        onPress={onPress}
      >
        <Avatar name={name} imagePath={image} size={20} borderRadius={4} />
        <Text style={styles.infoValue}>{name || "Select User"}</Text>
      </TouchableOpacity>
    </TaskDetailInfoRow>
  );
}
