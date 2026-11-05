import type { ProjectEntity } from "@/features/projects/types/project.types";
import { projectStatusStyle } from "@/features/projects/utils/projectStatus";
import { rf } from "@/utils/responsive";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  visible: boolean;
  projects: ProjectEntity[];
  loading: boolean;
  error: string | null;
  canCreateProject: boolean;
  onClose: () => void;
  onSelect: (project: ProjectEntity) => void;
  onCreateProject: () => void;
};

export default function ProjectPicker({
  visible,
  projects,
  loading,
  error,
  canCreateProject,
  onClose,
  onSelect,
  onCreateProject,
}: Props) {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setSearch(""), 0);
    return () => clearTimeout(timer);
  }, [visible]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter((project) =>
      project.name.toLowerCase().includes(query),
    );
  }, [projects, search]);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}>
          <View style={styles.header}>
            <Text style={styles.title}>Select Project</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color="#1D1D1D" />
            </TouchableOpacity>
          </View>

          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={16} color="#9CA3AF" />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search projects..."
              placeholderTextColor="#9CA3AF"
            />
          </View>

          {canCreateProject ? (
            <TouchableOpacity
              style={styles.createRow}
              onPress={onCreateProject}
            >
              <Ionicons name="add-circle-outline" size={18} color="#00A876" />
              <Text style={styles.createText}>Create a new project</Text>
            </TouchableOpacity>
          ) : null}

          {loading ? <ActivityIndicator color="#00DEAB" style={styles.loader} /> : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {!loading && filtered.length === 0 ? (
              <Text style={styles.emptyText}>No projects found.</Text>
            ) : null}
            {filtered.map((project) => {
              const colors = projectStatusStyle(project.status);
              return (
                <TouchableOpacity
                  key={project.id}
                  style={styles.row}
                  onPress={() => onSelect(project)}
                >
                  <Text style={styles.rowName} numberOfLines={1}>
                    {project.name}
                  </Text>
                  <View style={[styles.badge, { backgroundColor: colors.bg }]}>
                    <Text style={[styles.badgeText, { color: colors.text }]}>
                      {project.status}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
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
    maxHeight: "82%",
    backgroundColor: "#fff",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  title: { fontSize: rf(18), fontFamily: "SF_Pro_Semibold", color: "#1D1D1D" },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: rf(13),
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Regular",
    padding: 0,
  },
  createRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  createText: {
    fontSize: rf(13),
    color: "#00A876",
    fontFamily: "SF_Pro_Semibold",
  },
  loader: { marginVertical: 12 },
  errorText: {
    marginTop: 10,
    fontSize: rf(12),
    color: "#DC2626",
    fontFamily: "SF_Pro_Regular",
  },
  list: { marginTop: 4 },
  emptyText: {
    paddingVertical: 16,
    fontSize: rf(12.5),
    color: "#9CA3AF",
    fontFamily: "SF_Pro_Regular",
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  rowName: {
    flex: 1,
    fontSize: rf(13.5),
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Regular",
  },
  badge: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontSize: rf(10), fontFamily: "SF_Pro_Semibold" },
});
