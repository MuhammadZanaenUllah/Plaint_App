// Comment/pinned-note presentation extracted from TaskDetailModal (AUD-081).
// Behaviour and styling are unchanged.

import Avatar from "@/components/Avatar";
import type { TaskNote } from "@/types/task.types";
import { mentionMarkupToDisplay } from "@/utils/chatHelpers";
import { rf } from "@/utils/responsive";
import { attachmentDisplayName } from "@/features/tasks/utils/taskAttachmentPath";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { formatApiDateTime } from "./taskDetailFormatters";

export const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"] as const;

export function PinnedCommentCard({
  comment,
  onUnpin,
  onOpenAttachment,
}: {
  comment: TaskNote;
  onUnpin: (note: TaskNote) => void;
  onOpenAttachment?: (path: string, name?: string) => void;
}) {
  const rawDate =
    comment.created_at ||
    (comment as any).createdAt ||
    (comment as any).created_date ||
    (comment as any).date ||
    (comment as any).created;

  return (
    <View style={styles.pinnedCard}>
      <View style={styles.bubbleHeader}>
        <Avatar
          name={comment.user_name}
          imagePath={comment.user_image}
          size={20}
          borderRadius={5}
          fontSize={9}
        />
        <View style={styles.bubbleNameRow}>
          <Text style={styles.bubbleName}>{comment.user_name}</Text>
          <Text style={styles.bubbleTime}>{formatApiDateTime(rawDate)}</Text>
        </View>
        <TouchableOpacity
          onPress={() => onUnpin(comment)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialCommunityIcons
            name="pin"
            size={18}
            color="#00DEAB"
            style={styles.pinIcon}
          />
        </TouchableOpacity>
      </View>

      <Text style={styles.bubbleText}>
        {mentionMarkupToDisplay(comment.notes)}
      </Text>
      {comment.attachment_file ? (
        <TouchableOpacity
          style={styles.noteAttachmentChip}
          onPress={() =>
            onOpenAttachment?.(
              comment.attachment_file ?? "",
              attachmentDisplayName(undefined, comment.attachment_file ?? ""),
            )
          }
        >
          <Ionicons name="attach" size={13} color="#00A876" />
          <Text style={styles.noteAttachmentText} numberOfLines={1}>
            {attachmentDisplayName(undefined, comment.attachment_file)}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function CommentBubble({
  comment,
  currentUserId,
  onPin,
  onDelete,
  onReactionToggle,
  onEdit,
  onReply,
  canEditOwn,
  canDeleteOwn,
  canPinReact,
  index = 0,
  onOpenAttachment,
}: {
  comment: TaskNote;
  currentUserId: number;
  onPin?: (note: TaskNote) => void;
  onDelete?: (note: TaskNote) => void;
  onReactionToggle?: (emoji: string, noteId: number) => void;
  onEdit?: (note: TaskNote) => void;
  onReply?: (note: TaskNote) => void;
  canEditOwn?: boolean;
  canDeleteOwn?: boolean;
  canPinReact?: boolean;
  index?: number;
  onOpenAttachment?: (path: string, name?: string) => void;
}) {
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [openReaction, setOpenReaction] = useState<string | null>(null);
  const isOwn = Number(comment.user_id) === Number(currentUserId);
  const isPinned = comment.pin_top === 1;
  const hasMyReaction = comment.reactions?.some(
    (r) => Number(r.user_id) === Number(currentUserId),
  );
  const reactionGroups = Array.from(
    (comment.reactions ?? []).reduce(
      (groups, reaction) => {
        const existing = groups.get(reaction.emoji);
        const mine = Number(reaction.user_id) === Number(currentUserId);
        if (existing) {
          existing.names.push(reaction.user_name);
          existing.mine = existing.mine || mine;
        } else {
          groups.set(reaction.emoji, {
            emoji: reaction.emoji,
            names: [reaction.user_name],
            mine,
          });
        }
        return groups;
      },
      new Map<string, { emoji: string; names: string[]; mine: boolean }>(),
    ).values(),
  );
  const openReactionGroup = reactionGroups.find(
    (group) => group.emoji === openReaction,
  );

  const rawDate =
    comment.created_at ||
    (comment as any).createdAt ||
    (comment as any).created_date ||
    (comment as any).date ||
    (comment as any).created;

  return (
    <View style={styles.bubble}>
      <View style={styles.bubbleHeader}>
        <Avatar
          name={comment.user_name}
          imagePath={comment.user_image}
          size={18}
          borderRadius={5}
          fontSize={8}
        />
        <Text style={styles.bubbleName}>{comment.user_name}</Text>
        <Text style={styles.bubbleTime}>{formatApiDateTime(rawDate)}</Text>
      </View>

      {comment.reply_to && (
        <View style={styles.commentReplyQuote}>
          <Text style={styles.commentReplyName}>
            {comment.reply_to.user_name || "Reply"}
          </Text>
          <Text style={styles.commentReplyText} numberOfLines={2}>
            {mentionMarkupToDisplay(comment.reply_to.content ?? "")}
          </Text>
        </View>
      )}

      <Text style={styles.bubbleText}>
        {mentionMarkupToDisplay(comment.notes)}
      </Text>

      {comment.attachment_file ? (
        <TouchableOpacity
          style={styles.noteAttachmentChip}
          onPress={() =>
            onOpenAttachment?.(
              comment.attachment_file ?? "",
              attachmentDisplayName(undefined, comment.attachment_file ?? ""),
            )
          }
        >
          <Ionicons name="attach" size={13} color="#00A876" />
          <Text style={styles.noteAttachmentText} numberOfLines={1}>
            {attachmentDisplayName(undefined, comment.attachment_file)}
          </Text>
        </TouchableOpacity>
      ) : null}

      {reactionGroups.length > 0 && (
        <View style={styles.reactionsRow}>
          {reactionGroups.map((group) => (
            <TouchableOpacity
              key={group.emoji}
              style={[
                styles.reactionBadge,
                group.mine && styles.reactionBadgeMine,
              ]}
              onPress={() =>
                setOpenReaction((current) =>
                  current === group.emoji ? null : group.emoji,
                )
              }
            >
              <Text style={styles.reactionText}>{group.emoji}</Text>
              <Text style={styles.reactionCount}>{group.names.length}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {openReactionGroup && (
        <Text style={styles.reactionNamesText}>
          {openReactionGroup.names.join(", ")}
        </Text>
      )}

      {canPinReact && reactionPickerOpen && (
        <View style={styles.reactionPicker}>
          {REACTION_EMOJIS.map((emoji) => {
            const active = comment.reactions?.some(
              (r) =>
                Number(r.user_id) === Number(currentUserId) &&
                r.emoji === emoji,
            );
            return (
              <TouchableOpacity
                key={emoji}
                style={[
                  styles.reactionPickerItem,
                  active && styles.reactionActionActive,
                ]}
                onPress={() => {
                  onReactionToggle?.(emoji, comment.id ?? 0);
                  setReactionPickerOpen(false);
                }}
              >
                <Text style={styles.reactionActionEmoji}>{emoji}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <View style={styles.bubbleActions}>
        {canPinReact && (
          <>
            <TouchableOpacity
              style={[
                styles.actionBtn,
                (hasMyReaction || reactionPickerOpen) &&
                  styles.reactionActionActive,
              ]}
              onPress={() => setReactionPickerOpen((open) => !open)}
            >
              <Ionicons
                name="happy-outline"
                size={14}
                color={hasMyReaction ? "#00A876" : "#9CA3AF"}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => onPin?.(comment)}
            >
              <MaterialCommunityIcons
                name={isPinned ? "pin" : "pin-outline"}
                size={13}
                color={isPinned ? "#00DEAB" : "#9CA3AF"}
              />
            </TouchableOpacity>
          </>
        )}

        {isOwn && canEditOwn && (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => onEdit?.(comment)}
          >
            <Ionicons name="pencil-outline" size={13} color="#9CA3AF" />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => onReply?.(comment)}
        >
          <Ionicons name="arrow-undo-outline" size={13} color="#9CA3AF" />
        </TouchableOpacity>

        {isOwn && canDeleteOwn && (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => onDelete?.(comment)}
          >
            <Ionicons name="trash-outline" size={13} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#FFFFFF",
  },
  pinnedCard: {
    backgroundColor: "#E6FBF6",
    borderColor: "#E6FBF6",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  bubbleHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    gap: 4,
  },
  bubbleNameRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  bubbleName: {
    fontSize: rf(11),
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
    flex: 1,
  },
  bubbleTime: {
    fontSize: rf(8),
    color: "#D1D5DB",
    fontFamily: "SF_Pro_Regular",
    flexShrink: 0,
  },
  pinIcon: { marginLeft: "auto" },
  bubbleText: {
    fontSize: rf(12),
    color: "#1D1D1D",
    lineHeight: 18,
    fontFamily: "SF_Pro_Regular",
  },
  bubbleActions: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    gap: 10,
    marginTop: 6,
  },
  reactionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
    flexWrap: "wrap",
  },
  reactionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  reactionBadgeMine: {
    backgroundColor: "#E6FBF6",
  },
  reactionText: { fontSize: rf(12) },
  reactionCount: {
    fontSize: rf(10),
    color: "#6B7280",
    fontFamily: "SF_Pro_Regular",
  },
  reactionNamesText: {
    marginTop: 4,
    fontSize: rf(9),
    color: "#6B7280",
    fontFamily: "SF_Pro_Regular",
  },
  actionBtn: { padding: 1 },
  reactionPicker: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 6,
    paddingHorizontal: 5,
    paddingVertical: 3,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
  },
  reactionPickerItem: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  reactionActionActive: {
    backgroundColor: "#E6FBF6",
    borderRadius: 6,
  },
  reactionActionEmoji: {
    fontSize: rf(14),
  },
  noteAttachmentChip: {
    marginTop: 6,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "#D1FAE5",
    backgroundColor: "#F0FDF9",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    maxWidth: "100%",
  },
  noteAttachmentText: {
    fontSize: rf(11),
    color: "#047857",
    fontFamily: "SF_Pro_Medium",
    maxWidth: 220,
  },
  commentReplyQuote: {
    backgroundColor: "#F3F4F6",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: "#00DEAB",
  },
  commentReplyName: {
    fontSize: rf(10),
    color: "#00A876",
    fontFamily: "SF_Pro_Semibold",
    marginBottom: 1,
  },
  commentReplyText: {
    fontSize: rf(10.5),
    color: "#6B7280",
    fontFamily: "SF_Pro_Regular",
  },
});
