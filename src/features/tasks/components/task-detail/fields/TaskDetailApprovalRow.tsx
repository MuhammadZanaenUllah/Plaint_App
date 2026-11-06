// Approval-required row for the task-detail sheet (AUD-081 phase 3).

import { TaskDetailInfoRow } from "../TaskDetailInfoRow";
import { taskDetailFieldStyles as styles } from "../taskDetailFieldStyles";
import { Text, TouchableOpacity } from "react-native";

type Props = {
  approvalRequired: boolean;
  canEdit: boolean;
  onPress: () => void;
};

export function TaskDetailApprovalRow({
  approvalRequired,
  canEdit,
  onPress,
}: Props) {
  return (
    <TaskDetailInfoRow icon="checkbox-outline" label="Approval Required:">
      <TouchableOpacity
        activeOpacity={0.7}
        disabled={!canEdit}
        style={!canEdit && { opacity: 0.7 }}
        onPress={onPress}
      >
        <Text style={styles.infoValue}>
          {approvalRequired ? "Yes" : "No"}
        </Text>
      </TouchableOpacity>
    </TaskDetailInfoRow>
  );
}
