import assert from "node:assert/strict";
import test from "node:test";

import type { Room, RoomMember } from "../../src/types/chat.types";
import {
  getRoomAvatar,
  getRoomDisplayName,
  getRoomInitials,
  isSelfChatRoom,
  stripSelfChatPrefix,
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

test("self chat shows (You) before the current user's name", () => {
  assert.equal(
    getRoomDisplayName(room({ members: [member({})] }), SELF_ID),
    "(You) Areeb Khan",
  );
  assert.equal(
    getRoomDisplayName(
      room({ members: [member({}), member({ id: SELF_ID })] }),
      SELF_ID,
    ),
    "(You) Areeb Khan",
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

test("the (You) prefix is stripped for avatar initials only", () => {
  assert.equal(stripSelfChatPrefix("(You) Areeb Khan"), "Areeb Khan");
  assert.equal(stripSelfChatPrefix("(you) Areeb Khan"), "Areeb Khan");
  assert.equal(stripSelfChatPrefix("Jane Doe"), "Jane Doe");
  assert.equal(stripSelfChatPrefix(null), "");
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
