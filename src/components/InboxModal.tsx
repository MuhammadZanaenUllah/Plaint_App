import { useNotifications } from "@/context/NotificationContext";
import { useAuth } from "@/hooks/useAuth";
import { useChat } from "@/hooks/useChat";
import { NotificationItem } from "@/types/chat.types";
import { getRoomDisplayName, getRoomInitials, isMentionNotification } from "@/utils/chatHelpers";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface InboxModalProps {
  visible: boolean;
  onClose: () => void;
  onNotificationPress?: (item: NotificationItem) => void;
  onViewAll?: () => void;
}

type TabType = "all" | "unread" | "mentions";

export function formatNotificationTime(dateString: string): string {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function getNotificationInitials(item: NotificationItem): string {
  const assigned = item?.assigned;
  if (assigned) {
    const first = assigned.first_name?.[0] ?? "";
    const last = assigned.last_name?.[0] ?? "";
    return (first + last).toUpperCase() || "SY";
  }
  return "SY";
}

export function getNotificationName(item: NotificationItem): string {
  const assigned = item?.assigned;
  if (assigned) {
    return `${assigned.first_name ?? ""} ${assigned.last_name ?? ""}`.trim() || "System";
  }
  return "System";
}

export default function InboxModal({
  visible,
  onClose,
  onNotificationPress,
  onViewAll,
}: InboxModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const authState = useAuth();
  const companyId = authState?.state?.company?.company_id ?? 0;
  const currentUserId = authState?.state?.user?.id ?? 0;

  const { state: chatState, fetchRooms, getOrCreateRoom } = useChat();
  const {
    state: notifState,
    fetchNotifications,
    markRead,
    markAllRead,
  } = useNotifications();

  useEffect(() => {
    if (visible) {
      if (companyId) {
        fetchNotifications(companyId, true);
      }
      fetchRooms().catch(() => {});
    }
  }, [visible, companyId, fetchNotifications, fetchRooms]);

  const handleMarkAllRead = useCallback(() => {
    if (companyId) {
      markAllRead(companyId);
    }
  }, [companyId, markAllRead]);

  const handleItemPress = useCallback(
    async (item: NotificationItem) => {
      if (item.readed === 0) {
        markRead(item.id);
      }
      onClose();

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
        onNotificationPress?.(item);
      }
    },
    [currentUserId, markRead, onClose, onNotificationPress, chatState.rooms, getOrCreateRoom],
  );

  const filteredNotifications = notifState.notifications
    .filter((item) => item != null && item.id != null)
    .filter((item) => {
      if (activeTab === "unread") return item.readed === 0;
      if (activeTab === "mentions") return isMentionNotification(item);
      return true;
    });

  const displayNotifications = filteredNotifications.slice(0, 3);

  const unreadCount = notifState.unreadCount;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={styles.popup}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Inbox</Text>
            <View style={styles.headerActions}>
              {unreadCount > 0 && (
                <TouchableOpacity
                  onPress={handleMarkAllRead}
                  activeOpacity={0.7}
                >
                  <Text style={styles.markReadText}>Mark all read</Text>
                </TouchableOpacity>
              )}
              {unreadCount > 0 && <View style={styles.actionDivider} />}
              <TouchableOpacity
                onPress={() => {
                  onClose();
                  onViewAll?.();
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.viewAllText}>View All</Text>
              </TouchableOpacity>
            </View>
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
            ) : displayNotifications.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons
                  name="notifications-off-outline"
                  size={28}
                  color="#D1D5DB"
                />
                <Text style={styles.emptyText}>
                  {activeTab === "unread"
                    ? "No Unread Message"
                    : "No notifications found."}
                </Text>
              </View>
            ) : (
              displayNotifications.map((item, index) => (
                <TouchableOpacity
                  key={`${item.id}-${index}`}
                  style={styles.notificationRow}
                  activeOpacity={0.7}
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
                        {formatNotificationTime(item.createdAt)}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "flex-end",
  },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.15)",
  },
  popup: {
    width: 280,
    maxWidth: "80%",
    backgroundColor: "#fff",
    borderRadius: 12,
    marginTop: 100,
    marginRight: 45,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 6,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    maxHeight: 250,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  title: {
    fontSize: 15,
    fontFamily: "SF_Pro_Medium",
    color: "#1C1C1E",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  markReadText: {
    fontSize: 11.5,
    fontFamily: "SF_Pro_Semibold",
    color: "#556EE6",
  },
  actionDivider: {
    width: 1,
    height: 12,
    backgroundColor: "#E5E5EA",
    marginHorizontal: 8,
  },
  viewAllText: {
    fontSize: 11.5,
    fontFamily: "SF_Pro_Semibold",
    color: "#00DEAB",
  },
  tabsContainer: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5EA",
    marginBottom: 4,
  },
  tabButton: {
    minWidth: "33%",
    paddingVertical: 6,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    marginBottom: -1,
  },
  activeTabButton: {
    borderBottomColor: "#00DEAB",
    borderRadius: 10,
  },
  tabText: {
    fontSize: 11.5,
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
    marginLeft: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontFamily: "SF_Pro_Bold",
  },
  listScroll: {
    maxHeight: 250,
  },
  listContent: {
    paddingBottom: 8,
  },
  emptyContainer: {
    paddingVertical: 32,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    color: "#8E8E93",
    fontFamily: "SF_Pro_Medium",
  },
  notificationRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
  },
  dotCol: {
    width: 14,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  unreadDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#00DEAB",
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 3,
    backgroundColor: "#00DEAB",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "SF_Pro_Bold",
  },
  infoCol: {
    flex: 1,
    marginLeft: 6,
  },
  messageText: {
    fontSize: 11,
    lineHeight: 14,
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
    marginTop: 2,
  },
  timeIcon: {
    marginRight: 3,
  },
  timeText: {
    fontSize: 9.5,
    fontFamily: "SF_Pro_Regular",
    color: "#8E8E93",
  },
});
