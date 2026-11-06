// Attachments field for the create-task screen (AUD-081). Presentation and
// behaviour are unchanged from the inline block in CreateTaskModal.

import DocumentPickerButton from "@/features/attachments/components/DocumentPickerButton";
import type { SelectedFile } from "@/features/attachments/types/attachment.types";
import { rf } from "@/utils/responsive";
import { Ionicons } from "@expo/vector-icons";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

type Props = {
  attachments: SelectedFile[];
  onPick: (files: SelectedFile[]) => void;
  onRemove: (index: number) => void;
  onDownload: (file: SelectedFile) => void;
};

export function TaskAttachmentsField({
  attachments,
  onPick,
  onRemove,
  onDownload,
}: Props) {
  return (
    <View style={styles.attachInlineRow}>
      <DocumentPickerButton onPick={onPick} />
      {attachments.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.tagsScroll, { overflow: "visible" }]}
          contentContainerStyle={styles.tagsScrollContent}
          decelerationRate="fast"
          bounces
          overScrollMode="never"
          nestedScrollEnabled
        >
          {attachments.map((file, i) => (
            <View key={`${file.name}-${i}`} style={styles.tag}>
              <TouchableOpacity
                onPress={() => onDownload(file)}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Ionicons name="download-outline" size={14} color="#0DDFAB" />
              </TouchableOpacity>
              <Text style={styles.tagText} numberOfLines={1}>
                {file.name}
              </Text>
              <TouchableOpacity
                onPress={() => onRemove(i)}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                style={styles.tagClose}
              >
                <Text style={styles.tagCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  attachInlineRow: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 10,
    marginTop: 8,
    marginBottom: 12,
  },
  tagsScroll: { flexGrow: 0, marginBottom: 8, overflow: "visible" },
  tagsScrollContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 8,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#1D1D1D",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginRight: 8,
    maxWidth: 220,
  },
  tagText: {
    flex: 1,
    fontSize: rf(12.5),
    color: "#0DDFAB",
    fontFamily: "SF_Pro_Regular",
  },
  tagClose: {
    marginLeft: 4,
  },
  tagCloseText: {
    fontSize: rf(13),
    color: "#0DDFAB",
    fontFamily: "SF_Pro_Regular",
    lineHeight: 16,
  },
});
