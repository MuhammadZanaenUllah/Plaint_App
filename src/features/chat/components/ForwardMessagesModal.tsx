import { Ionicons } from "@expo/vector-icons";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import Avatar from "@/components/Avatar";
import {
  MESSAGE_MAX_LENGTH,
  getOutgoingMessageText,
  isBlankMessage,
} from "@/features/chat/messageText";
import { useChat } from "@/hooks/useChat";
import type { ChatMessage, Room, SearchUser } from "@/types/chat.types";
import {
  getRoomAvatar,
  getRoomDisplayName,
  isSelfChatRoom,
  sortRoomsByRecentActivity,
  stripSelfChatMarker,
} from "@/utils/chatHelpers";
import {
  decodeAttachmentName,
  downloadChatAttachmentToCache,
} from "@/utils/openChatDocument";
import { rf } from "@/utils/responsive";
import { showError, showSuccess } from "@/utils/toast";

type ForwardAttachment = { uri: string; name: string; type: string };

type ForwardTarget = {
  key: string;
  kind: "room" | "user";
  name: string;
  subtitle?: string;
  image?: string | null;
  room?: Room;
  userId?: number;
  email?: string;
};

type Props = {
  messages: ChatMessage[];
  currentUserId: number;
  onClose: () => void;
};

function userDisplayName(user: SearchUser): string {
  return (
    user.full_name?.trim() ||
    `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() ||
    user.email?.split("@")[0] ||
    `User #${user.id}`
  );
}

function SelectionCircle({ selected }: { selected: boolean }) {
  return (
    <Ionicons
      name={selected ? "checkmark-circle" : "ellipse-outline"}
      size={21}
      color={selected ? "#00DEAB" : "#C9CDD4"}
    />
  );
}

