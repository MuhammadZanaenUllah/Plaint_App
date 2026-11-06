// Comments tab shell for the task-detail sheet (AUD-081 phase 5).
// Parent still owns note/mention state and all API actions.

import type { MentionUser, TaskNote } from "@/types/task.types";
import { mentionMarkupToDisplay } from "@/utils/chatHelpers";
import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import type { RefObject } from "react";
import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { CommentBubble, PinnedCommentCard } from "./TaskDetailComments";
import { taskDetailCommentsTabStyles as styles } from "./taskDetailCommentsTabStyles";

type Props = {
  visible: boolean;
  keyboardPad: number;
  pinnedNotes: TaskNote[];
  notes: TaskNote[];
  notesLoading: boolean;
  currentUserId: number;
  canComment: boolean;
  canEditDeleteComments: boolean;
  canPinOrReactToComments: boolean;
  mentionActive: boolean;
  mentionCandidates: MentionUser[];
  replyToNote: TaskNote | null;
  commentText: string;
  isFocused: boolean;
  sendingNote: boolean;
  commentBoxRef: RefObject<View | null>;
  onUnpinNote: (note: TaskNote) => void;
  onOpenAttachment: (path: string, name?: string) => void;
  onDeleteNote: (note: TaskNote) => void;
  onReactionToggle: (emoji: string, noteId: number) => void;
  onEditNote: (note: TaskNote) => void;
  onReply: (note: TaskNote) => void;
  onSelectMention: (user: MentionUser) => void;
  onChangeComment: (text: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onSubmitKey: () => void;
  onSend: () => void;
  onMentionButtonPress: () => void;
  onClearReply: () => void;
};

export function TaskDetailCommentsTab({
  visible,
  keyboardPad,
  pinnedNotes,
  notes,
  notesLoading,
  currentUserId,
  canComment,
  canEditDeleteComments,
  canPinOrReactToComments,
  mentionActive,
  mentionCandidates,
  replyToNote,
  commentText,
  isFocused,
  sendingNote,
  commentBoxRef,
  onUnpinNote,
  onOpenAttachment,
  onDeleteNote,
  onReactionToggle,
  onEditNote,
  onReply,
  onSelectMention,
  onChangeComment,
  onFocus,
  onBlur,
  onSubmitKey,
  onSend,
  onMentionButtonPress,
  onClearReply,
}: Props) {
  if (!visible) return null;

  return (
    <View
      style={[
        styles.commentsContainer,
        styles.tabComment,
        keyboardPad > 0 && { paddingBottom: keyboardPad },
      ]}
    >
      {pinnedNotes.length > 0 && (
        <PinnedCommentCard
          comment={pinnedNotes[0]}
          onUnpin={onUnpinNote}
          onOpenAttachment={onOpenAttachment}
        />
      )}

      <BottomSheetScrollView
        style={styles.commentsList}
        contentContainerStyle={styles.commentsListContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        bounces={true}
        overScrollMode="always"
      >
        {notesLoading ? (
          <ActivityIndicator
            size="small"
            color="#00DEAB"
            style={{ marginTop: 20 }}
          />
        ) : notes.length === 0 ? (
          <View style={styles.emptyComments}>
            <Text style={styles.emptyCommentsText}>No Comments</Text>
          </View>
        ) : (
          notes.map((comment, index) => (
            <CommentBubble
              key={comment.id ?? index}
              comment={comment}
              currentUserId={currentUserId}
              onPin={onUnpinNote}
              onDelete={onDeleteNote}
              onReactionToggle={onReactionToggle}
              onEdit={onEditNote}
              onReply={onReply}
              canEditOwn={canEditDeleteComments}
              canDeleteOwn={canEditDeleteComments}
              canPinReact={canPinOrReactToComments}
              index={index}
              onOpenAttachment={onOpenAttachment}
            />
          ))
        )}
      </BottomSheetScrollView>

      {mentionActive && mentionCandidates.length > 0 && (
        <View style={styles.mentionSuggestions}>
          {mentionCandidates.map((user) => (
            <TouchableOpacity
              key={user.id}
              style={styles.mentionSuggestionItem}
              activeOpacity={0.6}
              onPress={() => onSelectMention(user)}
            >
              <View style={styles.mentionAvatar}>
                <Text style={styles.mentionAvatarText}>
                  {`${user.first_name?.[0] ?? ""}${user.last_name?.[0] ?? ""}`.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.mentionName} numberOfLines={1}>
                {`${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() ||
                  user.full_name ||
                  `User ${user.id}`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {replyToNote && (
        <View style={styles.replyBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.replyBannerName}>
              Replying to {replyToNote.user_name}
            </Text>
            <Text style={styles.replyBannerText} numberOfLines={1}>
              {mentionMarkupToDisplay(replyToNote.notes ?? "")}
            </Text>
          </View>
          <TouchableOpacity onPress={onClearReply} hitSlop={8}>
            <Ionicons name="close" size={16} color="#6B7280" />
          </TouchableOpacity>
        </View>
      )}

      <View
        ref={commentBoxRef}
        style={[
          styles.inputBox,
          {
            borderColor: isFocused ? "#1D1D1D" : "#E5E7EB",
          },
        ]}
      >
        {(isFocused || commentText.length > 0) && (
          <View style={styles.inputLabelWrap}>
            <Text style={styles.inputLabelText}>Comment</Text>
          </View>
        )}
        <BottomSheetTextInput
          style={styles.inputField}
          value={commentText}
          editable={canComment}
          onChangeText={onChangeComment}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyPress={(event) => {
            const native = event.nativeEvent as typeof event.nativeEvent & {
              shiftKey?: boolean;
            };
            if (native.key === "Enter" && !native.shiftKey) {
              (event as unknown as { preventDefault?: () => void })
                .preventDefault?.();
              onSubmitKey();
            }
          }}
          multiline
          placeholder={
            !isFocused && commentText.length === 0 ? "Comment" : ""
          }
          placeholderTextColor="#9CA3AF"
          textAlignVertical="top"
        />
        <View style={styles.inputToolbar}>
          <View style={styles.toolbarLeft}>
            <TouchableOpacity
              style={styles.toolBtn}
              onPress={onMentionButtonPress}
            >
              <Ionicons name="at" size={16} color="#374151" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.sendBtn, sendingNote && { opacity: 0.5 }]}
            onPress={onSend}
            disabled={sendingNote || !commentText.trim() || !canComment}
          >
            {sendingNote ? (
              <ActivityIndicator size={12} color="#fff" />
            ) : (
              <Ionicons name="send" size={14} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
