import assert from "node:assert/strict";
import test from "node:test";

import {
  isCompletionReady,
  isDependencyCandidateStatus,
  isNewCriticalFirst,
  replacePlaceholderId,
  shouldRecalculateAfterStatus,
  shouldRouteAtsReopen,
  shouldRouteAtsResume,
} from "../../src/features/tasks/utils/taskActionRules";
import { validateDueDate } from "../../src/features/tasks/utils/taskValidation";
import { validateCreateTaskForm } from "../../src/features/tasks/components/create-task/createTaskValidation";
import {
  DEFAULT_CREATE_TASK_FORM,
  type CreateTaskFormState,
} from "../../src/features/tasks/components/create-task/createTaskTypes";

function form(overrides: Partial<CreateTaskFormState> = {}): CreateTaskFormState {
  return {
    ...DEFAULT_CREATE_TASK_FORM,
    title: "Task",
    assignTo: 9,
    dueDate: new Date(2026, 9, 30),
    status: "Pending",
    ...overrides,
  };
}

test("completion is only ready from active statuses", () => {
  assert.equal(isCompletionReady("In-Progress"), true);
  assert.equal(isCompletionReady("In Review"), true);
  assert.equal(isCompletionReady("Pending-Approval"), true);
  assert.equal(isCompletionReady("Pending"), false);
  assert.equal(isCompletionReady("Complete"), false);
});

test("ATS reopen/resume route only for the contract states", () => {
  assert.equal(shouldRouteAtsReopen("Complete", "In-Progress", true), true);
  assert.equal(shouldRouteAtsReopen("On-Hold", "Pending", true), true);
  assert.equal(shouldRouteAtsReopen("Complete", "Complete", true), false);
  assert.equal(shouldRouteAtsReopen("Complete", "In-Progress", false), false);

  assert.equal(shouldRouteAtsResume("Pending-Approval", "Pending", true), true);
  assert.equal(
    shouldRouteAtsResume("Pending-Approval", "In-Progress", true),
    true,
  );
  assert.equal(shouldRouteAtsResume("Pending-Approval", "Complete", true), false);
  assert.equal(shouldRouteAtsResume("Pending-Approval", "Pending", false), false);
});

test("ATS recalculate rules match the website safety net", () => {
  assert.equal(shouldRecalculateAfterStatus("In-Progress", "Complete", true), true);
  assert.equal(shouldRecalculateAfterStatus("Pending", "Pending", true), true);
  assert.equal(shouldRecalculateAfterStatus("On-Hold", "In-Progress", true), true);
  assert.equal(
    shouldRecalculateAfterStatus("Pending-Approval", "In-Progress", true),
    true,
  );
  assert.equal(shouldRecalculateAfterStatus("In-Progress", "Complete", false), false);
});

test("dependency candidates exclude complete/held/closed tasks", () => {
  assert.equal(isDependencyCandidateStatus("Pending"), true);
  assert.equal(isDependencyCandidateStatus("In-Progress"), true);
  assert.equal(isDependencyCandidateStatus("Rejected"), true);
  assert.equal(isDependencyCandidateStatus("Complete"), false);
  assert.equal(isDependencyCandidateStatus("Completed"), false);
  assert.equal(isDependencyCandidateStatus("On Hold"), false);
  assert.equal(isDependencyCandidateStatus("On-Hold"), false);
  assert.equal(isDependencyCandidateStatus("Closed"), false);
  assert.equal(isDependencyCandidateStatus("Cancelled"), false);
});

test("critical-order helpers decide bump and replace the placeholder id", () => {
  assert.equal(isNewCriticalFirst([-1, 4, 5], -1), true);
  assert.equal(isNewCriticalFirst([4, -1, 5], -1), false);
  assert.deepEqual(replacePlaceholderId([-1, 4, 5], -1, 99), [99, 4, 5]);
  assert.deepEqual(replacePlaceholderId([4, -1, 5], -1, 99), [4, 99, 5]);
});

test("detail due-date validation applies project/sprint/parent/subtask bounds", () => {
  assert.equal(
    validateDueDate("2026-11-10", { required: true }).valid,
    true,
  );
  assert.equal(
    validateDueDate("2026-11-10", { sprintDueDate: "2026-11-09" }).valid,
    false,
  );
  assert.equal(
    validateDueDate("2026-11-10", { projectDueDate: "2026-11-09" }).valid,
    false,
  );
  assert.equal(
    validateDueDate("2026-11-10", { parentDueDate: "2026-11-09" }).valid,
    false,
  );
  assert.equal(
    validateDueDate("2026-11-08", { subtaskDueDate: "2026-11-09" }).valid,
    false,
  );
  assert.equal(
    validateDueDate("2026-11-09", { sprintDueDate: "2026-11-09" }).valid,
    true,
  );
  assert.equal(validateDueDate("2026-11-01", { isAts: true }).valid, false);
});

test("create validation uses the contract combined required-fields message", () => {
  const result = validateCreateTaskForm(
    form({ title: "", assignTo: null, status: "" }),
    { isAts: false },
  );
  assert.equal(result.valid, false);
  assert.equal(
    result.message,
    "Please fill in required fields: Title, Assigned To, Status",
  );
});
