// ─── Conversation cache — pure helpers ───────────────────────────────────────
//
// Pure, React-free helpers backing the session conversation cache in
// ChatContext. Keeping them here makes the merge/dedupe/eviction rules directly
// testable without importing React Native.
//
// Message identity mirrors the rest of the chat code: a message is the same
// message when its Mongo `_id`, numeric `id`, or optimistic `client_id` match.
// Server-confirmed messages keep their chronological position and are ordered
// by `createdAt` (numeric `id` as a stable tie-breaker).

import type {
  ChatMessage,
  ConversationCacheEntry,
} from "@/types/chat.types";

/** Keep at most this many conversations warm in a session. */
export const CONVERSATION_CACHE_LIMIT = 20;

/**
 * Avoid re-fetching when a conversation is re-opened within this window. This
 * exists to swallow duplicate mounts/effects; normal re-opens still revalidate.
 */
export const CONVERSATION_FRESH_MS = 750;

/** Stable identity for a message across `_id` / numeric `id` shapes. */
export function conversationMessageKey(
  message: ChatMessage | null | undefined,
): string {
  if (!message) return "";
  return String(message._id ?? message.id ?? "");
}

function messageTime(message: ChatMessage): number {
  if (!message.createdAt) return 0;
  const time = new Date(message.createdAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

function messageNumericId(message: ChatMessage): number {
  const value = Number(message.id);
  return Number.isFinite(value) ? value : 0;
}

/** Chronological order (oldest first) with a stable numeric-id tie-breaker. */
export function compareMessages(a: ChatMessage, b: ChatMessage): number {
  const byTime = messageTime(a) - messageTime(b);
  if (byTime !== 0) return byTime;
  return messageNumericId(a) - messageNumericId(b);
}

function mergeIdLists(
  a?: number[],
  b?: number[],
): number[] | undefined {
  if (!a?.length && !b?.length) return b ?? a;
  return Array.from(new Set([...(a ?? []), ...(b ?? [])]));
}

/**
 * Insert or update one message in a list, matching by `_id` / numeric `id` /
 * `client_id`. Returns a new array (the input is never mutated).
 */
export function upsertMessage(
  messages: ChatMessage[],
  incoming: ChatMessage,
): ChatMessage[] {
  const incomingId = conversationMessageKey(incoming);
  const incomingClientId = incoming.client_id
    ? String(incoming.client_id)
    : "";
  const index = messages.findIndex((message) => {
    if (
      incoming._id &&
      message._id &&
      String(message._id) === String(incoming._id)
    ) {
      return true;
    }
    if (incoming.id && message.id && String(message.id) === String(incoming.id)) {
      return true;
    }
    if (
      incomingId &&
      (String(message._id) === incomingId || String(message.id) === incomingId)
    ) {
      return true;
    }
    if (
      incomingClientId &&
      (String(message._id) === incomingClientId ||
        String(message.client_id) === incomingClientId)
    ) {
      return true;
    }
    return false;
  });

  if (index < 0) {
    return [
      ...messages,
      {
        ...incoming,
        _id: String(
          incoming._id ??
            incoming.id ??
            `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        ),
      },
    ];
  }

  const previous = messages[index];
  const next = messages.slice();
  next[index] = {
    ...previous,
    ...incoming,
    // Only an optimistic entry stays pending; a server echo confirms it.
    is_pending: incoming.is_pending === true,
    // Preserve receipts applied to an optimistic bubble before the server echo.
    delivered_to: mergeIdLists(previous.delivered_to, incoming.delivered_to),
    is_read: mergeIdLists(previous.is_read, incoming.is_read),
  };
  return next;
}

/**
 * Merge two lists into one deduplicated, chronologically ordered list.
 * `incoming` fields win over existing ones for the same message.
 */
export function mergeMessageLists(
  existing: ChatMessage[],
  incoming: ChatMessage[],
): ChatMessage[] {
  if (incoming.length === 0) return existing;
  let merged = existing;
  for (const message of incoming) {
    merged = upsertMessage(merged, message);
  }
  return merged.slice().sort(compareMessages);
}

/** Build a fresh cache entry. */
export function createConversationCacheEntry(params: {
  messages: ChatMessage[];
  hasMore: boolean;
  messagePage: number;
  loadedAt?: number;
  lastAccessAt?: number;
}): ConversationCacheEntry {
  const now = Date.now();
  return {
    messages: params.messages,
    hasMore: params.hasMore,
    messagePage: params.messagePage,
    loaded: true,
    loadedAt: params.loadedAt ?? now,
    lastAccessAt: params.lastAccessAt ?? now,
  };
}

/**
 * Write a conversation snapshot into the cache, updating LRU timestamps and
 * pruning the map. Never evicts the active or freshly written conversation.
 */
export function withCachedConversation(
  cache: Record<string, ConversationCacheEntry>,
  roomId: string,
  entry: ConversationCacheEntry,
  opts?: { activeRoomId?: string | null; limit?: number },
): Record<string, ConversationCacheEntry> {
  const key = String(roomId);
  if (!key) return cache;
  const next: Record<string, ConversationCacheEntry> = {
    ...cache,
    [key]: entry,
  };
  return pruneConversationCache(next, {
    activeRoomId: opts?.activeRoomId ?? key,
    keepRoomId: key,
    limit: opts?.limit ?? CONVERSATION_CACHE_LIMIT,
  });
}

/** Update only the access timestamp (cache hit/hydration). */
export function touchCachedConversation(
  cache: Record<string, ConversationCacheEntry>,
  roomId: string,
): Record<string, ConversationCacheEntry> {
  const key = String(roomId);
  const entry = cache[key];
  if (!entry) return cache;
  return {
    ...cache,
    [key]: { ...entry, lastAccessAt: Date.now() },
  };
}

/**
 * Bound the cache size (LRU). The active conversation and the most recently
 * written one are always retained.
 */
export function pruneConversationCache(
  cache: Record<string, ConversationCacheEntry>,
  opts?: {
    activeRoomId?: string | null;
    keepRoomId?: string | null;
    limit?: number;
  },
): Record<string, ConversationCacheEntry> {
  const limit = Math.max(1, opts?.limit ?? CONVERSATION_CACHE_LIMIT);
  const keys = Object.keys(cache);
  if (keys.length <= limit) return cache;

  const keep = new Set<string>();
  if (opts?.activeRoomId) keep.add(String(opts.activeRoomId));
  if (opts?.keepRoomId) keep.add(String(opts.keepRoomId));

  const ordered = keys.slice().sort((a, b) => {
    const aAt = cache[a]?.lastAccessAt ?? 0;
    const bAt = cache[b]?.lastAccessAt ?? 0;
    return bAt - aAt;
  });

  const next: Record<string, ConversationCacheEntry> = {};
  let count = 0;
  // Retained conversations are always kept, even if that briefly exceeds the
  // limit (e.g. the active one must never be evicted).
  for (const key of keys) {
    if (keep.has(key)) {
      next[key] = cache[key];
      count += 1;
    }
  }
  for (const key of ordered) {
    if (keep.has(key)) continue;
    if (count >= limit) break;
    next[key] = cache[key];
    count += 1;
  }
  return next;
}

/** Apply a mutation to one cached message in a specific conversation. */
export function patchCachedMessage(
  cache: Record<string, ConversationCacheEntry>,
  roomId: string,
  messageId: string,
  updater: (message: ChatMessage) => ChatMessage,
): Record<string, ConversationCacheEntry> {
  const entry = cache[String(roomId)];
  if (!entry) return cache;
  let changed = false;
  const messages = entry.messages.map((message) => {
    if (
      String(message._id) !== String(messageId) &&
      String(message.id) !== String(messageId)
    ) {
      return message;
    }
    changed = true;
    return updater(message);
  });
  if (!changed) return cache;
  return {
    ...cache,
    [String(roomId)]: { ...entry, messages },
  };
}

/** Remove a message id from every cached conversation. */
export function removeMessageFromCache(
  cache: Record<string, ConversationCacheEntry>,
  messageId: string,
): Record<string, ConversationCacheEntry> {
  let changed = false;
  const next: Record<string, ConversationCacheEntry> = {};
  for (const [roomId, entry] of Object.entries(cache)) {
    const messages = entry.messages.filter(
      (message) =>
        String(message._id) !== String(messageId) &&
        String(message.id) !== String(messageId),
    );
    if (messages.length !== entry.messages.length) {
      changed = true;
      next[roomId] = { ...entry, messages };
    } else {
      next[roomId] = entry;
    }
  }
  return changed ? next : cache;
}

/** Apply a transformer to every cached message (reactions/pin flags). */
export function mapCachedMessages(
  cache: Record<string, ConversationCacheEntry>,
  transformer: (message: ChatMessage, roomId: string) => ChatMessage,
): Record<string, ConversationCacheEntry> {
  let changed = false;
  const next: Record<string, ConversationCacheEntry> = {};
  for (const [roomId, entry] of Object.entries(cache)) {
    let entryChanged = false;
    const messages = entry.messages.map((message) => {
      const updated = transformer(message, roomId);
      if (updated !== message) entryChanged = true;
      return updated;
    });
    if (entryChanged) {
      changed = true;
      next[roomId] = { ...entry, messages };
    } else {
      next[roomId] = entry;
    }
  }
  return changed ? next : cache;
}

/** Whether a cache entry can be rendered immediately. */
export function hasRenderableConversation(
  entry: ConversationCacheEntry | null | undefined,
): boolean {
  return !!entry && (entry.loaded || entry.messages.length > 0);
}

/**
 * Whether the full-screen initial loader should be shown for a page-1 load.
 * It must not appear when the cache already has something to render.
 */
export function shouldShowConversationLoader(
  entry: ConversationCacheEntry | null | undefined,
): boolean {
  return !hasRenderableConversation(entry);
}

export type FetchedPageMerge = {
  messages: ChatMessage[];
  hasMore: boolean;
  messagePage: number;
};

/**
 * Merge a fetched page into the known conversation.
 *
 * Page 1 returns the newest window. When older pages were already loaded, the
 * refreshed window is unioned with them (never discarding history) and the
 * previously-known `hasMore` / page are preserved. For older pages the server's
 * `hasMore` and the requested page are authoritative.
 */
export function mergeFetchedPage(params: {
  baseMessages: ChatMessage[];
  incoming: ChatMessage[];
  page: number;
  serverHasMore: boolean;
  cached?: ConversationCacheEntry | null;
}): FetchedPageMerge {
  const messages = mergeMessageLists(params.baseMessages, params.incoming);
  if (params.page === 1) {
    return {
      messages,
      hasMore: params.cached ? params.cached.hasMore : params.serverHasMore,
      messagePage: params.cached ? Math.max(params.cached.messagePage, 1) : 1,
    };
  }
  return {
    messages,
    hasMore: params.serverHasMore,
    messagePage: params.page,
  };
}

/** A cache snapshot is fresh enough to skip a duplicate network round-trip. */
export function isConversationCacheFresh(
  entry: ConversationCacheEntry | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!entry?.loadedAt) return false;
  return now - entry.loadedAt < CONVERSATION_FRESH_MS;
}
