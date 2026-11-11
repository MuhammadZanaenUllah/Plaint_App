import { rejectTask } from "@/features/tasks/api/taskApi";
import { rf } from "@/utils/responsive";
import { showError, showSuccess } from "@/utils/toast";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/hooks/useAuth";
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
  onSuccess?: (newStatus?: string) => void;
};

type RejectUnit = "Hrs" | "Days" | "Min";
type RejectType = "requirement_changed" | "not_completed";

const REJECT_UNITS: RejectUnit[] = ["Hrs", "Days", "Min"];

export default function RejectTaskModal({
  visible,
  onClose,
  taskId,
  companyId,
  companyIdentifier,
  onSuccess,
}: RejectTaskModalProps) {
  const { state: authState } = useAuth();
  const isAts = authState.hasAdvancedTaskModule === true;
  const [reason, setReason] = useState("");
  const [effort, setEffort] = useState("");
  const [selectedUnit, setSelectedUnit] = useState<RejectUnit>("Hrs");
  const [rejectType, setRejectType] = useState<RejectType | null>(null);
  const [unitDropdownOpen, setUnitDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reasonFocused, setReasonFocused] = useState(false);

  useEffect(() => {
    if (visible) {
      setReason("");
      setEffort("");
      setSelectedUnit("Hrs");
      setRejectType(null);
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
    if (!rejectType) {
      showError("Validation Error", "Choose a rejection type.");
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
    if (rejectType === "requirement_changed" && additionalHoursInMinutes <= 0) {
      showError("Validation Error", "Please enter the effort to add.");
      return;
    }
    if (rejectType === "not_completed") {
      additionalHoursInMinutes = 0;
    }

    setLoading(true);
    try {
      const result = await rejectTask(taskId, {
        company_id: companyId,
        company_identifier: companyIdentifier,
        reason: trimmedReason,
        additional_hours: additionalHoursInMinutes,
        reject_type: rejectType,
      });

      if (result.ok) {
        showSuccess(
          "Success",
          result.data.status
            ? `Task rejected and moved to ${result.data.status}.`
            : "Task has been rejected.",
        );
        onSuccess?.(result.data.status);
        onClose();
      } else {
        showError("Rejection Failed", result.message);
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

          {/* Reason text area */}
          <View
            style={[
              styles.reasonContainer,
              reasonFocused && styles.reasonContainerFocused,
            ]}
          >
            <TextInput
              style={styles.reasonInput}
              value={reason}
              onChangeText={setReason}
              placeholder="Reason for rejection"
              placeholderTextColor="#9CA3AF"
              multiline
              textAlignVertical="top"
              autoFocus
              onFocus={() => setReasonFocused(true)}
              onBlur={() => setReasonFocused(false)}
            />
          </View>

          {/* Initial rejection options: Requirement Changed & Task Not Completed */}
          {!rejectType && (
            <View style={styles.initialActionRow}>
              <TouchableOpacity
                style={styles.reqChangedBtn}
                onPress={() => setRejectType("requirement_changed")}
                activeOpacity={0.8}
              >
                <Text style={styles.reqChangedBtnText} numberOfLines={1} adjustsFontSizeToFit>
                  Requirement Changed
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.taskNotCompletedBtn, loading && { opacity: 0.7 }]}
                onPress={() => {
                  setRejectType("not_completed");
                  // Execute reject for "Task Not Completed"
                  const trimmedReason = reason.trim();
                  if (!trimmedReason) {
                    showError("Validation Error", "Please provide a reason for rejection.");
                    setRejectType(null);
                    return;
                  }
                  setLoading(true);
                  rejectTask(taskId, {
                    company_id: companyId,
                    company_identifier: companyIdentifier,
                    reason: trimmedReason,
                    additional_hours: 0,
                    reject_type: "not_completed",
                  })
                    .then((result) => {
                      if (result.ok) {
                        showSuccess(
                          "Success",
                          result.data.status
                            ? `Task rejected and moved to ${result.data.status}.`
                            : "Task has been rejected.",
                        );
                        onSuccess?.(result.data.status);
                        onClose();
                      } else {
                        showError("Rejection Failed", result.message);
                        setRejectType(null);
                      }
                    })
                    .catch((err: any) => {
                      showError("Error", err.message || "Failed to reject task.");
                      setRejectType(null);
                    })
                    .finally(() => {
                      setLoading(false);
                    });
                }}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading && rejectType === "not_completed" ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.taskNotCompletedBtnText} numberOfLines={1} adjustsFontSizeToFit>
                    Task Not Completed
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* When Requirement Changed is selected: show effort row + Back & Confirm Reject buttons */}
          {rejectType === "requirement_changed" && (
            <>
              {/* Unified Effort Input Row */}
              <View style={styles.unifiedEffortRow}>
                {/* Unit selector trigger */}
                <TouchableOpacity
                  style={styles.unifiedUnitBtn}
                  onPress={() => setUnitDropdownOpen((prev) => !prev)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="time" size={16} color="#9CA3AF" />
                  <Text style={styles.unifiedUnitText}>{selectedUnit}</Text>
                  <Ionicons name="chevron-down" size={12} color="#9CA3AF" />
                </TouchableOpacity>

                {/* Vertical Divider */}
                <View style={styles.unifiedDivider} />

                {/* Effort text input */}
                <TextInput
                  style={styles.unifiedEffortInput}
                  value={effort}
                  onChangeText={(t) => setEffort(t.replace(/[^0-9.]/g, ""))}
                  placeholder={selectedUnit}
                  placeholderTextColor="#9CA3AF"
                  keyboardType="numeric"
                />

                {/* Dropdown popup */}
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

              {/* Actions: Back + Confirm Reject */}
              <View style={styles.confirmActionRow}>
                <TouchableOpacity
                  style={styles.backBtn}
                  onPress={() => {
                    setRejectType(null);
                    setUnitDropdownOpen(false);
                  }}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  <Text style={styles.backBtnText}>Back</Text>
                </TouchableOpacity>

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
            </>
          )}
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
    padding: 16,
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
    marginBottom: 16,
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
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 8,
    minHeight: 100,
    marginBottom: 16,
    backgroundColor: "#FFFFFF",
  },
  reasonContainerFocused: {
    borderColor: "#D1D5DB",
  },
  reasonInput: {
    fontSize: rf(13.5),
    fontFamily: "SF_Pro_Medium",
    color: "#1D1D1D",
    minHeight: 75,
  },
  initialActionRow: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
    alignItems: "center",
    width: "100%",
  },
  reqChangedBtn: {
    flexShrink: 1,
    backgroundColor: "#F3F4F6",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  reqChangedBtnText: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Medium",
    color: "#1F2937",
    textAlign: "center",
  },
  taskNotCompletedBtn: {
    flexShrink: 1,
    backgroundColor: "#FCA5A5",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  taskNotCompletedBtnText: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Medium",
    color: "#FFFFFF",
    textAlign: "center",
  },
  unifiedEffortRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1D1D1D",
    borderRadius: 10,
    height: 44,
    paddingHorizontal: 10,
    marginBottom: 18,
    position: "relative",
    zIndex: 50,
    backgroundColor: "#FFFFFF",
  },
  unifiedUnitBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingRight: 6,
  },
  unifiedUnitText: {
    fontSize: rf(13),
    fontFamily: "SF_Pro_Medium",
    color: "#6B7280",
  },
  unifiedDivider: {
    width: 1,
    height: 20,
    backgroundColor: "#E5E7EB",
    marginHorizontal: 8,
  },
  unifiedEffortInput: {
    flex: 1,
    height: "100%",
    fontSize: rf(13),
    fontFamily: "SF_Pro_Regular",
    color: "#1D1D1D",
    padding: 0,
  },
  confirmActionRow: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  backBtn: {
    backgroundColor: "#F3F4F6",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  backBtnText: {
    fontSize: rf(13.5),
    fontFamily: "SF_Pro_Medium",
    color: "#1D1D1D",
  },
  confirmBtn: {
    backgroundColor: "#FCA5A5",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 120,
  },
  confirmBtnText: {
    fontSize: rf(13.5),
    fontFamily: "SF_Pro_Medium",
    color: "#FFFFFF",
  },
  unitDropdown: {
    position: "absolute",
    top: 46,
    left: 8,
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
});
