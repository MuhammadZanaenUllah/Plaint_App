import assert from "node:assert/strict";
import test from "node:test";

import {
  getWeekRange,
  isPktPast,
  parseTaskDate,
  pktTodayStart,
  toCalendarDateOnly,
  toPktDateOnly,
  toPktDateTime,
} from "../../src/features/tasks/utils/taskDate";
import {
  formatEffort,
  fromMinutes,
  toMinutes,
} from "../../src/features/tasks/utils/taskEffort";
import {
  isCompletedStatus,
  isOnHoldStatus,
  normalizeApiStatus,
  toApiStatus,
} from "../../src/features/tasks/utils/taskStatus";
import { uiStatusToApi } from "../../src/utils/statusMapper";
import { classifyTaskError } from "../../src/features/tasks/utils/taskError";

test("PKT date-only is a PKT calendar day, not UTC midnight", () => {
  const parsed = parseTaskDate("2026-10-30");
  assert.ok(parsed);
  assert.equal(parsed.toISOString(), "2026-10-29T19:00:00.000Z");
  assert.equal(toPktDateOnly("2026-10-30"), "2026-10-30");
});

test("PKT wall-clock date-time round-trips without seconds/zone", () => {
  const parsed = parseTaskDate("2026-10-30T14:30");
  assert.ok(parsed);
  assert.equal(parsed.toISOString(), "2026-10-30T09:30:00.000Z");
  assert.equal(toPktDateTime(parsed), "2026-10-30T14:30");
});

test("calendar-date helper keeps the picked local day", () => {
  assert.equal(toCalendarDateOnly(new Date(2026, 9, 30)), "2026-10-30");
});

test("day rules use PKT start of day", () => {
  const now = parseTaskDate("2026-10-30T08:00");
  assert.ok(now);
  assert.equal(toPktDateOnly(pktTodayStart(now)), "2026-10-30");
  assert.deepEqual(getWeekRange(now), {
    from: "2026-10-31",
    to: "2026-11-07",
  });
  assert.equal(isPktPast("2026-10-29T23:00", now), true);
  assert.equal(isPktPast("2026-10-30T09:00", now), false);
});

test("effort converts through minutes and displays sub-hour values in minutes", () => {
  assert.equal(toMinutes(4, "hours"), 240);
  assert.equal(toMinutes(2, "days"), 960);
  assert.equal(toMinutes(30, "minutes"), 30);
  assert.equal(fromMinutes(240, "hours"), 4);
  assert.equal(formatEffort(45), "45 min");
  assert.equal(formatEffort(90), "1.5 hr");
  assert.equal(formatEffort(960, "days"), "2 days");
});

test("status normalization accepts legacy aliases and emits canonical values", () => {
  assert.equal(normalizeApiStatus("On Hold"), "On-Hold");
  assert.equal(normalizeApiStatus("In Progress"), "In-Progress");
  assert.equal(normalizeApiStatus("Completed"), "Complete");
  assert.equal(toApiStatus("On Hold"), "On-Hold");
  assert.equal(toApiStatus("Completed"), "Complete");
  assert.equal(toApiStatus("Recurring"), "Pending");
  assert.equal(uiStatusToApi("On Hold"), "On-Hold");
  assert.equal(uiStatusToApi("Completed"), "Complete");
  assert.equal(isCompletedStatus("Complete"), true);
  assert.equal(isOnHoldStatus("On-Hold"), true);
});

test("task error classification covers contract failure classes", () => {
  assert.equal(classifyTaskError(new Error("Network request failed")), "offline");
  assert.equal(classifyTaskError(new Error("Request timed out")), "timeout");
  const aborted = new Error("aborted");
  aborted.name = "AbortError";
  assert.equal(classifyTaskError(aborted), "timeout");
  assert.equal(classifyTaskError({ status: 401 }), "auth");
  assert.equal(classifyTaskError({ status: 403 }), "permission");
  assert.equal(classifyTaskError({ status: 404 }), "not_found");
  assert.equal(classifyTaskError({ status: 400 }), "validation");
  assert.equal(classifyTaskError({ status: 500 }), "server");
  assert.equal(classifyTaskError({ nonJson: true }), "server");
  assert.equal(classifyTaskError(null), "unknown");
});
