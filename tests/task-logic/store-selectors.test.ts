import assert from "node:assert/strict";
import test from "node:test";

import type { TaskEntity } from "../../src/features/tasks/types/task.types";
import type { TasksState } from "../../src/features/tasks/store/tasksStore";
import {
  applyTaskFilters,
  selectTabCounts,
  selectTasksForTab,
  sortTasks,
} from "../../src/features/tasks/store/selectors";
import { matchesTaskSearch } from "../../src/features/tasks/utils/taskSearch";
import { parseTaskDate } from "../../src/features/tasks/utils/taskDate";
import {
  moveTaskToBucket,
  removeTaskFromBuckets,
  resolveTaskBucket,
  retainRecentIds,
} from "../../src/features/tasks/utils/taskBuckets";
import { applyLocalTaskUpdate } from "../../src/features/tasks/utils/taskLocalPatch";
import { createRequestTracker } from "../../src/features/tasks/utils/requestGeneration";
import { listWithStaleRetry } from "../../src/features/tasks/utils/staleRetry";
import {
  buildSchedulePatch,
  mergeSchedulePatch,
} from "../../src/features/tasks/socket/schedulePatch";

type TabState = Pick<
  TasksState,
  | "byId"
  | "assignedToMeIds"
  | "createdByMeIds"
  | "allOtherTaskIds"
  | "recurringIds"
  | "pendingApprovalIds"
  | "completedIds"
  | "completeCount"
>;

function task(overrides: Partial<TaskEntity> = {}): TaskEntity {
  return {
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
    project_id: null,
    sprint_id: null,
    subtask_count: 0,
    notes_count: 0,
    can_edit: true,
    can_edit_status: true,
    can_edit_subtask: true,
    ...overrides,
  };
}

const now = parseTaskDate("2026-10-30T12:00") as Date;

test("search/filter/sort helpers are pure and status-normalized", () => {
  const onHold = task({
    id: 1,
    status: "On Hold" as TaskEntity["status"],
    task_priority: "critical",
  });
  assert.equal(
    applyTaskFilters([onHold], {
      status: "On-Hold",
      priority: null,
      createdBy: [],
      assignedTo: [],
      dueFrom: null,
      dueTo: null,
      searchQuery: "",
    }).length,
    1,
  );
  assert.equal(
    applyTaskFilters([onHold], {
      status: null,
      priority: "critical",
      createdBy: [7],
      assignedTo: [9],
      dueFrom: "2026-10-01",
      dueTo: "2026-10-31",
      searchQuery: "task",
    }).length,
    1,
  );
  const searchable = task({ title: "Prepare Weekly Report", project_name: "Alpha" });
  assert.equal(matchesTaskSearch(searchable, "weekly"), true);
  assert.equal(matchesTaskSearch(searchable, "prepare"), true);
});

test("sort groups subtasks under their parent before due-date sort", () => {
  const parent = task({ id: 1, due_date: "2026-10-30" });
  const child = task({ id: 2, due_date: "2026-10-29", parent_id: 1 });
  const other = task({ id: 3, due_date: "2026-10-31" });
  assert.deepEqual(
    sortTasks([other, child, parent]).map((entry) => entry.id),
    [1, 2, 3],
  );
});

test("sort uses critical_order as a tie-breaker so reorder is visible", () => {
  const second = task({ id: 1, task_priority: "critical", critical_order: 2 });
  const first = task({ id: 2, task_priority: "critical", critical_order: 1 });
  const normal = task({ id: 3, task_priority: "normal" });
  assert.deepEqual(
    sortTasks([second, normal, first]).map((entry) => entry.id),
    [2, 1, 3],
  );
});

test("created/assigned tabs exclude Complete and Pending-Approval rows", () => {
  const state: TabState = {
    byId: {
      1: task({ id: 1, status: "Pending" }),
      2: task({ id: 2, status: "Complete" }),
      3: task({ id: 3, status: "Pending-Approval" }),
      4: task({ id: 4, status: "Pending" }),
      5: task({ id: 5, status: "Complete" }),
      6: task({ id: 6, status: "Pending-Approval" }),
    },
    assignedToMeIds: [1, 2, 3],
    createdByMeIds: [4, 5],
    allOtherTaskIds: [6],
    recurringIds: [],
    pendingApprovalIds: [],
    completedIds: [],
    completeCount: 0,
  };

  assert.deepEqual(
    selectTasksForTab(state, "assigned", now).map((entry) => entry.id),
    [1],
  );
  assert.deepEqual(
    selectTasksForTab(state, "created", now).map((entry) => entry.id),
    [4],
  );

  const counts = selectTabCounts(state, now);
  assert.equal(counts.assigned, 1);
  assert.equal(counts.created, 1);
  assert.equal(counts.all, 2);
  assert.equal(counts.pendingApproval, 2);
  assert.equal(counts.completed, 2);
});

