import { reopenTask } from "@/features/tasks/api/taskApi";
import type {
  ReopenTaskRequest,
  TaskPriorityLevel,
} from "@/features/tasks/types/task.types";
import { fromMinutes, toMinutes, type EffortUnit } from "@/features/tasks/utils/taskEffort";
import { rf } from "@/utils/responsive";
import { showError, showSuccess } from "@/utils/toast";
import { Ionicons } from "@expo/vector-icons";
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
  isAts: boolean;
  initialPriority?: TaskPriorityLevel;
  initialEffortMinutes?: number;
  initialEffortUnit?: string;
  onSuccess?: (status: string) => void;
};

const UNITS: { value: EffortUnit; label: string }[] = [
  { value: "minutes", label: "Mins" },
  { value: "hours", label: "Hrs" },
  { value: "days", label: "Days" },
];

export default function ReopenTaskModal({
  visible,
  onClose,
  taskId,
  companyId,
  companyIdentifier,
  isAts,
  initialPriority = "normal",
  initialEffortMinutes = 0,
  initialEffortUnit = "hours",
  onSuccess,
}: Props) {
  const startingUnit = (initialEffortUnit as EffortUnit) || "hours";
  const [status, setStatus] = useState<"In-Progress" | "Pending">("In-Progress");
  const [priority, setPriority] = useState<TaskPriorityLevel>(
    initialPriority === "critical" ? "critical" : "normal",
  );
  const [unit, setUnit] = useState<EffortUnit>(startingUnit);
  const [effort, setEffort] = useState(
    initialEffortMinutes > 0
      ? String(fromMinutes(initialEffortMinutes, startingUnit))
      : "",
  );
  const [bump, setBump] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!visible) return null;

  const handleConfirm = async () => {
    const value = parseFloat(effort);
    const minutes = Number.isFinite(value) ? toMinutes(value, unit) : 0;
    if (!isAts || minutes <= 0) {
      showError("Validation", "Effort must be greater than 0.");
      return;
    }

    const payload: ReopenTaskRequest = {
      company_id: companyId,
      company_identifier: companyIdentifier,
      status,
      priority,
      effort_hours: minutes,
      effort_unit: unit,
      bump_to_front: bump,
    };

    setLoading(true);
    try {
      const result = await reopenTask(taskId, payload);
      if (!result.ok) {
        showError("Reopen Failed", result.message);
        return;
      }
      showSuccess("Success", "Task reopened successfully.");
      onSuccess?.(status);
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
            <Text style={styles.title}>Reopen Task</Text>
            <TouchableOpacity onPress={onClose} disabled={loading} hitSlop={8}>
              <Ionicons name="close" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>
            Set a new priority and scheduling effort to reactivate this task.
            The original logged hours are preserved.
          </Text>

          <Text style={styles.label}>Status</Text>
          <View style={styles.row}>
            {(["In-Progress", "Pending"] as const).map((value) => (
              <TouchableOpacity
                key={value}
                style={[styles.chip, status === value && styles.chipActive]}
                onPress={() => setStatus(value)}
              >
                <Text style={[styles.chipText, status === value && styles.chipTextActive]}>
                  {value === "In-Progress" ? "In Progress" : "Pending"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Priority</Text>
          <View style={styles.row}>
            {(["normal", "critical"] as const).map((value) => (
              <TouchableOpacity
                key={value}
                style={[
                  styles.chip,
                  priority === value && styles.chipActive,
                  priority === value &&
                    value === "critical" && { backgroundColor: "#EF4444" },
                ]}
                onPress={() => setPriority(value)}
              >
                <Text style={[styles.chipText, priority === value && styles.chipTextActive]}>
                  {value === "critical" ? "Critical" : "Normal"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Effort</Text>
          <View style={styles.row}>
            <TextInput
              style={styles.input}
              value={effort}
              onChangeText={(text) => setEffort(text.replace(/[^0-9.]/g, ""))}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor="#9CA3AF"
            />
            {UNITS.map((entry) => (
              <TouchableOpacity
                key={entry.value}
                style={[styles.unitChip, unit === entry.value && styles.chipActive]}
                onPress={() => setUnit(entry.value)}
              >
                <Text
                  style={[styles.chipText, unit === entry.value && styles.chipTextActive]}
                >
                  {entry.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.checkRow} onPress={() => setBump((v) => !v)}>
            <Ionicons
              name={bump ? "checkbox" : "square-outline"}
              size={18}
              color={bump ? "#00DEAB" : "#9CA3AF"}
            />
            <Text style={styles.checkText}>Start immediately (bump to front)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.confirmBtn, loading && { opacity: 0.7 }]}
            onPress={handleConfirm}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.confirmText}>Reopen Task</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  card: {
    width: "100%",
    maxWidth: 430,
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 20,
    zIndex: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  title: { fontSize: rf(18), fontFamily: "SF_Pro_Semibold", color: "#1D1D1D" },
  subtitle: {
    fontSize: rf(12),
    color: "#6B7280",
    fontFamily: "SF_Pro_Regular",
    lineHeight: 18,
    marginBottom: 14,
  },
  label: {
    fontSize: rf(12),
    color: "#6B7280",
    fontFamily: "SF_Pro_Semibold",
    marginBottom: 6,
    marginTop: 6,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  chip: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#F9FAFB",
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
  input: {
    flex: 1,
    minWidth: 110,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Regular",
  },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 },
  checkText: { fontSize: rf(13), color: "#374151", fontFamily: "SF_Pro_Regular" },
  confirmBtn: {
    marginTop: 18,
    backgroundColor: "#00DEAB",
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
  },
  confirmText: { color: "#fff", fontSize: rf(15), fontFamily: "SF_Pro_Semibold" },
});