export default function ForwardMessagesModal({
  messages,
  currentUserId,
  onClose,
}: Props) {
  const { state, fetchRooms, setSearchQuery, sendMessage, getOrCreateRoom } =
    useChat();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Map<string, ForwardTarget>>(
    new Map(),
  );
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);

  const attachmentsRef = useRef(
    new Map<ChatMessage, Promise<ForwardAttachment[]>>(),
  );
  const progressRef = useRef<Record<string, number>>({});
  const noteSentRef = useRef<Set<string>>(new Set());

  // Refresh rooms and isolate the shared user-search state while this modal is
  // open. No local setState here, so the effect only synchronizes with Chat.
  useEffect(() => {
    fetchRooms({ silent: true }).catch(() => {});
    setSearchQuery("");
    return () => setSearchQuery("");
  }, [fetchRooms, setSearchQuery]);

  const projectsById = useMemo(() => {
    const map = new Map<number, string>();
    for (const room of state.rooms) {
      if (room.type === "project") map.set(room.id, room.name);
    }
    return map;
  }, [state.rooms]);

  const buildRoomTarget = useCallback(
    (room: Room): ForwardTarget => {
      const projectId =
        room.type === "channel" && room.parent_id != null
          ? Number(room.parent_id)
          : null;
      return {
        key: `room:${room._id ?? room.id}`,
        kind: "room",
        name: getRoomDisplayName(room, currentUserId),
        subtitle:
          projectId != null ? projectsById.get(projectId) : undefined,
        image: getRoomAvatar(room, currentUserId),
        room,
      };
    },
    [currentUserId, projectsById],
  );

  const directRooms = useMemo(
    () => state.rooms.filter((room) => room.type === "direct"),
    [state.rooms],
  );
  const channelRooms = useMemo(
    () => state.rooms.filter((room) => room.type === "channel"),
    [state.rooms],
  );
  const normalChannelRooms = useMemo(
    () =>
      channelRooms.filter(
        (room) =>
          room.parent_id == null ||
          !projectsById.has(Number(room.parent_id)),
      ),
    [channelRooms, projectsById],
  );
  const projectChannelRooms = useMemo(
    () =>
      channelRooms.filter(
        (room) =>
          room.parent_id != null &&
          projectsById.has(Number(room.parent_id)),
      ),
    [channelRooms, projectsById],
  );

  const directTargets = useMemo(
    () => directRooms.map(buildRoomTarget),
    [directRooms, buildRoomTarget],
  );
  const normalChannelTargets = useMemo(
    () => normalChannelRooms.map(buildRoomTarget),
    [normalChannelRooms, buildRoomTarget],
  );
  const projectChannelTargets = useMemo(
    () => projectChannelRooms.map(buildRoomTarget),
    [projectChannelRooms, buildRoomTarget],
  );
  const recentTargets = useMemo(
    () =>
      sortRoomsByRecentActivity([...directRooms, ...channelRooms])
        .slice(0, 5)
        .map(buildRoomTarget),
    [directRooms, channelRooms, buildRoomTarget],
  );

  const directPeerIds = useMemo(() => {
    const ids = new Set<number>();
    for (const room of directRooms) {
      if (isSelfChatRoom(room, currentUserId)) {
        ids.add(currentUserId);
        continue;
      }
      const other = (room.members ?? []).find(
        (member) => String(member.id) !== String(currentUserId),
      );
      if (other) ids.add(Number(other.id));
    }
    return ids;
  }, [directRooms, currentUserId]);

  const query = search.trim().toLowerCase();
  const matchesTarget = useCallback(
    (target: ForwardTarget) =>
      !query ||
      target.name.toLowerCase().includes(query) ||
      (target.subtitle ?? "").toLowerCase().includes(query) ||
      (target.email ?? "").toLowerCase().includes(query),
    [query],
  );

  const filteredDirect = useMemo(
    () => directTargets.filter(matchesTarget),
    [directTargets, matchesTarget],
  );
  const filteredChannels = useMemo(
    () => normalChannelTargets.filter(matchesTarget),
    [normalChannelTargets, matchesTarget],
  );
  const filteredProjectChannels = useMemo(
    () => projectChannelTargets.filter(matchesTarget),
    [projectChannelTargets, matchesTarget],
  );

  const userTargets = useMemo<ForwardTarget[]>(() => {
    if (query.length < 2) return [];
    return (state.searchResults ?? [])
      .filter((user) => !directPeerIds.has(Number(user.id)))
      .map((user) => ({
        key: `user:${user.id}`,
        kind: "user" as const,
        name: userDisplayName(user),
        subtitle: user.email,
        image: user.image ?? null,
        userId: Number(user.id),
        email: user.email,
      }))
      .filter(matchesTarget);
  }, [query, state.searchResults, directPeerIds, matchesTarget]);

  const toggleTarget = useCallback((target: ForwardTarget) => {
    setSelected((previous) => {
      const next = new Map(previous);
      if (next.has(target.key)) next.delete(target.key);
      else next.set(target.key, target);
      return next;
    });
  }, []);

  const toggleAll = useCallback((targets: ForwardTarget[]) => {
    setSelected((previous) => {
      const next = new Map(previous);
      const allSelected =
        targets.length > 0 && targets.every((target) => next.has(target.key));
      if (allSelected) {
        for (const target of targets) next.delete(target.key);
      } else {
        for (const target of targets) next.set(target.key, target);
      }
      return next;
    });
  }, []);

  const isAllSelected = useCallback(
    (targets: ForwardTarget[]) =>
      targets.length > 0 &&
      targets.every((target) => selected.has(target.key)),
    [selected],
  );

  const getForwardAttachments = useCallback(
    (message: ChatMessage): Promise<ForwardAttachment[]> => {
      const cached = attachmentsRef.current.get(message);
      if (cached) return cached;
      const promise = Promise.all(
        (message.attachments ?? []).map(async (attachment) => {
          const local = await downloadChatAttachmentToCache(
            attachment.url,
            decodeAttachmentName(attachment.name),
          );
          if (!local) return null;
          return {
            uri: local.uri,
            name: local.fileName,
            type:
              attachment.type ||
              attachment.mimeType ||
              attachment.mime_type ||
              local.mime,
          };
        }),
      ).then((downloaded) =>
        downloaded.filter((item): item is ForwardAttachment => !!item),
      );
      attachmentsRef.current.set(message, promise);
      promise.catch(() => {
        if (attachmentsRef.current.get(message) === promise) {
          attachmentsRef.current.delete(message);
        }
      });
      return promise;
    },
    [],
  );

  const handleClose = useCallback(() => {
    if (!sending) onClose();
  }, [sending, onClose]);

  const handleSend = useCallback(async () => {
    if (sending || selected.size === 0 || messages.length === 0) return;
    setSending(true);
    const failed: ForwardTarget[] = [];
    const visitedRooms = new Set<string>();

    for (const target of Array.from(selected.values())) {
      try {
        let room: Room | undefined = target.room;
        if (!room && target.kind === "user" && target.userId != null) {
          room = await getOrCreateRoom({
            type: "direct",
            targetId: target.userId,
          });
        }
        if (!room?._id) throw new Error("Room unavailable");

        const roomKey = String(room._id);
        if (visitedRooms.has(roomKey)) continue;
        visitedRooms.add(roomKey);

        const startIndex = progressRef.current[roomKey] ?? 0;
        for (
          let index = startIndex;
          index < messages.length;
          index += 1
        ) {
          const message = messages[index];
          const attachments = await getForwardAttachments(message);
          await sendMessage({
            room_id: room._id,
            text: message.text,
            is_forwarded: true,
            forwarded_from_name: message.sender_name || "Someone",
            ...(attachments.length > 0 ? { attachments } : {}),
          });
          progressRef.current[roomKey] = index + 1;
        }

        if (
          !isBlankMessage(note) &&
          !noteSentRef.current.has(roomKey)
        ) {
          await sendMessage({
            room_id: room._id,
            text: getOutgoingMessageText(note),
          });
          noteSentRef.current.add(roomKey);
        }
      } catch {
        failed.push(target);
      }
    }

    setSending(false);
    if (failed.length === 0) {
      showSuccess(
        "Forwarded",
        `${messages.length} message${messages.length === 1 ? "" : "s"} forwarded to ${visitedRooms.size} chat${visitedRooms.size === 1 ? "" : "s"}.`,
      );
      onClose();
    } else {
      setSelected(new Map(failed.map((target) => [target.key, target])));
      showError(
        "Error",
        `Could not forward to ${failed.length} chat${failed.length === 1 ? "" : "s"}.`,
      );
    }
  }, [
    sending,
    selected,
    messages,
    note,
    getOrCreateRoom,
    getForwardAttachments,
    sendMessage,
    onClose,
  ]);

  const messageCount = messages.length;
  const firstMessage = messages[0];
  const sameSender = messages.every(
    (message) =>
      (message.sender_name ?? "") === (firstMessage?.sender_name ?? ""),
  );
  const senderLabel = sameSender
    ? firstMessage?.sender_name || "Someone"
    : "your selection";
  const textOnlyCount = messages.filter(
    (message) =>
      (message.text?.trim().length ?? 0) > 0 &&
      (message.attachments?.length ?? 0) === 0,
  ).length;
  const attachmentCount = messages.reduce(
    (total, message) => total + (message.attachments?.length ?? 0),
    0,
  );
  const typeSummary =
    textOnlyCount === messageCount
      ? `${messageCount} text`
      : attachmentCount > 0 && textOnlyCount === 0
        ? `${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"}`
        : `${messageCount} messages`;
  const previewSummary = `${messageCount} message${messageCount === 1 ? "" : "s"} from ${senderLabel} · ${typeSummary}`;

  const renderSection = (title: string, targets: ForwardTarget[]) => {
    if (targets.length === 0) return null;
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {title} · {targets.length}
          </Text>
          <TouchableOpacity
            style={styles.selectAll}
            activeOpacity={0.7}
            onPress={() => toggleAll(targets)}
          >
            <Text style={styles.selectAllText}>Select all</Text>
            <SelectionCircle selected={isAllSelected(targets)} />
          </TouchableOpacity>
        </View>
        {targets.map((target) => (
          <TouchableOpacity
            key={target.key}
            style={styles.row}
            activeOpacity={0.7}
            onPress={() => toggleTarget(target)}
          >
            <Avatar
              name={stripSelfChatMarker(target.name)}
              imagePath={target.image}
              size={30}
              borderRadius={15}
              fontSize={11}
              fontFamily="SF_Pro_Medium"
            />
            <View style={styles.rowInfo}>
              <Text style={styles.rowName} numberOfLines={1}>
                {target.name}
              </Text>
              {target.subtitle ? (
                <Text style={styles.rowSubtitle} numberOfLines={1}>
                  {target.subtitle}
                </Text>
              ) : null}
            </View>
            <SelectionCircle selected={selected.has(target.key)} />
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="arrow-redo" size={18} color="#0B0B0B" />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>
                Forward {messageCount} message{messageCount === 1 ? "" : "s"}
              </Text>
              <Text style={styles.subtitle}>Choose who should receive them</Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              activeOpacity={0.7}
              onPress={handleClose}
              disabled={sending}
            >
              <Ionicons name="close" size={18} color="#1A1A1A" />
            </TouchableOpacity>
          </View>

          <View style={styles.previewPill}>
            <Avatar
              name={firstMessage?.sender_name || "You"}
              imagePath={firstMessage?.sender_image}
              size={34}
              borderRadius={17}
              fontSize={11}
              fontFamily="SF_Pro_Medium"
            />
            <Text style={styles.previewSummary} numberOfLines={1}>
              {previewSummary}
            </Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setPreviewExpanded((expanded) => !expanded)}
            >
              <Text style={styles.previewAction}>
                {previewExpanded ? "Hide" : "Preview"}
              </Text>
            </TouchableOpacity>
          </View>

          {previewExpanded ? (
            <View style={styles.inlinePreviewBox}>
              <ScrollView
                style={styles.inlinePreviewScroll}
                nestedScrollEnabled
                showsVerticalScrollIndicator
              >
                {messages.map((message, index) => {
                  const text = message.text?.trim();
                  const count = message.attachments?.length ?? 0;
                  const line =
                    text ||
                    (count > 0
                      ? `📎 ${count} attachment${count === 1 ? "" : "s"}`
                      : "Message");
                  return (
                    <Text
                      key={`inline-preview-${message._id ?? message.id ?? index}`}
                      style={styles.inlinePreviewLine}
                    >
                      <Text style={styles.inlinePreviewSender}>
                        {message.sender_name || "You"}:{" "}
                      </Text>
                      {line}
                    </Text>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          <View style={styles.searchBox}>
            <Text style={styles.toLabel}>To:</Text>
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={(value) => {
                setSearch(value);
                setSearchQuery(value);
              }}
              placeholder="Search people or channels..."
              placeholderTextColor="#A0A4AB"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {search.length > 0 ? (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  setSearch("");
                  setSearchQuery("");
                }}
              >
                <Ionicons name="close-circle" size={16} color="#C4C7CC" />
              </TouchableOpacity>
            ) : null}
          </View>

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
            {query.length === 0 && recentTargets.length > 0 ? (
              <View style={styles.recentSection}>
                <Text style={styles.sectionTitle}>RECENT</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.recentRow}
                >
                  {recentTargets.map((target) => {
                    const isSelected = selected.has(target.key);
                    return (
                      <TouchableOpacity
                        key={`recent-${target.key}`}
                        style={styles.recentItem}
                        activeOpacity={0.7}
                        onPress={() => toggleTarget(target)}
                      >
                        <View
                          style={[
                            styles.recentAvatarWrap,
                            isSelected && styles.recentAvatarSelected,
                          ]}
                        >
                          <Avatar
                            name={stripSelfChatMarker(target.name)}
                            imagePath={target.image}
                            size={38}
                            borderRadius={19}
                            fontSize={13}
                            fontFamily="SF_Pro_Medium"
                          />
                          {isSelected ? (
                            <View style={styles.recentCheck}>
                              <Ionicons
                                name="checkmark"
                                size={9}
                                color="#fff"
                              />
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.recentName} numberOfLines={1}>
                          {target.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            {renderSection("PEOPLE", userTargets)}
            {renderSection("INBOX", filteredDirect)}
            {renderSection("CHANNELS", filteredChannels)}
            {renderSection("PROJECT CHANNELS", filteredProjectChannels)}

            {userTargets.length === 0 &&
            filteredDirect.length === 0 &&
            filteredChannels.length === 0 &&
            filteredProjectChannels.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>
                  No people or channels found
                </Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.noteBox}>
            <TextInput
              style={styles.noteInput}
              value={note}
              onChangeText={setNote}
              placeholder="Add a note (optional)"
              placeholderTextColor="#A0A4AB"
              multiline
              maxLength={MESSAGE_MAX_LENGTH}
            />
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerCount}>
              {selected.size === 0
                ? "Nobody selected yet"
                : `${selected.size} selected`}
            </Text>
            <TouchableOpacity
              style={[
                styles.forwardBtn,
                (selected.size === 0 || sending) && styles.forwardBtnDisabled,
              ]}
              activeOpacity={0.85}
              disabled={selected.size === 0 || sending}
              onPress={handleSend}
            >
              {sending ? (
                <>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.forwardBtnText}>Forwarding...</Text>
                </>
              ) : (
                <>
                  <Text
                    style={[
                      styles.forwardBtnText,
                      selected.size === 0 && styles.forwardBtnTextDisabled,
                    ]}
                  >
                    Forward
                  </Text>
                  <Ionicons
                    name="arrow-forward"
                    size={16}
                    color={selected.size === 0 ? "#A3A3A3" : "#fff"}
                  />
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>

  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.38)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  card: {
    width: "100%",
    maxWidth: 460,
    maxHeight: "88%",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 18,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#0CD5A3",
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1 },
  title: {
    fontSize: rf(16),
    lineHeight: rf(20),
    fontFamily: "SF_Pro_Semibold",
    color: "#111111",
  },
  subtitle: {
    marginTop: 1,
    fontSize: rf(11),
    lineHeight: rf(14),
    fontFamily: "SF_Pro_Regular",
    color: "#7A7F87",
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#F4F4F5",
    alignItems: "center",
    justifyContent: "center",
  },
  previewPill: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#EAFBF5",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  previewSummary: {
    flex: 1,
    fontSize: rf(12),
    fontFamily: "SF_Pro_Medium",
    color: "#3A3F45",
  },
  previewAction: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Semibold",
    color: "#00A987",
  },
  searchBox: {
    marginTop: 12,
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#D9DCE1",
    borderRadius: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  toLabel: {
    fontSize: rf(13),
    fontFamily: "SF_Pro_Regular",
    color: "#3A3F45",
  },
  searchInput: {
    flex: 1,
    paddingVertical: 8,
    fontSize: rf(13),
    fontFamily: "SF_Pro_Regular",
    color: "#111111",
  },
  list: { marginTop: 8, flexShrink: 1, minHeight: 0 },
  listContent: { paddingBottom: 4 },
  recentSection: { paddingTop: 4, paddingBottom: 2 },
  recentRow: { gap: 12, paddingTop: 8, paddingRight: 8 },
  recentItem: { width: 60, alignItems: "center" },
  recentAvatarWrap: {
    borderWidth: 2,
    borderColor: "transparent",
    borderRadius: 22,
    padding: 1,
  },
  recentAvatarSelected: { borderColor: "#00DEAB" },
  recentCheck: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#00DEAB",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  recentName: {
    marginTop: 5,
    width: "100%",
    textAlign: "center",
    fontSize: rf(10),
    fontFamily: "SF_Pro_Regular",
    color: "#5F646B",
  },
  section: { marginTop: 10 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  sectionTitle: {
    fontSize: rf(10.5),
    letterSpacing: 0.6,
    fontFamily: "SF_Pro_Semibold",
    color: "#8B9097",
  },
  selectAll: { flexDirection: "row", alignItems: "center", gap: 6 },
  selectAllText: {
    fontSize: rf(11),
    fontFamily: "SF_Pro_Semibold",
    color: "#1A1A1A",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  rowInfo: { flex: 1, minWidth: 0 },
  rowName: {
    fontSize: rf(13.5),
    fontFamily: "SF_Pro_Regular",
    color: "#1D1D1D",
  },
  rowSubtitle: {
    marginTop: 1,
    fontSize: rf(10.5),
    fontFamily: "SF_Pro_Regular",
    color: "#A0A4AB",
  },
  empty: { paddingVertical: 24, alignItems: "center" },
  emptyText: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Regular",
    color: "#8B9097",
  },
  inlinePreviewBox: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#E2E5E9",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
  },
  inlinePreviewScroll: { maxHeight: 170 },
  inlinePreviewLine: {
    fontSize: rf(12.5),
    lineHeight: rf(18),
    fontFamily: "SF_Pro_Regular",
    color: "#1D1D1D",
    marginBottom: 3,
  },
  inlinePreviewSender: {
    fontFamily: "SF_Pro_Semibold",
    color: "#00A987",
  },
  noteBox: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#D9DCE1",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 40,
    justifyContent: "center",
  },
  noteInput: {
    minHeight: 26,
    maxHeight: 70,
    paddingVertical: 2,
    fontSize: rf(12.5),
    fontFamily: "SF_Pro_Regular",
    color: "#111111",
  },
  footer: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  footerCount: {
    flex: 1,
    fontSize: rf(11.5),
    fontFamily: "SF_Pro_Regular",
    color: "#8B9097",
  },
  forwardBtn: {
    minWidth: 108,
    height: 38,
    borderRadius: 9,
    backgroundColor: "#0CD5A3",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 14,
  },
  forwardBtnDisabled: { backgroundColor: "#EDEDED" },
  forwardBtnText: {
    fontSize: rf(13),
    fontFamily: "SF_Pro_Semibold",
    color: "#fff",
  },
  forwardBtnTextDisabled: { color: "#A3A3A3" },
});
