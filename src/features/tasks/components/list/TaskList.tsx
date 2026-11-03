import React from "react";
import type { StyleProp, ViewStyle } from "react-native";
import TaskTable from "@/components/TaskTable";
import type { AssignableOwner } from "@/components/SingleTaskTable";
import type { StatusType, TaskRowProps } from "@/components/TaskRow";
import TaskListSection from "../dashboard/TaskListSection";

type Props = {
  sectionTitle: string;
  tasks: TaskRowProps[];
  loading: boolean;
  error: string | null;
  hasTasks: boolean;
  stale: boolean;
  activeFilterCount: number;
  hasMore: boolean;
  loadingMore: boolean;
  refreshing: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  assignableOwners: AssignableOwner[];
  canReassign: boolean;
  onRetry: () => void;
  onRefresh: () => void;
  onLoadMore: () => void;
  onFilterPress: () => void;
  onTaskPress: (task: TaskRowProps) => void;
  onCommentPress: (task: TaskRowProps) => void;
  onStatusChange: (task: TaskRowProps, status: StatusType) => void;
  onAssigneeChange: (task: TaskRowProps, owner: AssignableOwner) => void;
  onScrollOffsetChange: (offsetY: number) => void;
};

export default function TaskList({
  sectionTitle,
  tasks,
  loading,
  error,
  hasTasks,
  stale,
  activeFilterCount,
  hasMore,
  loadingMore,
  refreshing,
  containerStyle,
  assignableOwners,
  canReassign,
  onRetry,
  onRefresh,
  onLoadMore,
  onFilterPress,
  onTaskPress,
  onCommentPress,
  onStatusChange,
  onAssigneeChange,
  onScrollOffsetChange,
}: Props) {
  return (
    <TaskListSection
      loading={loading}
      error={error}
      hasTasks={hasTasks}
      stale={stale}
      sectionTitle={sectionTitle}
      onRetry={onRetry}
      containerStyle={containerStyle}
    >
      <TaskTable
        sectionTitle={sectionTitle}
        tasks={tasks}
        onTaskPress={onTaskPress}
        onCommentPress={onCommentPress}
        onStatusChange={onStatusChange}
        onFilterPress={onFilterPress}
        loading={loading}
        activeFilterCount={activeFilterCount}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={onLoadMore}
        onRefresh={onRefresh}
        refreshing={refreshing}
        onScrollOffsetChange={onScrollOffsetChange}
        canReassign={canReassign}
        assignableOwners={assignableOwners}
        onAssigneeChange={onAssigneeChange}
        virtualized
      />
    </TaskListSection>
  );
}
