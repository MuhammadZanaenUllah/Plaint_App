import type { SelectedFile } from "@/features/attachments/types/attachment.types";
import {
  addDependency,
  approveTask,
  deleteAttachment,
  reassignTask,
  recalculateSchedule,
  removeDependency,
  reorderCritical,
  updateTaskDueDate,
  uploadAttachment,
} from "@/features/tasks/api/taskApi";
import {
  addNote as addNoteApi,
  deleteNote as deleteNoteApi,
  pinNote as pinNoteApi,
  updateNote as updateNoteApi,
  updateNoteReaction,
} from "@/features/tasks/api/taskNotesApi";
import { buildUpdateTaskPayload } from "@/features/tasks/components/task-detail/taskUpdatePayload";
import { TaskDetailCommentsTab } from "@/features/tasks/components/task-detail/TaskDetailCommentsTab";
import { TaskDetailDetailsTab } from "@/features/tasks/components/task-detail/TaskDetailDetailsTab";
import { TaskDetailApprovalPicker } from "@/features/tasks/components/task-detail/pickers/TaskDetailApprovalPicker";
import { TaskDetailAssigneePicker } from "@/features/tasks/components/task-detail/pickers/TaskDetailAssigneePicker";
import { TaskDetailDueDatePicker } from "@/features/tasks/components/task-detail/pickers/TaskDetailDueDatePicker";
import { TaskDetailEffortLogsModal } from "@/features/tasks/components/task-detail/pickers/TaskDetailEffortLogsModal";
import { TaskDetailEffortPicker } from "@/features/tasks/components/task-detail/pickers/TaskDetailEffortPicker";
import { TaskDetailPriorityPicker } from "@/features/tasks/components/task-detail/pickers/TaskDetailPriorityPicker";
import { TaskDetailStatusPicker } from "@/features/tasks/components/task-detail/pickers/TaskDetailStatusPicker";
import ReopenTaskModal from "@/features/tasks/components/task-detail/ReopenTaskModal";
import ResumeTaskModal from "@/features/tasks/components/task-detail/ResumeTaskModal";
import { useTaskDetailSocket } from "@/features/tasks/hooks/useTaskDetailSocket";
import {
  hasPermission,
  TASK_PERMISSIONS,
} from "@/features/tasks/permissions/taskPermissions";
import { useTasksStore } from "@/features/tasks/store/tasksStore";
import { getSprints } from "@/features/projects/api/sprintsApi";
import { getProjectDetail } from "@/features/projects/api/projectsApi";
import { fromMinutes, toMinutes } from "@/features/tasks/utils/taskEffort";
import { parseTaskDate, toCalendarDateOnly } from "@/features/tasks/utils/taskDate";
import { normalizeApiStatus, toApiStatus } from "@/features/tasks/utils/taskStatus";
import {
  dependencyErrorMessage,
  isDependencyCandidateStatus,
  isNewCriticalFirst,
  shouldRecalculateAfterStatus,
  shouldRouteAtsReopen,
  shouldRouteAtsResume,
} from "@/features/tasks/utils/taskActionRules";
import {
  attachmentDisplayName,
  buildTaskAttachmentPath,
} from "@/features/tasks/utils/taskAttachmentPath";
import { selectAttachmentChips } from "@/features/tasks/utils/attachmentDisplay";
import { buildEffortHistoryRows } from "@/features/tasks/utils/effortHistory";
import { hasNewComment, newestNoteId } from "@/features/tasks/utils/taskCommentSeen";
import {
  loadLastSeenCommentId,
  saveLastSeenCommentId,
} from "@/features/tasks/utils/taskCommentSeenStorage";
import { needsTaskLookupRefresh } from "@/features/tasks/utils/realtime";
import { reportTaskError } from "@/features/tasks/utils/taskError";
import {
  validateAttachment,
  validateDueDate,
} from "@/features/tasks/utils/taskValidation";
import { useAuth } from "@/hooks/useAuth";
import { useTasks } from "@/hooks/useTasks";
import {
  DependencyData,
  MentionUser,
  TaskNote,
  TaskStatus,
  UpdateTaskRequest,
  ViewTaskData,
} from "@/types/task.types";
import { buildMentionMarkup, mentionMarkupToDisplay } from "@/utils/chatHelpers";
import {
  formatApiDate,
  formatDetailDateTime,
  getDependencyInitials,
} from "@/features/tasks/components/task-detail/taskDetailFormatters";
import { openChatDocument } from "@/utils/openChatDocument";
import { rf } from "@/utils/responsive";
import { apiStatusToUi } from "@/utils/statusMapper";
import { showError, showInfo, showSuccess } from "@/utils/toast";
import ModalCloseButton from "@/components/ModalCloseButton";
import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  CriticalTaskPopUpModal,
  OrderCriticalTasksModal,
  type CriticalTask,
} from "./CriticalTaskModal";
import DependencyModal from "./DependencyModal";
import RejectTaskModal from "./RejectTaskModal";
import type { RichTextEditorRef } from "./texteditor";
import { STATUS_COLORS, StatusType, TaskRowProps } from "./TaskRow";

const SNAP_POINTS = ["94%"];

export type DependencyDisplay = {
  taskId?: number;
  title: string;
  assignedTo: string;
  createdBy: string;
  status: string;
  dueDate: string;
  priority: string;
  priorityColor: string;
  createdByImage?: string | null;
  assignedToImage?: string | null;
};

export type TaskDetail = {
  title: string;
  assignedTo: string;
  assignedToInitials: string;
  dueDate: string;
  priority: string;
  priorityColor: string;
  approvalRequired: string;
  status: StatusType;
  recurringTask: string;
  dependencies: DependencyDisplay[];
  description: string;
  attachments: string[];
  taskId?: number;
  companyId?: number;
  canEdit?: boolean;
  canEditStatus?: boolean;
  projectName?: string;
  effortHours?: number;
  effortUnit?: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  task: TaskDetail | null;
  initialTab?: "details" | "comments";
};

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  Normal: { bg: "#0DDFAB", text: "#1D1D1D" },
  Critical: { bg: "#FF4444", text: "#fff" },
  Urgent: { bg: "#CB5F00", text: "#fff" },
  High: { bg: "#EF4444", text: "#fff" },
  Medium: { bg: "#F59E0B", text: "#fff" },
  Low: { bg: "#10B981", text: "#fff" },
};

const AVAILABLE_STATUSES = [
  "Pending",
  "In-Progress",
  "On-Hold",
  "Complete",
  "Partial Complete",
  "Rejected",
];

type PersistStatusOptions = {
  taskId: number;
  currentStatus: string;
  nextStatus: string;
  subtaskCount: number;
  canEditStatus: boolean;
  canApproveReject: boolean;
  createdBy: number;
  currentUserId: number;
  isAts: boolean;
  companyId: number;
  companyIdentifier: string;
  updateStatus: (
    taskId: number,
    data: { status: string; company_id: number; company_identifier: string },
  ) => Promise<void>;
  onSaved: (status: TaskStatus) => void;
};

async function persistTaskStatus({
  taskId,
  currentStatus,
  nextStatus,
  subtaskCount,
  canEditStatus,
  canApproveReject,
  createdBy,
  currentUserId,
  isAts,
  companyId,
  companyIdentifier,
  updateStatus,
  onSaved,
}: PersistStatusOptions): Promise<boolean> {
  const current = normalizeApiStatus(currentStatus);
  const requested = normalizeApiStatus(nextStatus);
  const isApprovalAction =
    current === "Pending-Approval" && requested === "Complete";

  if (
    !taskId ||
    !companyId ||
    (!canEditStatus && !(isApprovalAction && canApproveReject))
  ) {
    showError("Not Allowed", "You don't have permission to change this task's status.");
    return false;
  }
  if (isApprovalAction && !canApproveReject) {
    showError(
      "Not Allowed",
      "Only the task creator or company admin can approve a task.",
    );
    return false;
  }
  if (requested === "Partial Complete" && subtaskCount === 0) {
    showError("Status Not Allowed", "Partial Complete is only available for tasks with subtasks.");
    return false;
  }
  const completionAllowedStatuses = [
    "In-Progress",
    "Pending-Approval",
    "In Review",
    "In Testing",
  ];
  if (
    requested === "Complete" &&
    !completionAllowedStatuses.includes(String(current))
  ) {
    showError(
      "Status Not Allowed",
      "Please set the task to 'In Progress' before marking it as complete.",
    );
    return false;
  }
  if (current === "Complete" && requested !== "Complete") {
    if (requested !== "Pending" && requested !== "In-Progress") {
      showError(
        "Status Not Allowed",
        "A completed task can only be reopened as Pending or In Progress.",
      );
      return false;
    }
    if (
      !createdBy ||
      !currentUserId ||
      Number(createdBy) !== Number(currentUserId)
    ) {
      showError("Not Allowed", "Only the task creator can reopen a completed task.");
      return false;
    }
    if (isAts) {
      showInfo("ATS Reopen", "ATS task reopening requires the Phase 5 rescheduling flow.");
      return false;
    }
  }

  try {
    let savedStatus: TaskStatus;
    const completedAt = new Date().toISOString();

    if (isApprovalAction) {
      // Approval has its own endpoint: it allows the creator AND Company Admins,
      // while /updatetaskstatus only allows can_edit_status users.
      const result = await approveTask(taskId, {
        company_id: companyId,
        company_identifier: companyIdentifier,
      });
      if (!result.ok) {
        showError("Approval Failed", result.message);
        return false;
      }
      useTasksStore.getState().patchTask(taskId, {
        status: "Complete",
        completed_at: completedAt,
      });
      savedStatus = "Complete";
      showSuccess("Success", result.message ?? "Task approved successfully.");
    } else {
      await updateStatus(taskId, {
        status: toApiStatus(requested),
        company_id: companyId,
        company_identifier: companyIdentifier,
      });
      savedStatus = useTasksStore.getState().byId[taskId]?.status ?? requested;
      showSuccess("Success", "Task status updated.");
    }

    onSaved(savedStatus);
    if (savedStatus === "Pending-Approval") {
      showInfo(
        "Approval Required",
        "You cannot mark the status as complete because approval is required. Please ask your team lead to mark the task as complete.",
      );
    } else if (shouldRecalculateAfterStatus(current, requested, isAts)) {
      try {
        const result = await recalculateSchedule(taskId, {
          company_id: companyId,
          company_identifier: companyIdentifier,
          completed_at: requested === "Complete" ? completedAt : undefined,
        });
        if (!result.ok) {
          showError("Schedule Update Failed", result.message);
        }
      } catch (error) {
        showError(
          "Schedule Update Failed",
          error instanceof Error ? error.message : "Failed to recalculate the task schedule.",
        );
      }
    }
    return true;
  } catch (error) {
    showError(
      "Status Update Failed",
      error instanceof Error ? error.message : "Failed to update task status.",
    );
    return false;
  }
}

