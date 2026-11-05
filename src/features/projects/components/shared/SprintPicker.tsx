import type { Sprint } from "@/features/projects/types/project.types";
import { formatTaskDueDatePkt } from "@/features/tasks/utils/taskDate";
import { rf } from "@/utils/responsive";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  visible: boolean;
  projectName: string;
  sprints: Sprint[];
  loading: boolean;
  error: string | null;
  saving: boolean;
  onClose: () => void;
  onSelect: (sprint: Sprint | null) => void;
};

export default function SprintPicker({
  visible,
  projectName,
  sprints,
  loading,
  error,
  saving,
  onClose,
  onSelect,
}: Props) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={saving ? undefined : onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Select Sprint</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {projectName}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} disabled={saving} hitSlop={8}>
              <Ionicons name="close" size={22} color="#1D1D1D" />
            </TouchableOpacity>
          </View>

          {loading ? <ActivityIndicator color="#00DEAB" style={styles.loader} /> : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <ScrollView>
            <TouchableOpacity
              style={styles.row}
              disabled={saving}
              onPress={() => onSelect(null)}
            >
              <Ionicons name="remove-circle-outline" size={18} color="#6B7280" />
              <Text style={styles.rowName}>No Sprint</Text>
            </TouchableOpacity>

            {sprints.map((sprint) => (
              <TouchableOpacity
                key={sprint.id}
                style={styles.row}
                disabled={saving}
                onPress={() => onSelect(sprint)}
              >
                <Ionicons name="flag-outline" size={18} color="#00A876" />
                <Text style={styles.rowName} numberOfLines={1}>
                  {sprint.name}
                </Text>
                <Text style={styles.dateBadge}>
                  {formatTaskDueDatePkt(sprint.due_date)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {saving ? (
            <Text style={styles.savingText}>Assigning…</Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    maxHeight: "78%",
    backgroundColor: "#fff",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  title: { fontSize: rf(18), fontFamily: "SF_Pro_Semibold", color: "#1D1D1D" },
  subtitle: {
    marginTop: 2,
    fontSize: rf(12),
    color: "#6B7280",
    fontFamily: "SF_Pro_Regular",
  },
  loader: { marginVertical: 12 },
  errorText: {
    marginTop: 10,
    fontSize: rf(12),
    color: "#DC2626",
    fontFamily: "SF_Pro_Regular",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  rowName: {
    flex: 1,
    fontSize: rf(13.5),
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Regular",
  },
  dateBadge: {
    fontSize: rf(10.5),
    color: "#4B5563",
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    fontFamily: "SF_Pro_Medium",
  },
  savingText: {
    marginTop: 10,
    fontSize: rf(12),
    color: "#6B7280",
    fontFamily: "SF_Pro_Regular",
    textAlign: "center",
  },
});
