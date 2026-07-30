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
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
    }
    hasNativeModule = true;
  } catch {
    console.log("[PushNotification] Failed to initialize notifications");
    hasNativeModule = false;
  }
} else {
  console.log("[PushNotification] expo-notifications unavailable in Expo Go");
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
    if (!hasNativeModule || !Device || !Notifications) {
      setState((prev) => ({ ...prev, permissionStatus: "denied" }));
      return null;
    }

    if (!Device.isDevice) {
      setState((prev) => ({ ...prev, permissionStatus: "denied" }));
      return null;
    }

    try {
      const { status: existingStatus } =
        await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== "granted") {
        setState((prev) => ({
          ...prev,
          permissionStatus: finalStatus as PushNotificationState["permissionStatus"],
        }));
        return null;
      }

      setState((prev) => ({ ...prev, permissionStatus: "granted" }));

      if (RNPlatform.OS === "android") {
        await Notifications.setNotificationChannelAsync(
          "planit-notifications",
          {
            name: "Planit Notifications",
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: "#00DEAB",
            sound: "default",
          }
        );
      }

      try {
        const tokenData = await Notifications.getDevicePushTokenAsync();
        return tokenData.data;
      } catch {
        return null;
      }
    } catch {
      return null;
    }
  }, []);

  const registerForPushNotifications = useCallback(
    async (companyId: number): Promise<string | null> => {
      if (!hasNativeModule || !Device || !Notifications) return null;
      try {
        const token = await requestPermissions();
        if (!token) return null;

        lastTokenRef.current = token;

        const platform: Platform =
          RNPlatform.OS === "ios" ? "ios" : "android";

        const res = await pushService.registerDevice({
          fcm_token: token,
          platform,
          device_name: Device.modelName || undefined,
          company_id: companyId,
        });

        if (res.Good) {
          setState((prev) => ({
            ...prev,
            expoPushToken: token,
            registered: true,
            deviceId: res.device_id,
          }));
        }

        return token;
      } catch (error) {
        console.error(
          "[PushNotification] Registration failed:",
          error
        );
        return null;
      }
    },
    [requestPermissions]
  );

  const unregisterDevice = useCallback(
    async (companyId: number) => {
      const token = lastTokenRef.current || state.expoPushToken;
      if (!token) return;

      try {
        await pushService.unregisterDevice({
          fcm_token: token,
          company_id: companyId,
        });
      } catch (error) {
        console.error(
          "[PushNotification] Unregistration failed:",
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
      try {
        await pushService.updateDeviceToken({
          old_fcm_token: oldToken || lastTokenRef.current || undefined,
          new_fcm_token: newToken,
          company_id: companyId,
        });

        lastTokenRef.current = newToken;
        setState((prev) => ({ ...prev, expoPushToken: newToken }));
      } catch (error) {
        console.error(
          "[PushNotification] Token update failed:",
          error
        );
      }
    },
    []
  );

  const resetBadge = useCallback(async (companyId: number) => {
    try {
      await pushService.resetBadge({ company_id: companyId });
    } catch (error) {
      console.error("[PushNotification] Badge reset failed:", error);
    }
  }, []);

  const handleNotificationTap = useCallback(
    (data: PushNotificationData | null) => {
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
      foregroundListener.current =
        Notifications.addNotificationReceivedListener((notification: any) => {
          const data = notification.request.content
            .data as PushNotificationData | null;
          notificationDataRef.current = data;
        });

      notificationResponseListener.current =
        Notifications.addNotificationResponseReceivedListener((response: any) => {
          const data = response.notification.request.content
            .data as PushNotificationData | null;
          notificationDataRef.current = data;
          handleNotificationTap(data);
        });

      tokenListener.current = Notifications.addPushTokenListener((tokenData: any) => {
        const newToken = tokenData.data;
        if (
          lastTokenRef.current &&
          lastTokenRef.current !== newToken
        ) {
          pushService
            .updateDeviceToken({
              old_fcm_token: lastTokenRef.current,
              new_fcm_token: newToken,
            })
            .then(() => {
              lastTokenRef.current = newToken;
              setState((prev) => ({
                ...prev,
                expoPushToken: newToken,
              }));
            })
            .catch((err) => {
              console.error(
                "[PushNotification] Auto token update failed:",
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
    } catch {
      // Silently skip in Expo Go
    }

    return () => {
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
