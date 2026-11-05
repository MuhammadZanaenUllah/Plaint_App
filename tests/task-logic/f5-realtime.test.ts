import assert from "node:assert/strict";
import test from "node:test";

import {
  needsTaskLookupRefresh,
  sameNumericId,
} from "../../src/features/tasks/utils/realtime";

test("socket ids compare numerically across number/string payloads", () => {
  assert.equal(sameNumericId(5, "5"), true);
  assert.equal(sameNumericId("5", 5), true);
  assert.equal(sameNumericId(5, 6), false);
  assert.equal(sameNumericId(undefined, 5), false);
  assert.equal(sameNumericId(null, 5), false);
  assert.equal(sameNumericId("abc", 5), false);
});

test("detail actions need lookup refresh when owners or priorities are empty", () => {
  assert.equal(needsTaskLookupRefresh([], []), true);
  assert.equal(needsTaskLookupRefresh([{ id: 1 }], []), true);
  assert.equal(needsTaskLookupRefresh([], [{ id: 1 }]), true);
  assert.equal(needsTaskLookupRefresh([{ id: 1 }], [{ id: 1 }]), false);
});
