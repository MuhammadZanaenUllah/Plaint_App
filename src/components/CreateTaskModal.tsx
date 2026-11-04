import CalendarPicker from "@/components/CalendarPicker";
import {
  CriticalTaskPopUpModal,
  OrderCriticalTasksModal,
  type CriticalTask,
} from "@/components/CriticalTaskModal";
import DependencyModal from "@/components/DependencyModal";
import FloatingInput from "@/components/FloatingInput";
import RichTextEditor, { RichTextEditorRef } from "@/components/texteditor";
import DocumentPickerButton from "@/features/attachments/components/DocumentPickerButton";
import type { SelectedFile } from "@/features/attachments/types/attachment.types";
import { reorderCritical as reorderCriticalApi } from "@/features/tasks/api/taskApi";
import {
  DEFAULT_CREATE_TASK_FORM,
  RECURRING_PERIOD_OPTIONS,
  type CreateTaskFormState,
} from "@/features/tasks/components/create-task/createTaskTypes";
import {
  validateCreateTaskAttachments,
  validateCreateTaskForm,
} from "@/features/tasks/components/create-task/createTaskValidation";
import {
  CREATE_STATUSES,
  STATUS_COLORS,
  STATUS_DISPLAY,
} from "@/features/tasks/constants/taskConstants";
import { useCreateTaskSubmit } from "@/features/tasks/hooks/useCreateTaskSubmit";
import type {
  RecurringPeriod,
  TaskPriorityLevel,
  TaskStatus,
} from "@/features/tasks/types/task.types";
import {
  isCompletedStatus,
  isInProgressStatus,
  normalizeApiStatus,
  statusLabel,
} from "@/features/tasks/utils/taskStatus";
import { toCalendarDateOnly, pktTodayStart } from "@/features/tasks/utils/taskDate";
import { validateAttachment } from "@/features/tasks/utils/taskValidation";
import { useAuth } from "@/hooks/useAuth";
import { useTasks } from "@/hooks/useTasks";
import {
  getSocket,
  onSocketEvent,
  type UserUpdatePayload,
} from "@/services/socket/socketService";
import { extractErrorMessage } from "@/utils/errorHandler";
import { rf } from "@/utils/responsive";
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

// Advanced Task Module effort/duration unit — matches the web app's
// Minutes/Hours/Days switcher on the "Hrs" chip.
type EffortUnit = "minutes" | "hours" | "days";
const EFFORT_UNITS: { value: EffortUnit; label: string; abbrev: string }[] = [
  { value: "minutes", label: "Minutes", abbrev: "Min" },
  { value: "hours", label: "Hours", abbrev: "Hrs" },
  { value: "days", label: "Days", abbrev: "Days" },
];

const PRIORITY_OPTIONS: {
  value: TaskPriorityLevel;
  label: string;
  dot: string;
}[] = [
  { value: "normal", label: "Normal", dot: "#0DDFAB" },
  { value: "critical", label: "Critical", dot: "#FF4444" },
];

// Contract §3.8: create accepts only Pending, In-Progress, On-Hold or Complete.
// Recurring is a template flag, not a status; Rejected/Pending-Approval are
// server-driven transitions, not create-time choices.
const STATUSES = CREATE_STATUSES.map((status) => ({
  value: status,
  label: STATUS_DISPLAY[status] ?? status,
  color: STATUS_COLORS[status]?.fg ?? "#00DFAB",
}));

