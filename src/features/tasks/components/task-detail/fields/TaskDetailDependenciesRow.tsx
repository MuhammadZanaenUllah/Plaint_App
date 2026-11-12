// Dependency field row for the task-detail sheet (AUD-081 phase 3).
// Selected dependency names are shown in the Dependencies table below, so
// this row only exposes the add action.

import { TaskDetailInfoRow } from "../TaskDetailInfoRow";
import { taskDetailFieldStyles as styles } from "../taskDetailFieldStyles";
import { Ionicons } from "@expo/vector-icons";
import { Text, TouchableOpacity } from "react-native";

type Props = {
  hasDependencies: boolean;
  canManageDependencies: boolean;
  onAddDependency: () => void;
};

export function TaskDetailDependenciesRow({
  hasDependencies,
  canManageDependencies,
  onAddDependency,
}: Props) {
  return (
    <TaskDetailInfoRow icon="git-compare-outline" label="Dependencies:">
      {!hasDependencies ? <Text style={styles.infoValue}>—</Text> : null}
      {canManageDependencies && (
        <TouchableOpacity
          style={styles.addDependencyBtn}
          onPress={onAddDependency}
        >
          <Ionicons name="add" size={13} color="#00DEAB" />
          <Text style={styles.addDependencyText}>Add</Text>
        </TouchableOpacity>
      )}
    </TaskDetailInfoRow>
  );
}
