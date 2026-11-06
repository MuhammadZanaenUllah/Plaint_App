// Comment/pinned-note presentation extracted from TaskDetailModal (AUD-081).
// Behaviour and styling are unchanged.

import Avatar from "@/components/Avatar";
import type { TaskNote } from "@/types/task.types";
import { mentionMarkupToDisplay } from "@/utils/chatHelpers";
import { rf } from "@/utils/responsive";
import { attachmentDisplayName } from "@/features/tasks/utils/taskAttachmentPath";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
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
  const isOwn = comment.user_id === currentUserId;
  const isPinned = comment.pin_top === 1;

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
          size={20}
          borderRadius={5}
          fontSize={9}
        />
        <View style={styles.bubbleNameRow}>
          <Text style={styles.bubbleName}>{comment.user_name}</Text>
          <Text style={styles.bubbleTime}>{formatApiDateTime(rawDate)}</Text>
        </View>
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

      {comment.reactions && comment.reactions.length > 0 && (
        <View style={styles.reactionsRow}>
          {comment.reactions.map((r, i) => (
            <View key={i} style={styles.reactionBadge}>
              <Text style={styles.reactionText}>{r.emoji}</Text>
              <Text style={styles.reactionCount}>
                {r.user_name.split(" ")[0]}
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.bubbleActions}>
        {canPinReact && (
          <>
            {REACTION_EMOJIS.map((emoji) => {
              const active = comment.reactions?.some(
                (r) => r.user_id === currentUserId && r.emoji === emoji,
              );
              return (
                <TouchableOpacity
                  key={emoji}
                  style={[
                    styles.actionBtn,
                    active && styles.reactionActionActive,
                  ]}
                  onPress={() => onReactionToggle?.(emoji, comment.id ?? 0)}
                >
                  <Text style={styles.reactionActionEmoji}>{emoji}</Text>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => onPin?.(comment)}
            >
              <MaterialCommunityIcons
                name={isPinned ? "pin" : "pin-outline"}
                size={15}
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
            <Ionicons name="pencil-outline" size={15} color="#9CA3AF" />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => onReply?.(comment)}
        >
          <Ionicons name="arrow-undo-outline" size={15} color="#9CA3AF" />
        </TouchableOpacity>

        {isOwn && canDeleteOwn && (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => onDelete?.(comment)}
          >
            <Ionicons name="trash-outline" size={15} color="#9CA3AF" />
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
    borderRadius: 12,
    padding: 12,
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
    marginBottom: 8,
    gap: 5,
  },
  bubbleNameRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  bubbleName: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
  },
  bubbleTime: {
    fontSize: rf(9),
    color: "#D1D5DB",
    fontFamily: "SF_Pro_Regular",
  },
  pinIcon: { marginLeft: "auto" },
  bubbleText: {
    fontSize: rf(13),
    color: "#1D1D1D",
    lineHeight: 20,
    fontFamily: "SF_Pro_Regular",
  },
  bubbleActions: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    gap: 12,
  },
  reactionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    flexWrap: "wrap",
  },
  reactionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  reactionText: { fontSize: rf(12) },
  reactionCount: {
    fontSize: rf(10),
    color: "#6B7280",
    fontFamily: "SF_Pro_Regular",
  },
  actionBtn: { padding: 2 },
  reactionActionActive: {
    backgroundColor: "#E6FBF6",
    borderRadius: 6,
  },
  reactionActionEmoji: {
    fontSize: rf(14),
  },
  noteAttachmentChip: {
    marginTop: 8,
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
