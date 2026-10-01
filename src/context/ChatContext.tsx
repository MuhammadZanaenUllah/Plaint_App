import { useNotifications } from "@/context/NotificationContext";
import { useAuth } from "@/hooks/useAuth";
import * as chatService from "@/services/api/chat.service";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as socketService from "@/services/socket/socketService";
import {
  ChatMessage,
  ChatState,
  CustomPostType,
  GetOrCreateRoomRequest,
  MemberPermission,
  MessageReaction,
  Room,
  RoomMember,
  SearchUser,
} from "@/types/chat.types";
import {
  getMessageInitials,
  isOwnMessage,
  isRoomUnread,
  isWithinMessageActionWindow,
} from "@/utils/chatHelpers";
import {
  openConversation,
  openRoomConversation,
} from "@/utils/conversationNavigation";
import { extractErrorMessage } from "@/utils/errorHandler";
import { showInfo } from "@/utils/toast";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";

// ─── Actions ──────────────────────────────────────────────────────────────────

type ChatAction =
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_MESSAGES_LOADING"; loading: boolean }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "LOAD_ROOMS"; rooms: Room[] }
  | { type: "SET_CURRENT_ROOM"; room: Room | null }
  | {
      type: "LOAD_MESSAGES";
      messages: ChatMessage[];
      hasMore: boolean;
      append: boolean;
    }
  | { type: "ADD_MESSAGE"; message: ChatMessage }
  | { type: "REPLACE_MESSAGE"; tempId: string; message: ChatMessage }
  | { type: "UPDATE_MESSAGE"; message: ChatMessage }
  | { type: "REMOVE_MESSAGE"; messageId: string }
  | { type: "SET_REACTIONS"; messageId: string; reactions: MessageReaction[] }
  | { type: "SET_PINNED"; messages: ChatMessage[] }
  | { type: "SET_PINNED_FLAGS"; pinnedIds: string[] }
  | { type: "SET_POST_TYPES"; postTypes: CustomPostType[] }
  | {
      type: "SET_ROOM_PERMISSIONS";
      permissions: MemberPermission[];
      createdBy: number;
    }
  | { type: "ADD_ROOM"; room: Room }
  | { type: "UPDATE_ROOM"; room: Room }
  // Targeted read/unread flag patch. Deliberately does NOT carry a room
  // snapshot so a read acknowledgement can never overwrite newer fields
  // (notably `last_message`) with a stale copy captured before the latest
  // realtime message was applied.
  | { type: "SET_ROOM_READ"; roomId: string; read: boolean }
  | { type: "REMOVE_ROOM"; roomId: string }
  | { type: "REMOVE_ROOM_MEMBER"; roomId: string; userId: number }
  | { type: "MERGE_ROOMS"; rooms: Room[] }
  | { type: "SET_MESSAGE_PAGE"; page: number }
  | { type: "SET_SEARCH_QUERY"; query: string }
  | { type: "SET_SEARCH_RESULTS"; results: SearchUser[] }
  | { type: "SET_SEARCHING"; searching: boolean }
  | { type: "SET_ONLINE_USERS"; userIds: string[] }
  | { type: "USER_ONLINE"; userId: string }
  | { type: "USER_OFFLINE"; userId: string }
  | { type: "LOGOUT" };

const initialState: ChatState = {
  rooms: [],
  currentRoom: null,
  messages: [],
  hasMore: false,
  messagePage: 1,
  pinnedMessages: [],
  postTypes: [],
  roomPermissions: [],
  roomCreator: null,
  loading: false,
  messagesLoading: false,
  error: null,
  searchQuery: "",
  searchResults: [],
  searching: false,
};

/**
 * Effective per-user history cutoff for a room: the timestamp from which the
 * user is allowed to see messages (older messages stay hidden).
 *
 * The locally recorded delete time is authoritative for "deleted for me"
 * because it is the (server-sourced) timestamp of the last message before the
 * deletion and is never mutated afterwards. The backend's `my_visible_from` is
 * used only as a fallback when there is no local record (e.g. the chat was
 * deleted for this user from another device). If we naively took the `max` of
 * both, a backend that bumps `my_visible_from` forward when it reactivates a
 * room would make the very first new message fall *at* the cutoff and be
 * wrongly hidden.
 */
function getRoomHistoryCutoff(
  room: Room | undefined,
  localCutoff?: string | null,
): string | null {
  if (localCutoff) return localCutoff;
  return room && room.type === "direct" ? (room.my_visible_from ?? null) : null;
}

/** Stable identity for a chat message across `_id` / numeric `id` shapes. */
function messageKey(message?: ChatMessage | null): string {
  if (!message) return "";
  return String(message._id ?? message.id ?? "");
}

/**
 * Whether a message belongs to the currently active conversation.
 *
 * `state.messages` is a single list that backs the ONE open conversation. An
 * incoming message must only be appended to it when its `room_id` matches the
 * active room (Mongo `_id`, or the numeric `id` as a fallback). This is the
 * authoritative guard that keeps a message from another 1:1/channel from
 * leaking into the chat screen that happens to be open.
 */
function messageBelongsToRoom(
  message: ChatMessage | null | undefined,
  room: Room | null | undefined,
): boolean {
  if (!message || !room) return false;
  const msgRoomId = message.room_id != null ? String(message.room_id) : "";
  if (!msgRoomId) return false;
  return (
    (room._id != null && msgRoomId === String(room._id)) ||
    (room.id != null && msgRoomId === String(room.id))
  );
}

/**
 * Return a copy of `room` whose preview/unread reflect an incoming message.
 *
 * The chat list only renders a DM once it has an unread count or a
 * `last_message` (see chat.tsx `displayRooms`). A brand-new room is added to
 * local state (via `/chat/rooms`, `get-or-create-room`, or the `newRoom`
 * socket event) without that preview, so a first-time incoming message was
 * filtered out until a later message happened to arrive while the room was
 * already known. Applying the triggering message here makes the chat appear
 * immediately.
 */
function withIncomingMessage(
  room: Room,
  message: ChatMessage,
  currentUserId: number,
  isCurrentRoom: boolean,
): Room {
  const isFromOther = String(message.sender_id) !== String(currentUserId);
  const unreadCount =
    isFromOther && !isCurrentRoom
      ? Math.max(room.unreadCount ?? 0, 1)
      : (room.unreadCount ?? 0);
  return {
    ...room,
    unreadCount,
    last_message: {
      text: message.text,
      sender_name: message.sender_name,
      createdAt: message.createdAt ?? new Date().toISOString(),
      attachments: message.attachments,
    },
  };
}

/**
 * Merge a server snapshot of a room with the previously-known local copy,
 * preferring whichever carries the newer `last_message` (and keeping the
 * higher unread count). Prevents a room-list refresh whose payload lags the
 * socket message from wiping a just-received preview and hiding the chat.
 */
function preferNewerRoomSnapshot(prev: Room | undefined, next: Room): Room {
  if (!prev) return next;
  const prevAt = prev.last_message?.createdAt
    ? new Date(prev.last_message.createdAt).getTime()
    : 0;
  const nextAt = next.last_message?.createdAt
    ? new Date(next.last_message.createdAt).getTime()
    : 0;
  if (prevAt <= nextAt) return next;
  return {
    ...next,
    last_message: prev.last_message,
    unreadCount: Math.max(next.unreadCount ?? 0, prev.unreadCount ?? 0),
  };
}

/**
 * Union two pinned-message lists, de-duplicated by message id (server list
 * first, then locally-recorded pins). The backend's `GET /chat/pins/:roomId`
 * is the source of truth for pins made by anyone, but on deployments that only
 * retain a single pinned message per room, this guarantees the current user's
 * multiple pins stay visible and survive reopening the chat.
 */
