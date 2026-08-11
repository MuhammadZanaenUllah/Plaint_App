import { io, Socket } from "socket.io-client";
import { getStoredToken } from "@/utils/token";

const SOCKET_URL =
  process.env.EXPO_PUBLIC_SOCKET_URL ??
  "https://backend-planit.soulservices.com";

let socket: Socket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pendingListeners: Array<{ event: string; callback: (...args: unknown[]) => void }> = [];

// ─── Task Socket Types ───────────────────────────────────────────────────────

export type TaskUpdateAction =
  | "create"
  | "create_subtask"
  | "update"
  | "status_update"
  | "delete"
  | "sprint_assigned"
  | "schedule_update"
  | "add_note"
  | "update_note"
  | "delete_note"
  | "update_note_pin"
  | "update_note_reaction"
  | "add_attachment"
  | "delete_attachment";

export type TaskUpdatePayload = {
  company_id: number;
  action: TaskUpdateAction;
  data: Record<string, unknown>;
  assignee?: number;
  asigned_to?: number;
};

export type PriorityUpdatePayload = {
  company_id: number;
  action: "create" | "update" | "delete";
  data: { id: number; name?: string; color?: string; order?: number; company_id?: number };
};

export type JobStatusUpdatePayload = {
  company_id: number;
  action: "create" | "update" | "delete";
  data: { id: number; name?: string; company_id?: number; status?: number };
};

export type UserUpdatePayload = {
  company_id: number;
  action: "create" | "update" | "delete";
  data: Record<string, unknown>;
};

// ─── Socket Event Map ────────────────────────────────────────────────────────

type SocketEventMap = {
  // Server → Client — Chat
  newRoom: (room: unknown) => void;
  receiveChatMessage: (message: unknown) => void;
  project_update: (data: { action: string }) => void;
  roomDeleted: (data: { roomId: string }) => void;
  userLeftRoom: (data: { roomId: string; userId: string }) => void;
  chatRoomSettingUpdated: (data: {
    roomId: string;
    type: string;
    is_muted?: boolean;
  }) => void;
  userOnline: (userId: string) => void;
  userOffline: (userId: string) => void;
  userTyping: (data: {
    user_id: number;
    user_name: string;
    isTyping: boolean;
  }) => void;
  messageReaction: (data: {
    messageId: string;
    reactions: Array<{ emoji: string; users: number[] }>;
  }) => void;
  messagePinned: (data: {
    messageId: string;
    isPinned: boolean;
    message: unknown;
  }) => void;
  messageUpdated: (data: {
    messageId: string;
    text: string;
    room_id?: string;
  }) => void;
  messageDeleted: (data: { messageId: string }) => void;
  memberJoined: (data: { room: unknown }) => void;
  messageDelivered: (data: { messageId: string }) => void;
  messagesRead: (data: { room_id: string; user_id: string }) => void;
  chatCleared: (data: { roomId: string }) => void;
  roomPermissionUpdated: (data: {
    room_id: string;
    userId: number;
    permission: string;
    memberPermissions: Array<{ userId: number; permission: string }>;
  }) => void;
  removedFromRoom: (data: { roomId: string }) => void;

  // Server → Client — Tasks
  task_update: (payload: TaskUpdatePayload) => void;
  priority_update: (payload: PriorityUpdatePayload) => void;
  jobstatus_update: (payload: JobStatusUpdatePayload) => void;
  user_update: (payload: UserUpdatePayload) => void;

  // Server → Client — Shared
  notification: (data: {
    company_id: number;
    assigned_to: number;
    data: unknown;
  }) => void;

  // Internal
  connect: () => void;
  disconnect: (reason: string) => void;
  connect_error: (error: Error) => void;
};

// ─── Connection ───────────────────────────────────────────────────────────────

export async function connectSocket(): Promise<Socket> {
  if (socket?.connected) return socket;

  const token = await getStoredToken();

  socket = io(SOCKET_URL, {
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: Infinity,
    auth: token ? { token } : undefined,
  });

  // Apply listeners that were registered before the socket existed
  if (pendingListeners.length > 0) {
    pendingListeners.forEach(({ event, callback }) => {
      socket?.on(event as never, callback as never);
    });
    pendingListeners = [];
  }

  return socket;
}

export function disconnectSocket(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  pendingListeners = [];
}

