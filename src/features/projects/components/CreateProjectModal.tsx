import CalendarPicker from "@/components/CalendarPicker";
import DocumentPickerButton from "@/features/attachments/components/DocumentPickerButton";
import type { SelectedFile } from "@/features/attachments/types/attachment.types";
import { useProjectsStore } from "@/features/projects/store/projectsStore";
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_COLORS,
} from "@/features/projects/utils/projectStatus";
import { validateProject } from "@/features/projects/utils/projectValidation";
import type {
  CanonicalProjectStatus,
  CreateProjectPayload,
} from "@/features/projects/types/project.types";
import { reportTaskError } from "@/features/tasks/utils/taskError";
import { validateAttachment } from "@/features/tasks/utils/taskValidation";
import { toCalendarDateOnly, pktTodayStart } from "@/features/tasks/utils/taskDate";
import { useTasks } from "@/hooks/useTasks";
import { prf } from "@/utils/responsive";
import { showError, showSuccess } from "@/utils/toast";
import { Ionicons } from "@expo/vector-icons";
import ModalCloseButton from "@/components/ModalCloseButton";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  visible: boolean;
  onClose: () => void;
  companyId: number;
  companyIdentifier: string;
  onCreated?: (projectId: number) => void;
};

export default function CreateProjectModal({
  visible,
  onClose,
  companyId,
  companyIdentifier,
  onCreated,
}: Props) {
  const insets = useSafeAreaInsets();
  const { state: taskState } = useTasks();
  const {
    projectUsers,
    loadProjectUsers,
    createProject,
    uploadAttachment,
  } = useProjectsStore();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ownerId, setOwnerId] = useState<number | null>(null);
  const [status, setStatus] = useState<CanonicalProjectStatus>("Planning");
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [ownerPickerOpen, setOwnerPickerOpen] = useState(false);
  const [attachments, setAttachments] = useState<SelectedFile[]>([]);
  const [saving, setSaving] = useState(false);
  const submitLockRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      setName("");
      setDescription("");
      setOwnerId(null);
      setStatus("Planning");
      setDueDate(pktTodayStart());
      setDatePickerOpen(false);
      setOwnerPickerOpen(false);
      setAttachments([]);
      setSaving(false);
      submitLockRef.current = false;
    }, 0);
    if (companyId) {
      loadProjectUsers(companyId).catch((error) =>
        reportTaskError("Project owner list failed to load", error),
      );
    }
    return () => clearTimeout(timer);
  }, [visible, companyId, loadProjectUsers]);

  const ownerOptions = useMemo(() => {
    const merged = new Map<number, string>();
    for (const user of projectUsers) {
      merged.set(
        user.id,
        `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() ||
          `User #${user.id}`,
      );
    }
    for (const owner of taskState.taskOwners ?? []) {
      if (!merged.has(owner.id)) {
        merged.set(
          owner.id,
          `${owner.first_name ?? ""} ${owner.last_name ?? ""}`.trim() ||
            owner.full_name ||
            `User #${owner.id}`,
        );
      }
    }
    return [...merged.entries()].map(([id, label]) => ({ id, label }));
  }, [projectUsers, taskState.taskOwners]);

  const ownerName =
    ownerOptions.find((owner) => owner.id === ownerId)?.label ?? "Unassigned";

  if (!visible) return null;

  const handlePickFiles = (files: SelectedFile[]) => {
    const accepted: SelectedFile[] = [];
    for (const file of files) {
      const validation = validateAttachment(file);
      if (!validation.valid) {
        showError(
          "Attachment Rejected",
          `"${file.name}": ${Object.values(validation.errors)[0]}`,
        );
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length) setAttachments((prev) => [...prev, ...accepted]);
  };

  const handleCreate = async () => {
    if (submitLockRef.current) return;
    const dueDateValue = dueDate ? dueDate.toISOString() : "";
    const validation = validateProject({
      name,
      dueDate: dueDateValue,
      status,
    });
    if (!validation.valid) {
      showError("Validation", Object.values(validation.errors).join("\n"));
      return;
    }

    const payload: CreateProjectPayload = {
      name: name.trim(),
      ...(ownerId ? { owner: ownerId } : {}),
      status,
      description,
      company_id: companyId,
      company_identifier: companyIdentifier,
      due_date: dueDateValue,
    };

    submitLockRef.current = true;
    setSaving(true);
    try {
      const result = await createProject(payload);
      if (!result.ok) {
        showError("Create Failed", result.message);
        return;
      }

      const projectId = Number(result.data.id);
      for (const file of attachments) {
        const formData = new FormData();
        formData.append("file", {
          uri: file.uri,
          name: file.name || "attachment",
          type: file.mimeType || "application/octet-stream",
        } as unknown as Blob);
        const upload = await uploadAttachment(projectId, formData);
        if (!upload.ok) {
          showError("Attachment Upload Failed", `Failed to upload "${file.name}"`);
        }
      }

      showSuccess("Success", "Project created successfully!");
      onCreated?.(projectId);
      onClose();
    } finally {
      setSaving(false);
      submitLockRef.current = false;
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.backdrop} onPress={saving ? undefined : onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}>
          <View style={styles.header}>
            <Text style={styles.title}>Create Project</Text>
            <ModalCloseButton onPress={onClose} disabled={saving} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>Project Name *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Project name"
              placeholderTextColor="#9CA3AF"
            />

            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.descriptionInput]}
              value={description}
              onChangeText={setDescription}
              placeholder="Description"
              placeholderTextColor="#9CA3AF"
              multiline
              textAlignVertical="top"
            />

            <Text style={styles.label}>Status</Text>
            <View style={styles.chipsWrap}>
              {PROJECT_STATUSES.map((entry) => {
                const selected = status === entry;
                const colors = PROJECT_STATUS_COLORS[entry];
                return (
                  <TouchableOpacity
                    key={entry}
                    style={[
                      styles.chip,
                      selected && { backgroundColor: colors.text, borderColor: colors.text },
                    ]}
                    onPress={() => setStatus(entry)}
                  >
                    <Text style={[styles.chipText, selected && { color: "#fff" }]}>
                      {entry}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.label}>Owner</Text>
            <TouchableOpacity
              style={styles.selectRow}
              onPress={() => setOwnerPickerOpen((prev) => !prev)}
            >
              <Text style={styles.selectText}>{ownerName}</Text>
              <Ionicons
                name={ownerPickerOpen ? "chevron-up" : "chevron-down"}
                size={16}
                color="#6B7280"
              />
            </TouchableOpacity>
            {ownerPickerOpen && (
              <ScrollView
                style={styles.dropdown}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                showsVerticalScrollIndicator
              >
                <TouchableOpacity
                  style={styles.dropdownRow}
                  onPress={() => {
                    setOwnerId(null);
                    setOwnerPickerOpen(false);
                  }}
                >
                  <Text style={styles.dropdownText}>Unassigned</Text>
                </TouchableOpacity>
                {ownerOptions.map((owner) => (
                  <TouchableOpacity
                    key={owner.id}
                    style={styles.dropdownRow}
                    onPress={() => {
                      setOwnerId(owner.id);
                      setOwnerPickerOpen(false);
                    }}
                  >
                    <Text style={styles.dropdownText}>{owner.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <Text style={styles.label}>Due Date *</Text>
            <TouchableOpacity
              style={styles.selectRow}
              onPress={() => setDatePickerOpen((prev) => !prev)}
            >
              <Text style={styles.selectText}>
                {dueDate ? toCalendarDateOnly(dueDate) : "Select due date"}
              </Text>
              <Ionicons name="calendar-outline" size={16} color="#6B7280" />
            </TouchableOpacity>
            {datePickerOpen && (
              <View style={styles.calendarWrap}>
                <CalendarPicker
                  compact
                  startDate={dueDate}
                  endDate={dueDate}
                  minDate={pktTodayStart()}
                  disablePast
                  onSelectStart={(date) => setDueDate(date)}
                  onSelectEnd={(date) => setDueDate(date)}
                  onDone={() => setDatePickerOpen(false)}
                />
              </View>
            )}

            <Text style={styles.label}>Attachments</Text>
            <View style={styles.attachmentRow}>
              <DocumentPickerButton onPick={handlePickFiles} multiple />
              <Text style={styles.attachHint}>Pick files (30 MB each)</Text>
            </View>
            {attachments.map((file, index) => (
              <View key={`${file.name}-${index}`} style={styles.attachTag}>
                <Text style={styles.attachText} numberOfLines={1}>
                  {file.name}
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    setAttachments((prev) => prev.filter((_, i) => i !== index))
                  }
                  hitSlop={8}
                >
                  <Ionicons name="close" size={16} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity
            style={[styles.createBtn, saving && { opacity: 0.7 }]}
            onPress={handleCreate}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.createText}>Create Project</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
    maxHeight: "90%",
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
    marginBottom: 8,
  },
  title: { fontSize: prf(18), fontFamily: "SF_Pro_Semibold", color: "#1D1D1D" },
  label: {
    marginTop: 12,
    marginBottom: 6,
    fontSize: prf(12),
    fontFamily: "SF_Pro_Semibold",
    color: "#6B7280",
  },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: prf(14),
    fontFamily: "SF_Pro_Regular",
    color: "#1D1D1D",
  },
  descriptionInput: { minHeight: 90 },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: { fontSize: prf(12), color: "#4B5563", fontFamily: "SF_Pro_Medium" },
  selectRow: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  selectText: { fontSize: prf(13), color: "#1D1D1D", fontFamily: "SF_Pro_Regular" },
  dropdown: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    marginTop: 5,
    maxHeight: 200,
    overflow: "hidden",
  },
  dropdownRow: { paddingHorizontal: 12, paddingVertical: 10 },
  dropdownText: { fontSize: prf(13), color: "#1D1D1D", fontFamily: "SF_Pro_Regular" },
  calendarWrap: { marginTop: 8, borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, padding: 6 },
  attachmentRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  attachHint: { fontSize: prf(12), color: "#9CA3AF", fontFamily: "SF_Pro_Regular" },
  attachTag: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 6,
  },
  attachText: { flex: 1, fontSize: prf(12), color: "#374151", fontFamily: "SF_Pro_Regular" },
  createBtn: {
    marginTop: 16,
    backgroundColor: "#00DEAB",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  createText: { color: "#fff", fontSize: prf(15), fontFamily: "SF_Pro_Semibold" },
});


