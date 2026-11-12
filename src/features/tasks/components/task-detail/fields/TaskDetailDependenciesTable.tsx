// Read-only dependency table for the task-detail sheet (AUD-081 phase 3).

import SingleTaskTable from "@/components/SingleTaskTable";
import type { TaskRowProps } from "@/components/TaskRow";
import type { DependencyData } from "@/types/task.types";
import { taskDetailFieldStyles as styles } from "../taskDetailFieldStyles";
import { View } from "react-native";

type Props = {
  depRows: TaskRowProps[];
  dependencies: DependencyData[];
  onRemoveDependency: (dependency: DependencyData) => void;
};

export function TaskDetailDependenciesTable({
  depRows,
  dependencies,
  onRemoveDependency,
}: Props) {
  if (depRows.length === 0) return null;

  return (
    <View style={styles.dependencyTableWrap}>
      <SingleTaskTable
        sectionTitle="Dependencies"
        tasks={depRows}
        contained
        readOnly
        canReassign={false}
        onRemoveTask={(row) => {
          const dep = dependencies.find(
            (entry) => Number(entry.task_id) === Number(row.id),
          );
          if (dep) onRemoveDependency(dep);
        }}
      />
    </View>
  );
}
