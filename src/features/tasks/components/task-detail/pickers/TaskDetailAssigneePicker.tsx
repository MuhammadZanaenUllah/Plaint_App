// Assignee picker overlay for the task-detail sheet (AUD-081 phase 4).

import { filterAndCapDetailAssignees } from "@/features/tasks/utils/taskOwnerFilter";
import type { TaskOwner } from "@/types/task.types";
import { Ionicons } from "@expo/vector-icons";
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { taskDetailPickerStyles as styles } from "../taskDetailPickerStyles";

type Props = {
  visible: boolean;
  onClose: () => void;
  owners: TaskOwner[];
  search: string;
  onChangeSearch: (value: string) => void;
  selectedId: number | null;
  onSelect: (user: TaskOwner) => void;
};

export function TaskDetailAssigneePicker({
  visible,
  onClose,
  owners,
  search,
  onChangeSearch,
  selectedId,
  onSelect,
}: Props) {
  if (!visible) return null;

  return (
    <Pressable style={styles.popoverOverlay} onPress={onClose}>
      <Pressable style={styles.popoverCard} onPress={(e) => e.stopPropagation()}>
        <View style={styles.popoverHeader}>
          <Text style={styles.popoverTitle}>Select Assignee</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={20} color="#1D1D1D" />
          </TouchableOpacity>
        </View>
        <View style={styles.popoverSearchWrap}>
          <Ionicons name="search-outline" size={16} color="#9CA3AF" />
          <TextInput
            style={styles.popoverSearchInput}
            value={search}
            onChangeText={onChangeSearch}
            placeholder="Search people..."
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <ScrollView
          style={{ maxHeight: 260 }}
          keyboardShouldPersistTaps="handled"
        >
          {filterAndCapDetailAssignees(owners, search).map((user) => {
            const isSelected = selectedId === user.id;
            return (
              <TouchableOpacity
                key={user.id}
                style={[
                  styles.popoverRow,
                  isSelected && styles.popoverRowSelected,
                ]}
                onPress={() => onSelect(user)}
              >
                <Text
                  style={[
                    styles.popoverRowText,
                    isSelected && {
                      fontFamily: "SF_Pro_Semibold",
                      color: "#00DEAB",
                    },
                  ]}
                >
                  {`${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() ||
                    user.full_name ||
                    `User ${user.id}`}
                </Text>
                {isSelected && (
                  <Ionicons name="checkmark" size={16} color="#00DEAB" />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </Pressable>
    </Pressable>
  );
}
