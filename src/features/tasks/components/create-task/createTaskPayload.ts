import type { CreateTaskRequest, RecurringPeriod } from "@/features/tasks/types/task.types";
import { toMinutes } from "@/features/tasks/utils/taskEffort";
import { toPktDateOnly } from "@/features/tasks/utils/taskDate";
import { toApiStatus } from "@/features/tasks/utils/taskStatus";
import type {
  CreateTaskFormState,
  CreateTaskPayloadContext,
} from "./createTaskTypes";

export function normalizeRecurringPeriod(
  period: RecurringPeriod | null,
): RecurringPeriod | null {
  if (period === "semi-annually") return "semiannually";
  return period;
}

function integerOrZero(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableInteger(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildCreateTaskPayload(
  form: CreateTaskFormState,
  ctx: CreateTaskPayloadContext,
  options?: { bumpToFront?: boolean },
): CreateTaskRequest {
  const priority =
    ctx.isAts && form.taskPriority === "critical" ? "critical" : "normal";
  const bumpToFront =
    options?.bumpToFront ??
    (ctx.isAts && priority === "critical");
  const period = normalizeRecurringPeriod(form.recurringPeriod);
  const payload: CreateTaskRequest = {
    title: form.title.trim(),
    company_identifier: ctx.companyIdentifier,
    company_id: ctx.companyId,
    assign_to: Number(form.assignTo ?? 0),
    due_date: ctx.isAts ? null : toPktDateOnly(form.dueDate),
    task_priority: priority,
    bump_to_front: ctx.isAts && priority === "critical" ? bumpToFront : false,
    status: toApiStatus(form.status),
    description: form.description,
    is_recurring: form.isRecurring,
    recurring_period: form.isRecurring ? period : null,
    recurring_time: form.isRecurring ? form.recurringTime || null : null,
    recurring_total_count: form.isRecurring
      ? integerOrZero(form.recurringTotalCount)
      : 0,
    recurring_exclude_days:
      form.isRecurring && period === "daily"
        ? form.recurringExcludeDays
        : [],
    recurring_week_day:
      form.isRecurring && period === "weekly"
        ? form.recurringWeekDay
        : null,
    recurring_month_date:
      form.isRecurring && period === "monthly"
        ? nullableInteger(form.recurringMonthDate)
        : null,
    recurring_annual_month:
      form.isRecurring && period === "annually"
        ? nullableInteger(form.recurringAnnualMonth)
        : null,
    recurring_annual_date:
      form.isRecurring && period === "annually"
        ? nullableInteger(form.recurringAnnualDate)
        : null,
    approval_required: form.approvalRequired ? 1 : 0,
    project_id: form.projectId ?? null,
    sprint_id: null,
    parent_id: form.parentId ?? 0,
  };

  if (ctx.isAts) {
    payload.effort_hours = toMinutes(form.effortValue, form.effortUnit);
    payload.effort_unit = form.effortUnit;
    payload.depends_on = form.dependsOn;
  }

  return payload;
}
