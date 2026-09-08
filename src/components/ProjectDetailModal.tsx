import Avatar from "@/components/Avatar";
import CalendarPicker from "@/components/CalendarPicker";
import SingleTaskTable, { AssignableOwner } from "@/components/SingleTaskTable";
import { StatusType, TaskRowProps } from "@/components/TaskRow";
import { useAuth } from "@/hooks/useAuth";
import { useProjects } from "@/hooks/useProjects";
import { useTasks } from "@/hooks/useTasks";
import * as projectService from "@/services/api/projects.service";
import { reassignTask } from "@/services/api/tasks.service";
import {
  Project,
  ProjectDetail,
  ProjectStatus,
  UpdateProjectRequest,
} from "@/types/project.types";
import { TaskListItem } from "@/types/task.types";
import { formatShortDate } from "@/utils/dateFormat";
import { extractErrorMessage } from "@/utils/errorHandler";
import { rf } from "@/utils/responsive";
import { mapTaskListItem, uiStatusToApi } from "@/utils/statusMapper";
import { showError, showSuccess } from "@/utils/toast";
import { Ionicons } from "@expo/vector-icons";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const PROJECT_STATUSES: ProjectStatus[] = [
  "Planning",
  "In Progress",
  "Pending",
  "Completed",
];

const PAGE_SIZE = 20;

const STATUS_PILL_COLORS: Record<ProjectStatus, { bg: string; text: string }> =
  {
    Planning: { bg: "#EFF6FF", text: "#3B82F6" },
    "In Progress": { bg: "#FEF3C7", text: "#D97706" },
    Pending: { bg: "#F3F4F6", text: "#4B5563" },
    Completed: { bg: "#ECFDF5", text: "#059669" },
  };

type Props = {
  visible: boolean;
  onClose: () => void;
  project: Project | null;
  onProjectUpdated?: () => void;
  onTaskPress?: (task: TaskRowProps) => void;
  onCommentPress?: (task: TaskRowProps) => void;
  canAssignProject?: boolean;
  onAddToProjectPress?: (task: TaskRowProps) => void;
};

