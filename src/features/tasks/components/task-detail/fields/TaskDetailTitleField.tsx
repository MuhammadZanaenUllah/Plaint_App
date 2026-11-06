// Editable title field for the task-detail sheet (AUD-081 phase 3).

import { taskDetailFieldStyles as styles } from "../taskDetailFieldStyles";
import { TextInput } from "react-native";

type Props = {
  value: string;
  editable: boolean;
  onChange: (value: string) => void;
  onBlur: () => void;
};

export function TaskDetailTitleField({
  value,
  editable,
  onChange,
  onBlur,
}: Props) {
  return (
    <TextInput
      allowFontScaling={false}
      style={styles.editableTaskTitle}
      value={value}
      editable={editable}
      onChangeText={onChange}
      onBlur={onBlur}
      scrollEnabled={false}
      placeholder="Enter task title..."
      placeholderTextColor="#9CA3AF"
      multiline
    />
  );
}
