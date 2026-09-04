import Avatar from "@/components/Avatar";
import { useAuth } from "@/hooks/useAuth";
import { useTasks } from "@/hooks/useTasks";
import {
  getSocket,
  onSocketEvent,
  type TaskUpdatePayload,
} from "@/services/socket/socketService";
import {
  DependencyData,
  MentionUser,
  TaskNote,
  UpdateTaskRequest,
  ViewTaskData,
} from "@/types/task.types";
import {
  buildMentionMarkup,
  mentionMarkupToDisplay,
} from "@/utils/chatHelpers";
import {
  formatFullDateTime as formatFullDateTimeShared,
  formatShortDate,
} from "@/utils/dateFormat";
import { rf } from "@/utils/responsive";
import { apiStatusToUi } from "@/utils/statusMapper";
import { showError } from "@/utils/toast";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CalendarPicker from "./CalendarPicker";
import RejectTaskModal from "./RejectTaskModal";
import { STATUS_COLORS, StatusType, TaskRowProps } from "./TaskRow";
import SingleTaskTable from "./SingleTaskTable";

const SNAP_POINTS = ["94%"];

export type DependencyDisplay = {
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
  "On Hold",
  "Complete",
  "Pending-Approval",
  "Rejected",
];

function getDependencyInitials(name: string): string {
  if (!name || name === "-") return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatNoteDate(dateInput?: any): string {
  if (!dateInput) {
    const now = new Date();
    const day = now.getDate();
    const month = now.toLocaleDateString("en-US", { month: "long" });
    const year = now.getFullYear();
    let hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return `${day}, ${month}, ${year} | ${hours}.${minutes}${ampm}`;
  }

  const dateStr = String(dateInput).trim();

  if (dateStr.includes("|")) {
    return dateStr;
  }

  let d: Date | null = null;

  const normalizedStr =
    dateStr.includes(" ") && !dateStr.includes("T")
      ? dateStr.replace(" ", "T")
      : dateStr;
  const directDate = new Date(normalizedStr);

  if (!isNaN(directDate.getTime())) {
    d = directDate;
  } else {
    let match = dateStr.match(
      /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/,
    );
    if (match) {
      const [, year, month, day, hour = "0", minute = "0", second = "0"] =
        match;
      d = new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
      );
    } else {
      match = dateStr.match(
        /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/,
      );
      if (match) {
        const [, day, month, year, hour = "0", minute = "0", second = "0"] =
          match;
        d = new Date(
          Number(year),
          Number(month) - 1,
          Number(day),
          Number(hour),
          Number(minute),
          Number(second),
        );
      }
    }
  }

  if (!d || isNaN(d.getTime())) {
    return dateStr;
  }

  const day = d.getDate();
  const month = d.toLocaleDateString("en-US", { month: "long" });
  const year = d.getFullYear();

  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;

  const formattedTime = `${hours}.${minutes}${ampm}`;

  return `${day}, ${month}, ${year} | ${formattedTime}`;
}

