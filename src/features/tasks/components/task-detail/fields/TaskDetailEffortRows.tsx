// ATS effort / effort-logs rows for the task-detail sheet (AUD-081 phase 3).

import { formatEffort, toMinutes } from "@/features/tasks/utils/taskEffort";
import { TaskDetailInfoRow } from "../TaskDetailInfoRow";
import { taskDetailFieldStyles as styles } from "../taskDetailFieldStyles";
import { Ionicons } from "@expo/vector-icons";
import { Text, TouchableOpacity } from "react-native";

type Props = {
  isAts: boolean;
  canEdit: boolean;
  editEffortHours: string;
  editEffortUnit: string;
  effortLogsDisplay: string;
  onPressEffort: () => void;
  onPressLogs: () => void;
};

export function TaskDetailEffortRows({
  isAts,
  canEdit,
  editEffortHours,
  editEffortUnit,
  effortLogsDisplay,
  onPressEffort,
  onPressLogs,
}: Props) {
  if (!isAts) return null;

  return (
    <>
      <TaskDetailInfoRow icon="time-outline" label="Efforts:">
        <TouchableOpacity
          activeOpacity={0.7}
          disabled={!canEdit}
          style={!canEdit && { opacity: 0.7 }}
          onPress={onPressEffort}
        >
          <Text style={styles.infoValue}>
            {formatEffort(
              toMinutes(
                editEffortHours || "0",
                editEffortUnit as "minutes" | "hours" | "days",
              ),
              editEffortUnit as "minutes" | "hours" | "days",
            )}
          </Text>
        </TouchableOpacity>
      </TaskDetailInfoRow>

      <TaskDetailInfoRow
        icon="time-outline"
        label="Effort Logs:"
        labelExtra={
          <Ionicons
            name="information-circle-outline"
            size={12}
            color="#9CA3AF"
            style={{ marginLeft: 2 }}
          />
        }
      >
        <TouchableOpacity activeOpacity={0.7} onPress={onPressLogs}>
          <Text style={[styles.infoValue, { color: "#00DEAB" }]}>
            {effortLogsDisplay}
          </Text>
        </TouchableOpacity>
      </TaskDetailInfoRow>
    </>
  );
}