function mergePinnedMessages(
  a: ChatMessage[],
  b: ChatMessage[],
): ChatMessage[] {
  const seen = new Set<string>();
  const out: ChatMessage[] = [];
  for (const m of [...a, ...b]) {
    const key = messageKey(m);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, loading: action.loading };
    case "SET_MESSAGES_LOADING":
      return { ...state, messagesLoading: action.loading };
    case "SET_ERROR":
      return {
        ...state,
        error: action.error,
        loading: false,
        messagesLoading: false,
      };
    case "LOAD_ROOMS": {
      // Preserve a locally-known, newer preview/unread for rooms whose server
      // payload is behind (e.g. the first message of a brand-new chat).
      const prevById = new Map(state.rooms.map((r) => [r._id, r]));
      const rooms = action.rooms.map((room) =>
        preferNewerRoomSnapshot(prevById.get(room._id), room),
      );
      return { ...state, rooms, loading: false, error: null };
    }
    case "SET_CURRENT_ROOM": {
      if (!action.room) {
        return {
          ...state,
          currentRoom: null,
        };
      }
      const isSameRoom =
        state.currentRoom &&
        (state.currentRoom._id === action.room._id || state.currentRoom.id === action.room.id);
      if (isSameRoom) {
        return {
          ...state,
          currentRoom: action.room,
        };
      }
      return {
        ...state,
        currentRoom: action.room,
        messages: [],
        messagePage: 1,
        hasMore: false,
      };
    }
    case "LOAD_MESSAGES":
      return {
        ...state,
        messages: action.append
          ? [...action.messages, ...state.messages]
          : action.messages,
        hasMore: action.hasMore,
        messagesLoading: false,
      };
    case "ADD_MESSAGE": {
      // Cross-room contamination guard: `state.messages` only ever backs the
      // currently open conversation. A message from any other room must NOT be
      // appended here — it is still handled by the socket listener's room-list /
      // unread / toast logic and is loaded from the API when its own
      // conversation is opened. Without this check, an incoming message from
      // (e.g.) Nida leaked into an open Areeb↔Awais chat.
      if (!messageBelongsToRoom(action.message, state.currentRoom)) {
        return state;
      }

      const newIdStr = String(action.message._id ?? action.message.id ?? "");
      const existsIndex = state.messages.findIndex((m) => {
        if (action.message._id && m._id && String(m._id) === String(action.message._id)) return true;
        if (action.message.id && m.id && String(m.id) === String(action.message.id)) return true;
        if (newIdStr && (String(m._id) === newIdStr || String(m.id) === newIdStr)) return true;
        return false;
      });

      if (existsIndex >= 0) {
        const updated = [...state.messages];
        updated[existsIndex] = { ...updated[existsIndex], ...action.message };
        return { ...state, messages: updated };
      }

      const normalized = {
        ...action.message,
        _id: String(action.message._id ?? action.message.id ?? `msg-${Date.now()}-${Math.random()}`),
      };
      return { ...state, messages: [...state.messages, normalized] };
    }
    case "REPLACE_MESSAGE": {
      // Swap the optimistic "sending" placeholder for the real message.
      // Remove the placeholder first, then merge the real message (update in
      // place if it already arrived via the socket echo, else append).
      let messages = state.messages.filter(
        (m) =>
          String(m._id) !== String(action.tempId) &&
          String(m.id) !== String(action.tempId),
      );
      // Never surface a message for a different room in the open conversation
      // (e.g. a message forwarded to another room).
      if (!messageBelongsToRoom(action.message, state.currentRoom)) {
        return messages.length === state.messages.length
          ? state
          : { ...state, messages };
      }
      const realId = String(action.message._id ?? action.message.id ?? "");
      const idx = messages.findIndex((m) => {
        if (action.message._id && m._id && String(m._id) === String(action.message._id)) return true;
        if (action.message.id && m.id && String(m.id) === String(action.message.id)) return true;
        if (realId && (String(m._id) === realId || String(m.id) === realId)) return true;
        return false;
      });
      if (idx >= 0) {
        messages = messages.map((m, i) =>
          i === idx ? { ...m, ...action.message } : m,
        );
      } else {
        messages = [...messages, action.message];
      }
      return { ...state, messages };
    }
    case "UPDATE_MESSAGE":
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.message.id ? action.message : m,
        ),
      };
    case "REMOVE_MESSAGE":
      return {
        ...state,
        messages: state.messages.filter(
          (m) =>
            String(m._id) !== String(action.messageId) &&
            String(m.id) !== String(action.messageId),
        ),
      };
    case "SET_REACTIONS":
      return {
        ...state,
        messages: state.messages.map((m) =>
          m._id === action.messageId
            ? { ...m, reactions: action.reactions }
            : m,
        ),
      };
    case "SET_PINNED":
      return { ...state, pinnedMessages: action.messages };
    case "SET_PINNED_FLAGS": {
      const pinned = new Set(action.pinnedIds);
      let changed = false;
      const messages = state.messages.map((m) => {
        const want = pinned.has(messageKey(m));
        if (!!m.is_pinned === want) return m;
        changed = true;
        return { ...m, is_pinned: want };
      });
      return changed ? { ...state, messages } : state;
    }
    case "SET_POST_TYPES":
      return { ...state, postTypes: action.postTypes };
    case "SET_ROOM_PERMISSIONS":
      return {
        ...state,
        roomPermissions: action.permissions,
        roomCreator: action.createdBy,
      };
    case "ADD_ROOM": {
      const existing = state.rooms.find((r) => r.id === action.room.id);
      if (existing) {
        const mergedRoom = preferNewerRoomSnapshot(existing, action.room);
        return {
          ...state,
          rooms: state.rooms.map((r) =>
            r.id === action.room.id ? mergedRoom : r,
          ),
        };
      }
      return { ...state, rooms: [action.room, ...state.rooms] };
    }
    case "UPDATE_ROOM":
      if (!action.room) return state;
      return {
        ...state,
        rooms: state.rooms.map((r) =>
          r.id === action.room.id ? action.room : r,
        ),
        currentRoom:
          state.currentRoom?.id === action.room.id
            ? action.room
            : state.currentRoom,
      };
    case "SET_ROOM_READ": {
      // Patch only the read/unread flags. Every other field — crucially
      // `last_message`, which realtime messages keep advancing — is preserved,
      // so a read call resolving late can never roll the chat-list preview back
      // to the message that was present when the call was made.
      const patch = (room: Room): Room => ({
        ...room,
        unreadCount: action.read ? 0 : room.unreadCount,
        force_unread: action.read ? false : true,
      });
      return {
        ...state,
        rooms: state.rooms.map((r) =>
          r._id === action.roomId ? patch(r) : r,
        ),
        currentRoom:
          state.currentRoom?._id === action.roomId
            ? patch(state.currentRoom)
            : state.currentRoom,
      };
    }
    case "REMOVE_ROOM":
      return {
        ...state,
        rooms: state.rooms.filter((r) => r._id !== action.roomId),
        currentRoom:
          state.currentRoom?._id === action.roomId ? null : state.currentRoom,
      };
    case "REMOVE_ROOM_MEMBER": {
      // A member left / was removed. Drop them from the room's member list and
      // from the per-room permission map (the "Chat members" panel is driven by
      // `roomPermissions`, so a stale entry there would show a nameless
      // "User #id" with edit/remove controls and inflate the member count).
      const strip = (members: RoomMember[]) =>
        members.filter((m) => String(m.id) !== String(action.userId));
      const isCurrent = state.currentRoom?._id === action.roomId;
      return {
        ...state,
        rooms: state.rooms.map((r) =>
          r._id === action.roomId ? { ...r, members: strip(r.members) } : r,
        ),
        currentRoom: isCurrent
          ? { ...state.currentRoom!, members: strip(state.currentRoom!.members) }
          : state.currentRoom,
        roomPermissions: isCurrent
          ? state.roomPermissions.filter(
              (p) => String(p.userId) !== String(action.userId),
            )
          : state.roomPermissions,
      };
    }
    case "MERGE_ROOMS": {
      // Server list is the source of truth for room membership, but local
      // unread state (badges, force_unread, mute) must never be clobbered by
      // a background merge — used to pick up newly-created project rooms
      // after a `project_update` socket event.
      const merged = [...state.rooms];
      for (const room of action.rooms) {
        const idx = merged.findIndex(
          (r) => r._id === room._id || (room.id && r.id === room.id),
        );
        if (idx >= 0) {
          const prev = merged[idx];
          const base = preferNewerRoomSnapshot(prev, room);
          merged[idx] = {
            ...base,
            unreadCount: prev.unreadCount ?? 0,
            force_unread: prev.force_unread ?? false,
            is_muted: prev.is_muted ?? room.is_muted,
          };
        } else {
          merged.push(room);
        }
      }
      return { ...state, rooms: merged, loading: false, error: null };
    }
    case "SET_MESSAGE_PAGE":
      return { ...state, messagePage: action.page };
    case "SET_SEARCH_QUERY":
      return { ...state, searchQuery: action.query };
    case "SET_SEARCH_RESULTS":
      return { ...state, searchResults: action.results, searching: false };
    case "SET_SEARCHING":
      return { ...state, searching: action.searching };
    case "SET_ONLINE_USERS":
      return {
        ...state,
        rooms: state.rooms.map((r) => ({
          ...r,
          members: r.members.map((m) => ({
            ...m,
            isOnline: action.userIds.includes(String(m.id)),
          })),
        })),
      };
    case "USER_ONLINE":
      return {
        ...state,
        rooms: state.rooms.map((r) => ({
          ...r,
          members: r.members.map((m) =>
            String(m.id) === action.userId ? { ...m, isOnline: true } : m,
          ),
        })),
      };
    case "USER_OFFLINE":
      return {
        ...state,
        rooms: state.rooms.map((r) => ({
          ...r,
          members: r.members.map((m) =>
            String(m.id) === action.userId ? { ...m, isOnline: false } : m,
          ),
        })),
      };
    case "LOGOUT":
      return initialState;
    default:
      return state;
  }
}

// ─── Context Value ────────────────────────────────────────────────────────────

// Typing/presence state changes on nearly every socket event (typing pings,
// online/offline blips) but only conversation.tsx actually reads it. Keeping
// it out of ChatContextValue means chat.tsx, InboxModal, notifications.tsx,
// etc. — which call useChat() for room/message data only — don't re-render
// on every one of those events. See ChatPresenceContext/useChatPresence below.
export type ChatPresenceValue = {
  socketConnected: boolean;
  onlineUserIds: string[];
  typingUsers: Map<string, Map<number, string>>;
};

export type ChatContextValue = {
  state: ChatState;

  // Exposed state for direct access
  postTypes: CustomPostType[];
  roomPermissions: MemberPermission[];
  roomCreator: number | null;

  // Room actions
  fetchRooms: (opts?: { silent?: boolean }) => Promise<void>;
  getOrCreateRoom: (data: GetOrCreateRoomRequest) => Promise<Room>;
  setCurrentRoom: (room: Room | null) => void;
  deleteRoom: (roomId: string) => Promise<void>;
  leaveRoom: (roomId: string) => Promise<void>;
  hideRoom: (roomId: string) => Promise<void>;
  muteRoom: (roomId: string) => Promise<boolean>;
  clearMessages: (roomId: string) => Promise<void>;

  // Chats the user deleted for themselves (1:1 hide-room) that have had no new
  // activity since. Derived from persisted cutoffs + the room list, so a new
  // incoming message makes the chat reappear automatically.
  hiddenRoomIds: Set<string>;

  // Message actions
  fetchMessages: (roomId: string, page?: number) => Promise<void>;
  sendMessage: (params: {
    room_id: string;
    text: string;
    mentions?: number[];
    parent_id?: string;
    postType?: string;
    is_forwarded?: boolean;
    forwarded_from_name?: string;
    attachments?: Array<{ uri: string; name: string; type: string }>;
    onUploadProgress?: (progress: {
      loaded: number;
      total: number;
      percentage: number;
    }) => void;
    abortUpload?: React.MutableRefObject<{ abort: () => void } | null>;
  }) => Promise<ChatMessage>;
  editMessage: (params: {
    messageId: string;
    text: string;
    keepAttachmentIds?: string[];
    newAttachments?: Array<{ uri: string; name: string; type: string }>;
  }) => Promise<ChatMessage>;
  deleteMessage: (
    messageId: string,
    deleteFor: "me" | "everyone",
  ) => Promise<void>;

  // Reaction actions
  toggleReaction: (messageId: string, emoji: string) => Promise<void>;

  // Pin actions
  togglePin: (messageId: string, roomId?: string) => Promise<void>;
  fetchPinnedMessages: (roomId: string) => Promise<void>;

  // Member actions
  addMember: (roomId: string, userId: number) => Promise<void>;
  removeMember: (roomId: string, userId: number) => Promise<void>;

  // Post type actions
  fetchPostTypes: (roomId: string) => Promise<void>;
  createPostType: (
    roomId: string,
    name: string,
    color: string,
    icon: string,
  ) => Promise<void>;
  deletePostType: (roomId: string, name: string) => Promise<void>;

  // Permission actions
  fetchRoomPermissions: (roomId: string) => Promise<void>;
  updatePermission: (
    roomId: string,
    userId: number,
    permission: string,
  ) => Promise<void>;

  // Read state actions
  markRead: (roomId: string) => Promise<void>;
  markUnread: (roomId: string) => Promise<void>;

  // Invitation actions
  inviteUser: (
    roomId: string,
    email: string,
    userId: number,
    permission: string,
  ) => Promise<string>;
  generateLink: (
    roomId: string,
    permission: string,
    allowedUserIds: number[],
  ) => Promise<string>;

  // Search actions
  searchUsers: (query: string) => Promise<void>;
  setSearchQuery: (query: string) => void;

  // URL preview
  getUrlPreview: (url: string) => Promise<{
    title: string;
    description: string;
    images: string[];
  } | null>;

  // Socket actions
  initSocket: (userId: number) => Promise<void>;
  cleanupChatListeners: () => void;
  cleanupSocket: () => void;

  logout: () => void;
};

