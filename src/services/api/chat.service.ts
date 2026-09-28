import { apiGet, apiPost, apiUpload } from "./client";
import {
  GetRoomsResponse,
  SearchUsersResponse,
  GetOrCreateRoomRequest,
  GetOrCreateRoomResponse,
  GetMessagesResponse,
  SendMessageResponse,
  EditMessageResponse,
  DeleteMessageResponse,
  ReactionResponse,
  UrlPreviewResponse,
  AddMemberResponse,
  RemoveMemberResponse,
  LeaveRoomResponse,
  DeleteRoomResponse,
  ClearMessagesResponse,
  TogglePinResponse,
  GetPinnedMessagesResponse,
  GetPostTypesResponse,
  CreatePostTypeRequest,
  CreatePostTypeResponse,
  DeletePostTypeRequest,
  DeletePostTypeResponse,
  MarkReadResponse,
  HideRoomResponse,
  MuteRoomResponse,
  MarkUnreadResponse,
  InviteRequest,
  InviteResponse,
  GenerateLinkRequest,
  GenerateLinkResponse,
  AcceptInviteResponse,
  UpdatePermissionRequest,
  UpdatePermissionResponse,
  GetRoomPermissionsResponse,
  GetNotificationsResponse,
  MarkNotificationReadResponse,
} from "@/types/chat.types";

// ─── Rooms ────────────────────────────────────────────────────────────────────

export async function getRooms(): Promise<GetRoomsResponse> {
  return apiGet<GetRoomsResponse>("/chat/rooms");
}

export async function searchUsers(
  query: string
): Promise<SearchUsersResponse> {
  return apiGet<SearchUsersResponse>("/chat/search-users", { query });
}

