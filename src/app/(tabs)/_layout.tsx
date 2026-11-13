import CustomTabBar from "@/components/CustomTabBar";
import AppHeader from "@/components/headerapp";
import { SearchProvider } from "@/context/SearchContext";
import { useAuth } from "@/hooks/useAuth";
import { markTabsRouteMounted } from "@/utils/conversationNavigation";
import { Tabs, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type HeaderConfig = {
  greeting: string;
  subGreeting: string;
  showSearch?: boolean;
  showFilter?: boolean;
  forceSearchOpen?: boolean;
  placeholder?: string;
};

function getTimeGreeting(name: string) {
  const hour = new Date().getHours();
  if (hour < 12) return `Good morning, ${name}!`;
  if (hour < 17) return `Good afternoon, ${name}!`;
  return `Good evening, ${name}!`;
}

const HEADER_CONFIGS: Record<string, HeaderConfig> = {
  tasks: {
    greeting: "Tasks",
    subGreeting: "Assign tasks, track progress, and boost productivity.",
    showSearch: true,
    placeholder: "Search Tasks...",
  },
  leaves: {
    greeting: "My Leaves",
    subGreeting: "View and apply for your leaves",
    showSearch: true,
    placeholder: "Search Leaves...",
  },
};

const DEFAULT_CONFIG: HeaderConfig = {
  greeting: "",
  subGreeting: "",
};

function TabLayoutContent() {
  const { state: authState } = useAuth();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const currentRoute = segments[segments.length - 1] ?? "tasks";

  const firstName = authState.user?.first_name ?? "";
  const lastName = authState.user?.last_name ?? "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ");

  const config: HeaderConfig =
    currentRoute === "chat"
      ? {
          greeting: fullName ? getTimeGreeting(fullName) : "Good morning!",
          subGreeting: "Let's make today productive!",
          showSearch: true,
          placeholder: "Search Chat",
        }
      : (HEADER_CONFIGS[currentRoute] ?? DEFAULT_CONFIG);

  const forceSearchOpen = config.forceSearchOpen;

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      {/* Transparent status bar with dark content, matching the conversation
          screen (`<StatusBar style="dark" />`) instead of the light app default. */}
      <StatusBar style="dark" />
      <Animated.View
        layout={LinearTransition.duration(180)}
        style={{
          overflow: "visible",
          zIndex: 99999,
          paddingTop: insets.top,
          backgroundColor: "#fff",
        }}
      >
        <AppHeader
          greeting={config.greeting}
          subGreeting={config.subGreeting}
          showSearch={config.showSearch}
          showFilter={config.showFilter}
          forceSearchOpen={forceSearchOpen}
          placeholder={config.placeholder}
        />
      </Animated.View>
      <Tabs
        initialRouteName="tasks"
        screenOptions={{
          headerShown: false,
          tabBarHideOnKeyboard: true,
        }}
        tabBar={(props) => <CustomTabBar {...props} />}
      >
        <Tabs.Screen name="tasks" />
        {/* <Tabs.Screen name="leaves" /> */}
        <Tabs.Screen name="chat" />
      </Tabs>
    </View>
  );
}

export default function TabLayout() {
  // Let navigation helpers know the Chat List is present as the stack root, so
  // a notification deep-link doesn't need to (re)establish it, and so a cold
  // start without it can. Cleared on unmount (e.g. logout).
  useEffect(() => {
    markTabsRouteMounted(true);
    return () => markTabsRouteMounted(false);
  }, []);

  return (
    <SearchProvider>
      <TabLayoutContent />
    </SearchProvider>
  );
}
