import { File } from "expo-file-system";
import { Room, RoomType, ChatMessage, ChatPermission, NotificationItem } from "@/types/chat.types";
import { formatClockTime, formatRelativeTime } from "@/utils/dateFormat";

// ─── Room Helpers ─────────────────────────────────────────────────────────────

/** Get the display name for a room. For DMs, show the other member's name. */
export function getRoomDisplayName(
  room: Room,
  currentUserId: number
): string {
  if (room.type === "direct") {
    const otherMember = room.members.find((m) => m.id !== currentUserId);
    if (otherMember) {
      return `${otherMember.first_name} ${otherMember.last_name}`;
    }
  }
  return room.name;
}

/** Get initials from a room for avatar display. */
export function getRoomInitials(
  room: Room,
  currentUserId: number
): string {
  if (room.type === "direct") {
    const otherMember = room.members.find((m) => m.id !== currentUserId);
    if (otherMember) {
      return otherMember.first_name.charAt(0).toUpperCase();
    }
  }
  return room.name.charAt(0).toUpperCase();
}

/** Get the avatar image URL for a room. For DMs, show the other member's image. */
export function getRoomAvatar(
  room: Room,
  currentUserId: number
): string | null {
  if (room.type === "direct") {
    const otherMember = room.members.find((m) => m.id !== currentUserId);
    if (otherMember?.image) {
      return otherMember.image;
    }
  }
  return null;
}

/** Check if a room has unread messages. */
export function isRoomUnread(room: Room): boolean {
  return room.unreadCount > 0 || room.force_unread;
}

/** Filter rooms by type. */
export function filterRoomsByType(
  rooms: Room[],
  type: RoomType
): Room[] {
  return rooms.filter((r) => r.type === type);
}

/** Filter rooms that are unread. */
export function filterUnreadRooms(rooms: Room[]): Room[] {
  return rooms.filter(isRoomUnread);
}

/** Filter rooms that are read (no unread). */
export function filterReadRooms(rooms: Room[]): Room[] {
  return rooms.filter((r) => !isRoomUnread(r));
}

// ─── Message Helpers ──────────────────────────────────────────────────────────

/** Get initials from a sender name. */
export function getMessageInitials(name?: string | null): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.charAt(0).toUpperCase();
}

/** Format a message timestamp for display. */
export function formatMessageTime(dateString?: string): string {
  return formatRelativeTime(dateString);
}

/** Format a message time for the chat list (shorter format). */
export function formatChatListTime(dateString?: string): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "";
  return formatClockTime(date, true);
}

/** Check if a message is from the current user. */
export function isOwnMessage(
  message: ChatMessage,
  currentUserId: number
): boolean {
  return message.sender_id === currentUserId;
}

/** Get the last message preview text for a room. */
export function getLastMessagePreview(message: ChatMessage): string {
  if (message.attachments && message.attachments.length > 0) {
    const count = message.attachments.length;
    return `📎 ${count} attachment${count > 1 ? "s" : ""}`;
  }
  return message.text || "";
}

// ─── Permission Helpers ───────────────────────────────────────────────────────

/** Check if a user can perform an action based on their permission level. */
export function canPerformAction(
  permission: ChatPermission | undefined,
  action: "view" | "comment" | "edit" | "delete" | "manage"
): boolean {
  switch (action) {
    case "view":
      return true;
    case "comment":
      return permission === "Full edit" || permission === "Edit" || permission === "Comment";
    case "edit":
      return permission === "Full edit" || permission === "Edit";
    case "delete":
      return permission === "Full edit";
    case "manage":
      return permission === "Full edit";
    default:
      return false;
  }
}

/** Get a permission label for display. */
export function getPermissionLabel(permission: ChatPermission): string {
  return permission;
}

// ─── Message Search ─────────────────────────────────────────────────────────

/** Client-side message search: matches text content and sender name. */
export function filterMessagesByText(
  messages: ChatMessage[],
  query: string
): ChatMessage[] {
  if (!query.trim()) return messages;
  const lower = query.toLowerCase();
  return messages.filter(
    (m) =>
      (m.text || "").toLowerCase().includes(lower) ||
      (m.sender_name || "").toLowerCase().includes(lower)
  );
}

// ─── Upload Helpers ───────────────────────────────────────────────────────────