export function getSocket(): Socket | null {
  return socket;
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerUser(userId: number): void {
  if (!socket?.connected) return;
  socket.emit("registerUser", String(userId));
  socket.emit("getOnlineUsers");
}

export function joinChatRoom(roomId: string): void {
  if (!socket?.connected) return;
  socket.emit("joinChatRoom", roomId);
}

export function leaveChatRoom(roomId: string, userId?: number | string): void {
  if (!socket?.connected) return;
  socket.emit("userLeftRoom", { roomId, userId: userId ? String(userId) : "" });
}

// ─── Typing ───────────────────────────────────────────────────────────────────

let typingTimeout: ReturnType<typeof setTimeout> | null = null;

export function emitTyping(
  roomId: string,
  userId: number,
  userName: string
): void {
  if (!socket?.connected) return;
  socket.emit("typing", {
    room_id: roomId,
    user_id: userId,
    user_name: userName,
    isTyping: true,
  });
}

export function emitStopTyping(
  roomId: string,
  userId: number,
  userName: string
): void {
  if (!socket?.connected) return;
  if (typingTimeout) clearTimeout(typingTimeout);
  socket.emit("typing", {
    room_id: roomId,
    user_id: userId,
    user_name: userName,
    isTyping: false,
  });
}

export function startTypingWithTimeout(
  roomId: string,
  userId: number,
  userName: string
): void {
  if (!socket?.connected) return;
  if (typingTimeout) clearTimeout(typingTimeout);

  socket.emit("typing", {
    room_id: roomId,
    user_id: userId,
    user_name: userName,
    isTyping: true,
  });

  typingTimeout = setTimeout(() => {
    emitStopTyping(roomId, userId, userName);
  }, 3000);
}

// ─── Message Events ───────────────────────────────────────────────────────────

export function emitMessageDelivered(
  messageId: string,
  senderId: number,
  roomId: string
): void {
  if (!socket?.connected) return;
  socket.emit("messageDelivered", { messageId, senderId, roomId });
}

export function emitMessagesRead(roomId: string, userId: number): void {
  if (!socket?.connected) return;
  socket.emit("messagesRead", {
    room_id: roomId,
    user_id: String(userId),
  });
}

export function emitMessagePinned(
  roomId: string,
  messageId: string,
  isPinned: boolean,
  message: unknown
): void {
  if (!socket?.connected) return;
  socket.emit("messagePinned", {
    room_id: roomId,
    messageId,
    isPinned,
    message,
  });
}

export function emitMessageUpdated(
  messageId: string,
  text: string,
  roomId: string
): void {
  if (!socket?.connected) return;
  socket.emit("messageUpdated", { messageId, text, room_id: roomId });
}

export function emitMessageDeleted(messageId: string, roomId: string): void {
  if (!socket?.connected) return;
  socket.emit("messageDeleted", { messageId, room_id: roomId });
}

export function emitMessageReaction(
  roomId: string,
  messageId: string,
  reactions: Array<{ emoji: string; users: number[] }>
): void {
  if (!socket?.connected) return;
  socket.emit("messageReaction", { room_id: roomId, messageId, reactions });
}

export function emitChatCleared(roomId: string): void {
  if (!socket?.connected) return;
  socket.emit("chatCleared", { roomId });
}

export function emitRoomDeleted(roomId: string): void {
  if (!socket?.connected) return;
  socket.emit("roomDeleted", { roomId });
}

export function emitMemberJoined(room: unknown): void {
  if (!socket?.connected) return;
  socket.emit("memberJoined", { room });
}

// ─── Listener Helpers ─────────────────────────────────────────────────────────

export function onSocketEvent<K extends string>(
  event: K,
  callback: (...args: unknown[]) => void
): () => void {
  if (socket) {
    socket.on(event as never, callback as never);
  } else {
    pendingListeners.push({ event, callback });
  }
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    if (socket) {
      socket.off(event as never, callback as never);
    }
    pendingListeners = pendingListeners.filter(
      (l) => !(l.event === event && l.callback === callback)
    );
  };
}

export function offSocketEvent<K extends string>(
  event: K,
  callback?: (...args: unknown[]) => void
): void {
  if (callback) {
    if (socket) {
      socket.off(event as never, callback as never);
    }
    pendingListeners = pendingListeners.filter(
      (l) => !(l.event === event && l.callback === callback)
    );
  } else {
    if (socket) {
      socket.off(event as never);
    }
    pendingListeners = pendingListeners.filter((l) => l.event !== event);
  }
}
