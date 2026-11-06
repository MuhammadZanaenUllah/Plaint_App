import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_COLUMNS,
  getOwnerInitials,
  getTableMetrics,
  getTaskKey,
} from "../../src/features/tasks/components/list/taskTableLayout";
import type { TaskUpdateAction } from "../../src/features/tasks/socket/socket.types";

test("task table metrics keep the classic three-column layout fitted", () => {
  const metrics = getTableMetrics(390, DEFAULT_COLUMNS, false);
  assert.equal(metrics.needsHScroll, false);
  assert.equal(metrics.tableWidth, 390);
  assert.equal(metrics.fullTableWidth, 390);
  assert.equal(metrics.leadingWidth, 32);
  assert.equal(metrics.actionWidth, 26);
  assert.ok((metrics.columnWidths.title ?? 0) >= 85);
  assert.ok((metrics.columnWidths.dueDate ?? 0) >= 95);
});

test("custom column sets become horizontally scrollable at fixed widths", () => {
  const metrics = getTableMetrics(
    390,
    [
      "title",
      "createdBy",
      "assignedTo",
      "dueDate",
      "sprint",
      "project",
      "status",
    ],
    false,
  );
  assert.equal(metrics.needsHScroll, true);
  assert.equal(metrics.fullTableWidth, 1200);
  assert.equal(metrics.columnWidths.title, 220);
  assert.equal(metrics.columnWidths.status, 130);
});

test("contained tables use the inset width without edge compensation", () => {
  const metrics = getTableMetrics(390, DEFAULT_COLUMNS, true);
  assert.equal(metrics.tableWidth, 358);
  assert.equal(metrics.leftCompensation, 0);
});

test("task row keys fall back to stable index/title/date values", () => {
  assert.equal(getTaskKey({ id: 12 } as never, 0), 12);
  assert.equal(
    getTaskKey({ title: "Write", dueDate: "2026-11-06" } as never, 3),
    "3:Write:2026-11-06",
  );
});

test("owner initials use names then full names", () => {
  assert.equal(getOwnerInitials({ id: 1, first_name: "Ali", last_name: "Raza" }), "AR");
  assert.equal(getOwnerInitials({ id: 2, full_name: "Sara Khan" }), "SK");
  assert.equal(getOwnerInitials({ id: 3, full_name: "Madonna" }), "M");
});

test("feature task socket actions stay additive for status_change/critical_reorder", () => {
  const actions: TaskUpdateAction[] = ["status_change", "critical_reorder"];
  assert.deepEqual(actions, ["status_change", "critical_reorder"]);
});
