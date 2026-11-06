// Recurring-task read-only row for the task-detail sheet (AUD-081 phase 3).

import { TaskDetailInfoRow } from "../TaskDetailInfoRow";
import { taskDetailFieldStyles as styles } from "../taskDetailFieldStyles";
import { Text } from "react-native";

export function TaskDetailRecurringRow({
  isRecurring,
}: {
  isRecurring: boolean;
}) {
  return (
    <TaskDetailInfoRow icon="repeat-outline" label="Recurring Task:">
      <Text style={styles.infoValue}>{isRecurring ? "Yes" : "No"}</Text>
    </TaskDetailInfoRow>
  );
}
