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
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CalendarPicker from "./CalendarPicker";
import FloatingInput from "./FloatingInput";

export type FilterPerson = {
  id: number;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  email?: string;
};

export function getUserDisplayName(user?: FilterPerson | null): string {
  if (!user) return "";
  if (user.full_name?.trim()) return user.full_name.trim();
  const combined = `${user.first_name || ""} ${user.last_name || ""}`.trim();
  if (combined) return combined;
  if (user.name?.trim()) return user.name.trim();
  if (user.email?.split("@")[0]) return user.email.split("@")[0];
  return `User #${user.id ?? "?"}`;
}

function getInitials(user?: FilterPerson | null): string {
  const name = getUserDisplayName(user);
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
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
    createdBy?: number | number[] | null;
    assignedTo?: number | number[] | null;
  }) => void;

  // Preset values (for re-opening with previously applied filters)
  initialStatus?: string | null;
  initialPriority?: string | null;
  initialStartDate?: Date | null;
  initialEndDate?: Date | null;
  initialCreatedBy?: number | number[] | null;
  initialAssignedTo?: number | number[] | null;

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
  selectedIds,
  onToggleOwner,
  onClear,
}: {
  label: string;
  owners: FilterPerson[];
  query: string;
  onChangeQuery: (text: string) => void;
  open: boolean;
  onFocus: () => void;
  onCloseDropdown: () => void;
  selectedIds: number[];
  onToggleOwner: (owner: FilterPerson) => void;
  onClear: () => void;
}) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return owners;
    return owners.filter((o) =>
      getUserDisplayName(o).toLowerCase().includes(q),
    );
  }, [owners, query]);

  const selectedOwners = useMemo(() => {
    return owners.filter((o) => selectedIds.includes(o.id));
  }, [owners, selectedIds]);

  return (
    <View style={styles.personFieldContainer}>
      {/* Selected People Chips */}
      {selectedOwners.length > 0 && (
        <View style={styles.selectedPersonChipsRow}>
          {selectedOwners.map((owner) => (
            <View key={owner.id} style={styles.selectedPersonChip}>
              <View style={styles.personAvatarSmall}>
                <Text style={styles.personAvatarTextSmall}>
                  {getInitials(owner)}
                </Text>
              </View>
              <Text style={styles.selectedPersonChipText} numberOfLines={1}>
                {getUserDisplayName(owner)}
              </Text>
              <TouchableOpacity
                onPress={() => onToggleOwner(owner)}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Ionicons name="close-circle" size={16} color="#6B7280" />
              </TouchableOpacity>
            </View>
          ))}
          {selectedOwners.length > 1 && (
            <TouchableOpacity onPress={onClear} style={styles.clearAllBtn}>
              <Text style={styles.clearAllText}>Clear all</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Search Input */}
      <View style={{ position: "relative", width: "100%" }}>
        <FloatingInput
          label={
            selectedOwners.length > 0
              ? `${label} (${selectedOwners.length})`
              : label
          }
          value={query}
          onChangeText={(text) => {
            onChangeQuery(text);
            if (!open) onFocus();
          }}
          onFocus={onFocus}
        />
        {query.length > 0 ? (
          <TouchableOpacity
            style={styles.personClearBtn}
            onPress={() => onChangeQuery("")}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={18} color="#9CA3AF" />
          </TouchableOpacity>
        ) : (
          // Tapping an already-focused TextInput doesn't re-fire onFocus, so
          // once opened there was previously no way to close this dropdown
          // again — this chevron is an explicit, always-reachable toggle.
          <TouchableOpacity
            style={styles.personClearBtn}
            onPress={() => (open ? onCloseDropdown() : onFocus())}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={open ? "chevron-up" : "chevron-down"}
              size={18}
              color="#9CA3AF"
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Search Dropdown */}
      {open && (
        <View style={styles.personInlineList}>
          {filtered.length === 0 ? (
            <View style={styles.personEmptyRow}>
              <Ionicons name="search-outline" size={15} color="#B3B3B3" />
              <Text style={styles.personEmpty}>No matches found</Text>
            </View>
          ) : (
            <View style={{ maxHeight: 200 }}>
              <ScrollView
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {filtered.map((owner) => {
                  const isSelected = selectedIds.includes(owner.id);
                  return (
                    <TouchableOpacity
                      key={owner.id}
                      style={[
                        styles.personOption,
                        isSelected && styles.personOptionSelected,
                      ]}
                      onPress={() => onToggleOwner(owner)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.personAvatar}>
                        <Text style={styles.personAvatarText}>
                          {getInitials(owner)}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.personOptionText,
                          isSelected && styles.personOptionTextSelected,
                        ]}
                        numberOfLines={1}
                      >
                        {getUserDisplayName(owner)}
                      </Text>
                      {isSelected ? (
                        <Ionicons
                          name="checkmark-circle"
                          size={18}
                          color="#0DDFAB"
                        />
                      ) : (
                        <Ionicons
                          name="add-circle-outline"
                          size={18}
                          color="#D1D5DB"
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
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
  // KeyboardAvoidingView pads for the full keyboard height, but the sheet's
  // own bottom edge sits above the home-indicator safe area — without this
  // offset that mismatch shows up as an empty gap between the sheet and the
  // keyboard once it's open.
  const insets = useSafeAreaInsets();
  const [selectedStatus, setSelectedStatus] = useState<string | null>(
    initialStatus,
  );
  const [selectedPriority, setSelectedPriority] = useState<string | null>(
    initialPriority,
  );
  const [selectedLeaveMode, setSelectedLeaveMode] = useState<string | null>(
    null,
  );
  const [selectedLeaveType, setSelectedLeaveType] = useState<string | null>(
    null,
  );
  const [startDate, setStartDate] = useState<Date | null>(initialStartDate);
  const [endDate, setEndDate] = useState<Date | null>(initialEndDate);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedCreatedBy, setSelectedCreatedBy] = useState<number[]>(() => {
    if (initialCreatedBy === null || initialCreatedBy === undefined) return [];
    return Array.isArray(initialCreatedBy)
      ? initialCreatedBy
      : [initialCreatedBy];
  });
  const [selectedAssignedTo, setSelectedAssignedTo] = useState<number[]>(() => {
    if (initialAssignedTo === null || initialAssignedTo === undefined)
      return [];
    return Array.isArray(initialAssignedTo)
      ? initialAssignedTo
      : [initialAssignedTo];
  });
  const [createdByQuery, setCreatedByQuery] = useState("");
  const [assignedToQuery, setAssignedToQuery] = useState("");
  const [createdByOpen, setCreatedByOpen] = useState(false);
  const [assignedToOpen, setAssignedToOpen] = useState(false);

  const handleToggleCreatedBy = (owner: FilterPerson) => {
    setSelectedCreatedBy((prev) =>
      prev.includes(owner.id)
        ? prev.filter((id) => id !== owner.id)
        : [...prev, owner.id],
    );
  };

  const handleToggleAssignedTo = (owner: FilterPerson) => {
    setSelectedAssignedTo((prev) =>
      prev.includes(owner.id)
        ? prev.filter((id) => id !== owner.id)
        : [...prev, owner.id],
    );
  };
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
  const snapPoints = useMemo(() => ["88%"], []);
  const resetStartedAtRef = useRef(0);

  useEffect(() => {
    if (visible) {
      waitForRealLoadRef.current = false;
      waitForResetRef.current = false;
      applyingSessionRef.current = 0;
      setCreatedByOpen(false);
      setAssignedToOpen(false);
      setSelectedStatus(initialStatus);
      setSelectedPriority(initialPriority);
      setSelectedLeaveMode(null);
      setSelectedLeaveType(null);
      setStartDate(initialStartDate);
      setEndDate(initialEndDate);
      setCalendarOpen(false);
      setSelectedCreatedBy(
        initialCreatedBy === null || initialCreatedBy === undefined
          ? []
          : Array.isArray(initialCreatedBy)
            ? initialCreatedBy
            : [initialCreatedBy],
      );
      setSelectedAssignedTo(
        initialAssignedTo === null || initialAssignedTo === undefined
          ? []
          : Array.isArray(initialAssignedTo)
            ? initialAssignedTo
            : [initialAssignedTo],
      );
      setCreatedByQuery("");
      setAssignedToQuery("");
    } else {
      setCreatedByOpen(false);
      setAssignedToOpen(false);
    }
  }, [
    visible,
    initialStatus,
    initialPriority,
    initialStartDate,
    initialEndDate,
    initialCreatedBy,
    initialAssignedTo,
  ]);

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
    onChangeReason?.("");
    setStartDate(null);
    setEndDate(null);
    setCalendarOpen(false);
    setSelectedCreatedBy([]);
    setSelectedAssignedTo([]);
    setCreatedByQuery("");
    setAssignedToQuery("");
    setCreatedByOpen(false);
    setAssignedToOpen(false);
    waitForRealLoadRef.current = false;
    waitForResetRef.current = false;
    applyingSessionRef.current = 0;
    setApplying(false);
    setResetting(false);
    onReset?.();
    onClose?.();
  };

  const handleApplyPress = () => {
    onApply?.({
      status: selectedStatus,
      priority: selectedPriority,
      startDate,
      endDate,
      createdBy:
        selectedCreatedBy.length > 0
          ? selectedCreatedBy.length === 1
            ? selectedCreatedBy[0]
            : selectedCreatedBy
          : null,
      assignedTo:
        selectedAssignedTo.length > 0
          ? selectedAssignedTo.length === 1
            ? selectedAssignedTo[0]
            : selectedAssignedTo
          : null,
    });
    if (loading) {
      waitForRealLoadRef.current = true;
      waitForResetRef.current = false;
      applyingSessionRef.current += 1;
      setApplying(true);
      setResetting(false);
    } else {
      waitForResetRef.current = false;
      applyingSessionRef.current = 0;
      setApplying(false);
      setResetting(false);
      onClose?.();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={handleManualClose}
    >
      <Pressable style={styles.modalOverlay} onPress={handleManualClose}>
        <Pressable style={styles.sheetContainer} onPress={(e) => e.stopPropagation()}>
          <View style={styles.dragHandleBar}>
            <View style={styles.dragHandlePill} />
          </View>
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

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          >
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
                          <Ionicons
                            name="checkmark"
                            size={13}
                            color="#fff"
                            style={{ marginRight: 2 }}
                          />
                        ) : (
                          <View
                            style={[styles.dot, { backgroundColor: color }]}
                          />
                        )}

                        <Text
                          style={[
                            styles.chipText,
                            active && styles.chipTextActive,
                          ]}
                        >
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
                          <Ionicons
                            name="checkmark"
                            size={13}
                            color="#fff"
                            style={{ marginRight: 2 }}
                          />
                        ) : (
                          <View
                            style={[styles.dot, { backgroundColor: color }]}
                          />
                        )}

                        <Text
                          style={[
                            styles.chipText,
                            active && styles.chipTextActive,
                          ]}
                        >
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
                      selectedIds={selectedCreatedBy}
                      onChangeQuery={setCreatedByQuery}
                      open={createdByOpen}
                      onFocus={() => {
                        setCreatedByOpen(true);
                        setAssignedToOpen(false);
                      }}
                      onCloseDropdown={() => setCreatedByOpen(false)}
                      onToggleOwner={handleToggleCreatedBy}
                      onClear={() => setSelectedCreatedBy([])}
                    />
                  )}
                  {showAssignedTo && (
                    <PersonPickerField
                      label="Assigned To"
                      owners={owners}
                      query={assignedToQuery}
                      selectedIds={selectedAssignedTo}
                      onChangeQuery={setAssignedToQuery}
                      open={assignedToOpen}
                      onFocus={() => {
                        setAssignedToOpen(true);
                        setCreatedByOpen(false);
                      }}
                      onCloseDropdown={() => setAssignedToOpen(false)}
                      onToggleOwner={handleToggleAssignedTo}
                      onClear={() => setSelectedAssignedTo([])}
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
                        onPress={() =>
                          setSelectedLeaveMode(active ? null : mode)
                        }
                      >
                        {active ? (
                          <Ionicons
                            name="checkmark"
                            size={13}
                            color="#fff"
                            style={{ marginRight: 2 }}
                          />
                        ) : (
                          <View
                            style={[styles.dot, { backgroundColor: color }]}
                          />
                        )}

                        <Text
                          style={[
                            styles.chipText,
                            active && styles.chipTextActive,
                          ]}
                        >
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
                        onPress={() =>
                          setSelectedLeaveType(active ? null : type)
                        }
                      >
                        {active ? (
                          <Ionicons
                            name="checkmark"
                            size={13}
                            color="#fff"
                            style={{ marginRight: 0 }}
                          />
                        ) : (
                          <View
                            style={[styles.dot, { backgroundColor: color }]}
                          />
                        )}

                        <Text
                          style={[
                            styles.chipText,
                            active && styles.chipTextActive,
                          ]}
                        >
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
            <Modal
              visible={calendarOpen}
              transparent
              animationType="fade"
              statusBarTranslucent
              onRequestClose={() => setCalendarOpen(false)}
            >
              <Pressable
                style={styles.calOverlay}
                onPress={() => setCalendarOpen(false)}
              >
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

          <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
            <TouchableOpacity
              style={[styles.applyBtn, applying && styles.applyBtnDisabled]}
              activeOpacity={0.85}
              disabled={applying}
              onPress={handleApplyPress}
            >
              {applying ? (
                <ActivityIndicator size="small" color="#1D1D1D" />
              ) : (
                <Text style={styles.applyText}>Apply</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Pressable>
    </Pressable>
  </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    width: "100%",
    height: "80%",
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 20,
    overflow: "hidden",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  dragHandleBar: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 12,
    paddingBottom: 2,
  },
  dragHandlePill: {
    width: 38,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#D1D5DB",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
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
  footer: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 40 },
  sectionLabel: {
    fontSize: 16,
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
    marginBottom: 12,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    height: 34,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F4F4F5",
    borderRadius: 20,
    paddingHorizontal: 12,
  },
  chipleavetype: {
    height: 34,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F4F4F5",
    borderRadius: 20,
    paddingHorizontal: 12,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },
  chipText: {
    fontSize: 13,
    color: "#18181B",
    fontFamily: "SF_Pro_Medium",
  },
  chipTextActive: {
    color: "#ffffff",
    fontFamily: "SF_Pro_Semibold",
  },
  divider: {
    height: 1,
    backgroundColor: "#E6E6E6",
    marginBottom: 16,
  },
  personRow: {
    flexDirection: "column",
    gap: 8,
    marginBottom: 16,
  },
  personFieldContainer: {
    width: "100%",
    marginVertical: 4,
  },
  selectedPersonChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
    alignItems: "center",
  },
  selectedPersonChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 6,
  },
  personAvatarSmall: {
    width: 20,
    height: 20,
    borderRadius: 5,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  personAvatarTextSmall: {
    fontSize: 10,
    fontFamily: "SF_Pro_Bold",
    color: "#374151",
  },
  selectedPersonChipText: {
    fontSize: 12,
    color: "#1F2937",
    fontFamily: "SF_Pro_Medium",
    maxWidth: 120,
  },
  clearAllBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  clearAllText: {
    fontSize: 12,
    color: "#EF4444",
    fontFamily: "SF_Pro_Medium",
  },
  personClearBtn: {
    position: "absolute",
    right: 14,
    // FloatingInput has its own marginTop: 10 before its border box starts,
    // so this needs +10 over the 13 FloatingInput uses internally for its
    // own icons (secureToggle/rightIcon) to land at the same vertical center.
    top: 23,
    zIndex: 10,
  },
  personInlineList: {
    marginTop: 6,
    marginBottom: 6,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  personOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
  },
  personOptionSelected: {
    backgroundColor: "#F0FDF4",
  },
  personAvatar: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  personAvatarText: {
    fontSize: 12,
    fontFamily: "SF_Pro_Bold",
    color: "#374151",
  },
  personOptionText: {
    flex: 1,
    fontSize: 13,
    color: "#1F2937",
    fontFamily: "SF_Pro_Regular",
  },
  personOptionTextSelected: {
    fontFamily: "SF_Pro_Semibold",
    color: "#065F46",
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
    backgroundColor: "#0DDFAB",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  applyBtnDisabled: { opacity: 0.7 },
  applyText: {
    fontSize: 16,
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Bold",
  },
});
