import Avatar from "@/components/Avatar";
import type { AssignableOwner } from "@/components/SingleTaskTable";
import { Ionicons } from "@expo/vector-icons";
import { memo, useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { rf } from "@/utils/responsive";

type Props = {
  currentAssigneeName: string;
  owners: AssignableOwner[];
  onSelect: (owner: AssignableOwner) => void;
};

export function getOwnerDisplayName(owner: AssignableOwner): string {
  const fullName = owner.full_name?.trim();
  return fullName ?? `${owner.first_name ?? ""} ${owner.last_name ?? ""}`.trim();
}

const TaskAssigneeDropdown = memo(function TaskAssigneeDropdown({
  currentAssigneeName,
  owners,
  onSelect,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredOwners = useMemo(() => {
    if (!searchQuery.trim()) return owners;
    const query = searchQuery.toLowerCase().trim();
    return owners.filter((owner) =>
      getOwnerDisplayName(owner).toLowerCase().includes(query),
    );
  }, [owners, searchQuery]);

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={12} color="#9CA3AF" />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search..."
          placeholderTextColor="#9CA3AF"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <Ionicons name="close-circle" size={12} color="#9CA3AF" />
          </TouchableOpacity>
        ) : null}
      </View>
      <ScrollView
        style={styles.scroll}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {filteredOwners.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No user found</Text>
          </View>
        ) : (
          filteredOwners.map((owner) => {
            const name = getOwnerDisplayName(owner);
            const isActive = name.split(/\s+/)[0] === currentAssigneeName;
            return (
              <TouchableOpacity
                key={owner.id}
                style={[styles.item, isActive && styles.activeItem]}
                onPress={() => onSelect(owner)}
                activeOpacity={0.8}
              >
                <Avatar
                  name={name}
                  imagePath={owner.image}
                  size={20}
                  borderRadius={5}
                  fontSize={9}
                />
                <Text style={styles.ownerName} numberOfLines={1}>
                  {name}
                </Text>
                {isActive ? (
                  <Ionicons name="checkmark" size={12} color="#0DDFAB" />
                ) : null}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
});

export default TaskAssigneeDropdown;

const styles = StyleSheet.create({
  container: {
    paddingBottom: 2,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 6,
    marginHorizontal: 6,
    marginTop: 6,
    marginBottom: 4,
    paddingHorizontal: 6,
    height: 26,
    gap: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: rf(11),
    fontFamily: "SF_Pro_Regular",
    color: "#1D1D1D",
    padding: 0,
    height: 26,
  },
  empty: {
    paddingVertical: 10,
    alignItems: "center",
  },
  emptyText: {
    fontSize: rf(11),
    color: "#9CA3AF",
    fontFamily: "SF_Pro_Regular",
  },
  scroll: {
    maxHeight: 180,
  },
  item: {
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F9FAFB",
  },
  activeItem: {
    backgroundColor: "#F0FDF9",
  },
  ownerName: {
    flex: 1,
    marginLeft: 8,
    fontSize: rf(11),
    fontFamily: "SF_Pro_Regular",
    color: "#1F2937",
  },
});
