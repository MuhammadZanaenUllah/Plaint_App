// Row 1 create-task fields: assignee, due date/effort, priority (AUD-081 phase 1).
// Composition and panel order match the original modal exactly.

import type { TaskOwner } from "@/types/task.types";
import type { TaskPriorityLevel } from "@/features/tasks/types/task.types";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { Keyboard, View } from "react-native";
import type { CreateTaskActivePanel, EffortUnit } from "./createTaskOptions";
import { createTaskFieldStyles as styles } from "./createTaskFieldStyles";
import {
  CreateAssigneeChip,
  CreateAssigneePanel,
} from "./fields/CreateAssigneeField";
import {
  CreateDueDateEffortChip,
  CreateDueDateEffortPanel,
} from "./fields/CreateDueDateEffortField";
import {
  CreatePriorityChip,
  CreatePriorityPanel,
} from "./fields/CreatePriorityField";

type Props = {
  activePanel: CreateTaskActivePanel;
  setActivePanel: Dispatch<SetStateAction<CreateTaskActivePanel>>;
  effectiveAssigneeName: string;
  assignSearch: string;
  onChangeAssignSearch: (value: string) => void;
  filteredUsers: TaskOwner[];
  assignedUserId: number | null;
  onSelectAssignee: (user: TaskOwner) => void;
  isAdvanced: boolean;
  effortHours: string;
  effortUnit: EffortUnit;
  effortUnitAbbrev: string;
  effortUnitOpen: boolean;
  onToggleEffortUnit: () => void;
  onEffortChange: (text: string) => void;
  onEffortBlur: () => void;
  onEffortUnitChange: (unit: EffortUnit) => void;
  effectiveDueDate: Date | null;
  onSelectDueDate: (date: Date) => void;
  effectivePriority: TaskPriorityLevel;
  onSelectPriority: (priority: TaskPriorityLevel) => void;
  effortRowRef?: RefObject<View | null>;
};

export function CreateTaskPrimaryFields({
  activePanel,
  setActivePanel,
  effectiveAssigneeName,
  assignSearch,
  onChangeAssignSearch,
  filteredUsers,
  assignedUserId,
  onSelectAssignee,
  isAdvanced,
  effortHours,
  effortUnit,
  effortUnitAbbrev,
  effortUnitOpen,
  onToggleEffortUnit,
  onEffortChange,
  onEffortBlur,
  onEffortUnitChange,
  effectiveDueDate,
  onSelectDueDate,
  effectivePriority,
  onSelectPriority,
  effortRowRef,
}: Props) {
  return (
    <>
      <View style={styles.chipsRow}>
        <CreateAssigneeChip
          active={activePanel === "assigned"}
          effectiveAssigneeName={effectiveAssigneeName}
          onPress={() => {
            Keyboard.dismiss();
            setActivePanel((p) => (p === "assigned" ? null : "assigned"));
          }}
        />

        <CreateDueDateEffortChip
          isAdvanced={isAdvanced}
          active={activePanel === "dueDate"}
          effortHours={effortHours}
          effortUnitAbbrev={effortUnitAbbrev}
          effectiveDueDate={effectiveDueDate}
          onPress={() => {
            Keyboard.dismiss();
            setActivePanel((p) => (p === "dueDate" ? null : "dueDate"));
          }}
        />

        <CreatePriorityChip
          effectivePriority={effectivePriority}
          onPress={() => {
            if (!isAdvanced) return;
            Keyboard.dismiss();
            setActivePanel((p) => (p === "priority" ? null : "priority"));
          }}
        />
      </View>

      {activePanel === "assigned" && (
        <CreateAssigneePanel
          assignSearch={assignSearch}
          onChangeAssignSearch={onChangeAssignSearch}
          filteredUsers={filteredUsers}
          assignedUserId={assignedUserId}
          onSelectAssignee={onSelectAssignee}
        />
      )}

      {activePanel === "dueDate" && (
        <CreateDueDateEffortPanel
          isAdvanced={isAdvanced}
          effortHours={effortHours}
          effortUnit={effortUnit}
          effortUnitAbbrev={effortUnitAbbrev}
          effortUnitOpen={effortUnitOpen}
          onToggleEffortUnit={onToggleEffortUnit}
          onEffortChange={onEffortChange}
          onEffortBlur={onEffortBlur}
          onEffortUnitChange={onEffortUnitChange}
          effectiveDueDate={effectiveDueDate}
          onSelectDueDate={onSelectDueDate}
          effortRowRef={effortRowRef}
        />
      )}

      {activePanel === "priority" && (
        <CreatePriorityPanel
          isAdvanced={isAdvanced}
          effectivePriority={effectivePriority}
          onSelectPriority={onSelectPriority}
        />
      )}
    </>
  );
}
