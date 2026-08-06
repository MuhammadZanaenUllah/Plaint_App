import Icons from "@/constants/icons";
import { Ionicons } from "@expo/vector-icons";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import React, { useEffect, useState } from "react";
import { Keyboard, StyleSheet, TouchableOpacity, View, } from "react-native";

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
  activeIcon?: React.ComponentType<any>;
  inactiveIcon?: React.ComponentType<any>;
  ionicon?: React.ComponentProps<typeof Ionicons>["name"];
};

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

    const showKeyboard = Keyboard.addListener(
      "keyboardDidShow",
      () => {
        setKeyboardVisible(true);
      }
    );

    const hideKeyboard = Keyboard.addListener(
      "keyboardDidHide",
      () => {
        setKeyboardVisible(false);
      }
    );


    return () => {
      showKeyboard.remove();
      hideKeyboard.remove();
    };

  }, []);

  if (keyboardVisible) {
    return (
      <View style={{ height: 0 }} />
    );
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
                    <tab.activeIcon width={24} height={24} />
                  ) : (
                    <tab.inactiveIcon width={24} height={24} />
                  )
                ) : (
                  <Ionicons
                    name={tab.ionicon!}
                    size={24}
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
    left: 16,
    right: 16,
  },
  fab: {
    position: "absolute",
    right: 0,
    top: -64,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#00DEAB",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  bar: {
    flexDirection: "row",
    backgroundColor: "#000",
    borderRadius: 40,
    height: 66,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapActive: {
    width: 53,
    height: 53,
    backgroundColor: "#fff",
    borderRadius: 50,
  },
});
