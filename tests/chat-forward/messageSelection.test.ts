import assert from "node:assert/strict";
import test from "node:test";

import type { ChatMessage } from "../../src/types/chat.types";
import {
  getSelectedMessages,
  messageSelectionKey,
} from "../../src/features/chat/messageSelection";

function msg(id: string, text: string): ChatMessage {
  return { _id: id, id: Number(id.replace(/\D/g, "")) || 0, text } as ChatMessage;
}

test("selection keys are stable for _id and fall back to id", () => {
  assert.equal(messageSelectionKey(msg("abc", "a")), "abc");
  assert.equal(
    messageSelectionKey({ _id: "", id: 42, text: "b" } as ChatMessage),
    "42",
  );
});

test("selected messages keep the source (chronological) order", () => {
  const first = msg("1", "first");
  const second = msg("2", "second");
  const third = msg("3", "third");
  const selected = getSelectedMessages(
    [first, second, third],
    new Set(["3", "1"]),
  );
  assert.deepEqual(selected.map((m) => m.text), ["first", "third"]);
});

test("missing or unselected keys are ignored", () => {
  const first = msg("1", "first");
  assert.deepEqual(getSelectedMessages([first], new Set(["missing"])), []);
  assert.deepEqual(getSelectedMessages([first], new Set(["1"])), [first]);
  assert.deepEqual(getSelectedMessages([first], new Set()), []);
});
