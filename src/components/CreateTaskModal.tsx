import { rf } from "@/utils/responsive";
import CalendarPicker from "@/components/CalendarPicker";
import {
  CriticalTaskPopUpModal,
  OrderCriticalTasksModal,
  type CriticalTask,
} from "@/components/CriticalTaskModal";
import FloatingInput from "@/components/FloatingInput";
import { ALL_STATUSES, STATUS_COLORS } from "@/components/TaskRow";
import RichTextEditor, { RichTextEditorRef } from "@/components/texteditor";
import DocumentPickerButton from "@/features/attachments/components/DocumentPickerButton";
import type { SelectedFile } from "@/features/attachments/types/attachment.types";
import { useAuth } from "@/hooks/useAuth";
import { useTasks } from "@/hooks/useTasks";
import {
  getSocket,
  onSocketEvent,
  type UserUpdatePayload,
} from "@/services/socket/socketService";
import type { RecurringPeriod, UiTaskStatus } from "@/types/task.types";
import { extractErrorMessage } from "@/utils/errorHandler";
import { uiStatusToApi } from "@/utils/statusMapper";
import { showError, showInfo, showSuccess } from "@/utils/toast";
import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = { visible: boolean; onClose: () => void; onCreated?: () => void };

// Mirrors the previous "half"/"full" snap points from the @expo/ui sheet.
const SNAP_POINTS = ["50%", "70%"];

const TOP_CHIPS = [
  { id: "assigned", icon: "people", label: "Assigned to" },
  { id: "dueDate", icon: "calendar", label: "Due Date" },
  { id: "priority", icon: "star", label: "Priority" },
];

// Advanced Task Module effort/duration unit — matches the web app's
// Minutes/Hours/Days switcher on the "Hrs" chip.
type EffortUnit = "minutes" | "hours" | "days";
const EFFORT_UNITS: { value: EffortUnit; label: string; abbrev: string }[] = [
  { value: "minutes", label: "Minutes", abbrev: "Min" },
  { value: "hours", label: "Hours", abbrev: "Hrs" },
  { value: "days", label: "Days", abbrev: "Days" },
];

const PRIORITY_OPTIONS = [
  { label: "Normal", dot: "#0DDFAB" },
  { label: "Critical", dot: "#FF4444" },
];

// "Recurring" is intentionally excluded — recurrence is modeled via the
// separate recurring-task toggle below, not as a selectable status.
const STATUSES = ALL_STATUSES.filter(
  (s) => s !== "Recurring" && s !== "Pending-Approval",
).map((s) => ({
  label: s,
  color: STATUS_COLORS[s]?.text ?? "#00DFAB",
}));

