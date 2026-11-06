import assert from "node:assert/strict";
import test from "node:test";

import {
  EFFORT_UNITS,
  PRIORITY_OPTIONS,
  STATUSES,
} from "../../src/features/tasks/components/create-task/createTaskOptions";
import { CREATE_STATUSES } from "../../src/features/tasks/constants/taskConstants";

test("AUD-081 create effort units keep the contract labels and order", () => {
  assert.deepEqual(
    EFFORT_UNITS.map((unit) => unit.value),
    ["minutes", "hours", "days"],
  );
  assert.deepEqual(
    EFFORT_UNITS.map((unit) => unit.abbrev),
    ["Min", "Hrs", "Days"],
  );
});

test("AUD-081 create priority options remain normal then critical", () => {
  assert.deepEqual(
    PRIORITY_OPTIONS.map((option) => option.value),
    ["normal", "critical"],
  );
  assert.deepEqual(
    PRIORITY_OPTIONS.map((option) => option.label),
    ["Normal", "Critical"],
  );
});

test("AUD-081 create status options mirror the contract create statuses", () => {
  assert.deepEqual(
    STATUSES.map((status) => status.value),
    CREATE_STATUSES,
  );
  assert.ok(STATUSES.every((status) => status.label.length > 0));
  assert.ok(STATUSES.every((status) => status.color.length > 0));
});
