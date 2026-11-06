// Dependency pills row for the task-detail sheet (AUD-081 phase 3).

import type { DependencyData } from "@/types/task.types";
import { TaskDetailInfoRow } from "../TaskDetailInfoRow";
import { taskDetailFieldStyles as styles } from "../taskDetailFieldStyles";
import { Ionicons } from "@expo/vector-icons";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

type Props = {
  dependencies: DependencyData[];
  hasDependencies: boolean;
  canManageDependencies: boolean;
  onRemoveDependency: (dependency: DependencyData) => void;
  onAddDependency: () => void;
};

export function TaskDetailDependenciesRow({
  dependencies,
  hasDependencies,
  canManageDependencies,
  onRemoveDependency,
  onAddDependency,
}: Props) {
  return (
    <TaskDetailInfoRow icon="git-compare-outline" label="Dependencies:">
      {hasDependencies ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          nestedScrollEnabled
        >
          {dependencies.map((dep, idx) => (
            <View key={`${dep.task_id}-${idx}`} style={styles.depPill}>
              <Text style={styles.depPillText} numberOfLines={1}>
                {dep.title}
              </Text>
              {canManageDependencies && (
                <TouchableOpacity
                  onPress={() => onRemoveDependency(dep)}
                  hitSlop={8}
                  style={{ marginLeft: 4 }}
                >
                  <Ionicons name="close" size={12} color="#00DEAB" />
                </TouchableOpacity>
              )}
            </View>
          ))}
        </ScrollView>
      ) : (
        <Text style={styles.infoValue}>—</Text>
      )}
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
