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

type Props = {
  visible: boolean;
  onClose: () => void;

  // Status
  statuses?: string[];
  statusColors?: Record<string, string>;
  showStatus?: boolean;
  // Section label for the status chip group (defaults to "Status")
  statusLabel?: string;

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
  statusLabel = "Status",

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
  const [resetting, setResetting] = useState(false);
  // Bumped by the reset-close effect to re-check the minimum spinner duration
  // when the parent reset is instant.
  const [resetTick, setResetTick] = useState(0);
  // Non-reactive guard so a stale `applying` from a previous session can't
  // close the modal right after it reopens. Only cleared by the apply/reset/
  // close paths, never inside an effect.
  const applyingSessionRef = useRef(0);
  // True when Apply was tapped while a real backend load was in flight — the
  // close-wait effect (below) then closes the modal as soon as it finishes.
  const waitForRealLoadRef = useRef(false);
  // True while Reset is waiting to close the modal once the parent's reset
  // finishes (or the minimum spinner duration elapses).
  const waitForResetRef = useRef(false);
  // Timestamp of the last Reset tap, used to keep the loader visible briefly
  // even when the parent reset is instant.
  const resetStartedAtRef = useRef(0);

  useEffect(() => {
    if (visible) {
      // Refs survive the sheet remount (they live on the outer component), so
      // clear any session leftovers before a new filter session starts. All
      // UI state is re-initialized by remounting the sheet via its `key`.
      waitForRealLoadRef.current = false;
      waitForResetRef.current = false;
      applyingSessionRef.current = 0;
    }
  }, [visible]);

  // If Apply was tapped while data was still loading, keep the modal open
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

  // After Reset is tapped, keep the modal open with a spinner in the Reset
  // button until the parent's reset completes — or, when the parent reset is
  // instant, until a short minimum duration so the feedback is visible — then
  // auto-close the modal.
  useEffect(() => {
    if (
      !visible ||
      !resetting ||
      !waitForResetRef.current ||
      applyingSessionRef.current === 0
    ) {
      return;
    }
    if (loading) {
      return;
    }
    const elapsed = Date.now() - resetStartedAtRef.current;
    if (elapsed < 350) {
      const t = setTimeout(() => setResetTick((n) => n + 1), 350 - elapsed);
      return () => clearTimeout(t);
    }
    waitForResetRef.current = false;
    applyingSessionRef.current = 0;
    setResetting(false);
    onClose?.();
  }, [visible, resetting, loading, resetTick, onClose]);

  const handleManualClose = () => {
    waitForRealLoadRef.current = false;
    waitForResetRef.current = false;
    setApplying(false);
    setResetting(false);
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
    waitForRealLoadRef.current = false;
    waitForResetRef.current = true;
    resetStartedAtRef.current = Date.now();
    applyingSessionRef.current += 1;
    setApplying(false);
    setResetting(true);
    onReset?.();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={handleManualClose}>
      <TouchableWithoutFeedback onPress={handleManualClose}>
        {/* Remount on open so all filter state re-initializes from the latest
            props instead of syncing props into state inside an effect. */}
        <View style={styles.overlay}>
          <View style={styles.sheet} key={visible ? "filter-sheet-open" : "filter-sheet-closed"}>
            {/* Header row */}
            <View style={styles.headerRow}>
              <TouchableOpacity onPress={handleReset} disabled={resetting}>
                {resetting ? (
                  <ActivityIndicator size="small" color="#1D1D1D" />
                ) : (
                  <Text style={styles.resetText}>Reset</Text>
                )}
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
                  <Text style={styles.sectionLabel}>{statusLabel}</Text>

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
                if (loading) {
                  // Real backend load in flight — keep the modal open with a
                  // spinner in the Apply button and close as soon as it
                  // finishes.
                  waitForRealLoadRef.current = true;
                  waitForResetRef.current = false;
                  applyingSessionRef.current += 1;
                  setApplying(true);
                  setResetting(false);
                } else {
                  // Data is already loaded — the filter applies instantly, so
                  // close the modal right away.
                  waitForResetRef.current = false;
                  applyingSessionRef.current = 0;
                  setApplying(false);
                  setResetting(false);
                  onClose?.();
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
