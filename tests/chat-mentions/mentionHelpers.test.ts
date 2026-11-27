import assert from "node:assert/strict";
import test from "node:test";

import type { ChatMessage } from "../../src/types/chat.types";
import { messageMentionsUser } from "../../src/utils/chatHelpers";

const ME = 7;

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    _id: "m1",
    id: 1,
    room_id: "room-1",
    sender_id: 1,
    text: "",
    attachments: [],
    parent_id: null,
    ...overrides,
  } as ChatMessage;
}

test("detects the authoritative mentions array (number ids)", () => {
  assert.equal(messageMentionsUser(message({ mentions: [ME] }), ME), true);
});

test("compares mention ids as strings", () => {
  assert.equal(
    messageMentionsUser(message({ mentions: [String(ME) as unknown as number] }), ME),
    true,
  );
  assert.equal(
    messageMentionsUser(message({ mentions: [ME] }), String(ME)),
    true,
  );
});

test("detects website inline mention markup", () => {
  assert.equal(
    messageMentionsUser(
      message({ text: "Hey @[Areeb Khan](7), please review" }),
      ME,
    ),
    true,
  );
  assert.equal(
    messageMentionsUser(
      message({ text: "@[Areeb Khan](7) @[Jane Doe](9)" }),
      9,
    ),
    true,
  );
});

test("does not match a plain @Name without an id", () => {
  assert.equal(
    messageMentionsUser(message({ text: "Hey @Areeb Khan please review" }), ME),
    false,
  );
  assert.equal(
    messageMentionsUser(message({ text: "Hey @Areeb" }), ME),
    false,
  );
});

test("does not match other users or empty input", () => {
  assert.equal(messageMentionsUser(message({ mentions: [9] }), ME), false);
  assert.equal(
    messageMentionsUser(message({ text: "@[Jane](9)" }), ME),
    false,
  );
  assert.equal(messageMentionsUser(message({}), ME), false);
  assert.equal(messageMentionsUser(null, ME), false);
  assert.equal(messageMentionsUser(message({ mentions: [ME] }), null), false);
  assert.equal(messageMentionsUser(message({ mentions: [ME] }), 0), false);
});
