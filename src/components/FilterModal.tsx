import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import CalendarPicker from "./CalendarPicker";
import FloatingInput from "./FloatingInput";

// Minimum time the Apply button stays in its loading state, so the spinner is
// always visible even when the client-side filter resolves instantly.
const MIN_APPLY_MS = 350;

type Props = {
  visible: boolean;
  onClose: () => void;

  // Status
  statuses?: string[];
  statusColors?: Record<string, string>;
  showStatus?: boolean;

  // Priority
  priorities?: string[];
  priorityColors?: Record<string, string>;
  showPriority?: boolean;

  // Leave Mode
  leaveModes?: string[];
  leaveModeColors?: Record<string, string>;
  showLeaveMode?: boolean;

  // Leave Type
  leaveTypes?: string[];
  leaveTypeColors?: Record<string, string>;
  showLeaveType?: boolean;

  // Reason
  showReasonInput?: boolean;
  reasonValue?: string;
  onChangeReason?: (text: string) => void;

  // Apply callback with selected filters
  onApply?: (filters: {
    status: string | null;
    priority: string | null;
    startDate?: Date | null;
    endDate?: Date | null;
  }) => void;

  // Preset values (for re-opening with previously applied filters)
  initialStatus?: string | null;
  initialPriority?: string | null;
  initialStartDate?: Date | null;
  initialEndDate?: Date | null;

  // Called when Reset is tapped (parent should clear its filter state)
  onReset?: () => void;

  // While true (e.g. a backend task fetch is in flight), the Apply button shows
  // a spinner and the modal waits for loading to finish before closing.
  loading?: boolean;
};

