// Data cells for a task row. Extracted from SingleTaskTable with no behaviour
// change (AUD-080).

import Avatar from "@/components/Avatar";
import { STATUS_COLORS, TaskRowProps } from "@/components/TaskRow";
import { triggerHaptic } from "@/utils/haptics";
import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import type { SingleTaskTableColumn } from "./taskTableLayout";
import { taskTableStyles as styles } from "./taskTableStyles";

export const TaskCellContent = memo(function TaskCellContent({
  item,
  columnKey,
  width,
  onPress,
  onSprintPress,
  onRemove,
}: {
  item: TaskRowProps;
  columnKey: SingleTaskTableColumn;
  width: number;
  onPress?: () => void;
  onSprintPress?: () => void;
  onRemove?: () => void;
}) {
  const isCompleted = item.status === "Completed";

  if (columnKey === "title") {
    return (
      <TouchableOpacity
        style={[styles.titleCell, { width }]}
        onPress={() => {
          triggerHaptic("light");
          onPress?.();
        }}
        activeOpacity={0.7}
      >
        <Text
          style={[styles.titleText, isCompleted && styles.strikethrough]}
          numberOfLines={1}
        >
          {item.title}
        </Text>
      </TouchableOpacity>
    );
  }

  if (columnKey === "createdBy") {
    return (
      <TouchableOpacity
        style={[styles.userCell, { width }]}
        onPress={() => {
          triggerHaptic("light");
          onPress?.();
        }}
        activeOpacity={0.7}
      >
        <Avatar
          name={item.createdBy}
          imagePath={item.createdByAvatar}
          size={24}
          borderRadius={6}
          fontSize={10}
          style={styles.avatarImage}
        />
        <Text style={styles.cellText} numberOfLines={1}>
          {item.createdBy}
        </Text>
      </TouchableOpacity>
    );
  }

  if (columnKey === "assignedTo") {
    return (
      <TouchableOpacity
        style={[styles.userCell, { width }]}
        onPress={() => {
          triggerHaptic("light");
          onPress?.();
        }}
        activeOpacity={0.7}
      >
        <Avatar
          name={item.assignedTo}
          imagePath={item.assignedToAvatar}
          size={24}
          borderRadius={6}
          fontSize={10}
          style={styles.avatarImage}
        />
        <Text style={styles.cellText} numberOfLines={1}>
          {item.assignedTo}
        </Text>
      </TouchableOpacity>
    );
  }

  if (columnKey === "dueDate") {
    return (
      <TouchableOpacity
        style={[styles.dateCell, { width }]}
        onPress={() => {
          triggerHaptic("light");
          onPress?.();
        }}
        activeOpacity={0.7}
      >
        <Ionicons
          name="calendar-outline"
          size={16}
          color="#00DEAB"
          style={styles.dateIcon}
        />
        <Text style={styles.cellText} numberOfLines={1}>
          {item.dueDate}
        </Text>
      </TouchableOpacity>
    );
  }

  if (columnKey === "sprint") {
    const label = item.sprint?.trim() || "No Sprint";
    const content = (
      <>
        <Ionicons
          name="flag-outline"
          size={15}
          color={item.sprint ? "#00DEAB" : "#9CA3AF"}
          style={styles.dateIcon}
        />
        <Text
          style={[styles.cellText, !item.sprint && styles.mutedCellText]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {onSprintPress && item.canEditSprint !== false ? (
          <Ionicons name="chevron-down" size={12} color="#6B7280" />
        ) : null}
      </>
    );

    if (!onSprintPress || item.canEditSprint === false) {
      return <View style={[styles.dateCell, { width }]}>{content}</View>;
    }
    return (
      <TouchableOpacity
        style={[styles.dateCell, { width }]}
        onPress={() => {
          triggerHaptic("light");
          onSprintPress();
        }}
        activeOpacity={0.7}
      >
        {content}
      </TouchableOpacity>
    );
  }

  if (columnKey === "project") {
    return (
      <View style={[styles.dateCell, { width }]}>
        <Ionicons
          name="folder-outline"
          size={15}
          color={item.project ? "#00DEAB" : "#9CA3AF"}
          style={styles.dateIcon}
        />
        <Text
          style={[styles.cellText, !item.project && styles.mutedCellText]}
          numberOfLines={1}
        >
          {item.project?.trim() || "—"}
        </Text>
      </View>
    );
  }

  if (columnKey === "remove") {
    return (
      <TouchableOpacity
        style={[styles.removeCell, { width }]}
        onPress={onRemove}
        disabled={!onRemove}
        activeOpacity={0.7}
        accessibilityLabel="Remove dependency"
      >
        <Ionicons name="trash-outline" size={17} color="#DC2626" />
      </TouchableOpacity>
    );
  }

  const statusColor = STATUS_COLORS[item.status] ?? {
    bg: "#F3F4F6",
    text: "#4B5563",
  };
  return (
    <View style={[styles.statusCell, { width }]}>
      <View style={[styles.statusBadge, { backgroundColor: statusColor.bg }]}>
        <Text
          style={[styles.statusText, { color: statusColor.text }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {item.status}
        </Text>
      </View>
    </View>
  );
});
