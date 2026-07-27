import {
  TaskStatus,
  UiTaskStatus,
  TaskListItem,
  TaskListResponse,
} from "@/types/task.types";

export type MappedTaskRow = {
  id: string;
  title: string;
  createdBy: string;
  createdByInitials: string;
  createdByAvatar?: string;
  assignedTo: string;
  assignedToInitials: string;
  assignedToAvatar?: string;
  dueDate: string;
  status: UiTaskStatus;
  priorityName: string;
  project: string;
  extraCount?: number;
  _raw: TaskListItem;
};

export function apiStatusToUi(status: TaskStatus): UiTaskStatus {
  if (status === "Complete") return "Completed";
  return status as UiTaskStatus;
}

export function uiStatusToApi(status: UiTaskStatus): TaskStatus {
  if (status === "Completed") return "Complete";
  return status as TaskStatus;
}

function getInitials(firstName: string, lastName: string): string {
  return ((firstName?.[0] ?? "") + (lastName?.[0] ?? "")).toUpperCase();
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    const day = d.getDate();
    const month = d.toLocaleString("en-US", { month: "short" });
    return `${day}, ${month}`;
  } catch {
    return dateStr;
  }
}

export function mapTaskListItem(item: TaskListItem): MappedTaskRow {
  const assigneeFirstName = item.task_assigned_to?.first_name ?? "";
  const assigneeName = item.task_assigned_to
    ? `${item.task_assigned_to.first_name} ${item.task_assigned_to.last_name}`.trim()
    : "";
  const assigneeInitials = item.task_assigned_to
    ? getInitials(item.task_assigned_to.first_name, item.task_assigned_to.last_name)
    : "";

  const creatorFirstName = item.task_assignee?.first_name ?? "";
  const creatorName = item.task_assignee
    ? `${item.task_assignee.first_name} ${item.task_assignee.last_name}`.trim()
    : "";
  const creatorInitials = item.task_assignee
    ? getInitials(item.task_assignee.first_name, item.task_assignee.last_name)
    : "";

  return {
    id: String(item.id),
    title: item.title,
    createdBy: creatorFirstName || (creatorName.length > 14 ? creatorName.slice(0, 14) + "..." : creatorName),
    createdByInitials: creatorInitials,
    createdByAvatar: item.task_assignee?.image,
    assignedTo: assigneeFirstName || (assigneeName.length > 14 ? assigneeName.slice(0, 14) + "..." : assigneeName),
    assignedToInitials: assigneeInitials,
    assignedToAvatar: item.task_assigned_to?.image,
    dueDate: formatDate(item.due_date),
    status: apiStatusToUi(item.status),
    priorityName: item.priority_name,
    project: "",
    extraCount: item.subtask_count > 0 ? item.subtask_count : undefined,
    _raw: item,
  };
}

export function mapTaskListResponse(
  response: TaskListResponse
): {
  assignedToMe: MappedTaskRow[];
  createdByMe: MappedTaskRow[];
  allOtherTasks: MappedTaskRow[];
} {
  return {
    assignedToMe: response.tasks_assigned_to_me.map(mapTaskListItem),
    createdByMe: response.tasksByme.map(mapTaskListItem),
    allOtherTasks: response.all_other_tasks.map(mapTaskListItem),
  };
}