/** Build a FormData object for sending a chat message with optional attachments. */
export function buildMessageFormData(params: {
  room_id: string;
  text: string;
  mentions?: number[];
  parent_id?: string;
  postType?: string;
  is_forwarded?: boolean;
  forwarded_from_name?: string;
  attachments?: Array<{ uri: string; name: string; type: string }>;
}): FormData {
  const formData = new FormData();
  formData.append("room_id", params.room_id);
  formData.append("text", params.text);

  if (params.mentions && params.mentions.length > 0) {
    formData.append("mentions", JSON.stringify(params.mentions));
  }
  if (params.parent_id) {
    formData.append("parent_id", params.parent_id);
  }
  if (params.postType) {
    formData.append("postType", params.postType);
  }
  if (params.is_forwarded) {
    formData.append("is_forwarded", String(params.is_forwarded));
  }
  if (params.forwarded_from_name) {
    formData.append("forwarded_from_name", params.forwarded_from_name);
  }
  if (params.attachments) {
    params.attachments.forEach((file) => {
      if (file && typeof file.uri === "string" && file.uri.length > 0) {
        formData.append("attachments", {
          uri: file.uri,
          name: file.name || `file_${Date.now()}`,
          type: file.type || "application/octet-stream",
        } as any);
      }
    });
  }

  return formData;
}

/** Resolve relative file URLs (e.g. /public/...) to absolute backend URLs for display & audio playback. */
export function resolveFileUrl(url?: string | null): string {
  if (!url) return "";
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("file://") ||
    url.startsWith("content://") ||
    url.startsWith("data:") ||
    url.startsWith("blob:")
  ) {
    return url;
  }
  const apiBase =
    process.env.EXPO_PUBLIC_API_BASE_URL ??
    "https://backend-planit.soulservices.com/api/v1";
  const serverOrigin = apiBase.replace(/\/api\/v1\/?$/, "");
  const cleanPath = url.startsWith("/") ? url : `/${url}`;
  return `${serverOrigin}${cleanPath}`;
}

/**
 * Build the authenticated `secure-file` proxy URL for a `/public/...` path.
 *
 * Direct static access to `/public/...` is disabled on the backend — every
 * file must be fetched through `GET {origin}/api/v1/secure-file?p=public/<path>`
 * with the auth token header (IMAGE_AND_AUDIO_HANDLING.md §4).
 */
export function resolveSecureFileUrl(url?: string | null): string {
  if (!url) return "";
  const apiBase =
    process.env.EXPO_PUBLIC_API_BASE_URL ??
    "https://backend-planit.soulservices.com/api/v1";
  const serverOrigin = apiBase.replace(/\/api\/v1\/?$/, "");
  const cleanPath = url.replace(/^\/+/, "");
  return `${serverOrigin}/api/v1/secure-file?p=${encodeURIComponent(cleanPath)}`;
}

/** Build a FormData object for editing a message. */
export function buildEditMessageFormData(params: {
  messageId: string;
  text: string;
  keepAttachmentIds?: string[];
  newAttachments?: Array<{ uri: string; name: string; type: string }>;
}): FormData {
  const formData = new FormData();
  formData.append("messageId", params.messageId);
  formData.append("text", params.text);

  if (params.keepAttachmentIds && params.keepAttachmentIds.length > 0) {
    formData.append(
      "keepAttachmentIds",
      JSON.stringify(params.keepAttachmentIds)
    );
  }
  if (params.newAttachments) {
    params.newAttachments.forEach((file) => {
      if (file && typeof file.uri === "string" && file.uri.length > 0) {
        formData.append("attachments", {
          uri: file.uri,
          name: file.name || `file_${Date.now()}`,
          type: file.type || "application/octet-stream",
        } as any);
      }
    });
  }

  return formData;
}

// ─── Date Helpers ─────────────────────────────────────────────────────────────

/** Group messages by date for display separators. */
export function groupMessagesByDate(
  messages: ChatMessage[]
): Map<string, ChatMessage[]> {
  const groups = new Map<string, ChatMessage[]>();

  messages.forEach((msg) => {
    const dateStr = msg.createdAt
      ? new Date(msg.createdAt).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "Unknown Date";

    const existing = groups.get(dateStr) || [];
    existing.push(msg);
    groups.set(dateStr, existing);
  });

  return groups;
}

/** Check if two dates are the same day. */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/** Determine whether a notification is a user-mention (chat or task mention). */
export function isMentionNotification(item: NotificationItem | null | undefined): boolean {
  if (!item) return false;
  const typ = (item.typ ?? "").toLowerCase();
  if (typ === "chat_mention" || typ === "task_mention" || typ === "mention") return true;
  if (typ.includes("mention")) return true;
  // Backend mention titles all begin with "mentioned you in" (e.g.
  // "Mentioned you in a comment", "mentioned you in a message").
  const title = (item.title ?? "").trim().toLowerCase();
  return title.startsWith("mentioned you");
}

/** Inline mention markup used by the backend: `@[Full Name](userId)`. */
const MENTION_MARKUP_REGEX = /@\[([^\]]+)\]\((\d+)\)/g;

/**
 * Convert inline mention markup (`@[Full Name](userId)`) to plain display text
 * (`@Full Name`). Non-matching text passes through unchanged, so it is safe to
 * apply to any comment/note text regardless of whether it contains mentions.
 */
