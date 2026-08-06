import AppHeader from "@/components/headerapp";
import CustomTabBar from "@/components/CustomTabBar";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, useSegments } from "expo-router";
import { View } from "react-native";
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
    forceSearchOpen: true,
    placeholder: "Search Tasks...",
  },
  leaves: {
    greeting: "My Leaves",
    subGreeting: "View and apply for your leaves",
    showSearch: true,
    placeholder: "Search Leaves...",
  },
  performance: {
    greeting: "My Evaluation",
    subGreeting: "Track and review your performance",
  },
  biometric: {
    greeting: "Good morning, Junaid!",
    subGreeting: "Let's make today productive!",
  },
  grid: {
    greeting: "Good morning, Junaid!",
    subGreeting: "Let's make today productive!",
  },
};

const DEFAULT_CONFIG: HeaderConfig = {
  greeting: "",
  subGreeting: "",
};

export default function TabLayout() {
  const { state: authState } = useAuth();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const currentRoute = segments[segments.length - 1] ?? "tasks";

  const firstName = authState.user?.first_name ?? "";
  const lastName = authState.user?.last_name ?? "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ");

  const config: HeaderConfig =
    currentRoute === "home" || currentRoute === "chat"
      ? {
          greeting: fullName ? getTimeGreeting(fullName) : "Good morning!",
          subGreeting: "Let's make today productive!",
          ...(currentRoute === "chat" && {
            showSearch: true,
            placeholder: "Search Task",
          }),
        }
      : HEADER_CONFIGS[currentRoute] ?? DEFAULT_CONFIG;

  return (
    <View style={{ flex: 1  }}>
      <View style={{ overflow: "visible", zIndex: 99999, paddingTop: insets.top }}>
        <AppHeader
          greeting={config.greeting}
          subGreeting={config.subGreeting}
          showSearch={config.showSearch}
          showFilter={config.showFilter}
          forceSearchOpen={config.forceSearchOpen}
          placeholder={config.placeholder}
        />
      </View>
      <Tabs
        screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true}}
        tabBar={(props) => <CustomTabBar {...props} />}
      >
        <Tabs.Screen name="tasks" />
        <Tabs.Screen name="leaves" />
        <Tabs.Screen name="performance" />
        <Tabs.Screen name="home" />
        <Tabs.Screen name="chat" />
        <Tabs.Screen name="biometric" />
        <Tabs.Screen name="grid" />
      </Tabs>
    </View>
  );
}
