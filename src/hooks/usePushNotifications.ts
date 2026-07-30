import { usePushNotifications as usePushNotificationsContext } from "@/context/PushNotificationContext";
import type { PushNotificationContextValue } from "@/context/PushNotificationContext";

export function usePushNotifications(): PushNotificationContextValue {
  return usePushNotificationsContext();
}
