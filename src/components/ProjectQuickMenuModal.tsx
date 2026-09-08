import { Project } from "@/types/project.types";
import { triggerHaptic } from "@/utils/haptics";
import { rf } from "@/utils/responsive";
import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

type Props = {
  visible: boolean;
  onClose: () => void;
  projects: Project[];
  onSelectProject: (project: Project) => void;
};

export default function ProjectQuickMenuModal({
  visible,
  onClose,
  projects,
  onSelectProject,
}: Props) {
  const scale = useSharedValue(0.75);
  const translateY = useSharedValue(20);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      scale.value = withSpring(1, { damping: 16, stiffness: 240, mass: 0.7 });
      translateY.value = withSpring(0, {
        damping: 16,
        stiffness: 240,
        mass: 0.7,
      });
      opacity.value = withTiming(1, { duration: 160 });
    } else {
      scale.value = withTiming(0.8, { duration: 130 });
      translateY.value = withTiming(15, { duration: 130 });
      opacity.value = withTiming(0, { duration: 130 });
    }
  }, [visible]);

  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
    opacity: opacity.value,
  }));

  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        {/* Backdrop dismiss */}
        <Pressable style={styles.backdrop} onPress={onClose} />

        {/* Compact Popover Menu anchored right above the custom tab bar */}
        <Animated.View style={[styles.menuContainer, animatedCardStyle]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconContainer}>
                <Ionicons name="folder" size={15} color="#00DEAB" />
              </View>
              <Text style={styles.headerTitle}>Projects</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{projects.length}</Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.closeBtn}
            >
              <Ionicons name="close" size={15} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {/* Project List */}
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            bounces={true}
          >
            {projects.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons
                  name="folder-open-outline"
                  size={26}
                  color="#D1D5DB"
                />
                <Text style={styles.emptyText}>No projects found</Text>
              </View>
            ) : (
              projects.map((proj, index) => {
                return (
                  <TouchableOpacity
                    key={proj.id || index}
                    style={styles.projectItem}
                    activeOpacity={0.65}
                    onPress={() => {
                      triggerHaptic("selection");
                      onSelectProject(proj);
                    }}
                  >
                    <View style={styles.projectIconBox}>
                      <Ionicons
                        name="folder-outline"
                        size={14}
                        color="#1D1D1D"
                      />
                    </View>

                    <Text style={styles.projectName} numberOfLines={1}>
                      {proj.name}
                    </Text>

                    <Ionicons
                      name="chevron-forward"
                      size={14}
                      color="#9CA3AF"
                      style={styles.chevron}
                    />
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>

          {/* Arrow notch pointing down toward the tab bar */}
          <View style={styles.bottomNotch} />
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    paddingBottom: 72, // Snugly docked right above the floating tab bar
  },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  menuContainer: {
    width: Math.min(SCREEN_WIDTH * 0.78, 300), // Compact from all sides
    maxHeight: SCREEN_HEIGHT * 0.38,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 10,
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.06)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: "#E6FBF5",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: rf(14),
    fontFamily: "SF_Pro_Semibold",
    color: "#111827",
  },
  badge: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 10,
  },
  badgeText: {
    fontSize: rf(11),
    fontFamily: "SF_Pro_Medium",
    color: "#4B5563",
  },
  closeBtn: {
    padding: 3,
    borderRadius: 10,
    backgroundColor: "#F9FAFB",
  },
  divider: {
    height: 1,
    backgroundColor: "#F3F4F6",
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  projectItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginVertical: 1.5,
  },
  projectIconBox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
  },
  projectName: {
    flex: 1,
    fontSize: rf(13),
    fontFamily: "SF_Pro_Medium",
    color: "#1F2937",
  },
  chevron: {
    marginLeft: 4,
  },
  emptyContainer: {
    paddingVertical: 22,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  emptyText: {
    fontSize: rf(13),
    fontFamily: "SF_Pro_Regular",
    color: "#9CA3AF",
  },
  bottomNotch: {
    // Subtle hint line at the bottom
    height: 2,
    backgroundColor: "transparent",
  },
});
