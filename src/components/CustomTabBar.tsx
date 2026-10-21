import Icons from "@/constants/icons";
import { triggerHaptic } from "@/utils/haptics";
import { Ionicons } from "@expo/vector-icons";
import { BottomTabBarProps } from "expo-router/js-tabs";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { Keyboard, Pressable, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
// PROJECT MODULE DISABLED — the Projects Quick Menu depended on these hooks
// import { useAuth } from "@/hooks/useAuth";
// import { useChat } from "@/hooks/useChat";
// import { useProjects } from "@/hooks/useProjects";
// import { canAccessProjectsQuickMenu } from "@/utils/permissions";
// import { getRoomDisplayName } from "@/utils/chatHelpers";
// import { Project, ProjectStatus } from "@/types/project.types";
// import ProjectQuickMenuModal from "@/components/ProjectQuickMenuModal";
// import ProjectDetailModal from "@/components/ProjectDetailModal";

const {
  ChatBlackIcon: ChatIconBlack,
  ChatWhiteIcon: ChatIconWhite,
  HomeBlackIcon: HomeIconBlack,
  HomeWhiteIcon: HomeIconWhite,
  LeaveBlackIcon: LeaveIconBlack,
  LeaveWhiteIcon: LeaveIconWhite,
  PEBlackIcon: PEIconBlack,
  PEWhiteIcon: PEIconWhite,
  TaskBlackIcon: TaskIconBlack,
  TaskWhiteIcon: TaskIconsWhite,
} = Icons;

type TabItem = {
  name: string;
} & (
  | {
      activeIcon: React.ComponentType<any>;
      inactiveIcon: React.ComponentType<any>;
      ionicon?: undefined;
    }
  | {
      activeIcon?: undefined;
      inactiveIcon?: undefined;
      ionicon: React.ComponentProps<typeof Ionicons>["name"];
    }
);

const TABS: TabItem[] = [
  {
    name: "tasks",
    activeIcon: TaskIconBlack,
    inactiveIcon: TaskIconsWhite,
  },
  {
    name: "chat",
    activeIcon: ChatIconBlack,
    inactiveIcon: ChatIconWhite,
  },
];

const SPRING_CONFIG = {
  damping: 17,
  stiffness: 190,
  mass: 0.7,
};

export default function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [tabPositions, setTabPositions] = useState<Record<number, number>>({});

  const indicatorX = useSharedValue(14);

  const currentRoute = state.routes[state.index]?.name.toLowerCase();
  const activeIndex = Math.max(
    0,
    TABS.findIndex((t) => t.name.toLowerCase() === currentRoute)
  );

  useEffect(() => {
    const showKeyboard = Keyboard.addListener("keyboardDidShow", () => {
      setKeyboardVisible(true);
    });

    const hideKeyboard = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardVisible(false);
    });

    return () => {
      showKeyboard.remove();
      hideKeyboard.remove();
    };
  }, []);

  // Slide the indicator pill smoothly to the active tab position
  useEffect(() => {
    if (tabPositions[activeIndex] !== undefined) {
      indicatorX.value = withSpring(tabPositions[activeIndex], SPRING_CONFIG);
    }
  }, [activeIndex, tabPositions]);

  const indicatorAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
  }));

  if (keyboardVisible) {
    return <View style={{ height: 0 }} />;
  }

  // PROJECT MODULE DISABLED — the Projects Quick Menu (long-press on the Tasks
  // tab) and everything it depends on is commented out below.
  // const { state: authState } = useAuth();
  // const { state: chatState, fetchRooms } = useChat();
  // const { state: projectState, fetchProjects } = useProjects();

  // const [quickMenuVisible, setQuickMenuVisible] = useState(false);
  // const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  // const currentUser = authState.user;
  // const currentUserId = currentUser?.id ?? 0;
  // const hasQuickMenuPermission = canAccessProjectsQuickMenu(currentUser);

  // Projects list matching what is shown in the Projects tab of chat module
  // const projectList = useMemo<Project[]>(() => {
  //   if (!hasQuickMenuPermission) return [];

  //   const projectMetaByName = new Map<string, Project>();
  //   for (const p of projectState.projects ?? []) {
  //     projectMetaByName.set(p.name, p);
  //   }

  //   const rooms = chatState.rooms ?? [];
  //   const projectRooms = rooms.filter((r) => r.type === "project");

  //   if (projectRooms.length > 0) {
  //     return projectRooms.map((room) => {
  //       const displayName = getRoomDisplayName(room, currentUserId);
  //       const meta = projectMetaByName.get(displayName);
  //       return (
  //         meta ?? {
  //           id: room.id,
  //           name: displayName,
  //           status: "Planning" as ProjectStatus,
  //         }
  //       );
  //     });
  //   }

  //   // Fallback directly to projects list if rooms haven't loaded yet
  //   return projectState.projects ?? [];
  // }, [
  //   hasQuickMenuPermission,
  //   chatState.rooms,
  //   projectState.projects,
  //   currentUserId,
  // ]);

  // const handleTaskLongPress = () => {
  //   if (!hasQuickMenuPermission) return;
  //   triggerHaptic("medium");
  //   // Ensure fresh project list
  //   fetchProjects({ silent: true }).catch(() => {});
  //   fetchRooms().catch(() => {});
  //   setQuickMenuVisible(true);
  // };

  // const handleSelectProject = (project: Project) => {
  //   setQuickMenuVisible(false);
  //   setSelectedProject(project);
  // };

  // const handleCloseProjectDetail = () => {
  //   setSelectedProject(null);
  // };

  return (
    <>
      <View style={styles.container}>
        <View style={styles.bar}>
          {/* Sliding Instagram-style White Active Pill */}
          {tabPositions[activeIndex] !== undefined && (
            <Animated.View style={[styles.slidingPill, indicatorAnimStyle]} />
          )}

          {TABS.map((tab, i) => {
            const focused = currentRoute === tab.name.toLowerCase();
            // PROJECT MODULE DISABLED (was used to open the Projects Quick Menu)
            // const isTaskTab = tab.name.toLowerCase() === "tasks";
            return (
              <Pressable
                key={tab.name}
                style={styles.tabItem}
                onLayout={(e) => {
                  const x = e.nativeEvent.layout.x;
                  setTabPositions((prev) => ({ ...prev, [i]: x }));
                }}
                onPress={() => {
                  triggerHaptic("selection");
                  if (tab.name === "test-sheet") {
                    router.push("/test-sheet");
                  } else {
                    navigation.navigate(tab.name);
                  }
                }}
                // PROJECT MODULE DISABLED (Projects Quick Menu on Tasks long-press)
                // onLongPress={isTaskTab ? handleTaskLongPress : undefined}
                delayLongPress={280}
                hitSlop={{ top: 10, bottom: 10, left: 15, right: 15 }}
              >
                <View style={styles.iconContainer}>
                  {tab.activeIcon ? (
                    focused ? (
                      <tab.activeIcon width={20} height={20} />
                    ) : (
                      <tab.inactiveIcon width={20} height={20} />
                    )
                  ) : (
                    <Ionicons
                      name={tab.ionicon!}
                      size={20}
                      color={focused ? "#000" : "#fff"}
                    />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* PROJECT MODULE DISABLED
      // Animated Projects Quick Menu
      <ProjectQuickMenuModal
        visible={quickMenuVisible}
        projects={projectList}
        onClose={() => setQuickMenuVisible(false)}
        onSelectProject={handleSelectProject}
      />

      // Project Detail Modal
      <ProjectDetailModal
        visible={!!selectedProject}
        project={selectedProject}
        onClose={handleCloseProjectDetail}
        onProjectUpdated={() => {
          fetchProjects({ silent: true }).catch(() => {});
          fetchRooms().catch(() => {});
        }}
      />
      */}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 20,
    alignSelf: "center",
  },
  bar: {
    position: "relative",
    flexDirection: "row",
    backgroundColor: "#000",
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 7,
    gap: 28,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  slidingPill: {
    position: "absolute",
    left: 0,
    top: 7,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#fff",
    zIndex: 1,
  },
  tabItem: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  iconContainer: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
});