export default function ProjectDetailModal({
  visible,
  onClose,
  project,
  onProjectUpdated,
  onTaskPress,
  onCommentPress,
  canAssignProject = false,
  onAddToProjectPress,
}: Props) {
  const insets = useSafeAreaInsets();
  const { state: authState } = useAuth();
  const {
    state: projectState,
    fetchProjectUsers,
    fetchProjects,
  } = useProjects();
  const { state: taskState, updateTaskStatusApi } = useTasks();

  const companyId = authState.company?.company_id ?? 0;
  const companyIdentifier = authState.company?.company_identifier ?? "";

  // ── Project detail state ──────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);

  // Infinite pagination over the project's tasks — 20 visible at a time,
  // 20 more each time the user reaches the bottom of the table.
  const [visibleTaskCount, setVisibleTaskCount] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const loadMoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restart pagination at page 1 whenever a fresh detail payload replaces
  // the current one (e.g. after a status/assignee change refresh).
  const resetTaskPagination = useCallback(() => {
    if (loadMoreTimerRef.current) {
      clearTimeout(loadMoreTimerRef.current);
      loadMoreTimerRef.current = null;
    }
    loadingMoreRef.current = false;
    setLoadingMore(false);
    setVisibleTaskCount(PAGE_SIZE);
  }, []);

  // Form fields
  const [name, setName] = useState("");
  const [ownerId, setOwnerId] = useState<number>(0);
  const [status, setStatus] = useState<ProjectStatus>("Planning");
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [description, setDescription] = useState("");

  // Dropdown / Picker visibility
  const [showOwnerPicker, setShowOwnerPicker] = useState(false);
  const [ownerSearch, setOwnerSearch] = useState("");
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Load project detail whenever opened
  const loadDetail = useCallback(async () => {
    if (!project?.id) return;
    setLoading(true);
    try {
      const res = await projectService.getProjectDetail(project.id);
      if (res.Good && res.data) {
        const d = res.data;
        resetTaskPagination();
        setDetail(d);
        setName(d.name || project.name || "");
        setOwnerId(d.owner || project.owner || 0);
        setStatus((d.status as ProjectStatus) || project.status || "Planning");
        if (d.due_date) {
          const parsed = new Date(d.due_date);
          setDueDate(isNaN(parsed.getTime()) ? null : parsed);
        } else if (project.due_date) {
          const parsed = new Date(project.due_date);
          setDueDate(isNaN(parsed.getTime()) ? null : parsed);
        } else {
          setDueDate(null);
        }
        setDescription(d.description ?? project.description ?? "");
      }
    } catch (err) {
      showError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [project, resetTaskPagination]);

  useEffect(() => {
    if (visible && project?.id) {
      loadDetail();
      fetchProjectUsers().catch(() => {});
    } else if (!visible) {
      setDetail(null);
      setShowOwnerPicker(false);
      setShowStatusPicker(false);
      setShowDatePicker(false);
    }
  }, [visible, project?.id, loadDetail, fetchProjectUsers]);

  // Candidate users for Project Owner
  const candidateUsers = useMemo(() => {
    const list: { id: number; name: string }[] = [];
    const seen = new Set<number>();

    // From projectState.projectUsers
    for (const u of projectState.projectUsers ?? []) {
      if (!seen.has(u.id)) {
        seen.add(u.id);
        const fullName =
          `${u.first_name || ""} ${u.last_name || ""}`.trim() ||
          `User #${u.id}`;
        list.push({ id: u.id, name: fullName });
      }
    }

    // From taskState.taskOwners
    for (const o of taskState.taskOwners ?? []) {
      if (!seen.has(o.id)) {
        seen.add(o.id);
        list.push({
          id: o.id,
          name:
            o.full_name ||
            `${o.first_name || ""} ${o.last_name || ""}`.trim() ||
            `User #${o.id}`,
        });
      }
    }

    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [projectState.projectUsers, taskState.taskOwners]);

  const filteredCandidateUsers = useMemo(() => {
    const q = ownerSearch.trim().toLowerCase();
    if (!q) return candidateUsers;
    return candidateUsers.filter((u) => u.name.toLowerCase().includes(q));
  }, [candidateUsers, ownerSearch]);

  // Current Owner Display
  const currentOwner = useMemo(() => {
    return candidateUsers.find((u) => u.id === ownerId);
  }, [candidateUsers, ownerId]);

  const ownerDisplayName =
    currentOwner?.name || (ownerId ? `User #${ownerId}` : "Unassigned");

  // Created by Display
  const createdByName = useMemo(() => {
    if (detail?.created_by_user) {
      const u = detail.created_by_user;
      return (
        `${u.first_name || ""} ${u.last_name || ""}`.trim() || `User #${u.id}`
      );
    }
    if (detail?.created_by) {
      const match = candidateUsers.find((u) => u.id === detail.created_by);
      return match ? match.name : `User #${detail.created_by}`;
    }
    return "Unknown";
  }, [detail, candidateUsers]);

  // Mapped Tasks for SingleTaskTable
  const mappedTasks = useMemo<TaskRowProps[]>(() => {
    if (!detail?.tasks || !Array.isArray(detail.tasks)) return [];
    const owners = taskState.taskOwners ?? [];
    return detail.tasks.map((item: TaskListItem) =>
      mapTaskListItem(item, owners),
    );
  }, [detail?.tasks, taskState.taskOwners]);

  // Paginated slice of mapped tasks + infinite-scroll helpers
  const hasMoreTasks = visibleTaskCount < mappedTasks.length;
  const taskRows = useMemo(
    () => mappedTasks.slice(0, visibleTaskCount),
    [mappedTasks, visibleTaskCount],
  );

  const loadMoreTasks = useCallback(() => {
    if (loadingMoreRef.current || loadingMore) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    loadMoreTimerRef.current = setTimeout(() => {
      setVisibleTaskCount((prev) => prev + PAGE_SIZE);
      setLoadingMore(false);
    }, 350);
  }, [loadingMore]);

  useEffect(() => {
    loadingMoreRef.current = false;
  }, [visibleTaskCount]);

  useEffect(
    () => () => {
      if (loadMoreTimerRef.current) {
        clearTimeout(loadMoreTimerRef.current);
        loadMoreTimerRef.current = null;
      }
    },
    [],
  );

  // Project Sprints
  const sprints = useMemo(
    () => detail?.sprints ?? [],
    [detail?.sprints],
  );

  // Save changes handler
  const handleSave = async () => {
    if (!project?.id) return;
    setSaving(true);
    try {
      const body: UpdateProjectRequest = {
        name: name.trim() || project.name,
        owner: ownerId || undefined,
        status: status,
        description: description.trim(),
        due_date: dueDate ? dueDate.toISOString() : undefined,
        company_id: companyId || undefined,
        company_identifier: companyIdentifier || undefined,
      };
      const res = await projectService.updateProject(project.id, body);
      if (res.Good) {
        showSuccess("Project updated successfully");
        if (onProjectUpdated) onProjectUpdated();
        fetchProjects({ silent: true }).catch(() => {});
        onClose();
      } else {
        showError(res.data || "Failed to update project");
      }
    } catch (err) {
      showError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  // Task table status change handler
  const handleTaskStatusChange = useCallback(
    async (task: TaskRowProps, newStatus: StatusType) => {
      try {
        const apiStatus = uiStatusToApi(newStatus);
        await updateTaskStatusApi(Number(task.id), {
          status: apiStatus,
          company_id: companyId,
          company_identifier: companyIdentifier,
        });
        // Refresh project detail to update task status in table
        if (project?.id) {
          const res = await projectService.getProjectDetail(project.id);
          if (res.Good && res.data) {
            resetTaskPagination();
            setDetail(res.data);
          }
        }
      } catch (err) {
        showError(extractErrorMessage(err));
      }
    },
    [updateTaskStatusApi, companyId, companyIdentifier, project?.id, resetTaskPagination],
  );

  // Task assignee change handler
  const handleTaskAssigneeChange = useCallback(
    async (task: TaskRowProps, newOwner: AssignableOwner) => {
      if (!companyId) return;
      try {
        await reassignTask(Number(task.id), {
          asigned_to: newOwner.id,
          assignee: newOwner.id,
          company_id: companyId,
          company_identifier: companyIdentifier,
        });
        if (project?.id) {
          const res = await projectService.getProjectDetail(project.id);
          if (res.Good && res.data) {
            resetTaskPagination();
            setDetail(res.data);
          }
        }
      } catch (err) {
        showError(extractErrorMessage(err));
      }
    },
    [companyId, companyIdentifier, project?.id, resetTaskPagination],
  );

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      statusBarTranslucent
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View
          style={[
            styles.root,
            { paddingTop: insets.top, paddingBottom: insets.bottom },
          ]}
        >
        {/* ── Top Header Bar (matches conversation screen) ── */}
        <View style={styles.topHeader}>
          <View style={styles.headerLeft}>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={8}
              style={styles.backBtn}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={22} color="#1D1D1D" />
            </TouchableOpacity>
            <View style={styles.headerInfo}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                Project Details
              </Text>
              <Text style={styles.headerStatus}>{status}</Text>
            </View>
          </View>
          <View style={{ width: 32 }} />
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#00DEAB" />
            <Text style={styles.loadingText}>Loading project details...</Text>
          </View>
        ) : (
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={styles.detailsArea}>
              {/* ── Project Title ── */}
              <TextInput
                allowFontScaling={false}
                style={styles.projectTitleInput}
                value={name}
                onChangeText={setName}
                placeholder="Project Title"
                placeholderTextColor="#9CA3AF"
                multiline
              />

              {/* ── Info Rows (Vertical Column Layout) ── */}
              <View style={styles.infoGroup}>
                {/* 1. Project Owner */}
                <View style={styles.infoRow}>
                  <View style={styles.infoLabelWrap}>
                    <Ionicons
                      name="people-outline"
                      size={16}
                      color="#AAAAAA"
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.infoLabel}>Project Owner:</Text>
                  </View>
                  <View style={styles.infoValueWrap}>
                    <TouchableOpacity
                      style={styles.assignedRow}
                      activeOpacity={0.7}
                      onPress={() => {
                        setShowOwnerPicker((prev) => !prev);
                        setShowStatusPicker(false);
                        setShowDatePicker(false);
                      }}
                    >
                      <Avatar
                        name={ownerDisplayName}
                        size={20}
                        borderRadius={4}
                      />
                      <Text style={styles.infoValue} numberOfLines={1}>
                        {ownerDisplayName}
                      </Text>
                      <Ionicons
                        name={showOwnerPicker ? "chevron-up" : "chevron-down"}
                        size={14}
                        color="#9CA3AF"
                        style={{ marginLeft: 4 }}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Owner Dropdown list */}
                {showOwnerPicker && (
                  <View style={styles.inlinePicker}>
                    <TextInput
                      style={styles.pickerSearchInput}
                      placeholder="Search member..."
                      placeholderTextColor="#9CA3AF"
                      value={ownerSearch}
                      onChangeText={setOwnerSearch}
                    />
                    <ScrollView
                      style={{ maxHeight: 160 }}
                      keyboardShouldPersistTaps="handled"
                      nestedScrollEnabled
                    >
                      {filteredCandidateUsers.map((user) => (
                        <TouchableOpacity
                          key={user.id}
                          style={[
                            styles.pickerOption,
                            user.id === ownerId && styles.pickerOptionSelected,
                          ]}
                          onPress={() => {
                            setOwnerId(user.id);
                            setShowOwnerPicker(false);
                            setOwnerSearch("");
                          }}
                        >
                          <Avatar name={user.name} size={18} borderRadius={4} />
                          <Text
                            style={[
                              styles.pickerOptionText,
                              user.id === ownerId &&
                                styles.pickerOptionTextSelected,
                            ]}
                            numberOfLines={1}
                          >
                            {user.name}
                          </Text>
                          {user.id === ownerId && (
                            <Ionicons
                              name="checkmark"
                              size={16}
                              color="#00DEAB"
                            />
                          )}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* 2. Created By */}
                <View style={styles.infoRow}>
                  <View style={styles.infoLabelWrap}>
                    <Ionicons
                      name="person-outline"
                      size={16}
                      color="#AAAAAA"
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.infoLabel}>Created By:</Text>
                  </View>
                  <View style={styles.infoValueWrap}>
                    <View style={styles.assignedRow}>
                      <Avatar name={createdByName} size={20} borderRadius={4} />
                      <Text style={styles.infoValue} numberOfLines={1}>
                        {createdByName}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* 3. Status */}
                <View style={styles.infoRow}>
                  <View style={styles.infoLabelWrap}>
                    <Ionicons
                      name="sync-outline"
                      size={16}
                      color="#AAAAAA"
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.infoLabel}>Status:</Text>
                  </View>
                  <View style={styles.infoValueWrap}>
                    <TouchableOpacity
                      style={[
                        styles.statusPill,
                        {
                          backgroundColor:
                            STATUS_PILL_COLORS[status]?.bg ?? "#EFF6FF",
                        },
                      ]}
                      activeOpacity={0.7}
                      onPress={() => {
                        setShowStatusPicker((prev) => !prev);
                        setShowOwnerPicker(false);
                        setShowDatePicker(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.statusPillText,
                          {
                            color:
                              STATUS_PILL_COLORS[status]?.text ?? "#3B82F6",
                          },
                        ]}
                      >
                        {status}
                      </Text>
                      <Ionicons
                        name={showStatusPicker ? "chevron-up" : "chevron-down"}
                        size={12}
                        color={STATUS_PILL_COLORS[status]?.text ?? "#3B82F6"}
                        style={{ marginLeft: 4 }}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Status Options */}
                {showStatusPicker && (
                  <View style={styles.inlinePicker}>
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        gap: 8,
                        padding: 8,
                      }}
                    >
                      {PROJECT_STATUSES.map((s) => (
                        <TouchableOpacity
                          key={s}
                          style={[
                            styles.statusChip,
                            s === status && styles.statusChipActive,
                          ]}
                          onPress={() => {
                            setStatus(s);
                            setShowStatusPicker(false);
                          }}
                        >
                          <Text
                            style={[
                              styles.statusChipText,
                              s === status && styles.statusChipTextActive,
                            ]}
                          >
                            {s}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                {/* 4. Due Date */}
                <View style={styles.infoRow}>
                  <View style={styles.infoLabelWrap}>
                    <Ionicons
                      name="calendar-outline"
                      size={16}
                      color="#AAAAAA"
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.infoLabel}>Due Date:</Text>
                  </View>
                  <View style={styles.infoValueWrap}>
                    <TouchableOpacity
                      style={styles.datePickerBtn}
                      activeOpacity={0.7}
                      onPress={() => {
                        setShowDatePicker((prev) => !prev);
                        setShowOwnerPicker(false);
                        setShowStatusPicker(false);
                      }}
                    >
                      <Text style={styles.infoValue}>
                        {dueDate
                          ? formatShortDate(dueDate.toISOString())
                          : "Set Due Date"}
                      </Text>
                      <Ionicons
                        name="calendar"
                        size={14}
                        color="#9CA3AF"
                        style={{ marginLeft: 6 }}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Calendar Picker Panel */}
                {showDatePicker && (
                  <View style={styles.calendarContainer}>
                    <CalendarPicker
                      compact
                      startDate={dueDate}
                      endDate={dueDate}
                      onSelectStart={(d) => setDueDate(d)}
                      onSelectEnd={(d) => setDueDate(d)}
                      onDone={() => setShowDatePicker(false)}
                    />
                  </View>
                )}

                {/* 5. Description */}
                <View
                  style={[
                    styles.infoRow,
                    { borderBottomWidth: 0, alignItems: "flex-start" },
                  ]}
                >
                  <View style={[styles.infoLabelWrap, { paddingTop: 6 }]}>
                    <Ionicons
                      name="document-text-outline"
                      size={16}
                      color="#AAAAAA"
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.infoLabel}>Description:</Text>
                  </View>
                  <View style={styles.infoValueWrap}>
                    <TextInput
                      style={styles.descriptionInput}
                      value={description}
                      onChangeText={setDescription}
                      placeholder="Add project description..."
                      placeholderTextColor="#9CA3AF"
                      multiline
                      scrollEnabled={false}
                    />
                  </View>
                </View>
              </View>

              {/* ── PROJECT SPRINTS ── */}
              <View style={styles.sprintsSection}>
                <Text style={styles.sectionHeading}>PROJECT SPRINTS</Text>
                <View style={styles.sprintTableBox}>
                  <View style={styles.sprintTableHeader}>
                    <Text style={[styles.sprintColHead, { flex: 1 }]}>
                      Title
                    </Text>
                    <Text
                      style={[
                        styles.sprintColHead,
                        { width: 100, textAlign: "right" },
                      ]}
                    >
                      Date
                    </Text>
                  </View>

                  {sprints.length > 0 ? (
                    <ScrollView
                      style={styles.sprintList}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={false}
                    >
                      {sprints.map((sprint) => (
                        <View key={sprint.id} style={styles.sprintRow}>
                          <Text
                            style={styles.sprintTitleText}
                            numberOfLines={1}
                          >
                            {sprint.title}
                          </Text>
                          <Text style={styles.sprintDateText}>
                            {sprint.date ? formatShortDate(sprint.date) : "—"}
                          </Text>
                        </View>
                      ))}
                    </ScrollView>
                  ) : null}

                  <TouchableOpacity
                    style={styles.createSprintBtn}
                    activeOpacity={0.7}
                    onPress={() => {
                      showSuccess(
                        "Create Sprint will be available in sprint management",
                      );
                    }}
                  >
                    <Ionicons name="add" size={16} color="#4B5563" />
                    <Text style={styles.createSprintText}>Create Sprint</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* ── PROJECT TASKS (fixed table, rows scroll independently) ── */}
            <View style={styles.projectTasksSection}>
              <SingleTaskTable
                sectionTitle="PROJECT TASKS"
                tasks={taskRows}
                contained
                canReassign={true}
                assignableOwners={taskState.taskOwners}
                onAssigneeChange={handleTaskAssigneeChange}
                onStatusChange={handleTaskStatusChange}
                onTaskPress={onTaskPress}
                onCommentPress={onCommentPress}
                canAssignProject={canAssignProject}
                onAddToProjectPress={onAddToProjectPress}
                emptyText="No tasks included in this project."
                hasMore={hasMoreTasks}
                loadingMore={loadingMore}
                onLoadMore={loadMoreTasks}
              />
            </View>

            {/* ── Bottom Action Bar ── */}
            <View style={styles.bottomBar}>
              <TouchableOpacity
                style={styles.attachmentBtn}
                activeOpacity={0.7}
                onPress={() => {
                  showSuccess("Project attachments");
                }}
              >
                <Ionicons name="attach" size={20} color="#6B7280" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                activeOpacity={0.85}
                disabled={saving}
                onPress={handleSave}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveBtnText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        )}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    minHeight: 54,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 10,
  },
  backBtn: { marginRight: 2 },
  headerInfo: { flex: 1 },
  headerTitle: {
    fontSize: rf(15),
    fontFamily: "SF_Pro_Medium",
    color: "#1D1D1D",
  },
  headerStatus: {
    fontSize: rf(10),
    fontFamily: "SF_Pro_Regular",
    color: "#8A8A8A",
    marginTop: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: rf(13),
    color: "#6B7280",
    fontFamily: "SF_Pro_Regular",
  },
  detailsArea: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  projectTitleInput: {
    fontSize: rf(20),
    fontFamily: "SF_Pro_Bold",
    color: "#1D1D1D",
    marginBottom: 12,
    paddingVertical: 4,
  },
  infoGroup: {
    backgroundColor: "#FAFAFA",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  infoLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1.1,
  },
  infoLabel: {
    fontSize: rf(12),
    color: "#6B7280",
    fontFamily: "SF_Pro_Semibold",
  },
  infoValueWrap: {
    flex: 1.6,
    flexShrink: 1,
    alignItems: "flex-start",
  },
  infoValue: {
    fontSize: rf(12.5),
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Regular",
    flexShrink: 1,
  },
  assignedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusPillText: {
    fontSize: rf(11.5),
    fontFamily: "SF_Pro_Semibold",
  },
  datePickerBtn: {
    flexDirection: "row",
    alignItems: "center",
  },
  descriptionInput: {
    fontSize: rf(12.5),
    fontFamily: "SF_Pro_Regular",
    color: "#1D1D1D",
    lineHeight: 18,
    paddingVertical: 4,
    minHeight: 40,
    maxHeight: 72,
    width: "100%",
  },
  inlinePicker: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 6,
    marginVertical: 6,
  },
  pickerSearchInput: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Regular",
    color: "#1D1D1D",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  pickerOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 8,
    borderRadius: 6,
  },
  pickerOptionSelected: {
    backgroundColor: "#F0FDF4",
  },
  pickerOptionText: {
    flex: 1,
    fontSize: rf(12),
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Regular",
  },
  pickerOptionTextSelected: {
    fontFamily: "SF_Pro_Semibold",
    color: "#059669",
  },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: "#F3F4F6",
  },
  statusChipActive: {
    backgroundColor: "#00DEAB",
  },
  statusChipText: {
    fontSize: rf(11.5),
    color: "#4B5563",
    fontFamily: "SF_Pro_Medium",
  },
  statusChipTextActive: {
    color: "#FFFFFF",
    fontFamily: "SF_Pro_Semibold",
  },
  calendarContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 8,
    marginVertical: 8,
  },
  sprintsSection: {
    marginBottom: 0,
  },
  sectionHeading: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Bold",
    color: "#1D1D1D",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  sprintTableBox: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  sprintList: {
    maxHeight: 138,
  },
  sprintTableHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  sprintColHead: {
    fontSize: rf(11),
    fontFamily: "SF_Pro_Semibold",
    color: "#6B7280",
  },
  sprintRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  sprintTitleText: {
    flex: 1,
    fontSize: rf(12),
    fontFamily: "SF_Pro_Regular",
    color: "#1D1D1D",
  },
  sprintDateText: {
    width: 100,
    textAlign: "right",
    fontSize: rf(11.5),
    fontFamily: "SF_Pro_Regular",
    color: "#6B7280",
  },
  createSprintBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  createSprintText: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Medium",
    color: "#4B5563",
  },
  projectTasksSection: {
    flex: 1,
    marginTop: 14,
    paddingHorizontal: 16,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 4,
  },
  attachmentBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  saveBtn: {
    backgroundColor: "#00DEAB",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 6,
    minWidth: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveBtnText: {
    color: "#FFFFFF",
    fontSize: rf(13),
    fontFamily: "SF_Pro_Semibold",
  },
});
