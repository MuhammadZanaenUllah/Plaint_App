import { rf } from "@/utils/responsive";
/**
 * CriticalTaskModal.tsx
 *
 * Two modals for the critical-task assignment flow:
 *
 * 1. CriticalTaskPopUpModal
 *    Shown when the target assignee already has ≥1 active critical task.
 *    Lets the user choose:
 *      - Option A: "Stop current task now & start this critical task immediately"
 *      - Option B: "Wait for current task to finish, then schedule this critical task"
 *
 * 2. OrderCriticalTasksModal
 *    Shown after choosing Option A.
 *    Displays a numbered list of the assignee's current critical tasks with the new
 *    task pinned at position #1.  Users can reorder the remaining tasks by tapping
 *    move-up / move-down arrows, then confirm to call POST /tasks/reorder-critical.
 */

import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { formatClockTime } from "@/utils/dateFormat";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CriticalTask {
  id: number;
  title: string;
  /** assignee display name */
  assignedTo?: string;
  /** ISO date string */
  dueDate?: string;
  status?: string;
}

// ── 1. Pop-up Modal ──────────────────────────────────────────────────────────

export interface CriticalTaskPopUpProps {
  visible: boolean;
  onClose: () => void;
  /** Called when user picks "stop & start immediately" */
  onStopAndStart: () => void;
  /** Called when user picks "wait for current task to finish" */
  onWaitAndSchedule: () => void;
}

export function CriticalTaskPopUpModal({
  visible,
  onClose,
  onStopAndStart,
  onWaitAndSchedule,
}: CriticalTaskPopUpProps) {
  // Rendered as a plain absolutely-positioned overlay instead of a native
  // <Modal> — this is shown while CreateTaskModal's own sheet is still
  // open, and nesting a native Modal on top of an open sheet/modal is
  // unreliable on iOS (it silently fails to present; Android tolerates it).
  // The caller must render this as a sibling inside CreateTaskModal's own
  // BottomSheetModal content tree, not as a separately-mounted <Modal>.
  if (!visible) return null;
  return (
      <View style={[popup.overlay, popup.absoluteOverlay]}>
        <View style={popup.card}>
          {/* Close */}
          <TouchableOpacity style={popup.closeBtn} onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={17} color="#6B7280" />
          </TouchableOpacity>

          {/* Title */}
          <Text style={popup.title}>Set Critical Priority</Text>

          {/* Subtitle */}
          <Text style={popup.subtitle}>
            Critical tasks are scheduled before all normal tasks. How should the
            engine handle the assignee's current task?
          </Text>

          {/* Option A – highlighted */}
          <TouchableOpacity
            style={popup.optionA}
            activeOpacity={0.85}
            onPress={onStopAndStart}
          >
            <Text style={popup.optionAText}>
              Stop current task now &amp; start this critical task immediately
            </Text>
          </TouchableOpacity>

          {/* Option B – neutral */}
          <TouchableOpacity
            style={popup.optionB}
            activeOpacity={0.85}
            onPress={onWaitAndSchedule}
          >
            <Text style={popup.optionBText}>
              Wait for current task to finish, then schedule this critical task
            </Text>
          </TouchableOpacity>
        </View>
      </View>
  );
}

const popup = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  absoluteOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    width: "100%",
    maxWidth: 380,
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 22,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14,
  },
  closeBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: rf(18),
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: rf(13),
    fontFamily: "SF_Pro_Regular",
    color: "#6B7280",
    lineHeight: 19,
    marginBottom: 20,
  },
  optionA: {
    borderWidth: 1.5,
    borderColor: "#FF4B4B",
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 12,
    backgroundColor: "#FFF5F5",
  },
  optionAText: {
    fontSize: rf(14),
    fontFamily: "SF_Pro_Semibold",
    color: "#E53535",
    lineHeight: 20,
  },
  optionB: {
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: "#F9FAFB",
  },
  optionBText: {
    fontSize: rf(14),
    fontFamily: "SF_Pro_Regular",
    color: "#374151",
    lineHeight: 20,
  },
});

