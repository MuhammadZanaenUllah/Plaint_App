import { AuthContext, AuthProvider } from "@/context/AuthContext";
import { ChatProvider } from "@/context/ChatContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { PushNotificationProvider, usePushNotifications } from "@/context/PushNotificationContext";
import { TaskProvider } from "@/context/TaskContext";
import useAppFonts from "@/theme/useAppFonts";
import { connectSocket, disconnectSocket } from "@/services/socket/socketService";
import { AppState } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useContext, useEffect, useRef } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Toast from "react-native-toast-message";

SplashScreen.preventAutoHideAsync();

function PushNotificationLifecycle() {
  const { registerForPushNotifications, unregisterDevice, resetBadge } = usePushNotifications();
  const authCtx = useContext(AuthContext);
  const state = authCtx?.state ?? { isAuthenticated: false, isDefaultPassword: false, loading: true };
  const prevAuthRef = useRef(false);
  const prevCompanyRef = useRef<number | null>(null);

  useEffect(() => {
    const isAuthed = state.isAuthenticated && !state.isDefaultPassword && !state.loading;
    const justLoggedIn = isAuthed && !prevAuthRef.current;
    const companyId = authCtx?.state.company?.company_id ?? null;

    if (isAuthed && justLoggedIn && companyId) {
      registerForPushNotifications(companyId).catch(() => {});
    }

    if (prevAuthRef.current && !state.isAuthenticated && !state.loading) {
      if (prevCompanyRef.current) {
        unregisterDevice(prevCompanyRef.current).catch(() => {});
      }
    }

    prevAuthRef.current = isAuthed;
    if (companyId) prevCompanyRef.current = companyId;
  }, [state.isAuthenticated, state.isDefaultPassword, state.loading, authCtx, registerForPushNotifications, unregisterDevice]);

  useEffect(() => {
    if (state.loading) return;

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        const companyId = authCtx?.state.company?.company_id;
        if (companyId) {
          resetBadge(companyId).catch(() => {});
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [state.loading, authCtx, resetBadge]);

  return null;
}

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
            <PushNotificationProvider>
              <PushNotificationLifecycle />
              <RootNavigator />
              <Toast />
            </PushNotificationProvider>
          </NotificationProvider>
        </ChatProvider>
      </TaskProvider>
    </AuthProvider>
    </GestureHandlerRootView>
  );
}