export default function CreateTaskModal({
  visible,
  onClose,
  onCreated,
}: Props) {
  const instanceIdRef = useRef(Math.random().toString(36).slice(2, 8));
  useEffect(() => {
    console.log(`[CreateTaskModal] MOUNTED instance=${instanceIdRef.current}`);
    return () => {
      console.log(
        `[CreateTaskModal] UNMOUNTED instance=${instanceIdRef.current}`,
      );
    };
  }, []);

  // Compensates KeyboardAvoidingView's padding for the home-indicator safe
  // area, otherwise that inset shows up as an empty gap above the keyboard.
  const insets = useSafeAreaInsets();
  const { state: authState } = useAuth();
  const {
    state: taskState,
    createTask,
    fetchAllTasks,
    allMappedTasks,
    reorderCritical,
  } = useTasks();

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
      fetchRef.current(companyIdRef.current, { silent: true });
    });

    return cleanup;
  }, [visible]);

  // Companies with the Advanced Task Module enabled schedule tasks by
  // effort/duration instead of a manually-picked due date — the backend
  // engine computes due_date itself. Defaults to the normal (Due Date) flow
  // until the company's module list has loaded.
  const isAdvanced = authState.hasAdvancedTaskModule === true;

  useEffect(() => {
    if (visible) {
      // console.log(
      //   `[CreateTaskModal] Opened for company_id=${authState.company?.company_id}, ` +
      //     `hasAdvancedTaskModule=${authState.hasAdvancedTaskModule}, isAdvanced=${isAdvanced}`,
      // );
    }
  }, [visible, authState.company?.company_id, authState.hasAdvancedTaskModule]);

  const [activePanel, setActivePanel] = useState<
    | "assigned"
    | "dueDate"
    | "priority"
    | "approval"
    | "status"
    | "recurring"
    | null
  >(null);
  const [selectedDueDate, setSelectedDueDate] = useState<Date | null>(null);
  const [effortHours, setEffortHours] = useState<string>("");
  const [effortUnit, setEffortUnit] = useState<EffortUnit>("hours");
  const [effortUnitOpen, setEffortUnitOpen] = useState(false);
  const effortUnitAbbrev =
    EFFORT_UNITS.find((u) => u.value === effortUnit)?.abbrev ?? "Hrs";

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

  const [selectedPriority, setSelectedPriority] = useState<string>("Normal");
  const [selectedPriorityId, setSelectedPriorityId] = useState<number | null>(
    null,
  );
  const [selectedApproval, setSelectedApproval] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  // recurringOpen removed — now uses recurringModalVisible popup
  const [isRecurringEnabled, setIsRecurringEnabled] = useState(false);
  const [recurringPeriod, setRecurringPeriod] =
    useState<RecurringPeriod | null>(null);
  const [periodDropdownOpen, setPeriodDropdownOpen] = useState(false);
  const [recurringTime, setRecurringTime] = useState<string>("09:00");
  const [recurringTotalCount, setRecurringTotalCount] = useState<string>("");
  const [recurringExcludeDays, setRecurringExcludeDays] = useState<string[]>(
    [],
  );
  const [recurringWeekDay, setRecurringWeekDay] = useState<string | null>(null);
  const [recurringMonthDate, setRecurringMonthDate] = useState<string>("");
  const [recurringAnnualMonth, setRecurringAnnualMonth] = useState<string>("");
  const [recurringAnnualDate, setRecurringAnnualDate] = useState<string>("");

  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [recurringModalVisible, setRecurringModalVisible] = useState(false);
  const [dependenciesModalVisible, setDependenciesModalVisible] =
    useState(false);
  const [depSearch, setDepSearch] = useState("");
  const [depFocused, setDepFocused] = useState(false);
  const [selectedDependencies, setSelectedDependencies] = useState<number[]>(
    [],
  );

  const [loading, setLoading] = useState(false);

  // ── Critical-task conflict flow ───────────────────────────────────────────
  // criticalPopupVisible: shown when assignee already has active critical tasks
  const [criticalPopupVisible, setCriticalPopupVisible] = useState(false);
  // orderModalVisible: shown after user picks "stop & start immediately"
  const [orderModalVisible, setOrderModalVisible] = useState(false);
  // pendingPayload: the task payload waiting to be created once user resolves conflict
  const pendingPayloadRef = useRef<Record<string, any> | null>(null);
  // existingCriticalTasks for the selected assignee
  const [assigneeCriticalTasks, setAssigneeCriticalTasks] = useState<
    CriticalTask[]
  >([]);
  // placeholder for the new task in the order modal (actual id set after creation)
  const PENDING_NEW_TASK_ID = -1;

  const RECURRING_PERIODS: { value: RecurringPeriod; label: string }[] = [
    { value: "daily", label: "Daily" },
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
    { value: "annually", label: "Annually" },
    // { value: "quarterly", label: "Quarterly" },
    // { value: "semi-annually", label: "Semi-Annually" },
  ];

  const descriptionEditorRef = useRef<RichTextEditorRef>(null);
  const sheetRef = useRef<BottomSheetModal>(null);

  const titleFloated = titleFocused || title.length > 0;

  const filteredUsers = taskState.taskOwners.filter((u) => {
    const fullName = `${u.first_name} ${u.last_name}`.toLowerCase();
    return fullName.includes(assignSearch.toLowerCase());
  });

  const [depVisibleCount, setDepVisibleCount] = useState(20);

  // All global tasks available for dependencies (excluding completed tasks)
  const availableTasksForDeps = useMemo(() => {
    const query = depSearch.trim().toLowerCase();
    const nonCompleted = allMappedTasks.filter((t) => t.status !== "Completed");
    if (!query) return nonCompleted;
    return nonCompleted.filter((t) => t.title.toLowerCase().includes(query));
  }, [allMappedTasks, depSearch]);

  const displayedDepsTasks = useMemo(() => {
    return availableTasksForDeps.slice(0, depVisibleCount);
  }, [availableTasksForDeps, depVisibleCount]);

  const handlePickFiles = (files: SelectedFile[]) => {
    setAttachments((prev) => [...prev, ...files]);
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDownloadAttachment = async (file: SelectedFile) => {
    try {
      if (Platform.OS === "web") {
        const response = await fetch(file.uri);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      }

      const dest = `${FileSystem.cacheDirectory}${file.name}`;
      const existing = await FileSystem.getInfoAsync(dest);
      if (existing.exists) {
        await FileSystem.deleteAsync(dest, { idempotent: true });
      }
      const response = await fetch(file.uri);
      const blob = await response.blob();
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          resolve(dataUrl.split(",")[1]);
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(blob);
      });
      await FileSystem.writeAsStringAsync(dest, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(dest, {
          mimeType: file.mimeType,
          dialogTitle: `Save ${file.name}`,
        });
      } else {
        showInfo("Download", "Sharing is not available on this device.");
      }
    } catch {
      showError("Error", "Failed to download file.");
    }
  };

  /**
   * Builds and validates the task payload, then either:
   *   A) Shows the critical-conflict popup (if priority=critical AND assignee already has active critical tasks)
   *   B) Directly creates the task (all other cases)
   */
  const handleCreateTask = async () => {
    if (!title.trim()) {
      showInfo("Validation", "Task title is required.");
      return;
    }
    if (!assignedUserId) {
      showInfo("Validation", "Please assign a user.");
      return;
    }
    if (isAdvanced) {
      if (!effortHours || parseFloat(effortHours) <= 0) {
        showInfo("Validation", "Hours is required.");
        return;
      }
    } else if (!selectedDueDate) {
      showInfo("Validation", "Please select a due date.");
      return;
    }
    if (!selectedPriority) {
      showInfo("Validation", "Priority is required.");
      return;
    }

    const descriptionHtml =
      await descriptionEditorRef.current?.getContentHtml();
    const companyId = authState.company?.company_id ?? 0;
    const companyIdentifier = authState.company?.company_identifier ?? "";
    const isRecurring = isRecurringEnabled;
    const priority = selectedPriority.toLowerCase() as "normal" | "critical";

    const totalCountNum = recurringTotalCount
      ? parseInt(recurringTotalCount, 10)
      : 0;
    const monthDateNum = recurringMonthDate
      ? parseInt(recurringMonthDate, 10)
      : null;
    const annualMonthNum = recurringAnnualMonth
      ? parseInt(recurringAnnualMonth, 10)
      : null;
    const annualDateNum = recurringAnnualDate
      ? parseInt(recurringAnnualDate, 10)
      : null;

    const requestPayload = {
      title: title.trim(),
      company_identifier: companyIdentifier,
      company_id: companyId,
      assign_to: assignedUserId,
      // Advanced companies leave due_date null — the scheduling engine
      // computes it from effort_hours/effort_unit/depends_on instead.
      due_date: isAdvanced ? null : (selectedDueDate as Date).toISOString(),
      task_priority: priority,
      bump_to_front: priority === "critical", // default; overridden per popup choice
      approval_required: selectedApproval === "Yes" ? 1 : 0,
      status: uiStatusToApi(
        (selectedStatus as UiTaskStatus) ??
          (isRecurring ? "Recurring" : "Pending"),
      ),
      description: descriptionHtml ?? description,
      project_id: null,
      sprint_id: null,
      parent_id: 0,
      is_recurring: isRecurring,
      recurring_period: isRecurring ? recurringPeriod : null,
      recurring_time: isRecurring && recurringTime ? recurringTime : null,
      recurring_total_count: isRecurring ? totalCountNum : 0,
      recurring_exclude_days:
        isRecurring && recurringPeriod === "daily" ? recurringExcludeDays : [],
      recurring_week_day:
        isRecurring && recurringPeriod === "weekly" ? recurringWeekDay : null,
      recurring_month_date:
        isRecurring && recurringPeriod === "monthly" ? monthDateNum : null,
      recurring_annual_month:
        isRecurring && recurringPeriod === "annually" ? annualMonthNum : null,
      recurring_annual_date:
        isRecurring && recurringPeriod === "annually" ? annualDateNum : null,
      effort_hours: isAdvanced ? parseFloat(effortHours) || 0 : 0,
      effort_unit: isAdvanced ? effortUnit : "hours",
      depends_on: selectedDependencies,
    };

    // ── Check for critical-task conflict ──────────────────────────────────────
    if (priority === "critical") {
      // Look for existing active critical tasks assigned to this user across all lists
      const activeCritical = [
        ...taskState.assignedToMe,
        ...taskState.createdByMe,
        ...taskState.allOtherTasks,
      ].filter(
        (t) =>
          t.asigned_to === assignedUserId &&
          t.task_priority === "critical" &&
          t.status !== "Complete" &&
          t.status !== "Rejected",
      );

      if (activeCritical.length > 0) {
        // Stash the payload and show the conflict popup
        pendingPayloadRef.current = requestPayload;
        setAssigneeCriticalTasks(
          activeCritical.map((t) => ({
            id: t.id,
            title: t.title,
            dueDate: t.due_date ?? undefined,
            status: t.status,
          })),
        );
        setCriticalPopupVisible(true);
        return; // wait for user choice
      }
    }

    // ── No conflict — create directly ─────────────────────────────────────────
    await doCreateTask(requestPayload);
  };

  /** Actually calls the API and handles success/error UI */
  const doCreateTask = async (payload: Record<string, any>) => {
    setLoading(true);
    try {
      // console.log(
      //   `[CreateTaskModal] FULL PAYLOAD:`,
      //   JSON.stringify(payload, null, 2),
      // );
      const response = await createTask(payload as any);
      // console.log(
      //   `[CreateTaskModal] BACKEND RESPONSE:`,
      //   JSON.stringify(response, null, 2),
      // );
      showSuccess("Success", "Task created successfully.");
      fetchAllTasks(payload.company_id as number, { silent: true }).catch(
        (err) =>
          console.error(
            "[CreateTaskModal] fetchAllTasks after create failed:",
            err,
          ),
      );
      resetForm();
      onClose();
      onCreated?.();
    } catch (error) {
      const msg = extractErrorMessage(error);
      showError("Error", msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Critical popup handlers ───────────────────────────────────────────────

  /** Option 1: Stop current task → create with bump_to_front: true */
  const handleStopAndStart = async () => {
    setCriticalPopupVisible(false);
    if (!pendingPayloadRef.current) return;
    const payload = { ...pendingPayloadRef.current, bump_to_front: true };
    setLoading(true);
    try {
      // console.log(
      //   `[CreateTaskModal] Critical Option 1 PAYLOAD:`,
      //   JSON.stringify(payload, null, 2),
      // );
      await createTask(payload as any);
      showSuccess(
        "Success",
        "Critical task created and scheduled at top priority.",
      );
      fetchAllTasks(authState.company?.company_id ?? 0, { silent: true }).catch(
        () => {},
      );
      pendingPayloadRef.current = null;
      resetForm();
      onClose();
      onCreated?.();
    } catch (error) {
      showError("Error", extractErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  /** Option 2: Wait → create with bump_to_front: false, close normally */
  const handleWaitAndSchedule = async () => {
    setCriticalPopupVisible(false);
    if (!pendingPayloadRef.current) return;
    const payload = { ...pendingPayloadRef.current, bump_to_front: false };
    await doCreateTask(payload);
    pendingPayloadRef.current = null;
  };

  /** Reorder modal confirmed: call POST /tasks/reorder-critical then close */
  const handleConfirmOrder = async (orderedIds: number[]) => {
    const companyId = authState.company?.company_id ?? 0;
    try {
      // Replace placeholder id -1 with the real new task id
      const newTaskId = pendingPayloadRef.current?._newTaskId as
        | number
        | undefined;
      const resolvedIds = orderedIds.map((id) =>
        id === PENDING_NEW_TASK_ID && newTaskId ? newTaskId : id,
      );
      await reorderCritical({ orderedIds: resolvedIds, company_id: companyId });
      fetchAllTasks(companyId, { silent: true }).catch(() => {});
      onCreated?.();
    } catch (error) {
      showError("Reorder Error", extractErrorMessage(error));
    } finally {
      setOrderModalVisible(false);
      pendingPayloadRef.current = null;
      resetForm();
      onClose();
    }
  };

  const resetForm = () => {
    setActivePanel(null);
    setTitle("");
    setTitleFocused(false);
    setDescription("");
    setDescFocused(false);
    setSelectedDueDate(null);
    setEffortHours("");
    setEffortUnit("hours");
    setEffortUnitOpen(false);
    setAssignSearch("");
    setAssignFocused(false);
    setAssignedUserId(null);
    setAssignedUserName("");
    setSelectedPriority("Normal");
    setSelectedPriorityId(null);
    setSelectedApproval(null);
    setSelectedStatus(null);
    setAssignModalVisible(false);
    setRecurringModalVisible(false);
    setDependenciesModalVisible(false);
    setIsRecurringEnabled(false);
    setRecurringPeriod(null);
    setPeriodDropdownOpen(false);
    setRecurringTime("09:00");
    setRecurringTotalCount("");
    setRecurringExcludeDays([]);
    setRecurringWeekDay(null);
    setRecurringMonthDate("");
    setRecurringAnnualMonth("");
    setRecurringAnnualDate("");
    setAttachments([]);
    setSelectedDependencies([]);
    setDepSearch("");
    setDepFocused(false);
    setDepVisibleCount(20);
    setCriticalPopupVisible(false);
    setOrderModalVisible(false);
    pendingPayloadRef.current = null;
    setAssigneeCriticalTasks([]);
    if (descriptionEditorRef.current) {
      descriptionEditorRef.current.setContentHtml("");
    }
  };

  // Automatically clear all form state when modal closes
  useEffect(() => {
    if (!visible) {
      resetForm();
    }
  }, [visible]);

  // Bridges the controlled `visible` prop to @gorhom/bottom-sheet's
  // imperative present()/dismiss() API. Keeps hasPresentedRef in sync so native
  // dismiss (swipe down / backdrop tap) resets presented status and prevents duplicate
  // dismiss() calls from corrupting gorhom's internal state machine.
  const hasPresentedRef = useRef(false);
  useEffect(() => {
    if (visible) {
      if (!hasPresentedRef.current) {
        hasPresentedRef.current = true;
        sheetRef.current?.present();
      }
    } else {
      if (hasPresentedRef.current) {
        hasPresentedRef.current = false;
        sheetRef.current?.dismiss();
      }
    }
  }, [visible]);

  const handleModalClose = useCallback(() => {
    hasPresentedRef.current = false;
    Keyboard.dismiss();
    resetForm();
    onClose();
  }, [onClose]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    [],
  );

  const handleSelectPriority = (label: string) => {
    setSelectedPriority(label);
    const priority = taskState.priorities.find(
      (p) => p.name.toLowerCase() === label.toLowerCase(),
    );
    setSelectedPriorityId(priority?.id ?? null);
  };

  // Set Normal as default priority when modal opens
  useEffect(() => {
    if (visible && !selectedPriorityId) {
      const normalPriority = taskState.priorities.find(
        (p) => p.name.toLowerCase() === "normal",
      );
      if (normalPriority) {
        setSelectedPriority("Normal");
        setSelectedPriorityId(normalPriority.id);
      }
    }
  }, [visible, taskState.priorities]);

  const handleToggleDependency = (taskId: number) => {
    setSelectedDependencies((prev) => {
      if (prev.includes(taskId)) {
        return prev.filter((id) => id !== taskId);
      }
      return [...prev, taskId];
    });
  };

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={SNAP_POINTS}
      enableDynamicSizing={false}
      onDismiss={handleModalClose}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={styles.dragHandlePill}
      backgroundStyle={styles.sheetBackground}
      enablePanDownToClose
      keyboardBehavior="extend"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
    >
      <View style={styles.fullHostFill}>
        <Pressable
          style={styles.sheetContainer}
          onPress={(e) => {
            e.stopPropagation();
            Keyboard.dismiss();
            descriptionEditorRef.current?.blur();
            setActivePanel(null);
          }}
        >
          <View style={styles.dragHandleBar}>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => sheetRef.current?.close()}
            >
              <Ionicons name="close" size={22} color="#1D1D1D" />
            </TouchableOpacity>
          </View>

          <BottomSheetScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View
              style={[
                styles.borderlessTitleWrap,
                titleFocused && styles.borderlessTitleWrapActive,
              ]}
            >
              {titleFocused && (
                <View style={styles.titleFloatLabelWrap}>
                  <Text style={styles.titleFloatLabelText}>
                    Enter a task title
                  </Text>
                </View>
              )}
              <TextInput
                allowFontScaling={false}
                style={styles.borderlessTitleInput}
                value={title}
                onChangeText={setTitle}
                placeholder={titleFocused ? "" : "Enter a task title"}
                placeholderTextColor="#9CA3AF"
                onFocus={() => setTitleFocused(true)}
                onBlur={() => setTitleFocused(false)}
                autoFocus={false}
              />
            </View>

            <View style={styles.borderlessDescWrap}>
              {!descFocused && !description.replace(/<[^>]*>/g, "").trim() && (
                <Ionicons
                  name="document-text-outline"
                  size={18}
                  color="#9CA3AF"
                  style={styles.descIcon}
                />
              )}
              <View style={{ flex: 1 }}>
                <RichTextEditor
                  ref={descriptionEditorRef}
                  label="Description"
                  placeholder={descFocused ? "" : "Description"}
                  initialHTML={description}
                  onChangeHTML={setDescription}
                  onFocus={() => setDescFocused(true)}
                  onBlur={() => setDescFocused(false)}
                  editorHeight={44}
                  containerStyle={styles.descEditor}
                  autoFocus={false}
                  borderless={false}
                />
              </View>
            </View>

            {/* ── Row 1 Chips: Assigned / Due Date / Priority ── */}
            <View style={styles.chipsRow}>
              {/* 1. Assigned to */}
              <TouchableOpacity
                style={[
                  styles.designChip,
                  (activePanel === "assigned" || !!assignedUserName) &&
                    styles.designChipDark,
                ]}
                onPress={() => {
                  Keyboard.dismiss();
                  setActivePanel((p) => (p === "assigned" ? null : "assigned"));
                }}
              >
                <Ionicons
                  name="people"
                  size={16}
                  color={
                    activePanel === "assigned" || !!assignedUserName
                      ? "#FFF"
                      : "#6B7280"
                  }
                />
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.designChipText,
                    (activePanel === "assigned" || !!assignedUserName) &&
                      styles.designChipTextWhite,
                  ]}
                >
                  {assignedUserName ? assignedUserName : "Assigned to"}
                </Text>
              </TouchableOpacity>

              {/* 2. Due Date (normal) / Hrs (advanced task module) */}
              {isAdvanced ? (
                <TouchableOpacity
                  style={[
                    styles.designChip,
                    (activePanel === "dueDate" || !!effortHours) &&
                      styles.designChipDark,
                  ]}
                  onPress={() => {
                    Keyboard.dismiss();
                    setActivePanel((p) => (p === "dueDate" ? null : "dueDate"));
                  }}
                >
                  <Ionicons
                    name="time"
                    size={16}
                    color={
                      activePanel === "dueDate" || !!effortHours
                        ? "#FFF"
                        : "#6B7280"
                    }
                  />
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.designChipText,
                      (activePanel === "dueDate" || !!effortHours) &&
                        styles.designChipTextWhite,
                    ]}
                  >
                    {effortHours
                      ? `${effortHours} ${effortUnitAbbrev}`
                      : effortUnitAbbrev}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.designChip,
                    (activePanel === "dueDate" || !!selectedDueDate) &&
                      styles.designChipDark,
                  ]}
                  onPress={() => {
                    Keyboard.dismiss();
                    setActivePanel((p) => (p === "dueDate" ? null : "dueDate"));
                  }}
                >
                  <Ionicons
                    name="calendar"
                    size={16}
                    color={
                      activePanel === "dueDate" || !!selectedDueDate
                        ? "#FFF"
                        : "#6B7280"
                    }
                  />
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.designChipText,
                      (activePanel === "dueDate" || !!selectedDueDate) &&
                        styles.designChipTextWhite,
                    ]}
                  >
                    {selectedDueDate
                      ? selectedDueDate.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      : "Due Date"}
                  </Text>
                </TouchableOpacity>
              )}

              {/* 3. Priority */}
              <TouchableOpacity
                style={[
                  styles.designChip,
                  (activePanel === "priority" || !!selectedPriority) &&
                    styles.designChipDark,
                ]}
                onPress={() => {
                  Keyboard.dismiss();
                  setActivePanel((p) => (p === "priority" ? null : "priority"));
                }}
              >
                <Ionicons
                  name="star"
                  size={16}
                  color={
                    activePanel === "priority" || !!selectedPriority
                      ? "#FFF"
                      : "#6B7280"
                  }
                />
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.designChipText,
                    (activePanel === "priority" || !!selectedPriority) &&
                      styles.designChipTextWhite,
                  ]}
                >
                  {selectedPriority ? selectedPriority : "Priority"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* ── Row 1 Expanded Panels ── */}
            {activePanel === "assigned" && (
              <View style={styles.assignedPanelWrap}>
                <FloatingInput
                  label="Search people"
                  value={assignSearch}
                  onChangeText={setAssignSearch}
                  autoCapitalize="none"
                  rightIcon="search-outline"
                />
                <ScrollView
                  style={{ maxHeight: 220, marginTop: 12 }}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                >
                  {filteredUsers.map((user) => {
                    const isSelected = assignedUserId === user.id;
                    const fullName = `${user.first_name} ${user.last_name}`;
                    const initial = (user.first_name?.[0] || "U").toUpperCase();
                    return (
                      <TouchableOpacity
                        key={user.id}
                        style={[
                          styles.peopleRow,
                          isSelected && styles.peopleRowSelected,
                        ]}
                        onPress={() => {
                          setAssignedUserId(user.id);
                          setAssignedUserName(fullName);
                          setActivePanel(null);
                        }}
                      >
                        <View style={styles.peopleAvatar}>
                          <Text
                            allowFontScaling={false}
                            style={styles.peopleAvatarText}
                          >
                            {initial}
                          </Text>
                        </View>
                        <Text
                          allowFontScaling={false}
                          style={styles.peopleName}
                        >
                          {fullName}
                        </Text>
                        {isSelected && (
                          <Ionicons
                            name="checkmark"
                            size={18}
                            color="#00DFAB"
                            style={{ marginLeft: "auto" }}
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {activePanel === "dueDate" && isAdvanced && (
              <View style={styles.inlinePanelBox}>
                <View style={styles.effortRow}>
                  <FloatingInput
                    label={
                      EFFORT_UNITS.find((u) => u.value === effortUnit)?.label ??
                      "Hours"
                    }
                    value={effortHours}
                    onChangeText={(text) =>
                      setEffortHours(text.replace(/[^0-9.]/g, ""))
                    }
                    keyboardType="numeric"
                    autoFocus
                    containerStyle={styles.effortInputWrap}
                  />
                  <View>
                    <TouchableOpacity
                      style={styles.effortUnitBtn}
                      onPress={() => setEffortUnitOpen((v) => !v)}
                    >
                      <Text
                        allowFontScaling={false}
                        style={styles.effortUnitBtnText}
                      >
                        {effortUnitAbbrev}
                      </Text>
                      <Ionicons name="chevron-down" size={14} color="#1D1D1D" />
                    </TouchableOpacity>

                    {effortUnitOpen && (
                      <View style={styles.effortUnitDropdown}>
                        {EFFORT_UNITS.map((u) => (
                          <TouchableOpacity
                            key={u.value}
                            style={styles.effortUnitDropdownItem}
                            onPress={() => {
                              setEffortUnit(u.value);
                              setEffortUnitOpen(false);
                            }}
                          >
                            <Text
                              allowFontScaling={false}
                              style={[
                                styles.effortUnitDropdownText,
                                u.value === effortUnit &&
                                  styles.effortUnitDropdownTextActive,
                              ]}
                            >
                              {u.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              </View>
            )}

            {activePanel === "dueDate" && !isAdvanced && (
              <View style={styles.inlinePanelBox}>
                <CalendarPicker
                  compact
                  startDate={selectedDueDate}
                  endDate={selectedDueDate}
                  onSelectStart={(d) => {
                    setSelectedDueDate(d);
                    setActivePanel(null);
                  }}
                  onSelectEnd={(d) => {
                    setSelectedDueDate(d);
                    setActivePanel(null);
                  }}
                />
              </View>
            )}

            {activePanel === "priority" && (
              <View style={styles.inlineOptionsRow}>
                {PRIORITY_OPTIONS.map((p) => {
                  const isSelected = selectedPriority === p.label;
                  return (
                    <TouchableOpacity
                      key={p.label}
                      style={[
                        styles.pillBtn,
                        isSelected
                          ? p.label === "Critical"
                            ? styles.pillRed
                            : styles.pillTeal
                          : styles.pillGrey,
                      ]}
                      onPress={() => {
                        handleSelectPriority(p.label);
                        setActivePanel(null);
                      }}
                    >
                      {isSelected ? (
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      ) : (
                        <View
                          style={[styles.pillDot, { backgroundColor: p.dot }]}
                        />
                      )}
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.pillText,
                          isSelected && styles.pillTextWhite,
                        ]}
                      >
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* ── Row 2 Chips & Inline Expanded Panels ── */}
            <View style={styles.chipsRow}>
              {/* 1. Approval Required Chip */}
              <TouchableOpacity
                style={[
                  styles.designChip,
                  (activePanel === "approval" || selectedApproval === "Yes") &&
                    styles.designChipDark,
                ]}
                onPress={() => {
                  Keyboard.dismiss();
                  setActivePanel((p) => (p === "approval" ? null : "approval"));
                }}
              >
                <Ionicons
                  name="folder"
                  size={16}
                  color={
                    activePanel === "approval" || selectedApproval === "Yes"
                      ? "#FFF"
                      : "#6B7280"
                  }
                />
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.designChipText,
                    (activePanel === "approval" ||
                      selectedApproval === "Yes") &&
                      styles.designChipTextWhite,
                  ]}
                >
                  Approval Required
                </Text>
              </TouchableOpacity>

              {/* Approval Options (renders directly beneath Approval Required) */}
              {activePanel === "approval" && (
                <View style={{ width: "100%", marginVertical: 6 }}>
                  <View style={styles.inlineOptionsRow}>
                    <TouchableOpacity
                      style={[
                        styles.pillBtn,
                        selectedApproval === "Yes"
                          ? styles.pillTeal
                          : styles.pillGrey,
                      ]}
                      onPress={() => {
                        setSelectedApproval("Yes");
                        setActivePanel(null);
                      }}
                    >
                      <Ionicons
                        name="checkmark"
                        size={14}
                        color={selectedApproval === "Yes" ? "#fff" : "#71717A"}
                      />
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.pillText,
                          selectedApproval === "Yes" && styles.pillTextWhite,
                        ]}
                      >
                        Yes
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.pillBtn,
                        selectedApproval === "No"
                          ? styles.pillTeal
                          : styles.pillGrey,
                      ]}
                      onPress={() => {
                        setSelectedApproval("No");
                        setActivePanel(null);
                      }}
                    >
                      <Ionicons
                        name="close"
                        size={14}
                        color={selectedApproval === "No" ? "#fff" : "#71717A"}
                      />
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.pillText,
                          selectedApproval === "No" && styles.pillTextWhite,
                        ]}
                      >
                        No
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* 2. Task Status Chip */}
              <TouchableOpacity
                style={[
                  styles.designChip,
                  (activePanel === "status" || !!selectedStatus) &&
                    styles.designChipDark,
                ]}
                onPress={() => {
                  Keyboard.dismiss();
                  setActivePanel((p) => (p === "status" ? null : "status"));
                }}
              >
                <Ionicons
                  name="sync-circle-outline"
                  size={16}
                  color={
                    activePanel === "status" || !!selectedStatus
                      ? "#FFF"
                      : "#6B7280"
                  }
                />
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.designChipText,
                    (activePanel === "status" || !!selectedStatus) &&
                      styles.designChipTextWhite,
                  ]}
                >
                  {selectedStatus ? selectedStatus : "Task Status"}
                </Text>
              </TouchableOpacity>

              {/* Status Options (renders directly beneath Task Status) */}
              {activePanel === "status" && (
                <View style={{ width: "100%", marginVertical: 6 }}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{
                      gap: 8,
                      paddingHorizontal: 2,
                    }}
                  >
                    {STATUSES.map((s) => {
                      const isSelected = selectedStatus === s.label;
                      return (
                        <TouchableOpacity
                          key={s.label}
                          style={[
                            styles.pillBtn,
                            isSelected
                              ? { backgroundColor: s.color }
                              : styles.pillGrey,
                          ]}
                          onPress={() => {
                            setSelectedStatus(s.label);
                            setActivePanel(null);
                          }}
                        >
                          {isSelected ? (
                            <Ionicons name="checkmark" size={14} color="#fff" />
                          ) : (
                            <View
                              style={[
                                styles.pillDot,
                                { backgroundColor: s.color },
                              ]}
                            />
                          )}
                          <Text
                            allowFontScaling={false}
                            style={[
                              styles.pillText,
                              isSelected && styles.pillTextWhite,
                            ]}
                          >
                            {s.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* 3. Recurring Task Chip */}
              <TouchableOpacity
                style={[
                  styles.designChip,
                  isRecurringEnabled && styles.designChipDark,
                ]}
                onPress={() => {
                  Keyboard.dismiss();
                  setActivePanel(null);
                  setRecurringModalVisible(true);
                }}
              >
                <Ionicons
                  name="alarm-outline"
                  size={16}
                  color={isRecurringEnabled ? "#FFF" : "#6B7280"}
                />
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.designChipText,
                    isRecurringEnabled && styles.designChipTextWhite,
                  ]}
                >
                  {isRecurringEnabled && recurringPeriod
                    ? `Recurring: ${recurringPeriod}`
                    : "Recurring Task"}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.attachInlineRow}>
              <DocumentPickerButton onPick={handlePickFiles} />
              {attachments.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={[styles.tagsScroll, { overflow: "visible" }]}
                  contentContainerStyle={styles.tagsScrollContent}
                  decelerationRate="fast"
                  bounces
                  overScrollMode="never"
                  nestedScrollEnabled
                >
                  {attachments.map((file, i) => (
                    <View key={`${file.name}-${i}`} style={styles.tag}>
                      <TouchableOpacity
                        onPress={() => handleDownloadAttachment(file)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Ionicons
                          name="download-outline"
                          size={14}
                          color="#0DDFAB"
                        />
                      </TouchableOpacity>
                      <Text style={styles.tagText} numberOfLines={1}>
                        {file.name}
                      </Text>
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
              )}
            </View>
            <View
              style={[
                styles.bottomActionRow,
                { paddingBottom: insets.bottom + 12 },
              ]}
            >
              <TouchableOpacity
                style={[styles.createBtn, loading && { opacity: 0.7 }]}
                activeOpacity={0.85}
                onPress={handleCreateTask}
                disabled={loading}
              >
                <Text style={styles.createBtnText}>
                  {loading ? "Creating..." : "+ Create Task"}
                </Text>
              </TouchableOpacity>
            </View>
          </BottomSheetScrollView>
        </Pressable>

        {/* ── Center Popup: Assign Task Modal ──
              Rendered as a plain absolute overlay (not a nested <Modal>) —
              see the absoluteCenterOverlay style comment for why. Must stay
              as a sibling of sheetContainer, inside the same positioned
              parent, for its absolute-fill styling to work. */}
        {assignModalVisible && (
          <Pressable
            style={[styles.centerModalOverlay, styles.absoluteCenterOverlay]}
            onPress={() => setAssignModalVisible(false)}
          >
            <Pressable style={styles.centerModalCard} onPress={() => {}}>
              <View style={styles.centerModalHeader}>
                <Text style={styles.centerModalTitle}>Assign Task</Text>
                <TouchableOpacity
                  onPress={() => setAssignModalVisible(false)}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={20} color="#1D1D1D" />
                </TouchableOpacity>
              </View>

              <View
                style={[
                  styles.depSearchWrap,
                  assignFocused && styles.searchWrapActive,
                  { marginBottom: 12 },
                ]}
              >
                <Ionicons
                  name="search-outline"
                  size={18}
                  color={
                    assignFocused || assignSearch.length > 0
                      ? "#1D1D1D"
                      : "#AAAAAA"
                  }
                  style={styles.depSearchIcon}
                />
                <TextInput
                  style={styles.depSearchInput}
                  value={assignSearch}
                  onChangeText={setAssignSearch}
                  onFocus={() => setAssignFocused(true)}
                  onBlur={() => setAssignFocused(false)}
                  placeholder="Search people..."
                  placeholderTextColor="#AAAAAA"
                />
              </View>

              {filteredUsers.length === 0 ? (
                <View style={styles.depEmpty}>
                  <Text style={styles.depEmptyText}>No people found</Text>
                </View>
              ) : (
                <ScrollView
                  style={{ maxHeight: 280 }}
                  showsVerticalScrollIndicator={false}
                >
                  {filteredUsers.map((user, index) => {
                    const fullName = `${user.first_name} ${user.last_name}`;
                    const isSelected = assignedUserId === user.id;
                    const initials = (
                      (user.first_name?.[0] ?? "") + (user.last_name?.[0] ?? "")
                    ).toUpperCase();
                    const isLast = index === filteredUsers.length - 1;

                    return (
                      <TouchableOpacity
                        key={user.id}
                        style={[
                          styles.depTaskRow,
                          isLast && { borderBottomWidth: 0 },
                          isSelected && styles.depTaskRowSelected,
                        ]}
                        onPress={() => {
                          setAssignedUserId(user.id);
                          setAssignedUserName(fullName);
                          setAssignModalVisible(false);
                        }}
                      >
                        <View style={styles.depTaskAvatar}>
                          <Text style={styles.depTaskAvatarText}>
                            {initials}
                          </Text>
                        </View>
                        <Text style={styles.depTaskTitle} numberOfLines={1}>
                          {fullName}
                        </Text>
                        {isSelected && (
                          <Ionicons
                            name="checkmark-circle"
                            size={18}
                            color="#0DDFAB"
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              <TouchableOpacity
                style={styles.doneBtn}
                onPress={() => setAssignModalVisible(false)}
              >
                <Text style={styles.doneBtnText}>Done</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        )}

        {/* ── Center Popup: Recurring Task Modal ── */}
        {recurringModalVisible && (
          <Pressable
            style={[styles.centerModalOverlay, styles.absoluteCenterOverlay]}
            onPress={() => setRecurringModalVisible(false)}
          >
            <Pressable style={styles.centerModalCard} onPress={() => {}}>
              <View style={styles.centerModalHeader}>
                <Text style={styles.centerModalTitle}>
                  Recurring Task Settings
                </Text>
                {isRecurringEnabled && (
                  <TouchableOpacity
                    onPress={() => {
                      setIsRecurringEnabled(false);
                      setRecurringPeriod(null);
                      setRecurringModalVisible(false);
                    }}
                    style={{ marginRight: 12 }}
                  >
                    <Text
                      style={{
                        fontSize: rf(13),
                        color: "#EF4444",
                        fontFamily: "SF_Pro_Medium",
                      }}
                    >
                      Turn Off
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => setRecurringModalVisible(false)}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={20} color="#1D1D1D" />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={{ maxHeight: 380 }}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.recurringCardBody}>
                  {/* 1. Recurrence Period Field */}
                  <View style={styles.fieldRow}>
                    <Ionicons
                      name="calendar-outline"
                      size={20}
                      color="#1D1D1D"
                      style={styles.fieldIcon}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>Recurrence Period</Text>
                      <TouchableOpacity
                        style={styles.fieldSelectBtn}
                        activeOpacity={0.7}
                        onPress={() => setPeriodDropdownOpen((prev) => !prev)}
                      >
                        <Text
                          style={[
                            styles.fieldSelectText,
                            !recurringPeriod && styles.fieldSelectPlaceholder,
                          ]}
                        >
                          {recurringPeriod
                            ? RECURRING_PERIODS.find(
                                (p) => p.value === recurringPeriod,
                              )?.label
                            : "+ Add Period"}
                        </Text>
                        <Ionicons
                          name="chevron-down"
                          size={14}
                          color="#6B7280"
                        />
                      </TouchableOpacity>

                      {periodDropdownOpen && (
                        <View style={styles.periodDropdownMenu}>
                          {RECURRING_PERIODS.map((p) => (
                            <TouchableOpacity
                              key={p.value}
                              style={styles.periodDropdownOption}
                              onPress={() => {
                                setRecurringPeriod(p.value);
                                setIsRecurringEnabled(true);
                                setPeriodDropdownOpen(false);
                              }}
                            >
                              <Text
                                style={[
                                  styles.periodOptionText,
                                  recurringPeriod === p.value &&
                                    styles.periodOptionTextSelected,
                                ]}
                              >
                                {p.label}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                  </View>

                  {/* 2. Exclude Days (when Daily is selected) */}
                  {recurringPeriod === "daily" && (
                    <View style={styles.fieldRow}>
                      <Ionicons
                        name="ban-outline"
                        size={20}
                        color="#1D1D1D"
                        style={styles.fieldIcon}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.fieldLabel}>Exclude Days</Text>
                        <View style={styles.daysPillRow}>
                          {[
                            "Mon",
                            "Tue",
                            "Wed",
                            "Thu",
                            "Fri",
                            "Sat",
                            "Sun",
                          ].map((day) => {
                            const selected = recurringExcludeDays.includes(day);
                            return (
                              <TouchableOpacity
                                key={day}
                                style={[
                                  styles.dayPill,
                                  selected && styles.dayPillActive,
                                ]}
                                onPress={() => {
                                  if (selected) {
                                    setRecurringExcludeDays(
                                      recurringExcludeDays.filter(
                                        (d) => d !== day,
                                      ),
                                    );
                                  } else {
                                    setRecurringExcludeDays([
                                      ...recurringExcludeDays,
                                      day,
                                    ]);
                                  }
                                }}
                              >
                                <Text
                                  style={[
                                    styles.dayPillText,
                                    selected && styles.dayPillTextActive,
                                  ]}
                                >
                                  {day}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    </View>
                  )}

                  {/* 3. Week Day selector (when Weekly is selected) */}
                  {recurringPeriod === "weekly" && (
                    <View style={styles.fieldRow}>
                      <Ionicons
                        name="calendar-outline"
                        size={20}
                        color="#1D1D1D"
                        style={styles.fieldIcon}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.fieldLabel}>Week Day</Text>
                        <View style={styles.daysPillRow}>
                          {[
                            "Mon",
                            "Tue",
                            "Wed",
                            "Thu",
                            "Fri",
                            "Sat",
                            "Sun",
                          ].map((day) => {
                            const selected = recurringWeekDay === day;
                            return (
                              <TouchableOpacity
                                key={day}
                                style={[
                                  styles.dayPill,
                                  selected && styles.dayPillActive,
                                ]}
                                onPress={() =>
                                  setRecurringWeekDay(selected ? null : day)
                                }
                              >
                                <Text
                                  style={[
                                    styles.dayPillText,
                                    selected && styles.dayPillTextActive,
                                  ]}
                                >
                                  {day}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    </View>
                  )}

                  {/* 4. Month Date (when Monthly is selected) */}
                  {recurringPeriod === "monthly" && (
                    <View style={styles.fieldRow}>
                      <Ionicons
                        name="calendar-outline"
                        size={20}
                        color="#1D1D1D"
                        style={styles.fieldIcon}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.fieldLabel}>
                          Day of Month (1-31)
                        </Text>
                        <TextInput
                          style={styles.fieldInput}
                          placeholder="e.g. 15"
                          placeholderTextColor="#AAAAAA"
                          keyboardType="numeric"
                          value={recurringMonthDate}
                          onChangeText={setRecurringMonthDate}
                        />
                      </View>
                    </View>
                  )}

                  {/* 5. Annual Month & Date (when Annually is selected) */}
                  {recurringPeriod === "annually" && (
                    <>
                      <View style={styles.fieldRow}>
                        <Ionicons
                          name="calendar-outline"
                          size={20}
                          color="#1D1D1D"
                          style={styles.fieldIcon}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.fieldLabel}>Month (1-12)</Text>
                          <TextInput
                            style={styles.fieldInput}
                            placeholder="e.g. 12"
                            placeholderTextColor="#AAAAAA"
                            keyboardType="numeric"
                            value={recurringAnnualMonth}
                            onChangeText={setRecurringAnnualMonth}
                          />
                        </View>
                      </View>
                      <View style={styles.fieldRow}>
                        <Ionicons
                          name="calendar-outline"
                          size={20}
                          color="#1D1D1D"
                          style={styles.fieldIcon}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.fieldLabel}>
                            Day of Month (1-31)
                          </Text>
                          <TextInput
                            style={styles.fieldInput}
                            placeholder="e.g. 25"
                            placeholderTextColor="#AAAAAA"
                            keyboardType="numeric"
                            value={recurringAnnualDate}
                            onChangeText={setRecurringAnnualDate}
                          />
                        </View>
                      </View>
                    </>
                  )}

                  {/* 6. Run Time */}
                  <View style={styles.fieldRow}>
                    <Ionicons
                      name="time-outline"
                      size={20}
                      color="#1D1D1D"
                      style={styles.fieldIcon}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>Run Time</Text>
                      <TextInput
                        style={styles.fieldInput}
                        placeholder="09:00"
                        placeholderTextColor="#AAAAAA"
                        value={recurringTime}
                        onChangeText={setRecurringTime}
                      />
                    </View>
                  </View>

                  {/* 7. No. of Recurrences */}
                  <View style={styles.fieldRow}>
                    <Ionicons
                      name="repeat-outline"
                      size={20}
                      color="#1D1D1D"
                      style={styles.fieldIcon}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>No. of Recurrences</Text>
                      <TextInput
                        style={styles.fieldInput}
                        placeholder="+ Add No"
                        placeholderTextColor="#AAAAAA"
                        keyboardType="numeric"
                        value={recurringTotalCount}
                        onChangeText={setRecurringTotalCount}
                      />
                    </View>
                  </View>
                </View>
              </ScrollView>

              <TouchableOpacity
                style={styles.doneBtn}
                onPress={() => setRecurringModalVisible(false)}
              >
                <Text style={styles.doneBtnText}>Done</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        )}

        {/* ── Center Popup: Dependencies Modal ── */}
        {dependenciesModalVisible && (
          <Pressable
            style={[styles.centerModalOverlay, styles.absoluteCenterOverlay]}
            onPress={() => setDependenciesModalVisible(false)}
          >
            <Pressable style={styles.centerModalCard} onPress={() => {}}>
              <View style={styles.centerModalHeader}>
                <Text style={styles.centerModalTitle}>Select Dependencies</Text>
                <TouchableOpacity
                  onPress={() => setDependenciesModalVisible(false)}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={20} color="#1D1D1D" />
                </TouchableOpacity>
              </View>

              <View
                style={[
                  styles.depSearchWrap,
                  depFocused && styles.searchWrapActive,
                  { marginBottom: 12 },
                ]}
              >
                <Ionicons
                  name="search-outline"
                  size={18}
                  color={
                    depFocused || depSearch.length > 0 ? "#1D1D1D" : "#AAAAAA"
                  }
                  style={styles.depSearchIcon}
                />
                <TextInput
                  style={styles.depSearchInput}
                  value={depSearch}
                  onChangeText={setDepSearch}
                  onFocus={() => setDepFocused(true)}
                  onBlur={() => setDepFocused(false)}
                  placeholder="Search tasks..."
                  placeholderTextColor="#AAAAAA"
                />
              </View>

              {displayedDepsTasks.length === 0 ? (
                <View style={styles.depEmpty}>
                  <Text style={styles.depEmptyText}>No tasks found</Text>
                </View>
              ) : (
                <ScrollView
                  style={{ maxHeight: 280 }}
                  showsVerticalScrollIndicator={false}
                >
                  {displayedDepsTasks.map((task, index) => {
                    const taskId = Number(task.id);
                    const isSelected = selectedDependencies.includes(taskId);
                    const titleWords = task.title.trim().split(/\s+/);
                    const initials =
                      (
                        (titleWords[0]?.[0] ?? "") + (titleWords[1]?.[0] ?? "")
                      ).toUpperCase() ||
                      task.assignedToInitials ||
                      "SB";
                    const isLast = index === displayedDepsTasks.length - 1;

                    return (
                      <TouchableOpacity
                        key={task.id}
                        style={[
                          styles.depTaskRow,
                          isLast && { borderBottomWidth: 0 },
                          isSelected && styles.depTaskRowSelected,
                        ]}
                        onPress={() => handleToggleDependency(taskId)}
                      >
                        <View style={styles.depTaskAvatar}>
                          <Text style={styles.depTaskAvatarText}>
                            {initials}
                          </Text>
                        </View>
                        <Text style={styles.depTaskTitle} numberOfLines={1}>
                          {task.title}
                        </Text>
                        {isSelected && (
                          <Ionicons
                            name="checkmark-circle"
                            size={18}
                            color="#0DDFAB"
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                  {depVisibleCount < availableTasksForDeps.length && (
                    <TouchableOpacity
                      style={{ paddingVertical: 12, alignItems: "center" }}
                      onPress={() => setDepVisibleCount((prev) => prev + 20)}
                    >
                      <Text
                        style={{
                          fontSize: rf(13),
                          color: "#0DDFAB",
                          fontFamily: "SF_Pro_Semibold",
                        }}
                      >
                        Load More Tasks (
                        {availableTasksForDeps.length - depVisibleCount}{" "}
                        remaining)
                      </Text>
                    </TouchableOpacity>
                  )}
                </ScrollView>
              )}

              <TouchableOpacity
                style={styles.doneBtn}
                onPress={() => setDependenciesModalVisible(false)}
              >
                <Text style={styles.doneBtnText}>Done</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        )}

        {/* ── Critical Task: Conflict Popup ──
              Rendered as a sibling overlay for the same reason as the
              popups above. */}
        <CriticalTaskPopUpModal
          visible={criticalPopupVisible}
          onClose={() => {
            setCriticalPopupVisible(false);
            pendingPayloadRef.current = null;
          }}
          onStopAndStart={handleStopAndStart}
          onWaitAndSchedule={handleWaitAndSchedule}
        />

        {/* ── Critical Task: Reorder Modal ── */}
        <OrderCriticalTasksModal
          visible={orderModalVisible}
          newTask={{
            id: PENDING_NEW_TASK_ID,
            title: pendingPayloadRef.current?.title ?? "New Critical Task",
            assignedTo: assignedUserName,
          }}
          existingCriticalTasks={assigneeCriticalTasks}
          onClose={() => {
            setOrderModalVisible(false);
            pendingPayloadRef.current = null;
            resetForm();
            onClose();
          }}
          onConfirm={handleConfirmOrder}
        />
      </View>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  fullHostFill: {
    flex: 1,
  },
  sheetBackground: {
    backgroundColor: "transparent",
  },
  sheetContainer: {
    flex: 1,
    width: "100%",
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 24, paddingTop: 14 },
  dragHandleBar: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 12,
    paddingBottom: 20,
    position: "relative",
  },
  dragHandlePill: {
    width: 38,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#D1D5DB",
  },
  footer: {
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  closeBtn: {
    position: "absolute",
    right: 20,
    top: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  borderlessTitleWrap: {
    marginBottom: 16,
    paddingHorizontal: 0,
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: 16,
    position: "relative",
  },
  borderlessTitleWrapActive: {
    borderColor: "#1D1D1D",
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: 14,
  },
  titleFloatLabelWrap: {
    position: "absolute",
    top: -9,
    left: 14,
    backgroundColor: "#fff",
    paddingHorizontal: 4,
  },
  titleFloatLabelText: {
    fontSize: rf(12),
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Regular",
  },
  borderlessTitleInput: {
    fontSize: rf(18),
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
    padding: 0,
    margin: 0,
    minHeight: 32,
  },
  borderlessDescWrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 18,
  },
  descIcon: {
    marginTop: 4,
  },
  descEditor: { marginBottom: 20 },
  descIdle: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 4,
    marginBottom: 20,
  },
  descIdlePlaceholder: {
    fontSize: rf(15),
    color: "#E6E6E6",
    fontFamily: "SF_Pro_Regular",
  },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginBottom: 5 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#AAAAAA",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: "#1D1D1D", borderColor: "#1D1D1D" },
  chipLabel: { fontSize: rf(13), color: "#AAAAAA", fontFamily: "SF_Pro_Regular" },
  chipLabelActive: { color: "#fff" },

  // Priority
  priorityRow: { flexDirection: "row", gap: 8, marginBottom: 5 },
  priorityChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#AAAAAA",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  priorityDot: { width: 8, height: 8, borderRadius: 4 },
  priorityLabel: {
    fontSize: rf(13),
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Regular",
  },

  // Assign panel
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
    position: "absolute",
    top: 12,
    left: 12,
    fontSize: rf(14),
    color: "#AAAAAA",
    fontFamily: "SF_Pro_Regular",
  },
  searchLabelFloated: {
    top: -9,
    left: 10,
    backgroundColor: "#fff",
    paddingHorizontal: 4,
    fontSize: rf(12),
    color: "#1D1D1D",
  },
  searchInput: {
    fontSize: rf(15),
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Regular",
    paddingRight: 28,
    padding: 0,
    height: 24,
  },
  searchIcon: { position: "absolute", right: 12, top: 12 },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  userAvatar: {
    width: 30,
    height: 30,
    borderRadius: 5,
    backgroundColor: "#0DDFAB",
    justifyContent: "center",
    alignItems: "center",
  },
  userAvatarText: {
    color: "#fff",
    fontSize: rf(12),
    fontFamily: "SF_Pro_Semibold",
  },
  userName: { fontSize: rf(14), color: "#1D1D1D", fontFamily: "SF_Pro_Regular" },

  // Approval
  approvalRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  approvalChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#AAAAAA",
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  approvalChipSelected: { backgroundColor: "#0DDFAB", borderColor: "#0DDFAB" },
  approvalLabel: {
    fontSize: rf(13),
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Regular",
  },
  approvalLabelSelected: { color: "#fff" },

  // Status
  statusScroll: { marginBottom: 5 },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#AAAAAA",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: rf(13), color: "#1D1D1D", fontFamily: "SF_Pro_Regular" },

  // Dependencies Panel
  depPanel: {
    width: "100%",
    marginTop: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E6E6E6",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  depSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    height: 44,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    backgroundColor: "#FFFFFF",
  },
  depSearchIcon: {
    marginRight: 8,
  },
  depSearchInput: {
    flex: 1,
    fontSize: rf(14),
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Regular",
    padding: 0,
    height: "100%",
  },
  depEmpty: {
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  depEmptyText: {
    fontSize: rf(13),
    color: "#AAAAAA",
    fontFamily: "SF_Pro_Regular",
  },
  depList: {
    maxHeight: 220,
  },
  depTaskRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    backgroundColor: "#FFFFFF",
    gap: 12,
  },
  depTaskRowSelected: {
    backgroundColor: "#F9FAF9",
  },
  depTaskAvatar: {
    width: 30,
    height: 30,
    borderRadius: 5,
    backgroundColor: "#00DEAB",
    justifyContent: "center",
    alignItems: "center",
  },
  depTaskAvatarText: {
    color: "#FFFFFF",
    fontSize: rf(12),
    fontFamily: "SF_Pro_Semibold",
  },
  depTaskTitle: {
    flex: 1,
    fontSize: rf(14),
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Regular",
  },

  // Attachments
  attachRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  attachBtn: {
    width: 38,
    height: 38,
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
    fontSize: rf(12.5),
    color: "#0DDFAB",
    fontFamily: "SF_Pro_Regular",
  },
  tagClose: {
    marginLeft: 4,
  },
  tagCloseText: {
    fontSize: rf(13),
    color: "#0DDFAB",
    fontFamily: "SF_Pro_Regular",
    lineHeight: 16,
  },

  attachInlineRow: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 10,
    marginTop: 8,
    marginBottom: 12,
  },
  bottomActionRow: {
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },

  // Create button
  createBtn: {
    backgroundColor: "#00DEAB",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  createBtnText: {
    fontSize: rf(15),
    color: "#FFFFFF",
    fontFamily: "SF_Pro_Semibold",
  },

  // Recurring Card & Field Styles
  recurringCard: {
    width: "100%",
    marginTop: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E6E6E6",
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  recurringCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  recurringCardTitle: {
    fontSize: rf(15),
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
  },
  recurringCardBody: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    paddingTop: 14,
    gap: 14,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  fieldIcon: {
    marginTop: 2,
  },
  fieldLabel: {
    fontSize: rf(14),
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
    marginBottom: 4,
  },
  fieldSelectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  fieldSelectText: {
    fontSize: rf(14),
    fontFamily: "SF_Pro_Regular",
    color: "#1D1D1D",
  },
  fieldSelectPlaceholder: {
    color: "#9CA3AF",
  },
  periodDropdownMenu: {
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  periodDropdownOption: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  periodOptionText: {
    fontSize: rf(14),
    fontFamily: "SF_Pro_Regular",
    color: "#1D1D1D",
  },
  periodOptionTextSelected: {
    fontFamily: "SF_Pro_Semibold",
    color: "#0DDFAB",
  },
  daysPillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  dayPill: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#FFFFFF",
  },
  dayPillActive: {
    borderColor: "#0DDFAB",
    backgroundColor: "#F0FDF9",
  },
  dayPillText: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Regular",
    color: "#6B7280",
  },
  dayPillTextActive: {
    fontFamily: "SF_Pro_Semibold",
    color: "#0DDFAB",
  },
  fieldInput: {
    fontSize: rf(14),
    fontFamily: "SF_Pro_Regular",
    color: "#1D1D1D",
    paddingVertical: 4,
    paddingHorizontal: 0,
  },
  outerScroll: {
    maxHeight: "85%",
  },
  chipChecked: {
    backgroundColor: "#0DDFAB",
    borderColor: "#0DDFAB",
  },
  centerModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  // Rendered as a plain absolutely-positioned overlay, not as a nested
  // <Modal> — nesting a native Modal on top of an open bottom sheet is
  // unreliable on iOS (it silently fails to present) even though it works
  // fine on Android. Must stay as a sibling of sheetContainer, inside the
  // same positioned parent, so it paints above it instead of behind it.
  absoluteCenterOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
  },
  centerModalCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    maxHeight: "80%",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  centerModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    paddingBottom: 12,
  },
  centerModalTitle: {
    fontSize: rf(18),
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
  },
  doneBtn: {
    backgroundColor: "#0DDFAB",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  doneBtnText: {
    color: "#fff",
    fontSize: rf(15),
    fontFamily: "SF_Pro_Semibold",
  },
  designChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },
  designChipDark: {
    backgroundColor: "#1D1D1D",
    borderColor: "#1D1D1D",
  },
  designChipText: {
    fontSize: rf(13),
    fontFamily: "SF_Pro_Medium",
    color: "#4B5563",
  },
  designChipTextWhite: {
    color: "#FFFFFF",
    fontFamily: "SF_Pro_Semibold",
  },
  inlinePanelBox: {
    width: "100%",
    marginVertical: 6,
    padding: 12,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  effortRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    zIndex: 100,
  },
  effortInputWrap: {
    flex: 1,
  },
  effortUnitBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  effortUnitBtnText: {
    fontSize: rf(13),
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
  },
  effortUnitDropdown: {
    position: "absolute",
    top: "100%",
    right: 0,
    marginTop: 4,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    zIndex: 200,
    minWidth: 90,
  },
  effortUnitDropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  effortUnitDropdownText: {
    fontSize: rf(13),
    fontFamily: "SF_Pro_Regular",
    color: "#4B5563",
  },
  effortUnitDropdownTextActive: {
    fontFamily: "SF_Pro_Bold",
    color: "#0DDFAB",
  },
  inlineOptionsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginVertical: 6,
    paddingHorizontal: 2,
  },
  pillBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
  },
  pillTeal: {
    backgroundColor: "#00DFAB",
  },
  pillGrey: {
    backgroundColor: "#F4F4F5",
  },
  pillLime: {
    backgroundColor: "#D9F99D",
  },
  pillRed: {
    backgroundColor: "#FF4444",
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pillText: {
    fontSize: rf(13),
    fontFamily: "SF_Pro_Medium",
    color: "#18181B",
  },
  pillTextWhite: {
    color: "#FFFFFF",
    fontFamily: "SF_Pro_Semibold",
  },
  assignedPanelWrap: {
    width: "100%",
    marginTop: 4,
    marginBottom: 8,
  },
  peopleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderRadius: 6,
    marginBottom: 2,
  },
  peopleRowSelected: {
    backgroundColor: "#F0FDF9",
  },
  peopleAvatar: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: "#00DFAB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  peopleAvatarText: {
    color: "#FFFFFF",
    fontSize: rf(12),
    fontFamily: "SF_Pro_Semibold",
  },
  peopleName: {
    fontSize: rf(13),
    fontFamily: "SF_Pro_Regular",
    color: "#1F2937",
  },
});
