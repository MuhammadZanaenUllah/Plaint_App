// ─── Chat Module Types ────────────────────────────────────────────────────────
// Mirrors the PLANIT Backend Chat Module API contract exactly.

// ─── Room Types ───────────────────────────────────────────────────────────────

export type RoomType = "direct" | "project" | "channel";

export type RoomMember = {
  id: number;
  first_name: string;
  last_name: string;
  image: string;
  isOnline: boolean;
  email?: string;
};

export type RoomLastMessage = {
  text?: string;
  sender_name?: string;
  createdAt?: string;
  attachments?: { name: string; url: string }[];
};

export type Room = {
  _id: string;
  id: number;
  type: RoomType;
  name: string;
  my_visible_from: string | null;
  is_muted: boolean;
  force_unread: boolean;
  unreadCount: number;
  members: RoomMember[];
  parent_id?: number;
  created_by?: number;
  last_message?: RoomLastMessage;
};

export type GetRoomsResponse = {
  Good: boolean;
  rooms: Room[];
};

// ─── User Search ──────────────────────────────────────────────────────────────

export type SearchUser = {
  id: number;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  image?: string;
};

export type SearchUsersResponse = {
  Good: boolean;
  users: SearchUser[];
};

// ─── Get or Create Room ──────────────────────────────────────────────────────

export type GetOrCreateRoomRequest = {
  type: RoomType;
  targetId?: number;
  name?: string;
  parent_id?: number;
};

export type GetOrCreateRoomResponse = {
  Good: boolean;
  room: Room;
};

// ─── Message Types ────────────────────────────────────────────────────────────

export type MessageAttachment = {
  name: string;
  url: string;
  type?: string;
  size?: number;
};

export type MessageReaction = {
  emoji: string;
  users: number[];
};

export type ChatMessage = {
  _id: string;
  id: number;
  room_id: string;
  sender_id: number;
  text: string;
  sender_name?: string;
  sender_image?: string;
  attachments: MessageAttachment[];
  parent_id: string | null;
  reactions?: MessageReaction[];
  is_pinned?: boolean;
  is_edited?: boolean;
  is_read?: number[];
  postType?: string;
  is_forwarded?: boolean;
  forwarded_from_name?: string;
  mentions?: number[];
  createdAt?: string;
  updatedAt?: string;
};

export type GetMessagesResponse = {
  Good: boolean;
  messages: ChatMessage[];
  hasMore: boolean;
};

// ─── Send Message ─────────────────────────────────────────────────────────────

export type SendMessageRequest = {
  room_id: string;
  text: string;
  mentions?: number[];
  parent_id?: string;
  postType?: string;
  is_forwarded?: boolean;
  forwarded_from_name?: string;
};

export type SendMessageResponse = {
  Good: true;
  message: ChatMessage;
};

// ─── Edit Message ─────────────────────────────────────────────────────────────

export type EditMessageRequest = {
  messageId: string;
  text: string;
  keepAttachmentIds?: string[];
  newAttachments?: FormData[];
};

export type EditMessageResponse = {
  Good: true;
  message: ChatMessage;
};

// ─── Delete Message ───────────────────────────────────────────────────────────

export type DeleteMessageRequest = {
  messageId: string;
  deleteFor: "self" | "everyone";
};

export type DeleteMessageResponse = {
  Good: true;
  deleteFor: "self" | "everyone";
  message: string;
};

// ─── Reactions ────────────────────────────────────────────────────────────────

export type ReactionRequest = {
  messageId: string;
  emoji: string;
};

export type ReactionResponse = {
  Good: true;
  reactions: MessageReaction[];
};

// ─── URL Preview ──────────────────────────────────────────────────────────────

export type UrlPreviewData = {
  title: string;
  description: string;
  images: string[];
};

export type UrlPreviewResponse = {
  Good: true;
  data: UrlPreviewData;
};

// ─── Members ──────────────────────────────────────────────────────────────────

export type AddMemberRequest = {
  roomId: string;
  userId: number;
};

export type AddMemberResponse = {
  Good: true;
  message: string;
  user: RoomMember;
};

export type RemoveMemberRequest = {
  roomId: string;
  userId: number;
};