const ChatContext = createContext<ChatContextValue | null>(null);
const ChatPresenceContext = createContext<ChatPresenceValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [typingUsers, setTypingUsers] = useState<
    Map<string, Map<number, string>>
  >(new Map());
  const socketCleanupRef = useRef<Array<() => void>>([]);
  // The socket instance the current listeners are attached to. Used to detect
  // a replaced/disconnected socket (logout → next login) so `initSocket` can
  // register fresh instead of trusting stale subscriptions.
  const registeredSocketRef = useRef<Awaited<
    ReturnType<typeof socketService.connectSocket>
  > | null>(null);

  const { addNotification } = useNotifications();

  // ── State refs for socket listeners (avoid stale closures) ──────────────
  const stateRef = useRef(state);
  stateRef.current = state;
  const userIdRef = useRef(0);
  // Current user's display name, used to label optimistic "sending" messages.
  const currentUserNameRef = useRef("");

  const { state: authState } = useAuth();
  useEffect(() => {
    const first = authState.user?.first_name ?? "";
    const last = authState.user?.last_name ?? "";
    currentUserNameRef.current = `${first} ${last}`.trim();
  }, [authState.user?.first_name, authState.user?.last_name]);
  const companyIdRef = useRef<number | null>(null);
  useEffect(() => {
    companyIdRef.current = authState.company?.company_id ?? null;
  }, [authState.company?.company_id]);
  // Current user's module-level permissions ("chat-list", "project-list", …),
  // read by socket listeners without stale-closure issues.
  const userPermissionsRef = useRef<string[]>([]);
  useEffect(() => {
    userPermissionsRef.current = authState.user?.user_permissions ?? [];
  }, [authState.user?.user_permissions]);
  const projectUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // ── "Deleted for me" chats (1:1 hide-room) ───────────────────────────────
  // Map roomId → ISO timestamp of when the user deleted the chat for
  // themselves (WhatsApp semantics). Persisted per user and used for two
  // things:
  //   1. Keeping the chat hidden from the list until new activity arrives.
  //   2. Enforcing the per-user history cutoff (messages before the cutoff
  //      stay hidden) — layered on top of the backend's `my_visible_from`.
  // It is intentionally NOT cleared when the chat reappears, so old history
  // never leaks back in.
  const [chatCutoffs, setChatCutoffs] = useState<Record<string, string>>({});
  const chatCutoffsRef = useRef(chatCutoffs);
  useEffect(() => {
    chatCutoffsRef.current = chatCutoffs;
  }, [chatCutoffs]);

  // Session guards/state used to reactivate a chat the user deleted for
  // themselves the moment its first new message arrives (see
  // `reactivateDeletedChat`). All are refs so the once-registered socket
  // listener can use them without stale closures.
  const reactivatedRoomsRef = useRef<Set<string>>(new Set());
  const pendingUnknownMessagesRef = useRef<Map<string, ChatMessage>>(new Map());
  // Incoming messages for rooms not yet in local state, held until the room is
  // added (via /chat/rooms, get-or-create or the `newRoom` socket event) so a
  // first-time chat shows up in the list with its preview/unread immediately.
  const pendingIncomingRef = useRef<Map<string, ChatMessage>>(new Map());
  const cutoffsLoadedRef = useRef(false);
  const reactivateDeletedChatRef = useRef<
    (roomId: string, message: ChatMessage) => void
  >(() => {});
  // Assigned once `fetchRooms` exists (below). Lets the socket listener and the
  // deferred cutoff loader trigger a list refresh.
  const fetchRoomsRef = useRef<
    ((opts?: { silent?: boolean }) => Promise<void>) | null
  >(null);
  // Assigned once `openChatRoomFromNotification` exists (below). Lets the
  // once-registered socket listener open the room a toast belongs to without
  // making `initSocket` unstable (which would re-register every listener).
  const openChatRoomRef = useRef<
    (roomId: string, senderName?: string) => void
  >(() => {});
  // Assigned once `markReadAction` exists (below) so the notification-toast
  // navigation can clear the room's unread badge without an unstable dep.
  const markReadRef = useRef<(roomId: string) => Promise<void>>(
    async () => {},
  );

  const persistChatCutoffs = useCallback(
    (cutoffs: Record<string, string>, uid: number) => {
      if (!uid) return;
      AsyncStorage.setItem(
        `planit_chat_cutoffs_${uid}`,
        JSON.stringify(cutoffs),
      ).catch(() => {});
    },
    [],
  );

  // Keep the socket-user id ref current even before initSocket runs (e.g. a
  // deep link straight into a conversation).
  useEffect(() => {
    if (authState.user?.id) userIdRef.current = authState.user.id;
  }, [authState.user?.id]);

  // Load persisted cutoffs for the signed-in user.
  useEffect(() => {
    let cancelled = false;
    cutoffsLoadedRef.current = false;
    // Reset per-session reactivation state when the signed-in user changes.
    reactivatedRoomsRef.current.clear();
    pendingUnknownMessagesRef.current.clear();
    pendingIncomingRef.current.clear();
    (async () => {
      const uid = authState.user?.id ?? 0;
      const loaded: Record<string, string> = {};
      if (uid) {
        try {
          const raw = await AsyncStorage.getItem(`planit_chat_cutoffs_${uid}`);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (
              parsed &&
              typeof parsed === "object" &&
              !Array.isArray(parsed)
            ) {
              for (const [key, value] of Object.entries(parsed)) {
                if (typeof value === "string") loaded[key] = value;
              }
            }
          }
        } catch {
          // ignore malformed cache
        }
      }
      if (cancelled) return;
      setChatCutoffs(loaded);
      cutoffsLoadedRef.current = true;
      // Replay any messages that arrived before the cutoffs finished loading
      // (otherwise the very first message after a restart could be missed).
      const pending = Array.from(
        pendingUnknownMessagesRef.current.entries(),
      );
      pendingUnknownMessagesRef.current.clear();
      for (const [rid, msg] of pending) {
        if (loaded[rid]) {
          reactivateDeletedChatRef.current(rid, msg);
        } else {
          socketService.joinChatRoom(rid);
          pendingIncomingRef.current.set(rid, msg);
          fetchRoomsRef.current?.({ silent: true })?.catch(() => {});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authState.user?.id]);

  // A chat is hidden from the list while its effective cutoff is at/after the
  // latest activity — i.e. nothing new has happened since the user deleted it.
  const hiddenRoomIds = useMemo(() => {
    const ids = new Set<string>();
    if (state.rooms.length === 0) return ids;
    for (const roomId of Object.keys(chatCutoffs)) {
      const room = state.rooms.find((r) => r._id === roomId);
      const cutoff = getRoomHistoryCutoff(room, chatCutoffs[roomId]);
      if (!cutoff) continue;
      const lastAt = room?.last_message?.createdAt;
      if (!lastAt || new Date(lastAt).getTime() <= new Date(cutoff).getTime()) {
        ids.add(roomId);
      }
    }
    return ids;
  }, [chatCutoffs, state.rooms]);

  // Keep deleted-for-me rooms subscribed so their next message is delivered
  // even while the room is absent from /chat/rooms.
  useEffect(() => {
    if (!socketConnected) return;
    Object.keys(chatCutoffs).forEach((rid) => {
      socketService.joinChatRoom(rid);
    });
  }, [chatCutoffs, socketConnected]);

  // ── Pinned messages (multi-pin, per user) ────────────────────────────────
  // `GET /chat/pins/:roomId` is the source of truth for pins made by anyone.
  // On deployments that only retain one pinned message per room, we additionally
  // remember the pins this user performed (persisted per user, per room) and
  // union them with the server list, so multiple pins remain visible and
  // survive closing/reopening the chat.
  const [localPins, setLocalPins] = useState<Record<string, ChatMessage[]>>({});
  const localPinsRef = useRef(localPins);
  useEffect(() => {
    localPinsRef.current = localPins;
  }, [localPins]);
  // Last server-returned pin list per room (used to decide whether an unpin
  // actually needs a server call or is only a local-only pin).
  const serverPinsRef = useRef<Record<string, ChatMessage[]>>({});

  const persistLocalPins = useCallback(
    (pins: Record<string, ChatMessage[]>, uid: number) => {
      if (!uid) return;
      AsyncStorage.setItem(
        `planit_chat_pins_${uid}`,
        JSON.stringify(pins),
      ).catch(() => {});
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const uid = authState.user?.id ?? 0;
      if (!uid) {
        if (!cancelled) setLocalPins({});
        serverPinsRef.current = {};
        return;
      }
      try {
        const raw = await AsyncStorage.getItem(`planit_chat_pins_${uid}`);
        if (cancelled || !raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const clean: Record<string, ChatMessage[]> = {};
          for (const [key, value] of Object.entries(parsed)) {
            if (Array.isArray(value)) clean[key] = value as ChatMessage[];
          }
          setLocalPins(clean);
        }
      } catch {
        // ignore malformed cache
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authState.user?.id]);

  // ── Room Actions ──────────────────────────────────────────────────────────

  // Attach any remembered incoming message to the matching rooms as they enter
  // local state, then clear the consumed entries.
  const applyPendingIncoming = useCallback((rooms: Room[]): Room[] => {
    if (pendingIncomingRef.current.size === 0) return rooms;
    return rooms.map((room) => {
      const message = pendingIncomingRef.current.get(room._id);
      if (!message) return room;
      pendingIncomingRef.current.delete(room._id);
      return withIncomingMessage(
        room,
        message,
        userIdRef.current,
        stateRef.current.currentRoom?._id === room._id,
      );
    });
  }, []);

  const fetchRooms = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) dispatch({ type: "SET_LOADING", loading: true });
    try {
      const res = await chatService.getRooms();
      console.log("[Chat] fetchRooms response:", {
        Good: res.Good,
        roomCount: res.rooms?.length,
      });
      if (res.Good) {
        console.log(
          "[Chat] First room sample:",
          JSON.stringify(res.rooms?.[0]).slice(0, 500),
        );
        // Preserve deleted-for-me chats that have already been reactivated by
        // an incoming message: some backends keep hiding such a room from
        // /chat/rooms until the user re-enters it, which would otherwise drop
        // the just-reappeared chat on the next refresh.
        const serverIds = new Set(res.rooms.map((r) => r._id));
        const preserved = stateRef.current.rooms.filter(
          (r) => reactivatedRoomsRef.current.has(r._id) && !serverIds.has(r._id),
        );
        // Merge in any pending incoming message so a newly-created room is not
        // dropped from the list for lacking a last_message.
        dispatch({
          type: "LOAD_ROOMS",
          rooms: applyPendingIncoming([...res.rooms, ...preserved]),
        });
      } else {
        dispatch({ type: "SET_ERROR", error: "Failed to load rooms" });
      }
    } catch (error) {
      console.log("[Chat] fetchRooms error:", error);
      dispatch({ type: "SET_ERROR", error: extractErrorMessage(error) });
    }
  }, [applyPendingIncoming]);
  // Expose fetchRooms to the once-registered socket listener and the deferred
  // cutoff loader (the ref itself is declared with the hidden-chat state).
  useEffect(() => {
    fetchRoomsRef.current = fetchRooms;
  }, [fetchRooms]);

  const getOrCreateRoom = useCallback(
    async (data: GetOrCreateRoomRequest): Promise<Room> => {
      console.log("[Chat] getOrCreateRoom:", data);
      const res = await chatService.getOrCreateRoom(data);
      console.log("[Chat] getOrCreateRoom response:", {
        Good: res.Good,
        roomId: res.room?.id,
        roomType: res.room?.type,
      });
      if (res.Good && res.room) {
        // If a message arrived for this room before it was loaded, attach it as
        // the preview/unread so a first-time chat appears immediately.
        const pending = pendingIncomingRef.current.get(res.room._id);
        let room = res.room;
        if (pending) {
          pendingIncomingRef.current.delete(res.room._id);
          room = withIncomingMessage(
            res.room,
            pending,
            userIdRef.current,
            stateRef.current.currentRoom?._id === res.room._id,
          );
        }
        dispatch({ type: "ADD_ROOM", room });
        return room;
      }
      throw new Error("Failed to create room");
    },
    [],
  );

  // Reactivate a chat the user deleted for themselves the moment its first new
  // message arrives. GET /chat/rooms omits (or hides) such a room, so unlike a
  // normal incoming message it cannot be surfaced by merging `last_message`
  // into an existing local room — the room object itself is missing.
  //
  // This performs exactly the initialization the manual "New Chat → <user>"
  // flow performs: POST /chat/get-or-create-room returns the authoritative
  // room object (regardless of its hidden-for-me state), which we add to local
  // state, and then we subscribe the socket to that room. Without this, the
  // very first incoming message after a delete/restart was received (toast
  // shown) but the chat never appeared until the user opened it manually.
  const reactivateDeletedChat = useCallback(
    async (roomId: string, message: ChatMessage) => {
      // Only reactivate chats this user explicitly deleted for themselves, and
      // only once per app session unless re-deleted.
      if (!chatCutoffsRef.current[roomId]) return;
      if (reactivatedRoomsRef.current.has(roomId)) return;
      reactivatedRoomsRef.current.add(roomId);
      try {
        const room = await getOrCreateRoom({
          type: "direct",
          targetId: Number(message.sender_id),
        });
        // Subscribe to the room so future messages are delivered/joined.
        socketService.joinChatRoom(room._id);
        // Ensure the local room reflects the incoming message so it clears the
        // local hidden state (a newer message is by definition after the
        // cutoff) — do not depend on the server echoing last_message back.
        dispatch({
          type: "ADD_ROOM",
          room: {
            ...room,
            unreadCount: Math.max(room.unreadCount ?? 0, 1),
            force_unread: room.force_unread ?? false,
            last_message: {
              text: message.text,
              sender_name: message.sender_name,
              createdAt: message.createdAt ?? new Date().toISOString(),
              attachments: message.attachments,
            },
          },
        });
      } catch {
        // Allow a retry on the next incoming message.
        reactivatedRoomsRef.current.delete(roomId);
        throw new Error("Failed to reactivate room");
      }
    },
    [getOrCreateRoom],
  );

  useEffect(() => {
    reactivateDeletedChatRef.current = (roomId, message) => {
      reactivateDeletedChat(roomId, message).catch(() => {});
    };
  }, [reactivateDeletedChat]);

  const setCurrentRoom = useCallback((room: Room | null) => {
    dispatch({ type: "SET_CURRENT_ROOM", room });
  }, []);

  const deleteRoom = useCallback(async (roomId: string) => {
    const res = await chatService.deleteRoom(roomId);
    if (!res.Good) {
      console.log(res.message ?? "Failed to delete room");
    }
    socketService.emitRoomDeleted(roomId);
    dispatch({ type: "REMOVE_ROOM", roomId });
  }, []);

  const leaveRoom = useCallback(async (roomId: string) => {
    const res = await chatService.leaveRoom(roomId);
    if (!res.Good) {
      console.log(res.message ?? "Failed to leave room");
    }
    socketService.leaveChatRoom(roomId, userIdRef.current);
    dispatch({ type: "REMOVE_ROOM", roomId });
  }, []);

  const hideRoom = useCallback(
    async (roomId: string) => {
      const res = await chatService.hideRoom(roomId);
      if (!res.Good) {
        console.log("Failed to hide room");
      }
      // Prefer the last message's (server) timestamp as the cutoff: it is on
      // the same clock as incoming messages, so device/server clock skew can
      // never leak a pre-deletion message or wrongly hide a new one. Fall back
      // to now only when there is no message to anchor to.
      const existing = stateRef.current.rooms.find((r) => r._id === roomId);
      const lastAt = existing?.last_message?.createdAt;
      const cutoff = lastAt ?? new Date().toISOString();
      // Re-arm automatic reactivation for this room (a second delete must
      // trigger it again on the next incoming message).
      reactivatedRoomsRef.current.delete(roomId);
      setChatCutoffs((prev) => {
        const next = { ...prev, [roomId]: cutoff };
        persistChatCutoffs(next, userIdRef.current);
        return next;
      });
    },
    [persistChatCutoffs],
  );

  const muteRoom = useCallback(
    async (roomId: string): Promise<boolean> => {
      const res = await chatService.muteRoom(roomId);
      if (!res.Good) {
        console.log("Failed to mute room");
      }
      const isMuted = res.data?.is_muted ?? false;
      // Update room in state
      const room = state.rooms.find((r) => r._id === roomId);
      if (room) {
        dispatch({
          type: "UPDATE_ROOM",
          room: { ...room, is_muted: isMuted },
        });
      }
      return isMuted;
    },
    [state.rooms],
  );

  const clearMessages = useCallback(async (roomId: string) => {
    const res = await chatService.clearMessages(roomId);
    if (!res.Good) {
      console.log(res.message ?? "Failed to clear messages");
    }
    socketService.emitChatCleared(roomId);
    dispatch({
      type: "LOAD_MESSAGES",
      messages: [],
      hasMore: false,
      append: false,
    });
  }, []);

  // ── Message Actions ─────────────────────────────────────────────────────

  const fetchMessages = useCallback(async (roomId: string, page = 1) => {
    dispatch({ type: "SET_MESSAGES_LOADING", loading: true });
    try {
      // Only load messages at/after the user's history cutoff so a chat they
      // deleted for themselves never shows pre-deletion history again.
      const room = stateRef.current.rooms.find((r) => r._id === roomId);
      const after =
        getRoomHistoryCutoff(room, chatCutoffsRef.current[roomId]) ?? undefined;
      const res = await chatService.getMessages(roomId, page, 50, after);
      if (res.Good) {
        // Belt-and-braces: if the backend ever ignores `after`, still drop any
        // pre-deletion history so a deleted-for-me chat never shows it again.
        const cutoffMs = after ? new Date(after).getTime() : null;
        const messages =
          cutoffMs === null
            ? res.messages
            : res.messages.filter((m) => {
                if (!m.createdAt) return true;
                return new Date(m.createdAt).getTime() > cutoffMs;
              });
        dispatch({
          type: "LOAD_MESSAGES",
          messages,
          hasMore: res.hasMore,
          append: page > 1,
        });
        dispatch({ type: "SET_MESSAGE_PAGE", page });
        // Keep the pin badges consistent with the known pinned set, since a
        // single-pin backend won't mark older pinned messages as pinned.
        dispatch({
          type: "SET_PINNED_FLAGS",
          pinnedIds: (stateRef.current.pinnedMessages ?? []).map((m) =>
            messageKey(m),
          ),
        });
      } else {
        dispatch({ type: "SET_ERROR", error: "Failed to load messages" });
      }
    } catch (error) {
      dispatch({ type: "SET_ERROR", error: extractErrorMessage(error) });
    }
  }, []);

  const sendChatMessage = useCallback(
    async (params: {
      room_id: string;
      text: string;
      mentions?: number[];
      parent_id?: string;
      postType?: string;
      is_forwarded?: boolean;
      forwarded_from_name?: string;
      attachments?: Array<{ uri: string; name: string; type: string }>;
      onUploadProgress?: (progress: {
        loaded: number;
        total: number;
        percentage: number;
      }) => void;
      abortUpload?: React.MutableRefObject<{ abort: () => void } | null>;
    }): Promise<ChatMessage> => {
      console.log("[Chat] sendMessage called", {
        room_id: params.room_id,
        text: params.text,
        hasAttachments: !!params.attachments?.length,
      });

      // Optimistic "sending" placeholder: show the bubble immediately with a
      // tiny spinner where the ticks go. `REPLACE_MESSAGE` swaps it for the
      // real message once the API responds (or `REMOVE_MESSAGE` on failure).
      const tempId = `pending-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`;
      const optimistic: ChatMessage = {
        _id: tempId,
        id: -Date.now(),
        room_id: params.room_id,
        sender_id: userIdRef.current,
        text: params.text,
        sender_name: currentUserNameRef.current || undefined,
        attachments: (params.attachments ?? []).map((a) => ({
          name: a.name,
          url: a.uri,
          type: a.type,
        })),
        parent_id: params.parent_id ?? null,
        mentions: params.mentions,
        postType: params.postType,
        is_forwarded: params.is_forwarded,
        forwarded_from_name: params.forwarded_from_name,
        is_pending: true,
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: "ADD_MESSAGE", message: optimistic });

      // Optimistically bump the room's last_message so the chat moves to the
      // top of the list (WhatsApp-style) the moment you send, without waiting
      // for the server confirmation below.
      const sendingRoom = stateRef.current.rooms.find(
        (r) => r._id === params.room_id,
      );
      if (sendingRoom) {
        dispatch({
          type: "UPDATE_ROOM",
          room: {
            ...sendingRoom,
            last_message: {
              text: optimistic.text,
              sender_name: optimistic.sender_name,
              createdAt: optimistic.createdAt,
              attachments: optimistic.attachments,
            },
          },
        });
      }

      // Replace the placeholder with the server-confirmed message and refresh
      // the room's last_message so a brand-new DM surfaces in the chat list.
      const registerSentMessage = (rawSent: ChatMessage) => {
        // Keep the original local filenames for our own attachments: the
        // backend can echo them percent-encoded or otherwise garbled (e.g.
        // "My%20File.pdf" / mojibake), while the picked names are correct.
        // Match by index — the server preserves attachment order.
        const attachments =
          params.attachments &&
          params.attachments.length > 0 &&
          rawSent.attachments &&
          rawSent.attachments.length > 0
            ? rawSent.attachments.map((att, i) => {
                const localName = params.attachments?.[i]?.name;
                return localName ? { ...att, name: localName } : att;
              })
            : rawSent.attachments;
        // Keep the post-type label locally if the API response didn't echo it,
        // so the tag shows immediately without waiting for a refetch.
        const sent: ChatMessage = {
          ...rawSent,
          ...(attachments ? { attachments } : {}),
          ...(params.postType && !rawSent.postType
            ? { postType: params.postType }
            : {}),
        };
        dispatch({ type: "REPLACE_MESSAGE", tempId, message: sent });
        const room = stateRef.current.rooms.find((r) => r._id === sent.room_id);
        if (room) {
          dispatch({
            type: "UPDATE_ROOM",
            room: {
              ...room,
              last_message: {
                text: sent.text,
                sender_name: sent.sender_name,
                // Fallback keeps a "deleted for me" chat visible after the
                // user messages it again, even if the payload omits a time.
                createdAt: sent.createdAt ?? new Date().toISOString(),
                attachments: sent.attachments,
              },
            },
          });
        }
      };

      try {
      // No attachments — send as JSON (backend requirement)
      if (!params.attachments || params.attachments.length === 0) {
        const body: Record<string, unknown> = {
          room_id: params.room_id,
          text: params.text,
        };
        if (params.mentions && params.mentions.length > 0) {
          body.mentions = params.mentions;
        }
        if (params.parent_id) {
          // Reply target — the backend contract lists both `parent_id` and
          // `reply_to`; send the same Mongo ObjectId under both so the quoted
          // reply is persisted and returned as `parent_id`.
          body.parent_id = params.parent_id;
          body.reply_to = params.parent_id;
        }
        if (params.postType) {
          body.postType = params.postType;
        }
        if (params.is_forwarded) {
          body.is_forwarded = params.is_forwarded;
        }
        if (params.forwarded_from_name) {
          body.forwarded_from_name = params.forwarded_from_name;
        }

        const res = await chatService.sendTextMessage(body);
        console.log("[Chat] sendMessage JSON response:", JSON.stringify(res));
        if (res.Good && res.message) {
          registerSentMessage(res.message);
          return res.message;
        }
        throw new Error("Failed to send message");
      }

      // Has attachments — send as FormData (multipart). Expo SDK 57's global
      // fetch (WinterCG) cannot serialize React Native `{ uri, name, type }`
      // FormData parts ("Unsupported FormDataPart implementation"), so
      // attachments must ALWAYS go through the XHR upload path — never the
      // global-fetch `chatService.sendMessage`. Progress reporting is optional;
      // the optimistic bubble's pending spinner is the user-facing feedback.
      const { buildMessageFormData } = await import("@/utils/chatHelpers");
      const formData = buildMessageFormData(params);
      const { uploadWithProgress } = await import(
        "@/services/api/upload.service"
      );
      const response = await new Promise<
        import("@/types/chat.types").SendMessageResponse
      >((resolve, reject) => {
        const uploader = uploadWithProgress("/chat/send-message", formData, {
          onProgress: params.onUploadProgress,
          onComplete: (resp) =>
            resolve(resp as import("@/types/chat.types").SendMessageResponse),
          onError: (err) => {
            console.log("[Chat] upload error:", err);
            reject(err);
          },
        });
        if (params.abortUpload) {
          params.abortUpload.current = uploader;
        }
      });
      if (response.Good && response.message) {
        console.log("[Chat] message sent via upload:", response.message.id);
        registerSentMessage(response.message);
        return response.message;
      }
      throw new Error("Failed to send message");
      } catch (err) {
        // Send failed — drop the optimistic placeholder.
        dispatch({ type: "REMOVE_MESSAGE", messageId: tempId });
        throw err;
      }
    },
    [],
  );

  const editChatMessage = useCallback(
    async (params: {
      messageId: string;
      text: string;
      keepAttachmentIds?: string[];
      newAttachments?: Array<{ uri: string; name: string; type: string }>;
    }): Promise<ChatMessage> => {
      const { buildEditMessageFormData } = await import("@/utils/chatHelpers");
      const formData = buildEditMessageFormData(params);
      const res = await chatService.editMessage(formData);
      if (res.Good && res.message) {
        socketService.emitMessageUpdated(
          params.messageId,
          params.text,
          res.message.room_id,
        );
        dispatch({ type: "UPDATE_MESSAGE", message: res.message });
        return res.message;
      }
      throw new Error("Failed to edit message");
    },
    [],
  );

  // When the newest loaded message of the open conversation is deleted, roll
  // the room's list preview back to the previous message so the chat list no
  // longer shows the deleted text. No-op for non-latest messages.
  const rollbackRoomPreview = useCallback((deletedMessageId: string) => {
    const messages = stateRef.current.messages;
    const targetIndex = messages.findIndex(
      (m) =>
        String(m._id) === String(deletedMessageId) ||
        String(m.id) === String(deletedMessageId),
    );
    // Only relevant when the removed message was the newest loaded one.
    if (targetIndex < 0 || targetIndex !== messages.length - 1) return;
    const target = messages[targetIndex];
    const roomId = target?.room_id;
    if (!roomId) return;
    const room = stateRef.current.rooms.find((r) => r._id === roomId);
    if (!room) return;
    const prev = targetIndex > 0 ? messages[targetIndex - 1] : null;
    dispatch({
      type: "UPDATE_ROOM",
      room: {
        ...room,
        last_message: prev
          ? {
              text: prev.text,
              sender_name: prev.sender_name,
              createdAt: prev.createdAt,
              attachments: prev.attachments,
            }
          : undefined,
      },
    });
  }, []);

  const deleteChatMessage = useCallback(
    async (messageId: string, deleteFor: "me" | "everyone") => {
      const target = stateRef.current.messages.find(
        (m) => m._id === messageId || String(m.id) === messageId,
      );

      // Authorization guard at the API boundary — the UI already hides these
      // actions, but no caller can bypass the rule:
      //   • the message must be one the current user personally sent (never
      //     another user's, not even "delete for me");
      //   • "delete for everyone" is only allowed within the 1-hour window.
      // The existence check also means a stale/unknown id can never be used to
      // issue a delete request.
      if (!target || !isOwnMessage(target, userIdRef.current)) {
        throw new Error("You can only delete your own messages");
      }
      if (deleteFor === "everyone" && !isWithinMessageActionWindow(target)) {
        throw new Error("Delete for everyone is only available within 1 hour");
      }

      const res = await chatService.deleteMessage(messageId, deleteFor);
      if (!res.Good) {
        throw new Error(res.message || "Failed to delete message");
      }

      // Remove from local state immediately so the UI updates for BOTH
      // "delete for me" and "delete for everyone" without waiting for a refetch
      // or the socket echo (which the sender does not always receive).
      dispatch({ type: "REMOVE_MESSAGE", messageId });
      // Keep the chat-list preview in sync (show the previous message).
      rollbackRoomPreview(messageId);

      if (deleteFor === "everyone" && target?.room_id) {
        socketService.emitMessageDeleted(messageId, target.room_id);
      }
    },
    [rollbackRoomPreview],
  );

  // ── Reaction Actions ────────────────────────────────────────────────────

  const toggleReactionAction = useCallback(
    async (messageId: string, emoji: string) => {
      const res = await chatService.toggleReaction(messageId, emoji);
      if (res.Good && res.reactions) {
        const roomId = stateRef.current.messages.find(
          (m) => m._id === messageId || m.id.toString() === messageId,
        )?.room_id;
        if (roomId) {
          socketService.emitMessageReaction(roomId, messageId, res.reactions);
        }
        dispatch({
          type: "SET_REACTIONS",
          messageId,
          reactions: res.reactions,
        });
      }
    },
    [],
  );

  // ── Pin Actions ─────────────────────────────────────────────────────────

  // Some pin responses carry only a partial message; backfill fields from the
  // already-loaded message so the pinned list always has content to show.
  const enrichPinnedMessage = useCallback((message: ChatMessage): ChatMessage => {
    const key = messageKey(message);
    const full = stateRef.current.messages.find((m) => messageKey(m) === key);
    if (!full) return message;
    return {
      ...full,
      ...message,
      text: message.text || full.text,
      sender_name: message.sender_name || full.sender_name,
      createdAt: message.createdAt || full.createdAt,
      attachments:
        (message.attachments?.length ?? 0) > 0
          ? message.attachments
          : full.attachments,
    };
  }, []);

  const fetchPinnedMessages = useCallback(
    async (roomId: string) => {
      if (!roomId) return;
      const res = await chatService.getPinnedMessages(roomId);
      const server = (res?.Good && Array.isArray(res.pinned)
        ? res.pinned
        : []
      ).map(enrichPinnedMessage);
      serverPinsRef.current = { ...serverPinsRef.current, [roomId]: server };
      // Union server pins (everyone's) with pins this user made locally, so
      // multiple pins stay visible even if the server only keeps one.
      const merged = mergePinnedMessages(
        server,
        (localPinsRef.current[roomId] ?? []).map(enrichPinnedMessage),
      );
      dispatch({ type: "SET_PINNED", messages: merged });
      dispatch({
        type: "SET_PINNED_FLAGS",
        pinnedIds: merged.map((m) => messageKey(m)),
      });
    },
    [enrichPinnedMessage],
  );

  // Re-merge the visible pinned list whenever the locally-persisted pins
  // change (e.g. they finish loading after the room was opened), so multiple
  // pins show without needing to reopen the chat.
  useEffect(() => {
    const rid = stateRef.current.currentRoom?._id;
    if (!rid) return;
    const merged = mergePinnedMessages(
      serverPinsRef.current[rid] ?? [],
      (localPins[rid] ?? []).map(enrichPinnedMessage),
    );
    dispatch({ type: "SET_PINNED", messages: merged });
    dispatch({
      type: "SET_PINNED_FLAGS",
      pinnedIds: merged.map((m) => messageKey(m)),
    });
  }, [localPins, enrichPinnedMessage]);

  const togglePinAction = useCallback(
    async (messageId: string, roomId?: string) => {
      const rid = roomId ?? "";
      const serverList = rid ? (serverPinsRef.current[rid] ?? []) : [];
      const localList = rid ? (localPinsRef.current[rid] ?? []) : [];
      const inServer = serverList.some((m) => messageKey(m) === messageId);
      const inLocal = localList.some((m) => messageKey(m) === messageId);
      const currentlyPinned = inServer || inLocal;

      // Unpinning a pin that only exists locally (the server already replaced
      // it with a newer single pin) must NOT call toggle-pin: toggling it would
      // pin it again server-side. Just drop it locally.
      if (currentlyPinned && !inServer && rid) {
        setLocalPins((prev) => {
          const nextList = (prev[rid] ?? []).filter(
            (m) => messageKey(m) !== messageId,
          );
          const next = { ...prev, [rid]: nextList };
          persistLocalPins(next, userIdRef.current);
          return next;
        });
        fetchPinnedMessages(rid).catch(() => {});
        return;
      }

      const res = await chatService.togglePin(messageId);
      if (!res.Good) {
        console.log("Failed to toggle pin");
      }
      const pinnedMsg = res.message ? enrichPinnedMessage(res.message) : null;
      if (rid) {
        socketService.emitMessagePinned(
          rid,
          messageId,
          res.is_pinned,
          pinnedMsg ?? res.message,
        );
      }
      // Update the message in state (badge/tint).
      if (pinnedMsg) {
        dispatch({ type: "UPDATE_MESSAGE", message: pinnedMsg });
      }
      if (rid) {
        setLocalPins((prev) => {
          const list = prev[rid] ?? [];
          const nextList = res.is_pinned
            ? mergePinnedMessages(list, pinnedMsg ? [pinnedMsg] : [])
            : list.filter((m) => messageKey(m) !== messageId);
          const next = { ...prev, [rid]: nextList };
          persistLocalPins(next, userIdRef.current);
          return next;
        });
        // Recompute the authoritative + local union and message flags.
        fetchPinnedMessages(rid).catch(() => {});
      }
    },
    [fetchPinnedMessages, persistLocalPins, enrichPinnedMessage],
  );

  // ── Member Actions ──────────────────────────────────────────────────────

  const addMemberAction = useCallback(
    async (roomId: string, userId: number) => {
      const res = await chatService.addMember(roomId, userId);
      if (!res.Good) {
        console.log(res.message ?? "Failed to add member");
      }
      const room = stateRef.current.rooms.find((r) => r._id === roomId);
      if (room && res.user) {
        socketService.emitMemberJoined({
          ...room,
          members: [...room.members, res.user],
        });
      }
    },
    [],
  );

  const removeMemberAction = useCallback(
    async (roomId: string, userId: number) => {
      const res = await chatService.removeMember(roomId, userId);
      if (!res.Good) {
        console.log(res.message ?? "Failed to remove member");
      }
      // Update local state immediately so the member disappears from the
      // "Chat members" panel, the member count and the permission list without
      // waiting for a refetch.
      dispatch({ type: "REMOVE_ROOM_MEMBER", roomId, userId });
      // Notify other clients (including the removed member) so their UIs sync.
      socketService.leaveChatRoom(roomId, userId);
    },
    [],
  );

  // ── Post Type Actions ───────────────────────────────────────────────────

  const fetchPostTypes = useCallback(async (roomId: string) => {
    const res = await chatService.getPostTypes(roomId);
    if (res.Good) {
      dispatch({ type: "SET_POST_TYPES", postTypes: res.customPostTypes });
    }
  }, []);

  const createPostTypeAction = useCallback(
    async (roomId: string, name: string, color: string, icon: string) => {
      const res = await chatService.createPostType({
        roomId,
        name,
        color,
        icon,
      });
      if (res.Good) {
        dispatch({ type: "SET_POST_TYPES", postTypes: res.customPostTypes });
      }
    },
    [],
  );

  const deletePostTypeAction = useCallback(
    async (roomId: string, name: string) => {
      const res = await chatService.deletePostType({ roomId, name });
      if (res.Good) {
        dispatch({ type: "SET_POST_TYPES", postTypes: res.customPostTypes });
      }
    },
    [],
  );

  // ── Permission Actions ──────────────────────────────────────────────────

  const fetchRoomPermissions = useCallback(async (roomId: string) => {
    const res = await chatService.getRoomPermissions(roomId);
    if (res.Good) {
      dispatch({
        type: "SET_ROOM_PERMISSIONS",
        permissions: res.memberPermissions,
        createdBy: res.created_by,
      });
    }
  }, []);

  const updatePermissionAction = useCallback(
    async (roomId: string, userId: number, permission: string) => {
      const res = await chatService.updatePermission({
        roomId,
        userId,
        permission,
      });
      if (res.Good) {
        dispatch({
          type: "SET_ROOM_PERMISSIONS",
          permissions: res.memberPermissions,
          createdBy: state.roomCreator ?? 0,
        });
      }
    },
    [state.roomCreator],
  );

  // ── Read State Actions ──────────────────────────────────────────────────

  const markReadAction = useCallback(
    async (roomId: string) => {
      const res = await chatService.markRead(roomId);
      if (res.Good) {
        // Patch only the read flags via a targeted action. Building the room
        // from a `state.rooms` closure here would snapshot `last_message` at
        // call time and clobber any newer realtime message that landed while
        // the request was in flight.
        dispatch({ type: "SET_ROOM_READ", roomId, read: true });
      }
    },
    [],
  );

  const markUnreadAction = useCallback(
    async (roomId: string) => {
      const res = await chatService.markUnread(roomId);
      if (res.Good) {
        dispatch({ type: "SET_ROOM_READ", roomId, read: false });
      }
    },
    [],
  );

  // ── Invitation Actions ──────────────────────────────────────────────────

  const inviteUserAction = useCallback(
    async (
      roomId: string,
      email: string,
      userId: number,
      permission: string,
    ): Promise<string> => {
      const res = await chatService.inviteUser({
        roomId,
        email,
        userId,
        permission,
      });
      if (res.Good && res.inviteLink) {
        return res.inviteLink;
      }
      throw new Error("Failed to send invite");
    },
    [],
  );

  const generateLinkAction = useCallback(
    async (
      roomId: string,
      permission: string,
      allowedUserIds: number[],
    ): Promise<string> => {
      const res = await chatService.generateLink({
        roomId,
        permission,
        allowedUserIds,
      });
      if (res.Good && res.inviteLink) {
        return res.inviteLink;
      }
      throw new Error("Failed to generate link");
    },
    [],
  );

  // ── Search Actions ──────────────────────────────────────────────────────

  const searchUsersAction = useCallback(async (query: string) => {
    dispatch({ type: "SET_SEARCHING", searching: true });
    try {
      const res = await chatService.searchUsers(query);
      if (res.Good) {
        dispatch({ type: "SET_SEARCH_RESULTS", results: res.users });
      }
    } catch {
      dispatch({ type: "SET_SEARCHING", searching: false });
    }
  }, []);

  const setSearchQuery = useCallback((query: string) => {
    dispatch({ type: "SET_SEARCH_QUERY", query });

    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    const delay = query === "" ? 0 : 300;
    const timeout = setTimeout(() => {
      chatService
        .searchUsers(query)
        .then((res) => {
          if (res.Good) {
            dispatch({ type: "SET_SEARCH_RESULTS", results: res.users });
          }
        })
        .catch(() => {});
    }, delay);
    searchDebounceRef.current = timeout;
  }, []);

  // ── URL Preview ─────────────────────────────────────────────────────────

  const getUrlPreviewAction = useCallback(async (url: string) => {
    try {
      const res = await chatService.getUrlPreview(url);
      if (res.Good && res.data) {
        return res.data;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  // ── Socket Actions ───────────────────────────────────────────────────────

  // Keep the latest markRead action reachable from the toast-navigation
  // callback below (which must stay referentially stable for `initSocket`).
  useEffect(() => {
    markReadRef.current = markReadAction;
  }, [markReadAction]);

  /**
   * Open the conversation a chat notification/toast belongs to.
   *
   * The room id carried by the message/notification is the single source of
   * truth — never a username/display name. It is resolved against the local
   * room list first (Mongo `_id`, numeric `id` as fallback) so the screen gets
   * the correct name/initials/channel flag; if the room is not loaded yet
   * (app restart, freshly received chat) the room list is refreshed once and
   * the lookup retried. As a last resort we navigate with the room id alone —
   * the conversation screen loads its messages directly from that id.
   */
  const openChatRoomFromNotification = useCallback(
    async (roomId: string, senderName?: string) => {
      const rid = String(roomId ?? "");
      if (!rid) return;

      // Already viewing this conversation — don't stack a duplicate screen.
      const active = stateRef.current.currentRoom;
      if (active && (String(active._id) === rid || String(active.id) === rid)) {
        return;
      }

      const findRoom = (rooms: Room[]) =>
        rooms.find((r) => String(r._id) === rid || String(r.id) === rid);

      let room = findRoom(stateRef.current.rooms);
      if (!room) {
        try {
          const res = await chatService.getRooms();
          if (res?.Good && res.rooms) {
            // MERGE_ROOMS preserves local unread/mute state.
            dispatch({ type: "MERGE_ROOMS", rooms: res.rooms });
            room = findRoom(res.rooms);
          }
        } catch {
          // Fall through to id-only navigation below.
        }
      }

      // Opening a chat clears its unread badge — same as tapping its row in
      // the chat list.
      if (room && isRoomUnread(room)) {
        markReadRef.current(rid).catch(() => {});
      }

      if (room) {
        openRoomConversation(room, userIdRef.current);
        return;
      }

      openConversation(
        senderName
          ? {
              roomId: rid,
              name: senderName,
              initials: getMessageInitials(senderName),
            }
          : { roomId: rid },
      );
    },
    [],
  );

  // Expose the callback to the once-registered socket listener via a ref
  // (same pattern as `reactivateDeletedChatRef`) so `initSocket` never has to
  // depend on it and never re-registers its listeners.
  useEffect(() => {
    openChatRoomRef.current = (roomId, senderName) => {
      openChatRoomFromNotification(roomId, senderName).catch(() => {});
    };
  }, [openChatRoomFromNotification]);

  const initSocket = useCallback(
    async (userId: number) => {
      userIdRef.current = userId;
      const socket = await socketService.connectSocket();

      // The shared chat listeners are registered exactly once for the whole app.
      // The Chat tab normally does this on mount, but a chat can also be the
      // FIRST screen to mount — an OS push tap, an in-app notification or a
      // cold-start deep link opens `conversation.tsx` directly. Re-invoking
      // `initSocket` from that screen must not tear down and re-register the
      // 20+ listeners (which drops events) nor double-register them; just
      // refresh the user registration and bail out.
      //
      // Guarding on the socket identity (not just "have listeners") means a
      // logout that disconnects the socket — even when the Chat tab never
      // mounted to run its cleanup — still results in a fresh registration on
      // the next login, because the new socket differs from the recorded one.
      if (
        socketCleanupRef.current.length > 0 &&
        registeredSocketRef.current === socket
      ) {
        if (socket.connected) {
          socketService.registerUser(userId);
        }
        return;
      }
      // Any prior subscriptions belong to a replaced socket — drop the stale
      // bookkeeping before attaching to the current one.
      socketCleanupRef.current = [];

      const cleanupConnect = socketService.onSocketEvent("connect", () => {
        setSocketConnected(true);
        socketService.registerUser(userId);
        // Rejoin all rooms on reconnect — including deleted-for-me chats the
        // server no longer lists, so their next message is delivered.
        const joined = new Set<string>();
        stateRef.current.rooms.forEach((room) => {
          if (joined.has(room._id)) return;
          joined.add(room._id);
          socketService.joinChatRoom(room._id);
        });
        Object.keys(chatCutoffsRef.current).forEach((rid) => {
          if (joined.has(rid)) return;
          joined.add(rid);
          socketService.joinChatRoom(rid);
        });
      });

      const cleanupDisconnect = socketService.onSocketEvent(
        "disconnect",
        () => {
          setSocketConnected(false);
        },
      );

      const cleanupConnectError = socketService.onSocketEvent(
        "connect_error",
        () => {
          setSocketConnected(false);
        },
      );

      const cleanupNewRoom = socketService.onSocketEvent(
        "newRoom",
        (roomData) => {
          const incomingRoom = roomData as Room;
          // If a message already arrived for this room (the `newRoom` event can
          // trail `receiveChatMessage`), attach it as the preview/unread so the
          // brand-new chat appears in the list right away.
          const pending = pendingIncomingRef.current.get(incomingRoom._id);
          let room = incomingRoom;
          if (pending) {
            pendingIncomingRef.current.delete(incomingRoom._id);
            room = withIncomingMessage(
              incomingRoom,
              pending,
              userIdRef.current,
              stateRef.current.currentRoom?._id === incomingRoom._id,
            );
          }
          const isNewRoom = !stateRef.current.rooms.some(
            (r) => r._id === room._id || String(r.id) === String(room.id),
          );

          dispatch({ type: "ADD_ROOM", room });
          socketService.joinChatRoom(room._id);

          // In-app toast when the current user is added to a channel/project
          // channel by someone else. Skips rooms the user created themselves
          // (no toast on their own channel creation), 1:1 DMs, and rooms the
          // user has no read permission for — if they can't see the
          // channel/project in their list, a toast would be misleading.
          if (isNewRoom && (room.type === "channel" || room.type === "project")) {
            const perms = userPermissionsRef.current;
            const canView =
              room.type === "channel"
                ? perms.includes("chat-list")
                : perms.includes("project-list");
            if (
              canView &&
              room.created_by !== undefined &&
              room.created_by !== userIdRef.current
            ) {
            const creator = room.members?.find(
              (m) => m.id === room.created_by,
            );
            const creatorName = creator
              ? `${creator.first_name || ""} ${creator.last_name || ""}`.trim()
              : null;
            if (creatorName) {
              showInfo(
                room.type === "project"
                  ? `${creatorName} added you to a project`
                  : `${creatorName} added you to a channel`,
                room.name,
              );
            } else {
              showInfo(
                room.type === "project"
                  ? "You were added to a project"
                  : "You were added to a channel",
                room.name,
              );
            }
            }
          }
        },
      );

      const cleanupReceiveMessage = socketService.onSocketEvent(
        "receiveChatMessage",
        (messageData) => {
          const message = messageData as ChatMessage;
          // The ADD_MESSAGE reducer only appends this when `message.room_id`
          // matches the currently open room, so a message from another
          // conversation can never leak into the active chat screen. The room
          // list / unread / toast updates below still run for every room.
          dispatch({ type: "ADD_MESSAGE", message });

          // Update the room's last_message + unreadCount for real-time chat list updates
          const room = stateRef.current.rooms.find(
            (r) => r._id === message.room_id,
          );
          if (room) {
            // Only increment unreadCount when the message is from someone else
            // AND the user is not currently viewing that room
            const isFromOther = message.sender_id !== userIdRef.current;
            const isCurrentRoom =
              stateRef.current.currentRoom?._id === message.room_id;
            // A message from another user that arrives while this room is the
            // actively viewed conversation is read on arrival: it must not bump
            // the unread badge, and any pre-existing count must be cleared too
            // (notification-opened chats never ran the chat list's row-tap
            // `markRead`, so a lingering count would otherwise survive). The
            // socket `messagesRead` emit below still flips the sender's ticks.
            const newUnreadCount =
              isFromOther && !isCurrentRoom
                ? (room.unreadCount ?? 0) + 1
                : isFromOther && isCurrentRoom
                  ? 0
                  : room.unreadCount;

            // The room-open effect (conversation.tsx) only emits
            // "messagesRead" once, for whatever was already unread at open
            // time — a message that arrives afterward, while still on this
            // same room, needs its own re-emit or the sender's checkmark
            // never flips from "sent" to "seen" for it.
            if (isFromOther && isCurrentRoom) {
              socketService.emitMessagesRead(message.room_id, userIdRef.current);
              // Persist the read state on the backend as well. The socket
              // "messagesRead" event only flips other clients' ticks; the
              // per-user read marker that GET /chat/rooms uses after a reload
              // is advanced by POST /chat/mark-read. Without this the message
              // was read in memory but resurfaced as unread after a restart.
              // Mirrors the web flow ("marks read + emits messagesRead").
              markReadRef.current(message.room_id).catch(() => {});
            }

            dispatch({
              type: "UPDATE_ROOM",
              room: {
                ...room,
                unreadCount: newUnreadCount,
                last_message: {
                  text: message.text,
                  sender_name: message.sender_name,
                  // Fall back to now if the payload lacks a timestamp so a
                  // deleted-for-me chat reliably reappears on this message.
                  createdAt: message.createdAt ?? new Date().toISOString(),
                  attachments: message.attachments,
                },
              },
            });
          }

          // A message from the other user must surface its chat:
          //  - If the chat was deleted for me, run the same initialization the
          //    manual "New Chat → user" flow does (get-or-create + join) so it
          //    reappears even though GET /chat/rooms hides it for me.
          //  - If the room is simply unknown, subscribe + refresh.
          // Chats already in local state were updated above.
          if (!room && message.sender_id !== userIdRef.current) {
            if (chatCutoffsRef.current[message.room_id]) {
              reactivateDeletedChatRef.current(message.room_id, message);
            } else if (!cutoffsLoadedRef.current) {
              // Cutoffs not loaded yet — replay once they are, otherwise the
              // first message after a restart could be missed.
              pendingUnknownMessagesRef.current.set(message.room_id, message);
            } else {
              socketService.joinChatRoom(message.room_id);
              // Remember the message so the room, once loaded, carries it as
              // its preview/unread and appears in the chat list immediately.
              pendingIncomingRef.current.set(message.room_id, message);
              fetchRoomsRef.current?.({ silent: true })?.catch(() => {});
            }
          }

          if (message.sender_id !== userIdRef.current) {
            socketService.emitMessageDelivered(
              message._id,
              message.sender_id,
              message.room_id,
            );
          }

          // ── Chat push (in-app) ─────────────────────────────────────────────
          // The backend does not send FCM for chat messages — it relies on the
          // socket, which only delivers while the app is running. Surface an
          // in-app toast for messages from other users in rooms the user is not
          // currently viewing and that are not muted. Messages mentioning the
          // current user also land in the Notifications inbox (Mentions tab).
          if (message.sender_id !== userIdRef.current) {
            const isCurrentRoom =
              stateRef.current.currentRoom?._id === message.room_id;
            const isMuted = room?.is_muted ?? false;
            if (!isCurrentRoom && !isMuted) {
              const isMention = (message.mentions ?? []).includes(
                userIdRef.current,
              );
              const sender = message.sender_name ?? "Someone";
              const bodyText = message.text ?? "";
              // Tapping the toast opens the exact conversation the message
              // belongs to (resolved by room id, never by display name).
              const openRoomFromToast = () => {
                openChatRoomRef.current(
                  String(message.room_id ?? ""),
                  message.sender_name,
                );
              };
              if (isMention) {
                showInfo(`${sender} mentioned you`, bodyText, openRoomFromToast);
                addNotification({
                  id: -Math.abs(message.id),
                  title: `${sender} mentioned you in a chat`,
                  task_id: 0,
                  lead_id: 0,
                  created_by: message.sender_id,
                  company_id: 0,
                  assigned_to: userIdRef.current,
                  typ: "chat_mention",
                  identifier: "chat",
                  description: bodyText,
                  createdAt: message.createdAt ?? new Date().toISOString(),
                  readed: 0,
                  assigned: {
                    id: message.sender_id,
                    first_name: sender,
                    last_name: "",
                    email: "",
                    image: "",
                  },
                });
              } else {
                const preview =
                  bodyText.length > 120
                    ? `${bodyText.slice(0, 120)}…`
                    : bodyText;
                showInfo(sender, preview, openRoomFromToast);
              }
            }
          }
        },
      );

      const cleanupUserOnline = socketService.onSocketEvent(
        "userOnline",
        (userIdData) => {
          const uid = userIdData as string;
          setOnlineUserIds((prev) => {
            if (prev.includes(uid)) return prev;
            return [...prev, uid];
          });
        },
      );

      const cleanupUserOffline = socketService.onSocketEvent(
        "userOffline",
        (userIdData) => {
          const uid = userIdData as string;
          setOnlineUserIds((prev) => prev.filter((id) => id !== uid));
        },
      );

      const handleOnlineUsersEvent = (data: unknown) => {
        const ids = Array.isArray(data)
          ? data.map((id) => String(id))
          : typeof data === "object" &&
              data !== null &&
              Array.isArray((data as { userIds?: unknown[] }).userIds)
            ? (data as { userIds: unknown[] }).userIds.map((id) => String(id))
            : [];
        if (ids.length === 0) return;
        setOnlineUserIds(ids);
        dispatch({ type: "SET_ONLINE_USERS", userIds: ids });
      };

      const cleanupOnlineUsers = socketService.onSocketEvent(
        "onlineUsers",
        handleOnlineUsersEvent,
      );
      const cleanupOnlineUsersList = socketService.onSocketEvent(
        "onlineUsersList",
        handleOnlineUsersEvent,
      );

      const handleTypingEvent = (data: unknown) => {
        const typed = data as {
          room_id?: string;
          user_id: number;
          user_name: string;
          isTyping: boolean;
        };
        const roomId = typed.room_id;
        if (!roomId) return;
        if (typed.user_id === userIdRef.current) return;
        setTypingUsers((prev) => {
          const next = new Map(prev);
          const roomMap = new Map(next.get(roomId) || []);
          if (typed.isTyping) {
            roomMap.set(typed.user_id, typed.user_name);
          } else {
            roomMap.delete(typed.user_id);
          }
          next.set(roomId, roomMap);
          return next;
        });
      };

      const cleanupUserTyping = socketService.onSocketEvent(
        "userTyping",
        handleTypingEvent,
      );
      const cleanupTyping = socketService.onSocketEvent(
        "typing",
        handleTypingEvent,
      );

      const cleanupMessageReaction = socketService.onSocketEvent(
        "messageReaction",
        (data) => {
          const typed = data as {
            messageId: string;
            reactions: MessageReaction[];
          };
          dispatch({
            type: "SET_REACTIONS",
            messageId: typed.messageId,
            reactions: typed.reactions,
          });
        },
      );

      const cleanupMessagePinned = socketService.onSocketEvent(
        "messagePinned",
        (data) => {
          const typed = data as {
            room_id?: string;
            messageId: string;
            isPinned: boolean;
            message: ChatMessage;
          };
          if (typed.message) {
            dispatch({ type: "UPDATE_MESSAGE", message: typed.message });
          }
          // `room_id` is carried at the top level of this event's payload.
          const pinnedRoomId = typed.room_id ?? typed.message?.room_id;
          if (pinnedRoomId) {
            fetchPinnedMessages(pinnedRoomId).catch(() => {});
          }
        },
      );

      const cleanupMessageUpdated = socketService.onSocketEvent(
        "messageUpdated",
        (data) => {
          const typed = data as { messageId: string; text: string };
          const msg = stateRef.current.messages.find(
            (m) => m._id === typed.messageId,
          );
          if (msg) {
            dispatch({
              type: "UPDATE_MESSAGE",
              message: { ...msg, text: typed.text, is_edited: true },
            });
          }
        },
      );

      const cleanupMessageDeleted = socketService.onSocketEvent(
        "messageDeleted",
        (data) => {
          const typed = data as { messageId: string };
          dispatch({ type: "REMOVE_MESSAGE", messageId: typed.messageId });
          // Roll the room's list preview back if the newest message was deleted.
          rollbackRoomPreview(typed.messageId);
          // A deleted message must not linger in the local multi-pin store.
          setLocalPins((prev) => {
            let changed = false;
            const next: Record<string, ChatMessage[]> = {};
            for (const [rid, list] of Object.entries(prev)) {
              const filtered = list.filter(
                (m) => messageKey(m) !== typed.messageId,
              );
              if (filtered.length !== list.length) changed = true;
              next[rid] = filtered;
            }
            if (!changed) return prev;
            persistLocalPins(next, userIdRef.current);
            return next;
          });
        },
      );

      const cleanupMemberJoined = socketService.onSocketEvent(
        "memberJoined",
        (data) => {
          const typed = data as { room?: Room };
          if (typed.room) {
            dispatch({ type: "UPDATE_ROOM", room: typed.room });
          }
        },
      );

      const cleanupMessagesRead = socketService.onSocketEvent(
        "messagesRead",
        (data) => {
          const typed = data as { room_id: string; user_id: string };
          if (String(userIdRef.current) === typed.user_id) return;
          const cur = stateRef.current;
          dispatch({
            type: "LOAD_MESSAGES",
            messages: cur.messages.map((m) =>
              m.room_id === typed.room_id
                ? {
                    ...m,
                    is_read: [
                      ...(m.is_read || []),
                      parseInt(typed.user_id, 10),
                    ],
                  }
                : m,
            ),
            hasMore: cur.hasMore,
            append: false,
          });
        },
      );

      const cleanupChatCleared = socketService.onSocketEvent(
        "chatCleared",
        (data) => {
          const typed = data as { roomId: string };
          if (stateRef.current.currentRoom?.id.toString() === typed.roomId) {
            dispatch({
              type: "LOAD_MESSAGES",
              messages: [],
              hasMore: false,
              append: false,
            });
          }
        },
      );

      const cleanupRoomDeleted = socketService.onSocketEvent(
        "roomDeleted",
        (data) => {
          const typed = data as { roomId: string };
          dispatch({ type: "REMOVE_ROOM", roomId: typed.roomId });
        },
      );

      const cleanupUserLeftRoom = socketService.onSocketEvent(
        "userLeftRoom",
        (data) => {
          const typed = data as { roomId: string; userId: string };
          if (!typed.roomId || typed.userId === undefined || typed.userId === null) {
            return;
          }
          // Removes the member from the room AND the permission map so the
          // "Chat members" panel and member count stay in sync.
          dispatch({
            type: "REMOVE_ROOM_MEMBER",
            roomId: typed.roomId,
            userId: Number(typed.userId),
          });
        },
      );

      const cleanupRemovedFromRoom = socketService.onSocketEvent(
        "removedFromRoom",
        (data) => {
          const typed = data as { roomId: string };
          dispatch({ type: "REMOVE_ROOM", roomId: typed.roomId });
        },
      );

      const cleanupRoomPermissionUpdated = socketService.onSocketEvent(
        "roomPermissionUpdated",
        (data) => {
          const typed = data as {
            room_id: string;
            userId: number;
            permission: string;
            memberPermissions: MemberPermission[];
          };
          dispatch({
            type: "SET_ROOM_PERMISSIONS",
            permissions: typed.memberPermissions,
            createdBy: stateRef.current.roomCreator ?? 0,
          });
        },
      );

      const cleanupChatRoomSettingUpdated = socketService.onSocketEvent(
        "chatRoomSettingUpdated",
        (data) => {
          const typed = data as {
            roomId: string;
            type: string;
            is_muted?: boolean;
          };
          const room = stateRef.current.rooms.find(
            (r) => r._id === typed.roomId,
          );
          if (!room) return;
          if (typed.type === "mute" && typed.is_muted !== undefined) {
            dispatch({
              type: "UPDATE_ROOM",
              room: { ...room, is_muted: typed.is_muted },
            });
          } else if (typed.type === "force_unread") {
            // Another session marked this room unread — keep badges in sync.
            dispatch({
              type: "UPDATE_ROOM",
              room: { ...room, force_unread: true },
            });
          } else if (typed.type === "clear_unread") {
            // Another session read the room — clear the badge.
            dispatch({
              type: "UPDATE_ROOM",
              room: { ...room, force_unread: false, unreadCount: 0 },
            });
          }
        },
      );

      // ── project_update — project chat room pickup ───────────────────────
      // A project's associated group-chat room is auto-created server-side.
      // Matches Web ChatContext: only reacts to action === "create", waits
      // 2s, then refetches chat rooms and MERGES newly-visible rooms into
      // local state WITHOUT clobbering unread counts.
      const cleanupProjectUpdate = socketService.onSocketEvent(
        "project_update",
        (data) => {
          const typed = data as {
            company_id?: number;
            action?: string;
            data?: { id?: number; due_date?: string };
          };
          if (typed.action !== "create") return;
          if (
            typed.company_id !== undefined &&
            companyIdRef.current !== null &&
            String(typed.company_id) !== String(companyIdRef.current)
          ) {
            return;
          }
          if (projectUpdateTimerRef.current) {
            clearTimeout(projectUpdateTimerRef.current);
          }
          projectUpdateTimerRef.current = setTimeout(async () => {
            projectUpdateTimerRef.current = null;
            try {
              const res = await chatService.getRooms();
              if (!res.Good || !res.rooms) return;
              const known = new Set(
                stateRef.current.rooms.map((r) => r._id),
              );
              res.rooms.forEach((room) => {
                if (!known.has(room._id)) {
                  socketService.joinChatRoom(room._id);
                }
              });
              dispatch({ type: "MERGE_ROOMS", rooms: res.rooms });
            } catch (err) {
              console.log(
                "[Chat] project_update room merge failed:",
                err,
              );
            }
          }, 2000);
        },
      );

      socketCleanupRef.current = [
        cleanupConnect,
        cleanupDisconnect,
        cleanupConnectError,
        cleanupNewRoom,
        cleanupReceiveMessage,
        cleanupUserOnline,
        cleanupUserOffline,
        cleanupOnlineUsers,
        cleanupOnlineUsersList,
        cleanupUserTyping,
        cleanupTyping,
        cleanupMessageReaction,
        cleanupMessagePinned,
        cleanupMessageUpdated,
        cleanupMessageDeleted,
        cleanupMemberJoined,
        cleanupMessagesRead,
        cleanupChatCleared,
        cleanupRoomDeleted,
        cleanupUserLeftRoom,
        cleanupRemovedFromRoom,
        cleanupRoomPermissionUpdated,
        cleanupChatRoomSettingUpdated,
        cleanupProjectUpdate,
      ];
      registeredSocketRef.current = socket;

      // If already connected, register immediately
      if (socket.connected) {
        setSocketConnected(true);
        socketService.registerUser(userId);
        stateRef.current.rooms.forEach((room) => {
          socketService.joinChatRoom(room._id);
        });
      }
    },
    [fetchPinnedMessages, rollbackRoomPreview],
  );

  const cleanupChatListeners = useCallback(() => {
    if (projectUpdateTimerRef.current) {
      clearTimeout(projectUpdateTimerRef.current);
      projectUpdateTimerRef.current = null;
    }
    socketCleanupRef.current.forEach((cleanup) => cleanup());
    socketCleanupRef.current = [];
    registeredSocketRef.current = null;
  }, []);

  const cleanupSocket = useCallback(() => {
    cleanupChatListeners();
    socketService.disconnectSocket();
    setSocketConnected(false);
    setOnlineUserIds([]);
    setTypingUsers(new Map());
  }, [cleanupChatListeners]);

  // ── Logout ──────────────────────────────────────────────────────────────

  const logout = useCallback(() => {
    dispatch({ type: "LOGOUT" });
  }, []);

  // ── Socket Lifecycle ────────────────────────────────────────────────────

  // Initialize socket when rooms are loaded
  useEffect(() => {
    if (state.rooms.length > 0) {
      // Socket init is triggered from the component that has access to userId
    }
  }, [state.rooms]);

  // ── Memoized Value ──────────────────────────────────────────────────────

  // Isolated from `value` below — this changes on nearly every socket event,
  // and only conversation.tsx (via useChatPresence) needs it.
  const presenceValue: ChatPresenceValue = useMemo(
    () => ({ socketConnected, onlineUserIds, typingUsers }),
    [socketConnected, onlineUserIds, typingUsers],
  );

  const value: ChatContextValue = useMemo(
    () => ({
      state,
      postTypes: state.postTypes,
      roomPermissions: state.roomPermissions,
      roomCreator: state.roomCreator,
      fetchRooms,
      getOrCreateRoom,
      setCurrentRoom,
      deleteRoom,
      leaveRoom,
      hideRoom,
      hiddenRoomIds,
      muteRoom,
      clearMessages,
      fetchMessages,
      sendMessage: sendChatMessage,
      editMessage: editChatMessage,
      deleteMessage: deleteChatMessage,
      toggleReaction: toggleReactionAction,
      togglePin: togglePinAction,
      fetchPinnedMessages,
      addMember: addMemberAction,
      removeMember: removeMemberAction,
      fetchPostTypes,
      createPostType: createPostTypeAction,
      deletePostType: deletePostTypeAction,
      fetchRoomPermissions,
      updatePermission: updatePermissionAction,
      markRead: markReadAction,
      markUnread: markUnreadAction,
      inviteUser: inviteUserAction,
      generateLink: generateLinkAction,
      searchUsers: searchUsersAction,
      setSearchQuery,
      getUrlPreview: getUrlPreviewAction,
      initSocket,
      cleanupChatListeners,
      cleanupSocket,
      logout,
    }),
    [
      state,
      state.postTypes,
      state.roomPermissions,
      state.roomCreator,
      fetchRooms,
      getOrCreateRoom,
      setCurrentRoom,
      deleteRoom,
      leaveRoom,
      hideRoom,
      hiddenRoomIds,
      muteRoom,
      clearMessages,
      fetchMessages,
      sendChatMessage,
      editChatMessage,
      deleteChatMessage,
      toggleReactionAction,
      togglePinAction,
      fetchPinnedMessages,
      addMemberAction,
      removeMemberAction,
      fetchPostTypes,
      createPostTypeAction,
      deletePostTypeAction,
      fetchRoomPermissions,
      updatePermissionAction,
      markReadAction,
      markUnreadAction,
      inviteUserAction,
      generateLinkAction,
      searchUsersAction,
      setSearchQuery,
      getUrlPreviewAction,
      initSocket,
      cleanupChatListeners,
      cleanupSocket,
      logout,
    ],
  );

  return (
    <ChatContext.Provider value={value}>
      <ChatPresenceContext.Provider value={presenceValue}>
        {children}
      </ChatPresenceContext.Provider>
    </ChatContext.Provider>
  );
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return ctx;
}

// Typing/online-presence state, split out of useChat() so components that
// don't read it (chat list, notifications, InboxModal) don't re-render on
// every typing ping or presence change. Use this only where actually needed.
export function useChatPresence(): ChatPresenceValue {
  const ctx = useContext(ChatPresenceContext);
  if (!ctx) {
    throw new Error("useChatPresence must be used within a ChatProvider");
  }
  return ctx;
}
