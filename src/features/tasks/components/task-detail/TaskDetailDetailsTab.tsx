// Details tab composition for the task-detail sheet (AUD-081 phase 3).
// Parent still owns all edit state, persistence, permissions, and scrolling.

import type { SelectedFile } from "@/features/attachments/types/attachment.types";
import type {
  DependencyData,
  TaskAttachment,
  TaskPriorityLevel,
} from "@/features/tasks/types/task.types";
import type { TaskRowProps } from "@/components/TaskRow";
import type { RichTextEditorRef } from "@/components/texteditor";
import type { RefObject } from "react";
import { TaskDetailActualCompletionRow } from "./fields/TaskDetailActualCompletionRow";
import { TaskDetailApprovalRow } from "./fields/TaskDetailApprovalRow";
import { TaskDetailAssigneeRow } from "./fields/TaskDetailAssigneeRow";
import { TaskDetailAttachmentsSection } from "./fields/TaskDetailAttachmentsSection";
import { TaskDetailDependenciesRow } from "./fields/TaskDetailDependenciesRow";
import { TaskDetailDependenciesTable } from "./fields/TaskDetailDependenciesTable";
import { TaskDetailDescriptionSection } from "./fields/TaskDetailDescriptionSection";
import { TaskDetailDueDateRow } from "./fields/TaskDetailDueDateRow";
import { TaskDetailEffortRows } from "./fields/TaskDetailEffortRows";
import { TaskDetailPriorityRow } from "./fields/TaskDetailPriorityRow";
import { TaskDetailReadOnlyDateRows } from "./fields/TaskDetailReadOnlyDateRows";
import { TaskDetailRecurringRow } from "./fields/TaskDetailRecurringRow";
import { TaskDetailStatusRow } from "./fields/TaskDetailStatusRow";
import { TaskDetailTitleField } from "./fields/TaskDetailTitleField";

export type TaskDetailDetailsTabProps = {
  canEdit: boolean;
  canEditStatus: boolean;
  canApproveRejectNow: boolean;
  isAts: boolean;
  canManageDependencies: boolean;
  canManageAttachments: boolean;

  titleValue: string;
  onTitleChange: (value: string) => void;
  onTitleBlur: () => void;

  assigneeName: string;
  assigneeImage?: string | null;
  onAssigneePress: () => void;

  createdByName: string;
  createdByImage?: string;
  createdAtDisplay: string;
  startDateDisplay: string;

  dueDateDisplay: string;
  onDueDatePress: () => void;

  actualCompletionDisplay: string;

  hasTaskPriority: boolean;
  editTaskPriority: TaskPriorityLevel;
  companyPriorityName: string;
  onPriorityPress: () => void;

  editStatus: string;
  onStatusPress: () => void;

  isRecurring: boolean;

  approvalRequired: boolean;
  onApprovalPress: () => void;

  editEffortHours: string;
  editEffortUnit: string;
  effortLogsDisplay: string;
  onEffortPress: () => void;
  onEffortLogsPress: () => void;

  dependencies: DependencyData[];
  hasDependencies: boolean;
  onRemoveDependency: (dependency: DependencyData) => void;
  onAddDependency: () => void;

  descriptionAttachmentCount: number;
  description: string;
  descriptionEditorKey: string;
  descriptionEditorRef: RefObject<RichTextEditorRef | null>;
  onDescriptionChange: (value: string) => void;
  onDescriptionBlur: () => void;

  depRows: TaskRowProps[];
  onRemoveDependencyFromTable: (dependency: DependencyData) => void;

  attachmentFiles: string[];
  attachmentItems: TaskAttachment[];
  taskVisible: TaskAttachment[];
  taskHiddenCount: number;
  fileVisible: string[];
  fileHiddenCount: number;
  showAllAttachments: boolean;
  uploadingAttachment: boolean;
  onPickAttachments: (files: SelectedFile[]) => void;
  onOpenAttachment: (path: string, name?: string) => void;
  onDeleteAttachment: (attachmentId: number) => void;
  onShowAllAttachments: () => void;
  onShowLessAttachments: () => void;
};

