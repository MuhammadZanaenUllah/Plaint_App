import type { Sprint } from "@/features/projects/types/project.types";
import { projectStatusStyle } from "@/features/projects/utils/projectStatus";
import { formatTaskDueDatePkt } from "@/features/tasks/utils/taskDate";
import { prf } from "@/utils/responsive";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type Props = {
  sprints: Sprint[];
  loading?: boolean;
  error?: string | null;
  canManage: boolean;
  onCreate: () => void;
  onEditDate: (sprint: Sprint) => void;
  onDelete: (sprint: Sprint) => void;
};

export default function ProjectSprintsSection({
  sprints,
  loading = false,
  error,
  canManage,
  onCreate,
  onEditDate,
  onDelete,
}: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Sprints ({sprints.length})</Text>
        {canManage ? (
          <TouchableOpacity style={styles.addBtn} onPress={onCreate} hitSlop={8}>
            <Ionicons name="add" size={12} color="#00A876" />
            <Text style={styles.addText}>Create Sprint</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {loading && sprints.length === 0 ? (
        <ActivityIndicator color="#00DEAB" style={styles.loader} />
      ) : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {!loading && sprints.length === 0 ? (
        <Text style={styles.emptyText}>No sprints yet.</Text>
      ) : null}

      {sprints.map((sprint) => {
        const colors = projectStatusStyle(sprint.status);
        return (
          <View key={sprint.id} style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={styles.name} numberOfLines={1}>
                {sprint.name}
              </Text>
              <View style={[styles.badge, { backgroundColor: colors.bg }]}>
                <Text style={[styles.badgeText, { color: colors.text }]}>
                  {sprint.status || "Planning"}
                </Text>
              </View>
            </View>
            <Text style={styles.date}>
              {sprint.due_date ? formatTaskDueDatePkt(sprint.due_date) : "—"}
            </Text>
            {canManage ? (
              <View style={styles.actions}>
                <TouchableOpacity
                  onPress={() => onEditDate(sprint)}
                  hitSlop={8}
                  accessibilityLabel="Change sprint date"
                >
                  <Ionicons name="calendar-outline" size={14} color="#00A876" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => onDelete(sprint)}
                  hitSlop={8}
                  accessibilityLabel="Delete sprint"
                >
                  <Ionicons name="trash-outline" size={14} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 14 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: prf(13),
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Semibold",
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    borderWidth: 1,
    borderColor: "#D1FAE5",
    backgroundColor: "#ECFDF5",
    borderRadius: 7,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  addText: {
    fontSize: prf(10.5),
    color: "#00A876",
    fontFamily: "SF_Pro_Semibold",
  },
  loader: { marginVertical: 8 },
  errorText: {
    fontSize: prf(11),
    color: "#DC2626",
    fontFamily: "SF_Pro_Regular",
    marginBottom: 4,
  },
  emptyText: {
    fontSize: prf(11),
    color: "#9CA3AF",
    fontFamily: "SF_Pro_Regular",
    paddingVertical: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 7,
    marginBottom: 4,
  },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 5 },
  name: {
    flexShrink: 1,
    fontSize: prf(12),
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Medium",
  },
  badge: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: prf(9), fontFamily: "SF_Pro_Semibold" },
  date: {
    fontSize: prf(10.5),
    color: "#6B7280",
    fontFamily: "SF_Pro_Regular",
  },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
});