// Builds a TaskDetail payload for the modal from a `/tasks/view/:id` response.
// Used when opening a task from a notification (no pre-mapped task row exists).
export function buildTaskDetailFromViewTask(
  viewData: ViewTaskData | null | undefined,
  companyId: number,
): TaskDetail | null {
  const t = viewData?.task;
  if (!t) return null;

  const priorityName = t.priority || "Normal";
  const priorityStyle = PRIORITY_COLORS[priorityName] ?? {
    bg: "#E5E7EB",
    text: "#374151",
  };

  const assignedToName =
    typeof t.asigned_to === "object" && t.asigned_to != null
      ? t.asigned_to.full_name ||
        [t.asigned_to.first_name, t.asigned_to.last_name]
          .filter(Boolean)
          .join(" ") ||
        `User #${t.asigned_to.id ?? "?"}`
      : `User #${t.asigned_to ?? "?"}`;

  return {
    title: t.title ?? "",
    assignedTo: assignedToName,
    assignedToInitials:
      assignedToName
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2) || "??",
    dueDate: t.due_date ? formatApiDate(t.due_date) : "-",
    priority: priorityName,
    priorityColor: priorityStyle.bg,
    approvalRequired: t.approval_required ? "Yes" : "No",
    status: apiStatusToUi(t.status),
    recurringTask: t.is_recurring ? "Yes" : "No",
    dependencies: [],
    description: t.description ?? "",
    attachments: t.task_attachments?.map((a) => a.attachment) ?? [],
    taskId: t.id,
    companyId,
    canEdit: t.can_edit,
    canEditStatus: t.can_edit_status,
    projectName: t.project_name ?? undefined,
    effortHours: t.effort_hours,
    effortUnit: t.effort_unit,
  };
}