export default function CreateTaskModal({
  visible,
  onClose,
  onCreated,
}: Props) {
  // Compensates KeyboardAvoidingView's padding for the home-indicator safe
  // area, otherwise that inset shows up as an empty gap above the keyboard.
  const insets = useSafeAreaInsets();
  const { state: authState } = useAuth();
  const { state: taskState, fetchAllTasks, allMappedTasks } = useTasks();

  const companyId = authState.company?.company_id ?? 0;
  const companyIdentifier = authState.company?.company_identifier ?? "";
  const currentUserId = authState.user?.id ?? 0;
  const isAdvanced = authState.hasAdvancedTaskModule === true;

  const { submit: submitCreateTask, submitting } = useCreateTaskSubmit({
    companyId,
    companyIdentifier,
    isAts: isAdvanced,
    currentUserId,
  });

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !visible || !companyId) return;

    const cleanup = onSocketEvent("user_update", (payload: unknown) => {
      const p = payload as UserUpdatePayload;
      if (String(p?.company_id) !== String(companyId)) return;
      fetchAllTasks(companyId, { silent: true });
    });

    return cleanup;
  }, [visible, companyId, fetchAllTasks]);

  // Companies with the Advanced Task Module enabled schedule tasks by
  // effort/duration instead of a manually-picked due date — the backend
  // engine computes due_date itself.

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
  const [baseHours, setBaseHours] = useState<number | null>(null);
  const [effortUnitOpen, setEffortUnitOpen] = useState(false);
  const effortUnitAbbrev =
    EFFORT_UNITS.find((u) => u.value === effortUnit)?.abbrev ?? "Hrs";

  const handleEffortChange = (text: string) => {
    const sanitized = text.replace(/[^0-9.]/g, "");
    setEffortHours(sanitized);
    const num = parseFloat(sanitized);
    if (isNaN(num) || !sanitized) {
      setBaseHours(null);
      return;
    }
    if (effortUnit === "hours") {
      setBaseHours(num);
    } else if (effortUnit === "minutes") {
      setBaseHours(num / 60);
    } else if (effortUnit === "days") {
      setBaseHours(num * 8);
    }
  };

  // Hours use 0.5 increments; minutes use whole minutes; days keep the
  // converted value (0.25 day = 2 h) rather than rounding to half-days.
  const normalizeEffortValue = (value: string, unit: EffortUnit): string => {
    const num = parseFloat(value);
    if (!Number.isFinite(num) || num <= 0) return value;
    if (unit === "minutes") return String(Math.round(num));
    if (unit === "days") return String(Math.round(num * 10000) / 10000);
    return String(Math.round(num * 2) / 2);
  };

  const handleEffortBlur = () => {
    const num = parseFloat(effortHours);
    if (!Number.isFinite(num)) return;
    let normalized = num;
    if (effortUnit === "minutes") normalized = Math.round(num);
    else if (effortUnit === "days") normalized = Math.round(num * 10000) / 10000;
    else normalized = Math.round(num * 2) / 2;
    if (normalized <= 0) {
      setEffortHours("");
      setBaseHours(null);
      return;
    }
    setEffortHours(String(normalized));
    if (effortUnit === "minutes") setBaseHours(normalized / 60);
    else if (effortUnit === "days") setBaseHours(normalized * 8);
    else setBaseHours(normalized);
  };

  const handleUnitChange = (newUnit: EffortUnit) => {
    setEffortUnit(newUnit);
    setEffortUnitOpen(false);
    if (baseHours !== null && !isNaN(baseHours) && baseHours > 0) {
      let converted = baseHours;
      if (newUnit === "minutes") {
        converted = baseHours * 60;
      } else if (newUnit === "days") {
        converted = baseHours / 8;
      }
      const formatted = Number(converted.toFixed(4)).toString();
      setEffortHours(formatted);
    }
  };

  const [title, setTitle] = useState("");
  const [titleFocused, setTitleFocused] = useState(false);
  const [description, setDescription] = useState("");
  const [descFocused, setDescFocused] = useState(false);
  const [attachments, setAttachments] = useState<SelectedFile[]>([]);

  const [assignSearch, setAssignSearch] = useState("");
  const [assignFocused, setAssignFocused] = useState(false);
  const [assignedUserId, setAssignedUserId] = useState<number | null>(null);
  const [assignedUserName, setAssignedUserName] = useState<string>("");

  const [selectedPriority, setSelectedPriority] =
    useState<TaskPriorityLevel>("normal");
  const [selectedApproval, setSelectedApproval] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<TaskStatus | null>(null);

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
  const [selectedDependencies, setSelectedDependencies] = useState<number[]>(
    [],
  );

  // ── Critical-task conflict flow ───────────────────────────────────────────
  // criticalPopupVisible: shown when assignee already has active critical tasks
  const [criticalPopupVisible, setCriticalPopupVisible] = useState(false);
  // orderModalVisible: shown after user picks "stop & start immediately"
  const [orderModalVisible, setOrderModalVisible] = useState(false);
  // pendingForm: the validated form waiting to be created once the user
  // resolves the critical conflict.
  const pendingFormRef = useRef<CreateTaskFormState | null>(null);
  // existingCriticalTasks for the selected assignee
  const [assigneeCriticalTasks, setAssigneeCriticalTasks] = useState<
    CriticalTask[]
  >([]);
  // The created task shown in the order modal (real id after creation).
  const [orderNewTask, setOrderNewTask] = useState<CriticalTask | null>(null);

  const RECURRING_PERIODS = RECURRING_PERIOD_OPTIONS;

  const descriptionEditorRef = useRef<RichTextEditorRef>(null);
  const sheetRef = useRef<BottomSheetModal>(null);
  const scrollViewRef = useRef<any>(null);
  const effortRowRef = useRef<any>(null);



  const filteredUsers = taskState.taskOwners.filter((u) => {
    const fullName = `${u.first_name} ${u.last_name}`.toLowerCase();
    return fullName.includes(assignSearch.toLowerCase());
  });

  // All global tasks available for dependencies — only tasks whose status is
  // "Pending" or "In-Progress" can be selected as dependencies. Search + paging
  // are handled entirely inside the standalone DependencyModal.
  const availableTasksForDeps = useMemo(() => {
    const selectable = allMappedTasks.filter(
      (t) => t.status === "Pending" || t.status === "In-Progress",
    );
    return selectable;
  }, [allMappedTasks]);

  const handlePickFiles = (files: SelectedFile[]) => {
    const accepted: SelectedFile[] = [];
    for (const file of files) {
      const validation = validateAttachment(file);
      if (!validation.valid) {
        showError(
          "Attachment Rejected",
          `"${file.name}": ${Object.values(validation.errors)[0]}`,
        );
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length > 0) {
      setAttachments((prev) => [...prev, ...accepted]);
    }
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

  const defaultStatusForAssignee = useCallback(
    (userId: number | null): TaskStatus => {
      if (!userId) return "Pending";
      const hasActive = allMappedTasks.some(
        (task) =>
          Number(task._raw.asigned_to) === Number(userId) &&
          isInProgressStatus(task.status),
      );
      // Q-INT-06 / website behaviour: start the task immediately when the doer
      // has no active task, otherwise queue it as Pending.
      return hasActive ? "Pending" : "In-Progress";
    },
    [allMappedTasks],
  );

  // Defaults are derived so the form always shows the website-equivalent
  // values without setState-in-effect cascades.
  const selfOwner = taskState.taskOwners.find(
    (owner) => Number(owner.id) === Number(currentUserId),
  );
  const effectiveAssigneeId =
    assignedUserId ?? selfOwner?.id ?? (currentUserId || null);
  const effectiveAssigneeName =
    assignedUserName ||
    (selfOwner
      ? `${selfOwner.first_name} ${selfOwner.last_name}`.trim() ||
        selfOwner.full_name
      : authState.user
        ? `${authState.user.first_name} ${authState.user.last_name}`.trim()
        : "");
  const effectiveDueDate =
    selectedDueDate ?? (isAdvanced ? null : pktTodayStart());
  const effectiveStatus =
    selectedStatus ?? defaultStatusForAssignee(effectiveAssigneeId);
  const effectivePriority = isAdvanced ? selectedPriority : "normal";

  const buildForm = async (): Promise<CreateTaskFormState> => {
    const descriptionHtml =
      await descriptionEditorRef.current?.getContentHtml();
    return {
      ...DEFAULT_CREATE_TASK_FORM,
      title,
      description: descriptionHtml ?? description,
      assignTo: effectiveAssigneeId,
      assignName: effectiveAssigneeName,
      dueDate: effectiveDueDate,
      effortValue: normalizeEffortValue(effortHours, effortUnit),
      effortUnit,
      taskPriority: effectivePriority,
      status: effectiveStatus,
      approvalRequired: selectedApproval === "Yes",
      isRecurring: isRecurringEnabled,
      recurringPeriod,
      recurringTime: recurringTime || "09:00",
      recurringTotalCount,
      recurringExcludeDays,
      recurringWeekDay,
      recurringMonthDate,
      recurringAnnualMonth,
      recurringAnnualDate,
      projectId: null,
      sprintId: null,
      parentId: 0,
      dependsOn: isAdvanced ? selectedDependencies : [],
      attachments,
    };
  };

  const finalizeCreate = () => {
    resetForm();
    onClose();
    onCreated?.();
  };

  const createFromForm = async (
    form: CreateTaskFormState,
    bumpToFront: boolean,
    showOrderAfterCreate = false,
  ) => {
    const result = await submitCreateTask(form, { bumpToFront });
    if (!result) return;

    showSuccess("Success", "Task created successfully.");
    if (result.planningHold) {
      showInfo(
        "Planning Project",
        result.message ??
          "This task's project is still in Planning, so the task stays On Hold until the project starts.",
      );
    }

    // A socket `create` event and the reply normally update the list. If the
    // reply did not include the saved row, fall back to a silent refetch.
    if (!result.task) {
      fetchAllTasks(companyId, { silent: true }).catch(() => {});
    }

    if (showOrderAfterCreate && assigneeCriticalTasks.length > 0) {
      setOrderNewTask({
        id: result.id,
        title: form.title,
        assignedTo: form.assignName,
        dueDate: form.dueDate
          ? toCalendarDateOnly(form.dueDate)
          : undefined,
        status: form.status,
      });
      setOrderModalVisible(true);
      return;
    }

    finalizeCreate();
  };

  /**
   * Builds the form, validates it, and either shows the ATS critical-conflict
   * prompt or creates immediately.
   */
  const handleCreateTask = async () => {
    if (submitting) return;

    const form = await buildForm();
    const validation = validateCreateTaskForm(form, { isAts: isAdvanced });
    if (!validation.valid) {
      const messages = [...new Set(Object.values(validation.errors))];
      showInfo("Validation", messages.join("\n"));
      return;
    }

    const attachmentsValidation = validateCreateTaskAttachments(
      form.attachments,
    );
    if (!attachmentsValidation.valid) {
      showError("Attachment Rejected", attachmentsValidation.message);
      return;
    }

    const isCritical = isAdvanced && form.taskPriority === "critical";
    if (isCritical) {
      // Conflict prompt is an ATS-only, critical-only rule (contract §8.5).
      const activeCritical = allMappedTasks.filter(
        (task) =>
          Number(task._raw.asigned_to) === Number(form.assignTo) &&
          task._raw.task_priority === "critical" &&
          !isCompletedStatus(task._raw.status) &&
          normalizeApiStatus(task._raw.status) !== "Rejected",
      );

      if (activeCritical.length > 0) {
        pendingFormRef.current = form;
        setAssigneeCriticalTasks(
          activeCritical.map((task) => ({
            id: Number(task.id),
            title: task.title,
            dueDate: task._raw.due_date ?? undefined,
            status: task._raw.status,
          })),
        );
        setCriticalPopupVisible(true);
        return;
      }
    }

    await createFromForm(form, isCritical);
  };

  // ── Critical popup handlers ───────────────────────────────────────────────

  /** Option 1: Stop current task → create with bump_to_front: true. */
  const handleStopAndStart = async () => {
    setCriticalPopupVisible(false);
    const form = pendingFormRef.current;
    pendingFormRef.current = null;
    if (!form) return;
    await createFromForm(form, true, true);
  };

  /** Option 2: Wait → create with bump_to_front: false, close normally. */
  const handleWaitAndSchedule = async () => {
    setCriticalPopupVisible(false);
    const form = pendingFormRef.current;
    pendingFormRef.current = null;
    if (!form) return;
    await createFromForm(form, false);
  };

  /** Reorder modal confirmed: call POST /tasks/reorder-critical then close. */
  const handleConfirmOrder = async (orderedIds: number[]) => {
    try {
      const result = await reorderCriticalApi({
        orderedIds,
        company_id: companyId,
      });
      if (!result.ok) {
        showError("Reorder Error", result.message);
      } else if (result.data.blockedTasks.length > 0) {
        const titles = result.data.blockedTasks
          .map((task) => `"${task.title}"`)
          .join(", ");
        showInfo(
          "Order Saved",
          `Order saved. ${titles} have unfinished dependencies — they will be scheduled at the selected position once the dependencies are completed.`,
        );
      } else {
        showSuccess("Success", "Critical task order updated.");
      }
      fetchAllTasks(companyId, { silent: true }).catch(() => {});
    } catch (error) {
      showError("Reorder Error", extractErrorMessage(error));
    } finally {
      setOrderModalVisible(false);
      setOrderNewTask(null);
      finalizeCreate();
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
    setBaseHours(null);
    setEffortUnitOpen(false);
    setAssignSearch("");
    setAssignFocused(false);
    setAssignedUserId(null);
    setAssignedUserName("");
    setSelectedPriority("normal");
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
    setDependenciesModalVisible(false);
    setCriticalPopupVisible(false);
    setOrderModalVisible(false);
    setOrderNewTask(null);
    pendingFormRef.current = null;
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

  // ── Advanced effort (Hrs) panel: keep Hours/Unit fields above the keyboard ──
  // The effort input auto-focuses when the panel opens, so the keyboard
  // covers the lower part of the sheet. Track the keyboard and scroll the
  // effort row so its bottom sits just above the keyboard's top edge, once
  // everything has settled (layout + keyboard animation). measureInWindow +
  // a tracked scroll offset are used instead of measure()'s y, because on
  // Fabric (RN 0.86) measure() reports window-relative coordinates, which
  // made the old one-shot scroll target wrong.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const keyboardTopRef = useRef(0); // keyboard top edge, in screen coords
  const scrollOffsetRef = useRef(0); // current scroll offset of the sheet's ScrollView
  const currentSnapIndexRef = useRef(0); // last settled snap index (via onChange)
  const topSnapIndex = SNAP_POINTS.length - 1;

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", (e) => {
      keyboardTopRef.current = e.endCoordinates?.screenY ?? 0;
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
      // Auto-extend the sheet to its max snap point whenever the keyboard
      // opens, so every field is reachable above the keyboard without the
      // user having to drag the sheet up first. gorhom's built-in keyboard
      // handling is a no-op on Android (interactive + adjustResize), so at the
      // default 50% snap the lower fields otherwise stay hidden behind the
      // keyboard.
      if (currentSnapIndexRef.current < topSnapIndex) {
        setTimeout(() => {
          sheetRef.current?.snapToIndex(topSnapIndex);
        }, 40);
      }
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      keyboardTopRef.current = 0;
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [topSnapIndex]);

  const effortPanelOpen = activePanel === "dueDate" && isAdvanced;

  const bringEffortRowIntoView = useCallback(() => {
    if (!effortRowRef.current || !scrollViewRef.current) return;
    if (keyboardHeight === 0 || keyboardTopRef.current === 0) return;
    effortRowRef.current.measureInWindow(
      (x: number, y: number, width: number, height: number) => {
        const rowBottom = y + height;
        // Leave a small gap between the fields and the keyboard
        const visibleBottom = keyboardTopRef.current - 16;
        const overshoot = rowBottom - visibleBottom;
        if (overshoot > 0) {
          const target = Math.max(0, scrollOffsetRef.current + overshoot);
          scrollViewRef.current?.scrollTo?.({ y: target, animated: true });
        }
      },
    );
  }, [keyboardHeight]);

  // Fallback: scroll shortly after the panel renders (covers the case where
  // the keyboard was already open and keyboardDidShow does not re-fire).
  useEffect(() => {
    if (!effortPanelOpen) return;
    const t = setTimeout(bringEffortRowIntoView, 200);
    return () => clearTimeout(t);
  }, [effortPanelOpen, bringEffortRowIntoView]);

  // Main path: once the keyboard is fully up and the sheet has settled,
  // re-measure and scroll the effort row above the keyboard.
  useEffect(() => {
    if (!effortPanelOpen || keyboardHeight === 0) return;
    const t = setTimeout(bringEffortRowIntoView, 100);
    return () => clearTimeout(t);
  }, [effortPanelOpen, keyboardHeight, bringEffortRowIntoView]);

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

  const handleSelectPriority = (value: TaskPriorityLevel) => {
    setSelectedPriority(isAdvanced ? value : "normal");
  };

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
      onChange={(index) => {
        currentSnapIndexRef.current = index;
        if (index === topSnapIndex) {
          // The sheet has finished extending to max height — re-measure the
          // auto-focused effort row now that the layout is stable (the earlier
          // effort-row scroll ran mid-animation and can land slightly low).
          setTimeout(bringEffortRowIntoView, 120);
        }
      }}
      onDismiss={handleModalClose}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={styles.dragHandlePill}
      backgroundStyle={styles.sheetBackground}
      enablePanDownToClose
      keyboardBehavior="interactive"
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
            ref={scrollViewRef}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.scrollContent,
              // While the Hrs panel is open with the keyboard up, extend the
              // content so the Hours/Unit row can always be scrolled above
              // the keyboard (scrollTo is otherwise clamped by the content
              // height).
              effortPanelOpen &&
                keyboardHeight > 0 && {
                  paddingBottom: keyboardHeight + insets.bottom + 12,
                },
            ]}
            keyboardShouldPersistTaps="handled"
            onScroll={(e) => {
              scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
            }}
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
              <View style={{ flex: 1, position: "relative" }}>
                <RichTextEditor
                  ref={descriptionEditorRef}
                  label="Description"
                  placeholder=""
                  initialHTML={description}
                  onChangeHTML={setDescription}
                  onFocus={() => setDescFocused(true)}
                  onBlur={() => setDescFocused(false)}
                  editorHeight={44}
                  containerStyle={styles.descEditor}
                  autoFocus={false}
                  borderless={false}
                />
                {!descFocused &&
                  !description.replace(/<[^>]*>/g, "").trim() && (
                    <Pressable
                      style={styles.descIdleOverlay}
                      onPress={(e) => {
                        e.stopPropagation();
                        descriptionEditorRef.current?.focus();
                        if (Platform.OS === "android") {
                          descriptionEditorRef.current?.showAndroidKeyboard();
                        }
                      }}
                    >
                      <Ionicons
                        name="document-text-outline"
                        size={18}
                        color="#9CA3AF"
                      />
                      <Text style={styles.descIdlePlaceholder}>
                        Description
                      </Text>
                    </Pressable>
                  )}
              </View>
            </View>

            {/* ── Row 1 Chips: Assigned / Due Date / Priority ── */}
            <View style={styles.chipsRow}>
              {/* 1. Assigned to */}
              <TouchableOpacity
                style={[
                  styles.designChip,
                  (activePanel === "assigned" || !!effectiveAssigneeName) &&
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
                    activePanel === "assigned" || !!effectiveAssigneeName
                      ? "#FFF"
                      : "#6B7280"
                  }
                />
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.designChipText,
                    (activePanel === "assigned" || !!effectiveAssigneeName) &&
                      styles.designChipTextWhite,
                  ]}
                >
                  {effectiveAssigneeName ? effectiveAssigneeName : "Assigned to"}
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
                    (activePanel === "dueDate" || !!effectiveDueDate) &&
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
                      activePanel === "dueDate" || !!effectiveDueDate
                        ? "#FFF"
                        : "#6B7280"
                    }
                  />
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.designChipText,
                      (activePanel === "dueDate" || !!effectiveDueDate) &&
                        styles.designChipTextWhite,
                    ]}
                  >
                    {effectiveDueDate
                      ? effectiveDueDate.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      : "Due Date"}
                  </Text>
                </TouchableOpacity>
              )}

              {/* 3. Priority — critical is ATS-only; normal companies show Normal */}
              <TouchableOpacity
                style={[styles.designChip, styles.designChipDark]}
                onPress={() => {
                  if (!isAdvanced) return;
                  Keyboard.dismiss();
                  setActivePanel((p) => (p === "priority" ? null : "priority"));
                }}
              >
                <Ionicons name="star" size={16} color="#FFF" />
                <Text
                  allowFontScaling={false}
                  style={[styles.designChipText, styles.designChipTextWhite]}
                >
                  {effectivePriority === "critical" ? "Critical" : "Normal"}
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
                  {filteredUsers.length === 0 ? (
                    <Text style={styles.peopleName}>No members found</Text>
                  ) : (
                    filteredUsers.map((user) => {
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
                    })
                  )}
                </ScrollView>
              </View>
            )}

            {activePanel === "dueDate" && isAdvanced && (
              <View style={styles.inlinePanelBox} ref={effortRowRef}>
                <View style={styles.effortRow}>
                  <FloatingInput
                    label={
                      EFFORT_UNITS.find((u) => u.value === effortUnit)?.label ??
                      "Hours"
                    }
                    value={effortHours}
                    onChangeText={handleEffortChange}
                    onBlur={handleEffortBlur}
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
                            onPress={() => handleUnitChange(u.value)}
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
                  startDate={effectiveDueDate}
                  endDate={effectiveDueDate}
                  minDate={pktTodayStart()}
                  disablePast
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
                {(isAdvanced
                  ? PRIORITY_OPTIONS
                  : PRIORITY_OPTIONS.filter((p) => p.value === "normal")
                ).map((p) => {
                  const isSelected = effectivePriority === p.value;
                  return (
                    <TouchableOpacity
                      key={p.value}
                      style={[
                        styles.pillBtn,
                        isSelected
                          ? p.value === "critical"
                            ? styles.pillRed
                            : styles.pillTeal
                          : styles.pillGrey,
                      ]}
                      onPress={() => {
                        handleSelectPriority(p.value);
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
                  (activePanel === "status" || !!effectiveStatus) &&
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
                    activePanel === "status" || !!effectiveStatus
                      ? "#FFF"
                      : "#6B7280"
                  }
                />
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.designChipText,
                    (activePanel === "status" || !!effectiveStatus) &&
                      styles.designChipTextWhite,
                  ]}
                >
                  {statusLabel(effectiveStatus)}
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
                      const isSelected = effectiveStatus === s.value;
                      return (
                        <TouchableOpacity
                          key={s.value}
                          style={[
                            styles.pillBtn,
                            isSelected
                              ? { backgroundColor: s.color }
                              : styles.pillGrey,
                          ]}
                          onPress={() => {

                            setSelectedStatus(s.value);
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

              {/* 4. Dependencies Chip — ATS-only (contract §3.8) */}
              {isAdvanced && (
                <TouchableOpacity
                  style={[
                    styles.designChip,
                    selectedDependencies.length > 0 && styles.designChipDark,
                  ]}
                  onPress={() => {
                    Keyboard.dismiss();
                    setActivePanel(null);
                    setDependenciesModalVisible(true);
                  }}
                >
                  <Ionicons
                    name="git-compare-outline"
                    size={16}
                    color={
                      selectedDependencies.length > 0 ? "#FFF" : "#6B7280"
                    }
                  />
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.designChipText,
                      selectedDependencies.length > 0 &&
                        styles.designChipTextWhite,
                    ]}
                  >
                    {selectedDependencies.length > 0
                      ? `${selectedDependencies.length} Dep${selectedDependencies.length > 1 ? "s" : ""}`
                      : "Dependencies"}
                  </Text>
                </TouchableOpacity>
              )}
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
                style={[styles.createBtn, submitting && { opacity: 0.7 }]}
                activeOpacity={0.85}
                onPress={handleCreateTask}
                disabled={submitting}
              >
                <Text style={styles.createBtnText}>
                  {submitting ? "Creating..." : "+ Create Task"}
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

        {/* ── Dependencies Modal (standalone native Modal, blurs everything
              behind it and owns its own scroll + keyboard handling) ── */}
        <DependencyModal
          visible={dependenciesModalVisible}
          onClose={() => setDependenciesModalVisible(false)}
          availableTasks={availableTasksForDeps}
          selectedIds={selectedDependencies}
          onToggle={handleToggleDependency}
        />

        {/* ── Critical Task: Conflict Popup ──
              Rendered as a sibling overlay for the same reason as the
              popups above. */}
        <CriticalTaskPopUpModal
          visible={criticalPopupVisible}
          onClose={() => {
            setCriticalPopupVisible(false);
            pendingFormRef.current = null;
          }}
          onStopAndStart={handleStopAndStart}
          onWaitAndSchedule={handleWaitAndSchedule}
        />

        {/* ── Critical Task: Reorder Modal ── */}
        <OrderCriticalTasksModal
          visible={orderModalVisible}
          newTask={
            orderNewTask ?? {
              id: 0,
              title: "New Critical Task",
              assignedTo: effectiveAssigneeName,
            }
          }
          existingCriticalTasks={assigneeCriticalTasks}
          onClose={finalizeCreate}
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
  descEditor: { marginBottom: 20 },
  descIdle: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 4,
    marginBottom: 20,
  },
  descIdleOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 0,
  },
  descIdlePlaceholder: {
    fontSize: rf(18),
    color: "#9CA3AF",
    fontFamily: "SF_Pro_Semibold",
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
  chipLabel: {
    fontSize: rf(13),
    color: "#AAAAAA",
    fontFamily: "SF_Pro_Regular",
  },
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
  userName: {
    fontSize: rf(14),
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Regular",
  },

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
  statusLabel: {
    fontSize: rf(13),
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Regular",
  },

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
