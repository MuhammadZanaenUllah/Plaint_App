import Icons from "@/constants/icons";
import { useAuth } from "@/hooks/useAuth";
import { useSearch } from "@/context/SearchContext";
import { viewTask } from "@/services/api/tasks.service";
import {
  getPushNotificationSettings,
  updatePushNotificationSettings,
} from "@/services/api/push.service";
import { showInfo } from "@/utils/toast";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInDown, FadeOutUp } from "react-native-reanimated";
import InboxModal from "./InboxModal";
import TaskDetailModal, {
  TaskDetail,
  buildTaskDetailFromViewTask,
} from "./TaskDetailModal";
import { NotificationItem } from "@/types/chat.types";

const { BellIcon, FilterIcon, FilterIconBlack } = Icons;

type AppHeaderProps = {
  greeting: string;
  subGreeting: string;
  placeholder?: string;
  showSearch?: boolean;
  showFilter?: boolean;
  forceSearchOpen?: boolean;
  onFilterPress?: () => void;
};

export default function AppHeader({
  greeting,
  subGreeting,
  showSearch = false,
  showFilter = false,
  placeholder = "Search...",
  forceSearchOpen = false,
  onFilterPress,
}: AppHeaderProps) {
  const { state: authState, logout } = useAuth();
  const { setSearchText } = useSearch();
  const [searchOpen, setSearchOpen] = useState(false);
  const isSearchVisible = forceSearchOpen || searchOpen;
  const [search, setSearch] = useState("");
  const [inboxOpen, setInboxOpen] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskDetail | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSettingsLoading, setPushSettingsLoading] = useState(false);

  const handleSearchChange = (text: string) => {
    setSearch(text);
    setSearchText(text);
  };

  const userInitials = (() => {
    const user = authState.user;
    if (!user) return "U";
    return ((user.first_name?.[0] ?? "") + (user.last_name?.[0] ?? "")).toUpperCase();
  })();

  const handleLogout = async () => {
    setShowProfileMenu(false);
    await logout();
    router.replace("/(auth)/login");
  };

  const openProfileMenu = useCallback(async () => {
    setShowProfileMenu(true);
    setPushSettingsLoading(true);
    try {
      const res = await getPushNotificationSettings();
      setPushEnabled(res?.settings?.push_enabled ?? false);
    } catch {
      setPushEnabled(false);
    } finally {
      setPushSettingsLoading(false);
    }
  }, []);

  const handlePushToggle = useCallback(
    async (value: boolean) => {
      const prev = pushEnabled;
      setPushEnabled(value);
      try {
        const res = await updatePushNotificationSettings({ push_enabled: value });
        setPushEnabled(res?.settings?.push_enabled ?? value);
      } catch {
        setPushEnabled(prev);
        showInfo("Notifications", "Could not update push notification settings.");
      }
    },
    [pushEnabled],
  );

  const handleNotificationPress = useCallback(
    async (item: NotificationItem) => {
      if (!item.task_id || item.task_id === 0) return;
      const companyId = authState.company?.company_id ?? 0;
      try {
        const res = await viewTask(item.task_id, companyId);
        const detail = buildTaskDetailFromViewTask(res?.data, companyId);
        if (detail) {
          setSelectedTask(detail);
        }
      } catch {
        // silently fail — just mark read + close the popup
      }
    },
    [authState.company?.company_id],
  );

  const handleViewAll = useCallback(() => {
    setInboxOpen(false);
    router.push("/notifications");
  }, []);

  return (
    <Pressable style={styles.headerContainer} onPress={() => searchOpen && setSearchOpen(false)}>
      <View style={styles.header}>
        <View style={{ flexDirection: "column", width: "70%" }}>
          <Text style={styles.greeting} >{greeting}</Text>
          <Text style={styles.subGreeting}>{subGreeting}</Text>
        </View>

        <View style={styles.headerRight}>
          {showSearch && !forceSearchOpen && (
            <TouchableOpacity onPress={() => setSearchOpen(!searchOpen)} hitSlop={8}>
              <Ionicons name="search-outline" size={22} color="#000000" />
            </TouchableOpacity>
          )}

          
          <TouchableOpacity
            style={styles.bellWrap}
            activeOpacity={0.75}
            onPress={() => setInboxOpen(true)}
          >
            <BellIcon />
            <View style={styles.bellDot} />
          </TouchableOpacity>

          <TouchableOpacity onPress={openProfileMenu}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{userInitials}</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {showProfileMenu && (
        <>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setShowProfileMenu(false)}
          />

          <View style={styles.profileMenu}>
            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.75}
              onPress={() => setShowProfileMenu(false)}
            >
              <Ionicons name="notifications-outline" size={18} color="#6B7280" />
              <Text style={styles.menuText}>Push Notifications</Text>
              <Switch
                value={pushEnabled}
                onValueChange={handlePushToggle}
                disabled={pushSettingsLoading}
                trackColor={{ false: "#D1D5DB", true: "#00DEAB" }}
                thumbColor="#fff"
                style={{ marginLeft: "auto", transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleLogout}
            >
              <MaterialCommunityIcons
                name="logout"
                size={18}
                color="#6B7280"
              />

              <Text style={styles.menuText}>Sign out</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {showSearch && isSearchVisible && (
        <Animated.View
          entering={FadeInDown.duration(220)}
          exiting={FadeOutUp.duration(180)}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={styles.searchRow}>
              <View style={styles.searchBox}>
                <Ionicons name="search-outline" size={18} color="#9CA3AF" />
                <TextInput
                  style={styles.searchInput}
                  placeholder={placeholder}
                  placeholderTextColor="#9CA3AF"
                  value={search}
                  onChangeText={handleSearchChange}
                  // autoFocus
                />
              </View>
              {showFilter && (
                <Pressable
                  onPress={onFilterPress}
                  style={({ pressed }) => [
                    styles.filterBtn,
                    pressed && styles.filterBtnPressed,
                  ]}
                >
                  {({ pressed }) =>
                    pressed ? <FilterIconBlack /> : <FilterIcon />
                  }
                </Pressable>
              )}
            </View>
          </Pressable>
        </Animated.View>
      )}

      <InboxModal
        visible={inboxOpen}
        onClose={() => setInboxOpen(false)}
        onNotificationPress={handleNotificationPress}
        onViewAll={handleViewAll}
      />
      <TaskDetailModal
        visible={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        task={selectedTask}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    zIndex: 99999,
    backgroundColor: "#fff",
    overflow: "visible",
  },
  searchRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#E6E6E6",
    borderRadius: 10,
    marginHorizontal: 16,
    paddingRight: 2,
    paddingVertical: 12,
    height: 40,
    gap: 4,
    alignItems: "center",
    backgroundColor: "#fff",
    marginBottom: 12,
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#111827",
    fontFamily: "SF_Pro_Regular",
    padding: 0,
  },
  filterBtn: {
    width: 35,
    height: 35,
    borderRadius: 8,
    backgroundColor: "#E6E6E6",
    alignItems: "center",
    justifyContent: "center",
  },
  filterBtnPressed: {
    backgroundColor: "#00DEAB",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 15,
  },
  greeting: {
    fontSize: 18,
    fontFamily: "SF_Pro_Semibold",
    color: "#111827",
  },
  subGreeting: {
    fontSize: 12,
    color: "#6B7280",
    fontFamily: "SF_Pro_Regular",
    marginTop: 2,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  bellWrap: {
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  bellDot: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#00DEAB",
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 5,
    backgroundColor: "#1D1D1D",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: "#fff",
    fontFamily: "SF_Pro_Bold",
    fontSize: 12,
  },
  profileMenu: {
    position: "absolute",
    top: 70,
    right: 16,
    width: 208,
    backgroundColor: "#fff",
    borderRadius: 4,
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 999,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  menuText: {
    marginLeft: 5,
    fontSize: 12,
    color: "#212529",
    fontFamily: "SF_Pro_Medium",
  },
});
