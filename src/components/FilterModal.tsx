import { Ionicons } from "@expo/vector-icons";
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
import CalendarPicker from "./CalendarPicker";
import FloatingInput from "./FloatingInput";

export type FilterPerson = { id: number; full_name: string };

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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

  // Created By / Assigned To — searchable person pickers, shown together
  // as a side-by-side row. `owners` is the company's user roster (task
  // creators/assignees are matched by numeric id, not display name, since
  // task rows only carry a truncated first-name string).
  owners?: FilterPerson[];
  showCreatedBy?: boolean;
  showAssignedTo?: boolean;

  // Apply callback with selected filters
  onApply?: (filters: {
    status: string | null;
    priority: string | null;
    startDate?: Date | null;
    endDate?: Date | null;
    createdBy?: number | null;
    assignedTo?: number | null;
  }) => void;

  // Preset values (for re-opening with previously applied filters)
  initialStatus?: string | null;
  initialPriority?: string | null;
  initialStartDate?: Date | null;
  initialEndDate?: Date | null;
  initialCreatedBy?: number | null;
  initialAssignedTo?: number | null;

  // Called when Reset is tapped (parent should clear its filter state)
  onReset?: () => void;

  // While true (e.g. a backend task fetch is in flight), the Apply button shows
  // a spinner and the modal waits for loading to finish before closing.
  loading?: boolean;
};

