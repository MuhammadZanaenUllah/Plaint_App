import AppHeader from "@/components/headerapp";
import CustomTabBar from "@/components/CustomTabBar";
import { useAuth } from "@/hooks/useAuth";
import { SearchProvider, useSearch } from "@/context/SearchContext";
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
  const { isHeaderCompact } = useSearch();

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
      : HEADER_CONFIGS[currentRoute] ?? DEFAULT_CONFIG;

  // Collapses the Tasks search bar to just its toggle icon once the task
  // list has scrolled — the greeting text and stat cards are unaffected.
  const forceSearchOpen =
    currentRoute === "tasks" ? config.forceSearchOpen && !isHeaderCompact : config.forceSearchOpen;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ overflow: "visible", zIndex: 99999, paddingTop: insets.top }}>
        <AppHeader
          greeting={config.greeting}
          subGreeting={config.subGreeting}
          showSearch={config.showSearch}
          showFilter={config.showFilter}
          forceSearchOpen={forceSearchOpen}
          placeholder={config.placeholder}
        />
      </View>
      <Tabs
        screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true}}
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
  return (
    <SearchProvider>
      <TabLayoutContent />
    </SearchProvider>
  );
}
