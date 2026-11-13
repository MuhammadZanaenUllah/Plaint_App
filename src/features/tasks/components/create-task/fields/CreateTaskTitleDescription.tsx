// Title + description fields for the create-task sheet (AUD-081 phase 1).

import RichTextEditor, { type RichTextEditorRef } from "@/components/texteditor";
import { Ionicons } from "@expo/vector-icons";
import type { RefObject } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import { createTaskFieldStyles as styles } from "../createTaskFieldStyles";

type Props = {
  title: string;
  description: string;
  titleFocused: boolean;
  descFocused: boolean;
  onChangeTitle: (value: string) => void;
  onChangeDescription: (value: string) => void;
  onTitleFocus: () => void;
  onTitleBlur: () => void;
  onDescriptionFocus: () => void;
  onDescriptionBlur: () => void;
  descriptionEditorRef: RefObject<RichTextEditorRef | null>;
};

export function CreateTaskTitleDescription({
  title,
  description,
  titleFocused,
  descFocused,
  onChangeTitle,
  onChangeDescription,
  onTitleFocus,
  onTitleBlur,
  onDescriptionFocus,
  onDescriptionBlur,
  descriptionEditorRef,
}: Props) {
  return (
    <>
      <View
        style={[
          styles.borderlessTitleWrap,
          titleFocused && styles.borderlessTitleWrapActive,
        ]}
      >
        {titleFocused && (
          <View style={styles.titleFloatLabelWrap}>
            <Text style={styles.titleFloatLabelText}>Enter a task title</Text>
          </View>
        )}
        <TextInput
          allowFontScaling={false}
          style={styles.borderlessTitleInput}
          value={title}
          onChangeText={onChangeTitle}
          placeholder={titleFocused ? "" : "Enter a task title"}
          placeholderTextColor="#9CA3AF"
          onFocus={onTitleFocus}
          onBlur={onTitleBlur}
          autoFocus={false}
        />
      </View>

      <View style={styles.borderlessDescWrap}>
        <View style={{ flex: 1, position: "relative" }}>
          <RichTextEditor
            ref={descriptionEditorRef}
            label="Description"
            placeholder=""
            initialHTML={description}
            onChangeHTML={onChangeDescription}
            onFocus={onDescriptionFocus}
            onBlur={onDescriptionBlur}
            editorHeight={38}
            containerStyle={styles.descEditor}
            autoFocus={false}
            borderless={false}
          />
          {!descFocused &&
            !description.replace(/<[^>]*>/g, "").trim() && (
              <Pressable
                style={styles.descIdleOverlay}
                onPress={(e) => {
                  e.stopPropagation();
                  descriptionEditorRef.current?.focus();
                  if (Platform.OS === "android") {
                    descriptionEditorRef.current?.showAndroidKeyboard();
                  }
                }}
              >
                <Ionicons
                  name="document-text-outline"
                  size={16}
                  color="#9CA3AF"
                />
                <Text style={styles.descIdlePlaceholder}>Description</Text>
              </Pressable>
            )}
        </View>
      </View>
    </>
  );
}
