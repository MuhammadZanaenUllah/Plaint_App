import { useProjects } from "@/context/ProjectContext";
import { Project } from "@/types/project.types";
import { TaskRowProps } from "@/components/TaskRow";
import { rf } from "@/utils/responsive";
import { showError, showSuccess } from "@/utils/toast";
import { triggerHaptic } from "@/utils/haptics";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export type AssignTaskProjectModalProps = {
  visible: boolean;
  onClose: () => void;
  task: TaskRowProps | null;
  onAssign: (projectId: number, project: Project) => Promise<void>;
};

export default function AssignTaskProjectModal({
  visible,
  onClose,
  task,
  onAssign,
}: AssignTaskProjectModalProps) {
  const { state: projectState, fetchProjects } = useProjects();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Initialize selected project ID from task if existing
  useEffect(() => {
    if (visible && task) {
      setSearchQuery("");
      setSubmitting(false);
      const rawProjectId = (task as any)?._raw?.project_id;
      if (rawProjectId && typeof rawProjectId === "number" && rawProjectId > 0) {
        setSelectedProjectId(rawProjectId);
      } else {
        setSelectedProjectId(null);
      }
    }
  }, [visible, task]);

  // Refresh projects if empty
  useEffect(() => {
    if (visible && projectState.projects.length === 0) {
      fetchProjects({ silent: true }).catch(() => {});
    }
  }, [visible, projectState.projects.length, fetchProjects]);

  const projects = projectState.projects;

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const q = searchQuery.toLowerCase().trim();
    return projects.filter((p) => p.name?.toLowerCase().includes(q));
  }, [projects, searchQuery]);

  if (!visible || !task) return null;

  const handleSelect = (project: Project) => {
    triggerHaptic("selection");
    setSelectedProjectId(project.id);
  };

  const handleConfirm = async () => {
    if (!selectedProjectId) {
      showError("Selection Required", "Please select a project to assign.");
      return;
    }
    const chosenProject = projects.find((p) => p.id === selectedProjectId);
    if (!chosenProject) {
      showError("Error", "Selected project not found.");
      return;
    }

    setSubmitting(true);
    try {
      await onAssign(selectedProjectId, chosenProject);
      triggerHaptic("success");
      showSuccess(
        "Project Assigned",
        `Task assigned to "${chosenProject.name}".`,
      );
      onClose();
    } catch (err: any) {
      showError(
        "Assignment Failed",
        err?.message || "Failed to assign project to task.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={styles.title}>Assign to Project</Text>
              <Text style={styles.taskTitle} numberOfLines={1}>
                {task.title}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>

          {/* Search Box */}
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={15} color="#9CA3AF" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search projects..."
              placeholderTextColor="#9CA3AF"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
            {searchQuery.length > 0 && Platform.OS === "android" ? (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <Ionicons name="close-circle" size={16} color="#9CA3AF" />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Projects List */}
          <ScrollView
            style={styles.listScroll}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {projectState.loading && projects.length === 0 ? (
              <View style={styles.centerBox}>
                <ActivityIndicator size="small" color="#00DEAB" />
                <Text style={styles.emptyText}>Loading projects...</Text>
              </View>
            ) : filteredProjects.length === 0 ? (
              <View style={styles.centerBox}>
                <Ionicons name="folder-open-outline" size={32} color="#D1D5DB" />
                <Text style={styles.emptyText}>
                  {searchQuery.trim()
                    ? "No projects match your search"
                    : "No projects found"}
                </Text>
              </View>
            ) : (
              filteredProjects.map((item) => {
                const isSelected = item.id === selectedProjectId;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.projectItem,
                      isSelected && styles.projectItemSelected,
                    ]}
                    onPress={() => handleSelect(item)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.projectIconBox,
                        isSelected && styles.projectIconBoxSelected,
                      ]}
                    >
                      <Ionicons
                        name="folder-outline"
                        size={16}
                        color={isSelected ? "#00DEAB" : "#6B7280"}
                      />
                    </View>

                    <View style={styles.projectInfo}>
                      <Text
                        style={[
                          styles.projectName,
                          isSelected && styles.projectNameSelected,
                        ]}
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                      {item.status ? (
                        <Text style={styles.projectStatus} numberOfLines={1}>
                          {item.status}
                        </Text>
                      ) : null}
                    </View>

                    <View
                      style={[
                        styles.radioOuter,
                        isSelected && styles.radioOuterSelected,
                      ]}
                    >
                      {isSelected ? <View style={styles.radioInner} /> : null}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>

          {/* Footer Action Buttons */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onClose}
              disabled={submitting}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.assignBtn,
                (!selectedProjectId || submitting) && styles.assignBtnDisabled,
              ]}
              onPress={handleConfirm}
              disabled={!selectedProjectId || submitting}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.assignBtnText}>Assign Project</Text>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "80%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  title: {
    fontSize: rf(16),
    fontFamily: "SF_Pro_Bold",
    color: "#111827",
  },
  taskTitle: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Regular",
    color: "#6B7280",
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
    borderRadius: 6,
    backgroundColor: "#F3F4F6",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 38,
    gap: 6,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: rf(12.5),
    fontFamily: "SF_Pro_Regular",
    color: "#111827",
    paddingVertical: 0,
  },
  listScroll: {
    maxHeight: 280,
  },
  listContent: {
    gap: 8,
    paddingBottom: 4,
  },
  centerBox: {
    paddingVertical: 32,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptyText: {
    fontSize: rf(12.5),
    fontFamily: "SF_Pro_Regular",
    color: "#9CA3AF",
  },
  projectItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    gap: 10,
  },
  projectItemSelected: {
    borderColor: "#00DEAB",
    backgroundColor: "#F0FDF9",
  },
  projectIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  projectIconBoxSelected: {
    backgroundColor: "#CCF8EF",
  },
  projectInfo: {
    flex: 1,
    minWidth: 0,
  },
  projectName: {
    fontSize: rf(13),
    fontFamily: "SF_Pro_Medium",
    color: "#1F2937",
  },
  projectNameSelected: {
    color: "#059669",
    fontFamily: "SF_Pro_Bold",
  },
  projectStatus: {
    fontSize: rf(10.5),
    fontFamily: "SF_Pro_Regular",
    color: "#9CA3AF",
    marginTop: 1,
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterSelected: {
    borderColor: "#00DEAB",
  },
  radioInner: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: "#00DEAB",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
  },
  cancelBtnText: {
    fontSize: rf(12.5),
    fontFamily: "SF_Pro_Medium",
    color: "#4B5563",
  },
  assignBtn: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: "#00DEAB",
    minWidth: 110,
    alignItems: "center",
    justifyContent: "center",
  },
  assignBtnDisabled: {
    backgroundColor: "#9CEFD9",
  },
  assignBtnText: {
    fontSize: rf(12.5),
    fontFamily: "SF_Pro_Bold",
    color: "#FFFFFF",
  },
});
