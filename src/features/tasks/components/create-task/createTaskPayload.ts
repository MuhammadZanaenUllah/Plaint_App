import type { CreateTaskRequest, RecurringPeriod } from "@/features/tasks/types/task.types";
import { toMinutes } from "@/features/tasks/utils/taskEffort";
import { toCalendarDateOnly } from "@/features/tasks/utils/taskDate";
import { toApiStatus } from "@/features/tasks/utils/taskStatus";
import type {
  CreateTaskFormState,
  CreateTaskPayloadContext,
} from "./createTaskTypes";

/** The website only exposes these four periods (AUD-084). */
export function normalizeRecurringPeriod(
  period: RecurringPeriod | null,
): RecurringPeriod | null {
  return period;
}

const DAY_NAME_MAP: Record<string, string> = {
  mon: "monday",
  tue: "tuesday",
  wed: "wednesday",
  thu: "thursday",
  fri: "friday",
  sat: "saturday",
  sun: "sunday",
};

/**
 * The UI stores compact day labels ("Mon"); the backend expects lower-case
 * full names ("monday"). Case is ignored by the backend, abbreviations are not.
 */
export function toBackendDayName(day: string | null): string | null {
  if (!day) return null;
  const normalized = day.trim().toLowerCase();
  return DAY_NAME_MAP[normalized] ?? normalized;
}

function toBackendDayNames(days: string[]): string[] {
  return days
    .map((day) => toBackendDayName(day))
    .filter((day): day is string => !!day);
}

function integerOrZero(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableInteger(value: string): number | "" {
  if (!value.trim()) return "";
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : "";
}

export function buildCreateTaskPayload(
  form: CreateTaskFormState,
  ctx: CreateTaskPayloadContext,
  options?: { bumpToFront?: boolean },
): CreateTaskRequest {
  const priority =
    ctx.isAts && form.taskPriority === "critical" ? "critical" : "normal";
  const wantsBump =
    options?.bumpToFront ?? (ctx.isAts && priority === "critical");
  const period = normalizeRecurringPeriod(form.recurringPeriod);
  const isRecurring = form.isRecurring && !!period;

  const payload: CreateTaskRequest = {
    title: form.title.trim(),
    company_identifier: ctx.companyIdentifier,
    company_id: ctx.companyId,
    assign_to: Number(form.assignTo ?? 0),
    // Normal companies send a calendar day. ATS leaves due_date null and the
    // scheduling engine derives it from effort.
    due_date: ctx.isAts ? null : toCalendarDateOnly(form.dueDate),
    task_priority: priority,
    status: toApiStatus(form.status),
    description: form.description,
    is_recurring: isRecurring,
    // Contract §3.10 example: non-recurring sends "" / "09:00" / 0 / [].
    recurring_period: isRecurring ? period : "",
    recurring_time: isRecurring ? form.recurringTime || "09:00" : "09:00",
    recurring_total_count: isRecurring
      ? integerOrZero(form.recurringTotalCount)
      : 0,
    recurring_exclude_days:
      isRecurring && period === "daily"
        ? toBackendDayNames(form.recurringExcludeDays)
        : [],
    recurring_week_day:
      isRecurring && period === "weekly"
        ? (toBackendDayName(form.recurringWeekDay) ?? "")
        : "",
    recurring_month_date:
      isRecurring && period === "monthly"
        ? nullableInteger(form.recurringMonthDate)
        : "",
    recurring_annual_month:
      isRecurring && period === "annually"
        ? nullableInteger(form.recurringAnnualMonth)
        : "",
    recurring_annual_date:
      isRecurring && period === "annually"
        ? nullableInteger(form.recurringAnnualDate)
        : "",
    approval_required: form.approvalRequired ? 1 : 0,
    // The website sends 0 when no project is selected; null is also accepted.
    project_id: form.projectId ?? 0,
    sprint_id: form.sprintId ?? null,
    parent_id: form.parentId ?? 0,
  };

  // bump_to_front is only meaningful for an ATS critical task (AUD-017).
  if (ctx.isAts && priority === "critical" && wantsBump) {
    payload.bump_to_front = true;
  }

  if (ctx.isAts) {
    payload.effort_hours = toMinutes(form.effortValue, form.effortUnit);
    payload.effort_unit = form.effortUnit;
    payload.depends_on = form.dependsOn;
  }

  return payload;
}
