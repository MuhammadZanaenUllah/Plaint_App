import CalendarPicker from "@/components/CalendarPicker";
import RichTextEditor, { RichTextEditorRef } from "@/components/texteditor";
import { Ionicons } from "@expo/vector-icons";
import { useRef, useState, useEffect } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "@/hooks/useAuth";
import { useTasks } from "@/hooks/useTasks";
import { extractErrorMessage } from "@/utils/errorHandler";
import { uiStatusToApi } from "@/utils/statusMapper";
import type { UiTaskStatus, RecurringPeriod } from "@/types/task.types";
import { getSocket, onSocketEvent, type UserUpdatePayload } from "@/services/socket/socketService";
import DocumentPickerButton from "@/features/attachments/components/DocumentPickerButton";
import type { SelectedFile } from "@/features/attachments/types/attachment.types";

type Props = { visible: boolean; onClose: () => void };

const TOP_CHIPS = [
  { id: "assigned", icon: "people-outline", label: "Assigned to" },
  { id: "duedate", icon: "calendar-outline", label: "Due Date" },
  { id: "priority", icon: "star-outline", label: "Priority" },
];

export default function CreateTaskModal({ visible, onClose }: Props) {
  const { state: authState } = useAuth();
  const { state: taskState, createTask, fetchAllTasks } = useTasks();

  const companyIdRef = useRef(authState.company?.company_id ?? 0);
  companyIdRef.current = authState.company?.company_id ?? 0;

  const fetchRef = useRef(fetchAllTasks);
  fetchRef.current = fetchAllTasks;

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !visible) return;

    const cleanup = onSocketEvent("user_update", (payload: unknown) => {
      const p = payload as UserUpdatePayload;
      if (String(p?.company_id) !== String(companyIdRef.current)) return;
      fetchRef.current(companyIdRef.current);
    });

    return cleanup;
  }, [visible]);

  const [title, setTitle] = useState("");
  const [titleFocused, setTitleFocused] = useState(false);
  const [description, setDescription] = useState("");
  const [descFocused, setDescFocused] = useState(false);
  const [attachments, setAttachments] = useState<SelectedFile[]>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignSearch, setAssignSearch] = useState("");
  const [assignFocused, setAssignFocused] = useState(false);
  const [assignedUserId, setAssignedUserId] = useState<number | null>(null);
  const [assignedUserName, setAssignedUserName] = useState<string>("");
  const [dueDateOpen, setDueDateOpen] = useState(false);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [selectedPriority, setSelectedPriority] = useState<string | null>(null);
  const [selectedPriorityId, setSelectedPriorityId] = useState<number | null>(null);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [selectedApproval, setSelectedApproval] = useState<string | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [recurringPeriod, setRecurringPeriod] = useState<RecurringPeriod | null>(null);
  const [recurringTime, setRecurringTime] = useState<string>("");
  const [recurringTotalCount, setRecurringTotalCount] = useState<number>(1);
  const [loading, setLoading] = useState(false);

  const togglePanel = (panel: "assign" | "duedate" | "priority" | "approval" | "status" | "recurring") => {
    setAssignOpen(panel === "assign" ? !assignOpen : false);
    setDueDateOpen(panel === "duedate" ? !dueDateOpen : false);
    setPriorityOpen(panel === "priority" ? !priorityOpen : false);
    setApprovalOpen(panel === "approval" ? !approvalOpen : false);
    setStatusOpen(panel === "status" ? !statusOpen : false);
    setRecurringOpen(panel === "recurring" ? !recurringOpen : false);
  };

  const STATUSES = [
    { label: "Pending", color: "#F97316" },
    { label: "In-Progress", color: "#607EF9" },
    { label: "Completed", color: "#1CB333" },
    { label: "Rejected", color: "#FF0000" },
    { label: "Pending-Approval", color: "#1D1D1D" },
    { label: "On-Hold", color: "#0DDFD8" },
  ];

  const RECURRING_PERIODS: { value: RecurringPeriod; label: string }[] = [
    { value: "daily", label: "Daily" },
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
    { value: "annually", label: "Annually" },
    { value: "quarterly", label: "Quarterly" },
    { value: "semi-annually", label: "Semi-Annually" },
  ];

  const descriptionEditorRef = useRef<RichTextEditorRef>(null);

  const titleFloated = titleFocused || title.length > 0;
  const descExpanded = descFocused || description.replace(/<[^>]*>/g, "").trim().length > 0;

  const filteredUsers = taskState.taskOwners.filter((u) => {
    const fullName = `${u.first_name} ${u.last_name}`.toLowerCase();
    return fullName.includes(assignSearch.toLowerCase());
  });

  const handlePickFiles = (files: SelectedFile[]) => {
    setAttachments((prev) => [...prev, ...files]);
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreateTask = async () => {
    if (!title.trim()) {
      Alert.alert("Validation", "Task title is required.");
      return;
    }
    if (!assignedUserId) {
      Alert.alert("Validation", "Please assign a user.");
      return;
    }
    if (!startDate) {
      Alert.alert("Validation", "Due date is required.");
      return;
    }
    if (!selectedPriorityId) {
      Alert.alert("Validation", "Priority is required.");
      return;
    }

    setLoading(true);
    try {
      const descriptionHtml = await descriptionEditorRef.current?.getContentHtml();
      const companyId = authState.company?.company_id ?? 0;
      const companyIdentifier = authState.company?.company_identifier ?? "";

      const isRecurring = recurringPeriod !== null;

      await createTask({
        title: title.trim(),
        company_identifier: companyIdentifier,
        company_id: companyId,
        assign_to: assignedUserId,
        due_date: startDate.toISOString(),
        priority: selectedPriorityId,
        approval_required: selectedApproval === "Yes" ? 1 : 0,
        status: uiStatusToApi((selectedStatus as UiTaskStatus) ?? "Pending"),
        description: descriptionHtml ?? description,
        project_id: 0,
        is_recurring: isRecurring,
        recurring_period: isRecurring ? recurringPeriod : null,
        recurring_time: isRecurring && recurringTime ? recurringTime : null,
        recurring_total_count: isRecurring ? recurringTotalCount : 0,
        recurring_exclude_days: [],
        recurring_week_day: null,
        recurring_month_date: null,
        recurring_annual_month: null,
        recurring_annual_date: null,
      });

      Alert.alert("Success", "Task created successfully.");
      setTitle("");
      setDescription("");
      setAssignedUserId(null);
      setAssignedUserName("");
      setStartDate(null);
      setEndDate(null);
      setSelectedPriority(null);
      setSelectedPriorityId(null);
      setSelectedApproval(null);
      setSelectedStatus(null);
      setRecurringOpen(false);
      setRecurringPeriod(null);
      setRecurringTime("");
      setRecurringTotalCount(1);
      setAttachments([]);
      onClose();
    } catch (error) {
      const msg = extractErrorMessage(error);
      Alert.alert("Error", msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPriority = (label: string) => {
    setSelectedPriority(label);
    const priority = taskState.priorities.find(
      (p) => p.name.toLowerCase() === label.toLowerCase()
    );
    setSelectedPriorityId(priority?.id ?? null);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable onPress={() => {}} style={styles.sheet}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={18} color="#fff" />
          </TouchableOpacity>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="always"
            style={styles.outerScroll}
            decelerationRate="fast"
            bounces
            overScrollMode="never"
          >
            <View style={[styles.titleInputWrap, titleFloated && styles.titleInputWrapActive]}>
              <Text style={[styles.floatLabel, titleFloated && styles.floatLabelActive]}>
                Enter a task title
              </Text>
              <TextInput
                style={[styles.titleInput, titleFloated && styles.titleInputFloated]}
                value={title}
                onChangeText={setTitle}
                onFocus={() => setTitleFocused(true)}
                onBlur={() => setTitleFocused(false)}
                placeholderTextColor="transparent"
                autoFocus={false}
              />
            </View>

            {descExpanded ? (
              <RichTextEditor
                ref={descriptionEditorRef}
                label="Description"
                initialHTML={description}
                onChangeHTML={setDescription}
                onFocus={() => setDescFocused(true)}
                onBlur={() => setDescFocused(false)}
                editorHeight={160}
                containerStyle={styles.descEditor}
                autoFocus={false}
              />
            ) : (
              <TouchableOpacity style={styles.descIdle} onPress={() => setDescFocused(true)} activeOpacity={0.7}>
                <Ionicons name="document-text-outline" size={20} color="#E6E6E6" style={{ marginRight: 10 }} />
                <Text style={styles.descIdlePlaceholder}>Description</Text>
              </TouchableOpacity>
            )}

            <View style={styles.chipsRow}>
              {TOP_CHIPS.map((chip) => {
                const isAssign = chip.id === "assigned";
                const isDueDate = chip.id === "duedate";
                const isPriority = chip.id === "priority";
                const active = (isAssign && assignOpen) || (isDueDate && dueDateOpen) || (isPriority && priorityOpen);
                const hasUser = isAssign && assignedUserName;
                const hasDate = isDueDate && startDate;
                const hasPriority = isPriority && selectedPriority;
                return (
                  <TouchableOpacity
                    key={chip.id}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => {
                      if (isAssign) togglePanel("assign");
                      if (isDueDate) togglePanel("duedate");
                      if (isPriority) togglePanel("priority");
                    }}
                  >
                    <Ionicons name={chip.icon as any} size={16} color={active ? "#fff" : "#AAAAAA"} />
                    <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                      {hasUser ? assignedUserName
                        : hasDate ? `${startDate!.getDate()}, ${startDate!.toLocaleString("default", { month: "short" })}`
                          : hasPriority ? selectedPriority!
                            : chip.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {priorityOpen && (
              <View style={styles.priorityRow}>
                {[
                  { label: "Low", dot: "#0DDFAB", selected: selectedPriority === "Low" },
                  { label: "Medium", dot: "#1D1D1D", selected: selectedPriority === "Medium" },
                  { label: "High", dot: "#FF0000", selected: selectedPriority === "High" },
                ].map((p) => (
                  <TouchableOpacity
                    key={p.label}
                    style={[styles.priorityChip, p.selected && { backgroundColor: "#0DDFAB", borderColor: "#0DDFAB" }]}
                    onPress={() => { handleSelectPriority(p.label); setPriorityOpen(false); }}
                  >
                    {p.selected
                      ? <Ionicons name="checkmark" size={14} color="#fff" />
                      : <View style={[styles.priorityDot, { backgroundColor: p.dot }]} />}
                    <Text style={[styles.priorityLabel, p.selected && { color: "#fff" }]}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={{ marginBottom: dueDateOpen ? 10 : 0 }}>
              {dueDateOpen && (
                <CalendarPicker
                  startDate={startDate}
                  endDate={endDate}
                  onSelectStart={setStartDate}
                  onSelectEnd={setEndDate}
                  onDone={() => setDueDateOpen(false)}
                />
              )}
            </View>

            {assignOpen && (
              <View style={styles.assignPanel}>
                <View style={[
                  styles.searchWrap,
                  (assignFocused || assignSearch.length > 0) && styles.searchWrapActive,
                ]}>
                  <Text style={[styles.searchLabel, (assignFocused || assignSearch.length > 0) && styles.searchLabelFloated]}>
                    Search people
                  </Text>
                  <TextInput
                    style={styles.searchInput}
                    value={assignSearch}
                    onChangeText={setAssignSearch}
                    onFocus={() => setAssignFocused(true)}
                    onBlur={() => setAssignFocused(false)}
                    autoFocus
                  />
                  <Ionicons name="search-outline" size={18}
                    color={assignFocused || assignSearch.length > 0 ? "#1D1D1D" : "#AAAAAA"}
                    style={styles.searchIcon}
                  />
                </View>

                {assignSearch.trim().length > 0 &&
                  filteredUsers.map((user) => {
                    const fullName = `${user.first_name} ${user.last_name}`;
                    const initials = ((user.first_name?.[0] ?? "") + (user.last_name?.[0] ?? "")).toUpperCase();
                    return (
                      <TouchableOpacity
                        key={user.id}
                        style={styles.userRow}
                        onPress={() => {
                          setAssignedUserId(user.id);
                          setAssignedUserName(fullName);
                          setAssignOpen(false);
                          setAssignSearch("");
                        }}
                      >
                        <View style={[styles.userAvatar, { backgroundColor: "#0DDFAB" }]}>
                          <Text style={styles.userAvatarText}>{initials}</Text>
                        </View>
                        <Text style={styles.userName}>{fullName}</Text>
                      </TouchableOpacity>
                    );
                  })
                }
              </View>
            )}

            <View style={styles.chipsRow}>
              <TouchableOpacity
                style={[styles.chip, approvalOpen && styles.chipActive]}
                onPress={() => togglePanel("approval")}
              >
                <Ionicons name="checkmark-done-outline" size={16} color={approvalOpen ? "#fff" : "#AAAAAA"} />
                <Text style={[styles.chipLabel, approvalOpen && styles.chipLabelActive]}>
                  {selectedApproval ? selectedApproval : "Approval Required"}
                </Text>
              </TouchableOpacity>

              {approvalOpen && (
                <View style={{ width: "100%" }}>
                  <View style={styles.approvalRow}>
                    {[
                      { label: "Yes", selected: selectedApproval === "Yes" },
                      { label: "No", selected: selectedApproval === "No" },
                    ].map((a) => (
                      <TouchableOpacity
                        key={a.label}
                        style={[styles.approvalChip, a.selected && styles.approvalChipSelected]}
                        onPress={() => { setSelectedApproval(a.label); setApprovalOpen(false); }}
                      >
                        <Ionicons name={a.label === "Yes" ? "checkmark" : "close"} size={14} color={a.selected ? "#fff" : "#AAAAAA"} />
                        <Text style={[styles.approvalLabel, a.selected && styles.approvalLabelSelected]}>{a.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              <TouchableOpacity
                style={[styles.chip, statusOpen && styles.chipActive]}
                onPress={() => togglePanel("status")}
              >
                <Ionicons name="radio-button-off-outline" size={16} color={statusOpen ? "#fff" : "#AAAAAA"} />
                <Text style={[styles.chipLabel, statusOpen && styles.chipLabelActive]}>
                  {selectedStatus ? selectedStatus : "Task Status"}
                </Text>
              </TouchableOpacity>

              {statusOpen && (
                <View style={{ width: "100%" }}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statusScroll}>
                    {STATUSES.map((s) => {
                      const selected = selectedStatus === s.label;
                      return (
                        <TouchableOpacity
                          key={s.label}
                          style={[styles.statusChip, selected && { backgroundColor: s.color, borderColor: s.color }]}
                          onPress={() => { setSelectedStatus(s.label); setStatusOpen(false); }}
                        >
                          {selected
                            ? <Ionicons name="checkmark" size={13} color="#fff" />
                            : <View style={[styles.statusDot, { backgroundColor: s.color }]} />}
                          <Text style={[styles.statusLabel, selected && { color: "#fff" }]}>{s.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              <TouchableOpacity
                style={[styles.chip, recurringOpen && styles.chipActive]}
                onPress={() => togglePanel("recurring")}
              >
                <Ionicons name="calendar-outline" size={16} color={recurringOpen ? "#fff" : "#AAAAAA"} />
                <Text style={[styles.chipLabel, recurringOpen && styles.chipLabelActive]}>
                  Recurring Task
                </Text>
              </TouchableOpacity>

              {recurringOpen && (
                <View style={{ width: "100%", marginTop: 8 }}>
                  <Text style={styles.recurringLabel}>Recurring Period</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statusScroll}>
                    {RECURRING_PERIODS.map((p) => {
                      const selected = recurringPeriod === p.value;
                      return (
                        <TouchableOpacity
                          key={p.value}
                          style={[styles.statusChip, selected && { backgroundColor: "#16A34A", borderColor: "#16A34A" }]}
                          onPress={() => setRecurringPeriod(selected ? null : p.value)}
                        >
                          {selected
                            ? <Ionicons name="checkmark" size={13} color="#fff" />
                            : <View style={[styles.statusDot, { backgroundColor: "#16A34A" }]} />}
                          <Text style={[styles.statusLabel, selected && { color: "#fff" }]}>{p.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  <View style={styles.recurringRow}>
                    <View style={styles.recurringInputWrap}>
                      <Text style={styles.recurringLabel}>Time (optional)</Text>
                      <TextInput
                        style={styles.recurringInput}
                        placeholder="e.g. 09:00"
                        placeholderTextColor="#AAAAAA"
                        value={recurringTime}
                        onChangeText={setRecurringTime}
                      />
                    </View>
                    <View style={styles.recurringInputWrap}>
                      <Text style={styles.recurringLabel}>Total Count</Text>
                      <TextInput
                        style={styles.recurringInput}
                        placeholder="1"
                        placeholderTextColor="#AAAAAA"
                        keyboardType="numeric"
                        value={String(recurringTotalCount)}
                        onChangeText={(t) => setRecurringTotalCount(Number(t) || 1)}
                      />
                    </View>
                  </View>
                </View>
              )}
            </View>

            <View style={styles.attachRow}>
              <DocumentPickerButton onPick={handlePickFiles} />
              {attachments.length > 0 && (
                <TouchableOpacity style={styles.attachBtn}>
                  <Ionicons name="download-outline" size={20} color="#1D1D1D" />
                </TouchableOpacity>
              )}
            </View>

            {attachments.length > 0 && (
              <View style={{ overflow: "visible", marginBottom: 0 }}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={[styles.tagsScroll, { overflow: "visible" }]}
                  contentContainerStyle={styles.tagsScrollContent}
                  decelerationRate="fast"
                  bounces
                  overScrollMode="never"
                  nestedScrollEnabled={false}
                >
                  {attachments.map((file, i) => (
                    <View key={`${file.name}-${i}`} style={styles.tag}>
                      <Ionicons name="download-outline" size={14} color="#0DDFAB" />
                      <Text style={styles.tagText} numberOfLines={1}>{file.name}</Text>
                      <TouchableOpacity
                        onPress={() => removeAttachment(i)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        style={styles.tagClose}
                      >
                        <Text style={styles.tagCloseText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
          </ScrollView>

          <TouchableOpacity
            style={[styles.createBtn, loading && { opacity: 0.7 }]}
            activeOpacity={0.85}
            onPress={handleCreateTask}
            disabled={loading}
          >
            <Text style={styles.createBtnText}>{loading ? "Creating..." : "+   Create Task"}</Text>
          </TouchableOpacity>
        </Pressable>
        </Pressable>
      {/* </Pressable> */}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 0,
    maxHeight: "90%",
  },
  scrollContent: { paddingBottom: 0, paddingTop: 10 },
  outerScroll: {overflow:'visible'},
  closeBtn: {
    alignSelf: "flex-end",
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "#1D1D1D",
    justifyContent: "center", alignItems: "center",
    marginBottom: 10,
  },
  titleInputWrap: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12, marginBottom: 20 },
  titleInputWrapActive: { borderWidth: 1, borderColor: "#1D1D1D", paddingTop: 20, borderRadius: 8 },
  floatLabel: {
    position: "absolute", top: 14, left: 14, fontSize: 15,
    backgroundColor: "#fff", paddingHorizontal: 2, color: "#E6E6E6", fontFamily: "SF_Pro_Regular",
  },
  floatLabelActive: { top: -9, left: 10, fontSize: 12, color: "#1D1D1D", paddingHorizontal: 4, fontFamily: "SF_Pro_Regular" },
  titleInput: { fontSize: 16, color: "#1D1D1D", fontFamily: "SF_Pro_Regular", padding: 0, height: 20 },
  titleInputFloated: {},
  descEditor: { marginBottom: 20 },
  descIdle: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 4, marginBottom: 20 },
  descIdlePlaceholder: { fontSize: 15, color: "#E6E6E6", fontFamily: "SF_Pro_Regular" },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginBottom: 5 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1, borderColor: "#AAAAAA", borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  chipActive: { backgroundColor: "#1D1D1D", borderColor: "#1D1D1D" },
  chipLabel: { fontSize: 13, color: "#AAAAAA", fontFamily: "SF_Pro_Regular" },
  chipLabelActive: { color: "#fff" },
  priorityRow: { flexDirection: "row", gap: 8, marginBottom: 5 },
  priorityChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1, borderColor: "#AAAAAA", borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  priorityDot: { width: 8, height: 8, borderRadius: 4 },
  priorityLabel: { fontSize: 13, color: "#1D1D1D", fontFamily: "SF_Pro_Regular" },
  assignPanel: { marginTop: 10, marginBottom: 10 },
  searchWrap: {
    borderWidth: 1,
    borderColor: "#E6E6E6",
    borderRadius: 8,
    marginBottom: 4,
    paddingHorizontal: 12,
    position: "relative",
    height: 44,
    justifyContent: "center",
  },
  searchWrapActive: { borderColor: "#1D1D1D" },
  searchLabel: {
    position: "absolute", top: 12, left: 12,
    fontSize: 14, color: "#AAAAAA", fontFamily: "SF_Pro_Regular",
  },
  searchLabelFloated: {
    top: -9, left: 10,
    backgroundColor: "#fff", paddingHorizontal: 4,
    fontSize: 12, color: "#1D1D1D",
  },
  searchInput: {
    fontSize: 15, color: "#1D1D1D", fontFamily: "SF_Pro_Regular",
    paddingRight: 28, padding: 0, height: 24,
  },
  searchIcon: { position: "absolute", right: 12, top: 12 },
  userRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  userAvatar: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: "#0DDFAB",
    justifyContent: "center", alignItems: "center",
  },
  userAvatarText: { color: "#fff", fontSize: 14, fontFamily: "SF_Pro_Semibold" },
  userName: { fontSize: 14, color: "#1D1D1D", fontFamily: "SF_Pro_Regular" },
  approvalRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  approvalChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1, borderColor: "#AAAAAA", borderRadius: 8,
    paddingHorizontal: 20, paddingVertical: 8,
  },
  approvalChipSelected: { backgroundColor: "#0DDFAB", borderColor: "#0DDFAB" },
  approvalLabel: { fontSize: 13, color: "#1D1D1D", fontFamily: "SF_Pro_Regular" },
  approvalLabelSelected: { color: "#fff" },
  statusScroll: { marginBottom: 5 },
  statusChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1, borderColor: "#AAAAAA", borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8, marginRight: 8,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: 13, color: "#1D1D1D", fontFamily: "SF_Pro_Regular" },
  attachRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  attachBtn: {
    width: 38, height: 38,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  tagsScrollWrapper: {
    marginBottom: 8,
    overflow: "visible",
  },
  tagsScroll: { flexGrow: 0, marginBottom: 8, overflow: "visible" },
  tagsScrollContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 8,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#1D1D1D",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginRight: 8,
    maxWidth: 220,
  },
  tagText: {
    flex: 1,
    fontSize: 12.5,
    color: "#0DDFAB",
    fontFamily: "SF_Pro_Regular",
  },
  tagClose: {
    marginLeft: 4,
  },
  tagCloseText: {
    fontSize: 13,
    color: "#0DDFAB",
    fontFamily: "SF_Pro_Regular",
    lineHeight: 16,
  },
  createBtn: {
    backgroundColor: "#00DEAB", borderRadius: 5,
    paddingVertical: 16, alignItems: "center",
    marginTop: 12, marginBottom: 30,
  },
  createBtnText: { fontSize: 16, color: "#1D1D1D", fontFamily: "SF_Pro_Semibold" },
  recurringLabel: { fontSize: 13, color: "#1D1D1D", fontFamily: "SF_Pro_Regular", marginBottom: 6 },
  recurringRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  recurringInputWrap: { flex: 1 },
  recurringInput: {
    borderWidth: 1, borderColor: "#E6E6E6", borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: "#1D1D1D", fontFamily: "SF_Pro_Regular",
  },
});
