import SingleTaskTable, {
  type AssignableOwner,
} from "@/components/SingleTaskTable";
import type { StatusType, TaskRowProps } from "@/components/TaskRow";

type Props = {
  tasks: TaskRowProps[];
  canReassign: boolean;
  assignableOwners: AssignableOwner[];
  onTaskPress: (task: TaskRowProps) => void;
  onCommentPress: (task: TaskRowProps) => void;
  onStatusChange: (task: TaskRowProps, status: StatusType) => void;
  onAssigneeChange: (task: TaskRowProps, owner: AssignableOwner) => void;
  onSprintPress: (task: TaskRowProps) => void;
  onAddTaskPress?: () => void;
  emptyText?: string;
};

/**
 * Project task table uses the same fitted 3-column layout as the main and
 * dependency tables. Assigned To / Status / Sprint live in the swipe panel.
 */
export default function ProjectTasksTable({
  tasks,
  canReassign,
  assignableOwners,
  onTaskPress,
  onCommentPress,
  onStatusChange,
  onAssigneeChange,
  onSprintPress,
  onAddTaskPress,
  emptyText = "No tasks in this project.",
}: Props) {
  return (
    <SingleTaskTable
      sectionTitle=""
      tasks={tasks}
      contained
      swipeVariant="project"
      canReassign={canReassign}
      assignableOwners={assignableOwners}
      onTaskPress={onTaskPress}
      onCommentPress={onCommentPress}
      onStatusChange={onStatusChange}
      onAssigneeChange={onAssigneeChange}
      onSprintPress={onSprintPress}
      onAddTaskPress={onAddTaskPress}
      addTaskLabel="+ Add Task"
      emptyText={emptyText}
    />
  );
}
