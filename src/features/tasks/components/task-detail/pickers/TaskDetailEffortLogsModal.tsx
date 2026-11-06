// Effort-logs modal for the task-detail sheet (AUD-081 phase 4).

import type { EffortHistoryRow } from "@/features/tasks/utils/effortHistory";
import { formatEffort } from "@/features/tasks/utils/taskEffort";
import { formatDetailDateTime } from "../taskDetailFormatters";
import { taskDetailPickerStyles as styles } from "../taskDetailPickerStyles";
import { rf } from "@/utils/responsive";
import { Ionicons } from "@expo/vector-icons";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type EffortHistoryEntry = {
  changed_by_name?: string | null;
  changed_at?: string | null;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  effortHistory: EffortHistoryEntry[];
  effortHistoryRows: EffortHistoryRow[];
  currentEffortHours?: number;
  currentEffortUnit?: string | null;
};

export function TaskDetailEffortLogsModal({
  visible,
  onClose,
  effortHistory,
  effortHistoryRows,
  currentEffortHours,
  currentEffortUnit,
}: Props) {
  if (!visible) return null;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onClose}
    >
      <Pressable style={styles.popoverOverlay} onPress={onClose}>
        <Pressable
          style={[
            styles.popoverCard,
            { maxHeight: "70%", width: "90%", maxWidth: 420 },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.popoverHeader}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Ionicons name="time-outline" size={18} color="#1D1D1D" />
              <Text style={styles.popoverTitle}>Effort Logs</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={20} color="#1D1D1D" />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingVertical: 8, gap: 10 }}
          >
            {effortHistory.length > 0 ? (
              effortHistory.map((log, idx) => {
                const row = effortHistoryRows[idx];
                const unit =
                  (row?.unit as "minutes" | "hours" | "days") || "hours";
                const direction = (row?.delta ?? 0) >= 0 ? "+" : "-";
                return (
                  <View key={idx} style={styles.logCard}>
                    <View style={styles.logHeader}>
                      <Text style={styles.logUser}>
                        {log.changed_by_name || "User"}
                      </Text>
                      <Text style={styles.logDate}>
                        {log.changed_at
                          ? formatDetailDateTime(log.changed_at)
                          : "-"}
                      </Text>
                    </View>
                    <Text style={styles.logChange}>
                      {formatEffort(row?.before ?? 0, unit)} {direction}{" "}
                      {formatEffort(Math.abs(row?.delta ?? 0), unit)} ={" "}
                      {formatEffort(row?.after ?? 0, unit)}
                    </Text>
                    <Text style={styles.logMeta}>
                      {(row?.action || "update").replace(/_/g, " ")}
                      {row?.fromStatus || row?.toStatus
                        ? ` | ${row.fromStatus || "-"} -> ${row.toStatus || "-"}`
                        : ""}
                    </Text>
                  </View>
                );
              })
            ) : (
              <View style={{ paddingVertical: 24, alignItems: "center" }}>
                <Ionicons
                  name="document-text-outline"
                  size={32}
                  color="#D1D5DB"
                  style={{ marginBottom: 8 }}
                />
                <Text
                  style={{
                    fontSize: rf(13),
                    color: "#6B7280",
                    fontFamily: "SF_Pro_Medium",
                  }}
                >
                  Current Effort:{" "}
                  {formatEffort(
                    Number(currentEffortHours ?? 0),
                    (currentEffortUnit as "minutes" | "hours" | "days") ||
                      "hours",
                  )}
                </Text>
                <Text
                  style={{
                    fontSize: rf(11.5),
                    color: "#9CA3AF",
                    marginTop: 4,
                    fontFamily: "SF_Pro_Regular",
                  }}
                >
                  No change logs recorded for this task.
                </Text>
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
