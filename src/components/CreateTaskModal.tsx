import {
  CriticalTaskPopUpModal,
  OrderCriticalTasksModal,
  type CriticalTask,
} from "@/components/CriticalTaskModal";
import DependencyModal from "@/components/DependencyModal";
import type { RichTextEditorRef } from "@/components/texteditor";
import type { SelectedFile } from "@/features/attachments/types/attachment.types";
import { reorderCritical as reorderCriticalApi } from "@/features/tasks/api/taskApi";
import {
  DEFAULT_CREATE_TASK_FORM,
  type CreateTaskFormState,
} from "@/features/tasks/components/create-task/createTaskTypes";
import { TaskAttachmentsField } from "@/features/tasks/components/create-task/TaskAttachmentsField";
import { CreateAssigneeModal } from "@/features/tasks/components/create-task/CreateAssigneeModal";
import { CreateRecurringSettingsModal } from "@/features/tasks/components/create-task/CreateRecurringSettingsModal";
import { CreateTaskPrimaryFields } from "@/features/tasks/components/create-task/CreateTaskPrimaryFields";
import { CreateTaskSecondaryFields } from "@/features/tasks/components/create-task/CreateTaskSecondaryFields";
import { CreateTaskTitleDescription } from "@/features/tasks/components/create-task/fields/CreateTaskTitleDescription";
import {
  EFFORT_UNITS,
  type CreateTaskActivePanel,
  type EffortUnit,
} from "@/features/tasks/components/create-task/createTaskOptions";
import {
  validateCreateTaskAttachments,
  validateCreateTaskForm,
} from "@/features/tasks/components/create-task/createTaskValidation";
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
} from "@/features/tasks/utils/taskStatus";
import { toCalendarDateOnly, pktTodayStart } from "@/features/tasks/utils/taskDate";
import {
  isDependencyCandidateStatus,
  isNewCriticalFirst,
  replacePlaceholderId,
} from "@/features/tasks/utils/taskActionRules";
import { filterAndCapCreateAssignees } from "@/features/tasks/utils/taskOwnerFilter";
import { validateAttachment } from "@/features/tasks/utils/taskValidation";
import { useAuth } from "@/hooks/useAuth";
import { useTasks } from "@/hooks/useTasks";
import {
  getSocket,
  onSocketEvent,
  type UserUpdatePayload,
} from "@/services/socket/socketService";
import { extractErrorMessage } from "@/utils/errorHandler";
import { reportTaskError } from "@/features/tasks/utils/taskError";
import { rf } from "@/utils/responsive";
import { showError, showInfo, showSuccess } from "@/utils/toast";
import ModalCloseButton from "@/components/ModalCloseButton";
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
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = { visible: boolean; onClose: () => void; onCreated?: () => void };

