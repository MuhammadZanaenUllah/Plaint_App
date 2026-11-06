// Row 2 create-task fields: approval, status, recurring, dependencies
// (AUD-081 phase 1). Composition and panel order match the original modal.

import type {
  RecurringPeriod,
  TaskStatus,
} from "@/features/tasks/types/task.types";
import type { Dispatch, SetStateAction } from "react";
import { Keyboard, View } from "react-native";
import type { CreateTaskActivePanel } from "./createTaskOptions";
import { createTaskFieldStyles as styles } from "./createTaskFieldStyles";
import {
  CreateApprovalChip,
  CreateApprovalPanel,
} from "./fields/CreateApprovalField";
import {
  CreateStatusChip,
  CreateStatusPanel,
} from "./fields/CreateStatusField";
import { CreateRecurringChip } from "./fields/CreateRecurringField";
import { CreateDependenciesChip } from "./fields/CreateDependenciesField";

type Props = {
  activePanel: CreateTaskActivePanel;
  setActivePanel: Dispatch<SetStateAction<CreateTaskActivePanel>>;
  selectedApproval: string | null;
  onSelectApproval: (value: string) => void;
  effectiveStatus: TaskStatus;
  onSelectStatus: (status: TaskStatus) => void;
  isRecurringEnabled: boolean;
  recurringPeriod: RecurringPeriod | null;
  onOpenRecurring: () => void;
  isAdvanced: boolean;
  selectedDependencies: number[];
  onOpenDependencies: () => void;
};

export function CreateTaskSecondaryFields({
  activePanel,
  setActivePanel,
  selectedApproval,
  onSelectApproval,
  effectiveStatus,
  onSelectStatus,
  isRecurringEnabled,
  recurringPeriod,
  onOpenRecurring,
  isAdvanced,
  selectedDependencies,
  onOpenDependencies,
}: Props) {
  return (
    <View style={styles.chipsRow}>
      <CreateApprovalChip
        active={activePanel === "approval"}
        selectedApproval={selectedApproval}
        onPress={() => {
          Keyboard.dismiss();
          setActivePanel((p) => (p === "approval" ? null : "approval"));
        }}
      />

      {activePanel === "approval" && (
        <CreateApprovalPanel
          selectedApproval={selectedApproval}
          onSelectApproval={onSelectApproval}
        />
      )}

      <CreateStatusChip
        active={activePanel === "status"}
        effectiveStatus={effectiveStatus}
        onPress={() => {
          Keyboard.dismiss();
          setActivePanel((p) => (p === "status" ? null : "status"));
        }}
      />

      {activePanel === "status" && (
        <CreateStatusPanel
          effectiveStatus={effectiveStatus}
          onSelectStatus={onSelectStatus}
        />
      )}

      <CreateRecurringChip
        isRecurringEnabled={isRecurringEnabled}
        recurringPeriod={recurringPeriod}
        onPress={() => {
          Keyboard.dismiss();
          setActivePanel(null);
          onOpenRecurring();
        }}
      />

      {isAdvanced && (
        <CreateDependenciesChip
          selectedCount={selectedDependencies.length}
          onPress={() => {
            Keyboard.dismiss();
            setActivePanel(null);
            onOpenDependencies();
          }}
        />
      )}
    </View>
  );
}
