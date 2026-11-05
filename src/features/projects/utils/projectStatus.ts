import type { CanonicalProjectStatus } from "../types/project.types";

export const PROJECT_STATUSES: CanonicalProjectStatus[] = [
  "Planning",
  "In Progress",
  "On Hold",
  "Completed",
  "Abandoned",
];

export const PROJECT_STATUS_COLORS: Record<
  CanonicalProjectStatus,
  { bg: string; text: string }
> = {
  Planning: { bg: "#EFF6FF", text: "#3B82F6" },
  "In Progress": { bg: "#FEF3C7", text: "#D97706" },
  "On Hold": { bg: "#FFEDD5", text: "#C2410C" },
  Completed: { bg: "#ECFDF5", text: "#059669" },
  Abandoned: { bg: "#E5E7EB", text: "#4B5563" },
};

export function projectStatusStyle(status: string) {
  return (
    PROJECT_STATUS_COLORS[status as CanonicalProjectStatus] ?? {
      bg: "#E5E7EB",
      text: "#4B5563",
    }
  );
}

export function isOpenProjectTask(task: {
  parent_id?: number;
  status?: string;
}): boolean {
  if (Number(task.parent_id ?? 0) > 0) return false;
  const status = String(task.status ?? "");
  return status !== "Complete" && status !== "Completed" && status !== "Abandoned";
}
