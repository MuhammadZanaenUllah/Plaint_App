import assert from "node:assert/strict";
import test from "node:test";

import { buildCreateTaskPayload } from "../../src/features/tasks/components/create-task/createTaskPayload";
import {
  DEFAULT_CREATE_TASK_FORM,
  type CreateTaskFormState,
} from "../../src/features/tasks/components/create-task/createTaskTypes";
import { buildUpdateTaskPayload } from "../../src/features/tasks/components/task-detail/taskUpdatePayload";
import type { TaskDetail } from "../../src/features/tasks/types/task.types";

const context = {
  companyId: 5,
  companyIdentifier: "acme",
  isAts: false,
};

function form(overrides: Partial<CreateTaskFormState> = {}): CreateTaskFormState {
  return {
    ...DEFAULT_CREATE_TASK_FORM,
    title: "Prepare report",
    assignTo: 9,
    dueDate: new Date(2026, 9, 30),
    status: "Pending",
    ...overrides,
  };
}

function detail(overrides: Partial<TaskDetail> = {}): TaskDetail {
  return {
    id: 42,
    title: "Prepare report",
    description: "<p>HTML</p>",
    status: "Pending",
    due_date: "2026-10-30T14:00",
    start_date: null,
    priority: "2",
    task_priority: "normal",
    critical_order: null,
    approval_required: 0,
    parent_id: 0,
    project_id: 3,
    sprint_id: null,
    module: "tasks",
    company_id: 5,
    asigned_to: 9,
    assignee: 7,
    created_by: 7,
    can_edit: true,
    can_edit_status: true,
    can_edit_subtask: true,
    is_recurring: false,
    recurring_period: null,
    recurring_time: null,
    recurring_total_count: 0,
    recurring_exclude_days: [],
    recurring_week_day: null,
    recurring_month_date: null,
    recurring_annual_month: null,
    recurring_annual_date: null,
    effort_hours: 90,
    effort_unit: "hours",
    completed_at: null,
    subtask_count: 0,
    sub_tasks: [],
    task_notes: [],
    task_notifications: [],
    task_notes_attachments: [],
    task_attachments: [],
    ...overrides,
  };
}

test("create payload uses YYYY-MM-DD and contract recurrence defaults", () => {
  const payload = buildCreateTaskPayload(form(), context);
  assert.equal(payload.due_date, "2026-10-30");
  assert.equal(payload.recurring_period, "");
  assert.equal(payload.recurring_time, "09:00");
  assert.equal(payload.recurring_total_count, 0);
  assert.deepEqual(payload.recurring_exclude_days, []);
  assert.equal(payload.recurring_week_day, "");
  assert.equal(payload.recurring_month_date, "");
  assert.equal(payload.recurring_annual_month, "");
  assert.equal(payload.recurring_annual_date, "");
  assert.equal("bump_to_front" in payload, false);
  assert.equal("effort_hours" in payload, false);
});

test("create payload maps recurrence days and only bumps ATS critical", () => {
  const recurring = buildCreateTaskPayload(
    form({
      isRecurring: true,
      recurringPeriod: "weekly",
      recurringWeekDay: "Mon",
      recurringTime: "10:30",
    }),
    context,
  );
  assert.equal(recurring.recurring_period, "weekly");
  assert.equal(recurring.recurring_week_day, "monday");
  assert.equal(recurring.recurring_time, "10:30");

  const atsCritical = buildCreateTaskPayload(
    form({ taskPriority: "critical" }),
    { ...context, isAts: true },
  );
  assert.equal(atsCritical.due_date, null);
  assert.equal(atsCritical.bump_to_front, true);
  assert.equal(atsCritical.task_priority, "critical");

  const wait = buildCreateTaskPayload(
    form({ taskPriority: "critical" }),
    { ...context, isAts: true },
    { bumpToFront: false },
  );
  assert.equal("bump_to_front" in wait, false);
});

test("update payload preserves creator, doer and HTML description", () => {
  const payload = buildUpdateTaskPayload(detail(), {}, context);
  assert.equal(payload.assign_to, 9);
  assert.equal(payload.description, "<p>HTML</p>");
  assert.equal(payload.due_date, "2026-10-30");
  assert.equal(payload.priority, 2);
  assert.equal(payload.recurring_period, "");
  assert.equal(payload.recurring_time, "09:00");
  assert.deepEqual(payload.recurring_exclude_days, []);
  assert.equal(payload.recurring_week_day, "");
  assert.equal(payload.recurring_month_date, "");
  assert.equal("bump_to_front" in payload, false);
  assert.equal("project_id" in payload, false);
});

test("update payload never invents a company priority", () => {
  const payload = buildUpdateTaskPayload(detail({ priority: "" }), {}, context);
  assert.equal("priority" in payload, false);
});

test("update payload sends bump_to_front only for ATS critical edits", () => {
  const normal = buildUpdateTaskPayload(
    detail(),
    { bump_to_front: true, task_priority: "critical" },
    context,
  );
  assert.equal("bump_to_front" in normal, false);

  const ats = buildUpdateTaskPayload(
    detail(),
    { bump_to_front: true, task_priority: "critical" },
    { ...context, isAts: true },
  );
  assert.equal(ats.bump_to_front, true);
  assert.equal(ats.due_date, null);
  assert.equal(ats.effort_hours, 90);
  assert.equal(ats.effort_unit, "hours");
});

test("update payload keeps recurring fields for recurring tasks", () => {
  const payload = buildUpdateTaskPayload(
    detail({
      is_recurring: true,
      recurring_period: "monthly",
      recurring_time: "08:15",
      recurring_total_count: 4,
      recurring_exclude_days: ["saturday"],
      recurring_month_date: "12",
    }),
    {},
    context,
  );
  assert.equal(payload.is_recurring, true);
  assert.equal(payload.recurring_period, "monthly");
  assert.equal(payload.recurring_time, "08:15");
  assert.equal(payload.recurring_total_count, 4);
  assert.deepEqual(payload.recurring_exclude_days, ["saturday"]);
  assert.equal(payload.recurring_month_date, 12);
});