// ── 2. Order Critical Tasks Modal ─────────────────────────────────────────────

export interface OrderCriticalTasksProps {
  visible: boolean;
  /** The newly added critical task (will be pinned at #1) */
  newTask: CriticalTask;
  /** Existing critical tasks for this assignee (excluding the new one) */
  existingCriticalTasks: CriticalTask[];
  /** Called on back / close */
  onClose: () => void;
  /** Called with the confirmed orderedIds after user confirms */
  onConfirm: (orderedIds: number[]) => Promise<void>;
}

function formatDueDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const mon = d.toLocaleString("en-US", { month: "short" });
  return `${d.getDate()} ${mon}, ${formatClockTime(d)}`;
}

export function OrderCriticalTasksModal({
  visible,
  newTask,
  existingCriticalTasks,
  onClose,
  onConfirm,
}: OrderCriticalTasksProps) {
  // orderedList: [newTask, ...existingCriticalTasks] – newTask is fixed at index 0
  const [orderedList, setOrderedList] = useState<CriticalTask[]>([]);
  const [loading, setLoading] = useState(false);

  // Rebuild list whenever modal opens or props change
  useEffect(() => {
    if (visible) {
      setOrderedList([newTask, ...existingCriticalTasks]);
    }
  }, [visible, newTask, existingCriticalTasks]);

  const moveUp = useCallback((index: number) => {
    if (index <= 1) return; // 0 = newTask (pinned), 1 can't move above newTask
    setOrderedList((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }, []);

  const moveDown = useCallback((index: number) => {
    setOrderedList((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }, []);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm(orderedList.map((t) => t.id));
    } finally {
      setLoading(false);
    }
  };

  // Same reasoning as CriticalTaskPopUpModal above: plain absolute overlay,
  // not a nested native Modal — caller must render this as a sibling inside
  // CreateTaskModal's own BottomSheetModal content tree.
  if (!visible) return null;
  return (
      <View style={[order.overlay, order.absoluteOverlay]}>
        <View style={order.sheet}>
          {/* Header */}
          <View style={order.header}>
            <TouchableOpacity style={order.backBtn} onPress={onClose} hitSlop={8}>
              <Ionicons name="chevron-back" size={20} color="#1D1D1D" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={order.headerTitle}>Order Critical Tasks</Text>
              <Text style={order.headerSub}>
                Drag to set the execution order. Top = highest priority.
              </Text>
            </View>
            <TouchableOpacity style={order.closeIcon} onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={18} color="#6B7280" />
            </TouchableOpacity>
          </View>

          {/* Table header */}
          <View style={order.tableHead}>
            <Text style={[order.thCell, { flex: 2 }]}>Task Title</Text>
            <Text style={[order.thCell, { flex: 1, textAlign: "center" }]}>
              Assigned To
            </Text>
            <Text style={[order.thCell, { flex: 1.1, textAlign: "right" }]}>
              Due Date
            </Text>
            <View style={{ width: 64 }} />
          </View>

          {/* Task rows */}
          <ScrollView
            style={{ maxHeight: 340 }}
            showsVerticalScrollIndicator={false}
          >
            {orderedList.map((task, index) => {
              const isNew = task.id === newTask.id;
              const canMoveUp = index > 1;
              const canMoveDown = index < orderedList.length - 1;

              return (
                <View
                  key={task.id}
                  style={[order.row, isNew && order.rowHighlight]}
                >
                  {/* Rank badge */}
                  <View style={[order.rankBadge, isNew && order.rankBadgeNew]}>
                    <Text style={order.rankText}>{index + 1}</Text>
                  </View>

                  {/* Title */}
                  <View style={{ flex: 2, paddingRight: 8 }}>
                    <Text
                      style={[order.cellTitle, isNew && order.cellTitleNew]}
                      numberOfLines={2}
                    >
                      {task.title}
                    </Text>
                    {isNew && (
                      <Text style={order.newTag}>Being edited now</Text>
                    )}
                  </View>

                  {/* Assigned to */}
                  <Text
                    style={[order.cellText, { flex: 1, textAlign: "center" }]}
                    numberOfLines={1}
                  >
                    {task.assignedTo ?? "—"}
                  </Text>

                  {/* Due date */}
                  <View
                    style={{
                      flex: 1.1,
                      flexDirection: "row",
                      justifyContent: "flex-end",
                      alignItems: "center",
                      gap: 3,
                    }}
                  >
                    {task.dueDate ? (
                      <>
                        <Ionicons name="calendar-outline" size={11} color="#00DEAB" />
                        <Text style={order.dueDateText}>
                          {formatDueDate(task.dueDate)}
                        </Text>
                      </>
                    ) : (
                      <Text style={order.cellText}>—</Text>
                    )}
                  </View>

                  {/* Up / Down controls */}
                  <View style={order.controls}>
                    {!isNew && (
                      <>
                        <TouchableOpacity
                          onPress={() => moveUp(index)}
                          disabled={!canMoveUp}
                          hitSlop={6}
                          style={[
                            order.controlBtn,
                            !canMoveUp && order.controlBtnDisabled,
                          ]}
                        >
                          <Ionicons
                            name="chevron-up"
                            size={16}
                            color={canMoveUp ? "#1D1D1D" : "#D1D5DB"}
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => moveDown(index)}
                          disabled={!canMoveDown}
                          hitSlop={6}
                          style={[
                            order.controlBtn,
                            !canMoveDown && order.controlBtnDisabled,
                          ]}
                        >
                          <Ionicons
                            name="chevron-down"
                            size={16}
                            color={canMoveDown ? "#1D1D1D" : "#D1D5DB"}
                          />
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* Confirm button */}
          <TouchableOpacity
            style={[order.confirmBtn, loading && { opacity: 0.7 }]}
            activeOpacity={0.85}
            onPress={handleConfirm}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={order.confirmText}>Confirm Order</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
  );
}

const order = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.42)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  absoluteOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
  },
  sheet: {
    backgroundColor: "#fff",
    borderRadius: 20,
    width: "100%",
    maxWidth: 520,
    paddingTop: 20,
    paddingBottom: Platform.OS === "ios" ? 28 : 20,
    paddingHorizontal: 18,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 18,
    gap: 10,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  closeIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  headerTitle: {
    fontSize: rf(17),
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
  },
  headerSub: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Regular",
    color: "#9CA3AF",
    marginTop: 2,
  },
  tableHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    marginBottom: 4,
  },
  thCell: {
    fontSize: rf(11),
    fontFamily: "SF_Pro_Semibold",
    color: "#9CA3AF",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginBottom: 4,
    backgroundColor: "#F9FAFB",
    gap: 6,
  },
  rowHighlight: {
    backgroundColor: "#F0FDF8",
    borderWidth: 1,
    borderColor: "#00DEAB33",
  },
  rankBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#E5E7EB",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 6,
  },
  rankBadgeNew: {
    backgroundColor: "#00DEAB",
  },
  rankText: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Semibold",
    color: "#fff",
  },
  cellTitle: {
    fontSize: rf(13),
    fontFamily: "SF_Pro_Regular",
    color: "#1D1D1D",
  },
  cellTitleNew: {
    fontFamily: "SF_Pro_Semibold",
    color: "#059669",
  },
  cellText: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Regular",
    color: "#6B7280",
  },
  newTag: {
    fontSize: rf(11),
    fontFamily: "SF_Pro_Regular",
    color: "#00DEAB",
    marginTop: 2,
  },
  dueDateText: {
    fontSize: rf(11),
    fontFamily: "SF_Pro_Regular",
    color: "#00DEAB",
  },
  controls: {
    width: 56,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 2,
  },
  controlBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  controlBtnDisabled: {
    backgroundColor: "#FAFAFA",
  },
  confirmBtn: {
    backgroundColor: "#00DEAB",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  confirmText: {
    color: "#fff",
    fontSize: rf(15),
    fontFamily: "SF_Pro_Semibold",
  },
});
