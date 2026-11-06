// Description editor section for the task-detail sheet (AUD-081 phase 3).

import RichTextEditor, { type RichTextEditorRef } from "@/components/texteditor";
import { taskDetailFieldStyles as styles } from "../taskDetailFieldStyles";
import { Ionicons } from "@expo/vector-icons";
import type { RefObject } from "react";
import { Text, View } from "react-native";

type Props = {
  attachmentCount: number;
  description: string;
  canEdit: boolean;
  editorKey: string;
  editorRef: RefObject<RichTextEditorRef | null>;
  onChange: (value: string) => void;
  onBlur: () => void;
};

export function TaskDetailDescriptionSection({
  attachmentCount,
  description,
  canEdit,
  editorKey,
  editorRef,
  onChange,
  onBlur,
}: Props) {
  return (
    <View style={styles.section}>
      <View style={styles.descHeaderRow}>
        <Text style={styles.sectionTitle}>Description</Text>
      </View>
      <View style={styles.descBadgeChip}>
        <Ionicons name="link-outline" size={12} color="#fff" />
        <Text style={styles.descBadgeChipText}>+{attachmentCount}</Text>
      </View>
      <RichTextEditor
        key={editorKey}
        ref={editorRef}
        initialHTML={description}
        onChangeHTML={onChange}
        onBlur={onBlur}
        disabled={!canEdit}
        showToolbar={canEdit}
        editorHeight={140}
        borderless
      />
    </View>
  );
}
