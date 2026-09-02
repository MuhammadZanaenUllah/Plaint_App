import * as tasksService from "@/services/api/tasks.service";
import { rf } from "@/utils/responsive";
import { showError, showSuccess } from "@/utils/toast";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
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

export type RejectTaskModalProps = {
  visible: boolean;
  onClose: () => void;
  taskId: number;
  companyId: number;
  companyIdentifier: string;
  onSuccess?: () => void;
};

type RejectUnit = "Hrs" | "Days" | "Min";

const REJECT_UNITS: RejectUnit[] = ["Hrs", "Days", "Min"];

export default function RejectTaskModal({
  visible,
  onClose,
  taskId,
  companyId,
  companyIdentifier,
  onSuccess,
}: RejectTaskModalProps) {
  const [reason, setReason] = useState("");
  const [effort, setEffort] = useState("");
  const [selectedUnit, setSelectedUnit] = useState<RejectUnit>("Hrs");
  const [unitDropdownOpen, setUnitDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reasonFocused, setReasonFocused] = useState(false);

  useEffect(() => {
    if (visible) {
      setReason("");
      setEffort("");
      setSelectedUnit("Hrs");
      setUnitDropdownOpen(false);
      setLoading(false);
      setReasonFocused(false);
    }
  }, [visible]);

  if (!visible) return null;

  const handleConfirm = async () => {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      showError("Validation Error", "Please provide a reason for rejection.");
      return;
    }

    const numEffort = parseFloat(effort) || 0;
    let additionalHoursInMinutes = 0;
    if (numEffort > 0) {
      if (selectedUnit === "Hrs") {
        additionalHoursInMinutes = numEffort * 60;
      } else if (selectedUnit === "Days") {
        additionalHoursInMinutes = numEffort * 8 * 60;
      } else if (selectedUnit === "Min") {
        additionalHoursInMinutes = numEffort;
      }
    }

    setLoading(true);
    try {
      const res = await tasksService.rejectTask(taskId, {
        company_id: companyId,
        company_identifier: companyIdentifier,
        reason: trimmedReason,
        additional_hours: additionalHoursInMinutes,
      });

      if (res.Good) {
        showSuccess("Success", "Task rejected successfully.");
        onSuccess?.();
        onClose();
      } else {
        const errorMsg =
          typeof res.data === "string" && res.data
            ? res.data
            : "Failed to reject task.";
        showError("Rejection Failed", errorMsg);
      }
    } catch (err: any) {
      showError("Error", err.message || "Failed to reject task.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            if (!loading) {
              setUnitDropdownOpen(false);
              onClose();
            }
          }}
        />

        <Pressable
          style={styles.card}
          onPress={(e) => {
            e.stopPropagation();
            setUnitDropdownOpen(false);
          }}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Reject Task</Text>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              disabled={loading}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          {/* Reason text area with border-top notch label */}
          <View
            style={[
              styles.reasonContainer,
              reasonFocused && styles.reasonContainerFocused,
            ]}
          >
            <View style={styles.labelNotch}>
              <Text style={styles.labelText}>Reason for rejection</Text>
            </View>
            <TextInput
              style={styles.reasonInput}
              value={reason}
              onChangeText={setReason}
              placeholder=""
              placeholderTextColor="#9CA3AF"
              multiline
              textAlignVertical="top"
              autoFocus
              onFocus={() => setReasonFocused(true)}
              onBlur={() => setReasonFocused(false)}
            />
          </View>

          {/* Effort row: Unit dropdown + New Estimated Effort */}
          <View style={styles.effortRow}>
            {/* Unit Dropdown */}
            <View style={styles.unitPickerWrap}>
              <TouchableOpacity
                style={styles.unitBtn}
                onPress={() => setUnitDropdownOpen((prev) => !prev)}
                activeOpacity={0.7}
              >
                <Text style={styles.unitBtnText}>{selectedUnit}</Text>
                <Ionicons
                  name="chevron-down"
                  size={14}
                  color="#1D1D1D"
                  style={{ marginLeft: 4 }}
                />
              </TouchableOpacity>

              {unitDropdownOpen && (
                <View style={styles.unitDropdown}>
                  {REJECT_UNITS.map((u) => (
                    <TouchableOpacity
                      key={u}
                      style={[
                        styles.unitDropdownItem,
                        u === selectedUnit && styles.unitDropdownItemActive,
                      ]}
                      onPress={() => {
                        setSelectedUnit(u);
                        setUnitDropdownOpen(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.unitDropdownText,
                          u === selectedUnit && styles.unitDropdownTextActive,
                        ]}
                      >
                        {u}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Effort Input */}
            <View style={styles.effortInputWrap}>
              <TextInput
                style={styles.effortInput}
                value={effort}
                onChangeText={(t) => setEffort(t.replace(/[^0-9.]/g, ""))}
                placeholder="New Estimated Effort (optional)"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
              />
            </View>
          </View>

          {/* Actions: Confirm Reject button */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.confirmBtn, loading && { opacity: 0.7 }]}
              onPress={handleConfirm}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.confirmBtnText}>Confirm Reject</Text>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
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
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  title: {
    fontSize: rf(18),
    fontFamily: "SF_Pro_Bold",
    color: "#1D1D1D",
  },
  closeBtn: {
    padding: 4,
  },
  reasonContainer: {
    position: "relative",
    borderWidth: 1,
    borderColor: "#1D1D1D",
    borderRadius: 10,
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 8,
    minHeight: 100,
    marginBottom: 16,
  },
  reasonContainerFocused: {
    borderColor: "#1D1D1D",
  },
  labelNotch: {
    position: "absolute",
    top: -10,
    left: 12,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 4,
  },
  labelText: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Medium",
    color: "#1D1D1D",
  },
  reasonInput: {
    fontSize: rf(14),
    fontFamily: "SF_Pro_Regular",
    color: "#1D1D1D",
    minHeight: 70,
  },
  effortRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
    zIndex: 20,
  },
  unitPickerWrap: {
    position: "relative",
    zIndex: 30,
  },
  unitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    backgroundColor: "#FFFFFF",
  },
  unitBtnText: {
    fontSize: rf(14),
    fontFamily: "SF_Pro_Medium",
    color: "#1D1D1D",
  },
  unitDropdown: {
    position: "absolute",
    top: 48,
    left: 0,
    width: 80,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 100,
    overflow: "hidden",
  },
  unitDropdownItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  unitDropdownItemActive: {
    backgroundColor: "#F3F4F6",
  },
  unitDropdownText: {
    fontSize: rf(13),
    fontFamily: "SF_Pro_Regular",
    color: "#374151",
  },
  unitDropdownTextActive: {
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
  },
  effortInputWrap: {
    flex: 1,
  },
  effortInput: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    fontSize: rf(13),
    fontFamily: "SF_Pro_Regular",
    color: "#1D1D1D",
    backgroundColor: "#FFFFFF",
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  confirmBtn: {
    backgroundColor: "#F87171",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 120,
  },
  confirmBtnText: {
    fontSize: rf(14),
    fontFamily: "SF_Pro_Semibold",
    color: "#FFFFFF",
  },
});
