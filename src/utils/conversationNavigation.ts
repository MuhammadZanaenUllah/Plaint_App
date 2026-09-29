import { router } from "expo-router";
import { Room } from "@/types/chat.types";
import { getRoomDisplayName, getRoomInitials } from "@/utils/chatHelpers";

// ─── Conversation navigation guard ───────────────────────────────────────────
// The conversation screen is opened from several entry points (chat rows,
// channel rows, create-chat flows, the notifications inbox, OS push
// notifications and in-app toasts). Rapid repeated taps used to push the same
// conversation multiple times, forcing the user to close each copy one by one.
// Opening a conversation is therefore made idempotent per room:
//   • `mountedConversationRoomIds` — rooms whose conversation screen is
//     currently mounted (registered by conversation.tsx). Re-opening them
//     would stack a duplicate screen.
//   • `pendingConversationRoomId` — a room whose push was just triggered but
//     whose screen has not mounted yet. Covers taps that land in the same
//     frame, before the mount effect has run.
// The guard is cleared when the conversation screen unmounts, so the room can
// be opened again after the user leaves it. This is pure navigation
// de-duplication — the first open always goes through, and route params are
// never altered.

export type ConversationRouteParams = {
  roomId?: string;
  name?: string;
  initials?: string;
  isChannel?: string;
  roomType?: string;
};

const mountedConversationRoomIds = new Set<string>();
let pendingConversationRoomId: string | null = null;

/** Registers a mounted conversation screen (called by conversation.tsx). */
export function markConversationOpen(roomId?: string | null): void {
  const rid = roomId ? String(roomId) : "";
  if (!rid) return;
  mountedConversationRoomIds.add(rid);
  if (pendingConversationRoomId === rid) pendingConversationRoomId = null;
}

/** Unregisters a closed conversation screen (called by conversation.tsx). */
export function markConversationClosed(roomId?: string | null): void {
  const rid = roomId ? String(roomId) : "";
  if (!rid) return;
  mountedConversationRoomIds.delete(rid);
  if (pendingConversationRoomId === rid) pendingConversationRoomId = null;
}

/**
 * Pushes the conversation screen for the given route params, exactly once per
 * room. Returns `true` when navigation was triggered, `false` when it was
 * suppressed because that conversation is already open (or opening).
 */
export function openConversation(params: ConversationRouteParams): boolean {
  const roomId = params.roomId ? String(params.roomId) : "";
  if (!roomId) {
    // No room id to de-duplicate on (rare fallback path) — preserve the
    // previous navigation behavior.
    router.push({ pathname: "/conversation", params });
    return true;
  }
  if (
    mountedConversationRoomIds.has(roomId) ||
    pendingConversationRoomId === roomId
  ) {
    return false;
  }
  pendingConversationRoomId = roomId;
  router.push({ pathname: "/conversation", params: { ...params, roomId } });
  return true;
}

/** Convenience: opens the conversation for a room object + current user id. */
export function openRoomConversation(
  room: Room,
  currentUserId: number,
): boolean {
  return openConversation({
    roomId: room._id || String(room.id),
    name: getRoomDisplayName(room, currentUserId),
    initials: getRoomInitials(room, currentUserId),
    isChannel: String(room.type === "channel"),
    roomType: room.type,
  });
}