// Mirrors the previous "half"/"full" snap points from the @expo/ui sheet.
const SNAP_POINTS = ["50%", "70%"];

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
  // effort/duration instead of a manually-picked due date â€” the backend
  // engine computes due_date itself.

  const [activePanel, setActivePanel] =
    useState<CreateTaskActivePanel>(null);
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

  // recurringOpen removed â€” now uses recurringModalVisible popup
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

  // â”€â”€ Critical-task conflict flow â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // criticalPopupVisible: shown when assignee already has active critical tasks
  const [criticalPopupVisible, setCriticalPopupVisible] = useState(false);
  // orderModalVisible: shown after user picks "stop & start immediately"
  const [orderModalVisible, setOrderModalVisible] = useState(false);
  // pendingForm: the validated form waiting to be created once the user
  // resolves the critical conflict.
  const pendingFormRef = useRef<CreateTaskFormState | null>(null);
  // Form waiting for the pre-create critical order confirmation.
  const orderFormRef = useRef<CreateTaskFormState | null>(null);
  const ORDER_PLACEHOLDER_ID = -1;
  // existingCriticalTasks for the selected assignee
  const [assigneeCriticalTasks, setAssigneeCriticalTasks] = useState<
    CriticalTask[]
  >([]);
  // The created task shown in the order modal (real id after creation).
  const [orderNewTask, setOrderNewTask] = useState<CriticalTask | null>(null);

  const descriptionEditorRef = useRef<RichTextEditorRef>(null);
  const sheetRef = useRef<BottomSheetModal>(null);
  const scrollViewRef = useRef<any>(null);
  const effortRowRef = useRef<any>(null);



  // Contract §9.1: at most 10 assignee results.
  const filteredUsers = filterAndCapCreateAssignees(
    taskState.taskOwners,
    assignSearch,
  );

  // All global tasks available for dependencies. Exclude only completed,
  // closed/cancelled and On-Hold tasks; search + paging are handled inside
  // the standalone DependencyModal.
  const availableTasksForDeps = useMemo(() => {
    return allMappedTasks.filter((t) =>
      isDependencyCandidateStatus(String(t._raw.status)),
    );
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
      fetchAllTasks(companyId, { silent: true }).catch((error) =>
        reportTaskError("Task list refresh after create/reorder failed", error),
      );
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
      showInfo(
        "Validation",
        validation.message ?? messages.join("\n"),
      );
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
      // Conflict prompt is an ATS-only, critical-only rule (contract Â§8.5).
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

  // â”€â”€ Critical popup handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /** Option 1: Stop current task â†’ create with bump_to_front: true. */
  const handleStopAndStart = () => {
    setCriticalPopupVisible(false);
    const form = pendingFormRef.current;
    pendingFormRef.current = null;
    if (!form) return;
    orderFormRef.current = form;
    setOrderNewTask({
      id: ORDER_PLACEHOLDER_ID,
      title: form.title,
      assignedTo: form.assignName,
      dueDate: form.dueDate ? toCalendarDateOnly(form.dueDate) : undefined,
      status: form.status,
    });
    setOrderModalVisible(true);
  };

  /** Option 2: Wait â†’ create with bump_to_front: false, close normally. */
  const handleWaitAndSchedule = async () => {
    setCriticalPopupVisible(false);
    const form = pendingFormRef.current;
    pendingFormRef.current = null;
    if (!form) return;
    await createFromForm(form, false);
  };

  /** Reorder modal confirmed: call POST /tasks/reorder-critical then close. */
  /** Cancel/back from the order sheet: reset back to Normal, keep the form. */
  const handleCancelOrder = () => {
    orderFormRef.current = null;
    setOrderModalVisible(false);
    setOrderNewTask(null);
    setAssigneeCriticalTasks([]);
    setSelectedPriority("normal");
  };

  /** Order confirmed before creation; then reorder with the real task id. */
  const handleConfirmOrder = async (orderedIds: number[]) => {
    const form = orderFormRef.current;
    if (!form) {
      handleCancelOrder();
      return;
    }
    const newFirst = isNewCriticalFirst(orderedIds, ORDER_PLACEHOLDER_ID);
    let createdId: number | null = null;
    try {
      const result = await submitCreateTask(form, { bumpToFront: newFirst });
      if (!result) return;
      createdId = result.id;

      showSuccess("Success", "Task created successfully.");
      if (result.planningHold) {
        showInfo(
          "Planning Project",
          result.message ??
            "This task's project is still in Planning, so the task stays On Hold until the project starts.",
        );
      }
      if (!result.task) {
        fetchAllTasks(companyId, { silent: true }).catch((error) =>
          reportTaskError("Task list refresh after create failed", error),
        );
      }

      const realOrder = replacePlaceholderId(
        orderedIds,
        ORDER_PLACEHOLDER_ID,
        result.id,
      );
      const reorderResult = await reorderCriticalApi({
        orderedIds: realOrder,
        company_id: companyId,
      });
      if (!reorderResult.ok) {
        showError("Reorder Error", reorderResult.message);
      } else if (reorderResult.data.blockedTasks.length > 0) {
        const titles = reorderResult.data.blockedTasks
          .map((task) => `"${task.title}"`)
          .join(", ");
        showInfo(
          "Order Saved",
          `Order saved. ${titles} have unfinished dependencies - they will be scheduled at the selected position once the dependencies are completed.`,
        );
      } else {
        showSuccess("Success", "Critical task order updated.");
      }
    } catch (error) {
      showError("Create Task", extractErrorMessage(error));
    } finally {
      orderFormRef.current = null;
      setOrderModalVisible(false);
      setOrderNewTask(null);
      setAssigneeCriticalTasks([]);
      if (createdId !== null) {
        finalizeCreate();
      }
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
    orderFormRef.current = null;
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

  // â”€â”€ Advanced effort (Hrs) panel: keep Hours/Unit fields above the keyboard â”€â”€
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
          // The sheet has finished extending to max height â€” re-measure the
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
            <ModalCloseButton
              onPress={() => sheetRef.current?.close()}
              style={styles.closeBtn}
            />
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
            <CreateTaskTitleDescription
              title={title}
              description={description}
              titleFocused={titleFocused}
              descFocused={descFocused}
              onChangeTitle={setTitle}
              onChangeDescription={setDescription}
              onTitleFocus={() => setTitleFocused(true)}
              onTitleBlur={() => setTitleFocused(false)}
              onDescriptionFocus={() => setDescFocused(true)}
              onDescriptionBlur={() => setDescFocused(false)}
              descriptionEditorRef={descriptionEditorRef}
            />

            <CreateTaskPrimaryFields
              activePanel={activePanel}
              setActivePanel={setActivePanel}
              effectiveAssigneeName={effectiveAssigneeName}
              assignSearch={assignSearch}
              onChangeAssignSearch={setAssignSearch}
              filteredUsers={filteredUsers}
              assignedUserId={assignedUserId}
              onSelectAssignee={(user) => {
                setAssignedUserId(user.id);
                setAssignedUserName(`${user.first_name} ${user.last_name}`);
                setActivePanel(null);
              }}
              isAdvanced={isAdvanced}
              effortHours={effortHours}
              effortUnit={effortUnit}
              effortUnitAbbrev={effortUnitAbbrev}
              effortUnitOpen={effortUnitOpen}
              onToggleEffortUnit={() => setEffortUnitOpen((v) => !v)}
              onEffortChange={handleEffortChange}
              onEffortBlur={handleEffortBlur}
              onEffortUnitChange={handleUnitChange}
              effectiveDueDate={effectiveDueDate}
              onSelectDueDate={(date) => {
                setSelectedDueDate(date);
                setActivePanel(null);
              }}
              effectivePriority={effectivePriority}
              onSelectPriority={(priority) => {
                handleSelectPriority(priority);
                setActivePanel(null);
              }}
              effortRowRef={effortRowRef}
            />

            <CreateTaskSecondaryFields
              activePanel={activePanel}
              setActivePanel={setActivePanel}
              selectedApproval={selectedApproval}
              onSelectApproval={(value) => {
                setSelectedApproval(value);
                setActivePanel(null);
              }}
              effectiveStatus={effectiveStatus}
              onSelectStatus={(status) => {
                setSelectedStatus(status);
                setActivePanel(null);
              }}
              isRecurringEnabled={isRecurringEnabled}
              recurringPeriod={recurringPeriod}
              onOpenRecurring={() => setRecurringModalVisible(true)}
              isAdvanced={isAdvanced}
              selectedDependencies={selectedDependencies}
              onOpenDependencies={() => setDependenciesModalVisible(true)}
            />

            <TaskAttachmentsField
              attachments={attachments}
              onPick={handlePickFiles}
              onRemove={removeAttachment}
              onDownload={handleDownloadAttachment}
            />
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

        {/* â”€â”€ Center Popup: Assign Task Modal â”€â”€
              Rendered as a plain absolute overlay (not a nested <Modal>) â€”
              see the absoluteCenterOverlay style comment for why. Must stay
              as a sibling of sheetContainer, inside the same positioned
              parent, for its absolute-fill styling to work. */}
        <CreateAssigneeModal
          visible={assignModalVisible}
          onClose={() => setAssignModalVisible(false)}
          assignSearch={assignSearch}
          assignFocused={assignFocused}
          onChangeAssignSearch={setAssignSearch}
          onAssignFocus={() => setAssignFocused(true)}
          onAssignBlur={() => setAssignFocused(false)}
          filteredUsers={filteredUsers}
          assignedUserId={assignedUserId}
          onSelectAssignee={(user) => {
            setAssignedUserId(user.id);
            setAssignedUserName(`${user.first_name} ${user.last_name}`);
            setAssignModalVisible(false);
          }}
          onDone={() => setAssignModalVisible(false)}
        />

        <CreateRecurringSettingsModal
          visible={recurringModalVisible}
          onClose={() => setRecurringModalVisible(false)}
          isRecurringEnabled={isRecurringEnabled}
          onTurnOff={() => {
            setIsRecurringEnabled(false);
            setRecurringPeriod(null);
            setRecurringModalVisible(false);
          }}
          recurringPeriod={recurringPeriod}
          periodDropdownOpen={periodDropdownOpen}
          onTogglePeriodDropdown={() => setPeriodDropdownOpen((prev) => !prev)}
          onSelectPeriod={(period) => {
            setRecurringPeriod(period);
            setIsRecurringEnabled(true);
            setPeriodDropdownOpen(false);
          }}
          recurringExcludeDays={recurringExcludeDays}
          onToggleExcludeDay={(day) => {
            if (recurringExcludeDays.includes(day)) {
              setRecurringExcludeDays(
                recurringExcludeDays.filter((d) => d !== day),
              );
            } else {
              setRecurringExcludeDays([...recurringExcludeDays, day]);
            }
          }}
          recurringWeekDay={recurringWeekDay}
          onSelectWeekDay={(day) =>
            setRecurringWeekDay(recurringWeekDay === day ? null : day)
          }
          recurringMonthDate={recurringMonthDate}
          onChangeMonthDate={setRecurringMonthDate}
          recurringAnnualMonth={recurringAnnualMonth}
          onChangeAnnualMonth={setRecurringAnnualMonth}
          recurringAnnualDate={recurringAnnualDate}
          onChangeAnnualDate={setRecurringAnnualDate}
          recurringTime={recurringTime}
          onChangeTime={setRecurringTime}
          recurringTotalCount={recurringTotalCount}
          onChangeTotalCount={setRecurringTotalCount}
          onDone={() => setRecurringModalVisible(false)}
        />

        {/* â”€â”€ Dependencies Modal (standalone native Modal, blurs everything
              behind it and owns its own scroll + keyboard handling) â”€â”€ */}
        <DependencyModal
          visible={dependenciesModalVisible}
          onClose={() => setDependenciesModalVisible(false)}
          availableTasks={availableTasksForDeps}
          selectedIds={selectedDependencies}
          onToggle={handleToggleDependency}
        />

        {/* â”€â”€ Critical Task: Conflict Popup â”€â”€
              Rendered as a sibling overlay for the same reason as the
              popups above. */}
        <CriticalTaskPopUpModal
          visible={criticalPopupVisible}
          onClose={() => {
            setCriticalPopupVisible(false);
            pendingFormRef.current = null;
            setSelectedPriority("normal");
          }}
          onStopAndStart={handleStopAndStart}
          onWaitAndSchedule={handleWaitAndSchedule}
        />

        {/* â”€â”€ Critical Task: Reorder Modal â”€â”€ */}
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
          onClose={handleCancelOrder}
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
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 10,
    flexGrow: 1,
  },
  dragHandleBar: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 8,
    paddingBottom: 12,
    position: "relative",
  },
  dragHandlePill: {
    width: 38,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#D1D5DB",
  },
  closeBtn: {
    position: "absolute",
    right: 16,
    top: 10,
    zIndex: 10,
  },
  bottomActionRow: {
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },

  // Create button
  createBtn: {
    backgroundColor: "#00DEAB",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  createBtnText: {
    fontSize: rf(13),
    color: "#FFFFFF",
    fontFamily: "SF_Pro_Semibold",
  },
});
