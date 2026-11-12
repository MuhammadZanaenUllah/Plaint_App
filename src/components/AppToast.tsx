import { rf } from "@/utils/responsive";
import { Ionicons } from "@expo/vector-icons";
import type {
  ToastConfig,
  ToastConfigParams,
} from "react-native-toast-message";
import { useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";

const SUCCESS_COLOR = "#69C779";
const ERROR_COLOR = "#FE6301";
const INFO_COLOR = "#87CEFA";
const EXPANDED_HIDE_MS = 3200;
const LONG_MESSAGE_LENGTH = 70;

function toastAccent(type?: string) {
  if (type === "error") return ERROR_COLOR;
  if (type === "info") return INFO_COLOR;
  return SUCCESS_COLOR;
}

function AppToast({
  type,
  text1,
  text2,
  onPress,
  hide,
}: ToastConfigParams<unknown>) {
  const { width } = useWindowDimensions();
  const [expanded, setExpanded] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const message = text2?.trim() ?? "";
  const canExpand = message.length > LONG_MESSAGE_LENGTH;
  const hasNavigation = typeof onPress === "function";

  useEffect(
    () => () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    },
    [],
  );

  const handlePress = () => {
    // Preserve navigation toasts (chat mentions/replies) exactly as before.
    if (hasNavigation) {
      onPress();
      return;
    }

    if (!canExpand) {
      hide();
      return;
    }

    if (expanded) {
      hide();
      return;
    }

    setExpanded(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => hide(), EXPANDED_HIDE_MS);
  };

  return (
    <Animated.View
      layout={LinearTransition.duration(220)}
      style={[styles.base, { width: Math.min(width - 32, 360) }]}
    >
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={handlePress}
        style={[styles.touchable, { borderLeftColor: toastAccent(type) }]}
      >
        <View style={styles.content}>
          {text1 ? (
            <Text style={styles.text1} numberOfLines={1}>
              {text1}
            </Text>
          ) : null}
          {message ? (
            <Text
              style={styles.text2}
              numberOfLines={expanded ? undefined : 2}
              ellipsizeMode="tail"
            >
              {message}
            </Text>
          ) : null}
        </View>
        {canExpand && !hasNavigation ? (
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={16}
            color="#9CA3AF"
            style={styles.chevron}
          />
        ) : null}
      </TouchableOpacity>
    </Animated.View>
  );
}

export const toastConfig: ToastConfig = {
  success: (props) => <AppToast {...props} />,
  error: (props) => <AppToast {...props} />,
  info: (props) => <AppToast {...props} />,
};

const styles = StyleSheet.create({
  base: {
    alignSelf: "center",
    borderRadius: 8,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  touchable: {
    minHeight: 60,
    borderLeftWidth: 5,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "flex-start",
    paddingLeft: 14,
    paddingRight: 12,
    paddingVertical: 10,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  text1: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
    marginBottom: 2,
  },
  text2: {
    fontSize: rf(11),
    fontFamily: "SF_Pro_Regular",
    color: "#6B7280",
    lineHeight: rf(16),
  },
  chevron: {
    marginLeft: 6,
    marginTop: 2,
  },
});
