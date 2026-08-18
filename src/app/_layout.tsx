import { AuthContext, AuthProvider } from "@/context/AuthContext";
import { ChatProvider } from "@/context/ChatContext";
import { NotificationProvider } from "@/context/NotificationContext";
import {
  PushNotificationProvider,
  usePushNotifications,
} from "@/context/PushNotificationContext";
import { TaskProvider } from "@/context/TaskContext";
import {
  connectSocket,
  disconnectSocket,
} from "@/services/socket/socketService";
import useAppFonts from "@/theme/useAppFonts";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useContext, useEffect, useRef } from "react";
import { AppState, LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Toast from "react-native-toast-message";

// Silence console.log in production builds — warn/error are left intact for
// crash diagnostics. Metro's __DEV__ global is available with no extra tooling.
if (!__DEV__) {
  console.log = () => {};
}

SplashScreen.preventAutoHideAsync();

// Known upstream expo-router dev-only race: expo-router's `useLinking` calls a
// state setter (`onUnhandledLinking`) from the async initial-URL promise before
// the root has mounted, producing this warning on cold start in development.
// It is harmless (no crash, prod unaffected) and cannot be fixed at app level.
LogBox.ignoreLogs([
  "Can't perform a React state update on a component that hasn't mounted yet",
]);

function PushNotificationLifecycle() {
  const { registerForPushNotifications, unregisterDevice, resetBadge } =
    usePushNotifications();
  const authCtx = useContext(AuthContext);
  const state = authCtx?.state ?? {
    isAuthenticated: false,
    isDefaultPassword: false,
    loading: true,
  };
  const registeredCompanyRef = useRef<number | null>(null);

  useEffect(() => {
    const isAuthed =
      state.isAuthenticated && !state.isDefaultPassword && !state.loading;
    const companyId = authCtx?.state.company?.company_id ?? null;

    if (isAuthed && companyId && registeredCompanyRef.current !== companyId) {
      registeredCompanyRef.current = companyId;
      console.log(
        `🚀 [PushNotificationLifecycle] Authenticated user session active (Company ID: ${companyId}). Fetching push tokens and registering device...`,
      );
      registerForPushNotifications(companyId).catch((err) => {
        console.error(
          "🚀 [PushNotificationLifecycle] Push registration error:",
          err,
        );
      });
    }

    if (
      !state.isAuthenticated &&
      !state.loading &&
      registeredCompanyRef.current !== null
    ) {
      const oldCompany = registeredCompanyRef.current;
      registeredCompanyRef.current = null;
      console.log(
        `🚀 [PushNotificationLifecycle] User logged out. Unregistering push notifications for Company ID: ${oldCompany}...`,
      );
      unregisterDevice(oldCompany).catch((err) => {
        console.error(
          "🚀 [PushNotificationLifecycle] Push unregistration error:",
          err,
        );
      });
    }
  }, [
    state.isAuthenticated,
    state.isDefaultPassword,
    state.loading,
    authCtx?.state.company?.company_id,
    registerForPushNotifications,
    unregisterDevice,
  ]);

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
  const state = authCtx?.state ?? {
    isAuthenticated: false,
    isDefaultPassword: false,
    loading: true,
  };
  const segments = useSegments();
  const router = useRouter();
  const [fontsLoaded, fontError] = useAppFonts();

  useEffect(() => {
    if (fontError) {
      console.error("Error loading application fonts:", fontError);
    }
  }, [fontError]);

  // Hide the native splash (which can only ever show the static app icon)
  // as soon as the JS root has mounted, instead of waiting on fontsLoaded —
  // that hands off to our own branded splash (src/app/index.tsx) sooner.
  // index.tsx renders no text, so it doesn't need fonts to be ready.
  useEffect(() => {
    SplashScreen.hideAsync().catch((err) => {
      console.warn("Error hiding splash screen:", err);
    });
  }, []);

  useEffect(() => {
    if (state.loading || !fontsLoaded) return;

    const inAuthGroup = segments[0] === "(auth)";
    const inInitialReset = (segments as string[]).includes("initial-reset");
    const inTabGroup = segments[0] === "(tabs)";
    const isFirstRoute =
      (segments[0] as string) === "" || (segments[0] as string) === "index";
    const isOnboarding = (segments[0] as string) === "splashscreem";
    const inAuthenticatedScreen = [
      "conversation",
      "profile",
      "notifications",
    ].includes(segments[0] as string);

    if (isFirstRoute || isOnboarding) return;

    if (!state.isAuthenticated && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (
      state.isAuthenticated &&
      state.isDefaultPassword &&
      !inInitialReset
    ) {
      router.replace("/(auth)/initial-reset" as never);
    } else if (
      state.isAuthenticated &&
      !state.isDefaultPassword &&
      !inTabGroup &&
      !inAuthenticatedScreen
    ) {
      router.replace("/(tabs)/tasks");
    }
  }, [
    state.isAuthenticated,
    state.isDefaultPassword,
    state.loading,
    segments,
    fontsLoaded,
    router,
  ]);

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

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <TaskProvider>
          <NotificationProvider>
            <ChatProvider>
              <PushNotificationProvider>
                <PushNotificationLifecycle />
                <RootNavigator />
                <Toast />
              </PushNotificationProvider>
            </ChatProvider>
          </NotificationProvider>
        </TaskProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