export function TaskDetailDetailsTab(props: TaskDetailDetailsTabProps) {
  return (
    <>
      <TaskDetailTitleField
        value={props.titleValue}
        editable={props.canEdit}
        onChange={props.onTitleChange}
        onBlur={props.onTitleBlur}
      />

      <TaskDetailAssigneeRow
        name={props.assigneeName}
        image={props.assigneeImage}
        canEdit={props.canEdit}
        onPress={props.onAssigneePress}
      />

      <TaskDetailReadOnlyDateRows
        createdByName={props.createdByName}
        createdByImage={props.createdByImage}
        createdAtDisplay={props.createdAtDisplay}
        startDateDisplay={props.startDateDisplay}
      />

      <TaskDetailDueDateRow
        display={props.dueDateDisplay}
        canEdit={props.canEdit}
        isAts={props.isAts}
        onPress={props.onDueDatePress}
      />

      <TaskDetailActualCompletionRow display={props.actualCompletionDisplay} />

      <TaskDetailPriorityRow
        hasTaskPriority={props.hasTaskPriority}
        editTaskPriority={props.editTaskPriority}
        companyPriorityName={props.companyPriorityName}
        canEdit={props.canEdit}
        isAts={props.isAts}
        onPress={props.onPriorityPress}
      />

      <TaskDetailStatusRow
        status={props.editStatus}
        canEditStatus={props.canEditStatus}
        canApproveRejectNow={props.canApproveRejectNow}
        onPress={props.onStatusPress}
      />

      <TaskDetailRecurringRow isRecurring={props.isRecurring} />

      <TaskDetailApprovalRow
        approvalRequired={props.approvalRequired}
        canEdit={props.canEdit}
        onPress={props.onApprovalPress}
      />

      <TaskDetailEffortRows
        isAts={props.isAts}
        canEdit={props.canEdit}
        editEffortHours={props.editEffortHours}
        editEffortUnit={props.editEffortUnit}
        effortLogsDisplay={props.effortLogsDisplay}
        onPressEffort={props.onEffortPress}
        onPressLogs={props.onEffortLogsPress}
      />

      <TaskDetailDependenciesRow
        dependencies={props.dependencies}
        hasDependencies={props.hasDependencies}
        canManageDependencies={props.canManageDependencies}
        onRemoveDependency={props.onRemoveDependency}
        onAddDependency={props.onAddDependency}
      />

      <TaskDetailDescriptionSection
        attachmentCount={props.descriptionAttachmentCount}
        description={props.description}
        canEdit={props.canEdit}
        editorKey={props.descriptionEditorKey}
        editorRef={props.descriptionEditorRef}
        onChange={props.onDescriptionChange}
        onBlur={props.onDescriptionBlur}
      />

      <TaskDetailDependenciesTable
        depRows={props.depRows}
        dependencies={props.dependencies}
        onRemoveDependency={props.onRemoveDependencyFromTable}
      />

      <TaskDetailAttachmentsSection
        attachmentFiles={props.attachmentFiles}
        attachmentItems={props.attachmentItems}
        taskVisible={props.taskVisible}
        taskHiddenCount={props.taskHiddenCount}
        fileVisible={props.fileVisible}
        fileHiddenCount={props.fileHiddenCount}
        showAllAttachments={props.showAllAttachments}
        canManageAttachments={props.canManageAttachments}
        uploadingAttachment={props.uploadingAttachment}
        onPick={props.onPickAttachments}
        onOpenAttachment={props.onOpenAttachment}
        onDeleteAttachment={props.onDeleteAttachment}
        onShowAll={props.onShowAllAttachments}
        onShowLess={props.onShowLessAttachments}
      />
    </>
  );
}
