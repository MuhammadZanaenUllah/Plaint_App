import Icons from "@/constants/icons";
import { useSearch } from "@/context/SearchContext";
import { useAuth } from "@/hooks/useAuth";
import {
  getPushNotificationSettings,
  updatePushNotificationSettings,
} from "@/services/api/push.service";
import { viewTask } from "@/services/api/tasks.service";
import { NotificationItem } from "@/types/chat.types";
import { showInfo } from "@/utils/toast";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import {
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInDown, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Avatar from "./Avatar";
import InboxModal from "./InboxModal";
import TaskDetailModal, {
  TaskDetail,
  buildTaskDetailFromViewTask,
} from "./TaskDetailModal";

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
  const insets = useSafeAreaInsets();
  const menuTopPosition = Math.max(insets.top + 60, 70);
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
        const res = await updatePushNotificationSettings({
          push_enabled: value,
        });
        setPushEnabled(res?.settings?.push_enabled ?? value);
      } catch {
        setPushEnabled(prev);
        showInfo(
          "Notifications",
          "Could not update push notification settings.",
        );
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
    <Pressable
      style={styles.headerContainer}
      onPress={() => {
        Keyboard.dismiss();
        if (searchOpen) setSearchOpen(false);
      }}
    >
      <View style={styles.header}>
        <View style={{ flexDirection: "column", width: "70%" }}>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.subGreeting}>{subGreeting}</Text>
        </View>

        <View style={styles.headerRight}>
          {showSearch && !forceSearchOpen && (
            <TouchableOpacity
              onPress={() => setSearchOpen(!searchOpen)}
              hitSlop={8}
            >
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
            <Avatar
              name={`${authState.user?.first_name ?? ""} ${authState.user?.last_name ?? ""}`}
              imagePath={authState.user?.image}
              size={30}
              borderRadius={5}
              backgroundColor="#1D1D1D"
            />
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={showProfileMenu}
        transparent
        animationType="none"
        onRequestClose={() => setShowProfileMenu(false)}
      >
        <Pressable
          style={styles.menuOverlay}
          onPress={() => setShowProfileMenu(false)}
        >
          <View style={[styles.profileMenu, { top: menuTopPosition }]}>
            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.75}
              onPress={() => {
                setShowProfileMenu(false);
                router.push("/settings");
              }}
            >
              <Ionicons name="settings-outline" size={18} color="#6B7280" />
              <Text style={styles.menuText}>App Settings</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
              <MaterialCommunityIcons name="logout" size={18} color="#6B7280" />
              <Text style={styles.menuText}>Sign out</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

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
    paddingVertical: 4,
    height: 34,
    gap: 4,
    alignItems: "center",
    backgroundColor: "#fff",
    marginBottom: 6,
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 34,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: "#111827",
    fontFamily: "SF_Pro_Regular",
    padding: 0,
  },
  filterBtn: {
    width: 30,
    height: 30,
    borderRadius: 7,
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
    paddingTop: 8,
    paddingBottom: 6,
  },
  greeting: {
    fontSize: 15,
    fontFamily: "SF_Pro_Semibold",
    color: "#111827",
  },
  subGreeting: {
    fontSize: 11,
    color: "#6B7280",
    fontFamily: "SF_Pro_Regular",
    marginTop: 1,
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
  menuOverlay: {
    flex: 1,
    backgroundColor: "transparent",
  },
  profileMenu: {
    position: "absolute",
    top: 120,
    right: 16,
    width: 150,
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
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
