import assert from "node:assert/strict";
import test from "node:test";

import {
  latestProjectDependencyDate,
  requiresInProgressBeforeCompleted,
  shouldWarnProjectStatusCascade,
  validateProject,
  validateSprint,
} from "../../src/features/projects/utils/projectValidation";
import { sortProjectTasks } from "../../src/features/projects/utils/projectTaskSort";

test("project validation uses contract messages and due-date bounds", () => {
  const missing = validateProject({ name: "", dueDate: "" });
  assert.equal(missing.errors.name, "Project name is required");
  assert.equal(missing.errors.dueDate, "Due date is required for a project");

  const beforeSprint = validateProject({
    name: "P",
    dueDate: "2026-11-01",
    sprints: [{ name: "Sprint A", due_date: "2026-11-05" }],
  });
  assert.equal(beforeSprint.valid, false);
  assert.match(beforeSprint.errors.dueDate ?? "", /Sprint A/);

  const beforeTask = validateProject({
    name: "P",
    dueDate: "2026-11-01",
    tasks: [{ title: "Task A", due_date: "2026-11-05" }],
  });
  assert.equal(beforeTask.valid, false);
  assert.match(beforeTask.errors.dueDate ?? "", /Task A/);

  const valid = validateProject({
    name: "P",
    dueDate: "2026-11-06",
    sprints: [{ name: "Sprint A", due_date: "2026-11-05" }],
    tasks: [{ title: "Task A", due_date: "2026-11-05" }],
  });
  assert.equal(valid.valid, true);
});

test("latest project dependency date is the latest sprint/task due date", () => {
  assert.equal(
    latestProjectDependencyDate(
      [{ name: "S", due_date: "2026-11-03" }],
      [{ title: "T", due_date: "2026-11-05" }],
    ),
    "2026-11-05",
  );
  assert.equal(latestProjectDependencyDate([], []), null);
});

test("Completed transition guard does not block editing an already completed project", () => {
  assert.equal(requiresInProgressBeforeCompleted("Planning", "Completed"), true);
  assert.equal(requiresInProgressBeforeCompleted("On Hold", "Completed"), true);
  assert.equal(requiresInProgressBeforeCompleted("In Progress", "Completed"), false);
  assert.equal(requiresInProgressBeforeCompleted("Completed", "Completed"), false);
});

test("cascade warning only fires on status transitions that affect tasks", () => {
  assert.equal(shouldWarnProjectStatusCascade("In Progress", "Completed"), true);
  assert.equal(shouldWarnProjectStatusCascade("In Progress", "On Hold"), true);
  assert.equal(shouldWarnProjectStatusCascade("Completed", "Completed"), false);
  assert.equal(shouldWarnProjectStatusCascade("Planning", "In Progress"), false);
});

test("sprint validation uses the aligned project due-date message", () => {
  const result = validateSprint({
    name: "Sprint",
    dueDate: "2026-11-10",
    projectDueDate: "2026-11-01",
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.dueDate ?? "", /project due date/);
});

test("project tasks sort open -> critical -> due, then completed by completed_at desc", () => {
  const tasks = [
    { id: 1, status: "Pending", task_priority: "normal", due_date: "2026-11-02", completed_at: null },
    { id: 2, status: "Complete", task_priority: "normal", due_date: "2026-11-01", completed_at: "2026-11-01T10:00" },
    { id: 3, status: "Pending", task_priority: "critical", due_date: "2026-11-03", completed_at: null },
    { id: 4, status: "Complete", task_priority: "normal", due_date: "2026-11-04", completed_at: "2026-11-04T10:00" },
    { id: 5, status: "Pending", task_priority: "normal", due_date: "2026-11-01", completed_at: null },
  ];
  assert.deepEqual(
    sortProjectTasks(tasks).map((task) => task.id),
    [3, 5, 1, 4, 2],
  );
});
