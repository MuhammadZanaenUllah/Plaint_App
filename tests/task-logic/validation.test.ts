import assert from "node:assert/strict";
import test from "node:test";

import {
  canMarkProjectCompleted,
  validateProject,
  validateSprint,
  validateSprintAssignment,
  validateSprintDateForTasks,
} from "../../src/features/projects/utils/projectValidation";
import {
  RECURRING_PERIODS,
} from "../../src/features/tasks/constants/taskConstants";
import {
  RECURRING_PERIOD_OPTIONS,
} from "../../src/features/tasks/components/create-task/createTaskTypes";
import { validateCreateTask } from "../../src/features/tasks/utils/taskValidation";

test("project validation requires name/due date and canonical statuses", () => {
  assert.equal(validateProject({}).valid, false);
  assert.equal(
    validateProject({ name: "P", dueDate: "2026-10-30", status: "In Progress" })
      .valid,
    true,
  );
  const invalidStatus = validateProject({
    name: "P",
    dueDate: "2026-10-30",
    status: "Pending",
  });
  assert.equal(invalidStatus.valid, false);
  assert.match(invalidStatus.errors.status ?? "", /Planning/);
});

test("sprint validation enforces project due-date bounds", () => {
  assert.equal(validateSprint({ name: "S" }).valid, false);
  assert.equal(
    validateSprint({ name: "S", dueDate: "2026-11-01" }).valid,
    true,
  );
  const afterProject = validateSprint({
    name: "S",
    dueDate: "2026-11-05",
    projectDueDate: "2026-11-01",
  });
  assert.equal(afterProject.valid, false);
  assert.match(afterProject.errors.dueDate ?? "", /project due date/);
});

test("sprint assignment/date checks compare PKT calendar days", () => {
  assert.equal(
    validateSprintAssignment("2026-11-01", "2026-11-02").valid,
    false,
  );
  assert.equal(
    validateSprintAssignment("2026-11-01", "2026-11-01").valid,
    true,
  );
  assert.equal(
    validateSprintDateForTasks("2026-11-01", ["2026-11-02"]).valid,
    false,
  );
  assert.equal(
    validateSprintDateForTasks("2026-11-02", ["2026-11-01"]).valid,
    true,
  );
});

test("completed project rule reports open tasks", () => {
  assert.equal(canMarkProjectCompleted(0).valid, true);
  assert.equal(canMarkProjectCompleted(2).valid, false);
});

test("recurring periods align with the website picker (AUD-084)", () => {
  assert.deepEqual(RECURRING_PERIODS, ["daily", "weekly", "monthly", "annually"]);
  assert.deepEqual(
    RECURRING_PERIOD_OPTIONS.map((option) => option.value),
    ["daily", "weekly", "monthly", "annually"],
  );

  const unsupported = validateCreateTask(
    {
      title: "T",
      assignTo: 9,
      dueDate: "2026-10-30",
      taskPriority: "normal",
      status: "Pending",
      isRecurring: true,
      // Deliberately unsupported value from old data.
      recurringPeriod: "quarterly" as never,
      recurringTime: "09:00",
    },
    { isAts: false },
  );
  assert.equal(unsupported.valid, false);
  assert.ok(unsupported.errors.recurrence);
});
