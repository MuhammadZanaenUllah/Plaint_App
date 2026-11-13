import ScreenHeader from "@/components/ScreenHeader";
import CalendarPicker from "@/components/CalendarPicker";
import AnimatedFAB from "@/components/AnimatedFAB";
import {
  canCreateProject,
  canViewProjects,
} from "@/features/projects/permissions/projectPermissions";
import { useProjectsStore } from "@/features/projects/store/projectsStore";
import type {
  CanonicalProjectStatus,
  ProjectEntity,
} from "@/features/projects/types/project.types";
import {
  PROJECT_STATUSES,
  projectStatusStyle,
} from "@/features/projects/utils/projectStatus";
import CreateProjectModal from "@/features/projects/components/CreateProjectModal";
import {
  formatTaskDueDatePkt,
  toPktDateOnly,
} from "@/features/tasks/utils/taskDate";
import {
  isNetworkErrorMessage,
  reportTaskError,
} from "@/features/tasks/utils/taskError";
import { useAuth } from "@/hooks/useAuth";
import { MODULE_ACCESS_MESSAGES } from "@/utils/errorHandler";
import { prf } from "@/utils/responsive";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type StatusFilter = "All" | CanonicalProjectStatus;

function projectTaskCount(project: ProjectEntity): number {
  if (typeof project.task_count === "number") return project.task_count;
  const raw = project as unknown as { tasks?: unknown[] };
  return Array.isArray(raw.tasks) ? raw.tasks.length : 0;
}

