import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform as RNPlatform } from "react-native";
import Constants from "expo-constants";
import { router } from "expo-router";
import * as pushService from "@/services/api/push.service";
import type {
  PushNotificationData,
  PushNotificationState,
  Platform,
} from "@/types/push.types";

let Notifications: typeof import("expo-notifications") | null = null;
let Device: typeof import("expo-device") | null = null;
let hasNativeModule = false;

const isExpoGo = Constants.executionEnvironment === "storeClient";

if (!isExpoGo) {
  try {
    Notifications = require("expo-notifications");
    Device = require("expo-device");
    const Notif = Notifications!;
    if (Notif.setNotificationHandler) {
      Notif.setNotificationHandler({
        handleNotification: async () => ({
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
    }
    hasNativeModule = true;
    console.log("📲 [PushNotification] Native notification modules (expo-notifications, expo-device) loaded successfully.");
  } catch (err) {
    console.log("📲 [PushNotification] Failed to initialize notifications native modules:", err);
    hasNativeModule = false;
  }
} else {
  console.log("📲 [PushNotification] expo-notifications unavailable in Expo Go. Use a development build or standalone build for push notifications.");
}

export type PushNotificationContextValue = {
  state: PushNotificationState;
  registerForPushNotifications: (
    companyId: number
  ) => Promise<string | null>;
  unregisterDevice: (companyId: number) => Promise<void>;
  updateDeviceToken: (
    newToken: string,
    companyId?: number,
    oldToken?: string
  ) => Promise<void>;
  resetBadge: (companyId: number) => Promise<void>;
  handleNotificationTap: (data: PushNotificationData | null) => void;
};

const PushNotificationContext =
  createContext<PushNotificationContextValue | null>(null);

const initialState: PushNotificationState = {
  expoPushToken: null,
  notification: null,
  permissionStatus: "undetermined",
  registered: false,
  deviceId: null,
};

export function PushNotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<PushNotificationState>(initialState);
  const notificationResponseListener = useRef<{ remove: () => void } | null>(null);
  const tokenListener = useRef<{ remove: () => void } | null>(null);
  const foregroundListener = useRef<{ remove: () => void } | null>(null);
  const notificationDataRef = useRef<PushNotificationData | null>(null);
  const lastTokenRef = useRef<string | null>(null);

  const requestPermissions = useCallback(async () => {
    console.log("📲 [PushNotification] Requesting permissions & fetching push tokens...", {
      hasNativeModule,
      isDevice: Device?.isDevice,
      platform: RNPlatform.OS,
    });

    if (!hasNativeModule || !Device || !Notifications) {
      console.warn("📲 [PushNotification] Cannot request permissions: Native modules are missing.");
      setState((prev) => ({ ...prev, permissionStatus: "denied" }));
      return null;
    }

    if (!Device.isDevice) {
      console.warn("📲 [PushNotification] Physical device required for push notifications. Emulator detected.");
      setState((prev) => ({ ...prev, permissionStatus: "denied" }));
      return null;
    }

    try {
      const { status: existingStatus } =
        await Notifications.getPermissionsAsync();
      console.log(`📲 [PushNotification] Existing notification permission status: ${existingStatus}`);
      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        console.log("📲 [PushNotification] Requesting notification permission from user...");
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      console.log(`📲 [PushNotification] Final notification permission status: ${finalStatus}`);

      if (finalStatus !== "granted") {
        setState((prev) => ({
          ...prev,
          permissionStatus: finalStatus as PushNotificationState["permissionStatus"],
        }));
        return null;
      }

      setState((prev) => ({ ...prev, permissionStatus: "granted" }));

      if (RNPlatform.OS === "android") {
        console.log("📲 [PushNotification] Configuring Android Notification Channel: 'planit-notifications'");
        await Notifications.setNotificationChannelAsync(
          "planit-notifications",
          {
            name: "Planit Notifications",
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: "#00DEAB",
            sound: "notification.mp3",
          }
        );
      }

      let expoPushToken: string | null = null;

      // Fetch Expo Push Token (Notifications.getExpoPushTokenAsync)
      try {
        const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
        console.log(`📲 [PushNotification] Fetching Expo Push Token (EAS Project ID: ${projectId || "default"})...`);
        const expoTokenData = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined
        );
        if (expoTokenData && expoTokenData.data && typeof expoTokenData.data === "string") {
          expoPushToken = expoTokenData.data;
        }
        // console.log("==================================================================");
        console.log("🚀 [EXPO PUSH TOKEN OBTAINED]:");
        console.log(expoPushToken);
        // console.log("==================================================================");
      } catch (expoErr) {
        console.warn("📲 [PushNotification] Could not fetch Expo Push Token:", expoErr);
      }

      return expoPushToken;
    } catch (err) {
      console.warn("📲 [PushNotification] Error while checking permissions or getting push tokens:", err);
      return null;
    }
  }, []);

  const registerForPushNotifications = useCallback(
    async (companyId: number): Promise<string | null> => {
      console.log(`📲 [PushNotification] registerForPushNotifications called for companyId: ${companyId}`);
      if (!hasNativeModule || !Device || !Notifications) {
        console.warn("📲 [PushNotification] Registration aborted: Native modules missing.");
        return null;
      }
      try {
        const token = await requestPermissions();
        if (!token || typeof token !== "string" || !token.trim()) {
          console.warn("📲 [PushNotification] Registration aborted: Push token is null or empty.");
          return null;
        }

        lastTokenRef.current = token;

        const platform: Platform =
          RNPlatform.OS === "ios" ? "ios" : "android";

        console.log("📲 [PushNotification] Sending Expo registration request to backend:", {
          company_id: companyId,
          platform,
          token_type: "expo",
          device_name: Device.modelName,
          token_preview: `${token.substring(0, 25)}...`,
        });

        const res = await pushService.registerDevice({
          fcm_token: token,
          expo_push_token: token,
          token_type: "expo",
          platform,
          device_name: Device.modelName || undefined,
          company_id: companyId,
        });

        console.log("📲 [PushNotification] Device registration API response:", res);

        if (res && res.Good) {
          console.log(`📲 [PushNotification] Device registered successfully with backend. Device ID: ${res.device_id}`);
          setState((prev) => ({
            ...prev,
            expoPushToken: token,
            registered: true,
            deviceId: res.device_id,
          }));
        } else {
          console.warn("📲 [PushNotification] Device registration API returned Good: false", res);
        }

        return token;
      } catch (error) {
        console.warn(
          "📲 [PushNotification] Device registration failed:",
          error instanceof Error ? error.message : error
        );
        return null;
      }
    },
    [requestPermissions]
  );

  const unregisterDevice = useCallback(
    async (companyId: number) => {
      const token = lastTokenRef.current || state.expoPushToken;
      console.log(`📲 [PushNotification] unregisterDevice called for companyId: ${companyId}, token: ${token ? token.substring(0, 20) + "..." : "NONE"}`);
      if (!token) return;

      try {
        const res = await pushService.unregisterDevice({
          fcm_token: token,
          company_id: companyId,
        });
        console.log("📲 [PushNotification] Unregistration API response:", res);
      } catch (error) {
        console.error(
          "📲 [PushNotification] Unregistration failed with error:",
          error
        );
      }

      setState(initialState);
      lastTokenRef.current = null;
    },
    [state.expoPushToken]
  );

  const updateDeviceToken = useCallback(
    async (
      newToken: string,
      companyId?: number,
      oldToken?: string
    ) => {
      console.log("📲 [PushNotification] updateDeviceToken called with newToken:", `${newToken.substring(0, 20)}...`);
      try {
        const res = await pushService.updateDeviceToken({
          old_fcm_token: oldToken || lastTokenRef.current || undefined,
          new_fcm_token: newToken,
          company_id: companyId,
        });
        console.log("📲 [PushNotification] Token update API response:", res);

        lastTokenRef.current = newToken;
        setState((prev) => ({ ...prev, expoPushToken: newToken }));
      } catch (error) {
        console.error(
          "📲 [PushNotification] Token update failed with error:",
          error
        );
      }
    },
    []
  );

  const resetBadge = useCallback(async (companyId: number) => {
    console.log(`📲 [PushNotification] Resetting notification badge count for companyId: ${companyId}`);
    try {
      const res = await pushService.resetBadge({ company_id: companyId });
      console.log("📲 [PushNotification] Badge reset API response:", res);
    } catch (error) {
      console.error("📲 [PushNotification] Badge reset failed with error:", error);
    }
  }, []);

  const handleNotificationTap = useCallback(
    (data: PushNotificationData | null) => {
      console.log("📲 [PushNotification] Handling notification tap navigation with data:", data);
      if (!data) {
        router.push("/(tabs)/tasks");
        return;
      }

      switch (data.type) {
        case "task":
          if (data.task_id) {
            router.push({
              pathname: "/(tabs)/tasks",
              params: { taskId: data.task_id },
            });
          } else {
            router.push("/(tabs)/tasks");
          }
          break;
        case "tasks":
          router.push({
            pathname: "/(tabs)/tasks",
            params: data.filter ? { filter: data.filter } : undefined,
          });
          break;
        case "lead":
          router.push("/(tabs)/tasks");
          break;
        case "chat":
          if (data.room_id) {
            router.push({
              pathname: "/conversation",
              params: {
                roomId: data.room_id,
                roomName: "",
                roomType: "channel",
              },
            });
          } else {
            router.push("/(tabs)/chat");
          }
          break;
        case "notification":
        default:
          if (data.task_id) {
            router.push({
              pathname: "/(tabs)/tasks",
              params: { taskId: data.task_id },
            });
          } else {
            router.push("/(tabs)/tasks");
          }
          break;
      }
    },
    []
  );

  useEffect(() => {
    if (!hasNativeModule || !Notifications) return;

    try {
      console.log("📲 [PushNotification] Subscribing to foreground notification & notification tap listeners...");

      foregroundListener.current =
        Notifications.addNotificationReceivedListener((notification: any) => {
          const content = notification.request.content;
          const data = content.data as PushNotificationData | null;
          console.log("🔔 [FOREGROUND PUSH NOTIFICATION RECEIVED]:", {
            title: content.title,
            subtitle: content.subtitle,
            body: content.body,
            data: data,
            badge: content.badge,
            sound: content.sound,
          });
          notificationDataRef.current = data;
        });

      notificationResponseListener.current =
        Notifications.addNotificationResponseReceivedListener((response: any) => {
          const content = response.notification.request.content;
          const data = content.data as PushNotificationData | null;
          const actionIdentifier = response.actionIdentifier;
          console.log("👉 [PUSH NOTIFICATION TAPPED / USER OPENED]:", {
            actionIdentifier,
            title: content.title,
            body: content.body,
            data: data,
          });
          notificationDataRef.current = data;
          handleNotificationTap(data);
        });

      tokenListener.current = Notifications.addPushTokenListener((tokenData: any) => {
        const newToken = tokenData.data;
        console.log("🔄 [PUSH TOKEN AUTOMATICALLY REFRESHED]:", newToken);
        if (
          lastTokenRef.current &&
          lastTokenRef.current !== newToken
        ) {
          pushService
            .updateDeviceToken({
              old_fcm_token: lastTokenRef.current,
              new_fcm_token: newToken,
            })
            .then((res) => {
              console.log("📲 [PushNotification] Auto token update API response:", res);
              lastTokenRef.current = newToken;
              setState((prev) => ({
                ...prev,
                expoPushToken: newToken,
              }));
            })
            .catch((err) => {
              console.error(
                "📲 [PushNotification] Auto token update failed with error:",
                err
              );
            });
        } else {
          lastTokenRef.current = newToken;
          setState((prev) => ({
            ...prev,
            expoPushToken: newToken,
          }));
        }
      });
    } catch (err) {
      console.warn("📲 [PushNotification] Error subscribing to notification listeners:", err);
    }

    return () => {
      console.log("📲 [PushNotification] Cleaning up notification listeners...");
      if (foregroundListener.current) {
        try { foregroundListener.current.remove(); } catch {}
      }
      if (notificationResponseListener.current) {
        try { notificationResponseListener.current.remove(); } catch {}
      }
      if (tokenListener.current) {
        try { tokenListener.current.remove(); } catch {}
      }
    };
  }, [handleNotificationTap]);

  const value: PushNotificationContextValue = useMemo(
    () => ({
      state,
      registerForPushNotifications,
      unregisterDevice,
      updateDeviceToken,
      resetBadge,
      handleNotificationTap,
    }),
    [
      state,
      registerForPushNotifications,
      unregisterDevice,
      updateDeviceToken,
      resetBadge,
      handleNotificationTap,
    ]
  );

  return (
    <PushNotificationContext.Provider value={value}>
      {children}
    </PushNotificationContext.Provider>
  );
}

export function usePushNotifications(): PushNotificationContextValue {
  const ctx = useContext(PushNotificationContext);
  if (!ctx) {
    throw new Error(
      "usePushNotifications must be used within a PushNotificationProvider"
    );
  }
  return ctx;
}
