import ScreenHeader from "@/components/ScreenHeader";
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
import { formatTaskDueDatePkt } from "@/features/tasks/utils/taskDate";
import { useAuth } from "@/hooks/useAuth";
import { rf } from "@/utils/responsive";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
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
    isLoading,
    error,
    loadProjects,
    loadProjectUsers,
  } = useProjectsStore();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [ownerFilter, setOwnerFilter] = useState<number | null>(null);
  const [ownerFilterOpen, setOwnerFilterOpen] = useState(false);
  const [createVisible, setCreateVisible] = useState(false);

  useEffect(() => {
    if (!companyId || !canView) return;
    loadProjects(companyId).catch(() => {});
    loadProjectUsers(companyId).catch(() => {});
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
    return projects.filter((project) => {
      if (statusFilter !== "All" && project.status !== statusFilter) return false;
      if (ownerFilter !== null && Number(project.owner) !== ownerFilter) return false;
      if (query && !project.name.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [ownerFilter, projects, search, statusFilter]);

  const ownerLabel =
    ownerFilter === null ? "All owners" : ownerNames.get(ownerFilter) ?? "Owner";

  const renderProject = useCallback(
    ({ item }: { item: ProjectEntity }) => {
      const colors = projectStatusStyle(item.status);
      const due = item.due_date ? formatTaskDueDatePkt(item.due_date) : "—";
      const owner =
        item.owner !== undefined && item.owner !== null
          ? ownerNames.get(Number(item.owner)) ?? `User #${item.owner}`
          : "Unassigned";
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
              <Ionicons name="list-outline" size={13} color="#9CA3AF" />
              <Text style={styles.metaText}>{taskCount} tasks</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="person-outline" size={13} color="#9CA3AF" />
              <Text style={styles.metaText} numberOfLines={1}>
                {owner}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="calendar-outline" size={13} color="#9CA3AF" />
              <Text style={styles.metaText}>{due}</Text>
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
            Your account does not have the project-list permission.
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
          canCreate ? (
            <TouchableOpacity onPress={() => setCreateVisible(true)} hitSlop={8}>
              <Ionicons name="add-circle" size={26} color="#00DEAB" />
            </TouchableOpacity>
          ) : undefined
        }
      />

      <Pressable style={styles.body} onPress={Keyboard.dismiss}>
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={17} color="#9CA3AF" />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search projects..."
              placeholderTextColor="#9CA3AF"
            />
          </View>
          <TouchableOpacity
            style={styles.ownerBtn}
            onPress={() => setOwnerFilterOpen((prev) => !prev)}
          >
            <Ionicons name="person-outline" size={15} color="#6B7280" />
            <Text style={styles.ownerBtnText} numberOfLines={1}>
              {ownerLabel}
            </Text>
            <Ionicons
              name={ownerFilterOpen ? "chevron-up" : "chevron-down"}
              size={14}
              color="#6B7280"
            />
          </TouchableOpacity>
        </View>

        {ownerFilterOpen && (
          <View style={styles.ownerDropdown}>
            <TouchableOpacity
              style={styles.ownerOption}
              onPress={() => {
                setOwnerFilter(null);
                setOwnerFilterOpen(false);
              }}
            >
              <Text style={styles.ownerOptionText}>All owners</Text>
            </TouchableOpacity>
            {projectUsers.map((owner) => (
              <TouchableOpacity
                key={owner.id}
                style={styles.ownerOption}
                onPress={() => {
                  setOwnerFilter(owner.id);
                  setOwnerFilterOpen(false);
                }}
              >
                <Text style={styles.ownerOptionText}>
                  {`${owner.first_name ?? ""} ${owner.last_name ?? ""}`.trim() ||
                    `User #${owner.id}`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

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

        {isLoading && projects.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color="#00DEAB" />
          </View>
        ) : error && projects.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>Could not load projects</Text>
            <Text style={styles.emptyText}>{error}</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => loadProjects(companyId).catch(() => {})}
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
            contentContainerStyle={{ paddingBottom: 32, gap: 10 }}
            ListEmptyComponent={
              <View style={styles.center}>
                <Ionicons name="folder-open-outline" size={34} color="#D1D5DB" />
                <Text style={styles.emptyTitle}>No projects found</Text>
                <Text style={styles.emptyText}>
                  Try a different status, owner or search.
                </Text>
              </View>
            }
          />
        )}
      </Pressable>

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
  searchRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
  },
  searchInput: {
    flex: 1,
    fontSize: rf(14),
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Regular",
    padding: 0,
  },
  ownerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 10,
    maxWidth: 150,
  },
  ownerBtnText: {
    fontSize: rf(12),
    color: "#4B5563",
    fontFamily: "SF_Pro_Medium",
    flexShrink: 1,
  },
  ownerDropdown: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    maxHeight: 180,
    marginBottom: 8,
    overflow: "hidden",
  },
  ownerOption: { paddingHorizontal: 12, paddingVertical: 10 },
  ownerOptionText: {
    fontSize: rf(13),
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Regular",
  },
  statusRow: { flexGrow: 0, marginBottom: 10 },
  statusChip: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusChipText: {
    fontSize: rf(12),
    color: "#4B5563",
    fontFamily: "SF_Pro_Medium",
  },
  card: {
    borderWidth: 1,
    borderColor: "#F0F0F0",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    padding: 14,
  },
  cardTop: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  projectName: {
    flex: 1,
    fontSize: rf(15),
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Semibold",
  },
  statusBadge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: rf(10.5), fontFamily: "SF_Pro_Semibold" },
  cardMeta: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 10 },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: "48%",
  },
  metaText: {
    fontSize: rf(11.5),
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
    fontSize: rf(15),
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Semibold",
  },
  emptyText: {
    marginTop: 4,
    fontSize: rf(12.5),
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
  retryText: { color: "#fff", fontSize: rf(13), fontFamily: "SF_Pro_Semibold" },
});


