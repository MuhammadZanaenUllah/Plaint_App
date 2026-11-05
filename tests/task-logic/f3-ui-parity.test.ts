import assert from "node:assert/strict";
import test from "node:test";

import {
  attachmentDisplayName,
  buildProjectAttachmentPath,
  buildTaskAttachmentPath,
} from "../../src/features/tasks/utils/taskAttachmentPath";
import { selectAttachmentChips } from "../../src/features/tasks/utils/attachmentDisplay";
import { buildEffortHistoryRows } from "../../src/features/tasks/utils/effortHistory";
import { dependencyErrorMessage } from "../../src/features/tasks/utils/taskActionRules";
import { mapTaskListItem } from "../../src/utils/statusMapper";
import type { TaskListItem } from "../../src/features/tasks/types/task.types";

test("task/comment attachments use public/uploads/notes and projects use projects", () => {
  assert.equal(
    buildTaskAttachmentPath("report.pdf"),
    "public/uploads/notes/report.pdf",
  );
  assert.equal(
    buildTaskAttachmentPath("uploads/notes/report.pdf"),
    "public/uploads/notes/report.pdf",
  );
  assert.equal(
    buildTaskAttachmentPath("public/uploads/notes/report.pdf"),
    "public/uploads/notes/report.pdf",
  );
  assert.equal(
    buildProjectAttachmentPath("spec.docx"),
    "public/uploads/projects/spec.docx",
  );
  assert.equal(
    buildTaskAttachmentPath("https://cdn.example.com/file.pdf"),
    "https://cdn.example.com/file.pdf",
  );
  assert.equal(buildTaskAttachmentPath(""), "");
});

test("attachment display names keep original or strip the first dash prefix", () => {
  assert.equal(attachmentDisplayName("Original.pdf", "123-original.pdf"), "Original.pdf");
  assert.equal(attachmentDisplayName(undefined, "1730269500000-report.pdf"), "report.pdf");
  assert.equal(attachmentDisplayName("", "plain.pdf"), "plain.pdf");
});

test("attachment chips show three and report the hidden count", () => {
  const items = ["a", "b", "c", "d", "e"];
  const collapsed = selectAttachmentChips(items);
  assert.deepEqual(collapsed.visible, ["a", "b", "c"]);
  assert.equal(collapsed.hiddenCount, 2);

  const expanded = selectAttachmentChips(items, { expanded: true });
  assert.deepEqual(expanded.visible, items);
  assert.equal(expanded.hiddenCount, 0);
});

test("effort history renders before + delta = after with running totals", () => {
  const rows = buildEffortHistoryRows([
    {
      value: 60,
      unit: "minutes",
      action: "create",
      changed_at: "2026-10-01T09:00:00.000Z",
    },
    {
      value: 30,
      unit: "minutes",
      action: "delay_extension",
      changed_at: "2026-10-02T09:00:00.000Z",
    },
    {
      value: 120,
      unit: "minutes",
      action: "reopen",
      changed_at: "2026-10-03T09:00:00.000Z",
    },
  ]);
  assert.deepEqual(
    rows.map((row) => [row.before, row.delta, row.after]),
    [
      [0, 60, 60],
      [60, 30, 90],
      [0, 120, 120],
    ],
  );
});

test("circular dependency errors use the contract message", () => {
  assert.equal(
    dependencyErrorMessage("Circular dependency detected."),
    "Circular dependency: this would create a dependency loop",
  );
  assert.equal(dependencyErrorMessage(""), "Could not add dependency");
  assert.equal(dependencyErrorMessage("Server error"), "Server error");
});

test("task rows map project name and comment count from list fields", () => {
  const row = {
    id: 1,
    title: "Task",
    status: "Pending",
    due_date: "2026-10-30",
    priority: 1,
    task_priority: "normal",
    critical_order: null,
    assignee: 7,
    asigned_to: 9,
    parent_id: 0,
    company_id: 5,
    is_recurring: false,
    approval_required: 0,
    created_by: 7,
    module: "tasks",
    project_id: 3,
    project_name: "Alpha Project",
    sprint_id: null,
    subtask_count: 0,
    notes_count: 4,
    can_edit: true,
    can_edit_status: true,
    can_edit_subtask: true,
  } as unknown as TaskListItem;

  const mapped = mapTaskListItem(row, []);
  assert.equal(mapped.project, "Alpha Project");
  assert.equal(mapped.comment, "4");
});
