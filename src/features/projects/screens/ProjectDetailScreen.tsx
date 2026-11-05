import CalendarPicker from "@/components/CalendarPicker";
import DocumentPickerButton from "@/features/attachments/components/DocumentPickerButton";
import type { SelectedFile } from "@/features/attachments/types/attachment.types";
import ScreenHeader from "@/components/ScreenHeader";
import TaskDetailModal, {
  buildTaskDetailFromViewTask,
  type TaskDetail,
} from "@/components/TaskDetailModal";
import SingleTaskTable, {
  type AssignableOwner,
  type SingleTaskTableColumn,
} from "@/components/SingleTaskTable";
import type { StatusType, TaskRowProps } from "@/components/TaskRow";
import {
  approveTask,
  reassignTask,
  recalculateSchedule,
  updateTaskStatus,
  viewTask,
} from "@/features/tasks/api/taskApi";
import {
  hasPermission,
  TASK_PERMISSIONS,
} from "@/features/tasks/permissions/taskPermissions";
import { useTasksStore } from "@/features/tasks/store/tasksStore";
import {
  isCompletedStatus,
  normalizeApiStatus,
  toApiStatus,
} from "@/features/tasks/utils/taskStatus";
import {
  shouldRecalculateAfterReassign,
  shouldRecalculateAfterStatus,
  shouldRouteAtsReopen,
} from "@/features/tasks/utils/taskActionRules";
import { validateAttachment } from "@/features/tasks/utils/taskValidation";
import { formatTaskDueDatePkt } from "@/features/tasks/utils/taskDate";
import {
  isNetworkErrorMessage,
  reportTaskError,
  taskErrorMessage,
} from "@/features/tasks/utils/taskError";
import {
  canAssignTaskToProject,
  canCreateSprint,
  canEditProject,
  canViewProjects,
} from "@/features/projects/permissions/projectPermissions";
import { useProjectsStore } from "@/features/projects/store/projectsStore";
import CreateSprintModal from "@/features/projects/components/project-detail/CreateSprintModal";
import ProjectSprintsSection from "@/features/projects/components/project-detail/ProjectSprintsSection";
import { useProjectSprints } from "@/features/projects/components/project-detail/useProjectSprints";
import { useTaskProjectAssignment } from "@/features/tasks/hooks/useTaskProjectAssignment";
import TaskProjectAssignmentHost from "@/features/tasks/components/shared/TaskProjectAssignmentHost";
import type {
  CanonicalProjectStatus,
  ProjectAttachment,
} from "@/features/projects/types/project.types";
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_COLORS,
  isOpenProjectTask,
} from "@/features/projects/utils/projectStatus";
import {
  canMarkProjectCompleted,
  validateProject,
} from "@/features/projects/utils/projectValidation";
import { useAuth } from "@/hooks/useAuth";
import { useTasks } from "@/hooks/useTasks";
import { openChatDocument } from "@/utils/openChatDocument";
import { rf } from "@/utils/responsive";
import { mapTaskListItem } from "@/utils/statusMapper";
import { showError, showInfo, showSuccess } from "@/utils/toast";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ProjectDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const projectId = Number(params.id ?? 0);
  const { state: authState } = useAuth();
  const companyId = authState.company?.company_id ?? 0;
  const companyIdentifier = authState.company?.company_identifier ?? "";
  const isAts = authState.hasAdvancedTaskModule === true;
  const canView = canViewProjects(authState.user, authState.company);
  const hasEditPermission = hasPermission(authState.user, TASK_PERMISSIONS.edit);

  const {
    projectDetail,
    projectUsers,
    sprints,
    sprintsProjectId,
    isLoading,
    error,
    loadProjectDetail,
    loadSprints,
    loadProjectUsers,
    updateProject,
    uploadAttachment,
    deleteAttachment,
    clearDetail,
  } = useProjectsStore();
  const { state: taskState } = useTasks();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<CanonicalProjectStatus>("Planning");
  const [ownerId, setOwnerId] = useState<number | null>(null);
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const uploadingRef = useRef(false);
  const [selectedTask, setSelectedTask] = useState<TaskDetail | null>(null);
  const [initialTab, setInitialTab] = useState<"details" | "comments">("details");

  const refresh = useCallback(() => {
    if (projectId) {
      loadProjectDetail(projectId).catch((error) =>
        reportTaskError("Project detail refresh failed", error),
      );
    }
  }, [loadProjectDetail, projectId]);

  useEffect(() => {
    if (!projectId || !canView) return;
    loadProjectDetail(projectId).catch((error) =>
      reportTaskError("Project detail load failed", error),
    );
    loadSprints(companyId, projectId).catch((error) =>
      reportTaskError("Project sprints load failed", error),
    );
    loadProjectUsers(companyId).catch((error) =>
      reportTaskError("Project users load failed", error),
    );
  }, [
    canView,
    companyId,
    loadProjectDetail,
    loadProjectUsers,
    loadSprints,
    projectId,
  ]);

  useEffect(() => {
    return () => {
      clearDetail();
    };
  }, [clearDetail]);

  useEffect(() => {
    const detail = projectDetail;
    if (!detail || Number(detail.id) !== projectId) return;
    const timer = setTimeout(() => {
      setName(detail.name ?? "");
      setDescription(detail.description ?? "");
      setStatus((detail.status as CanonicalProjectStatus) ?? "Planning");
      setOwnerId(detail.owner ?? null);
      const parsed = detail.due_date ? new Date(detail.due_date) : null;
      setDueDate(parsed && !Number.isNaN(parsed.getTime()) ? parsed : null);
    }, 0);
    return () => clearTimeout(timer);
  }, [projectDetail, projectId]);

  const ownerOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const user of projectUsers) {
      map.set(
        user.id,
        `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() ||
          `User #${user.id}`,
      );
    }
    for (const owner of taskState.taskOwners ?? []) {
      if (!map.has(owner.id)) {
        map.set(
          owner.id,
          `${owner.first_name ?? ""} ${owner.last_name ?? ""}`.trim() ||
            owner.full_name ||
            `User #${owner.id}`,
        );
      }
    }
    return [...map.entries()].map(([id, label]) => ({ id, label }));
  }, [projectUsers, taskState.taskOwners]);

  const ownerName =
    ownerOptions.find((owner) => owner.id === ownerId)?.label ?? "Unassigned";
  const creatorName =
    ownerOptions.find(
      (owner) => owner.id === Number(projectDetail?.created_by ?? 0),
    )?.label ?? `User #${projectDetail?.created_by ?? "?"}`;

  const canEditNow =
    canEditProject(authState.user, authState.company) ||
    Number(projectDetail?.created_by) === Number(authState.user?.id) ||
    Number(projectDetail?.owner) === Number(authState.user?.id);

  const projectTasks = useMemo(
    () => projectDetail?.tasks ?? [],
    [projectDetail?.tasks],
  );
  const openTaskCount = projectTasks.filter(isOpenProjectTask).length;

  const canManageSprints = canCreateSprint(
    authState.user,
    authState.company,
    projectDetail,
  );
  const canAssignProject = canAssignTaskToProject(
    authState.user,
    authState.company,
  );

  const projectSprints = useMemo(
    () => (sprintsProjectId === projectId ? sprints : []),
    [projectId, sprints, sprintsProjectId],
  );

  const sprintNames = useMemo(
    () =>
      new Map(
        projectSprints.map((sprint) => [Number(sprint.id), sprint.name]),
      ),
    [projectSprints],
  );

  const assignment = useTaskProjectAssignment({
    companyId,
    companyIdentifier,
    canAssign: canAssignProject,
    refresh,
  });

  const sprintController = useProjectSprints({
    companyId,
    companyIdentifier,
    userId: Number(authState.user?.id ?? 0),
    project: projectDetail,
    sprints: projectSprints,
  });

  const rows: TaskRowProps[] = useMemo(
    () =>
      projectTasks.map((task) => ({
        ...mapTaskListItem(task, taskState.taskOwners ?? []),
        sprint: task.sprint_id
          ? sprintNames.get(Number(task.sprint_id)) ??
            `Sprint #${task.sprint_id}`
          : undefined,
        canEditSprint: task.can_edit === true && canAssignProject,
        canEditStatus: task.can_edit_status === true,
        canReassign: task.can_edit === true && hasEditPermission,
        canApproveReject:
          task.status === "Pending-Approval" &&
          (Number(task.created_by) === Number(authState.user?.id) ||
            (authState.user?.role_title ?? "").trim().toLowerCase() ===
              "company admin"),
      })),
    [
      authState.user,
      canAssignProject,
      hasEditPermission,
      projectTasks,
      sprintNames,
      taskState.taskOwners,
    ],
  );

  const projectTaskColumns = useMemo<SingleTaskTableColumn[]>(
    () => ["title", "createdBy", "assignedTo", "dueDate", "sprint", "status"],
    [],
  );

  const openTask = useCallback(
    async (row: TaskRowProps, tab: "details" | "comments") => {
      const taskId = Number(row.id);
      if (!taskId) return;
      const result = await viewTask(taskId, companyId);
      if (!result.ok) {
        showError("Unable to open task", result.message);
        return;
      }
      const detail = buildTaskDetailFromViewTask(result.data, companyId);
      if (!detail) {
        showError("Unable to open task", "Task details are unavailable.");
        return;
      }
      setInitialTab(tab);
      setSelectedTask(detail);
    },
    [companyId],
  );

  const recalculateIfAts = useCallback(
    async (taskId: number, completedAt?: string) => {
      if (!isAts) return;
      try {
        const result = await recalculateSchedule(taskId, {
          company_id: companyId,
          company_identifier: companyIdentifier,
          completed_at: completedAt,
        });
        if (!result.ok) {
          showError("Schedule Update Failed", result.message);
        }
      } catch (error) {
        showError(
          "Schedule Update Failed",
          taskErrorMessage(error, "Could not recalculate the task."),
        );
      }
    },
    [companyId, companyIdentifier, isAts],
  );

  const handleStatusChange = async (row: TaskRowProps, next: StatusType) => {
    const raw = row._raw;
    const taskId = Number(row.id);
    if (!raw || !taskId) return;
    const current = normalizeApiStatus(String(raw.status));
    const requested = normalizeApiStatus(String(next));
    const admin =
      (authState.user?.role_title ?? "").trim().toLowerCase() === "company admin";
    const creator =
      Number(raw.created_by ?? 0) === Number(authState.user?.id ?? 0);
    const isApproval = current === "Pending-Approval" && requested === "Complete";
    const canApprove = isApproval && (admin || creator);

    // A Company Admin can approve a Pending-Approval task even when the row
    // does not grant can_edit_status (AUD-034).
    if (raw.can_edit_status !== true && !canApprove) {
      showError("Not Allowed", "You cannot change this task's status.");
      return;
    }
    if (isApproval && !canApprove) {
      showError(
        "Not Allowed",
        "Only the task creator or company admin can approve a task.",
      );
      return;
    }
    if (isCompletedStatus(current) && raw.can_edit !== true) {
      showError("Not Allowed", "Only the task creator can reopen a completed task.");
      return;
    }
    if (shouldRouteAtsReopen(current, requested, isAts)) {
      showInfo(
        "ATS Reopen",
        "Open the task detail to reopen this ATS task with a new priority and effort.",
      );
      return;
    }
    if (requested === "Rejected") {
      showInfo("Reject Task", "Open the task detail to reject a pending-approval task.");
      return;
    }

    const apiStatus = toApiStatus(requested);
    const completedAt = new Date().toISOString();
    try {
      if (isApproval) {
        const result = await approveTask(taskId, {
          company_id: companyId,
          company_identifier: companyIdentifier,
        });
        if (!result.ok) {
          showError("Approval Failed", result.message);
          return;
        }
        useTasksStore.getState().patchTask(taskId, {
          status: "Complete",
          completed_at: completedAt,
        });
      } else {
        const result = await updateTaskStatus(taskId, {
          status: apiStatus,
          company_id: companyId,
          company_identifier: companyIdentifier,
        });
        if (!result.ok) {
          showError("Status Update Failed", result.message);
          return;
        }
        if (result.message?.toLowerCase().includes("approval is required")) {
          useTasksStore.getState().patchTask(taskId, {
            status: "Pending-Approval",
          });
        }
      }
      if (shouldRecalculateAfterStatus(current, requested, isAts)) {
        await recalculateIfAts(
          taskId,
          requested === "Complete" ? completedAt : undefined,
        );
      }
      refresh();
    } catch (err) {
      showError(
        "Status Update Failed",
        taskErrorMessage(err, "Could not update the task."),
      );
    }
  };

  const handleAssigneeChange = async (
    row: TaskRowProps,
    owner: AssignableOwner,
  ) => {
    const raw = row._raw;
    const taskId = Number(row.id);
    if (!raw || !taskId) return;
    if (!hasEditPermission || raw.can_edit !== true) {
      showError("Not Allowed", "Only the task creator can reassign this task.");
      return;
    }
    const result = await reassignTask(taskId, {
      assignee: owner.id,
      asigned_to: owner.id,
      company_id: companyId,
      company_identifier: companyIdentifier,
    });
    if (!result.ok) {
      showError("Reassign Failed", result.message);
      return;
    }
    if (shouldRecalculateAfterReassign(isAts)) {
      await recalculateIfAts(taskId);
    }
    refresh();
  };

  const handleSave = async () => {
    if (!projectId || !canEditNow || saving) return;
    const dueDateValue = dueDate ? dueDate.toISOString() : "";
    const validation = validateProject({ name, dueDate: dueDateValue, status });
    if (!validation.valid) {
      showError("Validation", Object.values(validation.errors).join("\n"));
      return;
    }

    if (status === "Completed") {
      const currentStatus = projectDetail?.status ?? "Planning";
      if (currentStatus !== "In Progress") {
        showError(
          "Status Not Allowed",
          "Please set the project to In Progress before marking it Completed.",
        );
        return;
      }
      const completion = canMarkProjectCompleted(openTaskCount);
      if (!completion.valid) {
        showError("Status Not Allowed", completion.errors.status);
        return;
      }
    }

    setSaving(true);
    try {
      const result = await updateProject(projectId, {
        name: name.trim(),
        owner: ownerId ?? undefined,
        status,
        description,
        due_date: dueDateValue,
        company_id: companyId,
        company_identifier: companyIdentifier,
      });
      if (!result.ok) {
        showError("Update Failed", result.message);
        return;
      }
      showSuccess("Success", "Project updated successfully.");
      refresh();
    } finally {
      setSaving(false);
    }
  };

  const handlePickAttachment = async (files: SelectedFile[]) => {
    if (!projectId || !canEditNow || uploadingRef.current) return;
    uploadingRef.current = true;
    try {
      const file = files[0];
      if (!file) return;
      const validation = validateAttachment(file);
      if (!validation.valid) {
        showError(
          "Attachment Rejected",
          `"${file.name}": ${Object.values(validation.errors)[0]}`,
        );
        return;
      }
      const formData = new FormData();
      formData.append("file", {
        uri: file.uri,
        name: file.name || "attachment",
        type: file.mimeType || "application/octet-stream",
      } as unknown as Blob);
      setUploading(true);
      const result = await uploadAttachment(projectId, formData);
      if (!result.ok) {
        showError("Upload Failed", result.message);
        return;
      }
      showSuccess("Success", "Attachment uploaded.");
      refresh();
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  };

  const handleOpenAttachment = (attachment: ProjectAttachment) => {
    const path = attachment.attachment.startsWith("public/")
      ? attachment.attachment
      : `public/uploads/projects/${attachment.attachment}`;
    openChatDocument(path, attachment.original_name || attachment.attachment).catch(
      () => showError("Error", "Could not open this attachment."),
    );
  };

  const handleDeleteAttachment = (attachment: ProjectAttachment) => {
    Alert.alert(
      "Remove File",
      "This will permanently delete this attachment.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            const result = await deleteAttachment(attachment.id);
            if (!result.ok) {
              showError("Delete Failed", result.message);
              return;
            }
            showSuccess("Success", "Attachment removed.");
            refresh();
          },
        },
      ],
    );
  };

  if (!canView) {
    return (
      <SafeAreaView style={styles.root}>
        <ScreenHeader title="Project" />
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Projects unavailable</Text>
          <Text style={styles.emptyText}>
            Your account does not have the project-list permission.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!projectId) {
    return (
      <SafeAreaView style={styles.root}>
        <ScreenHeader title="Project" />
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Project not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScreenHeader
        title={projectDetail?.name ?? "Project"}
        subtitle={projectDetail?.status}
        onBack={() => router.back()}
      />
      {isLoading && !projectDetail ? (
        <View style={styles.center}>
          <ActivityIndicator color="#00DEAB" />
        </View>
      ) : error && !projectDetail ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Could not load project</Text>
          <Text style={styles.emptyText}>
            {isNetworkErrorMessage(error)
              ? "You appear to be offline. Check your connection and retry."
              : error}
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={refresh}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            {error ? (
              <Text style={styles.inlineError}>
                {isNetworkErrorMessage(error)
                  ? "You appear to be offline. Changes may not save until you reconnect."
                  : error}
              </Text>
            ) : null}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Project Title</Text>
              <TextInput
                style={styles.titleInput}
                value={name}
                onChangeText={setName}
                editable={canEditNow}
                placeholder="Project title"
                placeholderTextColor="#9CA3AF"
                multiline
              />
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Status</Text>
              <TouchableOpacity
                style={styles.infoValueBtn}
                disabled={!canEditNow}
                onPress={() => setStatusOpen((prev) => !prev)}
              >
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: PROJECT_STATUS_COLORS[status].bg },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      { color: PROJECT_STATUS_COLORS[status].text },
                    ]}
                  >
                    {status}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
            {statusOpen && canEditNow && (
              <View style={styles.chipsWrap}>
                {PROJECT_STATUSES.map((entry) => (
                  <TouchableOpacity
                    key={entry}
                    style={[
                      styles.chip,
                      status === entry && {
                        backgroundColor: PROJECT_STATUS_COLORS[entry].text,
                        borderColor: PROJECT_STATUS_COLORS[entry].text,
                      },
                    ]}
                    onPress={() => {
                      setStatus(entry);
                      setStatusOpen(false);
                    }}
                  >
                    <Text
                      style={[styles.chipText, status === entry && { color: "#fff" }]}
                    >
                      {entry}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Owner</Text>
              <TouchableOpacity
                style={styles.infoValueBtn}
                disabled={!canEditNow}
                onPress={() => setOwnerOpen((prev) => !prev)}
              >
                <Text style={styles.infoValue}>{ownerName}</Text>
              </TouchableOpacity>
            </View>
            {ownerOpen && canEditNow && (
              <View style={styles.dropdown}>
                <TouchableOpacity
                  style={styles.dropdownRow}
                  onPress={() => {
                    setOwnerId(null);
                    setOwnerOpen(false);
                  }}
                >
                  <Text style={styles.dropdownText}>Unassigned</Text>
                </TouchableOpacity>
                {ownerOptions.map((owner) => (
                  <TouchableOpacity
                    key={owner.id}
                    style={styles.dropdownRow}
                    onPress={() => {
                      setOwnerId(owner.id);
                      setOwnerOpen(false);
                    }}
                  >
                    <Text style={styles.dropdownText}>{owner.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Created By</Text>
              <Text style={styles.infoValue}>{creatorName}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Due Date</Text>
              <TouchableOpacity
                style={styles.infoValueBtn}
                disabled={!canEditNow}
                onPress={() => setDateOpen((prev) => !prev)}
              >
                <Text style={styles.infoValue}>
                  {dueDate ? formatTaskDueDatePkt(dueDate) : "—"}
                </Text>
              </TouchableOpacity>
            </View>
            {dateOpen && canEditNow && (
              <View style={styles.calendarWrap}>
                <CalendarPicker
                  compact
                  startDate={dueDate}
                  endDate={dueDate}
                  onSelectStart={(date) => setDueDate(date)}
                  onSelectEnd={(date) => setDueDate(date)}
                  onDone={() => setDateOpen(false)}
                />
              </View>
            )}

            <Text style={styles.sectionTitle}>Description</Text>
            <TextInput
              style={[styles.descriptionInput, !canEditNow && { opacity: 0.75 }]}
              value={description}
              onChangeText={setDescription}
              editable={canEditNow}
              multiline
              textAlignVertical="top"
              placeholder="Project description"
              placeholderTextColor="#9CA3AF"
            />

            {canEditNow && (
              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.7 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            )}

            <ProjectSprintsSection
              sprints={projectSprints}
              loading={isLoading}
              canManage={canManageSprints}
              onCreate={sprintController.openCreate}
              onEditDate={sprintController.openDate}
              onDelete={sprintController.requestDelete}
            />

            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Attachments</Text>
              {canEditNow && <DocumentPickerButton onPick={handlePickAttachment} />}
            </View>
            {uploading && <Text style={styles.muted}>Uploading…</Text>}
            {(projectDetail?.attachments ?? []).map((attachment) => (
              <View key={attachment.id} style={styles.attachRow}>
                <TouchableOpacity
                  style={styles.attachMain}
                  onPress={() => handleOpenAttachment(attachment)}
                >
                  <Ionicons name="download-outline" size={15} color="#00DEAB" />
                  <Text style={styles.attachText} numberOfLines={1}>
                    {attachment.original_name || attachment.attachment}
                  </Text>
                </TouchableOpacity>
                {canEditNow && (
                  <TouchableOpacity
                    onPress={() => handleDeleteAttachment(attachment)}
                    hitSlop={8}
                  >
                    <Ionicons name="trash-outline" size={16} color="#EF4444" />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            {(projectDetail?.attachments ?? []).length === 0 && (
              <Text style={styles.muted}>No attachments.</Text>
            )}

            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>
                Project Tasks ({projectTasks.length})
              </Text>
              <Text style={styles.muted}>{openTaskCount} open</Text>
            </View>
            <SingleTaskTable
              sectionTitle=""
              tasks={rows}
              columns={projectTaskColumns}
              contained
              canReassign={hasEditPermission}
              assignableOwners={(taskState.taskOwners ?? []).map((owner) => ({
                id: owner.id,
                name:
                  `${owner.first_name ?? ""} ${owner.last_name ?? ""}`.trim() ||
                  owner.full_name ||
                  `User #${owner.id}`,
                avatar: owner.image ?? undefined,
              }))}
              onTaskPress={(row) => openTask(row, "details")}
              onCommentPress={(row) => openTask(row, "comments")}
              onStatusChange={handleStatusChange}
              onAssigneeChange={handleAssigneeChange}
              onSprintPress={(row) => {
                if (!projectDetail) return;
                assignment.openSprintForTask(row, projectDetail);
              }}
              emptyText="No tasks in this project."
            />
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      <CreateSprintModal {...sprintController.createModalProps} />

      <TaskDetailModal
        visible={!!selectedTask}
        onClose={() => {
          setSelectedTask(null);
          refresh();
        }}
        task={selectedTask}
        initialTab={initialTab}
      />

      <TaskProjectAssignmentHost
        controller={assignment}
        companyId={companyId}
        companyIdentifier={companyIdentifier}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  content: { paddingHorizontal: 16, paddingBottom: 40 },
  inlineError: {
    marginTop: 8,
    fontSize: rf(12),
    color: "#B45309",
    fontFamily: "SF_Pro_Regular",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyTitle: {
    fontSize: rf(16),
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
  },
  emptyText: {
    marginTop: 5,
    fontSize: rf(12.5),
    fontFamily: "SF_Pro_Regular",
    color: "#9CA3AF",
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 12,
    backgroundColor: "#00DEAB",
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  retryText: { color: "#fff", fontSize: rf(13), fontFamily: "SF_Pro_Semibold" },
  field: { marginTop: 6, marginBottom: 8 },
  fieldLabel: {
    fontSize: rf(11),
    color: "#9CA3AF",
    fontFamily: "SF_Pro_Semibold",
    marginBottom: 4,
  },
  titleInput: {
    fontSize: rf(19),
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Semibold",
    paddingVertical: 4,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  infoLabel: {
    fontSize: rf(12),
    color: "#6B7280",
    fontFamily: "SF_Pro_Semibold",
  },
  infoValueBtn: { maxWidth: "62%" },
  infoValue: {
    fontSize: rf(13),
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Regular",
    textAlign: "right",
  },
  statusBadge: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4 },
  statusText: { fontSize: rf(11), fontFamily: "SF_Pro_Semibold" },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingVertical: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: { fontSize: rf(12), color: "#4B5563", fontFamily: "SF_Pro_Medium" },
  dropdown: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    maxHeight: 180,
    marginVertical: 6,
    overflow: "hidden",
  },
  dropdownRow: { paddingHorizontal: 12, paddingVertical: 10 },
  dropdownText: { fontSize: rf(13), color: "#1D1D1D", fontFamily: "SF_Pro_Regular" },
  calendarWrap: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 6,
    marginVertical: 8,
  },
  sectionTitle: {
    marginTop: 18,
    marginBottom: 8,
    fontSize: rf(15),
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Semibold",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 18,
    marginBottom: 8,
  },
  descriptionInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    minHeight: 90,
    padding: 12,
    fontSize: rf(13),
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Regular",
  },
  saveBtn: {
    marginTop: 14,
    backgroundColor: "#00DEAB",
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
  },
  saveText: { color: "#fff", fontSize: rf(14), fontFamily: "SF_Pro_Semibold" },
  attachRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#F3F4F6",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 6,
  },
  attachMain: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  attachText: {
    flex: 1,
    fontSize: rf(12),
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Regular",
  },
  muted: {
    fontSize: rf(12),
    color: "#9CA3AF",
    fontFamily: "SF_Pro_Regular",
  },
});