function PinnedCommentCard({
  comment,
  onUnpin,
}: {
  comment: TaskNote;
  onUnpin: (note: TaskNote) => void;
}) {
  const initials = (comment.user_name ?? "U")
    .trim()
    .split(/\s+/)
    .map((w: string) => w[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const rawDate =
    comment.created_at ||
    (comment as any).createdAt ||
    (comment as any).created_date ||
    (comment as any).date ||
    (comment as any).created;

  return (
    <View style={styles.pinnedCard}>
      <View style={styles.bubbleHeader}>
        <View style={styles.bubbleAvatar}>
          <Text style={styles.bubbleAvatarText}>{initials || "MJ"}</Text>
        </View>
        <View style={styles.bubbleNameRow}>
          <Text style={styles.bubbleName}>{comment.user_name}</Text>
          <Text style={styles.bubbleTime}>{formatNoteDate(rawDate)}</Text>
        </View>
        <TouchableOpacity
          onPress={() => onUnpin(comment)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialCommunityIcons
            name="pin"
            size={18}
            color="#00DEAB"
            style={styles.pinIcon}
          />
        </TouchableOpacity>
      </View>

      <Text style={styles.bubbleText}>
        {mentionMarkupToDisplay(comment.notes)}
      </Text>
    </View>
  );
}

function CommentBubble({
  comment,
  currentUserId,
  onPin,
  onDelete,
  index = 0,
}: {
  comment: TaskNote;
  currentUserId: number;
  onPin?: (note: TaskNote) => void;
  onDelete?: (note: TaskNote) => void;
  index?: number;
}) {
  const isOwn = comment.user_id === currentUserId;
  const isPinned = comment.pin_top === 1;
  const initials = (comment.user_name ?? "U")
    .trim()
    .split(/\s+/)
    .map((w: string) => w[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const rawDate =
    comment.created_at ||
    (comment as any).createdAt ||
    (comment as any).created_date ||
    (comment as any).date ||
    (comment as any).created;

  return (
    <View style={styles.bubble}>
      <View style={styles.bubbleHeader}>
        <View style={styles.bubbleAvatar}>
          <Text style={styles.bubbleAvatarText}>{initials || "U"}</Text>
        </View>
        <View style={styles.bubbleNameRow}>
          <Text style={styles.bubbleName}>{comment.user_name}</Text>
          <Text style={styles.bubbleTime}>{formatNoteDate(rawDate)}</Text>
        </View>
      </View>

      <Text style={styles.bubbleText}>
        {mentionMarkupToDisplay(comment.notes)}
      </Text>

      {comment.reactions && comment.reactions.length > 0 && (
        <View style={styles.reactionsRow}>
          {comment.reactions.map((r, i) => (
            <View key={i} style={styles.reactionBadge}>
              <Text style={styles.reactionText}>{r.emoji}</Text>
              <Text style={styles.reactionCount}>
                {r.user_name.split(" ")[0]}
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.bubbleActions}>
        <TouchableOpacity style={styles.actionBtn}>
          <Ionicons name="thumbs-up-outline" size={15} color="#9CA3AF" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn}>
          <Ionicons name="happy-outline" size={15} color="#9CA3AF" />
        </TouchableOpacity>

        {/* Pin / Unpin toggle icon — green #00DEAB when pinned, default gray #9CA3AF when unpinned */}
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => onPin?.(comment)}
        >
          <MaterialCommunityIcons
            name={isPinned ? "pin" : "pin-outline"}
            size={15}
            color={isPinned ? "#00DEAB" : "#9CA3AF"}
          />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn}>
          <Ionicons name="pencil-outline" size={15} color="#9CA3AF" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn}>
          <Ionicons name="arrow-undo-outline" size={15} color="#9CA3AF" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => onDelete?.(comment)}
        >
          <Ionicons name="ellipsis-vertical" size={15} color="#9CA3AF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function formatApiDate(dateStr: string): string {
  return formatShortDate(dateStr);
}

function formatApiDateTime(dateStr: string): string {
  return formatFullDateTimeShared(dateStr);
}

function formatDetailDateTime(dateStr?: string | null): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const day = String(d.getDate()).padStart(2, "0");
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${month} ${day}, ${year} ${hours}:${minutes} ${ampm}`;
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
    addNote,
    fetchNotes,
    deleteNote,
    pinNote,
    viewTask: viewTaskApi,
    getDependencies,
    fetchMentionUsers,
    updateTask: updateTaskApi,
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
  const [notes, setNotes] = useState<TaskNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [sendingNote, setSendingNote] = useState(false);
  const [taskDetail, setTaskDetail] = useState<ViewTaskData | null>(null);
  const [dependencies, setDependencies] = useState<DependencyData[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // ── Task Edit State ───────────────────────────────────────────────────
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
      const d = new Date(apiT.due_date);
      if (!isNaN(d.getTime())) currentDueDate = d;
    } else if (task?.dueDate) {
      const d = new Date(task.dueDate);
      if (!isNaN(d.getTime())) currentDueDate = d;
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
    const currentEffortHours = String(
      apiT?.effort_hours ?? task?.effortHours ?? "",
    );
    const currentEffortUnit = apiT?.effort_unit ?? task?.effortUnit ?? "hours";
    const currentApproval = apiT
      ? apiT.approval_required === 1
      : task?.approvalRequired === "Yes";
    const currentDesc = (apiT?.description ?? task?.description ?? "").replace(
      /<[^>]*>/g,
      "",
    );

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

  // Backend gates edit rights per task (e.g. only the creator, or whoever
  // it's assigned to, may not be who's viewing) — taskDetail.task.can_edit
  // is the live, authoritative flag once loaded; the initially-passed task
  // prop's canEdit covers the brief window before that fetch resolves.
  // Treat unset as editable so this never locks out a task the field is
  // simply missing on.
  const canEdit = (taskDetail?.task?.can_edit ?? task?.canEdit) !== false;

  // Persists an edit immediately — pass just the field(s) that changed as
  // `overrides`; the rest of the payload is filled in from current edit
  // state so every save is a full, valid UpdateTaskRequest.
  const persistTaskField = async (overrides: Partial<UpdateTaskRequest>) => {
    if (!task?.taskId || savingTask) return;
    if (!canEdit) {
      showError("Not Allowed", "You don't have permission to edit this task.");
      return;
    }
    const title = (overrides.title ?? editTitle).trim();
    if (!title) {
      showError("Validation Error", "Task title cannot be empty.");
      return;
    }

    setSavingTask(true);
    try {
      const apiT = taskDetail?.task;
      const payload: UpdateTaskRequest = {
        company_id: companyId,
        company_identifier: companyIdentifier,
        title,
        assign_to:
          editAssignToId ??
          (typeof apiT?.asigned_to === "number"
            ? apiT.asigned_to
            : (apiT?.asigned_to?.id ?? 0)),
        due_date: editDueDate ? editDueDate.toISOString().split("T")[0] : null,
        priority: editPriorityId ?? 1,
        status: editStatus,
        description: editDescription,
        is_recurring: apiT?.is_recurring ?? false,
        recurring_period: apiT?.recurring_period ?? null,
        recurring_time: apiT?.recurring_time ?? null,
        recurring_total_count: apiT?.recurring_total_count ?? 0,
        recurring_exclude_days: apiT?.recurring_exclude_days ?? [],
        project_id: (apiT?.project_id as number) ?? 0,
        sprint_id: apiT?.sprint_id ?? null,
        approval_required: editApprovalRequired ? 1 : 0,
        effort_hours: Number(editEffortHours) || 0,
        effort_unit: editEffortUnit || "hours",
        task_priority: editTaskPriority,
        bump_to_front: false,
        ...overrides,
      };

      // updateTaskApi patches the task list locally (optimistic) before the
      // network call resolves. Deliberately NOT re-fetching the full task
      // list afterward — /tasks/all is slow and, if the backend hasn't
      // fully propagated the write yet, a refetch this soon after can
      // overwrite the correct optimistic state with stale data. The next
      // natural refresh (pull-to-refresh, tab switch, socket event) will
      // reconcile any other server-side side effects.
      await updateTaskApi(task.taskId, payload);
      await loadTaskDetail();
    } catch (err: any) {
      showError("Error", err.message || "Failed to update task.");
    } finally {
      setSavingTask(false);
    }
  };

  // ── @-mention picker ───────────────────────────────────────────────────
  const [mentionActive, setMentionActive] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionedUserIds, setMentionedUserIds] = useState<number[]>([]);
  const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([]);
  const mentionUsersLoadedRef = useRef(false);

  const currentUserId = authState.user?.id ?? 0;

  const companyId = task?.companyId ?? authState.company?.company_id ?? 0;
  const companyIdentifier = authState.company?.company_identifier ?? "";

  const loadTaskDetail = useCallback(async () => {
    if (!task?.taskId) return;
    setDetailLoading(true);
    try {
      const detail = await viewTaskApi(task.taskId);
      if (detail) {
        setTaskDetail(detail);
      }
    } catch {
      // silently fail
    } finally {
      setDetailLoading(false);
    }
  }, [task?.taskId, viewTaskApi]);

  const loadDependencies = useCallback(async () => {
    if (!task?.taskId) return;
    try {
      const deps = await getDependencies(task.taskId, companyId);
      setDependencies(deps);
    } catch {
      // silently fail
    }
  }, [task?.taskId, companyId, getDependencies]);

  const loadNotes = useCallback(async () => {
    if (!task?.taskId || !companyId || !companyIdentifier) return;
    setNotesLoading(true);
    try {
      const fetched = await fetchNotes(
        task.taskId,
        companyId,
        companyIdentifier,
      );
      if (Array.isArray(fetched)) {
        const sanitized = fetched.map((n) => ({
          ...n,
          user_full_name:
            (n as any).user_full_name ??
            (n as any).user_name ??
            (n as any).userName ??
            "System User",
        }));

        const pinned = sanitized.filter((n) => n.pin_top === 1);
        const unpinned = sanitized.filter((n) => n.pin_top !== 1);
        const originalOrdered = [...pinned, ...unpinned];

        setNotes(originalOrdered);
      }
    } catch {
      // silently fail
    } finally {
      setNotesLoading(false);
    }
  }, [task?.taskId, companyId, companyIdentifier, fetchNotes]);

  useEffect(() => {
    if (visible) {
      setActiveTab(initialTab);
      setCommentText("");
      setMentionActive(false);
      setTaskDetail(null);
      setDependencies([]);
      if (task?.taskId) {
        loadTaskDetail();
        loadDependencies();
      }
    }
  }, [visible, initialTab, task?.taskId, loadTaskDetail, loadDependencies]);

  useEffect(() => {
    if (visible && activeTab === "comments" && task?.taskId) {
      loadNotes();
    }
  }, [visible, activeTab, task?.taskId, loadNotes]);

  const taskIdRef = useRef(task?.taskId);
  taskIdRef.current = task?.taskId;

  const companyIdRef = useRef(companyId);
  companyIdRef.current = companyId;

  const loadNotesRef = useRef(loadNotes);
  loadNotesRef.current = loadNotes;

  const loadTaskDetailRef = useRef(loadTaskDetail);
  loadTaskDetailRef.current = loadTaskDetail;

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !visible) return;

    const NOTE_ACTIONS = new Set([
      "add_note",
      "update_note",
      "delete_note",
      "update_note_pin",
      "update_note_reaction",
      "add_attachment",
      "delete_attachment",
    ]);

    const cleanup = onSocketEvent("task_update", (payload: unknown) => {
      const p = payload as TaskUpdatePayload;
      if (String(p?.company_id) !== String(companyIdRef.current)) return;
      if (!p?.action) return;
      const eventTaskId =
        (p.data as Record<string, unknown>)?.task_id ??
        (p.data as Record<string, unknown>)?.id;
      if (eventTaskId != null && Number(eventTaskId) === taskIdRef.current) {
        if (NOTE_ACTIONS.has(p.action)) {
          loadNotesRef.current();
        }
        // Refresh task detail on any update to this task
        loadTaskDetailRef.current();
      }
    });

    return cleanup;
  }, [visible]);

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
      await addNote(task.taskId, {
        notes,
        company_id: companyId,
        company_identifier: companyIdentifier,
        mentions,
      });
      setCommentText("");
      setMentionedUserIds([]);
      setMentionActive(false);
      setMentionQuery("");
      await loadNotes();
    } catch {
      // silently fail
    } finally {
      setSendingNote(false);
    }
  };

  const handleDeleteNote = async (note: TaskNote) => {
    try {
      await deleteNote(note.id, companyId, companyIdentifier);
      await loadNotes();
    } catch {
      // silently fail
    }
  };

  const handlePinNote = async (note: TaskNote) => {
    const isCurrentlyPinned = note.pin_top === 1;
    const newPinnedState = isCurrentlyPinned ? 0 : 1;
    const previousNotes = [...notes];

    // Find previously pinned note if pinning a new one
    const previouslyPinnedNote =
      newPinnedState === 1
        ? notes.find((n) => n.pin_top === 1 && n.id !== note.id)
        : null;

    // Optimistically update local state ensuring ONLY one note is pinned
    // and automatically unpinning any previous note (updating pin icon colors)
    setNotes((prev) =>
      prev.map((n) => {
        if (n.id === note.id) {
          return { ...n, pin_top: newPinnedState };
        }
        return newPinnedState === 1 ? { ...n, pin_top: 0 } : n;
      }),
    );

    try {
      // Unpin previous note on backend if pinning a new message
      if (previouslyPinnedNote) {
        pinNote(
          previouslyPinnedNote.id,
          false,
          companyId,
          companyIdentifier,
        ).catch(() => {});
      }
      await pinNote(
        note.id,
        newPinnedState === 1,
        companyId,
        companyIdentifier,
      );
    } catch {
      // Revert on error
      setNotes(previousNotes);
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

  // Use taskDetail data from ViewTask API response, fall back to props
  const apiTask = taskDetail?.task;

  // Resolve user names — created_by/asigned_to can be a number (lookup in taskOwners) or an object (inline user info)
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
  // task_owner entries from /tasks/all don't reliably carry full_name —
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
    id: `dep-${idx}`,
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

  const attachmentFiles: string[] =
    apiTask?.task_attachments?.map((a) => a.attachment) ?? task.attachments;
  const effortDisplay = apiTask
    ? `${apiTask.effort_hours} ${apiTask.effort_unit}`
    : task.effortHours
      ? `${task.effortHours} ${task.effortUnit ?? "minutes"}`
      : "-";
  const projectDisplay = apiTask?.project_name ?? task.projectName ?? "-";

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
  const effortLogsDisplay =
    (apiTask as any)?.effort_logs_count !== undefined
      ? `${(apiTask as any).effort_logs_count} change${(apiTask as any).effort_logs_count === 1 ? "" : "s"}`
      : (apiTask as any)?.effort_logs?.length !== undefined
        ? `${(apiTask as any).effort_logs.length} change${(apiTask as any).effort_logs.length === 1 ? "" : "s"}`
        : apiTask?.effort_hours
          ? "1 change"
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
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => sheetRef.current?.close()}
          >
            <Ionicons name="close" size={16} color="#fff" />
          </TouchableOpacity>
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
            <View style={styles.tabDot} />
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
                  {/* Direct Editable Title */}
                  <TextInput
                    allowFontScaling={false}
                    style={styles.editableTaskTitle}
                    value={editTitle}
                    editable={canEdit}
                    onChangeText={setEditTitle}
                    onBlur={() => {
                      const trimmed = editTitle.trim();
                      if (
                        trimmed &&
                        trimmed !== lastSavedTitleRef.current.trim()
                      ) {
                        lastSavedTitleRef.current = trimmed;
                        persistTaskField({ title: trimmed });
                      }
                    }}
                    scrollEnabled={false}
                    placeholder="Enter task title..."
                    placeholderTextColor="#9CA3AF"
                    multiline
                  />

                  {/* ── Info Rows (vertical, ordered) ── */}

                  {/* 1. Assigned to */}
                  <View style={styles.infoRow}>
                    <View style={styles.infoLabelWrap}>
                      <Ionicons
                        name="people-outline"
                        size={16}
                        color="#AAAAAA"
                        style={{ marginRight: 6 }}
                      />
                      <Text style={styles.infoLabel}>Assigned to:</Text>
                    </View>
                    <View style={styles.infoValueWrap}>
                      <TouchableOpacity
                        style={[
                          styles.assignedRow,
                          !canEdit && { opacity: 0.7 },
                        ]}
                        activeOpacity={0.7}
                        disabled={!canEdit}
                        onPress={() => setAssignPickerVisible(true)}
                      >
                        <Avatar
                          name={selectedOwnerName || assignedToName}
                          imagePath={
                            selectedOwner?.image ??
                            (typeof apiTask?.asigned_to === "object"
                              ? apiTask.asigned_to?.image
                              : undefined)
                          }
                          size={20}
                          borderRadius={4}
                        />
                        <Text style={styles.infoValue}>
                          {selectedOwnerName || assignedToName || "Select User"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* 2. Created By */}
                  <View style={styles.infoRow}>
                    <View style={styles.infoLabelWrap}>
                      <Ionicons
                        name="person-outline"
                        size={16}
                        color="#AAAAAA"
                        style={{ marginRight: 6 }}
                      />
                      <Text style={styles.infoLabel}>Created By:</Text>
                    </View>
                    <View style={styles.infoValueWrap}>
                      <View style={styles.assignedRow}>
                        <Avatar
                          name={createdByName}
                          imagePath={(apiTask as any)?.task_creator?.image}
                          size={20}
                          borderRadius={4}
                        />
                        <Text style={styles.infoValue}>{createdByName}</Text>
                      </View>
                    </View>
                  </View>

                  {/* 3. Created At */}
                  <View style={styles.infoRow}>
                    <View style={styles.infoLabelWrap}>
                      <Ionicons
                        name="calendar-outline"
                        size={16}
                        color="#AAAAAA"
                        style={{ marginRight: 6 }}
                      />
                      <Text style={styles.infoLabel}>Created At:</Text>
                    </View>
                    <View style={styles.infoValueWrap}>
                      <Text style={styles.infoValue}>{createdAtDisplay}</Text>
                    </View>
                  </View>

                  {/* 4. Start Date */}
                  <View style={styles.infoRow}>
                    <View style={styles.infoLabelWrap}>
                      <Ionicons
                        name="calendar-outline"
                        size={16}
                        color="#AAAAAA"
                        style={{ marginRight: 6 }}
                      />
                      <Text style={styles.infoLabel}>Start Date:</Text>
                    </View>
                    <View style={styles.infoValueWrap}>
                      <Text style={styles.infoValue}>{startDateDisplay}</Text>
                    </View>
                  </View>

                  {/* 5. Est. Completion */}
                  <View style={styles.infoRow}>
                    <View style={styles.infoLabelWrap}>
                      <Ionicons
                        name="calendar-outline"
                        size={16}
                        color="#AAAAAA"
                        style={{ marginRight: 6 }}
                      />
                      <Text style={styles.infoLabel}>Est. Completion:</Text>
                      <Ionicons
                        name="information-circle-outline"
                        size={12}
                        color="#9CA3AF"
                        style={{ marginLeft: 2 }}
                      />
                    </View>
                    <View style={styles.infoValueWrap}>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        disabled={!canEdit}
                        style={!canEdit && { opacity: 0.7 }}
                        onPress={() => setDatePickerVisible(true)}
                      >
                        <Text style={styles.infoValue}>
                          {estCompletionDisplay}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* 6. Actual Completion */}
                  <View style={styles.infoRow}>
                    <View style={styles.infoLabelWrap}>
                      <Ionicons
                        name="calendar-outline"
                        size={16}
                        color="#AAAAAA"
                        style={{ marginRight: 6 }}
                      />
                      <Text style={styles.infoLabel}>Actual Completion:</Text>
                    </View>
                    <View style={styles.infoValueWrap}>
                      <Text style={styles.infoValue}>
                        {actualCompletionDisplay}
                      </Text>
                    </View>
                  </View>

                  {/* 7. Priority */}
                  <View style={styles.infoRow}>
                    <View style={styles.infoLabelWrap}>
                      <Ionicons
                        name="star-outline"
                        size={16}
                        color="#AAAAAA"
                        style={{ marginRight: 6 }}
                      />
                      <Text style={styles.infoLabel}>Priority:</Text>
                    </View>
                    <View style={styles.infoValueWrap}>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        disabled={!canEdit}
                        style={!canEdit && { opacity: 0.7 }}
                        onPress={() => setPriorityPickerVisible(true)}
                      >
                        <View
                          style={[
                            styles.taskPriorityBadge,
                            editTaskPriority === "critical"
                              ? styles.taskPriorityBadgeCritical
                              : styles.taskPriorityBadgeNormal,
                          ]}
                        >
                          <View
                            style={[
                              styles.taskPriorityDot,
                              {
                                backgroundColor:
                                  editTaskPriority === "critical"
                                    ? "#EF4444"
                                    : "#00A876",
                              },
                            ]}
                          />
                          <Text
                            style={[
                              styles.taskPriorityBadgeText,
                              {
                                color:
                                  editTaskPriority === "critical"
                                    ? "#EF4444"
                                    : "#00A876",
                              },
                            ]}
                          >
                            {editTaskPriority === "critical"
                              ? "Critical"
                              : "Normal"}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* 8. Task Status */}
                  <View style={styles.infoRow}>
                    <View style={styles.infoLabelWrap}>
                      <Ionicons
                        name="sync-outline"
                        size={16}
                        color="#AAAAAA"
                        style={{ marginRight: 6 }}
                      />
                      <Text style={styles.infoLabel}>Task Status:</Text>
                    </View>
                    <View style={styles.infoValueWrap}>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        disabled={!canEdit}
                        style={!canEdit && { opacity: 0.7 }}
                        onPress={() => setStatusPickerVisible(true)}
                      >
                        <View
                          style={[
                            styles.badge,
                            {
                              backgroundColor:
                                STATUS_COLORS[editStatus as StatusType]?.bg ??
                                "#D1FAE5",
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.badgeText,
                              {
                                color:
                                  STATUS_COLORS[editStatus as StatusType]
                                    ?.text ?? "#059669",
                              },
                            ]}
                          >
                            {editStatus === "In-Progress"
                              ? "In Progress"
                              : editStatus}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* 9. Recurring Task */}
                  <View style={styles.infoRow}>
                    <View style={styles.infoLabelWrap}>
                      <Ionicons
                        name="repeat-outline"
                        size={16}
                        color="#AAAAAA"
                        style={{ marginRight: 6 }}
                      />
                      <Text style={styles.infoLabel}>Recurring Task:</Text>
                    </View>
                    <View style={styles.infoValueWrap}>
                      <Text style={styles.infoValue}>
                        {apiTask?.is_recurring || task.recurringTask === "Yes"
                          ? "Yes"
                          : "No"}
                      </Text>
                    </View>
                  </View>

                  {/* 10. Approval Required */}
                  <View style={styles.infoRow}>
                    <View style={styles.infoLabelWrap}>
                      <Ionicons
                        name="checkbox-outline"
                        size={16}
                        color="#AAAAAA"
                        style={{ marginRight: 6 }}
                      />
                      <Text style={styles.infoLabel}>Approval Required:</Text>
                    </View>
                    <View style={styles.infoValueWrap}>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        disabled={!canEdit}
                        style={!canEdit && { opacity: 0.7 }}
                        onPress={() => setApprovalPickerVisible(true)}
                      >
                        <Text style={styles.infoValue}>
                          {editApprovalRequired ? "Yes" : "No"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* 11. Efforts */}
                  <View style={styles.infoRow}>
                    <View style={styles.infoLabelWrap}>
                      <Ionicons
                        name="time-outline"
                        size={16}
                        color="#AAAAAA"
                        style={{ marginRight: 6 }}
                      />
                      <Text style={styles.infoLabel}>Efforts:</Text>
                    </View>
                    <View style={styles.infoValueWrap}>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        disabled={!canEdit}
                        style={!canEdit && { opacity: 0.7 }}
                        onPress={() => setEffortPickerVisible(true)}
                      >
                        <Text style={styles.infoValue}>
                          {editEffortHours || "0"}{" "}
                          {editEffortUnit === "minutes"
                            ? "mins"
                            : editEffortUnit}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* 12. Effort Logs */}
                  <View style={styles.infoRow}>
                    <View style={styles.infoLabelWrap}>
                      <Ionicons
                        name="time-outline"
                        size={16}
                        color="#AAAAAA"
                        style={{ marginRight: 6 }}
                      />
                      <Text style={styles.infoLabel}>Effort Logs:</Text>
                      <Ionicons
                        name="information-circle-outline"
                        size={12}
                        color="#9CA3AF"
                        style={{ marginLeft: 2 }}
                      />
                    </View>
                    <View style={styles.infoValueWrap}>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => setEffortLogsModalVisible(true)}
                      >
                        <Text style={[styles.infoValue, { color: "#00DEAB" }]}>
                          {effortLogsDisplay}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* 13. Dependencies */}
                  <View style={styles.infoRow}>
                    <View style={styles.infoLabelWrap}>
                      <Ionicons
                        name="git-compare-outline"
                        size={16}
                        color="#AAAAAA"
                        style={{ marginRight: 6 }}
                      />
                      <Text style={styles.infoLabel}>Dependencies:</Text>
                    </View>
                    <View style={styles.infoValueWrap}>
                      {depDisplay.length > 0 ? (
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          nestedScrollEnabled
                        >
                          {depDisplay.map((dep, idx) => (
                            <View key={idx} style={styles.depPill}>
                              <Text
                                style={styles.depPillText}
                                numberOfLines={1}
                              >
                                {dep.title}
                              </Text>
                            </View>
                          ))}
                        </ScrollView>
                      ) : (
                        <Text style={styles.infoValue}>—</Text>
                      )}
                    </View>
                  </View>

                  {/* Direct Editable Description */}
                  <View style={styles.section}>
                    <View style={styles.descHeaderRow}>
                      {/* <Ionicons
                        name="document-text-outline"
                        size={16}
                        color="#8E8E93"
                        style={{ marginRight: 6 }}
                      /> */}
                      <Text style={styles.sectionTitle}>Description</Text>
                    </View>
                    <View style={styles.descBadgeChip}>
                      <Ionicons name="link-outline" size={12} color="#fff" />
                      <Text style={styles.descBadgeChipText}>
                        +{attachmentFiles.length}
                      </Text>
                    </View>
                    <TextInput
                      style={styles.editableDescInput}
                      value={editDescription}
                      editable={canEdit}
                      onChangeText={setEditDescription}
                      onBlur={() => {
                        if (editDescription !== lastSavedDescRef.current) {
                          lastSavedDescRef.current = editDescription;
                          persistTaskField({ description: editDescription });
                        }
                      }}
                      scrollEnabled={false}
                      multiline
                      placeholder="Add task description..."
                      placeholderTextColor="#9CA3AF"
                    />
                  </View>

                  {depRows.length > 0 && (
                    <View style={styles.dependencyTableWrap}>
                      <SingleTaskTable
                        sectionTitle="Dependencies"
                        tasks={depRows}
                        contained
                        canReassign={false}
                      />
                    </View>
                  )}

                  {/* Bottom Attachments Button */}
                  <View style={styles.bottomAttachmentSection}>
                    <TouchableOpacity style={styles.bottomAttachmentBtn}>
                      <Ionicons
                        name="link-outline"
                        size={14}
                        color="#8E8E93"
                        style={{ marginRight: 6 }}
                      />
                      <Text style={styles.bottomAttachmentText}>
                        Attachments
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {attachmentFiles.length > 0 && (
                    <View style={styles.section}>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        nestedScrollEnabled
                      >
                        {attachmentFiles.map((a, i) => (
                          <View key={i} style={styles.attachTag}>
                            <Ionicons
                              name="download-outline"
                              size={13}
                              color="#00DEAB"
                            />
                            <Text style={styles.attachTagText}>{a}</Text>
                          </View>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </BottomSheetScrollView>
              </View>
            )}
          </View>
        )}

        {activeTab === "comments" && (
          <View style={[styles.commentsContainer, styles.tabComment]}>
            {/* Sticky pinned message */}
            {pinnedNotes.length > 0 && (
              <PinnedCommentCard
                comment={pinnedNotes[0]}
                onUnpin={handlePinNote}
              />
            )}

            {/* Only comments scroll */}
            <ScrollView
              style={styles.commentsList}
              contentContainerStyle={styles.commentsListContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              scrollEventThrottle={16}
              bounces={true}
              overScrollMode="always"
            >
              {notesLoading ? (
                <ActivityIndicator
                  size="small"
                  color="#00DEAB"
                  style={{ marginTop: 20 }}
                />
              ) : notes.length === 0 ? (
                <View style={styles.emptyComments}>
                  <Text style={styles.emptyCommentsText}>No Comments</Text>
                </View>
              ) : (
                notes.map((c, i) => (
                  <CommentBubble
                    key={c.id ?? i}
                    comment={c}
                    currentUserId={currentUserId}
                    onPin={handlePinNote}
                    onDelete={handleDeleteNote}
                    index={i}
                  />
                ))
              )}
            </ScrollView>

            {/* ── Mention Suggestions ── */}
            {mentionActive && mentionCandidates.length > 0 && (
              <View style={styles.mentionSuggestions}>
                {mentionCandidates.map((user) => (
                  <TouchableOpacity
                    key={user.id}
                    style={styles.mentionSuggestionItem}
                    activeOpacity={0.6}
                    onPress={() => selectMention(user)}
                  >
                    <View style={styles.mentionAvatar}>
                      <Text style={styles.mentionAvatarText}>
                        {`${user.first_name?.[0] ?? ""}${user.last_name?.[0] ?? ""}`.toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.mentionName} numberOfLines={1}>
                      {`${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() ||
                        user.full_name ||
                        `User ${user.id}`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View
              style={[
                styles.inputBox,
                {
                  borderColor: isFocused ? "#1D1D1D" : "#E5E7EB",
                },
              ]}
            >
              {(isFocused || commentText.length > 0) && (
                <View style={styles.inputLabelWrap}>
                  <Text style={styles.inputLabelText}>Comment</Text>
                </View>
              )}
              <TextInput
                style={styles.inputField}
                value={commentText}
                onChangeText={handleCommentChange}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                multiline
                placeholder={
                  !isFocused && commentText.length === 0 ? "Comment" : ""
                }
                placeholderTextColor="#9CA3AF"
                textAlignVertical="top"
              />
              <View style={styles.inputToolbar}>
                <View style={styles.toolbarLeft}>
                  <TouchableOpacity style={styles.toolBtn}>
                    <Ionicons name="add" size={16} color="#374151" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.toolBtn}
                    onPress={() => {
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
                    }}
                  >
                    <Ionicons name="at" size={16} color="#374151" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.toolBtn}>
                    <Ionicons name="happy-outline" size={16} color="#374151" />
                  </TouchableOpacity>
                  {/* Voice recorder — hidden/disabled */}
                  {/* <TouchableOpacity style={styles.toolBtn}>
                        <Ionicons
                          name="mic-outline"
                          size={16}
                          color="#374151"
                        />
                      </TouchableOpacity> */}
                  {/* Video recorder — hidden/disabled */}
                  {/* <TouchableOpacity style={styles.toolBtn}>
                        <Ionicons
                          name="videocam-outline"
                          size={16}
                          color="#374151"
                        />
                      </TouchableOpacity> */}
                </View>
                <TouchableOpacity
                  style={[styles.sendBtn, sendingNote && { opacity: 0.5 }]}
                  onPress={handleSendComment}
                  disabled={sendingNote || !commentText.trim()}
                >
                  {sendingNote ? (
                    <ActivityIndicator size={12} color="#fff" />
                  ) : (
                    <Ionicons name="send" size={14} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* ── Assignee Picker Popover ── */}
        {assignPickerVisible && (
          <Pressable
            style={styles.popoverOverlay}
            onPress={() => {
              setAssignPickerVisible(false);
              setAssigneeSearch("");
            }}
          >
            <Pressable
              style={styles.popoverCard}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.popoverHeader}>
                <Text style={styles.popoverTitle}>Select Assignee</Text>
                <TouchableOpacity
                  onPress={() => {
                    setAssignPickerVisible(false);
                    setAssigneeSearch("");
                  }}
                >
                  <Ionicons name="close" size={20} color="#1D1D1D" />
                </TouchableOpacity>
              </View>
              <View style={styles.popoverSearchWrap}>
                <Ionicons name="search-outline" size={16} color="#9CA3AF" />
                <TextInput
                  style={styles.popoverSearchInput}
                  value={assigneeSearch}
                  onChangeText={setAssigneeSearch}
                  placeholder="Search people..."
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <ScrollView
                style={{ maxHeight: 260 }}
                keyboardShouldPersistTaps="handled"
              >
                {taskState.taskOwners
                  .filter((user) =>
                    `${user.first_name ?? ""} ${user.last_name ?? ""} ${user.full_name ?? ""}`
                      .toLowerCase()
                      .includes(assigneeSearch.trim().toLowerCase()),
                  )
                  .map((user) => {
                    const isSelected = editAssignToId === user.id;
                    return (
                      <TouchableOpacity
                        key={user.id}
                        style={[
                          styles.popoverRow,
                          isSelected && styles.popoverRowSelected,
                        ]}
                        onPress={() => {
                          setEditAssignToId(user.id);
                          setAssignPickerVisible(false);
                          setAssigneeSearch("");
                          persistTaskField({ assign_to: user.id });
                        }}
                      >
                        <Text
                          style={[
                            styles.popoverRowText,
                            isSelected && {
                              fontFamily: "SF_Pro_Semibold",
                              color: "#00DEAB",
                            },
                          ]}
                        >
                          {`${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() ||
                            user.full_name ||
                            `User ${user.id}`}
                        </Text>
                        {isSelected && (
                          <Ionicons
                            name="checkmark"
                            size={16}
                            color="#00DEAB"
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}
              </ScrollView>
            </Pressable>
          </Pressable>
        )}

        {/* ── Status Picker Popover ── */}
        {statusPickerVisible && (
          <Pressable
            style={styles.popoverOverlay}
            onPress={() => setStatusPickerVisible(false)}
          >
            <Pressable
              style={styles.popoverCard}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.popoverHeader}>
                <Text style={styles.popoverTitle}>Select Status</Text>
                <TouchableOpacity onPress={() => setStatusPickerVisible(false)}>
                  <Ionicons name="close" size={20} color="#1D1D1D" />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 260 }}>
                {AVAILABLE_STATUSES.map((st) => {
                  const isSelected = editStatus === st;
                  return (
                    <TouchableOpacity
                      key={st}
                      style={[
                        styles.popoverRow,
                        isSelected && styles.popoverRowSelected,
                      ]}
                      onPress={() => {
                        if (st === "Rejected") {
                          setStatusPickerVisible(false);
                          setRejectModalVisible(true);
                          return;
                        }
                        if (st === "In-Progress" || st === "In Progress") {
                          const hasOtherInProgress = (
                            taskState.assignedToMe || []
                          ).some(
                            (t) =>
                              ((t.status as string) === "In Progress" ||
                                (t.status as string) === "In-Progress" ||
                                (t.status as string) === "in_progress") &&
                              t.id !== task.taskId,
                          );
                          if (hasOtherInProgress) {
                            showError(
                              "Action Not Allowed",
                              "Another task is already in progress. You can only have one task in progress at a time.",
                            );
                            setStatusPickerVisible(false);
                            return;
                          }
                        }
                        setEditStatus(st);
                        setStatusPickerVisible(false);
                        persistTaskField({ status: st });
                      }}
                    >
                      <View
                        style={[
                          styles.badge,
                          {
                            backgroundColor:
                              STATUS_COLORS[st as StatusType]?.bg ?? "#00DEAB",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.badgeText,
                            {
                              color:
                                STATUS_COLORS[st as StatusType]?.text ?? "#fff",
                            },
                          ]}
                        >
                          {st}
                        </Text>
                      </View>
                      {isSelected && (
                        <Ionicons
                          name="checkmark"
                          size={16}
                          color="#00DEAB"
                          style={{ marginLeft: "auto" }}
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </Pressable>
          </Pressable>
        )}

        {/* ── Task Priority Picker Popover ── */}
        {priorityPickerVisible && (
          <Pressable
            style={styles.popoverOverlay}
            onPress={() => setPriorityPickerVisible(false)}
          >
            <Pressable
              style={styles.popoverCard}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.popoverHeader}>
                <Text style={styles.popoverTitle}>Task Priority</Text>
                <TouchableOpacity
                  onPress={() => setPriorityPickerVisible(false)}
                >
                  <Ionicons name="close" size={20} color="#1D1D1D" />
                </TouchableOpacity>
              </View>
              {(["normal", "critical"] as const).map((tier) => {
                const isSelected = editTaskPriority === tier;
                return (
                  <TouchableOpacity
                    key={tier}
                    style={[
                      styles.popoverRow,
                      isSelected && styles.popoverRowSelected,
                    ]}
                    onPress={() => {
                      setEditTaskPriority(tier);
                      setPriorityPickerVisible(false);
                      persistTaskField({ task_priority: tier });
                    }}
                  >
                    <View
                      style={[
                        styles.taskPriorityBadge,
                        tier === "critical"
                          ? styles.taskPriorityBadgeCritical
                          : styles.taskPriorityBadgeNormal,
                      ]}
                    >
                      <View
                        style={[
                          styles.taskPriorityDot,
                          {
                            backgroundColor:
                              tier === "critical" ? "#EF4444" : "#00A876",
                          },
                        ]}
                      />
                      <Text
                        style={[
                          styles.taskPriorityBadgeText,
                          {
                            color: tier === "critical" ? "#EF4444" : "#00A876",
                          },
                        ]}
                      >
                        {tier === "critical" ? "Critical" : "Normal"}
                      </Text>
                    </View>
                    {isSelected && (
                      <Ionicons
                        name="checkmark"
                        size={16}
                        color="#00DEAB"
                        style={{ marginLeft: "auto" }}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </Pressable>
          </Pressable>
        )}

        {/* ── Approval Required Picker Popover ── */}
        {approvalPickerVisible && (
          <Pressable
            style={styles.popoverOverlay}
            onPress={() => setApprovalPickerVisible(false)}
          >
            <Pressable
              style={styles.popoverCard}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.popoverHeader}>
                <Text style={styles.popoverTitle}>Approval Required</Text>
                <TouchableOpacity
                  onPress={() => setApprovalPickerVisible(false)}
                >
                  <Ionicons name="close" size={20} color="#1D1D1D" />
                </TouchableOpacity>
              </View>
              {[
                { label: "Yes", value: true },
                { label: "No", value: false },
              ].map((opt) => {
                const isSelected = editApprovalRequired === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.label}
                    style={[
                      styles.popoverRow,
                      isSelected && styles.popoverRowSelected,
                    ]}
                    onPress={() => {
                      setEditApprovalRequired(opt.value);
                      setApprovalPickerVisible(false);
                      persistTaskField({
                        approval_required: opt.value ? 1 : 0,
                      });
                    }}
                  >
                    <Text
                      style={[
                        styles.popoverRowText,
                        isSelected && {
                          fontFamily: "SF_Pro_Semibold",
                          color: "#00DEAB",
                        },
                      ]}
                    >
                      {opt.label}
                    </Text>
                    {isSelected && (
                      <Ionicons name="checkmark" size={16} color="#00DEAB" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </Pressable>
          </Pressable>
        )}

        {/* ── Effort Picker Popover ── */}
        {effortPickerVisible && (
          <Pressable
            style={styles.popoverOverlay}
            onPress={() => setEffortPickerVisible(false)}
          >
            <Pressable
              style={styles.popoverCard}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.popoverHeader}>
                <Text style={styles.popoverTitle}>Effort</Text>
                <TouchableOpacity onPress={() => setEffortPickerVisible(false)}>
                  <Ionicons name="close" size={20} color="#1D1D1D" />
                </TouchableOpacity>
              </View>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <TextInput
                  style={styles.inlineEffortInput}
                  value={editEffortHours}
                  autoFocus
                  onChangeText={(t) =>
                    setEditEffortHours(t.replace(/[^0-9.]/g, ""))
                  }
                  onBlur={() => {
                    if (editEffortHours !== lastSavedEffortHoursRef.current) {
                      lastSavedEffortHoursRef.current = editEffortHours;
                      persistTaskField({
                        effort_hours: Number(editEffortHours) || 0,
                      });
                    }
                  }}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor="#9CA3AF"
                />
                <View style={{ flexDirection: "row", gap: 4 }}>
                  {["hours", "minutes", "days"].map((unit) => (
                    <TouchableOpacity
                      key={unit}
                      style={[
                        styles.inlineUnitChip,
                        editEffortUnit === unit && styles.inlineUnitChipActive,
                      ]}
                      onPress={() => {
                        setEditEffortUnit(unit);
                        persistTaskField({ effort_unit: unit });
                      }}
                    >
                      <Text
                        style={[
                          styles.inlineUnitChipText,
                          editEffortUnit === unit && { color: "#fff" },
                        ]}
                      >
                        {unit}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </Pressable>
          </Pressable>
        )}

        {/* ── Date Picker Popover ── */}
        {datePickerVisible && (
          <Pressable
            style={styles.popoverOverlay}
            onPress={() => setDatePickerVisible(false)}
          >
            <Pressable
              style={[styles.popoverCard, { maxWidth: 360 }]}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.popoverHeader}>
                <Text style={styles.popoverTitle}>Select Due Date</Text>
                <TouchableOpacity onPress={() => setDatePickerVisible(false)}>
                  <Ionicons name="close" size={20} color="#1D1D1D" />
                </TouchableOpacity>
              </View>
              <CalendarPicker
                startDate={editDueDate}
                endDate={editDueDate}
                onSelectStart={(d) => {
                  setEditDueDate(d);
                  persistTaskField({ due_date: d.toISOString().split("T")[0] });
                }}
                onSelectEnd={(d) => {
                  setEditDueDate(d);
                  persistTaskField({ due_date: d.toISOString().split("T")[0] });
                }}
                onDone={() => setDatePickerVisible(false)}
                compact
              />
            </Pressable>
          </Pressable>
        )}
        {/* ── Effort Logs Modal ── */}
        {effortLogsModalVisible && (
          <Modal
            transparent
            animationType="fade"
            visible={effortLogsModalVisible}
            onRequestClose={() => setEffortLogsModalVisible(false)}
          >
            <Pressable
              style={styles.popoverOverlay}
              onPress={() => setEffortLogsModalVisible(false)}
            >
              <Pressable
                style={[
                  styles.popoverCard,
                  { maxHeight: "70%", width: "90%", maxWidth: 420 },
                ]}
                onPress={(e) => e.stopPropagation()}
              >
                <View style={styles.popoverHeader}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Ionicons name="time-outline" size={18} color="#1D1D1D" />
                    <Text style={styles.popoverTitle}>Effort Logs</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setEffortLogsModalVisible(false)}
                  >
                    <Ionicons name="close" size={20} color="#1D1D1D" />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingVertical: 8, gap: 10 }}
                >
                  {Array.isArray((apiTask as any)?.effort_logs) &&
                  (apiTask as any).effort_logs.length > 0 ? (
                    (apiTask as any).effort_logs.map(
                      (log: any, idx: number) => (
                        <View key={idx} style={styles.logCard}>
                          <View style={styles.logHeader}>
                            <Text style={styles.logUser}>
                              {log.user_name ||
                                log.userName ||
                                log.created_by_name ||
                                "User"}
                            </Text>
                            <Text style={styles.logDate}>
                              {log.created_at
                                ? formatDetailDateTime(log.created_at)
                                : "-"}
                            </Text>
                          </View>
                          <Text style={styles.logChange}>
                            {log.change ||
                              log.message ||
                              log.description ||
                              log.effort_hours ||
                              JSON.stringify(log)}
                          </Text>
                        </View>
                      ),
                    )
                  ) : (
                    <View style={{ paddingVertical: 24, alignItems: "center" }}>
                      <Ionicons
                        name="document-text-outline"
                        size={32}
                        color="#D1D5DB"
                        style={{ marginBottom: 8 }}
                      />
                      <Text
                        style={{
                          fontSize: rf(13),
                          color: "#6B7280",
                          fontFamily: "SF_Pro_Medium",
                        }}
                      >
                        Current Effort:{" "}
                        {editEffortHours || apiTask?.effort_hours || "0"}{" "}
                        {editEffortUnit || apiTask?.effort_unit || "hours"}
                      </Text>
                      <Text
                        style={{
                          fontSize: rf(11.5),
                          color: "#9CA3AF",
                          marginTop: 4,
                          fontFamily: "SF_Pro_Regular",
                        }}
                      >
                        No change logs recorded for this task.
                      </Text>
                    </View>
                  )}
                </ScrollView>
              </Pressable>
            </Pressable>
          </Modal>
        )}
      </View>
      <RejectTaskModal
        visible={rejectModalVisible}
        onClose={() => setRejectModalVisible(false)}
        taskId={task.taskId ?? 0}
        companyId={companyId}
        companyIdentifier={companyIdentifier}
        onSuccess={() => {
          setEditStatus("Rejected");
          loadTaskDetail();
        }}
      />
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheetContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  sheetBackground: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 14,
    paddingHorizontal: 16,
    minHeight: "90%",
    maxHeight: "90%",
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
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#1D1D1D",
    justifyContent: "center",
    alignItems: "center",
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
  cntBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#00DFAB",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    alignSelf: "flex-start",
    marginBottom: 10,
  },
  cntBadgeGray: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#AAAAAA",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    alignSelf: "flex-start",
    marginBottom: 10,
  },
  cntBadgeText: {
    fontSize: rf(12),
    color: "#fff",
    fontFamily: "SF_Pro_Regular",
  },
  taskTitle: {
    fontSize: rf(16),
    fontFamily: "SF_Pro_Medium",
    color: "#1D1D1D",
    marginBottom: 14,
  },
  gridContainer: {
    flexDirection: "row",
    gap: 16,
    marginVertical: 10,
  },
  gridColumn: {
    flex: 1,
    gap: 8,
  },
  gridRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 32,
  },
  gridLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
  },
  gridIcon: {
    marginRight: 5,
  },
  gridLabel: {
    fontSize: rf(11.5),
    color: "#8E8E93",
    fontFamily: "SF_Pro_Medium",
  },
  gridValueText: {
    fontSize: rf(11.5),
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Medium",
    textAlign: "right",
    flexShrink: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: "flex-end",
  },
  statusBadgeText: {
    fontSize: rf(11),
    fontFamily: "SF_Pro_Semibold",
  },
  priorityBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    alignSelf: "flex-end",
  },
  priorityBadgeNormal: {
    backgroundColor: "#E6FBF6",
  },
  priorityBadgeCritical: {
    backgroundColor: "#FEE2E2",
  },
  priorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  priorityBadgeText: {
    fontSize: rf(11),
    fontFamily: "SF_Pro_Semibold",
  },
  effortLogsValueText: {
    fontSize: rf(11.5),
    color: "#00DEAB",
    fontFamily: "SF_Pro_Medium",
    textAlign: "right",
    textDecorationLine: "underline",
  },
  logCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  logHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  logUser: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
  },
  logDate: {
    fontSize: rf(10),
    color: "#9CA3AF",
    fontFamily: "SF_Pro_Regular",
  },
  logChange: {
    fontSize: rf(11.5),
    color: "#4B5563",
    fontFamily: "SF_Pro_Regular",
    marginTop: 2,
  },
  descHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  descBadgeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#1D1D1D",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  descBadgeChipText: {
    fontSize: rf(10),
    color: "#FFFFFF",
    fontFamily: "SF_Pro_Medium",
  },
  bottomAttachmentSection: {
    marginTop: 14,
    marginBottom: 8,
  },
  bottomAttachmentBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#FFFFFF",
  },
  bottomAttachmentText: {
    fontSize: rf(12),
    color: "#8E8E93",
    fontFamily: "SF_Pro_Medium",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  infoLabelWrap: { flexDirection: "row", alignItems: "center", flex: 1.2 },
  infoLabel: {
    fontSize: rf(11),
    color: "#6B7280",
    fontFamily: "SF_Pro_Semibold",
  },
  infoValueWrap: { flex: 1.5 },
  infoValue: {
    fontSize: rf(12),
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Regular",
  },
  assignedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
    justifyContent: "flex-start",
  },
  assignedValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
    justifyContent: "flex-start",
  },
  initials: {
    width: 24,
    height: 24,
    borderRadius: 5,
    backgroundColor: "#00DEAB",
    alignItems: "center",
    justifyContent: "center",
  },
  initialsText: { fontSize: rf(10), fontWeight: "700", color: "#fff" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  badgeText: { fontSize: rf(11), fontFamily: "SF_Pro_Medium" },
  dependencyTableWrap: {
    marginTop: 18,
  },
  depPill: {
    backgroundColor: "#F0FFF8",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  depPillText: {
    fontSize: rf(11),
    color: "#00DEAB",
    fontFamily: "SF_Pro_Regular",
  },
  section: { marginTop: 16 },
  sectionTitle: {
    fontSize: rf(15),
    fontFamily: "SF_Pro_Medium",
    color: "#1D1D1D",
    marginBottom: 8,
  },
  descText: {
    fontSize: rf(12),
    color: "#1D1D1D",
    lineHeight: 18,
    fontFamily: "SF_Pro_Regular",
  },
  descBadgesRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  descBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    backgroundColor: "#1D1D1D",
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  descBadgeText: { fontSize: rf(11), color: "#fff" },
  attachHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  attachTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#1D1D1D",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 8,
  },
  attachTagText: {
    fontSize: rf(11),
    color: "#00DEAB",
    fontFamily: "SF_Pro_Regular",
  },
  tabContent: {
    flex: 1,
    minHeight: 0,
    backgroundColor: "#F9F9F9",
    borderTopRightRadius: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  tabComment: {
    flex: 1,
    backgroundColor: "#F9F9F9",
    borderTopLeftRadius: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  commentsContainer: { flex: 1, flexDirection: "column" },
  commentsList: { flex: 1 },
  commentsListContent: { gap: 12, paddingBottom: 16 },
  bubble: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#FFFFFF",
  },
  pinnedCard: {
    backgroundColor: "#E6FBF6",
    borderColor: "#E6FBF6",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  pinnedBottomPin: {
    marginTop: 10,
    alignSelf: "flex-start",
  },
  bubbleHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 5,
  },
  bubbleAvatar: {
    width: 20,
    height: 20,
    borderRadius: 5,
    backgroundColor: "#00DEAB",
    alignItems: "center",
    justifyContent: "center",
  },
  bubbleAvatarText: { fontSize: rf(10), fontWeight: "700", color: "#fff" },
  bubbleNameRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  bubbleName: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
  },
  bubbleTime: {
    fontSize: rf(9),
    color: "#D1D5DB",
    fontFamily: "SF_Pro_Regular",
  },
  pinIcon: { marginLeft: "auto" },
  bubbleText: {
    fontSize: rf(13),
    color: "#1D1D1D",
    lineHeight: 20,
    fontFamily: "SF_Pro_Regular",
  },
  bubbleActions: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    gap: 12,
  },
  reactionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    flexWrap: "wrap",
  },
  reactionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  reactionText: { fontSize: rf(12) },
  reactionCount: {
    fontSize: rf(10),
    color: "#6B7280",
    fontFamily: "SF_Pro_Regular",
  },
  actionBtn: { padding: 2 },
  inputBox: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    marginBottom: 16,
    position: "relative",
    backgroundColor: "#FFFFFF",
    marginTop: 8,
  },
  inputLabelWrap: {
    position: "absolute",
    top: -10,
    left: 12,
    backgroundColor: "#F9F9F9",
    paddingHorizontal: 6,
    zIndex: 10,
  },
  inputLabelText: {
    fontSize: rf(12),
    color: "#374151",
    fontFamily: "SF_Pro_Medium",
  },
  inputField: {
    fontSize: rf(13),
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Regular",
    minHeight: 36,
    maxHeight: 70,
    paddingTop: 2,
    paddingBottom: 2,
    textAlignVertical: "top",
  },
  inputToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  toolbarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  toolBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#00DEAB",
    alignItems: "center",
    justifyContent: "center",
  },
  mentionSuggestions: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E6E6E6",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
    overflow: "hidden",
    marginBottom: 8,
  },
  mentionSuggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  mentionAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#1D1D1D",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  mentionAvatarText: {
    color: "#fff",
    fontSize: rf(10),
    fontFamily: "SF_Pro_Bold",
  },
  mentionName: {
    flex: 1,
    fontSize: rf(14),
    fontFamily: "SF_Pro_Medium",
    color: "#1F2937",
  },
  emptyComments: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 100,
  },
  emptyCommentsText: {
    fontSize: rf(16),
    fontFamily: "SF_Pro_Regular",
    color: "#9CA3AF",
  },

  // ── Edit Mode Styles ──────────────────────────────────────────────
  titleHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  editHeaderBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#F0FDF9",
    borderWidth: 1,
    borderColor: "#00DEAB",
  },
  editHeaderBtnText: {
    fontSize: rf(13),
    fontFamily: "SF_Pro_Semibold",
    color: "#00DEAB",
  },
  editContainer: {
    gap: 14,
    paddingBottom: 20,
  },
  editHeaderBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  editHeaderTitle: {
    fontSize: rf(16),
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
  },
  cancelLinkText: {
    fontSize: rf(14),
    fontFamily: "SF_Pro_Regular",
    color: "#EF4444",
  },
  editBlock: {
    gap: 6,
  },
  editBlockLabel: {
    fontSize: rf(13),
    fontFamily: "SF_Pro_Semibold",
    color: "#4B5563",
  },
  editTitleInput: {
    fontSize: rf(16),
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
  },
  editDescBox: {
    fontSize: rf(14),
    fontFamily: "SF_Pro_Regular",
    color: "#1D1D1D",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    minHeight: 80,
    textAlignVertical: "top",
  },
  editRowInteractive: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 8,
  },
  editRowTitle: {
    fontSize: rf(13),
    fontFamily: "SF_Pro_Medium",
    color: "#6B7280",
    width: 120,
  },
  editRowValText: {
    flex: 1,
    fontSize: rf(13),
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
  },
  pillToggleBox: {
    flexDirection: "row",
    gap: 6,
  },
  pillToggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  pillToggleBtnActiveNormal: {
    backgroundColor: "#00DEAB",
    borderColor: "#00DEAB",
  },
  pillToggleBtnActiveCritical: {
    backgroundColor: "#FF4444",
    borderColor: "#FF4444",
  },
  pillToggleBtnActiveGray: {
    backgroundColor: "#E5E7EB",
    borderColor: "#E5E7EB",
  },
  pillToggleBtnText: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Medium",
    color: "#4B5563",
  },
  effortNumBox: {
    width: 60,
    fontSize: rf(13),
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#FFFFFF",
    textAlign: "center",
  },
  unitChipWrap: {
    flexDirection: "row",
    gap: 4,
  },
  unitChipItem: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  unitChipItemActive: {
    backgroundColor: "#1D1D1D",
    borderColor: "#1D1D1D",
  },
  unitChipItemText: {
    fontSize: rf(11),
    fontFamily: "SF_Pro_Medium",
    color: "#6B7280",
  },
  editSaveRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  editCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  editCancelBtnText: {
    fontSize: rf(14),
    fontFamily: "SF_Pro_Semibold",
    color: "#6B7280",
  },
  editSaveBtn: {
    flex: 2,
    flexDirection: "row",
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#00DEAB",
    alignItems: "center",
    justifyContent: "center",
  },
  editSaveBtnText: {
    fontSize: rf(14),
    fontFamily: "SF_Pro_Semibold",
    color: "#FFFFFF",
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
  popoverSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 38,
    marginBottom: 8,
  },
  popoverSearchInput: {
    flex: 1,
    fontSize: rf(13),
    fontFamily: "SF_Pro_Regular",
    color: "#1D1D1D",
    padding: 0,
  },
  popoverRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F9FAFB",
    borderRadius: 8,
  },
  popoverRowSelected: {
    backgroundColor: "#F0FDF9",
  },
  popoverRowText: {
    fontSize: rf(13),
    fontFamily: "SF_Pro_Regular",
    color: "#1F2937",
  },

  // ── Direct Inline Editing Styles ─────────────────────────────────────────
  editableTaskTitle: {
    fontSize: rf(16),
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
    marginBottom: 10,
    paddingVertical: 3,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  editableDescInput: {
    fontSize: rf(13),
    fontFamily: "SF_Pro_Regular",
    color: "#374151",
    lineHeight: 18,
    marginTop: 4,
    padding: 8,
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    minHeight: 56,
    textAlignVertical: "top",
  },
  taskPriorityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  taskPriorityBadgeNormal: {
    backgroundColor: "#E6FBF5",
  },
  taskPriorityBadgeCritical: {
    backgroundColor: "#FEE7E7",
  },
  taskPriorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  taskPriorityBadgeText: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Semibold",
  },
  inlineEffortInput: {
    width: 44,
    fontSize: rf(12),
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: "#FFFFFF",
    textAlign: "center",
  },
  inlineUnitChip: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  inlineUnitChipActive: {
    backgroundColor: "#1D1D1D",
    borderColor: "#1D1D1D",
  },
  inlineUnitChipText: {
    fontSize: rf(10),
    fontFamily: "SF_Pro_Medium",
    color: "#6B7280",
  },
});
