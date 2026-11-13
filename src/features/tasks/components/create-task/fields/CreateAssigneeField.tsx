// Assignee chip + expanded panel for the create-task sheet (AUD-081 phase 1).

import FloatingInput from "@/components/FloatingInput";
import type { TaskOwner } from "@/types/task.types";
import { Ionicons } from "@expo/vector-icons";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { createTaskFieldStyles as styles } from "../createTaskFieldStyles";

export function CreateAssigneeChip({
  active,
  effectiveAssigneeName,
  onPress,
}: {
  active: boolean;
  effectiveAssigneeName: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.designChip, (active || !!effectiveAssigneeName) && styles.designChipDark]}
      onPress={onPress}
    >
      <Ionicons
        name="people"
        size={14}
        color={active || !!effectiveAssigneeName ? "#FFF" : "#6B7280"}
      />
      <Text
        allowFontScaling={false}
        style={[
          styles.designChipText,
          (active || !!effectiveAssigneeName) && styles.designChipTextWhite,
        ]}
      >
        {effectiveAssigneeName ? effectiveAssigneeName : "Assigned to"}
      </Text>
    </TouchableOpacity>
  );
}

export function CreateAssigneePanel({
  assignSearch,
  onChangeAssignSearch,
  filteredUsers,
  assignedUserId,
  onSelectAssignee,
}: {
  assignSearch: string;
  onChangeAssignSearch: (value: string) => void;
  filteredUsers: TaskOwner[];
  assignedUserId: number | null;
  onSelectAssignee: (user: TaskOwner) => void;
}) {
  return (
    <View style={styles.assignedPanelWrap}>
      <FloatingInput
        label="Search people"
        value={assignSearch}
        onChangeText={onChangeAssignSearch}
        autoCapitalize="none"
        rightIcon="search-outline"
      />
      <ScrollView
        style={{ maxHeight: 180, marginTop: 8 }}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        {filteredUsers.length === 0 ? (
          <Text style={styles.peopleName}>No members found</Text>
        ) : (
          filteredUsers.map((user) => {
            const isSelected = assignedUserId === user.id;
            const fullName = `${user.first_name} ${user.last_name}`;
            const initial = (user.first_name?.[0] || "U").toUpperCase();
            return (
              <TouchableOpacity
                key={user.id}
                style={[
                  styles.peopleRow,
                  isSelected && styles.peopleRowSelected,
                ]}
                onPress={() => onSelectAssignee(user)}
              >
                <View style={styles.peopleAvatar}>
                  <Text
                    allowFontScaling={false}
                    style={styles.peopleAvatarText}
                  >
                    {initial}
                  </Text>
                </View>
                <Text allowFontScaling={false} style={styles.peopleName}>
                  {fullName}
                </Text>
                {isSelected && (
                  <Ionicons
                    name="checkmark"
                    size={16}
                    color="#00DFAB"
                    style={{ marginLeft: "auto" }}
                  />
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
