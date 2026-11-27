import assert from "node:assert/strict";
import test from "node:test";

import { formatRelativeTime } from "../../src/utils/dateFormat";

const NOW = Date.UTC(2026, 10, 27, 12, 0, 0); // 2026-11-27T12:00:00Z

function ago(minutes: number): string {
  return new Date(NOW - minutes * 60_000).toISOString();
}

test("shows Just now under one minute", () => {
  assert.equal(formatRelativeTime(ago(0), { nowMs: NOW }), "Just now");
  assert.equal(
    formatRelativeTime(new Date(NOW - 30_000).toISOString(), { nowMs: NOW }),
    "Just now",
  );
});

test("shows minutes under one hour", () => {
  assert.equal(formatRelativeTime(ago(1), { nowMs: NOW }), "1m ago");
  assert.equal(formatRelativeTime(ago(59), { nowMs: NOW }), "59m ago");
});

test("shows hours from 1h up to 23h", () => {
  assert.equal(formatRelativeTime(ago(60), { nowMs: NOW }), "1h ago");
  assert.equal(formatRelativeTime(ago(2 * 60), { nowMs: NOW }), "2h ago");
  assert.equal(formatRelativeTime(ago(23 * 60), { nowMs: NOW }), "23h ago");
});

test("shows days from 24h onward", () => {
  assert.equal(formatRelativeTime(ago(24 * 60), { nowMs: NOW }), "1d ago");
  assert.equal(formatRelativeTime(ago(2 * 24 * 60), { nowMs: NOW }), "2d ago");
  assert.equal(formatRelativeTime(ago(9 * 24 * 60), { nowMs: NOW }), "9d ago");
});

test("clamps future timestamps to Just now (clock skew)", () => {
  const future = new Date(NOW + 5 * 60_000).toISOString();
  assert.equal(formatRelativeTime(future, { nowMs: NOW }), "Just now");
});

test("empty and invalid input returns the empty placeholder", () => {
  assert.equal(formatRelativeTime(undefined, { nowMs: NOW }), "");
  assert.equal(formatRelativeTime("", { nowMs: NOW }), "");
  assert.equal(formatRelativeTime("not a date", { nowMs: NOW }), "");
});
