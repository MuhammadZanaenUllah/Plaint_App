import { useAuth } from "@/hooks/useAuth";
import { useTasks } from "@/hooks/useTasks";
import { TaskNote, ViewTaskData, DependencyData, TaskAttachment, SubTask } from "@/types/task.types";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { STATUS_COLORS, StatusType } from "./TaskRow";
import { getSocket, onSocketEvent, type TaskUpdatePayload } from "@/services/socket/socketService";

export type SubTaskDisplay = { title: string; createdBy: string; dueDate: string };

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
  subtasks: SubTaskDisplay[];
  dependencies: SubTaskDisplay[];
  description: string;
  attachments: string[];
  subtaskCount?: number;
  taskId?: number;
  companyId?: number;
  canEditStatus?: boolean;
  projectName?: string;
  effortHours?: number;
  effortUnit?: string;
};

type Props = { visible: boolean; onClose: () => void; task: TaskDetail | null };

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  Normal: { bg: "#0DDFAB", text: "#1D1D1D" },
  Critical: { bg: "#FF4444", text: "#fff" },
  Urgent: { bg: "#CB5F00", text: "#fff" },
  High: { bg: "#EF4444", text: "#fff" },
  Medium: { bg: "#F59E0B", text: "#fff" },
  Low: { bg: "#10B981", text: "#fff" },
};

const COL = { title: 160, createdBy: 130, dueDate: 110 };

