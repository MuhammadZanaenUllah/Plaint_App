// Attachments section for the task-detail sheet (AUD-081 phase 3).

import DocumentPickerButton from "@/features/attachments/components/DocumentPickerButton";
import type { SelectedFile } from "@/features/attachments/types/attachment.types";
import type { TaskAttachment } from "@/features/tasks/types/task.types";
import {
  attachmentDisplayName,
  normalizeAttachmentName,
} from "@/features/tasks/utils/taskAttachmentPath";
import { taskDetailFieldStyles as styles } from "../taskDetailFieldStyles";
import { Ionicons } from "@expo/vector-icons";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

type Props = {
  attachmentFiles: string[];
  attachmentItems: TaskAttachment[];
  taskVisible: TaskAttachment[];
  taskHiddenCount: number;
  fileVisible: string[];
  fileHiddenCount: number;
  showAllAttachments: boolean;
  canManageAttachments: boolean;
  uploadingAttachment: boolean;
  onPick: (files: SelectedFile[]) => void;
  onOpenAttachment: (path: string, name?: string) => void;
  onDeleteAttachment: (attachmentId: number) => void;
  onShowAll: () => void;
  onShowLess: () => void;
};

export function TaskDetailAttachmentsSection({
  attachmentFiles,
  attachmentItems,
  taskVisible,
  taskHiddenCount,
  fileVisible,
  fileHiddenCount,
  showAllAttachments,
  canManageAttachments,
  uploadingAttachment,
  onPick,
  onOpenAttachment,
  onDeleteAttachment,
  onShowAll,
  onShowLess,
}: Props) {
  const hiddenCount =
    attachmentItems.length > 0 ? taskHiddenCount : fileHiddenCount;

  return (
    <>
      <View style={styles.bottomAttachmentSection}>
        <Text style={styles.sectionTitle}>Attachments</Text>
        {canManageAttachments && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <DocumentPickerButton onPick={onPick} />
            <Text style={styles.bottomAttachmentText}>
              {uploadingAttachment ? "Uploading..." : "Add attachment"}
            </Text>
          </View>
        )}
      </View>

      {attachmentFiles.length > 0 && (
        <View style={styles.section}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            nestedScrollEnabled
          >
            {attachmentItems.length > 0
              ? taskVisible.map((item) => (
                  <View key={item.id} style={styles.attachTag}>
                    <TouchableOpacity
                      onPress={() =>
                        onOpenAttachment(
                          item.attachment,
                          attachmentDisplayName(
                            item.original_name,
                            item.attachment,
                          ),
                        )
                      }
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Ionicons
                        name="download-outline"
                        size={13}
                        color="#00DEAB"
                      />
                      <Text style={styles.attachTagText} numberOfLines={1}>
                        {attachmentDisplayName(
                          item.original_name,
                          item.attachment,
                        )}
                      </Text>
                    </TouchableOpacity>
                    {canManageAttachments && (
                      <TouchableOpacity
                        onPress={() => onDeleteAttachment(item.id)}
                        hitSlop={8}
                        style={{ marginLeft: 6 }}
                      >
                        <Ionicons name="close" size={12} color="#EF4444" />
                      </TouchableOpacity>
                    )}
                  </View>
                ))
              : fileVisible.map((attachment, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.attachTag}
                    onPress={() => onOpenAttachment(attachment)}
                  >
                    <Ionicons
                      name="download-outline"
                      size={13}
                      color="#00DEAB"
                    />
                    <Text style={styles.attachTagText}>
                      {normalizeAttachmentName(attachment)}
                    </Text>
                  </TouchableOpacity>
                ))}
            {hiddenCount > 0 ? (
              <TouchableOpacity style={styles.attachTag} onPress={onShowAll}>
                <Text style={styles.attachTagText}>+{hiddenCount} more</Text>
              </TouchableOpacity>
            ) : showAllAttachments && attachmentFiles.length > 3 ? (
              <TouchableOpacity style={styles.attachTag} onPress={onShowLess}>
                <Text style={styles.attachTagText}>Show less</Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        </View>
      )}
    </>
  );
}
