import assert from "node:assert/strict";
import test from "node:test";

import type { Room, RoomMember } from "../../src/types/chat.types";
import {
  getMessageTick,
  getRoomAvatar,
  getRoomDisplayName,
  getRoomInitials,
  isSelfChatRoom,
  selfChatStorageKey,
  stripSelfChatMarker,
} from "../../src/utils/chatHelpers";

const SELF_ID = 7;

function member(overrides: Partial<RoomMember>): RoomMember {
  return {
    id: SELF_ID,
    first_name: "Areeb",
    last_name: "Khan",
    ...overrides,
  } as RoomMember;
}

function room(overrides: Partial<Room>): Room {
  return {
    _id: "room-1",
    id: 1,
    type: "direct",
    name: "",
    members: [],
    ...overrides,
  } as unknown as Room;
}

test("self chat is detected only when every member is the current user", () => {
  assert.equal(isSelfChatRoom(room({ members: [member({})] }), SELF_ID), true);
  assert.equal(
    isSelfChatRoom(room({ members: [member({}), member({ id: SELF_ID })] }), SELF_ID),
    true,
  );
  assert.equal(
    isSelfChatRoom(
      room({ members: [member({}), member({ id: 9, first_name: "Jane" })] }),
      SELF_ID,
    ),
    false,
  );
  assert.equal(isSelfChatRoom(room({ members: [] }), SELF_ID), false);
  assert.equal(isSelfChatRoom(room({ type: "channel", members: [member({})] }), SELF_ID), false);
});

test("self chat shows (You) after the current user's name", () => {
  assert.equal(
    getRoomDisplayName(room({ members: [member({})] }), SELF_ID),
    "Areeb Khan (You)",
  );
  assert.equal(
    getRoomDisplayName(
      room({ members: [member({}), member({ id: SELF_ID })] }),
      SELF_ID,
    ),
    "Areeb Khan (You)",
  );
});

test("normal direct chats still show the other member", () => {
  const normal = room({
    members: [
      member({}),
      member({ id: 9, first_name: "Jane", last_name: "Doe", email: "jane@x.com" }),
    ],
  });
  assert.equal(getRoomDisplayName(normal, SELF_ID), "Jane Doe");
  assert.equal(getRoomInitials(normal, SELF_ID), "J");
  assert.equal(getRoomAvatar(normal, SELF_ID), null);
});

test("self chat initials and avatar use the self member", () => {
  const self = room({
    members: [member({ image: "https://cdn/self.png" })],
  });
  assert.equal(getRoomInitials(self, SELF_ID), "A");
  assert.equal(getRoomAvatar(self, SELF_ID), "https://cdn/self.png");
});

test("the (You) marker is stripped for avatar initials only", () => {
  assert.equal(stripSelfChatMarker("Areeb Khan (You)"), "Areeb Khan");
  assert.equal(stripSelfChatMarker("Areeb Khan (you)"), "Areeb Khan");
  assert.equal(stripSelfChatMarker("(You) Areeb Khan"), "Areeb Khan");
  assert.equal(stripSelfChatMarker("Jane Doe"), "Jane Doe");
  assert.equal(stripSelfChatMarker(null), "");
});

test("the restoration flag is scoped to the user", () => {
  assert.equal(selfChatStorageKey(7), "planit_self_chat_7");
  assert.equal(selfChatStorageKey(42), "planit_self_chat_42");
});

test("self-chat messages show read (double blue) ticks once acknowledged", () => {
  const base = { sender_id: SELF_ID, is_read: [], delivered_to: [] } as any;
  assert.equal(getMessageTick({ ...base, is_pending: true }, [], SELF_ID, true), "clock");
  assert.equal(getMessageTick({ ...base, failed: true }, [], SELF_ID, true), "failed");
  assert.equal(getMessageTick(base, [], SELF_ID, true), "read");
});

test("normal DM tick behavior is unchanged", () => {
  const other = 9;
  const noReceipts = { sender_id: SELF_ID, is_read: [], delivered_to: [] } as any;
  assert.equal(getMessageTick(noReceipts, [{ id: other }] as any, SELF_ID, false), "single");
  assert.equal(
    getMessageTick(
      { sender_id: SELF_ID, is_read: [], delivered_to: [other] } as any,
      [{ id: other }] as any,
      SELF_ID,
      false,
    ),
    "delivered",
  );
  assert.equal(
    getMessageTick(
      { sender_id: SELF_ID, is_read: [other], delivered_to: [] } as any,
      [{ id: other }] as any,
      SELF_ID,
      false,
    ),
    "read",
  );
});

test("missing member data falls back to the room name (backward compatible)", () => {
  const legacy = room({ members: [], name: "Legacy Chat" });
  assert.equal(getRoomDisplayName(legacy, SELF_ID), "Legacy Chat");
  assert.equal(getRoomInitials(legacy, SELF_ID), "L");
});

test("channels keep their room name and avatar", () => {
  const channel = room({
    type: "channel",
    name: "Announcements",
    members: [member({}), member({ id: 9 })],
    image: "https://cdn/channel.png",
  } as Partial<Room>);
  assert.equal(getRoomDisplayName(channel, SELF_ID), "Announcements");
  assert.equal(getRoomInitials(channel, SELF_ID), "A");
  assert.equal(getRoomAvatar(channel, SELF_ID), "https://cdn/channel.png");
});
