import assert from "node:assert/strict";
import test from "node:test";

import {
  MESSAGE_MAX_LENGTH,
  getCopyableMessageText,
  getOutgoingMessageText,
  isBlankMessage,
} from "../../src/features/chat/messageText";

test("sending preserves leading and trailing whitespace", () => {
  const draft = "  hello world  ";
  assert.equal(getOutgoingMessageText(draft), "  hello world  ");
});

test("sending preserves indentation and blank lines", () => {
  const draft = "function hi() {\n\treturn 1;\n\n}\n";
  assert.equal(getOutgoingMessageText(draft), draft);
});

test("sending preserves special characters, quotes and markdown source", () => {
  const draft = `He said "don't" & <tag> $5.00\n**bold** \`code\` | table |`;
  assert.equal(getOutgoingMessageText(draft), draft);
});

test("editing and copying never reconstruct text", () => {
  const source = "  **original**\n\nline 2  ";
  assert.equal(getOutgoingMessageText(source), source);
  assert.equal(getCopyableMessageText(source), source);
  assert.equal(getCopyableMessageText(undefined), "");
});

test("blank validation uses trim but never alters the payload", () => {
  assert.equal(isBlankMessage(""), true);
  assert.equal(isBlankMessage("   \n\t"), true);
  assert.equal(isBlankMessage(undefined), true);
  assert.equal(isBlankMessage(null), true);
  assert.equal(isBlankMessage(" x "), false);
  assert.equal(getOutgoingMessageText(" x "), " x ");
});

test("composer limit remains 10000", () => {
  assert.equal(MESSAGE_MAX_LENGTH, 10000);
});
