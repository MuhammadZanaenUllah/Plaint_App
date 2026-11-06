import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { renderCounters } from "../../src/features/tasks/dev/counters";
import { planCompletedRetention } from "../../src/features/tasks/utils/completedCache";
import { createInflightDedupe } from "../../src/features/tasks/utils/inflightDedupe";
import {
  MAX_ASSIGNEE_RESULTS,
  filterAndCapCreateAssignees,
  filterAndCapDetailAssignees,
} from "../../src/features/tasks/utils/taskOwnerFilter";
import { runWithAbortTimeout } from "../../src/services/api/requestTimeout";

type DevGlobal = typeof globalThis & { __DEV__?: boolean };

test("in-flight dedupe shares one promise per key and cleans up", async () => {
  const dedupe = createInflightDedupe();
  let runs = 0;
  let release: (value: string) => void = () => {};
  const first = dedupe.run(
    "all:1",
    () =>
      new Promise<string>((resolve) => {
        runs += 1;
        release = resolve;
      }),
  );
  const second = dedupe.run("all:1", async () => {
    runs += 1;
    return "second";
  });
  assert.equal(first, second);
  assert.equal(runs, 1);
  assert.equal(dedupe.size(), 1);
  release("first");
  assert.equal(await first, "first");
  assert.equal(dedupe.size(), 0);

  const third = await dedupe.run("all:1", async () => "third");
  assert.equal(third, "third");
});

test("in-flight dedupe separates keys and retries after rejection", async () => {
  const dedupe = createInflightDedupe();
  const a = dedupe.run("filter:complete", async () => "a");
  const b = dedupe.run("filter:recurring", async () => "b");
  assert.notEqual(a, b);
  assert.deepEqual(await Promise.all([a, b]), ["a", "b"]);

  await assert.rejects(
    dedupe.run("filter:complete", async () => {
      throw new Error("boom");
    }),
    /boom/,
  );
  assert.equal(dedupe.size(), 0);
  assert.equal(
    await dedupe.run("filter:complete", async () => "recovered"),
    "recovered",
  );
});

test("timeout aborts a hung request", async () => {
  const hung = runWithAbortTimeout(
    (signal) =>
      new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          const error = new Error("request aborted");
          error.name = "AbortError";
          reject(error);
        });
      }),
    { timeoutMs: 10 },
  );
  await assert.rejects(hung, /request aborted/);
});

test("caller abort signal propagates to the task", async () => {
  const controller = new AbortController();
  const pending = runWithAbortTimeout(
    (signal) =>
      new Promise((_resolve, reject) => {
        if (signal?.aborted) {
          reject(new Error("aborted early"));
          return;
        }
        signal?.addEventListener("abort", () => reject(new Error("aborted")));
      }),
    { signal: controller.signal },
  );
  controller.abort();
  await assert.rejects(pending, /aborted/);
});

test("no timeout/signal keeps the legacy call path", async () => {
  let received: AbortSignal | undefined | "unset" = "unset";
  const value = await runWithAbortTimeout(async (signal) => {
    received = signal;
    return 42;
  });
  assert.equal(value, 42);
  assert.equal(received, undefined);
});

test("completed retention replaces page 1 and merges later pages", () => {
  const first = planCompletedRetention({
    previousIds: [1, 2],
    pageIds: [1, 2, 3],
    page: 1,
    maxRows: 200,
    protectedIds: [],
  });
  assert.deepEqual(first.retainedIds, [1, 2, 3]);
  assert.deepEqual(first.removeIds, []);

  const second = planCompletedRetention({
    previousIds: [1, 2],
    pageIds: [3, 4],
    page: 2,
    maxRows: 3,
    protectedIds: [],
  });
  assert.deepEqual(second.retainedIds, [2, 3, 4]);
  assert.deepEqual(second.removeIds, [1]);
});

test("completed retention bounds growth but keeps bucket-protected ids", () => {
  const result = planCompletedRetention({
    previousIds: [1, 2, 3],
    pageIds: [4, 5, 6],
    page: 2,
    maxRows: 2,
    protectedIds: [1],
  });
  assert.deepEqual(result.retainedIds, [5, 6]);
  assert.deepEqual(result.removeIds, [2, 3]);
});

test("render counters snapshot row totals and top rows in dev", () => {
  (globalThis as DevGlobal).__DEV__ = true;
  renderCounters.reset();
  renderCounters.table();
  renderCounters.row(1);
  renderCounters.row(1);
  renderCounters.row("2");
  renderCounters.row("not-a-number");
  const snapshot = renderCounters.snapshot();
  assert.equal(snapshot.table, 1);
  assert.equal(snapshot.rows, 3);
  assert.deepEqual(snapshot.topRows, [
    [1, 2],
    [2, 1],
  ]);
  renderCounters.reset();
  assert.deepEqual(renderCounters.snapshot(), { table: 0, rows: 0, topRows: [] });
});

test("assignee pickers cap results and keep each search contract", () => {
  const owners = [
    { id: 1, first_name: "Ali", last_name: "Raza", full_name: "Ali Raza" },
    { id: 2, first_name: "Sara", last_name: "Khan", full_name: "Sara Khan" },
    { id: 3, first_name: "", last_name: "", full_name: "Full Name Only" },
    ...Array.from({ length: 12 }, (_, index) => ({
      id: index + 10,
      first_name: `Person${index}`,
      last_name: "Test",
      full_name: `Person${index} Test`,
    })),
  ];
  assert.equal(
    filterAndCapCreateAssignees(owners, "").length,
    MAX_ASSIGNEE_RESULTS,
  );
  assert.equal(filterAndCapDetailAssignees(owners, "").length, MAX_ASSIGNEE_RESULTS);
  assert.equal(
    filterAndCapCreateAssignees(owners, "sara").map((owner) => owner.id).join(","),
    "2",
  );
  assert.equal(filterAndCapCreateAssignees(owners, "full").length, 0);
  assert.equal(
    filterAndCapDetailAssignees(owners, "full").map((owner) => owner.id).join(","),
    "3",
  );
  assert.equal(filterAndCapCreateAssignees(owners, " Ali").length, 0);
  assert.equal(
    filterAndCapDetailAssignees(owners, " Ali").map((owner) => owner.id).join(","),
    "1",
  );
});

test("FlashList remains unadopted without profile evidence", () => {
  const pkg = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  ) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  assert.equal("@shopify/flash-list" in (pkg.dependencies ?? {}), false);
  assert.equal("@shopify/flash-list" in (pkg.devDependencies ?? {}), false);
});