export default function ProjectsScreen() {
  const { state: authState } = useAuth();
  const companyId = authState.company?.company_id ?? 0;
  const companyIdentifier = authState.company?.company_identifier ?? "";
  const canView = canViewProjects(authState.user, authState.company);
  const canCreate = canCreateProject(authState.user, authState.company);

  const {
    projects,
    projectUsers,
    projectsLoading,
    projectsError,
    projectsStale,
    loadProjects,
    loadProjectUsers,
  } = useProjectsStore();

  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [ownerFilter, setOwnerFilter] = useState<number[]>([]);
  const [ownerFilterOpen, setOwnerFilterOpen] = useState(false);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [createVisible, setCreateVisible] = useState(false);

  useEffect(() => {
    if (!companyId || !canView) return;
    loadProjects(companyId).catch((error) =>
      reportTaskError("Project list load failed", error),
    );
    loadProjectUsers(companyId).catch((error) =>
      reportTaskError("Project users load failed", error),
    );
  }, [companyId, canView, loadProjects, loadProjectUsers]);

  const ownerNames = useMemo(() => {
    const map = new Map<number, string>();
    for (const user of projectUsers) {
      map.set(
        user.id,
        `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() ||
          `User #${user.id}`,
      );
    }
    return map;
  }, [projectUsers]);

  const counts = useMemo(() => {
    const next: Record<StatusFilter, number> = {
      All: projects.length,
      Planning: 0,
      "In Progress": 0,
      "On Hold": 0,
      Completed: 0,
      Abandoned: 0,
    };
    for (const project of projects) {
      const status = project.status as CanonicalProjectStatus;
      if (next[status] !== undefined) next[status] += 1;
    }
    return next;
  }, [projects]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const startKey = startDate ? toPktDateOnly(startDate) : "";
    const endKey = endDate ? toPktDateOnly(endDate) : "";
    return projects.filter((project) => {
      if (statusFilter !== "All" && project.status !== statusFilter) return false;
      if (
        ownerFilter.length > 0 &&
        !ownerFilter.includes(Number(project.owner))
      ) {
        return false;
      }
      if (startKey || endKey) {
        const dueKey = toPktDateOnly(project.due_date);
        if (!dueKey) return false;
        if (startKey && dueKey < startKey) return false;
        if (endKey && dueKey > endKey) return false;
      }
      if (query && !project.name.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [endDate, ownerFilter, projects, search, startDate, statusFilter]);



  const renderProject = useCallback(
    ({ item }: { item: ProjectEntity }) => {
      const colors = projectStatusStyle(item.status);
      const due = item.due_date ? formatTaskDueDatePkt(item.due_date) : "—";
      const owner =
        item.owner !== undefined && item.owner !== null
          ? ownerNames.get(Number(item.owner)) ?? `User #${item.owner}`
          : "Unassigned";
      const createdBy =
        item.created_by !== undefined && item.created_by !== null
          ? ownerNames.get(Number(item.created_by)) ??
            `User #${item.created_by}`
          : "Unknown";
      const taskCount = projectTaskCount(item);
      return (
        <Pressable
          style={styles.card}
          onPress={() => router.push(`/projects/${item.id}` as never)}
        >
          <View style={styles.cardTop}>
            <Text style={styles.projectName} numberOfLines={2}>
              {item.name}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: colors.bg }]}>
              <Text style={[styles.statusText, { color: colors.text }]}>
                {item.status}
              </Text>
            </View>
          </View>
          <View style={styles.cardMeta}>
            <View style={styles.metaItem}>
              <Ionicons name="list-outline" size={11} color="#9CA3AF" />
              <Text style={styles.metaText}>{taskCount} tasks</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="person-outline" size={11} color="#9CA3AF" />
              <Text style={styles.metaText} numberOfLines={1}>
                {owner}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="calendar-outline" size={11} color="#9CA3AF" />
              <Text style={styles.metaText}>{due}</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="person-add-outline" size={11} color="#9CA3AF" />
              <Text style={styles.metaText} numberOfLines={1}>
                By {createdBy}
              </Text>
            </View>
          </View>
        </Pressable>
      );
    },
    [ownerNames],
  );

  if (!canView) {
    return (
      <SafeAreaView style={styles.root}>
        <ScreenHeader title="Projects" />
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Projects unavailable</Text>
          <Text style={styles.emptyText}>
            {MODULE_ACCESS_MESSAGES.projects}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScreenHeader
        title="Projects"
        rightActions={
          <>
            <TouchableOpacity
              onPress={() => setSearchOpen((open) => !open)}
              hitSlop={8}
            >
              <Ionicons name="search-outline" size={18} color="#1D1D1D" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setDatePickerOpen(true)}
              hitSlop={8}
            >
              <Ionicons
                name="calendar-outline"
                size={18}
                color={startDate || endDate ? "#00A876" : "#1D1D1D"}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setOwnerFilterOpen((open) => !open)}
              hitSlop={8}
            >
              <Ionicons
                name="person-outline"
                size={18}
                color={ownerFilter.length > 0 ? "#00A876" : "#1D1D1D"}
              />
            </TouchableOpacity>
          </>
        }
      />

      <Pressable
        style={styles.body}
        onPress={() => {
          Keyboard.dismiss();
          if (searchOpen) setSearchOpen(false);
        }}
      >
        {searchOpen ? (
          <Pressable
            style={styles.searchBarRow}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={14} color="#9CA3AF" />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search projects..."
                placeholderTextColor="#9CA3AF"
              />
              {search.length > 0 ? (
                <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}>
                  <Ionicons name="close-circle" size={15} color="#9CA3AF" />
                </TouchableOpacity>
              ) : null}
            </View>
          </Pressable>
        ) : null}



        {/* Dropdown overlays the status tabs via absolute positioning */}
        <View style={styles.dropdownAnchor}>
          {ownerFilterOpen && (
            <View style={styles.ownerDropdown}>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                showsVerticalScrollIndicator
              >
                <TouchableOpacity
                  style={styles.ownerOption}
                  onPress={() => {
                    setOwnerFilter([]);
                    setOwnerFilterOpen(false);
                  }}
                >
                  <Text style={styles.ownerOptionText}>All owners</Text>
                </TouchableOpacity>
                {projectUsers.map((owner) => {
                  const selected = ownerFilter.includes(owner.id);
                  return (
                    <TouchableOpacity
                      key={owner.id}
                      style={styles.ownerOption}
                      onPress={() => {
                        setOwnerFilter((current) =>
                          current.includes(owner.id)
                            ? current.filter((id) => id !== owner.id)
                            : [...current, owner.id],
                        );
                      }}
                    >
                      <View style={styles.ownerOptionRow}>
                        <Text style={styles.ownerOptionText}>
                          {`${owner.first_name ?? ""} ${owner.last_name ?? ""}`.trim() ||
                            `User #${owner.id}`}
                        </Text>
                        {selected ? (
                          <Ionicons name="checkmark" size={13} color="#00A876" />
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>

        <FlatList
          horizontal
          data={(["All", ...PROJECT_STATUSES] as StatusFilter[])}
          keyExtractor={(item) => item}
          showsHorizontalScrollIndicator={false}
          style={styles.statusRow}
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => {
            const selected = statusFilter === item;
            const colors =
              item === "All" ? { text: "#00A876" } : projectStatusStyle(item);
            return (
              <TouchableOpacity
                style={[
                  styles.statusChip,
                  selected && { backgroundColor: colors.text, borderColor: colors.text },
                ]}
                onPress={() => setStatusFilter(item)}
              >
                <Text style={[styles.statusChipText, selected && { color: "#fff" }]}>
                  {item} ({counts[item]})
                </Text>
              </TouchableOpacity>
            );
          }}
        />

        {projectsStale && projects.length > 0 ? (
          <Text style={styles.inlineError}>Showing cached projects…</Text>
        ) : projectsError && projects.length > 0 ? (
          <Text style={styles.inlineError}>
            {isNetworkErrorMessage(projectsError)
              ? "You appear to be offline. Showing cached projects."
              : projectsError}
          </Text>
        ) : null}

        {projectsLoading && projects.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color="#00DEAB" />
          </View>
        ) : projectsError && projects.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>Could not load projects</Text>
            <Text style={styles.emptyText}>
              {isNetworkErrorMessage(projectsError)
                ? "You appear to be offline. Check your connection and retry."
                : projectsError}
            </Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() =>
                loadProjects(companyId).catch((error) =>
                  reportTaskError("Project list retry failed", error),
                )
              }
            >
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderProject}
            initialNumToRender={10}
            maxToRenderPerBatch={8}
            windowSize={7}
            removeClippedSubviews
            contentContainerStyle={{ paddingBottom: 96, gap: 8 }}
            ListEmptyComponent={
              <View style={styles.center}>
                <Ionicons name="folder-open-outline" size={34} color="#D1D5DB" />
                <Text style={styles.emptyTitle}>No projects found</Text>
                <Text style={styles.emptyText}>
                  Try a different status, owner, date or search.
                </Text>
              </View>
            }
          />
        )}
      </Pressable>

      <Modal
        visible={datePickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDatePickerOpen(false)}
      >
        <Pressable
          style={styles.calOverlay}
          onPress={() => setDatePickerOpen(false)}
        >
          <Pressable
            style={styles.calPopup}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.calHeader}>
              <Text style={styles.calTitle}>Project due date</Text>
              <TouchableOpacity
                hitSlop={8}
                onPress={() => {
                  setStartDate(null);
                  setEndDate(null);
                  setDatePickerOpen(false);
                }}
              >
                <Text style={styles.calClearText}>Clear</Text>
              </TouchableOpacity>
            </View>
            {datePickerOpen ? (
              <CalendarPicker
                key="project-date-range"
                startDate={startDate}
                endDate={endDate}
                onSelectStart={setStartDate}
                onSelectEnd={setEndDate}
                onDone={() => setDatePickerOpen(false)}
              />
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {canCreate ? (
        <AnimatedFAB
          onPress={() => setCreateVisible(true)}
          iconName="create-new-folder"
          animated={false}
        />
      ) : null}

      <CreateProjectModal
        visible={createVisible}
        onClose={() => setCreateVisible(false)}
        companyId={companyId}
        companyIdentifier={companyIdentifier}
        onCreated={(projectId) => {
          router.push(`/projects/${projectId}` as never);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  body: { flex: 1, paddingHorizontal: 16 },
  searchBarRow: { marginBottom: 8, width: "100%" },
  searchBox: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 9,
    paddingHorizontal: 10,
    height: 38,
  },
  searchInput: {
    flex: 1,
    fontSize: prf(14),
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Regular",
    padding: 0,
  },
  dropdownAnchor: {
    position: "relative",
    zIndex: 10,
  },
  ownerDropdown: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    maxHeight: 220,
    backgroundColor: "#FFFFFF",
    zIndex: 10,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  ownerOption: { paddingHorizontal: 12, paddingVertical: 10 },
  ownerOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  ownerOptionText: {
    fontSize: prf(13),
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Regular",
  },
  statusRow: { flexGrow: 0, marginBottom: 10 },
  inlineError: {
    marginBottom: 8,
    fontSize: prf(12),
    color: "#B45309",
    fontFamily: "SF_Pro_Regular",
  },
  statusChip: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusChipText: {
    fontSize: prf(12),
    color: "#4B5563",
    fontFamily: "SF_Pro_Medium",
  },
  card: {
    borderWidth: 1,
    borderColor: "#F0F0F0",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    padding: 11,
  },
  cardTop: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  projectName: {
    flex: 1,
    fontSize: prf(15),
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Semibold",
  },
  statusBadge: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  statusText: { fontSize: prf(10.5), fontFamily: "SF_Pro_Semibold" },
  cardMeta: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: "48%",
  },
  metaText: {
    fontSize: prf(11.5),
    color: "#6B7280",
    fontFamily: "SF_Pro_Regular",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  emptyTitle: {
    marginTop: 8,
    fontSize: prf(15),
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Semibold",
  },
  emptyText: {
    marginTop: 4,
    fontSize: prf(12.5),
    color: "#9CA3AF",
    fontFamily: "SF_Pro_Regular",
    textAlign: "center",
    paddingHorizontal: 20,
  },
  retryBtn: {
    marginTop: 12,
    backgroundColor: "#00DEAB",
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  retryText: { color: "#fff", fontSize: prf(13), fontFamily: "SF_Pro_Semibold" },
  calOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  calPopup: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 8,
  },
  calHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingBottom: 6,
  },
  calTitle: {
    fontSize: prf(13),
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Semibold",
  },
  calClearText: {
    fontSize: prf(12),
    color: "#EF4444",
    fontFamily: "SF_Pro_Medium",
  },
});


