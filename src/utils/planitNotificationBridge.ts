import * as Notifications from "expo-notifications";
import { requireOptionalNativeModule } from "expo-modules-core";

type PlanitNotificationNativeModule = {
  markRoomRead(roomId: string, beforeTime?: number): void;
};

let nativeModule: PlanitNotificationNativeModule | null = null;
try {
  nativeModule =
    requireOptionalNativeModule<PlanitNotificationNativeModule>(
      "PlanitNotificationModule",
    );
} catch {
  nativeModule = null;
}

/**
 * Without the patched native module (iOS): dismiss the room's delivered
 * notifications through the expo-notifications JS API. Notifications delivered
 * after `beforeTime` stay, so a message that lands mid-read isn't cleared.
 */
async function dismissRoomNotifications(
  roomId: string,
  beforeTime: number,
): Promise<void> {
  const presented = await Notifications.getPresentedNotificationsAsync();
  const targets = presented.filter((n) => {
    const data = n.request.content.data as { room_id?: unknown } | null;
    return (
      data?.room_id != null &&
      String(data.room_id) === roomId &&
      // iOS reports `date` in seconds (Android: ms); this path only runs on iOS.
      n.date * 1000 <= beforeTime
    );
  });
  await Promise.all(
    targets.map((n) =>
      Notifications.dismissNotificationAsync(n.request.identifier),
    ),
  );
}

/**
 * Clears the Planit chat notifications for one room after the backend read
 * request has succeeded. Android: the patched native module (keeps messages
 * from the same sender in other rooms). iOS: dismisses the room's delivered
 * notifications.
 */
export function markRoomReadNotification(
  roomId: string,
  beforeTime?: number,
): void {
  if (!roomId) return;
  const cutoff = typeof beforeTime === "number" ? beforeTime : Date.now();
  try {
    if (nativeModule) {
      nativeModule.markRoomRead(roomId, cutoff);
      return;
    }
  } catch (err) {
    console.warn(
      "[Notifications] Failed to update native chat notifications after read:",
      err,
    );
    return;
  }
  dismissRoomNotifications(String(roomId), cutoff).catch((err) =>
    console.warn("[Notifications] Failed to dismiss read chat notifications:", err),
  );
}
