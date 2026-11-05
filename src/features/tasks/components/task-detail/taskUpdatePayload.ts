import type {
  TaskDetail,
  UpdateTaskRequest,
} from "@/features/tasks/types/task.types";
import { fromMinutes, toMinutes } from "@/features/tasks/utils/taskEffort";
import { toApiStatus } from "@/features/tasks/utils/taskStatus";

type Context = {
  companyId: number;
  companyIdentifier: string;
  isAts: boolean;
};

function numericId(value: unknown): number {
  if (typeof value === "object" && value !== null) {
    return Number((value as { id?: unknown }).id ?? 0);
  }
  return Number(value ?? 0);
}

function nullableInt(value: string | number | null | undefined): number | "" {
  if (value === null || value === undefined || value === "") return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : "";
}

/** Convert a /view due date (YYYY-MM-DD or YYYY-MM-DDTHH:mm) to YYYY-MM-DD. */
function toDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  return match ? `${match[1]}-${match[2]}-${match[3]}` : value;
}

/**
 * The website-equivalent full payload for POST /tasks/update/:id.
 * - `description` stays HTML.
 * - project_id / sprint_id are omitted (the endpoint would detach the task).
 * - effort is sent only for ATS, in minutes; `effort_unit` is display-only.
 * - status is sent as the current canonical status.
 * - priority is omitted rather than invented when /view has no id (AUD-015).
 * - bump_to_front is only sent for an ATS critical edit (AUD-017).
 */
export function buildUpdateTaskPayload(
  task: TaskDetail,
  overrides: Partial<UpdateTaskRequest>,
  ctx: Context,
): UpdateTaskRequest {
  const effortUnit =
    overrides.effort_unit ?? task.effort_unit ?? "hours";
  const effortValue =
    overrides.effort_hours ??
    fromMinutes(Number(task.effort_hours ?? 0), effortUnit as never);
  const effortMinutes = overrides.effort_hours !== undefined
    ? Number(overrides.effort_hours)
    : toMinutes(effortValue, effortUnit as never);

  const rawPriority = overrides.priority ?? task.priority;
  const priority = Number(rawPriority);

  const isRecurring = task.is_recurring ?? false;

  const payload: UpdateTaskRequest = {
    company_id: ctx.companyId,
    company_identifier: ctx.companyIdentifier,
    title: overrides.title ?? task.title ?? "",
    assign_to:
      overrides.assign_to ??
      numericId(task.asigned_to) ??
      0,
    due_date: ctx.isAts
      ? null
      : (overrides.due_date ?? toDateOnly(task.due_date)),
    status: toApiStatus(String(overrides.status ?? task.status ?? "Pending")),
    description: overrides.description ?? task.description ?? "",
    is_recurring: isRecurring,
    // Contract §3.10 example: non-recurring sends "" / "09:00" / 0 / [].
    recurring_period: isRecurring ? (task.recurring_period ?? "") : "",
    recurring_time: isRecurring ? (task.recurring_time ?? "09:00") : "09:00",
    recurring_total_count: isRecurring ? (task.recurring_total_count ?? 0) : 0,
    recurring_exclude_days: isRecurring ? (task.recurring_exclude_days ?? []) : [],
    recurring_week_day: isRecurring ? (task.recurring_week_day ?? "") : "",
    recurring_month_date: isRecurring
      ? nullableInt(task.recurring_month_date)
      : "",
    recurring_annual_month: isRecurring
      ? nullableInt(task.recurring_annual_month)
      : "",
    recurring_annual_date: isRecurring
      ? nullableInt(task.recurring_annual_date)
      : "",
    approval_required:
      overrides.approval_required ?? task.approval_required ?? 0,
    ...(ctx.isAts
      ? {
          effort_hours: Math.max(0, Math.round(effortMinutes)),
          effort_unit: effortUnit,
        }
      : {}),
    task_priority:
      overrides.task_priority ??
      (task.task_priority === "critical" ? "critical" : "normal"),
  };

  if (Number.isFinite(priority) && priority > 0) {
    payload.priority = priority;
  }

  if (ctx.isAts && overrides.bump_to_front === true) {
    payload.bump_to_front = true;
  }

  return payload;
}