export default function FilterModal({
  visible,
  onClose,

  statuses = [],
  statusColors = {},
  showStatus = true,

  priorities = [],
  priorityColors = {},
  showPriority = true,

  leaveModes = [],
  leaveModeColors = {},
  showLeaveMode = false,

  leaveTypes = [],
  leaveTypeColors = {},
  showLeaveType = false,

  showReasonInput = false,
  reasonValue = "",
  onChangeReason = () => {},
  onApply,
  initialStatus = null,
  initialPriority = null,
  initialStartDate = null,
  initialEndDate = null,
  onReset,
  loading = false,
}: Props) {
  const [selectedStatus, setSelectedStatus] = useState<string | null>(initialStatus);
  const [selectedPriority, setSelectedPriority] = useState<string | null>(initialPriority);
  const [selectedLeaveMode, setSelectedLeaveMode] = useState<string | null>(null);
  const [selectedLeaveType, setSelectedLeaveType] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<Date | null>(initialStartDate);
  const [endDate, setEndDate] = useState<Date | null>(initialEndDate);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  // Non-reactive guard so a stale `applying` from a previous session can't
  // close the modal right after it reopens. Only cleared by the apply/reset/
  // close paths, never inside an effect.
  const applyingSessionRef = useRef(0);
  // True when Apply was tapped while a real backend load was in flight — the
  // close-wait effect (below) then handles closing, otherwise a short timer
  // closes the modal so the spinner is always visible.
  const waitForRealLoadRef = useRef(false);
  const applyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      if (applyTimerRef.current) {
        clearTimeout(applyTimerRef.current);
        applyTimerRef.current = null;
      }
      waitForRealLoadRef.current = false;
      setSelectedStatus(initialStatus);
      setSelectedPriority(initialPriority);
      setStartDate(initialStartDate);
      setEndDate(initialEndDate);
      setApplying(false);
    }
  }, [visible, initialStatus, initialPriority, initialStartDate, initialEndDate]);

  // If Apply was tapped while tasks were still loading, keep the modal open
  // (spinner in the button) and close it as soon as the load finishes.
  useEffect(() => {
    if (
      visible &&
      applying &&
      waitForRealLoadRef.current &&
      applyingSessionRef.current > 0 &&
      !loading
    ) {
      waitForRealLoadRef.current = false;
      applyingSessionRef.current = 0;
      onClose?.();
    }
  }, [visible, applying, loading, onClose]);

  useEffect(() => {
    return () => {
      if (applyTimerRef.current) {
        clearTimeout(applyTimerRef.current);
        applyTimerRef.current = null;
      }
    };
  }, []);

  const handleManualClose = () => {
    if (applyTimerRef.current) {
      clearTimeout(applyTimerRef.current);
      applyTimerRef.current = null;
    }
    waitForRealLoadRef.current = false;
    setApplying(false);
    applyingSessionRef.current = 0;
    onClose?.();
  };

  const handleReset = () => {
    setSelectedStatus(null);
    setSelectedPriority(null);
    setSelectedLeaveMode(null);
    setSelectedLeaveType(null);
    onChangeReason("");
    setStartDate(null);
    setEndDate(null);
    setCalendarOpen(false);
    if (applyTimerRef.current) {
      clearTimeout(applyTimerRef.current);
      applyTimerRef.current = null;
    }
    waitForRealLoadRef.current = false;
    setApplying(false);
    applyingSessionRef.current = 0;
    onReset?.();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={handleManualClose}>
      <TouchableWithoutFeedback onPress={handleManualClose}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            {/* Header row */}
            <View style={styles.headerRow}>
              <TouchableOpacity onPress={handleReset}>
                <Text style={styles.resetText}>Reset</Text>
              </TouchableOpacity>
              <Text style={styles.titleText}>Filter</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={handleManualClose}>
                <Ionicons name="close" size={16} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
              {/* Status */}
              {showStatus && (
                <>
                  <Text style={styles.sectionLabel}>Status</Text>

                  <View style={styles.chipsRow}>
                    {statuses.map((s) => {
                      const active = selectedStatus === s;
                      const color = statusColors[s];

                      return (
                        <TouchableOpacity
                          key={s}
                          style={[
                            styles.chip,
                            active && {
                              backgroundColor: color,
                              borderColor: color,
                            },
                          ]}
                          onPress={() => setSelectedStatus(active ? null : s)}
                        >
                          {active ? (
                            <Ionicons name="checkmark" size={13} color="#fff" style={{ marginRight: 2 }} />
                          ) : (
                            <View style={[styles.dot, { backgroundColor: color }]} />
                          )}

                          <Text style={[styles.chipText, active && styles.chipTextActive]}>
                            {s}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <View style={styles.divider} />
                </>
              )}

              {/* Priority */}
              {showPriority && (
                <>
                  <Text style={styles.sectionLabel}>Priority</Text>

                  <View style={styles.chipsRow}>
                    {priorities.map((p) => {
                      const active = selectedPriority === p;
                      const color = priorityColors[p];

                      return (
                        <TouchableOpacity
                          key={p}
                          style={[
                            styles.chip,
                            active && {
                              backgroundColor: color,
                              borderColor: color,
                            },
                          ]}
                          onPress={() => setSelectedPriority(active ? null : p)}
                        >
                          {active ? (
                            <Ionicons name="checkmark" size={13} color="#fff" style={{ marginRight: 2 }} />
                          ) : (
                            <View style={[styles.dot, { backgroundColor: color }]} />
                          )}

                          <Text style={[styles.chipText, active && styles.chipTextActive]}>
                            {p}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <View style={styles.divider} />
                </>
              )}

              {/* Leave Mode */}
              {showLeaveMode && (
                <>
                  <Text style={styles.sectionLabel}>Leave Mode</Text>

                  <View style={styles.chipsRow}>
                    {leaveModes.map((mode) => {
                      const active = selectedLeaveMode === mode;
                      const color = leaveModeColors[mode];

                      return (
                        <TouchableOpacity
                          key={mode}
                          style={[
                            styles.chip,
                            active && {
                              backgroundColor: color,
                              borderColor: color,
                            },
                          ]}
                          onPress={() => setSelectedLeaveMode(active ? null : mode)}
                        >
                          {active ? (
                            <Ionicons name="checkmark" size={13} color="#fff" style={{ marginRight: 2 }} />
                          ) : (
                            <View style={[styles.dot, { backgroundColor: color }]} />
                          )}

                          <Text style={[styles.chipText, active && styles.chipTextActive]}>
                            {mode}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <View style={styles.divider} />
                </>
              )}

              {/* Leave type */}
              {showLeaveType && (
                <>
                  <Text style={styles.sectionLabel}>Leave Type</Text>

                  <View style={styles.chipsRow}>
                    {leaveTypes.map((type) => {
                      const active = selectedLeaveType === type;
                      const color = leaveTypeColors[type];

                      return (
                        <TouchableOpacity
                          key={type}
                          style={[
                            styles.chipleavetype,
                            active && {
                              backgroundColor: color,
                              borderColor: color,
                            },
                          ]}
                          onPress={() => setSelectedLeaveType(active ? null : type)}
                        >
                          {active ? (
                            <Ionicons name="checkmark" size={13} color="#fff" style={{ marginRight: 0 }} />
                          ) : (
                            <View style={[styles.dot, { backgroundColor: color }]} />
                          )}

                          <Text style={[styles.chipText, active && styles.chipTextActive]}>
                            {type}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <View style={styles.divider} />
                </>
              )}

              {/* Reason */}
              {showReasonInput && (
                <>
                  <Text style={styles.sectionLabel}>Reason</Text>

                  <View style={{ paddingBottom: 16 }}>
                    <FloatingInput
                      label="Reason* "
                      value={reasonValue}
                      onChangeText={onChangeReason}
                      keyboardType="default"
                      autoCapitalize="sentences"
                      multiline
                      numberOfLines={4}
                    />
                  </View>
                </>
              )}

              {/* Calendar header */}
              <TouchableOpacity onPress={() => setCalendarOpen(true)}>
                <View style={styles.calHeaderRow}>
                  <Text style={styles.calHeaderText}>
                    {startDate || endDate
                      ? `Calendar (${startDate ? startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}${endDate ? " - " + endDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""})`
                      : "Calendar"}
                  </Text>
                  <Ionicons name="calendar" size={22} color="#00DEAB" />
                </View>
              </TouchableOpacity>

              {/* Calendar Popup Modal */}
              <Modal visible={calendarOpen} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setCalendarOpen(false)}>
                <Pressable style={styles.calOverlay} onPress={() => setCalendarOpen(false)}>
                  <Pressable style={styles.calPopup} onPress={() => {}}>
                    <CalendarPicker
                      startDate={startDate}
                      endDate={endDate}
                      onSelectStart={setStartDate}
                      onSelectEnd={setEndDate}
                      onDone={() => setCalendarOpen(false)}
                    />
                  </Pressable>
                </Pressable>
              </Modal>
            </ScrollView>

            {/* Apply */}
            <TouchableOpacity
              style={[styles.applyBtn, applying && styles.applyBtnDisabled]}
              activeOpacity={0.85}
              disabled={applying}
              onPress={() => {
                onApply?.({
                  status: selectedStatus,
                  priority: selectedPriority,
                  startDate,
                  endDate,
                });
                applyingSessionRef.current += 1;
                setApplying(true);
                if (loading) {
                  // Real backend load in flight — wait for it to finish.
                  waitForRealLoadRef.current = true;
                } else {
                  // Client-side filter resolves instantly, so show the spinner
                  // for a brief moment before closing.
                  waitForRealLoadRef.current = false;
                  if (applyTimerRef.current) {
                    clearTimeout(applyTimerRef.current);
                  }
                  applyTimerRef.current = setTimeout(() => {
                    applyTimerRef.current = null;
                    applyingSessionRef.current = 0;
                    setApplying(false);
                    onClose?.();
                  }, MIN_APPLY_MS);
                }
              }}
            >
              {applying ? (
                <ActivityIndicator size="small" color="#1D1D1D" />
              ) : (
                <Text style={styles.applyText}>Apply</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 20,
    maxHeight: "92%",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  resetText: {
    fontSize: 16,
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Medium",
  },
  titleText: {
    fontSize: 18,
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#1D1D1D",
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: { paddingBottom: 16 },
  sectionLabel: {
    fontSize: 16,
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
    marginBottom: 12,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 3,
    marginBottom: 16,
  },
  chip: {
    minWidth: 60,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    backgroundColor: "#F2F2F2",
    borderColor: "#F2F2F2",
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  chipleavetype: {
    minWidth: 60,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    backgroundColor: "#F2F2F2",
    borderColor: "#F2F2F2",
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 4,
    marginRight: 5,
  },
  chipText: {
    fontSize: 12,
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Medium",
  },
  chipTextActive: {
    color: "#fff",
    fontFamily: "SF_Pro_Medium",
  },
  divider: {
    height: 1,
    backgroundColor: "#E6E6E6",
    marginBottom: 16,
  },
  calHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  calHeaderText: {
    fontSize: 16,
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
    textDecorationLine: "underline",
  },
  calOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  calPopup: {
    width: "100%",
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 16,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  applyBtn: {
    backgroundColor: "#00DEAB",
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 30,
  },
  applyBtnDisabled: { opacity: 0.7 },
  applyText: {
    fontSize: 18,
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Semibold",
  },
});
