import { AuthContext, AuthProvider } from "@/context/AuthContext";
import { ChatProvider } from "@/context/ChatContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { TaskProvider } from "@/context/TaskContext";
import useAppFonts from "@/theme/useAppFonts";
import { connectSocket, disconnectSocket } from "@/services/socket/socketService";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useContext, useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Toast from "react-native-toast-message";

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const authCtx = useContext(AuthContext);
  const state = authCtx?.state ?? { isAuthenticated: false, isDefaultPassword: false, loading: true };
  const segments = useSegments();
  const router = useRouter();
  const [fontsLoaded, fontError] = useAppFonts();

  useEffect(() => {
    if (fontError) {
      console.error("Error loading application fonts:", fontError);
    }
  }, [fontError]);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch((err) => {
        console.warn("Error hiding splash screen:", err);
      });
    }
  }, [fontsLoaded]);

  useEffect(() => {
    if (state.loading || !fontsLoaded) return;

    const inAuthGroup = segments[0] === "(auth)";
    const inInitialReset = (segments as string[]).includes("initial-reset");
    const inTabGroup = segments[0] === "(tabs)";
    const isFirstRoute = (segments[0] as string) === "" || (segments[0] as string) === "index";
    const isOnboarding = (segments[0] as string) === "splashscreem";
    // Top-level screens that are valid destinations for authenticated users
    const inAuthenticatedScreen = ["conversation", "profile", "explore"].includes(segments[0] as string);

    if (isFirstRoute || isOnboarding) return;

    if (!state.isAuthenticated && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (state.isAuthenticated && state.isDefaultPassword && !inInitialReset) {
      router.replace("/(auth)/initial-reset" as never);
    } else if (state.isAuthenticated && !state.isDefaultPassword && !inTabGroup && !inAuthenticatedScreen) {
      router.replace("/(tabs)/tasks");
    }
  }, [state.isAuthenticated, state.isDefaultPassword, state.loading, segments, fontsLoaded, router]);

  // ── App-level socket lifecycle ────────────────────────────────────────────
  // Connect when authenticated, disconnect on logout.
  // connectSocket() is idempotent — safe to call multiple times.
  useEffect(() => {
    if (state.isAuthenticated && !state.isDefaultPassword && !state.loading) {
      connectSocket().catch((err) => {
        console.warn("[Socket] Initial connect failed:", err);
      });
    }
    if (!state.isAuthenticated && !state.loading) {
      disconnectSocket();
    }
  }, [state.isAuthenticated, state.isDefaultPassword, state.loading]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <Stack screenOptions={{ headerShown: false }} />
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <AuthProvider>
      <TaskProvider>
        <ChatProvider>
          <NotificationProvider>
            <RootNavigator />
            <Toast />
          </NotificationProvider>
        </ChatProvider>
      </TaskProvider>
    </AuthProvider>
    </GestureHandlerRootView>
  );
}
