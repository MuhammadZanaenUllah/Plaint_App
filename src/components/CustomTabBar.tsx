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
  {
    name: "test-sheet",
    ionicon: "flask-outline",
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

  return (
    <View style={styles.container}>
      <View style={styles.bar}>
        {/* Sliding Instagram-style White Active Pill */}
        {tabPositions[activeIndex] !== undefined && (
          <Animated.View style={[styles.slidingPill, indicatorAnimStyle]} />
        )}

        {TABS.map((tab, i) => {
          const focused = currentRoute === tab.name.toLowerCase();
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
