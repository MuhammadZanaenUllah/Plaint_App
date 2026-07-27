import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export type StatusType =
  | "Pending"
  | "In-Progress"
  | "Rejected"
  | "Completed"
  | "Pending-Approval"
  | "Recurring"
  | "On-Hold";

export type TaskRowProps = {
  id?: string;
  title: string;
  createdBy: string;
  createdByInitials: string;
  createdByAvatar?: string;
  assignedTo: string;
  assignedToInitials: string;
  assignedToAvatar?: string;
  dueDate: string;
  status: StatusType;
  priorityName?: string;
  comment?: string;
  project?: string;
  extraCount?: number;
  isOpen?: boolean;
  onOpenRequest?: () => void;
  onClose?: () => void;
  onPress?: () => void;
};

export const STATUS_COLORS: Record<StatusType, { bg: string; text: string }> = {
  Pending: { bg: "#FEF3C7", text: "#D97706" },
  "In-Progress": { bg: "#DBEAFE", text: "#2563EB" },
  Rejected: { bg: "#FEE2E2", text: "#DC2626" },
  Completed: { bg: "#D1FAE5", text: "#059669" },
  "Pending-Approval": { bg: "#EDE9FE", text: "#7C3AED" },
  Recurring: { bg: "#F0FDF4", text: "#16A34A" },
  "On-Hold": { bg: "#0DDFD820", text: "#0DDFD8" },
};

export const PRIORITY_ACCENT_COLORS: Record<string, string> = {
  High: "#CB5F00",
  Medium: "#F5A623",
  Low: "#00DEAB",
};

const ALL_STATUSES: StatusType[] = [
  "Pending",
  "In-Progress",
  "Rejected",
  "Completed",
  "Pending-Approval",
  "Recurring",
  "On-Hold",
];

export const COL_WIDTHS = {
  spacer: 28,
  title: 200,
  createdBy: 120,
  assignedTo: 120,
  dueDate: 100,
  status: 130,
  comment: 80,
  project: 90,
};

