import assert from "node:assert/strict";
import test from "node:test";

import { formatChatListTimestamp } from "../../src/utils/dateFormat";

// Local-time construction keeps these assertions timezone-independent.
const NOW = new Date(2026, 10, 27, 12, 0, 0); // Fri 27 Nov 2026, 12:00 local
const NOW_MS = NOW.getTime();

function iso(date: Date): string {
  return date.toISOString();
}

test("shows the clock time for activity under 24 hours old", () => {
  assert.equal(
    formatChatListTimestamp(iso(new Date(2026, 10, 27, 9, 45)), {
      nowMs: NOW_MS,
    }),
    "9:45 am",
  );
});

test("shows the weekday name from 24 hours up to 7 days", () => {
  assert.equal(
    formatChatListTimestamp(iso(new Date(2026, 10, 26, 12, 0)), {
      nowMs: NOW_MS,
    }),
    "Thursday",
  );
  assert.equal(
    formatChatListTimestamp(iso(new Date(2026, 10, 24, 12, 0)), {
      nowMs: NOW_MS,
    }),
    "Tuesday",
  );
  assert.equal(
    formatChatListTimestamp(iso(new Date(2026, 10, 20, 12, 0)), {
      nowMs: NOW_MS,
    }),
    "Friday",
  );
});

test("shows dd/mm/yy after more than seven days", () => {
  assert.equal(
    formatChatListTimestamp(iso(new Date(2026, 10, 19, 12, 0)), {
      nowMs: NOW_MS,
    }),
    "19/11/26",
  );
  assert.equal(
    formatChatListTimestamp(iso(new Date(2025, 11, 11, 12, 0)), {
      nowMs: NOW_MS,
    }),
    "11/12/25",
  );
});

test("future timestamps fall back to the clock time", () => {
  assert.equal(
    formatChatListTimestamp(iso(new Date(2026, 10, 27, 13, 0)), {
      nowMs: NOW_MS,
    }),
    "1:00 pm",
  );
});

test("empty and invalid values return an empty string", () => {
  assert.equal(formatChatListTimestamp(undefined, { nowMs: NOW_MS }), "");
  assert.equal(formatChatListTimestamp("", { nowMs: NOW_MS }), "");
  assert.equal(formatChatListTimestamp("not a date", { nowMs: NOW_MS }), "");
});
