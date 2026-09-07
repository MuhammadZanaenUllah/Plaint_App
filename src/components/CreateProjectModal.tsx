import CalendarPicker from "@/components/CalendarPicker";
import FloatingInput from "@/components/FloatingInput";
import { useAuth } from "@/hooks/useAuth";
import { useProjects } from "@/hooks/useProjects";
import { Project, ProjectStatus, ProjectUser } from "@/types/project.types";
import { rf } from "@/utils/responsive";
import { showError } from "@/utils/toast";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";

const PROJECT_STATUSES: ProjectStatus[] = [
  "Planning",
  "In Progress",
  "Pending",
  "Completed",
];

interface CreateProjectModalProps {
  visible: boolean;
  onClose: () => void;
  onCreated?: (project: Project) => void;
}

function formatDueLabel(date: Date | null): string {
  if (!date) return "No due date";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function CreateProjectModal({
  visible,
  onClose,
  onCreated,
}: CreateProjectModalProps) {
  const { state, fetchProjectUsers, createProject } = useProjects();
  const { state: authState } = useAuth();
  const currentUserId = authState.user?.id ?? 0;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ownerId, setOwnerId] = useState<number>(currentUserId);
  const [status, setStatus] = useState<ProjectStatus>("Planning");
  const [dueDate, setDueDate] = useState<Date | null>(null);

  const [showOwnerPicker, setShowOwnerPicker] = useState(false);
  const [ownerQuery, setOwnerQuery] = useState("");
  const [showDuePicker, setShowDuePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Prime the owner roster when the modal opens (no synchronous state writes —
  // the form is reset on close instead).
  useEffect(() => {
    if (!visible) return;
    if (state.projectUsers.length === 0) {
      fetchProjectUsers().catch(() => {});
    }
  }, [visible, fetchProjectUsers, state.projectUsers.length]);

  const ownerLabel = useMemo(() => {
    const found = state.projectUsers.find((u) => u.id === ownerId);
    if (found) {
      return `${found.first_name} ${found.last_name}`.trim();
    }
    if (ownerId === currentUserId) {
      const nameStr =
        `${authState.user?.first_name ?? ""} ${authState.user?.last_name ?? ""}`.trim();
      return nameStr || "You";
    }
    return `User #${ownerId}`;
  }, [ownerId, state.projectUsers, authState.user, currentUserId]);

  const filteredUsers = useMemo(() => {
    const q = ownerQuery.trim().toLowerCase();
    const list = state.projectUsers.filter((u) => u.id !== currentUserId);
    const sorted = [...list].sort((a, b) =>
      `${a.first_name} ${a.last_name}`.localeCompare(
        `${b.first_name} ${b.last_name}`,
      ),
    );
    if (!q) return sorted;
    return sorted.filter((u) =>
      `${u.first_name} ${u.last_name}`.toLowerCase().includes(q),
    );
  }, [state.projectUsers, ownerQuery, currentUserId]);

  const handleClose = () => {
    Keyboard.dismiss();
    setName("");
    setDescription("");
    setOwnerId(currentUserId);
    setStatus("Planning");
    setDueDate(null);
    setShowOwnerPicker(false);
    setShowDuePicker(false);
    onClose();
  };

  const handleCreate = async () => {
    Keyboard.dismiss();
    if (!name.trim()) {
      showError("Error", "Please enter a project name.");
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      const project = await createProject({
        name: name.trim(),
        owner: ownerId,
        status,
        description: description.trim() || undefined,
        due_date: dueDate ? dueDate.toISOString() : undefined,
      });
      setName("");
      setDescription("");
      setOwnerId(currentUserId);
      setStatus("Planning");
      setDueDate(null);
      setShowOwnerPicker(false);
      setShowDuePicker(false);
      onCreated?.(project);
    } catch (err) {
      showError(
        "Error",
        err instanceof Error ? err.message : "Failed to create project",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={StyleSheet.absoluteFill}
        pointerEvents="box-none"
      >
        <View style={styles.kavWrapper}>
          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.sheet}>
              {/* ── Header ── */}
              <View style={styles.header}>
                <Text style={styles.mainTitle}>Create Project</Text>
                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={handleClose}
                  activeOpacity={0.7}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={18} color="#1D1D1D" />
                </TouchableOpacity>
              </View>

              {/* ── Fields ── */}
              <View style={styles.fieldsContainer}>
                <FloatingInput
                  label="Project name"
                  value={name}
                  onChangeText={setName}
                  autoCorrect={false}
                  maxLength={120}
                />

                <FloatingInput
                  label="Description (optional)"
                  value={description}
                  onChangeText={setDescription}
                  autoCorrect={false}
                  maxLength={2000}
                />

                {/* Owner */}
                <Text style={styles.fieldLabel}>Owner</Text>
                <TouchableOpacity
                  style={styles.selectionPill}
                  activeOpacity={0.8}
                  onPress={() => {
                    setShowOwnerPicker((v) => !v);
                    setShowDuePicker(false);
                  }}
                >
                  <View style={styles.selectionPillAvatar}>
                    <Text style={styles.selectionPillAvatarText}>
                      {ownerLabel.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.selectionPillText} numberOfLines={1}>
                    {ownerLabel}
                  </Text>
                  <Ionicons
                    name={showOwnerPicker ? "chevron-up" : "chevron-down"}
                    size={16}
                    color="#4B5563"
                  />
                </TouchableOpacity>
                {showOwnerPicker && (
                  <View style={styles.pickerPanel}>
                    <FloatingInput
                      label="Search people"
                      value={ownerQuery}
                      onChangeText={setOwnerQuery}
                      autoCorrect={false}
                      containerStyle={{ marginBottom: 8 }}
                    />
                    <ScrollView
                      style={styles.pickerList}
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator={false}
                    >
                      {filteredUsers.map((u: ProjectUser) => {
                        const selected = u.id === ownerId;
                        return (
                          <TouchableOpacity
                            key={u.id}
                            style={[
                              styles.pickerRow,
                              selected && styles.pickerRowSelected,
                            ]}
                            activeOpacity={0.7}
                            onPress={() => {
                              setOwnerId(u.id);
                              setShowOwnerPicker(false);
                              setOwnerQuery("");
                            }}
                          >
                            <View style={styles.pickerRowAvatar}>
                              <Text style={styles.pickerRowAvatarText}>
                                {`${u.first_name} ${u.last_name}`
                                  .trim()
                                  .charAt(0)
                                  .toUpperCase()}
                              </Text>
                            </View>
                            <Text
                              style={styles.pickerRowText}
                              numberOfLines={1}
                            >
                              {`${u.first_name} ${u.last_name}`.trim()}
                            </Text>
                            {selected && (
                              <Ionicons
                                name="checkmark"
                                size={18}
                                color="#00DEAB"
                              />
                            )}
                          </TouchableOpacity>
                        );
                      })}
                      {filteredUsers.length === 0 && (
                        <Text style={styles.pickerEmpty}>
                          No people found.
                        </Text>
                      )}
                    </ScrollView>
                  </View>
                )}

                {/* Status */}
                <Text style={styles.fieldLabel}>Status</Text>
                <View style={styles.statusRow}>
                  {PROJECT_STATUSES.map((s) => {
                    const active = s === status;
                    return (
                      <TouchableOpacity
                        key={s}
                        style={[
                          styles.statusChip,
                          active && styles.statusChipActive,
                        ]}
                        activeOpacity={0.85}
                        onPress={() => setStatus(s)}
                      >
                        <Text
                          style={[
                            styles.statusChipText,
                            active && styles.statusChipTextActive,
                          ]}
                        >
                          {s}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Due date */}
                <Text style={styles.fieldLabel}>Due date</Text>
                <TouchableOpacity
                  style={styles.selectionPill}
                  activeOpacity={0.8}
                  onPress={() => {
                    setShowDuePicker((v) => !v);
                    setShowOwnerPicker(false);
                  }}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={16}
                    color={dueDate ? "#1D1D1D" : "#4B5563"}
                  />
                  <Text
                    style={[
                      styles.selectionPillText,
                      !dueDate && styles.selectionPillTextMuted,
                    ]}
                    numberOfLines={1}
                  >
                    {formatDueLabel(dueDate)}
                  </Text>
                  <Ionicons
                    name={showDuePicker ? "chevron-up" : "chevron-down"}
                    size={16}
                    color="#4B5563"
                  />
                </TouchableOpacity>
                {showDuePicker && (
                  <View style={styles.pickerPanel}>
                    <CalendarPicker
                      compact
                      startDate={dueDate}
                      endDate={dueDate}
                      onSelectStart={(d) => setDueDate(d)}
                      onSelectEnd={(d) => setDueDate(d)}
                      onDone={() => setShowDuePicker(false)}
                    />
                  </View>
                )}
              </View>

              {/* ── Create button ── */}
              <TouchableOpacity
                style={[
                  styles.createBtn,
                  (submitting || !name.trim()) && styles.createBtnDisabled,
                ]}
                activeOpacity={0.85}
                disabled={submitting || !name.trim()}
                onPress={handleCreate}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.createBtnText}>Create Project</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  kavWrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  sheetScroll: {
    width: "100%",
  },
  sheetScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 24,
  },
  sheet: {
    backgroundColor: "#fff",
    borderRadius: 24,
    width: "90%",
    paddingTop: 24,
    paddingBottom: 24,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 20,
    marginBottom: 4,
  },
  mainTitle: {
    fontSize: rf(20),
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  fieldsContainer: {
    paddingHorizontal: 20,
  },
  fieldLabel: {
    marginTop: 16,
    marginBottom: 8,
    fontSize: rf(13),
    fontFamily: "SF_Pro_Medium",
    color: "#1D1D1D",
  },
  selectionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#E6E6E6",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#fff",
  },
  selectionPillAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#E6FBF5",
    alignItems: "center",
    justifyContent: "center",
  },
  selectionPillAvatarText: {
    color: "#1D1D1D",
    fontSize: rf(13),
    fontFamily: "SF_Pro_Semibold",
  },
  selectionPillText: {
    flex: 1,
    color: "#1D1D1D",
    fontSize: rf(14),
    fontFamily: "SF_Pro_Medium",
  },
  selectionPillTextMuted: {
    color: "#8E8E93",
  },
  pickerPanel: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#F0F0F0",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#FAFAFA",
  },
  pickerList: {
    maxHeight: 200,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  pickerRowSelected: {
    backgroundColor: "#E6FBF5",
  },
  pickerRowAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
  },
  pickerRowAvatarText: {
    color: "#fff",
    fontSize: rf(11),
    fontFamily: "SF_Pro_Semibold",
  },
  pickerRowText: {
    flex: 1,
    color: "#1D1D1D",
    fontSize: rf(14),
    fontFamily: "SF_Pro_Regular",
  },
  pickerEmpty: {
    color: "#8E8E93",
    fontSize: rf(13),
    fontFamily: "SF_Pro_Regular",
    textAlign: "center",
    paddingVertical: 12,
  },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#F4F4F4",
    borderWidth: 1,
    borderColor: "transparent",
  },
  statusChipActive: {
    backgroundColor: "#1D1D1D",
  },
  statusChipText: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Semibold",
    color: "#4B5563",
  },
  statusChipTextActive: {
    color: "#fff",
  },
  createBtn: {
    backgroundColor: "#00DEAB",
    borderRadius: 10,
    marginTop: 24,
    marginHorizontal: 20,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  createBtnDisabled: {
    opacity: 0.5,
  },
  createBtnText: {
    color: "#fff",
    fontSize: rf(15),
    fontFamily: "SF_Pro_Semibold",
  },
});