import { updateTaskStatus } from "@/features/tasks/api/taskApi";
import { toMinutes, type EffortUnit } from "@/features/tasks/utils/taskEffort";
import { rf } from "@/utils/responsive";
import { showError, showSuccess } from "@/utils/toast";
import ModalCloseButton from "@/components/ModalCloseButton";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type Props = {
  visible: boolean;
  onClose: () => void;
  taskId: number;
  companyId: number;
  companyIdentifier: string;
  targetStatus: "In-Progress" | "Pending";
  onSuccess?: () => void;
};

const UNITS: { value: EffortUnit; label: string }[] = [
  { value: "minutes", label: "Mins" },
  { value: "hours", label: "Hrs" },
  { value: "days", label: "Days" },
];

export default function ResumeTaskModal({
  visible,
  onClose,
  taskId,
  companyId,
  companyIdentifier,
  targetStatus,
  onSuccess,
}: Props) {
  const [effort, setEffort] = useState("");
  const [unit, setUnit] = useState<EffortUnit>("hours");
  const [loading, setLoading] = useState(false);

  if (!visible) return null;

  const handleConfirm = async () => {
    const value = parseFloat(effort);
    const minutes = Number.isFinite(value) && value > 0 ? toMinutes(value, unit) : undefined;
    setLoading(true);
    try {
      const result = await updateTaskStatus(taskId, {
        status: targetStatus,
        company_id: companyId,
        company_identifier: companyIdentifier,
        ...(minutes !== undefined ? { effort_hours: minutes } : {}),
      });
      if (!result.ok) {
        showError("Resume Failed", result.message);
        return;
      }
      showSuccess("Success", result.data || "Status updated successfully.");
      onSuccess?.();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.backdrop} onPress={loading ? undefined : onClose} />
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Resume Task</Text>
            <ModalCloseButton onPress={onClose} disabled={loading} />
          </View>
          <Text style={styles.subtitle}>
            This task was pending approval. Optionally update the estimated effort
            to reschedule it.
          </Text>
          <View style={styles.row}>
            <TextInput
              style={styles.input}
              value={effort}
              onChangeText={(text) => setEffort(text.replace(/[^0-9.]/g, ""))}
              keyboardType="numeric"
              placeholder="Estimated effort (optional)"
              placeholderTextColor="#9CA3AF"
            />
            {UNITS.map((entry) => (
              <TouchableOpacity
                key={entry.value}
                style={[styles.unitChip, unit === entry.value && styles.chipActive]}
                onPress={() => setUnit(entry.value)}
              >
                <Text style={[styles.chipText, unit === entry.value && styles.chipTextActive]}>
                  {entry.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[styles.confirmBtn, loading && { opacity: 0.7 }]}
            onPress={handleConfirm}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.confirmText}>Confirm</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 20 },
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)" },
  card: { width: "100%", maxWidth: 430, backgroundColor: "#fff", borderRadius: 18, padding: 20, zIndex: 2 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  title: { fontSize: rf(18), fontFamily: "SF_Pro_Semibold", color: "#1D1D1D" },
  subtitle: { fontSize: rf(12), color: "#6B7280", fontFamily: "SF_Pro_Regular", lineHeight: 18, marginBottom: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  input: {
    flex: 1,
    minWidth: 150,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Regular",
  },
  unitChip: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: "#F9FAFB",
  },
  chipActive: { backgroundColor: "#00DEAB", borderColor: "#00DEAB" },
  chipText: { fontSize: rf(13), color: "#374151", fontFamily: "SF_Pro_Medium" },
  chipTextActive: { color: "#fff" },
  confirmBtn: { marginTop: 18, backgroundColor: "#00DEAB", borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  confirmText: { color: "#fff", fontSize: rf(15), fontFamily: "SF_Pro_Semibold" },
});

