import type { UiTaskStatus } from "@/types/task.types";

export type StatusType = UiTaskStatus;

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
  taskPriority?: "normal" | "critical";
  comment?: string;
  project?: string;
  canEditStatus?: boolean;
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
};

export const PRIORITY_ACCENT_COLORS: Record<string, string> = {
  Normal: "#0DDFAB",
  Critical: "#FF4444",
  // High: "#CB5F00",
  // Medium: "#F5A623",
  // Low: "#00DEAB",
};

export const ALL_STATUSES: StatusType[] = [
  "Pending",
  "In-Progress",
  "Rejected",
  "Completed",
  "Pending-Approval",
  "Recurring",
];

