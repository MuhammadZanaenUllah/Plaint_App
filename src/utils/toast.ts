import Toast from "react-native-toast-message";

export function showSuccess(text1: string, text2?: string) {
  Toast.show({ type: "success", text1, text2 });
}

export function showError(text1: string, text2?: string) {
  Toast.show({ type: "error", text1, text2 });
}

/**
 * Show an informational toast.
 *
 * When `onPress` is provided the toast becomes tappable
 * (react-native-toast-message wires `onPress` to its TouchableOpacity): the
 * toast hides itself first, then the callback runs (e.g. opening the chat a
 * notification belongs to).
 */
export function showInfo(text1: string, text2?: string, onPress?: () => void) {
  Toast.show({
    type: "info",
    text1,
    text2,
    onPress: onPress
      ? () => {
          Toast.hide();
          onPress();
        }
      : undefined,
  });
}