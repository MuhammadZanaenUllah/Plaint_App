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
import * as chatService from "@/services/api/chat.service";
import * as socketService from "@/services/socket/socketService";
import {
  Room,
  ChatMessage,
  ChatState,
  GetOrCreateRoomRequest,
  SearchUser,
  CustomPostType,
  MemberPermission,
  RoomType,
  MessageReaction,
} from "@/types/chat.types";
import { extractErrorMessage } from "@/utils/errorHandler";
import { showInfo } from "@/utils/toast";
import { useNotifications } from "@/context/NotificationContext";

// ─── Actions ──────────────────────────────────────────────────────────────────

type ChatAction =
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_MESSAGES_LOADING"; loading: boolean }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "LOAD_ROOMS"; rooms: Room[] }
  | { type: "SET_CURRENT_ROOM"; room: Room | null }
  | { type: "LOAD_MESSAGES"; messages: ChatMessage[]; hasMore: boolean; append: boolean }
  | { type: "ADD_MESSAGE"; message: ChatMessage }
  | { type: "UPDATE_MESSAGE"; message: ChatMessage }
  | { type: "REMOVE_MESSAGE"; messageId: string }
  | { type: "SET_REACTIONS"; messageId: string; reactions: MessageReaction[] }
  | { type: "SET_PINNED"; messages: ChatMessage[] }
  | { type: "SET_POST_TYPES"; postTypes: CustomPostType[] }
  | { type: "SET_ROOM_PERMISSIONS"; permissions: MemberPermission[]; createdBy: number }
  | { type: "ADD_ROOM"; room: Room }
  | { type: "UPDATE_ROOM"; room: Room }
  | { type: "REMOVE_ROOM"; roomId: string }
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

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, loading: action.loading };
    case "SET_MESSAGES_LOADING":
      return { ...state, messagesLoading: action.loading };
    case "SET_ERROR":
      return { ...state, error: action.error, loading: false, messagesLoading: false };
    case "LOAD_ROOMS":
      return { ...state, rooms: action.rooms, loading: false, error: null };
    case "SET_CURRENT_ROOM":
      return { ...state, currentRoom: action.room, messages: [], messagePage: 1, hasMore: false };
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
      const exists = state.messages.some((m) => m._id === action.message._id);
      if (exists) return state;
      return { ...state, messages: [...state.messages, action.message] };
    }
    case "UPDATE_MESSAGE":
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.message.id ? action.message : m
        ),
      };
    case "REMOVE_MESSAGE":
      return {
        ...state,
        messages: state.messages.filter((m) => m.id.toString() !== action.messageId),
      };
    case "SET_REACTIONS":
      return {
        ...state,
        messages: state.messages.map((m) =>
          m._id === action.messageId
            ? { ...m, reactions: action.reactions }
            : m
        ),
      };
    case "SET_PINNED":
      return { ...state, pinnedMessages: action.messages };
    case "SET_POST_TYPES":
      return { ...state, postTypes: action.postTypes };
    case "SET_ROOM_PERMISSIONS":
      return {
        ...state,
        roomPermissions: action.permissions,
        roomCreator: action.createdBy,
      };
    case "ADD_ROOM": {
      const exists = state.rooms.some((r) => r.id === action.room.id);
      return {
        ...state,
        rooms: exists
          ? state.rooms.map((r) => (r.id === action.room.id ? action.room : r))
          : [action.room, ...state.rooms],
      };
    }
    case "UPDATE_ROOM":
      if (!action.room) return state;
      return {
        ...state,
        rooms: state.rooms.map((r) =>
          r.id === action.room.id ? action.room : r
        ),
        currentRoom:
          state.currentRoom?.id === action.room.id
            ? action.room
            : state.currentRoom,
      };
    case "REMOVE_ROOM":
      return {
        ...state,
        rooms: state.rooms.filter((r) => r._id !== action.roomId),
        currentRoom:
          state.currentRoom?._id === action.roomId
            ? null
            : state.currentRoom,
      };
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
            String(m.id) === action.userId
              ? { ...m, isOnline: true }
              : m
          ),
        })),
      };
    case "USER_OFFLINE":
      return {
        ...state,
        rooms: state.rooms.map((r) => ({
          ...r,
          members: r.members.map((m) =>
            String(m.id) === action.userId
              ? { ...m, isOnline: false }
              : m
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
  fetchRooms: () => Promise<void>;
  getOrCreateRoom: (data: GetOrCreateRoomRequest) => Promise<Room>;
  setCurrentRoom: (room: Room | null) => void;
  deleteRoom: (roomId: string) => Promise<void>;
  leaveRoom: (roomId: string) => Promise<void>;
  hideRoom: (roomId: string) => Promise<void>;
  muteRoom: (roomId: string) => Promise<boolean>;
  clearMessages: (roomId: string) => Promise<void>;

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
    onUploadProgress?: (progress: { loaded: number; total: number; percentage: number }) => void;
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
    deleteFor: "self" | "everyone"
  ) => Promise<void>;

  // Reaction actions
  toggleReaction: (messageId: string, emoji: string) => Promise<void>;

  // Pin actions
  togglePin: (messageId: string) => Promise<void>;
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
    icon: string
  ) => Promise<void>;
  deletePostType: (roomId: string, name: string) => Promise<void>;

  // Permission actions
  fetchRoomPermissions: (roomId: string) => Promise<void>;
  updatePermission: (
    roomId: string,
    userId: number,
    permission: string
  ) => Promise<void>;

  // Read state actions
  markRead: (roomId: string) => Promise<void>;
  markUnread: (roomId: string) => Promise<void>;

  // Invitation actions
  inviteUser: (
    roomId: string,
    email: string,
    userId: number,
    permission: string
  ) => Promise<string>;
  generateLink: (
    roomId: string,
    permission: string,
    allowedUserIds: number[]
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

  // Project-channel actions
  createProjectWithChannels: (projectId: number) => Promise<Room>;

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
  const [typingUsers, setTypingUsers] = useState<Map<string, Map<number, string>>>(new Map());
  const socketCleanupRef = useRef<Array<() => void>>([]);

  const { addNotification } = useNotifications();

  // ── State refs for socket listeners (avoid stale closures) ──────────────
  const stateRef = useRef(state);
  stateRef.current = state;
  const userIdRef = useRef(0);

  // ── Room Actions ──────────────────────────────────────────────────────────

  const fetchRooms = useCallback(async () => {
    dispatch({ type: "SET_LOADING", loading: true });
    try {
      const res = await chatService.getRooms();
      console.log("[Chat] fetchRooms response:", { Good: res.Good, roomCount: res.rooms?.length });
      if (res.Good) {
        console.log("[Chat] First room sample:", JSON.stringify(res.rooms?.[0]).slice(0, 500));
        dispatch({ type: "LOAD_ROOMS", rooms: res.rooms });
      } else {
        dispatch({ type: "SET_ERROR", error: "Failed to load rooms" });
      }
    } catch (error) {
      console.log("[Chat] fetchRooms error:", error);
      dispatch({ type: "SET_ERROR", error: extractErrorMessage(error) });
    }
  }, []);

  const getOrCreateRoom = useCallback(
    async (data: GetOrCreateRoomRequest): Promise<Room> => {
      console.log("[Chat] getOrCreateRoom:", data);
      const res = await chatService.getOrCreateRoom(data);
      console.log("[Chat] getOrCreateRoom response:", { Good: res.Good, roomId: res.room?.id, roomType: res.room?.type });
      if (res.Good && res.room) {
        dispatch({ type: "ADD_ROOM", room: res.room });
        return res.room;
      }
      throw new Error("Failed to create room");
    },
    []
  );

  const setCurrentRoom = useCallback((room: Room | null) => {
    dispatch({ type: "SET_CURRENT_ROOM", room });
  }, []);

  const deleteRoom = useCallback(async (roomId: string) => {
    const res = await chatService.deleteRoom(roomId);
    if (!res.Good) {
      throw new Error(res.message ?? "Failed to delete room");
    }
    socketService.emitRoomDeleted(roomId);
    dispatch({ type: "REMOVE_ROOM", roomId });
  }, []);

  const leaveRoom = useCallback(async (roomId: string) => {
    const res = await chatService.leaveRoom(roomId);
    if (!res.Good) {
      throw new Error(res.message ?? "Failed to leave room");
    }
    socketService.leaveChatRoom(roomId, userIdRef.current);
    dispatch({ type: "REMOVE_ROOM", roomId });
  }, []);

  const hideRoom = useCallback(async (roomId: string) => {
    const res = await chatService.hideRoom(roomId);
    if (!res.Good) {
      throw new Error("Failed to hide room");
    }
  }, []);

  const muteRoom = useCallback(async (roomId: string): Promise<boolean> => {
    const res = await chatService.muteRoom(roomId);
    if (!res.Good) {
      throw new Error("Failed to mute room");
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
  }, [state.rooms]);

  const clearMessages = useCallback(async (roomId: string) => {
    const res = await chatService.clearMessages(roomId);
    if (!res.Good) {
      throw new Error(res.message ?? "Failed to clear messages");
    }
    socketService.emitChatCleared(roomId);
    dispatch({ type: "LOAD_MESSAGES", messages: [], hasMore: false, append: false });
  }, []);

  // ── Message Actions ─────────────────────────────────────────────────────

  const fetchMessages = useCallback(
    async (roomId: string, page = 1) => {
      dispatch({ type: "SET_MESSAGES_LOADING", loading: true });
      try {
        const res = await chatService.getMessages(roomId, page);
        if (res.Good) {
          dispatch({
            type: "LOAD_MESSAGES",
            messages: res.messages,
            hasMore: res.hasMore,
            append: page > 1,
          });
          dispatch({ type: "SET_MESSAGE_PAGE", page });
        } else {
          dispatch({ type: "SET_ERROR", error: "Failed to load messages" });
        }
      } catch (error) {
        dispatch({ type: "SET_ERROR", error: extractErrorMessage(error) });
      }
    },
    []
  );

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
      onUploadProgress?: (progress: { loaded: number; total: number; percentage: number }) => void;
      abortUpload?: React.MutableRefObject<{ abort: () => void } | null>;
    }): Promise<ChatMessage> => {
      console.log("[Chat] sendMessage called", { room_id: params.room_id, text: params.text, hasAttachments: !!params.attachments?.length });

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
          dispatch({ type: "ADD_MESSAGE", message: res.message });
          return res.message;
        }
        throw new Error("Failed to send message");
      }

      // Has attachments — send as FormData (multipart)
      const { buildMessageFormData } = await import("@/utils/chatHelpers");
      const formData = buildMessageFormData(params);

      if (params.onUploadProgress) {
        const { uploadWithProgress } = await import("@/services/api/upload.service");
        const response = await new Promise<import("@/types/chat.types").SendMessageResponse>((resolve, reject) => {
          const uploader = uploadWithProgress("/chat/send-message", formData, {
            onProgress: params.onUploadProgress,
            onComplete: (resp) => resolve(resp as import("@/types/chat.types").SendMessageResponse),
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
          dispatch({ type: "ADD_MESSAGE", message: response.message });
          return response.message;
        }
        throw new Error("Failed to send message");
      }

      const res = await chatService.sendMessage(formData);
      console.log("[Chat] sendMessage FormData response:", { Good: res.Good, messageId: res.message?.id });
      if (res.Good && res.message) {
        dispatch({ type: "ADD_MESSAGE", message: res.message });
        return res.message;
      }
      throw new Error("Failed to send message");
    },
    []
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
        socketService.emitMessageUpdated(params.messageId, params.text, res.message.room_id);
        dispatch({ type: "UPDATE_MESSAGE", message: res.message });
        return res.message;
      }
      throw new Error("Failed to edit message");
    },
    []
  );

  const deleteChatMessage = useCallback(
    async (messageId: string, deleteFor: "self" | "everyone") => {
      const res = await chatService.deleteMessage(messageId, deleteFor);
      if (!res.Good) {
        throw new Error(res.message ?? "Failed to delete message");
      }
      if (deleteFor === "self") {
        dispatch({ type: "REMOVE_MESSAGE", messageId });
      }
      if (deleteFor === "everyone") {
        const roomId = stateRef.current.messages.find(
          (m) => m._id === messageId || m.id.toString() === messageId
        )?.room_id;
        if (roomId) {
          socketService.emitMessageDeleted(messageId, roomId);
        }
      }
    },
    []
  );

  // ── Reaction Actions ────────────────────────────────────────────────────

  const toggleReactionAction = useCallback(
    async (messageId: string, emoji: string) => {
      const res = await chatService.toggleReaction(messageId, emoji);
      if (res.Good && res.reactions) {
        const roomId = stateRef.current.messages.find(
          (m) => m._id === messageId || m.id.toString() === messageId
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
    []
  );

  // ── Pin Actions ─────────────────────────────────────────────────────────

  const fetchPinnedMessages = useCallback(async (roomId: string) => {
    const res = await chatService.getPinnedMessages(roomId);
    if (res.Good) {
      dispatch({ type: "SET_PINNED", messages: res.pinned });
    }
  }, []);

  const togglePinAction = useCallback(async (messageId: string) => {
    const res = await chatService.togglePin(messageId);
    if (!res.Good) {
      throw new Error("Failed to toggle pin");
    }
    socketService.emitMessagePinned(
      res.message.room_id,
      messageId,
      res.is_pinned,
      res.message
    );
    // Update message in state
    dispatch({ type: "UPDATE_MESSAGE", message: res.message });
    // Refresh the pinned banner list so it reflects the toggle immediately
    fetchPinnedMessages(res.message.room_id).catch(() => { });
  }, [fetchPinnedMessages]);

  // ── Member Actions ──────────────────────────────────────────────────────

  const addMemberAction = useCallback(
    async (roomId: string, userId: number) => {
      const res = await chatService.addMember(roomId, userId);
      if (!res.Good) {
        throw new Error(res.message ?? "Failed to add member");
      }
      const room = stateRef.current.rooms.find((r) => r._id === roomId);
      if (room && res.user) {
        socketService.emitMemberJoined({
          ...room,
          members: [...room.members, res.user],
        });
      }
    },
    []
  );

  const removeMemberAction = useCallback(
    async (roomId: string, userId: number) => {
      const res = await chatService.removeMember(roomId, userId);
      if (!res.Good) {
        throw new Error(res.message ?? "Failed to remove member");
      }
    },
    []
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
      const res = await chatService.createPostType({ roomId, name, color, icon });
      if (res.Good) {
        dispatch({ type: "SET_POST_TYPES", postTypes: res.customPostTypes });
      }
    },
    []
  );

  const deletePostTypeAction = useCallback(
    async (roomId: string, name: string) => {
      const res = await chatService.deletePostType({ roomId, name });
      if (res.Good) {
        dispatch({ type: "SET_POST_TYPES", postTypes: res.customPostTypes });
      }
    },
    []
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
      const res = await chatService.updatePermission({ roomId, userId, permission });
      if (res.Good) {
        dispatch({
          type: "SET_ROOM_PERMISSIONS",
          permissions: res.memberPermissions,
          createdBy: state.roomCreator ?? 0,
        });
      }
    },
    [state.roomCreator]
  );

  // ── Read State Actions ──────────────────────────────────────────────────

  const markReadAction = useCallback(async (roomId: string) => {
    const res = await chatService.markRead(roomId);
    if (res.Good) {
      // Update room unread count
      const room = state.rooms.find((r) => r._id === roomId);
      if (room) {
        dispatch({
          type: "UPDATE_ROOM",
          room: { ...room, unreadCount: 0, force_unread: false },
        });
      }
    }
  }, [state.rooms]);

  const markUnreadAction = useCallback(async (roomId: string) => {
    const res = await chatService.markUnread(roomId);
    if (res.Good) {
      const room = state.rooms.find((r) => r._id === roomId);
      if (room) {
        dispatch({
          type: "UPDATE_ROOM",
          room: { ...room, force_unread: true },
        });
      }
    }
  }, [state.rooms]);

  // ── Invitation Actions ──────────────────────────────────────────────────

  const inviteUserAction = useCallback(
    async (
      roomId: string,
      email: string,
      userId: number,
      permission: string
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
    []
  );

  const generateLinkAction = useCallback(
    async (
      roomId: string,
      permission: string,
      allowedUserIds: number[]
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
    []
  );

  // ── Project-Channel Actions ─────────────────────────────────────────────

  const createProjectWithChannelsAction = useCallback(
    async (projectId: number): Promise<Room> => {
      console.log("[Chat] createProjectWithChannels:", projectId);
      // 1. Create or get the project room
      const projectRoom = await getOrCreateRoom({
        type: "project",
        targetId: projectId,
      });
      console.log("[Chat] Project room created/found:", projectRoom.id, projectRoom.name);

      // 2. Auto-create "General" channel under this project
      try {
        const generalRoom = await getOrCreateRoom({
          type: "channel",
          name: "General",
          parent_id: projectRoom.id,
        });
        console.log("[Chat] General channel created:", generalRoom.id);
      } catch (err) {
        console.log("[Chat] General channel creation failed (may already exist):", err);
      }

      // 3. Auto-create "Description" channel under this project
      try {
        const descriptionRoom = await getOrCreateRoom({
          type: "channel",
          name: "Description",
          parent_id: projectRoom.id,
        });
        console.log("[Chat] Description channel created:", descriptionRoom.id);
      } catch (err) {
        console.log("[Chat] Description channel creation failed (may already exist):", err);
      }

      // 4. Refresh rooms to pick up the new channels
      await fetchRooms();

      return projectRoom;
    },
    [getOrCreateRoom, fetchRooms]
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
      chatService.searchUsers(query).then((res) => {
        if (res.Good) {
          dispatch({ type: "SET_SEARCH_RESULTS", results: res.users });
        }
      }).catch(() => { });
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

  const initSocket = useCallback(async (userId: number) => {
    userIdRef.current = userId;
    const socket = await socketService.connectSocket();

    const cleanupConnect = socketService.onSocketEvent("connect", () => {
      setSocketConnected(true);
      socketService.registerUser(userId);
      // Rejoin all rooms on reconnect
      stateRef.current.rooms.forEach((room) => {
        socketService.joinChatRoom(room._id);
      });
    });

    const cleanupDisconnect = socketService.onSocketEvent("disconnect", () => {
      setSocketConnected(false);
    });

    const cleanupConnectError = socketService.onSocketEvent("connect_error", () => {
      setSocketConnected(false);
    });

    const cleanupNewRoom = socketService.onSocketEvent("newRoom", (roomData) => {
      const room = roomData as Room;
      dispatch({ type: "ADD_ROOM", room });
      socketService.joinChatRoom(room._id);
    });

    const cleanupReceiveMessage = socketService.onSocketEvent(
      "receiveChatMessage",
      (messageData) => {
        const message = messageData as ChatMessage;
        dispatch({ type: "ADD_MESSAGE", message });

        // Update the room's last_message + unreadCount for real-time chat list updates
        const room = stateRef.current.rooms.find((r) => r._id === message.room_id);
        if (room) {
          // Only increment unreadCount when the message is from someone else
          // AND the user is not currently viewing that room
          const isFromOther = message.sender_id !== userIdRef.current;
          const isCurrentRoom = stateRef.current.currentRoom?._id === message.room_id;
          const newUnreadCount = (isFromOther && !isCurrentRoom)
            ? (room.unreadCount ?? 0) + 1
            : room.unreadCount;

          dispatch({
            type: "UPDATE_ROOM",
            room: {
              ...room,
              unreadCount: newUnreadCount,
              last_message: {
                text: message.text,
                sender_name: message.sender_name,
                createdAt: message.createdAt,
                attachments: message.attachments,
              },
            },
          });
        }

        if (message.sender_id !== userIdRef.current) {
          socketService.emitMessageDelivered(
            message._id,
            message.sender_id,
            message.room_id
          );
        }

        // ── Chat push (in-app) ─────────────────────────────────────────────
        // The backend does not send FCM for chat messages — it relies on the
        // socket, which only delivers while the app is running. Surface an
        // in-app toast for messages from other users in rooms the user is not
        // currently viewing and that are not muted. Messages mentioning the
        // current user also land in the Notifications inbox (Mentions tab).
        if (message.sender_id !== userIdRef.current) {
          const isCurrentRoom = stateRef.current.currentRoom?._id === message.room_id;
          const isMuted = room?.is_muted ?? false;
          if (!isCurrentRoom && !isMuted) {
            const isMention = (message.mentions ?? []).includes(userIdRef.current);
            const sender = message.sender_name ?? "Someone";
            const bodyText = message.text ?? "";
            if (isMention) {
              showInfo(`${sender} mentioned you`, bodyText);
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
              showInfo(sender, preview);
            }
          }
        }
      }
    );

const cleanupUserOnline = socketService.onSocketEvent("userOnline", (userIdData) => {
  const uid = userIdData as string;
  setOnlineUserIds((prev) => {
    if (prev.includes(uid)) return prev;
    return [...prev, uid];
  });
});

const cleanupUserOffline = socketService.onSocketEvent("userOffline", (userIdData) => {
  const uid = userIdData as string;
  setOnlineUserIds((prev) => prev.filter((id) => id !== uid));
});

const handleOnlineUsersEvent = (data: unknown) => {
  const ids = Array.isArray(data)
    ? data.map((id) => String(id))
    : typeof data === "object" && data !== null && Array.isArray((data as { userIds?: unknown[] }).userIds)
      ? (data as { userIds: unknown[] }).userIds.map((id) => String(id))
      : [];
  if (ids.length === 0) return;
  setOnlineUserIds(ids);
  dispatch({ type: "SET_ONLINE_USERS", userIds: ids });
};

const cleanupOnlineUsers = socketService.onSocketEvent("onlineUsers", handleOnlineUsersEvent);
const cleanupOnlineUsersList = socketService.onSocketEvent("onlineUsersList", handleOnlineUsersEvent);

const handleTypingEvent = (data: unknown) => {
  const typed = data as { room_id?: string; user_id: number; user_name: string; isTyping: boolean };
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

const cleanupUserTyping = socketService.onSocketEvent("userTyping", handleTypingEvent);
const cleanupTyping = socketService.onSocketEvent("typing", handleTypingEvent);

const cleanupMessageReaction = socketService.onSocketEvent(
  "messageReaction",
  (data) => {
    const typed = data as { messageId: string; reactions: MessageReaction[] };
    dispatch({
      type: "SET_REACTIONS",
      messageId: typed.messageId,
      reactions: typed.reactions,
    });
  }
);

const cleanupMessagePinned = socketService.onSocketEvent(
  "messagePinned",
  (data) => {
    const typed = data as { messageId: string; isPinned: boolean; message: ChatMessage };
    dispatch({ type: "UPDATE_MESSAGE", message: typed.message });
    if (typed.message?.room_id) {
      fetchPinnedMessages(typed.message.room_id).catch(() => { });
    }
  }
);

const cleanupMessageUpdated = socketService.onSocketEvent(
  "messageUpdated",
  (data) => {
    const typed = data as { messageId: string; text: string };
    const msg = stateRef.current.messages.find((m) => m._id === typed.messageId);
    if (msg) {
      dispatch({
        type: "UPDATE_MESSAGE",
        message: { ...msg, text: typed.text, is_edited: true },
      });
    }
  }
);

const cleanupMessageDeleted = socketService.onSocketEvent(
  "messageDeleted",
  (data) => {
    const typed = data as { messageId: string };
    dispatch({ type: "REMOVE_MESSAGE", messageId: typed.messageId });
  }
);

const cleanupMemberJoined = socketService.onSocketEvent(
  "memberJoined",
  (data) => {
    const typed = data as { room?: Room };
    if (typed.room) {
      dispatch({ type: "UPDATE_ROOM", room: typed.room });
    }
  }
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
          : m
      ),
      hasMore: cur.hasMore,
      append: false,
    });
  }
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
  }
);

const cleanupRoomDeleted = socketService.onSocketEvent(
  "roomDeleted",
  (data) => {
    const typed = data as { roomId: string };
    dispatch({ type: "REMOVE_ROOM", roomId: typed.roomId });
  }
);

const cleanupUserLeftRoom = socketService.onSocketEvent(
  "userLeftRoom",
  (data) => {
    const typed = data as { roomId: string; userId: string };
    const room = stateRef.current.rooms.find(
      (r) => r._id === typed.roomId
    );
    if (room) {
      dispatch({
        type: "UPDATE_ROOM",
        room: {
          ...room,
          members: room.members.filter(
            (m) => String(m.id) !== typed.userId
          ),
        },
      });
    }
  }
);

const cleanupRemovedFromRoom = socketService.onSocketEvent(
  "removedFromRoom",
  (data) => {
    const typed = data as { roomId: string };
    dispatch({ type: "REMOVE_ROOM", roomId: typed.roomId });
  }
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
  }
);

const cleanupChatRoomSettingUpdated = socketService.onSocketEvent(
  "chatRoomSettingUpdated",
  (data) => {
    const typed = data as {
      roomId: string;
      type: string;
      is_muted?: boolean;
    };
    if (typed.type === "mute" && typed.is_muted !== undefined) {
      const room = stateRef.current.rooms.find(
        (r) => r._id === typed.roomId
      );
      if (room) {
        dispatch({
          type: "UPDATE_ROOM",
          room: { ...room, is_muted: typed.is_muted },
        });
      }
    }
  }
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
];

// If already connected, register immediately
if (socket.connected) {
  setSocketConnected(true);
  socketService.registerUser(userId);
  stateRef.current.rooms.forEach((room) => {
    socketService.joinChatRoom(room._id);
  });
}
  }, [fetchPinnedMessages]);

const cleanupChatListeners = useCallback(() => {
  socketCleanupRef.current.forEach((cleanup) => cleanup());
  socketCleanupRef.current = [];
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
  [socketConnected, onlineUserIds, typingUsers]
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
    createProjectWithChannels: createProjectWithChannelsAction,
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
    createProjectWithChannelsAction,
    initSocket,
    cleanupChatListeners,
    cleanupSocket,
    logout,
  ]
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
