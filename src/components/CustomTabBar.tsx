import Icons from "@/constants/icons";
import { Ionicons } from "@expo/vector-icons";
import { BottomTabBarProps } from "expo-router/js-tabs";
import React, { useEffect, useState } from "react";
import { Keyboard, StyleSheet, TouchableOpacity, View } from "react-native";

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
  // {
  //   name: "biometric",
  //   ionicon: "finger-print-outline",
  // },
  {
    name: "tasks",
    activeIcon: TaskIconBlack,
    inactiveIcon: TaskIconsWhite,
  },
  // {
  //   name: "home",
  //   activeIcon: HomeIconBlack,
  //   inactiveIcon: HomeIconWhite,
  // },
  // {
  //   name: "leaves",
  //   activeIcon: LeaveIconBlack,
  //   inactiveIcon: LeaveIconWhite,
  // },
  // {
  //   name: "performance",
  //   activeIcon: PEIconBlack,
  //   inactiveIcon: PEIconWhite,
  // },

  {
    name: "chat",
    activeIcon: ChatIconBlack,
    inactiveIcon: ChatIconWhite,
  },

  // {
  //   name: "grid",
  //   ionicon: "grid-outline",
  // },
];

// const TABS: { name: string;  icon: React.ComponentProps<typeof Ionicons>["name"] }[] = [
//   { name: "Tasks",     icon: "checkbox-outline"      },
//   { name: "Dashboard", icon: "calendar-outline"       },
//   { name: "stats",     icon: "stats-chart-outline"    },
//   { name: "home",      icon: "home-outline"           },
//   { name: "chat",      icon: "chatbubble-outline"     },
//   { name: "biometric", icon: "finger-print-outline"   },
//   { name: "grid",      icon: "grid-outline"           },
// ];

export default function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  // const activeRouteName = state.routes[state.index].name;
  const [keyboardVisible, setKeyboardVisible] = useState(false);
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

  if (keyboardVisible) {
    return <View style={{ height: 0 }} />;
  }

  // console.log("Current Index:", state.index);
  // console.log("Current Route:", state.routes[state.index].name);
  // console.log(state.routes);
  // console.log(state.routeNames);
  const currentRoute = state.routes[state.index]?.name.toLowerCase();
  return (
    <View style={styles.container}>
      {/* {activeRouteName === "Tasks" && (
        <TouchableOpacity style={styles.fab} activeOpacity={0.85}>
          <Fontisto name="plus-a" size={20} color="#000" />
        </TouchableOpacity>
      )} */}
      <View style={styles.bar}>
        {TABS.map((tab, i) => {
          // const focused = state.index === i;
          const focused = currentRoute === tab.name.toLowerCase();
          return (
            <TouchableOpacity
              key={tab.name}
              style={styles.tabItem}
              activeOpacity={0.8}
              onPress={() => navigation.navigate(tab.name)}
            >
              <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
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
            </TouchableOpacity>
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
  fab: {
    position: "absolute",
    right: 0,
    top: -56,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#00DEAB",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  bar: {
    flexDirection: "row",
    backgroundColor: "#000",
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 7,
    gap: 60,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  tabItem: {
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapActive: {
    width: 42,
    height: 42,
    backgroundColor: "#fff",
    borderRadius: 21,
  },
});