function PersonPickerField({
  label,
  owners,
  query,
  onChangeQuery,
  open,
  onFocus,
  onCloseDropdown,
  onSelect,
  onClear,
  hasValue,
}: {
  label: string;
  owners: FilterPerson[];
  query: string;
  onChangeQuery: (text: string) => void;
  open: boolean;
  onFocus: () => void;
  onCloseDropdown: () => void;
  onSelect: (owner: FilterPerson) => void;
  onClear: () => void;
  hasValue: boolean;
}) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return owners;
    return owners.filter((o) => o.full_name.toLowerCase().includes(q));
  }, [owners, query]);

  // Closing on blur (not just on select) means tapping anywhere else in the
  // sheet — another chip, Apply, the other person field — dismisses the
  // dropdown instead of leaving it open on top of everything below it. The
  // short delay lets a tap on a dropdown row's onPress fire first.
  const handleBlur = () => {
    setTimeout(onCloseDropdown, 150);
  };

  return (
    <View style={styles.personField}>
      <View
        style={[
          styles.personInputRow,
          (open || hasValue) && styles.personInputRowActive,
        ]}
      >
        <Text
          style={[
            styles.personLabel,
            (open || hasValue) && styles.personLabelActive,
          ]}
        >
          {label}
        </Text>
        <TextInput
          style={styles.personInput}
          value={query}
          onChangeText={onChangeQuery}
          onFocus={onFocus}
          onBlur={handleBlur}
          placeholder="Search..."
          placeholderTextColor="#B3B3B3"
        />
        {query.length > 0 ? (
          <TouchableOpacity onPress={onClear} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color="#9CA3AF" />
          </TouchableOpacity>
        ) : (
          <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
        )}
      </View>

      {open && (
        <View
          style={[
            styles.personDropdown,
            filtered.length === 0 && styles.personDropdownEmpty,
          ]}
        >
          {filtered.length === 0 ? (
            <View style={styles.personEmptyRow}>
              <Ionicons name="search-outline" size={15} color="#B3B3B3" />
              <Text style={styles.personEmpty}>No matches</Text>
            </View>
          ) : (
            <ScrollView
              keyboardShouldPersistTaps="always"
              style={[
                styles.personDropdownScroll,
                // Shrink to fit short lists instead of always reserving a
                // tall, mostly-empty-looking box.
                { maxHeight: Math.min(filtered.length * 44, 176) },
              ]}
            >
              {filtered.map((owner) => (
                <TouchableOpacity
                  key={owner.id}
                  style={styles.personOption}
                  onPress={() => onSelect(owner)}
                  activeOpacity={0.6}
                >
                  <View style={styles.personAvatar}>
                    <Text style={styles.personAvatarText}>
                      {getInitials(owner.full_name)}
                    </Text>
                  </View>
                  <Text style={styles.personOptionText} numberOfLines={1}>
                    {owner.full_name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

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
  owners = [],
  showCreatedBy = false,
  showAssignedTo = false,
  onApply,
  initialStatus = null,
  initialPriority = null,
  initialStartDate = null,
  initialEndDate = null,
  initialCreatedBy = null,
  initialAssignedTo = null,
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
  const [selectedCreatedBy, setSelectedCreatedBy] = useState<number | null>(initialCreatedBy);
  const [selectedAssignedTo, setSelectedAssignedTo] = useState<number | null>(initialAssignedTo);
  const [createdByQuery, setCreatedByQuery] = useState(
    owners.find((o) => o.id === initialCreatedBy)?.full_name ?? "",
  );
  const [assignedToQuery, setAssignedToQuery] = useState(
    owners.find((o) => o.id === initialAssignedTo)?.full_name ?? "",
  );
  const [createdByOpen, setCreatedByOpen] = useState(false);
  const [assignedToOpen, setAssignedToOpen] = useState(false);
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
    setSelectedCreatedBy(null);
    setSelectedAssignedTo(null);
    setCreatedByQuery("");
    setAssignedToQuery("");
    setCreatedByOpen(false);
    setAssignedToOpen(false);
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
      {/* Tap-outside-to-dismiss via nested Pressables (the sheet's onPress is
          a no-op that absorbs the tap so it never reaches the overlay) —
          the same pattern the calendar popup below already uses. The old
          single TouchableWithoutFeedback wrapping both together let taps on
          a TextInput (which doesn't block touch propagation the way a
          TouchableOpacity does) bubble up and close the whole sheet. */}
      <KeyboardAvoidingView
        style={styles.keyboardAvoider}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
      <Pressable style={styles.overlay} onPress={handleManualClose}>
        {/* Remount on open so all filter state re-initializes from the latest
            props instead of syncing props into state inside an effect. */}
        <Pressable
          style={styles.sheet}
          onPress={() => {}}
          key={visible ? "filter-sheet-open" : "filter-sheet-closed"}
        >
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

              {/* Created By / Assigned To */}
              {(showCreatedBy || showAssignedTo) && (
                <>
                  <View style={styles.personRow}>
                    {showCreatedBy && (
                      <PersonPickerField
                        label="Created By"
                        owners={owners}
                        query={createdByQuery}
                        hasValue={selectedCreatedBy !== null}
                        onChangeQuery={(text) => {
                          setCreatedByQuery(text);
                          setSelectedCreatedBy(null);
                        }}
                        open={createdByOpen}
                        onFocus={() => {
                          setCreatedByOpen(true);
                          setAssignedToOpen(false);
                        }}
                        onCloseDropdown={() => setCreatedByOpen(false)}
                        onSelect={(owner) => {
                          setSelectedCreatedBy(owner.id);
                          setCreatedByQuery(owner.full_name);
                          setCreatedByOpen(false);
                        }}
                        onClear={() => {
                          setSelectedCreatedBy(null);
                          setCreatedByQuery("");
                        }}
                      />
                    )}
                    {showAssignedTo && (
                      <PersonPickerField
                        label="Assigned To"
                        owners={owners}
                        query={assignedToQuery}
                        hasValue={selectedAssignedTo !== null}
                        onChangeQuery={(text) => {
                          setAssignedToQuery(text);
                          setSelectedAssignedTo(null);
                        }}
                        open={assignedToOpen}
                        onFocus={() => {
                          setAssignedToOpen(true);
                          setCreatedByOpen(false);
                        }}
                        onCloseDropdown={() => setAssignedToOpen(false)}
                        onSelect={(owner) => {
                          setSelectedAssignedTo(owner.id);
                          setAssignedToQuery(owner.full_name);
                          setAssignedToOpen(false);
                        }}
                        onClear={() => {
                          setSelectedAssignedTo(null);
                          setAssignedToQuery("");
                        }}
                      />
                    )}
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
                  createdBy: selectedCreatedBy,
                  assignedTo: selectedAssignedTo,
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
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardAvoider: {
    flex: 1,
  },
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
  personRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  personField: {
    flex: 1,
    position: "relative",
  },
  personInputRow: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E6E6E6",
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    marginTop: 10,
    gap: 6,
    backgroundColor: "#fff",
  },
  personInputRowActive: {
    borderColor: "#1D1D1D",
  },
  // Floating label cut into the top border — same technique as
  // FloatingInput.tsx, but always floated (this is a fixed field label,
  // not a placeholder that animates in).
  personLabel: {
    position: "absolute",
    left: 8,
    top: -8,
    fontSize: 12,
    fontFamily: "SF_Pro_Regular",
    color: "#8E8E93",
    backgroundColor: "#fff",
    paddingHorizontal: 4,
    zIndex: 1,
  },
  personLabelActive: {
    color: "#1D1D1D",
  },
  personInput: {
    flex: 1,
    fontSize: 14,
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Regular",
    padding: 0,
  },
  personDropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E6E6E6",
    zIndex: 20,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  personDropdownEmpty: {
    // No content to size against — pin a compact height instead of
    // inheriting whatever the (unbounded) empty-state row would otherwise
    // take, so it doesn't render as a large blank box.
    height: 44,
  },
  personDropdownScroll: {
    maxHeight: 176,
  },
  personOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F2F2F2",
  },
  personAvatar: {
    width: 24,
    height: 24,
    borderRadius: 2,
    backgroundColor: "#00DEAB",
    alignItems: "center",
    justifyContent: "center",
  },
  personAvatarText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#fff",
  },
  personOptionText: {
    flex: 1,
    fontSize: 14,
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Regular",
  },
  personEmptyRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  personEmpty: {
    fontSize: 13,
    color: "#9CA3AF",
    fontFamily: "SF_Pro_Regular",
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
