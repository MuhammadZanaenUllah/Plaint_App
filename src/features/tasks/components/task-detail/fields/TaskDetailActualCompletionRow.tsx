// Actual-completion row for the task-detail sheet (AUD-081 phase 3).

import { TaskDetailInfoRow } from "../TaskDetailInfoRow";
import { taskDetailFieldStyles as styles } from "../taskDetailFieldStyles";
import { Text } from "react-native";

export function TaskDetailActualCompletionRow({
  display,
}: {
  display: string;
}) {
  return (
    <TaskDetailInfoRow icon="calendar-outline" label="Actual Completion:">
      <Text style={styles.infoValue}>{display}</Text>
    </TaskDetailInfoRow>
  );
}
