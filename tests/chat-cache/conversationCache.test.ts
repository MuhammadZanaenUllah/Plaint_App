import assert from "node:assert/strict";
import test from "node:test";

import {
  compareMessages,
  hasRenderableConversation,
  isConversationCacheFresh,
  mapCachedMessages,
  mergeFetchedPage,
  mergeMessageLists,
  pruneConversationCache,
  removeMessageFromCache,
  shouldShowConversationLoader,
  upsertMessage,
} from "../../src/features/chat/conversationCache";
import type {
  ChatMessage,
  ConversationCacheEntry,
} from "../../src/types/chat.types";

let sequence = 0;

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  sequence += 1;
  return {
    _id: `m-${sequence}`,
    id: sequence,
    room_id: "room-1",
    sender_id: 1,
    text: `message ${sequence}`,
    attachments: [],
    parent_id: null,
    createdAt: new Date(1700000000000 + sequence * 1000).toISOString(),
    ...overrides,
  } as ChatMessage;
}

function entry(overrides: Partial<ConversationCacheEntry> = {}): ConversationCacheEntry {
  return {
    messages: [],
    hasMore: false,
    messagePage: 1,
    loaded: true,
    loadedAt: 1,
    lastAccessAt: 1,
    ...overrides,
  };
}

test("messages are ordered chronologically with a numeric id tie-breaker", () => {
  const late = message({ createdAt: "2026-01-02T00:00:00.000Z" });
  const early = message({ createdAt: "2026-01-01T00:00:00.000Z" });
  const sorted = [late, early].sort(compareMessages);
  assert.deepEqual(
    sorted.map((m) => m._id),
    [early._id, late._id],
  );
});

test("merge deduplicates by _id and preserves history", () => {
  const first = message({ _id: "a", id: 1 });
  const second = message({ _id: "b", id: 2 });
  const updatedSecond = { ...second, text: "edited", is_edited: true };
  const third = message({ _id: "c", id: 3 });

  const merged = mergeMessageLists([first, second], [updatedSecond, third]);
  assert.equal(merged.length, 3);
  assert.deepEqual(
    merged.map((m) => m._id),
    ["a", "b", "c"],
  );
  assert.equal(merged[1].text, "edited");
});

test("optimistic message reconciles with its server echo via client_id", () => {
  const pending = message({
    _id: "pending-1",
    id: -1,
    client_id: "pending-1",
    is_pending: true,
    text: "hello",
  });
  const server = message({
    _id: "server-1",
    id: 42,
    client_id: "pending-1",
    text: "hello",
  });

  const merged = mergeMessageLists([pending], [server]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]._id, "server-1");
  assert.equal(merged[0].id, 42);
  assert.equal(merged[0].is_pending, false);
});

test("upsert keeps a pending flag only for optimistic insertion", () => {
  const pending = message({ _id: "pending-2", id: -2, is_pending: true });
  const inserted = upsertMessage([], pending);
  assert.equal(inserted[0].is_pending, true);
});

test("page-1 refresh unions the newest window with already-loaded history", () => {
  const m1 = message({ _id: "m1", id: 1 });
  const m2 = message({ _id: "m2", id: 2 });
  const m2Fresh = { ...m2, text: "edited", is_edited: true };
  const m3 = message({ _id: "m3", id: 3 });
  const cached = entry({
    messages: [m1, m2],
    hasMore: false,
    messagePage: 4,
  });

  const merged = mergeFetchedPage({
    baseMessages: cached.messages,
    incoming: [m2Fresh, m3],
    page: 1,
    serverHasMore: true,
    cached,
  });

  assert.deepEqual(
    merged.messages.map((m) => m._id),
    ["m1", "m2", "m3"],
  );
  assert.equal(merged.messages[1].text, "edited");
  assert.equal(merged.hasMore, false, "already-loaded full history stays complete");
  assert.equal(merged.messagePage, 4);
});

test("older pages use the server hasMore and requested page", () => {
  const old = message({ _id: "old", id: 1 });
  const newer = message({ _id: "new", id: 2 });
  const merged = mergeFetchedPage({
    baseMessages: [newer],
    incoming: [old],
    page: 2,
    serverHasMore: false,
  });
  assert.deepEqual(
    merged.messages.map((m) => m._id),
    ["old", "new"],
  );
  assert.equal(merged.hasMore, false);
  assert.equal(merged.messagePage, 2);
});

test("loader decisions respect renderable cache", () => {
  assert.equal(shouldShowConversationLoader(undefined), true);
  assert.equal(shouldShowConversationLoader(entry({ loaded: false, messages: [] })), true);
  assert.equal(
    shouldShowConversationLoader(entry({ loaded: false, messages: [message()] })),
    false,
  );
  assert.equal(shouldShowConversationLoader(entry({ loaded: true })), false);
  assert.equal(hasRenderableConversation(entry({ loaded: true, messages: [] })), true);
});

test("cache pruning keeps the active and freshly written conversations", () => {
  const cache: Record<string, ConversationCacheEntry> = {};
  for (let i = 0; i < 6; i += 1) {
    cache[`room-${i}`] = entry({ lastAccessAt: i });
  }
  const pruned = pruneConversationCache(cache, {
    activeRoomId: "room-0",
    keepRoomId: "room-1",
    limit: 3,
  });
  const keys = Object.keys(pruned).sort();
  assert.equal(keys.length, 3);
  assert.ok(keys.includes("room-0"));
  assert.ok(keys.includes("room-1"));
  // Newest remaining entry (room-5) is kept over older ones.
  assert.ok(keys.includes("room-5"));
  assert.ok(!keys.includes("room-2"));
});

test("removing a message clears it from every cached conversation", () => {
  const target = message({ _id: "target", id: 9 });
  const cache = {
    a: entry({ messages: [target, message()] }),
    b: entry({ messages: [message(), target] }),
    c: entry({ messages: [message()] }),
  };
  const next = removeMessageFromCache(cache, "target");
  assert.equal(next.a.messages.some((m) => m._id === "target"), false);
  assert.equal(next.b.messages.some((m) => m._id === "target"), false);
  assert.equal(next.c, cache.c, "unaffected conversations keep their reference");
});

test("cached message mapping only allocates when something changes", () => {
  const pinned = message({ _id: "pinned", id: 1, is_pinned: false });
  const cache = { a: entry({ messages: [pinned] }) };
  const next = mapCachedMessages(cache, (m) =>
    m._id === "pinned" ? { ...m, is_pinned: true } : m,
  );
  assert.equal(next.a.messages[0].is_pinned, true);
  const unchanged = mapCachedMessages(next, (m) => m);
  assert.equal(unchanged, next);
});

test("freshness is bounded to protect duplicate mounts, not normal reopens", () => {
  const now = 1_000_000;
  assert.equal(isConversationCacheFresh(undefined, now), false);
  assert.equal(
    isConversationCacheFresh(entry({ loadedAt: now - 100 }), now),
    true,
  );
  assert.equal(
    isConversationCacheFresh(entry({ loadedAt: now - 10_000 }), now),
    false,
  );
});
