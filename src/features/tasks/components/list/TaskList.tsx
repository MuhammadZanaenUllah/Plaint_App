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
  activeFilterCount: number;
  hasMore: boolean;
  loadingMore: boolean;
  paginationError?: boolean;
  refreshing: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  assignableOwners: AssignableOwner[];
  canReassign: boolean;
  onRetry: () => void;
  onRefresh: () => void;
  onLoadMore: () => void;
  onRetryLoadMore?: () => void;
  onFilterPress: () => void;
  onTaskPress: (task: TaskRowProps) => void;
  onCommentPress: (task: TaskRowProps) => void;
  onStatusChange: (task: TaskRowProps, status: StatusType) => void;
  onAssigneeChange: (task: TaskRowProps, owner: AssignableOwner) => void;
  onScrollOffsetChange: (offsetY: number) => void;
  onTopPullChange?: (pullDistance: number) => void;
  onTopPullEnd?: () => void;
  canAssignProject?: boolean;
  onAddToProjectPress?: (task: TaskRowProps) => void;
};

export default function TaskList({
  sectionTitle,
  tasks,
  loading,
  error,
  hasTasks,
  activeFilterCount,
  hasMore,
  loadingMore,
  paginationError = false,
  refreshing,
  containerStyle,
  assignableOwners,
  canReassign,
  onRetry,
  onRefresh,
  onLoadMore,
  onRetryLoadMore,
  onFilterPress,
  onTaskPress,
  onCommentPress,
  onStatusChange,
  onAssigneeChange,
  onScrollOffsetChange,
  onTopPullChange,
  onTopPullEnd,
  canAssignProject,
  onAddToProjectPress,
}: Props) {
  return (
    <TaskListSection
      loading={loading}
      hasTasks={hasTasks}
      sectionTitle={sectionTitle}
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
        loadError={!!error}
        onRetry={onRetry}
        activeFilterCount={activeFilterCount}
        hasMore={hasMore}
        loadingMore={loadingMore}
        paginationError={paginationError}
        onRetryLoadMore={onRetryLoadMore ?? onLoadMore}
        onLoadMore={onLoadMore}
        onRefresh={onRefresh}
        refreshing={refreshing}
        onScrollOffsetChange={onScrollOffsetChange}
        onTopPullChange={onTopPullChange}
        onTopPullEnd={onTopPullEnd}
        canReassign={canReassign}
        assignableOwners={assignableOwners}
        onAssigneeChange={onAssigneeChange}
        canAssignProject={canAssignProject}
        onAddToProjectPress={onAddToProjectPress}
        virtualized
      />
    </TaskListSection>
  );
}