export function mentionMarkupToDisplay(text?: string | null): string {
  if (!text) return "";
  return text.replace(MENTION_MARKUP_REGEX, "@$1");
}

/**
 * Extract the list of mentioned user ids from inline mention markup
 * (`@[Full Name](userId)`). Returns an empty array when the text has no
 * mentions. A plain `@Name` (without markup) cannot be matched to a user id.
 */
export function extractMentionedUserIds(text?: string | null): number[] {
  if (!text) return [];
  const ids: number[] = [];
  for (const match of text.matchAll(MENTION_MARKUP_REGEX)) {
    const id = Number(match[2]);
    if (Number.isFinite(id) && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Build a single inline mention markup token for a user: `@[Full Name](userId)`. */
export function buildMentionMarkup(userId: number, fullName: string): string {
  const clean = fullName.replace(/[\[\]()]/g, "").trim() || `User ${userId}`;
  return `@[${clean}](${userId})`;
}

/**
 * Build the display text for a notification from backend payload data only.
 *
 * The backend sends short labels (e.g. "Created a task") as the title and the
 * full sentence (e.g. "Hamza assigned Fix login screen to you") as the body,
 * so we prefer whichever field is longer and strip the actor name so it
 * renders once as the sender.
 *
 * Actor name resolution order (no hardcoded names):
 *  1. The `assigned` object embedded in the notification payload.
 *  2. The leading proper-noun in the backend message text ("<Name> assigned/…").
 *  3. Fallback label "System".
 */
export function getNotificationDisplay(item: NotificationItem | null | undefined): {
  name: string;
  message: string;
} {
  const title = (item?.title ?? "").trim();
  const description = (item?.description ?? "").trim();
  const text =
    mentionMarkupToDisplay(
      (description.length >= title.length ? description : title) || title
    );

  const assigned = item?.assigned;
  const assignedName = assigned
    ? `${assigned.first_name ?? ""} ${assigned.last_name ?? ""}`.trim()
    : "";

  if (assignedName) {
    // Strip the leading actor tokens (full name, first name, or last name)
    // from the message so the name renders exactly once as the sender.
    const nameParts = assignedName.toLowerCase().split(/\s+/);
    const tokens = text.split(/\s+/);
    let i = 0;
    while (i < tokens.length && nameParts.includes(tokens[i].toLowerCase())) {
      i++;
    }
    const rest = tokens.slice(i).join(" ").trim();
    return { name: assignedName, message: rest || text };
  }

  // No `assigned` object — detect "<Name> <verb> …" messages embedded in the
  // payload text. Case-sensitive so lowercase sentence leads (e.g. "has …")
  // are never mistaken for a person's name.
  const verbMatch = text.match(
    /^([A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*)?)\s+(assigned|reassigned|mentioned|commented|added you|invited you|changed|reopened|created|sent you a message)\b/
  );
  if (verbMatch) {
    const name = verbMatch[1].trim();
    const rest = text.slice(name.length).trim();
    return { name, message: rest || text };
  }

  return { name: "System", message: text || title };
}

/** Compile a deduplicated list of all company members from chat rooms, search results, and task owners. */
export function getCompanyMembersFromState(
  rooms: Room[],
  searchResults: Array<{ id: number; first_name?: string; last_name?: string; full_name?: string; email?: string }> = [],
  taskOwners: Array<{ id: number; first_name?: string; last_name?: string; name?: string; email?: string }> = [],
  currentUserId?: number
): Array<{ id: string; name: string; email?: string }> {
  const memberMap = new Map<string, { id: string; name: string; email?: string }>();

  // 1. Process searchResults from search API
  for (const u of searchResults || []) {
    if (currentUserId && u.id === currentUserId) continue;
    const name = u.full_name?.trim() || `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.email?.split("@")[0] || `User #${u.id}`;
    memberMap.set(String(u.id), { id: String(u.id), name, email: u.email });
  }

  // 2. Process all members across all chat rooms
  for (const r of rooms || []) {
    for (const m of r.members || []) {
      if (currentUserId && m.id === currentUserId) continue;
      const key = String(m.id);
      if (!memberMap.has(key)) {
        const name = `${m.first_name || ""} ${m.last_name || ""}`.trim() || m.email?.split("@")[0] || `User #${m.id}`;
        memberMap.set(key, { id: key, name, email: m.email });
      }
    }
  }

  // 3. Process all task owners (company members directory)
  for (const owner of taskOwners || []) {
    if (currentUserId && owner.id === currentUserId) continue;
    const key = String(owner.id);
    if (!memberMap.has(key)) {
      const name = owner.name?.trim() || `${owner.first_name || ""} ${owner.last_name || ""}`.trim() || owner.email?.split("@")[0] || `User #${owner.id}`;
      memberMap.set(key, { id: key, name, email: owner.email });
    }
  }

  return Array.from(memberMap.values());
}