export async function getOrCreateRoom(
  data: GetOrCreateRoomRequest
): Promise<GetOrCreateRoomResponse> {
  return apiPost<GetOrCreateRoomResponse>("/chat/get-or-create-room", data);
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export async function getMessages(
  roomId: string,
  page = 1,
  limit = 50,
  after?: string
): Promise<GetMessagesResponse> {
  const params: Record<string, string | number> = { page, limit };
  if (after) params.after = after;
  return apiGet<GetMessagesResponse>(`/chat/messages/${roomId}`, params);
}

export async function sendMessage(
  formData: FormData
): Promise<SendMessageResponse> {
  return apiUpload<SendMessageResponse>("/chat/send-message", formData);
}

export async function sendTextMessage(
  data: Record<string, unknown>
): Promise<SendMessageResponse> {
  return apiPost<SendMessageResponse>("/chat/send-message", data);
}

export async function editMessage(
  formData: FormData
): Promise<EditMessageResponse> {
  return apiUpload<EditMessageResponse>("/chat/edit-message", formData);
}

export async function deleteMessage(
  messageId: string,
  deleteFor: "me" | "everyone"
): Promise<DeleteMessageResponse> {
  return apiPost<DeleteMessageResponse>("/chat/delete-message", {
    messageId,
    deleteFor,
  });
}

// ─── Reactions ────────────────────────────────────────────────────────────────

export async function toggleReaction(
  messageId: string,
  emoji: string
): Promise<ReactionResponse> {
  return apiPost<ReactionResponse>("/chat/reaction", { messageId, emoji });
}

// ─── URL Preview ──────────────────────────────────────────────────────────────

export async function getUrlPreview(url: string): Promise<UrlPreviewResponse> {
  return apiGet<UrlPreviewResponse>("/chat/url-preview", { url });
}

// ─── Members ──────────────────────────────────────────────────────────────────

export async function addMember(
  roomId: string,
  userId: number
): Promise<AddMemberResponse> {
  return apiPost<AddMemberResponse>("/chat/add-member", { roomId, userId });
}

export async function removeMember(
  roomId: string,
  userId: number
): Promise<RemoveMemberResponse> {
  return apiPost<RemoveMemberResponse>("/chat/remove-member", { roomId, userId });
}

export async function leaveRoom(
  roomId: string
): Promise<LeaveRoomResponse> {
  return apiPost<LeaveRoomResponse>("/chat/leave-room", { roomId });
}

// ─── Room Management ──────────────────────────────────────────────────────────

export async function deleteRoom(
  roomId: string
): Promise<DeleteRoomResponse> {
  return apiPost<DeleteRoomResponse>("/chat/delete-room", { roomId });
}

export async function clearMessages(
  roomId: string
): Promise<ClearMessagesResponse> {
  return apiPost<ClearMessagesResponse>("/chat/clear-messages", { roomId });
}

export async function hideRoom(
  roomId: string
): Promise<HideRoomResponse> {
  return apiPost<HideRoomResponse>("/chat/hide-room", { roomId });
}

export async function muteRoom(
  roomId: string
): Promise<MuteRoomResponse> {
  return apiPost<MuteRoomResponse>("/chat/mute-room", { roomId });
}

export async function markRead(
  roomId: string
): Promise<MarkReadResponse> {
  return apiPost<MarkReadResponse>("/chat/mark-read", { roomId });
}

export async function markUnread(
  roomId: string
): Promise<MarkUnreadResponse> {
  return apiPost<MarkUnreadResponse>("/chat/mark-unread", { roomId });
}

// ─── Pins ─────────────────────────────────────────────────────────────────────

export async function togglePin(
  messageId: string
): Promise<TogglePinResponse> {
  return apiPost<TogglePinResponse>("/chat/toggle-pin", { messageId });
}

export async function getPinnedMessages(
  roomId: string
): Promise<GetPinnedMessagesResponse> {
  return apiGet<GetPinnedMessagesResponse>(`/chat/pins/${roomId}`);
}

// ─── Post Types ───────────────────────────────────────────────────────────────

export async function getPostTypes(
  roomId: string
): Promise<GetPostTypesResponse> {
  return apiGet<GetPostTypesResponse>(`/chat/post-types/${roomId}`);
}

export async function createPostType(
  data: CreatePostTypeRequest
): Promise<CreatePostTypeResponse> {
  return apiPost<CreatePostTypeResponse>("/chat/post-types", data);
}

export async function deletePostType(
  data: DeletePostTypeRequest
): Promise<DeletePostTypeResponse> {
  return apiPost<DeletePostTypeResponse>("/chat/post-types/delete", data);
}

// ─── Invitations ──────────────────────────────────────────────────────────────

export async function inviteUser(
  data: InviteRequest
): Promise<InviteResponse> {
  return apiPost<InviteResponse>("/chat/invite", data);
}

export async function generateLink(
  data: GenerateLinkRequest
): Promise<GenerateLinkResponse> {
  return apiPost<GenerateLinkResponse>("/chat/generate-link", data);
}

export async function acceptInvite(
  token: string
): Promise<AcceptInviteResponse> {
  return apiGet<AcceptInviteResponse>(`/chat/accept-invite/${token}`);
}

// ─── Permissions ──────────────────────────────────────────────────────────────

export async function updatePermission(
  data: UpdatePermissionRequest
): Promise<UpdatePermissionResponse> {
  return apiPost<UpdatePermissionResponse>("/chat/update-permission", data);
}

export async function getRoomPermissions(
  roomId: string
): Promise<GetRoomPermissionsResponse> {
  return apiGet<GetRoomPermissionsResponse>(`/chat/room-permissions/${roomId}`);
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function getNotifications(
  companyId: number,
  includeRead = false
): Promise<GetNotificationsResponse> {
  return apiGet<GetNotificationsResponse>("/notification/all", {
    company_id: companyId,
    include_read: includeRead ? "true" : "false",
  });
}

export async function markNotificationRead(
  notificationId: number
): Promise<MarkNotificationReadResponse> {
  return apiPost<MarkNotificationReadResponse>(
    `/notification/readone/${notificationId}`
  );
}

export async function markAllNotificationsRead(
  companyId: number
): Promise<MarkNotificationReadResponse> {
  return apiGet<MarkNotificationReadResponse>("/notification/readall", {
    company_id: companyId,
  });
}