test("completed count uses the server total when filters are inactive", () => {
  const state: TabState = {
    byId: { 1: task({ id: 1, status: "Complete" }) },
    assignedToMeIds: [],
    createdByMeIds: [],
    allOtherTaskIds: [],
    recurringIds: [],
    pendingApprovalIds: [],
    completedIds: [1],
    completeCount: 9123,
  };

  const counts = selectTabCounts(state, now);
  assert.equal(counts.completed, 9123);
});

test("bucket helpers move tasks without leaking across buckets", () => {
  assert.equal(
    resolveTaskBucket({ created_by: 7, assignee: 7, asigned_to: 9 }, 7),
    "createdByMe",
  );
  assert.equal(
    resolveTaskBucket({ created_by: 7, assignee: 7, asigned_to: 7 }, 7),
    "assignedToMe",
  );
  assert.equal(
    resolveTaskBucket({ created_by: 7, asigned_to: 9 }, 8),
    "allOtherTasks",
  );

  const moved = moveTaskToBucket(
    {
      assignedToMeIds: [1, 2],
      createdByMeIds: [2, 3],
      allOtherTaskIds: [2, 4],
    },
    2,
    "createdByMe",
  );
  assert.deepEqual(moved.assignedToMeIds, [1]);
  assert.deepEqual([...moved.createdByMeIds].sort(), [2, 3]);
  assert.deepEqual(moved.allOtherTaskIds, [4]);

  const removed = removeTaskFromBuckets(moved, 2);
  assert.deepEqual(removed.createdByMeIds, [3]);
});

test("completed retention keeps only the most recent rows", () => {
  const ids = Array.from({ length: 250 }, (_, index) => index + 1);
  const retained = retainRecentIds(ids, 200);
  assert.equal(retained.length, 200);
  assert.equal(retained[0], 51);
  assert.equal(retained[retained.length - 1], 250);
});

test("local update preserves creator and only changes the doer", () => {
  const before = {
    id: 1,
    title: "Old",
    assignee: 7,
    asigned_to: 8,
    status: "Pending",
    due_date: "2026-10-30",
  };
  const after = applyLocalTaskUpdate(before, {
    assign_to: 9,
    status: "On Hold",
    title: "Updated",
  });
  assert.equal(after.assignee, 7);
  assert.equal(after.asigned_to, 9);
  assert.equal(after.status, "On-Hold");
  assert.equal(after.title, "Updated");
  assert.equal(after.due_date, "2026-10-30");
});

test("stale retry keeps stale data when the fresh retry fails", async () => {
  const calls: boolean[] = [];
  const kept = await listWithStaleRetry(async (waitFresh) => {
    calls.push(waitFresh);
    if (!waitFresh) return { ok: true, stale: true, value: "stale" };
    return { ok: false, message: "fresh failed", value: "" };
  });
  assert.deepEqual(calls, [false, true]);
  assert.equal(kept.ok, true);
  assert.equal((kept as { value?: string }).value, "stale");

  const freshCalls: boolean[] = [];
  const fresh = await listWithStaleRetry(async (waitFresh) => {
    freshCalls.push(waitFresh);
    return waitFresh
      ? { ok: true, stale: false, value: "fresh" }
      : { ok: true, stale: true, value: "stale" };
  });
  assert.deepEqual(freshCalls, [false, true]);
  assert.equal((fresh as { value?: string }).value, "fresh");
});

test("request generation ignores outdated responses per endpoint key", () => {
  const tracker = createRequestTracker();
  const first = tracker.begin("filter:complete");
  const second = tracker.begin("filter:complete");
  assert.equal(tracker.isCurrent(first), false);
  assert.equal(tracker.isCurrent(second), true);

  const other = tracker.begin("filter:recurring");
  assert.equal(tracker.isCurrent(second), true);
  assert.equal(tracker.isCurrent(other), true);
  tracker.clear("filter:complete");
  assert.equal(tracker.isCurrent(second), false);
});

test("schedule patches only carry present keys and never overwrite with undefined", () => {
  const built = buildSchedulePatch({ id: 1, due_date: null });
  assert.deepEqual(built, { due_date: null });

  const merged = mergeSchedulePatch(
    { due_date: "2026-10-30", effort_hours: 120 },
    { start_date: "2026-10-28", effort_hours: undefined },
  );
  assert.deepEqual(merged, {
    due_date: "2026-10-30",
    effort_hours: 120,
    start_date: "2026-10-28",
  });

  const cleared = mergeSchedulePatch(
    { due_date: "2026-10-30" },
    { due_date: null },
  );
  assert.equal(cleared.due_date, null);
});


