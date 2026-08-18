import {
  TaskStatus,
  UiTaskStatus,
  TaskListItem,
  TaskListResponse,
  TaskOwner,
} from "@/types/task.types";
import { formatShortDate } from "@/utils/dateFormat";

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
  taskPriority: "normal" | "critical";
  criticalOrder: number | null;
  project: string;
  _raw: TaskListItem;
};

type PersonLike = {
  first_name?: string;
  last_name?: string;
  full_name?: string;
  image?: string | null;
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

function getDisplayName(person?: PersonLike | null): string {
  if (!person) return "";
  const full = person.full_name?.trim();
  if (full) return full;
  return `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim();
}

function getInitialsFromPerson(person?: PersonLike | null): string {
  if (!person) return "";
  if (person.first_name || person.last_name) {
    return getInitials(person.first_name ?? "", person.last_name ?? "");
  }
  const parts = person.full_name?.trim().split(/\s+/) ?? [];
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0]?.[0]?.toUpperCase() ?? "";
}

function findOwner(taskOwners: TaskOwner[], id?: number) {
  if (!id) return undefined;
  return taskOwners.find((owner) => owner.id === id);
}

function truncateName(name: string): string {
  const first = name.split(/\s+/)[0] ?? "";
  return first || (name.length > 14 ? `${name.slice(0, 14)}...` : name);
}

function formatDate(dateStr: string): string {
  return formatShortDate(dateStr, { emptyPlaceholder: "" });
}

export function mapTaskListItem(
  item: TaskListItem,
  taskOwners: TaskOwner[] = []
): MappedTaskRow {
  const creator =
    item.task_assignee ?? findOwner(taskOwners, item.created_by);
  const assignee =
    item.task_assigned_to ?? findOwner(taskOwners, item.asigned_to);

  const creatorName = getDisplayName(creator);
  const assigneeName = getDisplayName(assignee);

  return {
    id: String(item.id),
    title: item.title,
    createdBy: truncateName(creatorName),
    createdByInitials: getInitialsFromPerson(creator),
    createdByAvatar: creator?.image ?? undefined,
    assignedTo: truncateName(assigneeName),
    assignedToInitials: getInitialsFromPerson(assignee),
    assignedToAvatar: assignee?.image ?? undefined,
    dueDate: formatDate(item.due_date),
    status: apiStatusToUi(item.status),
    priorityName: item.priority_name,
    taskPriority: item.task_priority,
    criticalOrder: item.critical_order ?? null,
    project: "",
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
  const owners = response.task_owner ?? [];

  return {
    assignedToMe: response.tasks_assigned_to_me.map((item) =>
      mapTaskListItem(item, owners)
    ),
    createdByMe: response.tasksByme.map((item) => mapTaskListItem(item, owners)),
    allOtherTasks: response.all_other_tasks.map((item) =>
      mapTaskListItem(item, owners)
    ),
  };
}
