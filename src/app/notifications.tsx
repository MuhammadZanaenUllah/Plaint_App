import FilterModal from "@/components/FilterModal";
import ScreenHeader from "@/components/ScreenHeader";
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
import { useChat } from "@/hooks/useChat";
import { viewTask } from "@/services/api/tasks.service";
import { NotificationItem } from "@/types/chat.types";
import { getNotificationDisplay, getRoomDisplayName, getRoomInitials, isMentionNotification } from "@/utils/chatHelpers";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const PAGE_SIZE = 20;

type TabType = "all" | "unread" | "mentions";

const TYPE_OPTIONS = ["Chat", "Task", "Attendance", "System"] as const;
const TYPE_COLORS: Record<string, string> = {
  Chat: "#556EE6",
  Task: "#F59E0B",
  Attendance: "#10B981",
  System: "#6B7280",
};

export function getNotificationTypeLabel(item: NotificationItem): string {
  if (item.typ === "chat" || (item.typ ?? "").toLowerCase().includes("mention")) return "Chat";
  if (item.task_id && item.task_id !== 0) return "Task";
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
  const scrollViewHeight = useRef(0);

  const authState = useAuth();
  const companyId = authState.state?.company?.company_id ?? 0;
  const currentUserId = authState.state?.user?.id ?? 0;

  const { state: chatState, getOrCreateRoom } = useChat();
  const {
    state: notifState,
    fetchNotifications,
    markRead,
    markAllRead,
  } = useNotifications();

  const paginationKey = [
    activeTab,
    activeTypeFilter,
    activeStartDateFilter?.getTime() ?? "",
    activeEndDateFilter?.getTime() ?? "",
    notifState.notifications.length,
  ].join("|");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [prevPaginationKey, setPrevPaginationKey] = useState(paginationKey);
  if (paginationKey !== prevPaginationKey) {
    setPrevPaginationKey(paginationKey);
    setVisibleCount(PAGE_SIZE);
  }

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
      const isChatNotif =
        (item.typ ?? "").toLowerCase() === "chat" ||
        (item.typ ?? "").toLowerCase().includes("mention") ||
        (!item.task_id && item.title?.toLowerCase().includes("sent you a message"));

      if (isChatNotif) {
        const cb = Number(item.created_by) || 0;
        const asId = Number(item.assigned?.id) || 0;
        const ast = Number(item.assigned_to) || 0;

        let targetUserId = 0;
        if (cb > 0 && cb !== currentUserId) {
          targetUserId = cb;
        } else if (asId > 0 && asId !== currentUserId) {
          targetUserId = asId;
        } else if (ast > 0 && ast !== currentUserId) {
          targetUserId = ast;
        } else {
          targetUserId = cb || asId || ast;
        }

        const leadId = Number(item.lead_id) || 0;

        // 1. Check cached rooms
        let targetRoom = chatState.rooms.find(
          (r) =>
            (leadId > 0 && (r.id === leadId || r._id === String(leadId))) ||
            (targetUserId > 0 && r.type === "direct" && r.members.some((m) => m.id === targetUserId))
        );

        if (targetRoom) {
          const rId = targetRoom._id || (targetRoom.id ? String(targetRoom.id) : "");
          router.push({
            pathname: "/conversation",
            params: {
              roomId: rId,
              name: getRoomDisplayName(targetRoom, currentUserId),
              initials: getRoomInitials(targetRoom, currentUserId),
              isChannel: String(targetRoom.type === "channel"),
              roomType: targetRoom.type,
            },
          });
          return;
        }

        // 2. Create or fetch direct room
        if (targetUserId > 0) {
          try {
            const room = await getOrCreateRoom({
              type: "direct",
              targetId: targetUserId,
            });
            if (room) {
              const rId = room._id || (room.id ? String(room.id) : "");
              router.push({
                pathname: "/conversation",
                params: {
                  roomId: rId,
                  name: getRoomDisplayName(room, currentUserId),
                  initials: getRoomInitials(room, currentUserId),
                  isChannel: "false",
                  roomType: "direct",
                },
              });
              return;
            }
          } catch {
            // Fallback
          }
        }

        // 3. Fallback
        router.push({
          pathname: "/conversation",
          params: {
            roomId: leadId > 0 ? String(leadId) : undefined,
            name: getNotificationName(item),
            initials: getNotificationInitials(item),
            isChannel: "false",
            roomType: "direct",
          },
        });
      } else if (item.task_id && item.task_id !== 0) {
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
    [companyId, currentUserId, markRead, chatState.rooms, getOrCreateRoom],
  );

  const filteredNotifications = notifState.notifications
    .filter((item) => item != null && item.id != null)
    .filter((item) => {
      if (activeTab === "unread") return item.readed === 0;
      if (activeTab === "mentions") return isMentionNotification(item);
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

  // ── Client-side pagination (20 at a time, reveal more on scroll end) ─────
  const revealNextPage = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, filteredNotifications.length));
  }, [filteredNotifications.length]);

  const handleScrollEnd = useCallback(
    (e: {
      nativeEvent: {
        layoutMeasurement: { height: number };
        contentOffset: { y: number };
        contentSize: { height: number };
      };
    }) => {
      const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
      if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 40) {
        revealNextPage();
      }
    },
    [revealNextPage]
  );

  const handleContentSizeChange = useCallback(
    (width: number, height: number) => {
      // Auto-reveal when the filtered list doesn't fill the viewport (no scroll needed).
      if (scrollViewHeight.current > 0 && height <= scrollViewHeight.current) {
        revealNextPage();
      }
    },
    [revealNextPage]
  );

  const visibleNotifications = filteredNotifications.slice(0, visibleCount);

  const unreadCount = notifState.unreadCount;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
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
        <ScreenHeader
          title="Inbox"
          subtitle="All your notifications in one place."
          rightActions={
            <>

              <TouchableOpacity
                onPress={handleMarkAllRead}
                activeOpacity={0.7}
                disabled={unreadCount === 0}
                style={unreadCount === 0 && styles.markAllDisabled}
              >
                <Text style={styles.markReadText}>Mark all read</Text>
              </TouchableOpacity>


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
            </>
          }
        />
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
          onLayout={(e) => {
            scrollViewHeight.current = e.nativeEvent.layout.height;
          }}
          onContentSizeChange={handleContentSizeChange}
          onScroll={handleScrollEnd}
          scrollEventThrottle={16}
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
            visibleNotifications.map((item, index) => {
              const { name, message } = getNotificationDisplay(item);
              return (
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
                      {name}
                    </Text>
                    <Text style={styles.messageBody}>
                      {" "}
                      {message}
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
              );
            })
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
