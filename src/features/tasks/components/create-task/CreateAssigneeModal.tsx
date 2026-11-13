// Assign-task overlay for the create-task sheet (AUD-081 phase 2).
// Controlled by CreateTaskModal; all state remains in the parent.

import type { TaskOwner } from "@/types/task.types";
import { Ionicons } from "@expo/vector-icons";
import ModalCloseButton from "@/components/ModalCloseButton";
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { createTaskModalStyles as styles } from "./createTaskModalStyles";

type Props = {
  visible: boolean;
  onClose: () => void;
  assignSearch: string;
  assignFocused: boolean;
  onChangeAssignSearch: (value: string) => void;
  onAssignFocus: () => void;
  onAssignBlur: () => void;
  filteredUsers: TaskOwner[];
  assignedUserId: number | null;
  onSelectAssignee: (user: TaskOwner) => void;
  onDone: () => void;
};

export function CreateAssigneeModal({
  visible,
  onClose,
  assignSearch,
  assignFocused,
  onChangeAssignSearch,
  onAssignFocus,
  onAssignBlur,
  filteredUsers,
  assignedUserId,
  onSelectAssignee,
  onDone,
}: Props) {
  if (!visible) return null;

  return (
    <Pressable
      style={[styles.centerModalOverlay, styles.absoluteCenterOverlay]}
      onPress={onClose}
    >
      <Pressable style={styles.centerModalCard} onPress={() => {}}>
        <View style={styles.centerModalHeader}>
          <Text style={styles.centerModalTitle}>Assign Task</Text>
          <ModalCloseButton onPress={onClose} />
        </View>

        <View
          style={[
            styles.depSearchWrap,
            assignFocused && styles.searchWrapActive,
            { marginBottom: 12 },
          ]}
        >
          <Ionicons
            name="search-outline"
            size={16}
            color={
              assignFocused || assignSearch.length > 0 ? "#1D1D1D" : "#AAAAAA"
            }
            style={styles.depSearchIcon}
          />
          <TextInput
            style={styles.depSearchInput}
            value={assignSearch}
            onChangeText={onChangeAssignSearch}
            onFocus={onAssignFocus}
            onBlur={onAssignBlur}
            placeholder="Search people..."
            placeholderTextColor="#AAAAAA"
          />
        </View>

        {filteredUsers.length === 0 ? (
          <View style={styles.depEmpty}>
            <Text style={styles.depEmptyText}>No people found</Text>
          </View>
        ) : (
          <ScrollView
            style={{ maxHeight: 220 }}
            showsVerticalScrollIndicator={false}
          >
            {filteredUsers.map((user, index) => {
              const fullName = `${user.first_name} ${user.last_name}`;
              const isSelected = assignedUserId === user.id;
              const initials = (
                (user.first_name?.[0] ?? "") + (user.last_name?.[0] ?? "")
              ).toUpperCase();
              const isLast = index === filteredUsers.length - 1;

              return (
                <TouchableOpacity
                  key={user.id}
                  style={[
                    styles.depTaskRow,
                    isLast && { borderBottomWidth: 0 },
                    isSelected && styles.depTaskRowSelected,
                  ]}
                  onPress={() => onSelectAssignee(user)}
                >
                  <View style={styles.depTaskAvatar}>
                    <Text style={styles.depTaskAvatarText}>{initials}</Text>
                  </View>
                  <Text style={styles.depTaskTitle} numberOfLines={1}>
                    {fullName}
                  </Text>
                  {isSelected && (
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color="#0DDFAB"
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        <TouchableOpacity style={styles.doneBtn} onPress={onDone}>
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </Pressable>
    </Pressable>
  );
}
