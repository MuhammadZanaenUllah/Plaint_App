import assert from "node:assert/strict";
import test from "node:test";

import type { ChatMessage } from "../../src/types/chat.types";
import {
  countTextMatches,
  escapeRegExp,
  getMatchingMessages,
  nextMatchIndex,
  normalizeSearchQuery,
  splitHighlightSegments,
} from "../../src/utils/chatSearch";

function msg(text: string | undefined, id: string): ChatMessage {
  return { _id: id, text } as unknown as ChatMessage;
}

test("normalizeSearchQuery trims and treats blank as inactive", () => {
  assert.equal(normalizeSearchQuery("  hello  "), "hello");
  assert.equal(normalizeSearchQuery("   "), "");
  assert.equal(normalizeSearchQuery(undefined), "");
  assert.equal(normalizeSearchQuery(null), "");
});

test("escapeRegExp escapes every metacharacter", () => {
  const raw = "a.b*c+d?e(f)g[h]i{j}k|l\\m^n$o";
  const escaped = escapeRegExp(raw);
  assert.equal(new RegExp(escaped).test(raw), true);
  assert.equal(new RegExp(escaped).test("axb"), false);
});

test("splitHighlightSegments highlights one literal occurrence", () => {
  const segments = splitHighlightSegments("hello world", "world");
  assert.deepEqual(segments, [
    { text: "hello ", match: false },
    { text: "world", match: true },
  ]);
});

test("splitHighlightSegments is case-insensitive and keeps original casing", () => {
  const segments = splitHighlightSegments("Hello HELLO hello", "hello");
  assert.deepEqual(segments, [
    { text: "Hello", match: true },
    { text: " ", match: false },
    { text: "HELLO", match: true },
    { text: " ", match: false },
    { text: "hello", match: true },
  ]);
});

test("splitHighlightSegments highlights multiple occurrences in one message", () => {
  const segments = splitHighlightSegments("cat dog cat cat", "cat");
  assert.deepEqual(
    segments.map((s) => s.text).join(""),
    "cat dog cat cat",
    "segments must reconstruct the original text exactly",
  );
  assert.equal(segments.filter((s) => s.match).length, 3);
});

test("splitHighlightSegments treats regex specials literally", () => {
  const text = "price is $5.00 (approx) [sic]";
  const segments = splitHighlightSegments(text, "$5.00");
  assert.equal(segments.some((s) => s.match && s.text === "$5.00"), true);
  assert.equal(segments.map((s) => s.text).join(""), text);
});

test("splitHighlightSegments handles line breaks without altering them", () => {
  const text = "first line\nsecond line with match\nthird";
  const segments = splitHighlightSegments(text, "match");
  assert.equal(segments.map((s) => s.text).join(""), text);
  assert.equal(segments.filter((s) => s.match).length, 1);
});

test("splitHighlightSegments returns whole text for empty query or no match", () => {
  assert.deepEqual(splitHighlightSegments("abc", ""), [
    { text: "abc", match: false },
  ]);
  assert.deepEqual(splitHighlightSegments("abc", "zzz"), [
    { text: "abc", match: false },
  ]);
});

test("countTextMatches counts case-insensitive non-overlapping matches", () => {
  assert.equal(countTextMatches("aAaA", "a"), 4);
  assert.equal(countTextMatches("one two one", "one"), 2);
  assert.equal(countTextMatches("", "one"), 0);
  assert.equal(countTextMatches(null, "one"), 0);
  assert.equal(countTextMatches("text", ""), 0);
});

test("getMatchingMessages finds messages by text only, case-insensitively", () => {
  const a = msg("Deploy the release", "1");
  const b = msg("release notes ready", "2");
  const c = msg("unrelated", "3");
  const d = msg(undefined, "4");
  const d_noText = d;

  const matches = getMatchingMessages([a, b, c, d_noText], "RELEASE");
  assert.equal(matches.size, 2);
  assert.equal(matches.has(a), true);
  assert.equal(matches.has(b), true);
  assert.equal(matches.has(c), false);
});

test("getMatchingMessages matches multiple occurrences within one message", () => {
  const a = msg("todo todo todo", "1");
  const matches = getMatchingMessages([a], "todo");
  assert.equal(matches.size, 1);
  assert.equal(matches.has(a), true);
});

test("getMatchingMessages returns empty set for an empty query", () => {
  const a = msg("anything", "1");
  assert.equal(getMatchingMessages([a], "").size, 0);
  assert.equal(getMatchingMessages([a], "   ").size, 0);
});

test("getMatchingMessages ignores sender names and non-text fields", () => {
  const a = {
    _id: "1",
    text: "plain body",
    sender_name: "Alice",
  } as unknown as ChatMessage;
  assert.equal(getMatchingMessages([a], "Alice").size, 0);
  assert.equal(getMatchingMessages([a], "body").size, 1);
});

test("nextMatchIndex starts at the first/last match when not navigated", () => {
  assert.equal(nextMatchIndex(-1, 5, 1), 0);
  assert.equal(nextMatchIndex(-1, 5, -1), 4);
});

test("nextMatchIndex advances and wraps in both directions", () => {
  assert.equal(nextMatchIndex(0, 5, 1), 1);
  assert.equal(nextMatchIndex(4, 5, 1), 0);
  assert.equal(nextMatchIndex(0, 5, -1), 4);
  assert.equal(nextMatchIndex(3, 5, -1), 2);
});

test("nextMatchIndex returns -1 when there are no matches", () => {
  assert.equal(nextMatchIndex(-1, 0, 1), -1);
  assert.equal(nextMatchIndex(0, 0, -1), -1);
});