export default function TaskRow({
  title,
  createdBy,
  createdByInitials,
  assignedTo,
  assignedToInitials,
  dueDate,
  status: initialStatus,
  priorityName,
  project,
  extraCount,
  isOpen = false,
  onOpenRequest,
  onClose,
  onPress,
}: TaskRowProps) {
  const [status, setStatus] = useState<StatusType>(initialStatus);
  const { bg, text } = STATUS_COLORS[status];
  const isCompleted = status === "Completed";
  const accentColor = PRIORITY_ACCENT_COLORS[priorityName ?? ""] ?? "#00DEAB";

  // Left offset of the status cell inside the row
  const statusLeft =
    COL_WIDTHS.spacer +
    COL_WIDTHS.title +
    COL_WIDTHS.createdBy +
    COL_WIDTHS.assignedTo +
    COL_WIDTHS.dueDate;

  return (
    <View style={styles.wrap}>
      {/* ── Row ── */}
      <View style={styles.row}>
        <View style={[styles.accent, { backgroundColor: accentColor }]} />

        {/* Check / Checkbox */}
        <View style={{ width: COL_WIDTHS.spacer - 3, alignItems: "center" }}>
          {isCompleted ? (
            <View style={styles.checkCircle}>
              <Ionicons name="checkmark" size={12} color="#fff" />
            </View>
          ) : (
            <View style={styles.checkbox} />
          )}
        </View>

        {/* Title */}
        <TouchableOpacity
          style={[styles.titleCell, { width: COL_WIDTHS.title }]}
          onPress={onPress}
          activeOpacity={0.7}
        >
          <Text
            style={[styles.titleText, isCompleted && styles.strikethrough]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {extraCount ? (
            <View style={styles.extraBadge}>
              <Ionicons name="copy-outline" size={11} color="#6B7280" />
              <Text style={styles.extraText}>+{extraCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>

        {/* Created By */}
        <View style={[styles.userCell, { width: COL_WIDTHS.createdBy }]}>
          <View style={styles.initials}>
            <Text style={styles.initialsText}>{createdByInitials}</Text>
          </View>
          <Text style={styles.cellText} numberOfLines={1}>
            {createdBy}
          </Text>
        </View>

        {/* Assigned To */}
        <View style={[styles.userCell, { width: COL_WIDTHS.assignedTo }]}>
          <View style={[styles.initials, styles.initialsAssigned]}>
            <Text style={styles.initialsText}>{assignedToInitials}</Text>
          </View>
          <Text style={styles.cellText} numberOfLines={1}>
            {assignedTo}
          </Text>
        </View>

        {/* Due Date */}
        <View style={[styles.dateCell, { width: COL_WIDTHS.dueDate }]}>
          <Ionicons
            name="calendar-outline"
            size={15}
            color="#00DEAB"
            style={{ marginRight: 4 }}
          />
          <Text style={styles.cellText}>{dueDate}</Text>
        </View>

        {/* Status pill */}
        <TouchableOpacity
          style={[
            styles.statusCell,
            { width: COL_WIDTHS.status, backgroundColor: bg },
          ]}
          onPress={(e) => {
            e.stopPropagation();
            if (isOpen) {
              onClose?.();
            } else {
              onOpenRequest?.();
            }
          }}
          activeOpacity={0.8}
        >
          <Text style={[styles.statusText, { color: text }]} numberOfLines={2}>{status.replace("Pending-Approval", "Pending-\nApproval")}</Text>
          <Ionicons
            name={isOpen ? "chevron-up" : "chevron-down"}
            size={15}
            color={text}
          />
        </TouchableOpacity>

        {/* Comment */}
        <View style={styles.commentCell}>
          <Ionicons name="chatbox-outline" size={18} color="#D1D5DB" />
        </View>

        {/* Project */}
        <View style={{ width: COL_WIDTHS.project }}>
          <Text style={styles.cellText} numberOfLines={1}>
            {project ?? ""}
          </Text>
        </View>
      </View>

      {/* ── Dropdown — absolutely above the row, aligned to status column ── */}
      {isOpen && (
        <View
          style={[
            styles.dropdown,
            { left: statusLeft, width: 100 },
          ]}
        >
          {ALL_STATUSES.map((s) => (
            <TouchableOpacity
              key={s}
              style={[
                styles.dropdownItem,
                s === status && styles.dropdownItemActive,
              ]}
              onPress={() => {
                setStatus(s);
                onClose?.();
              }}
            >
              <View
                style={[styles.dot, { backgroundColor: STATUS_COLORS[s].text }]}
              />
              <Text
                style={{
                  fontSize: 12,
                  fontFamily: "SF_Pro_Regular",
                  flex: 1,
                  color: STATUS_COLORS[s].text,
                }}
              >
                {s.replace("Pending-Approval", "Pending-\nApproval")}
              </Text>
              {s === status && (
                <Ionicons
                  name="checkmark"
                  size={13}
                  color={STATUS_COLORS[s].text}
                />
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    backgroundColor: "#fff",
  },
  accent: {
    width: 3.5,
    height: 28,
    borderRadius: 4,
    marginRight: 6,
  },
  checkCircle: {
    width: 17,
    height: 17,
    borderRadius: 4,
    backgroundColor: "#00DEAB",
    alignItems: "center",
    justifyContent: "center",
  },
  checkbox: {
    width: 17,
    height: 17,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    backgroundColor: "#fff",
  },
  titleCell: { flexDirection: "row", alignItems: "center", paddingRight: 8 },
  titleText: {
    fontSize: 12.5,
    color: "#1F2937",
    flexShrink: 1,
    fontFamily: "SF_Pro_Medium",
  },
  strikethrough: { textDecorationLine: "line-through", color: "#9CA3AF" },
  extraBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 6,
  },
  extraText: { fontSize: 11, color: "#6B7280", marginLeft: 2 },
  userCell: { flexDirection: "row", alignItems: "center", paddingRight: 8 },
  initials: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#00DEAB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  initialsAssigned: { backgroundColor: "#00DEAB" },
  initialsText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  cellText: {
    fontSize: 12.5,
    color: "#1F2937",
    flexShrink: 1,
    fontFamily: "SF_Pro_Medium",
  },
  dateCell: { flexDirection: "row", alignItems: "center", paddingRight: 8 },
  statusCell: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginRight: 8,
  },
  statusText: { fontSize: 11.5, fontWeight: "600" },
  commentCell: {
    // paddingLeft: 10,
    width: COL_WIDTHS.comment,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  // Dropdown floats BELOW the row, overlays rows underneath
  dropdown: {
    position: "absolute",
    top: 52,
    zIndex: 9999,
    elevation: 9999,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    overflow: "hidden",
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    height: 40,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  dropdownItemActive: { backgroundColor: "#F0FDF9" },
  dot: { width: 5, height: 5, borderRadius: 4, marginRight: 5 },
  dropdownText: { fontSize: 12, fontFamily: "SF_Pro_Regular", flex: 1 },
});
