import FilterModal from "@/components/FilterModal";
import {
  getNotificationInitials,
  getNotificationName,
} from "@/components/InboxModal";
import TaskDetailModal, {
  TaskDetail,
  buildTaskDetailFromViewTask,
} from "@/components/TaskDetailModal";
import Icons from "@/constants/icons";
import { useNotifications } from "@/context/NotificationContext";
import { useAuth } from "@/hooks/useAuth";
import { viewTask } from "@/services/api/tasks.service";
import { NotificationItem } from "@/types/chat.types";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const { FilterIconBlack } = Icons;

type TabType = "all" | "unread" | "mentions";

const TYPE_OPTIONS = ["Chat", "Task", "Attendance", "System"] as const;
const TYPE_COLORS: Record<string, string> = {
  Chat: "#556EE6",
  Task: "#F59E0B",
  Attendance: "#10B981",
  System: "#8E8E93",
};

export function getNotificationTypeLabel(item: NotificationItem): string {
  const typ = (item?.typ ?? "").toLowerCase();
  if (typ === "chat") return "Chat";
  if (typ === "task") return "Task";
  if (typ === "attendance") return "Attendance";
  return "System";
}

function formatFullDateTime(dateString: string): string {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "";
  const datePart = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timePart = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${datePart}, ${timePart}`;
}

export default function NotificationsScreen() {
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [selectedTask, setSelectedTask] = useState<TaskDetail | null>(null);
  const [filterVisible, setFilterVisible] = useState(false);
  const [activeTypeFilter, setActiveTypeFilter] = useState<string | null>(null);
  const [activeStartDateFilter, setActiveStartDateFilter] = useState<Date | null>(null);
  const [activeEndDateFilter, setActiveEndDateFilter] = useState<Date | null>(null);

  const authState = useAuth();
  const companyId = authState.state?.company?.company_id ?? 0;
  const {
    state: notifState,
    fetchNotifications,
    markRead,
    markAllRead,
  } = useNotifications();

  useEffect(() => {
    if (companyId) {
      fetchNotifications(companyId, true);
    }
  }, [companyId, fetchNotifications]);

  const handleMarkAllRead = useCallback(() => {
    if (companyId) {
      markAllRead(companyId);
    }
  }, [companyId, markAllRead]);

  const handleFilterApply = useCallback(
    (filters: {
      status: string | null;
      priority: string | null;
      startDate?: Date | null;
      endDate?: Date | null;
    }) => {
      setActiveTypeFilter(filters.status);
      setActiveStartDateFilter(filters.startDate ?? null);
      setActiveEndDateFilter(filters.endDate ?? null);
    },
    [],
  );

  const handleFilterReset = useCallback(() => {
    setActiveTypeFilter(null);
    setActiveStartDateFilter(null);
    setActiveEndDateFilter(null);
  }, []);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (activeTypeFilter) count++;
    if (activeStartDateFilter || activeEndDateFilter) count++;
    return count;
  }, [activeTypeFilter, activeStartDateFilter, activeEndDateFilter]);

  const handleItemPress = useCallback(
    async (item: NotificationItem) => {
      if (item.readed === 0) {
        markRead(item.id);
      }
      if (item.task_id && item.task_id !== 0) {
        try {
          const res = await viewTask(item.task_id, companyId);
          const detail = buildTaskDetailFromViewTask(res?.data, companyId);
          if (detail) {
            setSelectedTask(detail);
          }
        } catch {
          // silently fail
        }
      }
    },
    [companyId, markRead],
  );

  const filteredNotifications = notifState.notifications
    .filter((item) => item != null && item.id != null)
    .filter((item) => {
      if (activeTab === "unread") return item.readed === 0;
      if (activeTab === "mentions") return item.typ === "chat";
      return true;
    })
    .filter((item) => {
      if (activeTypeFilter && getNotificationTypeLabel(item) !== activeTypeFilter) {
        return false;
      }
      const createdAt = new Date(item.createdAt).getTime();
      if (activeStartDateFilter || activeEndDateFilter) {
        if (isNaN(createdAt)) return false;
        const startMs = activeStartDateFilter
          ? new Date(activeStartDateFilter).setHours(0, 0, 0, 0)
          : -Infinity;
        const endMs = activeEndDateFilter
          ? new Date(activeEndDateFilter).setHours(23, 59, 59, 999)
          : Infinity;
        if (createdAt < startMs || createdAt > endMs) return false;
      }
      return true;
    });

  const unreadCount = notifState.unreadCount;

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <FilterModal
          visible={filterVisible}
          onClose={() => setFilterVisible(false)}
          statuses={[...TYPE_OPTIONS]}
          statusColors={TYPE_COLORS}
          statusLabel="Type"
          showPriority={false}
          initialStatus={activeTypeFilter}
          initialStartDate={activeStartDateFilter}
          initialEndDate={activeEndDateFilter}
          onApply={handleFilterApply}
          onReset={handleFilterReset}
          loading={notifState.loading}
        />

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={8}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={24} color="#1D1D1D" />
          </TouchableOpacity>

          <View style={styles.titleCol}>
            <Text style={styles.title}>Inbox</Text>
            <Text style={styles.subtitle}>
              All your notifications in one place — tasks, mentions, comments,
              and messages.
            </Text>
          </View>
        </View>

        {/* Header actions */}
        <View style={styles.headerActionsRow}>
          <Pressable
            onPress={() => setFilterVisible(true)}
            style={({ pressed }) => [
              styles.filterBtn,
              pressed && styles.filterBtnPressed,
              activeFilterCount > 0 && styles.filterBtnActive,
            ]}
          >
            <FilterIconBlack
              width={18}
              height={18}
              color={activeFilterCount > 0 ? "#fff" : undefined}
            />
            {activeFilterCount > 0 ? (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            ) : null}
          </Pressable>

          <TouchableOpacity
            onPress={handleMarkAllRead}
            activeOpacity={0.7}
            disabled={unreadCount === 0}
            style={unreadCount === 0 && styles.markAllDisabled}
          >
            <Text style={styles.markReadText}>Mark all read</Text>
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[
              styles.tabButton,
              activeTab === "all" && styles.activeTabButton,
            ]}
            onPress={() => setActiveTab("all")}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "all" && styles.activeTabText,
              ]}
            >
              All
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabButton,
              activeTab === "unread" && styles.activeTabButton,
            ]}
            onPress={() => setActiveTab("unread")}
            activeOpacity={0.7}
          >
            <View style={styles.unreadTabContent}>
              <Text
                style={[
                  styles.tabText,
                  activeTab === "unread" && styles.activeTabText,
                ]}
              >
                Unread
              </Text>
              {unreadCount > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabButton,
              activeTab === "mentions" && styles.activeTabButton,
            ]}
            onPress={() => setActiveTab("mentions")}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "mentions" && styles.activeTabText,
              ]}
            >
              Mentions
            </Text>
          </TouchableOpacity>
        </View>

        {/* Notification List */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={styles.listScroll}
          contentContainerStyle={styles.listContent}
        >
          {notifState.loading ? (
            <View style={styles.emptyContainer}>
              <ActivityIndicator size="small" color="#00DEAB" />
            </View>
          ) : filteredNotifications.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons
                name="notifications-off-outline"
                size={32}
                color="#D1D5DB"
              />
              <Text style={styles.emptyText}>
                {activeTab === "unread"
                  ? "No Unread Message"
                  : "No notifications found."}
              </Text>
            </View>
          ) : (
            filteredNotifications.map((item, index) => (
              <Pressable
                key={`${item.id}-${index}`}
                style={styles.notificationRow}
                onPress={() => handleItemPress(item)}
              >
                {/* Unread dot */}
                <View style={styles.dotCol}>
                  {item.readed === 0 && <View style={styles.unreadDot} />}
                </View>

                {/* Avatar */}
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {getNotificationInitials(item)}
                  </Text>
                </View>

                {/* Info */}
                <View style={styles.infoCol}>
                  <Text style={styles.messageText} numberOfLines={2}>
                    <Text style={styles.senderName}>
                      {getNotificationName(item)}
                    </Text>
                    <Text style={styles.messageBody}>
                      {" "}
                      {(item.title ?? "")
                        .replace(getNotificationName(item), "")
                        .trim() || (item.title ?? "")}
                    </Text>
                  </Text>

                  <View style={styles.timeRow}>
                    <Ionicons
                      name="time-outline"
                      size={12}
                      color="#8E8E93"
                      style={styles.timeIcon}
                    />
                    <Text style={styles.timeText}>
                      {formatFullDateTime(item.createdAt)}
                    </Text>
                    <Text style={styles.timeText}> · </Text>
                    <Text style={styles.typeText}>
                      {getNotificationTypeLabel(item)}
                    </Text>
                  </View>
                </View>
              </Pressable>
            ))
          )}
        </ScrollView>
      </SafeAreaView>

      <TaskDetailModal
        visible={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        task={selectedTask}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#fff",
  },
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 32,
    justifyContent: "center",
  },
  titleCol: {
    flex: 1,
    marginHorizontal: 12,
  },
  title: {
    fontSize: 17,
    fontFamily: "SF_Pro_Semibold",
    color: "#1C1C1E",
  },
  subtitle: {
    marginTop: 2,
    fontSize: 11,
    fontFamily: "SF_Pro_Regular",
    color: "#8E8E93",
  },
  headerActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  filterBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "#E6E6E6",
    alignItems: "center",
    justifyContent: "center",
  },
  filterBtnPressed: {
    backgroundColor: "#00DEAB",
  },
  filterBtnActive: {
    backgroundColor: "#00DEAB",
  },
  filterBadge: {
    position: "absolute",
    top: -12,
    right: -12,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#1D1D1D",
    alignItems: "center",
    justifyContent: "center",
  },
  filterBadgeText: {
    fontSize: 9,
    fontFamily: "SF_Pro_Bold",
    color: "#0DDFAB",
  },
  markReadText: {
    fontSize: 12,
    fontFamily: "SF_Pro_Semibold",
    color: "#556EE6",
  },
  markAllDisabled: {
    opacity: 0.4,
  },
  tabsContainer: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5EA",
    marginBottom: 4,
  },
  tabButton: {
    minWidth: "33%",
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    marginBottom: -1,
  },
  activeTabButton: {
    borderBottomColor: "#00DEAB",
    borderRadius: 10,
  },
  tabText: {
    fontSize: 13,
    textAlign: "center",
    fontFamily: "SF_Pro_Medium",
    color: "#8E8E93",
  },
  activeTabText: {
    color: "#1C1C1E",
    fontFamily: "SF_Pro_Semibold",
  },
  unreadTabContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  unreadBadge: {
    backgroundColor: "#00DEAB",
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    marginLeft: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "SF_Pro_Bold",
  },
  listScroll: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 24,
  },
  emptyContainer: {
    paddingVertical: 80,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  emptyText: {
    fontSize: 14,
    color: "#8E8E93",
    fontFamily: "SF_Pro_Medium",
  },
  notificationRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  dotCol: {
    width: 14,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#00DEAB",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: "#00DEAB",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "SF_Pro_Bold",
  },
  infoCol: {
    flex: 1,
    marginLeft: 10,
  },
  messageText: {
    fontSize: 12.5,
    lineHeight: 16,
  },
  senderName: {
    fontFamily: "SF_Pro_Semibold",
    color: "#1C1C1E",
  },
  messageBody: {
    fontFamily: "SF_Pro_Regular",
    color: "#48484A",
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
  },
  timeIcon: {
    marginRight: 3,
  },
  timeText: {
    fontSize: 10.5,
    fontFamily: "SF_Pro_Regular",
    color: "#8E8E93",
  },
  typeText: {
    fontSize: 10.5,
    fontFamily: "SF_Pro_Semibold",
    color: "#00DEAB",
  },
});
