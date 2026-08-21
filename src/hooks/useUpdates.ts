import * as Updates from "expo-updates";
import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import Toast from "react-native-toast-message";

/**
 * Custom hook to monitor, fetch, and apply Over-The-Air (OTA) updates using expo-updates.
 *
 * Behavior:
 * - In development (`__DEV__`), OTA updates are skipped.
 * - In production, checks for updates on mount and when app returns to foreground.
 * - When an update is downloaded, displays a Toast notification offering immediate reload.
 */
export function useUpdates() {
  const isCheckingRef = useRef(false);

  const checkAndApplyUpdate = async () => {
    if (__DEV__ || isCheckingRef.current) return;

    try {
      isCheckingRef.current = true;
      console.log("🔄 [useUpdates] Checking for OTA updates...");

      const update = await Updates.checkForUpdateAsync();

      if (update.isAvailable) {
        console.log("🚀 [useUpdates] Update available! Fetching bundle...");

        const fetchedUpdate = await Updates.fetchUpdateAsync();

        if (fetchedUpdate.isNew) {
          console.log("✅ [useUpdates] Update downloaded successfully. Prompting user to restart.");

          Toast.show({
            type: "info",
            text1: "Update Ready 🚀",
            text2: "A new version of Plaint has been downloaded. Tap to restart.",
            position: "bottom",
            visibilityTime: 10000,
            onPress: async () => {
              Toast.hide();
              try {
                await Updates.reloadAsync();
              } catch (err) {
                console.error("❌ [useUpdates] Failed to reload app:", err);
              }
            },
          });
        }
      } else {
        console.log("✨ [useUpdates] App is up to date.");
      }
    } catch (error) {
      console.warn("⚠️ [useUpdates] Error checking or downloading update:", error);
    } finally {
      isCheckingRef.current = false;
    }
  };

  useEffect(() => {
    if (__DEV__) return;

    // Check on cold start
    checkAndApplyUpdate();

    // Check when app resumes from background
    const subscription = AppState.addEventListener(
      "change",
      (nextAppState: AppStateStatus) => {
        if (nextAppState === "active") {
          checkAndApplyUpdate();
        }
      }
    );

    return () => {
      subscription.remove();
    };
  }, []);

  return {
    checkForUpdateManually: checkAndApplyUpdate,
    updateId: Updates.updateId,
    channel: Updates.channel,
    runtimeVersion: Updates.runtimeVersion,
  };
}
