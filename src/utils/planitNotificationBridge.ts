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
 * Clears the native Planit notification messages for one room after the
 * backend read request has succeeded. Messages from the same sender in other
 * rooms are kept.
 */
export function markRoomReadNotification(
  roomId: string,
  beforeTime?: number,
): void {
  if (!roomId) return;
  try {
    nativeModule?.markRoomRead(
      roomId,
      typeof beforeTime === "number" ? beforeTime : Date.now(),
    );
  } catch (err) {
    console.warn(
      "[Notifications] Failed to update native chat notifications after read:",
      err,
    );
  }
}
