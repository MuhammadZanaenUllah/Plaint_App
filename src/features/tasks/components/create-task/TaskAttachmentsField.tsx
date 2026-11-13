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
                <Ionicons name="download-outline" size={12} color="#0DDFAB" />
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
    gap: 8,
    marginTop: 6,
    marginBottom: 10,
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
    gap: 4,
    backgroundColor: "#1D1D1D",
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginRight: 6,
    maxWidth: 200,
  },
  tagText: {
    flex: 1,
    fontSize: rf(11.5),
    color: "#0DDFAB",
    fontFamily: "SF_Pro_Regular",
  },
  tagClose: {
    marginLeft: 3,
  },
  tagCloseText: {
    fontSize: rf(11),
    color: "#0DDFAB",
    fontFamily: "SF_Pro_Regular",
    lineHeight: 14,
  },
});
