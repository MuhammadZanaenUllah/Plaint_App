import CalendarPicker from "@/components/CalendarPicker";
import { toCalendarDateOnly } from "@/features/tasks/utils/taskDate";
import { rf } from "@/utils/responsive";
import { Ionicons } from "@expo/vector-icons";
import ModalCloseButton from "@/components/ModalCloseButton";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
  mode: "create" | "date";
  sprintName?: string;
  initialDueDate?: string | null;
  error?: string | null;
  saving?: boolean;
  onClose: () => void;
  onSubmit: (values: { name: string; dueDate: string }) => void;
};

function initialDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export default function CreateSprintModal({
  visible,
  mode,
  sprintName,
  initialDueDate,
  error,
  saving = false,
  onClose,
  onSubmit,
}: Props) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      setName(mode === "create" ? "" : sprintName ?? "");
      setDueDate(initialDate(initialDueDate));
      setCalendarOpen(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [initialDueDate, mode, sprintName, visible]);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior="padding"
      >
        <Pressable style={styles.backdrop} onPress={saving ? undefined : onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {mode === "create" ? "Create Sprint" : "Change Sprint Date"}
            </Text>
            <ModalCloseButton onPress={onClose} disabled={saving} />
          </View>

          <ScrollView keyboardShouldPersistTaps="handled">
            {mode === "create" ? (
              <>
                <Text style={styles.label}>Sprint Name *</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Sprint name"
                  placeholderTextColor="#9CA3AF"
                  editable={!saving}
                />
              </>
            ) : (
              <>
                <Text style={styles.label}>Sprint</Text>
                <Text style={styles.readOnlyValue}>{sprintName ?? "Sprint"}</Text>
              </>
            )}

            <Text style={styles.label}>Due Date *</Text>
            <TouchableOpacity
              style={styles.selectRow}
              disabled={saving}
              onPress={() => setCalendarOpen((prev) => !prev)}
            >
              <Text style={styles.selectText}>
                {dueDate ? toCalendarDateOnly(dueDate) : "Select due date"}
              </Text>
              <Ionicons name="calendar-outline" size={16} color="#6B7280" />
            </TouchableOpacity>
            {calendarOpen && (
              <View style={styles.calendarWrap}>
                <CalendarPicker
                  compact
                  startDate={dueDate}
                  endDate={dueDate}
                  onSelectStart={(date) => setDueDate(date)}
                  onSelectEnd={(date) => setDueDate(date)}
                  onDone={() => setCalendarOpen(false)}
                />
              </View>
            )}

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </ScrollView>

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.7 }]}
            onPress={() =>
              onSubmit({
                name: name.trim(),
                dueDate: dueDate ? dueDate.toISOString() : "",
              })
            }
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveText}>
                {mode === "create" ? "Create Sprint" : "Save Date"}
              </Text>
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
    maxHeight: "88%",
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
  title: { fontSize: rf(18), fontFamily: "SF_Pro_Semibold", color: "#1D1D1D" },
  label: {
    marginTop: 12,
    marginBottom: 6,
    fontSize: rf(12),
    fontFamily: "SF_Pro_Semibold",
    color: "#6B7280",
  },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: rf(14),
    fontFamily: "SF_Pro_Regular",
    color: "#1D1D1D",
  },
  readOnlyValue: {
    fontSize: rf(14),
    fontFamily: "SF_Pro_Regular",
    color: "#1D1D1D",
    paddingVertical: 10,
  },
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
  selectText: { fontSize: rf(13), color: "#1D1D1D", fontFamily: "SF_Pro_Regular" },
  calendarWrap: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 6,
  },
  errorText: {
    marginTop: 10,
    fontSize: rf(12),
    color: "#DC2626",
    fontFamily: "SF_Pro_Regular",
  },
  saveBtn: {
    marginTop: 16,
    backgroundColor: "#00DEAB",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveText: { color: "#fff", fontSize: rf(15), fontFamily: "SF_Pro_Semibold" },
});
