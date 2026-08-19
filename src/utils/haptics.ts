import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";

export type HapticIntensity = "Light" | "Medium" | "Heavy";

let isHapticsEnabledCache: boolean | null = null;
let hapticIntensityCache: HapticIntensity | null = null;

export async function isHapticsEnabled(): Promise<boolean> {
  if (isHapticsEnabledCache !== null) return isHapticsEnabledCache;
  try {
    const val = await SecureStore.getItemAsync("pref_haptics");
    isHapticsEnabledCache = val === null ? true : val === "true";
    return isHapticsEnabledCache;
  } catch {
    return true;
  }
}

export function setHapticsEnabledCache(enabled: boolean) {
  isHapticsEnabledCache = enabled;
  SecureStore.setItemAsync("pref_haptics", String(enabled)).catch(() => {});
}

export async function getHapticIntensity(): Promise<HapticIntensity> {
  if (hapticIntensityCache !== null) return hapticIntensityCache;
  try {
    const val = await SecureStore.getItemAsync("pref_haptics_intensity");
    if (val === "Light" || val === "Medium" || val === "Heavy") {
      hapticIntensityCache = val;
    } else {
      hapticIntensityCache = "Medium";
    }
    return hapticIntensityCache;
  } catch {
    return "Medium";
  }
}

export function setHapticIntensityCache(intensity: HapticIntensity) {
  hapticIntensityCache = intensity;
  SecureStore.setItemAsync("pref_haptics_intensity", intensity).catch(() => {});
}

export async function triggerHaptic(
  type: "light" | "medium" | "heavy" | "selection" | "success" | "warning" | "error" = "light"
) {
  try {
    const enabled = await isHapticsEnabled();
    if (!enabled) return;

    const intensity = await getHapticIntensity();

    // Map impact based on user intensity selection
    if (type === "light" || type === "medium" || type === "heavy" || type === "selection") {
      if (intensity === "Light") {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return;
      }
      if (intensity === "Heavy") {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        return;
      }
      // Default Medium
      if (type === "heavy") {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      } else if (type === "medium") {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else if (type === "selection") {
        await Haptics.selectionAsync();
      } else {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      return;
    }

    // Notification haptics (success, warning, error)
    switch (type) {
      case "success":
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case "warning":
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
      case "error":
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
    }
  } catch {
    // Gracefully ignore on web or unsupported devices
  }
}