function SectionTable({ title, rows, showAdd }: { title: string; rows: SubTaskDisplay[]; showAdd?: boolean }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always">
        <View>
          <View style={styles.tblHeader}>
            <View style={{ width: 14 }} />
            <Text style={[styles.tblHeadCell, { width: COL.title }]}>Task Title</Text>
            <Text style={[styles.tblHeadCell, { width: COL.createdBy }]}>Created By</Text>
            <Text style={[styles.tblHeadCell, { width: COL.dueDate }]}>Due Date</Text>
          </View>
          {rows.map((row, i) => (
            <View key={i} style={styles.tblRow}>
              <View style={styles.tblAccent} />
              <Text style={[styles.tblCell, { width: COL.title }]} numberOfLines={1}>{row.title}</Text>
              <View style={[styles.tblCreatedBy, { width: COL.createdBy }]}>
                <View style={styles.tblAvatar} />
                <Text style={styles.tblCell}>{row.createdBy}</Text>
              </View>
              <View style={[styles.tblDueDate, { width: COL.dueDate }]}>
                <Ionicons name="calendar-outline" size={14} color="#00DEAB" style={{ marginRight: 4 }} />
                <Text style={styles.tblCell}>{row.dueDate}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
      {showAdd && (
        <View style={styles.addRow}>
          <TouchableOpacity style={styles.addBtn}>
            <Ionicons name="add" size={20} color="#000" />
          </TouchableOpacity>
          <Text style={styles.addRowText}>Touch the add for create a subtask</Text>
        </View>
      )}
    </View>
  );
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
      /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/
    );
    if (match) {
      const [, year, month, day, hour = "0", minute = "0", second = "0"] = match;
      d = new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second)
      );
    } else {
      match = dateStr.match(
        /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/
      );
      if (match) {
        const [, day, month, year, hour = "0", minute = "0", second = "0"] = match;
        d = new Date(
          Number(year),
          Number(month) - 1,
          Number(day),
          Number(hour),
          Number(minute),
          Number(second)
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

      <Text style={styles.bubbleText}>{comment.notes}</Text>
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

      <Text style={styles.bubbleText}>{comment.notes}</Text>

      {comment.reactions && comment.reactions.length > 0 && (
        <View style={styles.reactionsRow}>
          {comment.reactions.map((r, i) => (
            <View key={i} style={styles.reactionBadge}>
              <Text style={styles.reactionText}>{r.emoji}</Text>
              <Text style={styles.reactionCount}>{r.user_name.split(" ")[0]}</Text>
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
          <Ionicons
            name="ellipsis-vertical"
            size={15}
            color="#9CA3AF"
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function formatApiDate(dateStr: string): string {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getDate()}, ${d.toLocaleString("en-US", { month: "short" })}`;
  } catch {
    return dateStr;
  }
}

function formatApiDateTime(dateStr: string): string {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const date = `${d.getDate()}, ${d.toLocaleString("en-US", { month: "short" })}`;
    const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    return `${date} ${time}`;
  } catch {
    return dateStr;
  }
}

export default function TaskDetailModal({ visible, onClose, task }: Props) {
  const { state: authState } = useAuth();
  const { state: taskState, addNote, fetchNotes, deleteNote, pinNote, viewTask: viewTaskApi, getDependencies } = useTasks();

  const [activeTab, setActiveTab] = useState<"details" | "comments">("details");
  const [commentText, setCommentText] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [notes, setNotes] = useState<TaskNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [sendingNote, setSendingNote] = useState(false);
  const [taskDetail, setTaskDetail] = useState<ViewTaskData | null>(null);
  const [dependencies, setDependencies] = useState<DependencyData[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

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
    if (!task?.taskId) return;
    setNotesLoading(true);
    try {
      const fetched = await fetchNotes(
        task.taskId,
        companyId,
        companyIdentifier,
      );
      // Remove any pin-based ordering from backend so comments are always in normal/original order
      const originalOrdered = [...fetched].sort((a, b) => a.id - b.id);
      
      // Ensure only ONE message is marked as pinned if backend returned multiple
      const pinnedList = originalOrdered.filter((n) => n.pin_top === 1);
      if (pinnedList.length > 1) {
        const latestPinnedId = pinnedList[pinnedList.length - 1].id;
        const sanitized = originalOrdered.map((n) => ({
          ...n,
          pin_top: n.id === latestPinnedId ? 1 : 0,
        }));
        setNotes(sanitized);
      } else {
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
      setActiveTab("details");
      setTaskDetail(null);
      setDependencies([]);
      if (task?.taskId) {
        loadTaskDetail();
        loadDependencies();
      }
    }
  }, [visible, task?.taskId, loadTaskDetail, loadDependencies]);

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
      const eventTaskId = (p.data as Record<string, unknown>)?.task_id ?? (p.data as Record<string, unknown>)?.id;
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

  const handleSendComment = async () => {
    if (!commentText.trim() || !task?.taskId) return;
    setSendingNote(true);
    try {
      await addNote(task.taskId, {
        notes: commentText.trim(),
        company_id: companyId,
        company_identifier: companyIdentifier,
      });
      setCommentText("");
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
    const previouslyPinnedNote = newPinnedState === 1
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
      })
    );

    try {
      // Unpin previous note on backend if pinning a new message
      if (previouslyPinnedNote) {
        pinNote(previouslyPinnedNote.id, false, companyId, companyIdentifier).catch(() => {});
      }
      await pinNote(note.id, newPinnedState === 1, companyId, companyIdentifier);
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
  const currentUserId = authState.user?.id ?? 0;

  const pinnedNotes = notes.filter((n) => n.pin_top === 1);

  // Use taskDetail data from ViewTask API response, fall back to props
  const apiTask = taskDetail?.task;

  // Resolve user names — created_by/asigned_to can be a number (lookup in taskOwners) or an object (inline user info)
  const resolveUserName = (idOrObj: number | { id?: number; first_name?: string; last_name?: string; full_name?: string } | null | undefined): string => {
    if (!idOrObj) return "-";
    if (typeof idOrObj === "object") {
      const u = idOrObj;
      return u.full_name || [u.first_name, u.last_name].filter(Boolean).join(" ") || `User #${u.id ?? "?"}`;
    }
    const owner = taskState.taskOwners?.find((o) => o.id === idOrObj);
    if (owner) return owner.full_name || `${owner.first_name} ${owner.last_name}`.trim();
    return `User #${idOrObj}`;
  };

  const createdByName = apiTask ? resolveUserName(apiTask.created_by) : "-";
  const assignedToName = apiTask ? resolveUserName(apiTask.asigned_to) : task.assignedTo;
  const assignedToInitials = apiTask
    ? (assignedToName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "??")
    : task.assignedToInitials;

  const dueDateDisplay = apiTask ? formatApiDateTime(apiTask.due_date) : task.dueDate;
  const startDateDisplay = apiTask ? (apiTask.start_date ? formatApiDateTime(apiTask.start_date) : "-") : "-";

  const subtasks: SubTaskDisplay[] = apiTask?.sub_tasks?.map((st) => ({
    title: st.title,
    createdBy: "",
    dueDate: formatApiDate(st.due_date),
  })) ?? task.subtasks;

  const depDisplay: SubTaskDisplay[] = dependencies.length > 0
    ? dependencies.map((d) => ({
        title: d.title,
        createdBy: d.assigned_to?.full_name ?? "",
        dueDate: formatApiDate(d.due_date),
      }))
    : task.dependencies;

  const attachmentFiles: string[] = apiTask?.task_attachments?.map((a) => a.attachment) ?? task.attachments;
  const effortDisplay = apiTask ? `${apiTask.effort_hours} ${apiTask.effort_unit}` : (task.effortHours ? `${task.effortHours} ${task.effortUnit ?? "minutes"}` : "-");
  const projectDisplay = apiTask?.project_name ?? task.projectName ?? "-";

  // Recurring detail string from API
  const recurringDetail = apiTask
    ? apiTask.is_recurring
      ? [
          apiTask.recurring_period && `Period: ${apiTask.recurring_period}`,
          apiTask.recurring_time && `Time: ${apiTask.recurring_time}`,
          apiTask.recurring_total_count > 0 && `Count: ${apiTask.recurring_total_count}`,
        ]
          .filter(Boolean)
          .join(", ") || "Yes"
      : "No"
    : task.recurringTask;

  const priorityDisplayName = apiTask?.priority ?? task.priority;
  const taskPriorityDisplay = apiTask?.task_priority ?? null;

  const INFO_ROWS: {
    icon: string;
    label: string;
    value: React.ReactNode;
  }[] = [
    {
      icon: "person-outline",
      label: "Created By:",
      value: <Text style={styles.infoValue}>{createdByName}</Text>,
    },
    {
      icon: "people-outline",
      label: "Assigned To:",
      value: (
        <View style={styles.assignedRow}>
          <View style={styles.initials}>
            <Text style={styles.initialsText}>{assignedToInitials}</Text>
          </View>
          <Text style={styles.infoValue}>{assignedToName}</Text>
        </View>
      ),
    },
    {
      icon: "calendar-outline",
      label: "Est. Completion:",
      value: <Text style={styles.infoValue}>{dueDateDisplay}</Text>,
    },
    {
      icon: "calendar-outline",
      label: "Start Time:",
      value: <Text style={styles.infoValue}>{startDateDisplay}</Text>,
    },
    {
      icon: "checkmark-done-outline",
      label: "Status:",
      value: (
        <View style={[styles.badge, { backgroundColor: statusStyle.bg }]}>
          <Text style={[styles.badgeText, { color: statusStyle.text }]}>
            {task.status}
          </Text>
        </View>
      ),
    },
    {
      icon: "star-outline",
      label: "Task Priority:",
      value: taskPriorityDisplay ? (
        <View style={[styles.badge, { backgroundColor: taskPriorityDisplay === "critical" ? "#FF4444" : "#0DDFAB" }]}>
          <Text style={[styles.badgeText, { color: "#fff" }]}>
            {taskPriorityDisplay === "critical" ? "Critical" : "Normal"}
          </Text>
        </View>
      ) : (
        <Text style={styles.infoValue}>-</Text>
      ),
    },
    {
      icon: "time-outline",
      label: "Effort:",
      value: <Text style={styles.infoValue}>{effortDisplay}</Text>,
    },
    {
      icon: "checkmark-circle-outline",
      label: "Approval Required:",
      value: <Text style={styles.infoValue}>{apiTask ? (apiTask.approval_required ? "Yes" : "No") : task.approvalRequired}</Text>,
    },
    {
      icon: "sync-circle-outline",
      label: "Recurring:",
      value: <Text style={styles.infoValue}>{recurringDetail}</Text>,
    },
    {
      icon: "link-outline",
      label: "Attachments:",
      value: apiTask ? (
        <View style={styles.cntBadgeGray}>
          <Ionicons name="link-outline" size={14} color="#fff" />
          <Text style={styles.cntBadgeText}>+{apiTask.task_attachments.length}</Text>
        </View>
      ) : (
        <Text style={styles.infoValue}>-</Text>
      ),
    },
    {
      icon: "git-compare-outline",
      label: "Dependencies:",
      value: depDisplay.length > 0 ? (
        <Text style={styles.depLink}>{depDisplay[0].title}</Text>
      ) : (
        <Text style={styles.infoValue}>-</Text>
      ),
    },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={16} color="#fff" />
            </TouchableOpacity>

            <View style={styles.tabs}>
              <TouchableOpacity
                style={[
                  styles.tab,
                  activeTab === "details" && styles.tabActive,
                ]}
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
                style={[
                  styles.tab,
                  activeTab === "comments" && styles.tabActive,
                ]}
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
                  <ActivityIndicator size="small" color="#00DEAB" style={{ marginTop: 40 }} />
                ) : (
                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.detailsScroll}
                    keyboardShouldPersistTaps="handled"
                  >
                    {subtasks.length > 0 && (
                      <View style={styles.cntBadge}>
                        <MaterialCommunityIcons
                          name="file-tree-outline"
                          size={14}
                          color="#fff"
                        />
                        <Text style={styles.cntBadgeText}>
                          +{subtasks.length}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.taskTitle}>{task.title}</Text>

                    {INFO_ROWS.map((row, i) => (
                      <View key={i} style={styles.infoRow}>
                        <View style={styles.infoLabelWrap}>
                          <Ionicons
                            name={row.icon as any}
                            size={16}
                            color="#AAAAAA"
                            style={{ marginRight: 6 }}
                          />
                          <Text style={styles.infoLabel}>{row.label}</Text>
                        </View>
                        <View style={styles.infoValueWrap}>{row.value}</View>
                      </View>
                    ))}

                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>Description</Text>
                      <Text style={styles.descText}>
                        {(apiTask?.description ?? task.description).replace(/<[^>]*>/g, "")}
                      </Text>
                      <View style={styles.descBadgesRow}>
                        {subtasks.length > 0 && (
                          <View style={styles.descBadge}>
                            <MaterialCommunityIcons
                              name="file-tree-outline"
                              size={13}
                              color="#00DFAB"
                            />
                            <Text
                              style={[
                                styles.descBadgeText,
                                { color: "#00DFAB" },
                              ]}
                            >
                              +{subtasks.length}
                            </Text>
                          </View>
                        )}
                        {attachmentFiles.length > 0 && (
                          <View style={styles.descBadge}>
                            <Ionicons
                              name="link-outline"
                              size={13}
                              color="#fff"
                            />
                            <Text style={styles.descBadgeText}>
                              +{attachmentFiles.length}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>

                    {subtasks.length > 0 && (
                      <SectionTable
                        title="Subtask"
                        rows={subtasks}
                        showAdd
                      />
                    )}

                    {depDisplay.length > 0 && (
                      <SectionTable
                        title="Dependencies"
                        rows={depDisplay}
                      />
                    )}

                    {attachmentFiles.length > 0 && (
                      <View style={styles.section}>
                        <View style={styles.attachHeader}>
                          <Text style={styles.sectionTitle}>Attachments</Text>
                          <View style={styles.cntBadgeGray}>
                            <MaterialCommunityIcons
                              name="file-tree-outline"
                              size={13}
                              color="#fff"
                            />
                            <Text style={styles.cntBadgeText}>
                              +{attachmentFiles.length}
                            </Text>
                          </View>
                        </View>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                        >
                          {attachmentFiles.map((a, i) => (
                            <View key={i} style={styles.attachTag}>
                              <Ionicons
                                name="download-outline"
                                size={13}
                                color="#00DEAB"
                              />
                              <Text style={styles.attachTagText}>{a}</Text>
                              <Ionicons name="close" size={13} color="#00DEAB" />
                            </View>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </ScrollView>
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

                <View style={[
                  styles.inputBox,
                  {
                    borderColor: isFocused ? "#1D1D1D" : "#E5E7EB",
                  },
                ]}>
                  {(isFocused || commentText.length > 0) && (
                    <View style={styles.inputLabelWrap}>
                      <Text style={styles.inputLabelText}>Comment</Text>
                    </View>
                  )}
                  <TextInput
                    style={styles.inputField}
                    value={commentText}
                    onChangeText={setCommentText}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    multiline
                    placeholder={!isFocused && commentText.length === 0 ? "Comment" : ""}
                    placeholderTextColor="#9CA3AF"
                    textAlignVertical="top"
                  />
                  <View style={styles.inputToolbar}>
                    <View style={styles.toolbarLeft}>
                      <TouchableOpacity style={styles.toolBtn}>
                        <Ionicons name="add" size={16} color="#374151" />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.toolBtn}>
                        <Ionicons name="at" size={16} color="#374151" />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.toolBtn}>
                        <Ionicons
                          name="happy-outline"
                          size={16}
                          color="#374151"
                        />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.toolBtn}>
                        <Ionicons
                          name="mic-outline"
                          size={16}
                          color="#374151"
                        />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.toolBtn}>
                        <Ionicons
                          name="videocam-outline"
                          size={16}
                          color="#374151"
                        />
                      </TouchableOpacity>
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
          </View>
        </View>
      </KeyboardAvoidingView>
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
    paddingTop: 16,
    paddingHorizontal: 4,
    maxHeight: "92%",
    flex: 1,
  },
  closeBtn: {
    alignSelf: "flex-end",
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#1D1D1D",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
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
  tabActiveText: { fontSize: 14, color: "#1D1D1D", fontFamily: "SF_Pro_Semibold" },
  tabInactiveText: { fontSize: 14, color: "#E6E6E6", fontFamily: "SF_Pro_Semibold" },
  tabDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#00DEAB" },
  detailsScroll: { paddingBottom: 40, paddingTop: 16 },
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
  cntBadgeText: { fontSize: 12, color: "#fff", fontFamily: "SF_Pro_Regular" },
  taskTitle: {
    fontSize: 18,
    fontFamily: "SF_Pro_Medium",
    color: "#1D1D1D",
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  infoLabelWrap: { flexDirection: "row", alignItems: "center", flex: 1.2 },
  infoLabel: { fontSize: 12, color: "#AAAAAA", fontFamily: "SF_Pro_Semibold" },
  infoValueWrap: { flex: 1.5 },
  infoValue: { fontSize: 13, color: "#AAAAAA", fontFamily: "SF_Pro_Regular" },
  assignedRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  initials: {
    width: 24,
    height: 24,
    borderRadius: 5,
    backgroundColor: "#00DEAB",
    alignItems: "center",
    justifyContent: "center",
  },
  initialsText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  badge: {
    borderRadius: 5,
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  badgeText: { fontSize: 12, fontFamily: "SF_Pro_Medium" },
  depLink: {
    fontSize: 13,
    backgroundColor: "#F0FFF8",
    maxWidth: 100,
    padding: 5,
    borderRadius: 5,
    textAlign: "center",
    color: "#00DEAB",
    fontFamily: "SF_Pro_Regular",
  },
  section: { marginTop: 24 },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "SF_Pro_Medium",
    color: "#1D1D1D",
    marginBottom: 12,
  },
  descText: {
    fontSize: 12,
    color: "#1D1D1D",
    lineHeight: 22,
    fontFamily: "SF_Pro_Regular",
  },
  descBadgesRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  descBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    backgroundColor: "#1D1D1D",
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  descBadgeText: { fontSize: 12, color: "#fff" },
  tblHeader: {
    flexDirection: "row",
    backgroundColor: "#E6E6E6",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginBottom: 2,
    alignItems: "center",
  },
  tblHeadCell: {
    fontSize: 12,
    fontFamily: "SF_Pro_Medium",
    color: "#1D1D1D",
    paddingRight: 8,
  },
  tblRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    backgroundColor: "#fff",
  },
  tblAccent: {
    width: 3,
    alignSelf: "stretch",
    borderRadius: 5,
    backgroundColor: "#EF4444",
    marginRight: 8,
  },
  tblCell: {
    fontSize: 12,
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Regular",
    paddingRight: 8,
  },
  tblCreatedBy: { flexDirection: "row", alignItems: "center", gap: 6 },
  tblAvatar: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: "#D1D5DB",
  },
  tblDueDate: { flexDirection: "row", alignItems: "center" },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
  },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#00DEAB",
    alignItems: "center",
    justifyContent: "center",
  },
  addRowText: {
    fontSize: 13,
    color: "#C0C0C0",
    fontFamily: "SF_Pro_Regular",
  },
  attachHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  attachTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#1D1D1D",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: 8,
  },
  attachTagText: {
    fontSize: 12,
    color: "#00DEAB",
    fontFamily: "SF_Pro_Regular",
  },
  tabContent: {
    flex: 1,
    backgroundColor: "#F9F9F9",
    borderTopRightRadius: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
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
  bubbleAvatarText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  bubbleNameRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  bubbleName: {
    fontSize: 12,
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
  },
  bubbleTime: {
    fontSize: 9,
    color: "#D1D5DB",
    fontFamily: "SF_Pro_Regular",
  },
  pinIcon: { marginLeft: "auto" },
  bubbleText: {
    fontSize: 13,
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
  reactionText: { fontSize: 12 },
  reactionCount: { fontSize: 10, color: "#6B7280", fontFamily: "SF_Pro_Regular" },
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
    fontSize: 12,
    color: "#374151",
    fontFamily: "SF_Pro_Medium",
  },
  inputField: {
    fontSize: 13,
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
  emptyComments: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 100,
  },
  emptyCommentsText: {
    fontSize: 16,
    fontFamily: "SF_Pro_Regular",
    color: "#9CA3AF",
  },

});
