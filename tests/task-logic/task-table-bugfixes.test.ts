import assert from "node:assert/strict";
import test from "node:test";

import { getTaskIdentityKey } from "../../src/features/tasks/components/list/taskTableLayout";
import type { TaskRowProps } from "../../src/components/TaskRow";
import { resolveSwipeSettle } from "../../src/features/tasks/utils/taskSwipeSettle";

function row(overrides: Partial<TaskRowProps> = {}): TaskRowProps {
  return {
    id: "1",
    title: "Task",
    createdBy: "Creator",
    createdByInitials: "C",
    assignedTo: "Doer",
    assignedToInitials: "D",
    dueDate: "2026-11-06",
    status: "Pending",
    ...overrides,
  } as TaskRowProps;
}

test("row interaction identity uses task ids and ignores row position", () => {
  assert.equal(getTaskIdentityKey(row({ id: "42" })), "task:42");
  assert.equal(
    getTaskIdentityKey(row({ id: undefined, _raw: { id: 77 } as never })),
    "task:77",
  );

  const noId = row({
    id: undefined,
    title: "No ID",
    dueDate: "2026-11-07",
    assignedTo: "A",
    createdBy: "B",
  });
  assert.equal(getTaskIdentityKey(noId), getTaskIdentityKey(noId));
  assert.equal(getTaskIdentityKey(noId), "fallback:No ID|2026-11-07|A|B");
});

test("swipe settle closes on small releases and rightward velocity", () => {
  const base = { contentWidth: 390, actionWidth: 176 };
  assert.equal(
    resolveSwipeSettle({ ...base, startX: 0, releaseX: -10, velocityX: 0 }),
    null,
  );
  assert.equal(
    resolveSwipeSettle({ ...base, startX: -200, releaseX: -200, velocityX: 500 }),
    null,
  );
});

test("swipe settle snaps to actions and details at the existing thresholds", () => {
  const base = { contentWidth: 390, actionWidth: 176 };
  assert.equal(
    resolveSwipeSettle({ ...base, startX: 0, releaseX: -100, velocityX: 0 }),
    "actions",
  );
  assert.equal(
    resolveSwipeSettle({ ...base, startX: 0, releaseX: -300, velocityX: 0 }),
    "details",
  );
  assert.equal(
    resolveSwipeSettle({ ...base, startX: -250, releaseX: -200, velocityX: 0 }),
    "actions",
  );
});