export type RemoveMemberResponse = {
  Good: true;
  message: string;
};

// ─── Leave Room ───────────────────────────────────────────────────────────────

export type LeaveRoomResponse = {
  Good: true;
  message: string;
};

// ─── Delete Room ──────────────────────────────────────────────────────────────

export type DeleteRoomResponse = {
  Good: true;
  message: string;
};

// ─── Clear Messages ───────────────────────────────────────────────────────────

export type ClearMessagesResponse = {
  Good: true;
  message: string;
};

// ─── Pins ─────────────────────────────────────────────────────────────────────

export type TogglePinRequest = {
  messageId: string;
};

export type TogglePinResponse = {
  Good: true;
  is_pinned: boolean;
  message: ChatMessage;
};

export type GetPinnedMessagesResponse = {
  Good: true;
  pinned: ChatMessage[];
};

// ─── Post Types ───────────────────────────────────────────────────────────────

export type CustomPostType = {
  name: string;
  color: string;
  icon: string;
};

export type GetPostTypesResponse = {
  Good: true;
  customPostTypes: CustomPostType[];
};

export type CreatePostTypeRequest = {
  roomId: string;
  name: string;
  color: string;
  icon: string;
};

export type CreatePostTypeResponse = {
  Good: true;
  customPostTypes: CustomPostType[];
};

export type DeletePostTypeRequest = {
  roomId: string;
  name: string;
};

export type DeletePostTypeResponse = {
  Good: true;
  customPostTypes: CustomPostType[];
};

// ─── Room Management ──────────────────────────────────────────────────────────

export type MarkReadResponse = {
  Good: true;
  modifiedCount: number;
};

export type HideRoomResponse = {
  Good: true;
};

export type MuteRoomResponse = {
  Good: true;
  data: { is_muted: boolean };
};

export type MarkUnreadResponse = {
  Good: true;
};

// ─── Invitations ──────────────────────────────────────────────────────────────

export type InviteRequest = {
  roomId: string;
  email: string;
  userId?: number;
  permission: string;
};

export type InviteResponse = {
  Good: true;
  inviteLink: string;
};

export type GenerateLinkRequest = {
  roomId: string;
  permission: string;
  /** If true, any user with the link can join; otherwise only allowedUserIds */
  forAllUsers?: boolean;
  allowedUserIds?: number[];
};

export type GenerateLinkResponse = {
  Good: true;
  inviteLink: string;
};

export type AcceptInviteResponse = {
  Good: true;
  room: Room;
  permission: string;
};

// ─── Permissions ──────────────────────────────────────────────────────────────

export type UpdatePermissionRequest = {
  roomId: string;
  userId: number;
  permission: string;
};

export type MemberPermission = {
  userId: number;
  permission: string;
};

export type UpdatePermissionResponse = {
  Good: true;
  memberPermissions: MemberPermission[];
};

export type GetRoomPermissionsResponse = {
  Good: true;
  memberPermissions: MemberPermission[];
  created_by: number;
};

export type ChatPermission = "Full edit" | "Edit" | "Comment" | "View Only";

// ─── Chat Context State ──────────────────────────────────────────────────────

export type ChatState = {
  rooms: Room[];
  currentRoom: Room | null;
  messages: ChatMessage[];
  hasMore: boolean;
  messagePage: number;
  pinnedMessages: ChatMessage[];
  postTypes: CustomPostType[];
  roomPermissions: MemberPermission[];
  roomCreator: number | null;
  loading: boolean;
  messagesLoading: boolean;
  error: string | null;
  searchQuery: string;
  searchResults: SearchUser[];
  searching: boolean;
};

// ─── Notification Types ─────────────────────────────────────────────────────

export type NotificationItem = {
  id: number;
  title: string;
  task_id: number;
  lead_id: number;
  created_by: number;
  company_id: number;
  assigned_to: number;
  typ: string;
  identifier: string;
  description: string;
  createdAt: string;
  readed: number;
  assigned: {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    image: string;
  };
};

export type GetNotificationsResponse = {
  Good: boolean;
  data: {
    notifications: NotificationItem[];
  };
};

export type MarkNotificationReadResponse = {
  Good: boolean;
  message: string;
};