export default function TaskDetailModal({
  visible,
  onClose,
  task,
  initialTab = "details",
}: Props) {
  // Compensates KeyboardAvoidingView's padding for the home-indicator safe
  // area, otherwise that inset shows up as an empty gap above the keyboard.
  const insets = useSafeAreaInsets();
  const { state: authState } = useAuth();
  const {
    state: taskState,
    fetchNotes,
    viewTask: viewTaskApi,
    getDependencies,
    fetchMentionUsers,
    updateTask: updateTaskApi,
    updateTaskStatusApi,
    allMappedTasks,
  } = useTasks();

  const sheetRef = useRef<BottomSheetModal>(null);
  const hasPresentedRef = useRef(false);

  const handleModalClose = useCallback(() => {
    hasPresentedRef.current = false;
    onClose();
  }, [onClose]);

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

  const [activeTab, setActiveTab] = useState<"details" | "comments">(
    initialTab,
  );
  const [commentText, setCommentText] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [keyboardPad, setKeyboardPad] = useState(0);
  const commentBoxRef = useRef<View>(null);
  const keyboardTopRef = useRef(0);
  const keyboardVisibleRef = useRef(false);
  const keyboardMeasureTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const [notes, setNotes] = useState<TaskNote[]>([]);
  const [notesTaskId, setNotesTaskId] = useState<number | null>(null);
  const [notesLoading, setNotesLoading] = useState(false);
  const [commentSeen, setCommentSeen] = useState<{
    key: string;
    loaded: boolean;
    lastSeenId: number | null;
  }>({ key: "", loaded: false, lastSeenId: null });
  const [sendingNote, setSendingNote] = useState(false);
  const [taskDetail, setTaskDetail] = useState<ViewTaskData | null>(null);
  const detailRequestRef = useRef(0);
  const notesRequestRef = useRef(0);
  const lastPinnedNoteIdRef = useRef<number | null>(null);
  const [replyToNote, setReplyToNote] = useState<TaskNote | null>(null);
  const [editingNote, setEditingNote] = useState<TaskNote | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");
  const [deleteNoteTarget, setDeleteNoteTarget] = useState<TaskNote | null>(null);
  const [deletingNote, setDeletingNote] = useState(false);
  const [dependencies, setDependencies] = useState<DependencyData[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [dependencyModalVisible, setDependencyModalVisible] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [showAllAttachments, setShowAllAttachments] = useState(false);
  const [dueBounds, setDueBounds] = useState<{
    sprintDueDate: string | null;
    projectDueDate: string | null;
    parentDueDate: string | null;
  }>({ sprintDueDate: null, projectDueDate: null, parentDueDate: null });

  // â”€â”€ Task Edit State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [savingTask, setSavingTask] = useState(false);

  const [editTitle, setEditTitle] = useState("");
  const [editAssignToId, setEditAssignToId] = useState<number | null>(null);
  const [editDueDate, setEditDueDate] = useState<Date | null>(null);
  const [editStatus, setEditStatus] = useState<string>("Pending");
  const [editPriorityId, setEditPriorityId] = useState<number | null>(null);
  const [editTaskPriority, setEditTaskPriority] = useState<
    "normal" | "critical"
  >("normal");
  const [editEffortHours, setEditEffortHours] = useState<string>("");
  const [editEffortUnit, setEditEffortUnit] = useState<string>("hours");
  const [editApprovalRequired, setEditApprovalRequired] =
    useState<boolean>(false);
  const [editDescription, setEditDescription] = useState<string>("");

  const [assignPickerVisible, setAssignPickerVisible] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [statusPickerVisible, setStatusPickerVisible] = useState(false);
  const [priorityPickerVisible, setPriorityPickerVisible] = useState(false);
  const [approvalPickerVisible, setApprovalPickerVisible] = useState(false);
  const [effortPickerVisible, setEffortPickerVisible] = useState(false);
  const [effortLogsModalVisible, setEffortLogsModalVisible] = useState(false);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [reopenModalVisible, setReopenModalVisible] = useState(false);
  const [resumeModalVisible, setResumeModalVisible] = useState(false);
  const [resumeTargetStatus, setResumeTargetStatus] = useState<
    "In-Progress" | "Pending"
  >("In-Progress");
  const [criticalPromptVisible, setCriticalPromptVisible] = useState(false);
  const [detailCriticalTasks, setDetailCriticalTasks] = useState<CriticalTask[]>([]);
  const [detailOrderModalVisible, setDetailOrderModalVisible] = useState(false);
  const [detailOrderNewTask, setDetailOrderNewTask] = useState<CriticalTask | null>(null);
  const descriptionEditorRef = useRef<RichTextEditorRef>(null);

  // Last-saved values for the free-text fields, so blurring an untouched
  // field doesn't fire a redundant save request.
  const lastSavedTitleRef = useRef("");
  const lastSavedDescRef = useRef("");
  const lastSavedEffortHoursRef = useRef("");

  const initEditFields = useCallback(() => {
    const apiT = taskDetail?.task;
    const currentTitle = apiT?.title ?? task?.title ?? "";
    const currentAssignId =
      typeof apiT?.asigned_to === "number"
        ? apiT.asigned_to
        : (apiT?.asigned_to?.id ?? null);

    let currentDueDate: Date | null = null;
    if (apiT?.due_date) {
      currentDueDate = parseTaskDate(apiT.due_date);
    } else if (task?.dueDate) {
      currentDueDate = parseTaskDate(task.dueDate);
    }

    const currentStatus = apiT?.status ?? task?.status ?? "Pending";

    const rawPriority =
      typeof apiT?.priority === "string"
        ? apiT.priority
        : typeof (apiT?.priority as any)?.name === "string"
          ? (apiT?.priority as any).name
          : typeof task?.priority === "string"
            ? task.priority
            : String(apiT?.priority ?? task?.priority ?? "");

    const matchedPriority = (taskState.priorities ?? []).find(
      (p) =>
        p?.name &&
        String(p.name).toLowerCase() === String(rawPriority).toLowerCase(),
    );
    const currentPriorityId =
      matchedPriority?.id ??
      (typeof apiT?.priority === "number" ? apiT.priority : null) ??
      taskState.priorities?.[0]?.id ??
      1;

    const currentTaskPriority = apiT?.task_priority ?? "normal";
    const currentEffortUnit = (apiT?.effort_unit ??
      task?.effortUnit ??
      "hours") as "minutes" | "hours" | "days";
    const currentEffortHours = String(
      fromMinutes(Number(apiT?.effort_hours ?? task?.effortHours ?? 0), currentEffortUnit),
    );
    const currentApproval = apiT
      ? apiT.approval_required === 1
      : task?.approvalRequired === "Yes";
    const currentDesc = apiT?.description ?? task?.description ?? "";

    setEditTitle(currentTitle);
    setEditAssignToId(currentAssignId);
    setEditDueDate(currentDueDate);
    setEditStatus(currentStatus);
    setEditPriorityId(currentPriorityId);
    setEditTaskPriority(currentTaskPriority);
    setEditEffortHours(currentEffortHours);
    setEditEffortUnit(currentEffortUnit);
    setEditApprovalRequired(currentApproval);
    setEditDescription(currentDesc);
    lastSavedTitleRef.current = currentTitle;
    lastSavedDescRef.current = currentDesc;
    lastSavedEffortHoursRef.current = currentEffortHours;
  }, [taskDetail?.task, task, taskState.priorities]);

  useEffect(() => {
    if (visible) {
      initEditFields();
    }
  }, [visible, initEditFields]);

  // Backend gates edit rights per task (e.g. only the creator). Missing flags
  // are false per contract. A Complete task is read-only except the recurring
  // template, which stays editable on the website.
  const isAts = authState.hasAdvancedTaskModule === true;
  const hasEditPermission = hasPermission(authState.user, TASK_PERMISSIONS.edit);
  const currentStatus = normalizeApiStatus(
    String(taskDetail?.task?.status ?? task?.status ?? "Pending"),
  );
  const isCompleteTask = currentStatus === "Complete";
  const isRecurringTemplate = taskDetail?.task?.is_recurring === true;
  const canEdit =
    hasEditPermission &&
    (taskDetail?.task?.can_edit ?? task?.canEdit === true) &&
    (!isCompleteTask || isRecurringTemplate);
  const canEditStatus = taskDetail?.task?.can_edit_status === true;
  const canManageDependencies =
    canEdit && !isCompleteTask && currentStatus !== "On-Hold";
  const canManageAttachments =
    hasEditPermission && !isCompleteTask && (canEdit || canEditStatus);
  const canComment = hasPermission(authState.user, TASK_PERMISSIONS.list);
  const canEditDeleteComments = hasEditPermission;
  const canPinOrReactToComments = hasEditPermission;

  const recalculateScheduleSafe = async (taskId: number, completedAt?: string) => {
    if (!companyId) return;
    const result = await recalculateSchedule(taskId, {
      company_id: companyId,
      company_identifier: companyIdentifier,
      completed_at: completedAt,
    });
    if (!result.ok) showError("Schedule Update Failed", result.message);
  };

  const recalculateIfAts = async (taskId: number, completedAt?: string) => {
    if (!isAts) return;
    await recalculateScheduleSafe(taskId, completedAt);
  };

  // Persists an edit immediately â€” pass just the field(s) that changed as
  // `overrides`. Dedicated endpoints are used for assignee and due date;
  // everything else goes through the full website-equivalent update payload.
  const persistTaskField = async (
    overrides: Partial<UpdateTaskRequest>,
    options: { skipRecalculate?: boolean } = {},
  ): Promise<boolean> => {
    if (!task?.taskId || savingTask) return false;
    if (!canEdit) {
      showError("Not Allowed", "You don't have permission to edit this task.");
      return false;
    }
    const apiT = taskDetail?.task;
    if (!apiT) {
      showError("Not Loaded", "Task details are still loading.");
      return false;
    }
    const title = (overrides.title ?? editTitle).trim();
    if (!title) {
      showError("Validation Error", "Task title cannot be empty.");
      return false;
    }

    setSavingTask(true);
    try {
      const taskId = task.taskId;

      // Assignee changes use /tasks/updateasignedto (creator-only).
      if (overrides.assign_to !== undefined) {
        const newAssignee = Number(overrides.assign_to);
        const result = await reassignTask(taskId, {
          assignee: newAssignee,
          asigned_to: newAssignee,
          company_id: companyId,
          company_identifier: companyIdentifier,
        });
        if (!result.ok) {
          showError("Reassign Failed", result.message);
          return false;
        }
        useTasksStore.getState().patchTask(taskId, { asigned_to: newAssignee });
        setTaskDetail((current) =>
          current
            ? { ...current, task: { ...current.task, asigned_to: newAssignee } }
            : current,
        );
        await recalculateIfAts(taskId);
        await loadTaskDetail();
        return true;
      }

      // Normal-company due-date changes use /tasks/updatetaskduedate.
      if (overrides.due_date !== undefined) {
        if (isAts) {
          showError(
            "Read-only",
            "ATS due dates are scheduled by the engine and cannot be edited.",
          );
          return false;
        }
        const dueDate = overrides.due_date;
        if (!dueDate) {
          showError("Validation Error", "Due date is required.");
          return false;
        }
        const subtaskDueDate =
          apiT.sub_tasks?.reduce((latest, subtask) => {
            const value = (subtask.due_date ?? "").slice(0, 10);
            return value > latest ? value : latest;
          }, "") || null;
        const validation = validateDueDate(dueDate, {
          required: true,
          sprintDueDate: dueBounds.sprintDueDate,
          projectDueDate: dueBounds.projectDueDate,
          parentDueDate: dueBounds.parentDueDate,
          subtaskDueDate,
        });
        if (!validation.valid) {
          showError(
            "Validation Error",
            Object.values(validation.errors)[0] ?? "Invalid due date.",
          );
          return false;
        }
        const result = await updateTaskDueDate(taskId, {
          duedate: dueDate,
          company_id: companyId,
          company_identifier: companyIdentifier,
        });
        if (!result.ok) {
          showError("Update Failed", result.message);
          return false;
        }
        useTasksStore.getState().patchTask(taskId, { due_date: dueDate });
        setTaskDetail((current) =>
          current ? { ...current, task: { ...current.task, due_date: dueDate } } : current,
        );
        await loadTaskDetail();
        return true;
      }

      const payload = buildUpdateTaskPayload(
        apiT,
        { ...overrides, title },
        { companyId, companyIdentifier, isAts },
      );
      await updateTaskApi(taskId, payload);
      await loadTaskDetail();

      if (
        !options.skipRecalculate &&
        isAts &&
        (overrides.effort_hours !== undefined ||
          overrides.priority !== undefined ||
          overrides.task_priority !== undefined)
      ) {
        await recalculateIfAts(taskId);
      }
      return true;
    } catch (err: any) {
      showError("Error", err?.message || "Failed to update task.");
      return false;
    } finally {
      setSavingTask(false);
    }
  };

  const handleTitleBlur = async () => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== lastSavedTitleRef.current.trim()) {
      const saved = await persistTaskField({ title: trimmed });
      if (saved) lastSavedTitleRef.current = trimmed;
    }
  };

  const handleDescriptionBlur = async () => {
    if (editDescription !== lastSavedDescRef.current) {
      const saved = await persistTaskField({ description: editDescription });
      if (saved) lastSavedDescRef.current = editDescription;
    }
  };

  const [mentionActive, setMentionActive] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionedUserIds, setMentionedUserIds] = useState<number[]>([]);
  const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([]);
  const mentionUsersLoadedRef = useRef(false);

  const currentUserId = authState.user?.id ?? 0;
  const isCompanyAdminUser =
    (authState.user?.role_title ?? "").trim().toLowerCase() === "company admin";
  const creatorIdOfTask =
    typeof taskDetail?.task?.created_by === "number"
      ? taskDetail.task.created_by
      : (taskDetail?.task?.created_by?.id ?? 0);
  const canApproveRejectNow =
    currentStatus === "Pending-Approval" &&
    (isCompanyAdminUser || Number(creatorIdOfTask) === Number(currentUserId));

  const companyId = task?.companyId ?? authState.company?.company_id ?? 0;
  const companyIdentifier = authState.company?.company_identifier ?? "";
  const detailTaskId = task?.taskId;

  // Detail can be opened from a notification/deep link before the Tasks
  // dashboard has hydrated owners/priorities/task rows. Load them so the
  // assignee, priority and dependency controls are usable (AUD-073).
  useEffect(() => {
    if (!visible || !companyId) return;
    const store = useTasksStore.getState();
    if (needsTaskLookupRefresh(store.owners, store.priorities)) {
      store
        .refreshLookups(companyId)
        .catch((error) =>
          reportTaskError("Task detail lookup refresh failed", error),
        );
    }
    if (Object.keys(store.byId).length === 0) {
      store
        .loadDashboard(companyId, { silent: true, force: true })
        .catch((error) =>
          reportTaskError("Task detail task refresh failed", error),
        );
    }
  }, [visible, companyId]);

  const loadTaskDetail = useCallback(async () => {
    if (!detailTaskId) return;
    const requestId = ++detailRequestRef.current;
    setDetailLoading(true);
    try {
      const detail = await viewTaskApi(detailTaskId);
      if (requestId !== detailRequestRef.current) return;
      if (detail) {
        setTaskDetail(detail);
      } else {
        showError("Task Detail", "Task details could not be loaded.");
      }
    } catch (error) {
      if (requestId !== detailRequestRef.current) return;
      showError(
        "Task Detail",
        reportTaskError("Task detail load failed", error),
      );
    } finally {
      if (requestId === detailRequestRef.current) setDetailLoading(false);
    }
  }, [detailTaskId, viewTaskApi]);

  const loadDependencies = useCallback(async () => {
    if (!detailTaskId) return;
    try {
      const deps = await getDependencies(detailTaskId, companyId);
      setDependencies(deps);
    } catch (error) {
      showError(
        "Dependencies",
        reportTaskError("Task dependency load failed", error),
      );
    }
  }, [detailTaskId, companyId, getDependencies, task]);

  const boundsProjectId = taskDetail?.task?.project_id ?? null;
  const boundsSprintId = taskDetail?.task?.sprint_id ?? null;
  const boundsParentId = taskDetail?.task?.parent_id ?? 0;

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const next = {
      sprintDueDate: null as string | null,
      projectDueDate: null as string | null,
      parentDueDate: null as string | null,
    };

    (async () => {
      if (boundsProjectId) {
        try {
          const project = await getProjectDetail(Number(boundsProjectId));
          if (project.ok) {
            next.projectDueDate = project.data.project.due_date ?? null;
          }
        } catch (error) {
          reportTaskError("Project due-date bound load failed", error);
        }
      }
      if (boundsProjectId && boundsSprintId) {
        try {
          const sprints = await getSprints(companyId, Number(boundsProjectId));
          if (sprints.ok) {
            const sprint = sprints.data.find(
              (entry) => Number(entry.id) === Number(boundsSprintId),
            );
            next.sprintDueDate = sprint?.due_date ?? null;
          }
        } catch (error) {
          reportTaskError("Sprint due-date bound load failed", error);
        }
      }
      if (boundsParentId) {
        try {
          const parent = await viewTaskApi(Number(boundsParentId));
          next.parentDueDate = parent?.task?.due_date ?? null;
        } catch (error) {
          reportTaskError("Parent due-date bound load failed", error);
        }
      }
      if (!cancelled) setDueBounds(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    visible,
    boundsProjectId,
    boundsSprintId,
    boundsParentId,
    companyId,
    viewTaskApi,
  ]);

  const handleAddDependency = async (dependsOnId: number) => {
    if (!task?.taskId) return;
    const result = await addDependency({
      task_id: task.taskId,
      depends_on: dependsOnId,
      company_id: companyId,
      company_identifier: companyIdentifier,
    });
    if (!result.ok) {
      showError("Dependency Failed", dependencyErrorMessage(result.message));
      return;
    }
    showSuccess("Success", "Dependency added.");
    setDependencyModalVisible(false);
    await loadDependencies();
    await recalculateScheduleSafe(task.taskId);
  };

  const handleRemoveDependency = (dep: DependencyData) => {
    const taskId = task?.taskId;
    if (!taskId) return;
    Alert.alert(
      "Remove Dependency",
      "Remove this blocking task from the dependencies?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            const result = await removeDependency({
              task_id: taskId,
              depends_on: Number(dep.task_id),
              company_id: companyId,
              company_identifier: companyIdentifier,
            });
            if (!result.ok) {
              showError("Remove Failed", result.message);
              return;
            }
            showSuccess("Success", "Dependency removed.");
            await loadDependencies();
            await recalculateScheduleSafe(taskId);
          },
        },
      ],
    );
  };

  const dependencyCandidates = useMemo(() => {
    const existing = new Set(dependencies.map((dep) => Number(dep.task_id)));
    return allMappedTasks.filter((row) => {
      const rowId = Number(row.id);
      return (
        rowId !== Number(task?.taskId) &&
        !existing.has(rowId) &&
        isDependencyCandidateStatus(String(row._raw.status))
      );
    });
  }, [allMappedTasks, dependencies, task?.taskId]);

  const handlePriorityChange = async (tier: "normal" | "critical") => {
    setEditTaskPriority(tier);
    setPriorityPickerVisible(false);

    if (tier !== "critical" || !isAts) {
      await persistTaskField({ task_priority: tier, bump_to_front: false });
      return;
    }

    const assigneeId =
      editAssignToId ??
      (typeof taskDetail?.task?.asigned_to === "number"
        ? taskDetail.task.asigned_to
        : (taskDetail?.task?.asigned_to?.id ?? 0));
    const currentTaskId = Number(task?.taskId ?? 0);
    const activeCritical = allMappedTasks.filter((row) => {
      const raw = row._raw;
      return (
        Number(row.id) !== currentTaskId &&
        Number(raw.asigned_to) === Number(assigneeId) &&
        raw.task_priority === "critical" &&
        normalizeApiStatus(String(raw.status)) !== "Complete" &&
        normalizeApiStatus(String(raw.status)) !== "Rejected"
      );
    });

    if (activeCritical.length === 0) {
      await persistTaskField({ task_priority: "critical", bump_to_front: true });
      return;
    }

    setDetailCriticalTasks(
      activeCritical.map((row) => ({
        id: Number(row.id),
        title: row.title,
        dueDate: row._raw.due_date ?? undefined,
        status: row._raw.status,
      })),
    );
    setCriticalPromptVisible(true);
  };

  const handleAssigneeSelect = (user: { id: number }) => {
    setEditAssignToId(user.id);
    setAssignPickerVisible(false);
    setAssigneeSearch("");
    persistTaskField({ assign_to: user.id });
  };

  const handleStatusSelect = (nextStatus: string) => {
    const detailTask = taskDetail?.task;
    const detailStatus = normalizeApiStatus(
      String(detailTask?.status ?? editStatus),
    );

    if (nextStatus === "Rejected") {
      if (!canApproveRejectNow) {
        showError(
          "Not Allowed",
          "Only the task creator or company admin can reject this task.",
        );
        return;
      }
      setStatusPickerVisible(false);
      setRejectModalVisible(true);
      return;
    }

    // ATS Complete/On-Hold reopening uses /tasks/reopen.
    if (shouldRouteAtsReopen(detailStatus, nextStatus, isAts)) {
      if (Number(creatorIdOfTask) !== Number(currentUserId)) {
        showError("Not Allowed", "Only the task creator can reopen this task.");
        return;
      }
      setStatusPickerVisible(false);
      setReopenModalVisible(true);
      return;
    }

    // ATS resume from Pending-Approval allows optional effort.
    if (shouldRouteAtsResume(detailStatus, nextStatus, isAts)) {
      setStatusPickerVisible(false);
      setResumeTargetStatus(nextStatus as "In-Progress" | "Pending");
      setResumeModalVisible(true);
      return;
    }

    void persistTaskStatus({
      taskId: task?.taskId ?? 0,
      currentStatus: String(detailTask?.status ?? editStatus),
      nextStatus,
      subtaskCount: detailTask?.subtask_count ?? 0,
      canEditStatus,
      canApproveReject: canApproveRejectNow,
      createdBy: Number(creatorIdOfTask),
      currentUserId,
      isAts,
      companyId,
      companyIdentifier,
      updateStatus: updateTaskStatusApi,
      onSaved: (savedStatus) => {
        setEditStatus(String(savedStatus));
        setTaskDetail((current) =>
          current
            ? {
                ...current,
                task: {
                  ...current.task,
                  status: savedStatus,
                  completed_at:
                    savedStatus === "Complete"
                      ? new Date().toISOString()
                      : null,
                },
              }
            : current,
        );
      },
    }).then((saved) => {
      if (saved) setStatusPickerVisible(false);
    });
  };

  const handlePriorityTierSelect = (tier: "normal" | "critical") => {
    void handlePriorityChange(tier);
  };

  const handleCompanyPrioritySelect = (priority: { id: number }) => {
    setEditPriorityId(priority.id);
    setPriorityPickerVisible(false);
    persistTaskField({ priority: priority.id });
  };

  const handleApprovalSelect = (value: boolean) => {
    setEditApprovalRequired(value);
    setApprovalPickerVisible(false);
    persistTaskField({ approval_required: value ? 1 : 0 });
  };

  const handleEffortBlur = async () => {
    if (editEffortHours !== lastSavedEffortHoursRef.current) {
      const saved = await persistTaskField({
        effort_hours: toMinutes(
          editEffortHours,
          editEffortUnit as "minutes" | "hours" | "days",
        ),
        effort_unit: editEffortUnit,
      });
      if (saved) {
        lastSavedEffortHoursRef.current = editEffortHours;
      }
    }
  };

  const handleEffortUnitSelect = async (
    nextUnit: "minutes" | "hours" | "days",
  ) => {
    const minutes = toMinutes(
      editEffortHours,
      editEffortUnit as "minutes" | "hours" | "days",
    );
    const converted = String(fromMinutes(minutes, nextUnit));
    setEditEffortUnit(nextUnit);
    setEditEffortHours(converted);
    const saved = await persistTaskField({
      effort_hours: minutes,
      effort_unit: nextUnit,
    });
    if (saved) lastSavedEffortHoursRef.current = converted;
  };

  const handleDueDateSelect = (date: Date) => {
    setEditDueDate(date);
    persistTaskField({ due_date: toCalendarDateOnly(date) });
  };

  const handleAssignPickerClose = () => {
    setAssignPickerVisible(false);
    setAssigneeSearch("");
  };

  const handleCriticalStop = () => {
    setCriticalPromptVisible(false);
    setDetailOrderNewTask({
      id: Number(task?.taskId ?? 0),
      title: apiTask?.title ?? task?.title ?? "Task",
      assignedTo: assignedToName,
      dueDate: apiTask?.due_date ?? undefined,
      status: apiTask?.status,
    });
    // Do not persist/recalculate before the order is confirmed (AUD-025).
    setDetailOrderModalVisible(true);
  };

  const handleCriticalWait = async () => {
    setCriticalPromptVisible(false);
    await persistTaskField({ task_priority: "critical", bump_to_front: false });
  };

  const handleCancelDetailOrder = () => {
    setDetailOrderModalVisible(false);
    setDetailOrderNewTask(null);
    setDetailCriticalTasks([]);
    setEditTaskPriority(
      apiTask?.task_priority === "critical" ? "critical" : "normal",
    );
  };

  const handleDetailOrderConfirm = async (orderedIds: number[]) => {
    const newTaskId = Number(task?.taskId ?? 0);
    const newFirst = isNewCriticalFirst(orderedIds, newTaskId);
    const saved = await persistTaskField(
      { task_priority: "critical", bump_to_front: newFirst },
      { skipRecalculate: true },
    );
    if (!saved) return;

    const result = await reorderCritical({ orderedIds, company_id: companyId });
    if (!result.ok) {
      showError("Reorder Error", result.message);
    } else if (result.data.blockedTasks.length > 0) {
      const titles = result.data.blockedTasks
        .map((entry) => `"${entry.title}"`)
        .join(", ");
      showInfo(
        "Order Saved",
        `Order saved. ${titles} have unfinished dependencies - they will be scheduled at the selected position once the dependencies are completed.`,
      );
    } else {
      showSuccess("Success", "Critical task order updated.");
    }
    setDetailOrderModalVisible(false);
    setDetailOrderNewTask(null);
    await recalculateIfAts(newTaskId);
    await loadTaskDetail();
  };

  const handleOpenAttachment = async (attachment: string, name?: string) => {
    try {
      const path = buildTaskAttachmentPath(attachment);
      await openChatDocument(path, name || attachmentDisplayName(undefined, attachment));
    } catch {
      showError("Error", "Could not open this attachment.");
    }
  };

  const handlePickAttachment = async (files: SelectedFile[]) => {
    if (!task?.taskId || !canManageAttachments) return;
    const file = files[0];
    if (!file) return;
    const validation = validateAttachment(file);
    if (!validation.valid) {
      showError(
        "Attachment Rejected",
        `"${file.name}": ${Object.values(validation.errors)[0]}`,
      );
      return;
    }

    const formData = new FormData();
    formData.append("file", {
      uri: file.uri,
      name: file.name || "attachment",
      type: file.mimeType || "application/octet-stream",
    } as unknown as Blob);
    formData.append("company_id", String(companyId));
    formData.append("company_identifier", companyIdentifier);

    setUploadingAttachment(true);
    try {
      const result = await uploadAttachment(task.taskId, formData);
      if (!result.ok) {
        showError("Upload Failed", result.message);
        return;
      }
      showSuccess("Success", "Attachment uploaded.");
      await loadTaskDetail();
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleDeleteAttachment = (attachmentId: number) => {
    Alert.alert(
      "Remove File",
      "This will permanently delete this attachment.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            const result = await deleteAttachment(attachmentId, {
              company_id: companyId,
              company_identifier: companyIdentifier,
            });
            if (!result.ok) {
              showError("Delete Failed", result.message);
              return;
            }
            showSuccess("Success", "Attachment removed.");
            await loadTaskDetail();
          },
        },
      ],
    );
  };

  const loadNotes = useCallback(async () => {
    if (!detailTaskId || !companyId || !companyIdentifier) return;
    const requestId = ++notesRequestRef.current;
    setNotesLoading(true);
    try {
      const fetched = await fetchNotes(
        detailTaskId,
        companyId,
        companyIdentifier,
      );
      if (requestId !== notesRequestRef.current) return;
      if (Array.isArray(fetched)) {
        setNotesTaskId(detailTaskId);
        const sanitized = fetched.map((n) => ({
          ...n,
          user_full_name:
            (n as any).user_full_name ??
            (n as any).user_name ??
            (n as any).userName ??
            "System User",
        }));

        // Remove any pin-based reordering from backend so comments are always in original chronological order
        const originalChronological = [...sanitized].sort((a, b) => a.id - b.id);

        const serverPinned = originalChronological.filter((n) => n.pin_top === 1);
        const preferredPinnedId =
          lastPinnedNoteIdRef.current ??
          serverPinned[0]?.id ??
          null;
        const normalized = originalChronological.map((note) => ({
          ...note,
          pin_top: note.id === preferredPinnedId ? 1 : 0,
        }));
        setNotes(normalized);
      }
    } catch (error) {
      if (requestId !== notesRequestRef.current) return;
      showError(
        "Comments",
        reportTaskError("Task comments load failed", error),
      );
    } finally {
      if (requestId === notesRequestRef.current) setNotesLoading(false);
    }
  }, [detailTaskId, companyId, companyIdentifier, fetchNotes, task]);

  useEffect(() => {
    if (visible) {
      lastPinnedNoteIdRef.current = null;
      setActiveTab(initialTab);
      setCommentText("");
      setMentionActive(false);
      setTaskDetail(null);
      setDependencies([]);
      setReplyToNote(null);
      setEditingNote(null);
      setEditingNoteText("");
      setDeleteNoteTarget(null);
      setDeletingNote(false);
      setDependencyModalVisible(false);
      setCriticalPromptVisible(false);
      setDetailOrderModalVisible(false);
      setDetailOrderNewTask(null);
      setDetailCriticalTasks([]);
      if (task?.taskId) {
        loadTaskDetail();
        loadDependencies();
      }
    } else {
      // Do not retain detail/dependency payloads after the sheet closes.
      detailRequestRef.current += 1;
      notesRequestRef.current += 1;
      setTaskDetail(null);
      setDependencies([]);
      setDueBounds({
        sprintDueDate: null,
        projectDueDate: null,
        parentDueDate: null,
      });
      setCommentText("");
      setReplyToNote(null);
      setEditingNote(null);
      setEditingNoteText("");
      setDeleteNoteTarget(null);
      setDeletingNote(false);
    }
  }, [visible, initialTab, task?.taskId, loadTaskDetail, loadDependencies]);

  // With keyboardBehavior="extend" the sheet lifts its content on iOS, but on
  // Android @gorhom/bottom-sheet's built-in keyboard handling is a no-op when
  // android_keyboardInputMode="adjustResize", so a fixed input at the bottom
  // gets covered. Measure the actual on-screen gap and pad the comments
  // container by exactly that amount so the whole comment box stays visible.
  const keepCommentBoxAboveKeyboard = useCallback(
    (keyboardTopY: number) => {
      if (activeTab !== "comments") return;
      const node = commentBoxRef.current;
      if (!node || keyboardTopY <= 0) return;
      node.measureInWindow((_x, y, _w, h) => {
        const overshoot = y + h - keyboardTopY + 8;
        setKeyboardPad(overshoot > 0 ? overshoot : 0);
      });
    },
    [activeTab],
  );

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => {
        keyboardVisibleRef.current = true;
        keyboardTopRef.current = e.endCoordinates?.screenY ?? 0;
        if (keyboardMeasureTimerRef.current) {
          clearTimeout(keyboardMeasureTimerRef.current);
        }
        // Let the sheet/layout settle before measuring the final gap.
        keyboardMeasureTimerRef.current = setTimeout(() => {
          keepCommentBoxAboveKeyboard(keyboardTopRef.current);
        }, 300);
      },
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => {
        keyboardVisibleRef.current = false;
        keyboardTopRef.current = 0;
        if (keyboardMeasureTimerRef.current) {
          clearTimeout(keyboardMeasureTimerRef.current);
        }
        setKeyboardPad(0);
      },
    );
    return () => {
      showSub.remove();
      hideSub.remove();
      if (keyboardMeasureTimerRef.current) {
        clearTimeout(keyboardMeasureTimerRef.current);
      }
    };
  }, [keepCommentBoxAboveKeyboard]);

  useEffect(() => {
    if (visible && activeTab === "comments" && task?.taskId) {
      loadNotes();
      if (keyboardVisibleRef.current) {
        const t = setTimeout(() => {
          keepCommentBoxAboveKeyboard(keyboardTopRef.current);
        }, 180);
        return () => clearTimeout(t);
      }
    }
  }, [visible, activeTab, task?.taskId, loadNotes, keepCommentBoxAboveKeyboard]);

  useTaskDetailSocket({
    visible,
    taskId: task?.taskId,
    companyId,
    onReloadDetail: loadTaskDetail,
    onReloadNotes: loadNotes,
    onClose: () => sheetRef.current?.close(),
  });

  // New-comment dot state. The marker is stored per user + task, so it only
  // represents comments read on this device.
  const detailCommentNotes = taskDetail?.task?.task_notes;
  const loadedTaskNotes = notesTaskId === detailTaskId ? notes : null;
  const commentNotes = detailCommentNotes?.length
    ? detailCommentNotes
    : loadedTaskNotes;
  const commentSeenKey =
    visible && currentUserId && detailTaskId
      ? `${currentUserId}:${detailTaskId}`
      : "";
  const commentSeenReady =
    commentSeenKey !== "" &&
    commentSeen.key === commentSeenKey &&
    commentSeen.loaded;
  const lastSeenCommentId = commentSeenReady
    ? commentSeen.lastSeenId
    : null;

  useEffect(() => {
    if (!commentSeenKey || !currentUserId || !detailTaskId) return;
    let cancelled = false;
    loadLastSeenCommentId(currentUserId, detailTaskId)
      .then((stored) => {
        if (cancelled) return;
        setCommentSeen({
          key: commentSeenKey,
          loaded: true,
          lastSeenId: stored,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setCommentSeen({
          key: commentSeenKey,
          loaded: true,
          lastSeenId: null,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [commentSeenKey, currentUserId, detailTaskId]);

  // First ever open for this task: treat existing comments as already read.
  // When the Comments tab is already open, the mark-seen effect below handles
  // the marker instead.
  useEffect(() => {
    if (activeTab === "comments") return;
    if (!commentSeenReady || lastSeenCommentId !== null) return;
    if (!taskDetail?.task) return;
    const count = taskDetail.task.notes_count ?? 0;
    const availableNotes = commentNotes ?? [];
    if (count > 0 && availableNotes.length === 0) return;
    const seed = newestNoteId(availableNotes) ?? 0;
    const timer = setTimeout(() => {
      setCommentSeen({
        key: commentSeenKey,
        loaded: true,
        lastSeenId: seed,
      });
      if (currentUserId && detailTaskId) {
        void saveLastSeenCommentId(currentUserId, detailTaskId, seed);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [
    activeTab,
    commentSeenReady,
    lastSeenCommentId,
    taskDetail,
    commentNotes,
    commentSeenKey,
    currentUserId,
    detailTaskId,
  ]);

  // Reading the Comments tab marks all currently loaded comments as seen.
  useEffect(() => {
    if (activeTab !== "comments" || !commentSeenReady) return;
    const availableNotes = commentNotes ?? [];
    if (availableNotes.length === 0) return;
    const newest = newestNoteId(availableNotes);
    if (newest === null) return;
    if (lastSeenCommentId !== null && newest <= lastSeenCommentId) return;
    const timer = setTimeout(() => {
      setCommentSeen({
        key: commentSeenKey,
        loaded: true,
        lastSeenId: newest,
      });
      if (currentUserId && detailTaskId) {
        void saveLastSeenCommentId(currentUserId, detailTaskId, newest);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [
    activeTab,
    commentSeenReady,
    commentNotes,
    lastSeenCommentId,
    commentSeenKey,
    currentUserId,
    detailTaskId,
  ]);

  const handleCommentChange = (text: string) => {
    setCommentText(text);

    // @-mention trigger detection: the "@" must start a fresh token
    // (preceded by whitespace/start) and the query must contain no spaces.
    const atIdx = text.lastIndexOf("@");
    let triggerActive = false;
    if (atIdx >= 0) {
      const prevChar = atIdx === 0 ? " " : text[atIdx - 1];
      const after = text.slice(atIdx + 1);
      if (
        (prevChar === " " || prevChar === "\n") &&
        !after.includes(" ") &&
        after.length <= 32
      ) {
        triggerActive = true;
        setMentionQuery(after);
      }
    }
    setMentionActive(triggerActive);
    if (!triggerActive) setMentionQuery("");

    if (triggerActive && !mentionUsersLoadedRef.current && companyId) {
      mentionUsersLoadedRef.current = true;
      fetchMentionUsers(companyId)
        .then(setMentionUsers)
        .catch(() => {
          mentionUsersLoadedRef.current = false;
        });
    }
  };

  const handleMentionButtonPress = () => {
    const text = `${commentText}@`;
    setCommentText(text);
    setMentionQuery("");
    setMentionActive(true);
    if (companyId && !mentionUsersLoadedRef.current) {
      mentionUsersLoadedRef.current = true;
      fetchMentionUsers(companyId)
        .then(setMentionUsers)
        .catch(() => {
          mentionUsersLoadedRef.current = false;
        });
    }
  };

  const selectMention = (user: MentionUser) => {
    const userName =
      `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() ||
      user.full_name ||
      `User ${user.id}`;
    setCommentText((prev) => {
      const atIdx = prev.lastIndexOf("@");
      if (atIdx >= 0) {
        return `${prev.slice(0, atIdx)}@${userName} `;
      }
      return `${prev}@${userName} `;
    });
    setMentionedUserIds((prev) =>
      prev.includes(user.id) ? prev : [...prev, user.id],
    );
    setMentionActive(false);
    setMentionQuery("");
  };

  const mentionCandidates = useMemo(() => {
    if (!mentionActive) return [];
    const q = mentionQuery.trim().toLowerCase();
    return mentionUsers
      .filter((u) => u.id !== currentUserId)
      .filter((u) => {
        const fullName = `${u.first_name ?? ""} ${u.last_name ?? ""}`
          .trim()
          .toLowerCase();
        return (
          fullName.includes(q) || (u.email ?? "").toLowerCase().includes(q)
        );
      })
      .slice(0, 6);
  }, [mentionActive, mentionQuery, mentionUsers, currentUserId]);

  const handleSendComment = async () => {
    if (!commentText.trim() || !task?.taskId) return;
    const mentions = mentionedUserIds;
    // Convert plain `@Full Name` mentions to the backend's inline markup
    // `@[Full Name](userId)` so the backend mention parser can detect them and
    // create the "Mentioned you in a comment" notification + push.
    let notes = commentText.trim();
    for (const uid of mentions) {
      const u = mentionUsers.find((m) => m.id === uid);
      if (!u) continue;
      const name =
        `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() ||
        u.full_name ||
        `User ${u.id}`;
      const displayToken = `@${name}`;
      if (notes.includes(displayToken)) {
        notes = notes.split(displayToken).join(buildMentionMarkup(u.id, name));
      }
    }
    setSendingNote(true);
    try {
      const result = await addNoteApi(task.taskId, {
        notes,
        company_id: companyId,
        company_identifier: companyIdentifier,
        mentions,
        ...(replyToNote
          ? {
              reply_to: {
                id: Number(replyToNote.id),
                user_name: replyToNote.user_name ?? "",
                content: mentionMarkupToDisplay(replyToNote.notes ?? "").slice(0, 100),
              },
            }
          : {}),
      });
      if (!result.ok) {
        showError("Comment Failed", result.message);
        return;
      }
      setCommentText("");
      setMentionedUserIds([]);
      setMentionActive(false);
      setMentionQuery("");
      setReplyToNote(null);
      await loadNotes();
    } catch {
      showError("Comment Failed", "Could not send this comment.");
    } finally {
      setSendingNote(false);
    }
  };

  const handleCommentSubmit = () => {
    if (mentionActive) return;
    void handleSendComment();
  };

  const handleDeleteNote = (note: TaskNote) => {
    if (Number(note.user_id) !== Number(currentUserId) || !canEditDeleteComments) {
      showError("Not Allowed", "You can only delete your own notes.");
      return;
    }
    setDeleteNoteTarget(note);
  };

  const confirmDeleteNote = async () => {
    if (!deleteNoteTarget) return;
    setDeletingNote(true);
    try {
      const result = await deleteNoteApi(deleteNoteTarget.id, {
        company_id: companyId,
        company_identifier: companyIdentifier,
      });
      if (!result.ok) {
        showError("Delete Failed", result.message);
        return;
      }
      showSuccess("Success", "Comment deleted.");
      setDeleteNoteTarget(null);
      await loadNotes();
    } catch {
      showError("Delete Failed", "Could not delete this comment.");
    } finally {
      setDeletingNote(false);
    }
  };

  const handlePinNote = async (note: TaskNote) => {
    if (!canPinOrReactToComments) {
      showError("Not Allowed", "You don't have permission to pin comments.");
      return;
    }
    const isCurrentlyPinned = note.pin_top === 1;
    const previousNotes = [...notes];
    try {
      const result = await pinNoteApi(note.id, {
        pin_top: isCurrentlyPinned ? 0 : 1,
        company_id: companyId,
        company_identifier: companyIdentifier,
      });
      if (!result.ok) {
        showError("Pin Failed", result.message);
        return;
      }
      if (isCurrentlyPinned) {
        if (lastPinnedNoteIdRef.current === note.id) {
          lastPinnedNoteIdRef.current = null;
        }
        await loadNotes();
      } else {
        lastPinnedNoteIdRef.current = note.id;
        // Website behaviour: only one note is shown pinned in the pinned card.
        // Update pin_top without reordering the original comments list.
        setNotes((current) =>
          current.map((entry) => ({
            ...entry,
            pin_top: entry.id === note.id ? 1 : 0,
          }))
        );
      }
    } catch {
      setNotes(previousNotes);
    }
  };

  const handleReactionToggle = async (emoji: string, noteId: number) => {
    if (!noteId) return;
    if (!canPinOrReactToComments) {
      showError("Not Allowed", "You don't have permission to react to comments.");
      return;
    }
    const userId = authState.user?.id ?? 0;
    const userName =
      `${authState.user?.first_name ?? ""} ${authState.user?.last_name ?? ""}`.trim() ||
      "User";

    try {
      const result = await updateNoteReaction(noteId, {
        emoji,
        company_id: companyId,
        user_id: userId,
        user_name: userName,
      });
      if (!result.ok) {
        showError("Reaction Failed", result.message);
        return;
      }
      await loadNotes();
    } catch {
      showError("Reaction Failed", "Could not update the reaction.");
    }
  };

  const handleReply = (note: TaskNote) => {
    setReplyToNote(note);
  };

  const handleEditNote = (note: TaskNote) => {
    if (Number(note.user_id) !== Number(currentUserId) || !canEditDeleteComments) {
      showError("Not Allowed", "You can only edit your own notes.");
      return;
    }
    setEditingNote(note);
    setEditingNoteText(note.notes ?? "");
  };

  const handleSaveEditedNote = async () => {
    if (!editingNote?.id) return;
    if (!editingNoteText.trim()) {
      showError("Validation", "Comment cannot be empty.");
      return;
    }
    try {
      const result = await updateNoteApi(editingNote.id, {
        notes: editingNoteText.trim(),
        company_id: companyId,
        company_identifier: companyIdentifier,
      });
      if (!result.ok) {
        showError("Update Failed", result.message);
        return;
      }
      setEditingNote(null);
      setEditingNoteText("");
      await loadNotes();
    } catch {
      showError("Update Failed", "Could not update this comment.");
    }
  };

  if (!task) return null;

  const statusStyle = STATUS_COLORS[task.status] ?? {
    bg: "#E5E7EB",
    text: "#374151",
  };
  const priorityStyle = PRIORITY_COLORS[task.priority] ?? {
    bg: "#E5E7EB",
    text: "#374151",
  };

  const pinnedNotes = notes.filter((n) => n.pin_top === 1);
  const showCommentDot =
    activeTab !== "comments" &&
    commentSeenReady &&
    hasNewComment(commentNotes ?? [], currentUserId, lastSeenCommentId);

  // Use taskDetail data from ViewTask API response, fall back to props
  const apiTask = taskDetail?.task;

  // Resolve user names â€” created_by/asigned_to can be a number (lookup in taskOwners) or an object (inline user info)
  const resolveUserName = (
    idOrObj:
      | number
      | {
          id?: number;
          first_name?: string;
          last_name?: string;
          full_name?: string;
        }
      | null
      | undefined,
  ): string => {
    if (!idOrObj) return "-";
    if (typeof idOrObj === "object") {
      const u = idOrObj;
      return (
        u.full_name ||
        [u.first_name, u.last_name].filter(Boolean).join(" ") ||
        `User #${u.id ?? "?"}`
      );
    }
    const owner = taskState.taskOwners?.find((o) => o.id === idOrObj);
    if (owner)
      return owner.full_name || `${owner.first_name} ${owner.last_name}`.trim();
    return `User #${idOrObj}`;
  };

  const createdByName = apiTask ? resolveUserName(apiTask.created_by) : "-";
  const assignedToName = apiTask
    ? resolveUserName(apiTask.asigned_to)
    : task.assignedTo;
  // task_owner entries from /tasks/all don't reliably carry full_name â€”
  // build the display name from first/last first, matching the fallback
  // used for @-mentions elsewhere in this file.
  const selectedOwner = taskState.taskOwners.find(
    (u) => u.id === editAssignToId,
  );
  const selectedOwnerName = selectedOwner
    ? `${selectedOwner.first_name ?? ""} ${selectedOwner.last_name ?? ""}`.trim() ||
      selectedOwner.full_name
    : undefined;
  const assignedToInitials = apiTask
    ? assignedToName
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2) || "??"
    : task.assignedToInitials;

  const depDisplay: DependencyDisplay[] =
    dependencies.length > 0
      ? dependencies.map((d) => ({
          taskId: Number(d.task_id),
          title: d.title,
          assignedTo: d.assigned_to?.full_name ?? "-",
          createdBy: d.created_by?.full_name ?? "-",
          status: apiStatusToUi(d.status as any) ?? d.status,
          dueDate: formatApiDate(d.due_date),
          priority: d.priority_name ?? "Normal",
          priorityColor: d.priority_color || "#0DDFAB",
          createdByImage: d.created_by?.image ?? null,
          assignedToImage: d.assigned_to?.image ?? null,
        }))
      : task.dependencies;

  const depRows: TaskRowProps[] = depDisplay.map((d, idx) => ({
    id: d.taskId ? String(d.taskId) : `dep-${idx}`,
    title: d.title,
    createdBy: d.createdBy,
    createdByInitials: getDependencyInitials(d.createdBy),
    createdByAvatar: d.createdByImage ?? undefined,
    assignedTo: d.assignedTo,
    assignedToInitials: getDependencyInitials(d.assignedTo),
    assignedToAvatar: d.assignedToImage ?? undefined,
    dueDate: d.dueDate,
    status: (d.status as StatusType) || "Pending",
    priorityName: d.priority,
    taskPriority:
      d.priority?.toLowerCase() === "critical" ? "critical" : "normal",
    canEditStatus: false,
  }));

  const attachmentItems = apiTask?.task_attachments ?? [];
  const attachmentFiles: string[] =
    attachmentItems.length > 0
      ? attachmentItems.map((item) => item.original_name || item.attachment)
      : task.attachments;
  const taskAttachmentSelection = selectAttachmentChips(attachmentItems, {
    expanded: showAllAttachments,
  });
  const fileAttachmentSelection = selectAttachmentChips(attachmentFiles, {
    expanded: showAllAttachments,
  });
  // Recurring detail string from API
  const recurringDetail = apiTask
    ? apiTask.is_recurring
      ? [
          apiTask.recurring_period && `Period: ${apiTask.recurring_period}`,
          apiTask.recurring_exclude_days?.length
            ? `Excluded: ${apiTask.recurring_exclude_days.join(", ")}`
            : null,
          apiTask.recurring_week_day &&
            `Week Day: ${apiTask.recurring_week_day}`,
          apiTask.recurring_month_date &&
            `Month Date: ${apiTask.recurring_month_date}`,
          (apiTask.recurring_annual_month || apiTask.recurring_annual_date) &&
            `Annual: ${apiTask.recurring_annual_month ?? "-"}/${apiTask.recurring_annual_date ?? "-"}`,
          apiTask.recurring_time && `Time: ${apiTask.recurring_time}`,
          apiTask.recurring_total_count > 0 &&
            `Count: ${apiTask.recurring_total_count}`,
        ]
          .filter(Boolean)
          .join(" | ") || "Yes"
      : "No"
    : task.recurringTask;

  const priorityDisplayName = apiTask?.priority ?? task.priority;
  const taskPriorityDisplay = apiTask?.task_priority ?? null;
  const hasTaskPriority =
    taskPriorityDisplay === "normal" || taskPriorityDisplay === "critical";
  const companyPriorityName =
    taskState.priorities.find((p) => p.id === editPriorityId)?.name ??
    (typeof priorityDisplayName === "string" ? priorityDisplayName : undefined) ??
    "Normal";

  const createdAtDisplay = formatDetailDateTime(
    apiTask?.created_at ||
      (apiTask as any)?.createdAt ||
      (task as any)?.createdAt,
  );
  const startDateDisplay = formatDetailDateTime(
    apiTask?.start_date || (task as any)?.startDate,
  );
  const estCompletionDisplay = editDueDate
    ? formatDetailDateTime(editDueDate.toISOString())
    : formatDetailDateTime(apiTask?.due_date || task.dueDate);
  const actualCompletionDisplay = formatDetailDateTime(
    apiTask?.completed_at ||
      (apiTask as any)?.actual_completion ||
      (apiTask as any)?.completion_date,
  );
  const effortHistory = apiTask?.effort_history ?? [];
  const effortHistoryRows = buildEffortHistoryRows(effortHistory);
  const effortLogsDisplay =
    effortHistory.length > 0
      ? `${effortHistory.length} change${effortHistory.length === 1 ? "" : "s"}`
      : "0 changes";

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
      <View style={styles.sheetContainer}>
        <View style={styles.dragHandleBar}>
          <ModalCloseButton
            onPress={() => sheetRef.current?.close()}
            style={styles.closeBtn}
          />
        </View>

        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, activeTab === "details" && styles.tabActive]}
            onPress={() => setActiveTab("details")}
          >
            <Text
              style={
                activeTab === "details"
                  ? styles.tabActiveText
                  : styles.tabInactiveText
              }
            >
              Task Details
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === "comments" && styles.tabActive]}
            onPress={() => setActiveTab("comments")}
          >
            <Text
              style={
                activeTab === "comments"
                  ? styles.tabActiveText
                  : styles.tabInactiveText
              }
            >
              Comments
            </Text>
            {showCommentDot ? <View style={styles.tabDot} /> : null}
          </TouchableOpacity>
        </View>

        {activeTab === "details" && (
          <View style={styles.tabContent}>
            {detailLoading ? (
              <ActivityIndicator
                size="small"
                color="#00DEAB"
                style={{ marginTop: 40 }}
              />
            ) : (
              <View style={{ flex: 1, minHeight: 0 }}>
                <BottomSheetScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.detailsScroll}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                  bounces={true}
                  overScrollMode="always"
                >
                  <TaskDetailDetailsTab
                    canEdit={canEdit}
                    canEditStatus={canEditStatus}
                    canApproveRejectNow={canApproveRejectNow}
                    isAts={isAts}
                    canManageDependencies={canManageDependencies}
                    canManageAttachments={canManageAttachments}
                    titleValue={editTitle}
                    onTitleChange={setEditTitle}
                    onTitleBlur={handleTitleBlur}
                    assigneeName={selectedOwnerName || assignedToName}
                    assigneeImage={
                      selectedOwner?.image ??
                      (typeof apiTask?.asigned_to === "object"
                        ? apiTask.asigned_to?.image
                        : undefined)
                    }
                    onAssigneePress={() => setAssignPickerVisible(true)}
                    createdByName={createdByName}
                    createdByImage={(apiTask as any)?.task_creator?.image}
                    createdAtDisplay={createdAtDisplay}
                    startDateDisplay={startDateDisplay}
                    dueDateDisplay={estCompletionDisplay}
                    onDueDatePress={() => {
                      if (!isAts) setDatePickerVisible(true);
                    }}
                    actualCompletionDisplay={actualCompletionDisplay}
                    hasTaskPriority={hasTaskPriority}
                    editTaskPriority={editTaskPriority}
                    companyPriorityName={companyPriorityName}
                    onPriorityPress={() => setPriorityPickerVisible(true)}
                    editStatus={editStatus}
                    onStatusPress={() => setStatusPickerVisible(true)}
                    isRecurring={Boolean(
                      apiTask?.is_recurring || task.recurringTask === "Yes",
                    )}
                    approvalRequired={editApprovalRequired}
                    onApprovalPress={() => setApprovalPickerVisible(true)}
                    editEffortHours={editEffortHours}
                    editEffortUnit={editEffortUnit}
                    effortLogsDisplay={effortLogsDisplay}
                    onEffortPress={() => setEffortPickerVisible(true)}
                    onEffortLogsPress={() => setEffortLogsModalVisible(true)}
                    dependencies={dependencies}
                    hasDependencies={depDisplay.length > 0}
                    onAddDependency={() => setDependencyModalVisible(true)}
                    descriptionAttachmentCount={attachmentFiles.length}
                    description={editDescription}
                    descriptionEditorKey={`${task?.taskId ?? "task"}-${apiTask?.id ?? "pending"}`}
                    descriptionEditorRef={descriptionEditorRef}
                    onDescriptionChange={setEditDescription}
                    onDescriptionBlur={handleDescriptionBlur}
                    depRows={depRows}
                    onRemoveDependencyFromTable={handleRemoveDependency}
                    attachmentFiles={attachmentFiles}
                    attachmentItems={attachmentItems}
                    taskVisible={taskAttachmentSelection.visible}
                    taskHiddenCount={taskAttachmentSelection.hiddenCount}
                    fileVisible={fileAttachmentSelection.visible}
                    fileHiddenCount={fileAttachmentSelection.hiddenCount}
                    showAllAttachments={showAllAttachments}
                    uploadingAttachment={uploadingAttachment}
                    onPickAttachments={handlePickAttachment}
                    onOpenAttachment={handleOpenAttachment}
                    onDeleteAttachment={handleDeleteAttachment}
                    onShowAllAttachments={() => setShowAllAttachments(true)}
                    onShowLessAttachments={() => setShowAllAttachments(false)}
                  />
                </BottomSheetScrollView>
              </View>
            )}
          </View>
        )}

        <TaskDetailCommentsTab
          visible={activeTab === "comments"}
          keyboardPad={keyboardPad}
          pinnedNotes={pinnedNotes}
          notes={notes}
          notesLoading={notesLoading}
          currentUserId={currentUserId}
          canComment={canComment}
          canEditDeleteComments={canEditDeleteComments}
          canPinOrReactToComments={canPinOrReactToComments}
          mentionActive={mentionActive}
          mentionCandidates={mentionCandidates}
          replyToNote={replyToNote}
          commentText={commentText}
          isFocused={isFocused}
          sendingNote={sendingNote}
          commentBoxRef={commentBoxRef}
          onUnpinNote={handlePinNote}
          onOpenAttachment={handleOpenAttachment}
          onDeleteNote={handleDeleteNote}
          onReactionToggle={handleReactionToggle}
          onEditNote={handleEditNote}
          onReply={handleReply}
          onSelectMention={selectMention}
          onChangeComment={handleCommentChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onSubmitKey={handleCommentSubmit}
          onSend={handleSendComment}
          onMentionButtonPress={handleMentionButtonPress}
          onClearReply={() => setReplyToNote(null)}
        />

        {/* â”€â”€ Assignee Picker Popover â”€â”€ */}
        <TaskDetailAssigneePicker
          visible={assignPickerVisible}
          onClose={handleAssignPickerClose}
          owners={taskState.taskOwners}
          search={assigneeSearch}
          onChangeSearch={setAssigneeSearch}
          selectedId={editAssignToId}
          onSelect={handleAssigneeSelect}
        />

        <TaskDetailStatusPicker
          visible={statusPickerVisible}
          onClose={() => setStatusPickerVisible(false)}
          options={AVAILABLE_STATUSES.filter(
            (st) =>
              (st !== "Partial Complete" ||
                (taskDetail?.task?.subtask_count ?? 0) > 0) &&
              (st !== "Rejected" || canApproveRejectNow) &&
              (st !== "Complete" || currentStatus !== "Complete"),
          )}
          editStatus={editStatus}
          onSelect={handleStatusSelect}
        />

        <TaskDetailPriorityPicker
          visible={priorityPickerVisible}
          onClose={() => setPriorityPickerVisible(false)}
          hasTaskPriority={hasTaskPriority}
          isAts={isAts}
          editTaskPriority={editTaskPriority}
          priorities={taskState.priorities ?? []}
          editPriorityId={editPriorityId}
          onSelectTier={handlePriorityTierSelect}
          onSelectPriority={handleCompanyPrioritySelect}
        />

        <TaskDetailApprovalPicker
          visible={approvalPickerVisible}
          onClose={() => setApprovalPickerVisible(false)}
          value={editApprovalRequired}
          onSelect={handleApprovalSelect}
        />

        <TaskDetailEffortPicker
          visible={effortPickerVisible}
          onClose={() => setEffortPickerVisible(false)}
          value={editEffortHours}
          unit={editEffortUnit}
          onChangeValue={(value) =>
            setEditEffortHours(value.replace(/[^0-9.]/g, ""))
          }
          onBlur={handleEffortBlur}
          onSelectUnit={handleEffortUnitSelect}
        />

        <TaskDetailDueDatePicker
          visible={datePickerVisible}
          onClose={() => setDatePickerVisible(false)}
          value={editDueDate}
          isAts={isAts}
          onSelect={handleDueDateSelect}
          onDone={() => setDatePickerVisible(false)}
        />

        <TaskDetailEffortLogsModal
          visible={effortLogsModalVisible}
          onClose={() => setEffortLogsModalVisible(false)}
          effortHistory={effortHistory}
          effortHistoryRows={effortHistoryRows}
          currentEffortHours={apiTask?.effort_hours}
          currentEffortUnit={apiTask?.effort_unit}
        />
        <CriticalTaskPopUpModal
          visible={criticalPromptVisible}
          onClose={() => {
            setCriticalPromptVisible(false);
            setEditTaskPriority(
              taskDetail?.task?.task_priority === "critical" ? "critical" : "normal",
            );
          }}
          onStopAndStart={handleCriticalStop}
          onWaitAndSchedule={handleCriticalWait}
        />
        <OrderCriticalTasksModal
          visible={detailOrderModalVisible}
          newTask={
            detailOrderNewTask ?? {
              id: Number(task.taskId ?? 0),
              title: apiTask?.title ?? task.title,
              assignedTo: assignedToName,
            }
          }
          existingCriticalTasks={detailCriticalTasks}
          onClose={handleCancelDetailOrder}
          onConfirm={handleDetailOrderConfirm}
        />
      </View>
      {editingNote && (        <Modal
          transparent
          animationType="fade"
          visible
          onRequestClose={() => setEditingNote(null)}
        >
          <View style={styles.popoverOverlay}>
            <View style={styles.popoverCard}>
              <View style={styles.popoverHeader}>
                <Text style={styles.popoverTitle}>Edit Comment</Text>
                <ModalCloseButton onPress={() => setEditingNote(null)} />
              </View>
              <TextInput
                style={styles.editCommentInput}
                value={editingNoteText}
                onChangeText={setEditingNoteText}
                multiline
                textAlignVertical="top"
                placeholder="Comment"
                placeholderTextColor="#9CA3AF"
              />
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10 }}>
                <TouchableOpacity
                  style={styles.editCommentCancel}
                  onPress={() => setEditingNote(null)}
                >
                  <Text style={styles.editCommentCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.editCommentSave}
                  onPress={handleSaveEditedNote}
                >
                  <Text style={styles.editCommentSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      <Modal
        transparent
        animationType="fade"
        visible={deleteNoteTarget !== null}
        onRequestClose={() => {
          if (!deletingNote) setDeleteNoteTarget(null);
        }}
      >
        <Pressable
          style={styles.confirmOverlay}
          onPress={() => {
            if (!deletingNote) setDeleteNoteTarget(null);
          }}
        >
          <Pressable
            style={styles.confirmCard}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.confirmIconBadge}>
              <Ionicons name="trash-outline" size={28} color="#EF4444" />
            </View>
            <Text style={styles.confirmTitle}>Delete Comment</Text>
            <Text style={styles.confirmDescription}>
              Are you sure you want to delete this comment? This action cannot be
              undone.
            </Text>
            <View style={styles.confirmActionRow}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                activeOpacity={0.8}
                disabled={deletingNote}
                onPress={() => setDeleteNoteTarget(null)}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.confirmDeleteBtn,
                  deletingNote && { opacity: 0.7 },
                ]}
                activeOpacity={0.85}
                disabled={deletingNote}
                onPress={() => void confirmDeleteNote()}
              >
                {deletingNote ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmDeleteText}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <DependencyModal
        visible={dependencyModalVisible}
        onClose={() => setDependencyModalVisible(false)}
        availableTasks={dependencyCandidates}
        selectedIds={[]}
        onToggle={(id) => {
          void handleAddDependency(id);
        }}
      />
      <RejectTaskModal
        visible={rejectModalVisible}
        onClose={() => setRejectModalVisible(false)}
        taskId={task.taskId ?? 0}
        companyId={companyId}
        companyIdentifier={companyIdentifier}
        onSuccess={(newStatus) => {
          const nextStatus = newStatus ?? "Rejected";
          const completedAt = new Date().toISOString();
          setEditStatus(nextStatus);
          const taskId = task.taskId ?? 0;
          if (taskId) {
            useTasksStore.getState().patchTask(taskId, {
              status: normalizeApiStatus(nextStatus) as never,
              completed_at:
                normalizeApiStatus(nextStatus) === "Complete"
                  ? completedAt
                  : null,
            });
            // Contract Â§8.9 / AUD-035: pass completion time to recalc.
            void recalculateIfAts(taskId, completedAt);
          }
          loadTaskDetail();
        }}
      />
      <ReopenTaskModal
        key={`reopen-${task.taskId ?? "task"}-${reopenModalVisible ? "open" : "closed"}`}
        visible={reopenModalVisible}
        onClose={() => setReopenModalVisible(false)}
        taskId={task.taskId ?? 0}
        companyId={companyId}
        companyIdentifier={companyIdentifier}
        isAts={isAts}
        initialPriority={editTaskPriority}
        initialEffortMinutes={toMinutes(
          editEffortHours,
          editEffortUnit as "minutes" | "hours" | "days",
        )}
        initialEffortUnit={editEffortUnit}
        onSuccess={(status) => {
          const taskId = task.taskId ?? 0;
          if (taskId) {
            useTasksStore.getState().patchTask(taskId, {
              status: normalizeApiStatus(status) as never,
              completed_at: null,
            });
          }
          void recalculateIfAts(taskId);
          loadTaskDetail();
        }}
      />
      <ResumeTaskModal
        key={`resume-${task.taskId ?? "task"}-${resumeModalVisible ? "open" : "closed"}`}
        visible={resumeModalVisible}
        onClose={() => setResumeModalVisible(false)}
        taskId={task.taskId ?? 0}
        companyId={companyId}
        companyIdentifier={companyIdentifier}
        targetStatus={resumeTargetStatus}
        onSuccess={() => {
          const taskId = task.taskId ?? 0;
          if (taskId) {
            useTasksStore.getState().patchTask(taskId, {
              status: normalizeApiStatus(resumeTargetStatus) as never,
            });
          }
          void recalculateIfAts(taskId);
          loadTaskDetail();
        }}
      />
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  sheetContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  sheetBackground: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  dragHandleBar: {
    width: "100%",
    height: 40,
    alignItems: "center",
    justifyContent: "center",
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
    top: 2,
  },
  tabs: {
    flexDirection: "row",
    marginBottom: 0,
    gap: 0,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 4,
    backgroundColor: "transparent",
  },
  tabActive: { backgroundColor: "#F9F9F9" },
  tabActiveText: {
    fontSize: rf(14),
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Semibold",
  },
  tabInactiveText: {
    fontSize: rf(14),
    color: "#E6E6E6",
    fontFamily: "SF_Pro_Semibold",
  },
  tabDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#00DEAB" },
  detailsScroll: { paddingBottom: 28, paddingTop: 10 },
  tabContent: {
    flex: 1,
    minHeight: 0,
    backgroundColor: "#F9F9F9",
    borderTopRightRadius: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  editCommentInput: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    minHeight: 90,
    padding: 10,
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Regular",
    marginBottom: 12,
  },
  editCommentCancel: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
  },
  editCommentCancelText: {
    color: "#374151",
    fontSize: rf(13),
    fontFamily: "SF_Pro_Medium",
  },
  editCommentSave: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: "#00DEAB",
  },
  editCommentSaveText: {
    color: "#fff",
    fontSize: rf(13),
    fontFamily: "SF_Pro_Semibold",
  },

  // Popover overlay styles
  popoverOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  popoverCard: {
    width: "85%",
    maxWidth: 340,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  popoverHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 8,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  popoverTitle: {
    fontSize: rf(15),
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
  },
  confirmOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  confirmCard: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 22,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
  },
  confirmIconBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    backgroundColor: "#FEE2E2",
  },
  confirmTitle: {
    fontSize: rf(19),
    fontFamily: "SF_Pro_Bold",
    color: "#1D1D1D",
    textAlign: "center",
    marginBottom: 8,
  },
  confirmDescription: {
    fontSize: rf(14),
    fontFamily: "SF_Pro_Regular",
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  confirmActionRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  confirmCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmCancelText: {
    fontSize: rf(15),
    fontFamily: "SF_Pro_Semibold",
    color: "#4B5563",
  },
  confirmDeleteBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmDeleteText: {
    fontSize: rf(15),
    fontFamily: "SF_Pro_Bold",
    color: "#FFFFFF",
  },
});
