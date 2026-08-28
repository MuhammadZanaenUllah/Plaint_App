import { rf } from "@/utils/responsive";
import { useEffect } from "react";
import { StyleSheet, Text } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

type Props = {
  refreshing: boolean;
};

export default function TaskRefreshHeader({ refreshing }: Props) {
  const rotation = useSharedValue(0);
  const translateY = useSharedValue(-50);
  const scale = useSharedValue(0.7);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (refreshing) {
      // Spring down into view
      translateY.value = withSpring(8, { damping: 15, stiffness: 180 });
      scale.value = withSpring(1, { damping: 15, stiffness: 180 });
      opacity.value = withTiming(1, { duration: 180 });

      // Continuous rotation
      rotation.value = withRepeat(
        withTiming(360, { duration: 850, easing: Easing.linear }),
        -1,
        false,
      );
    } else {
      // Slide up and scale down out of view
      translateY.value = withTiming(-50, { duration: 250 });
      scale.value = withTiming(0.7, { duration: 250 });
      opacity.value = withTiming(0, { duration: 200 });
      rotation.value = 0;
    }
  }, [refreshing, translateY, scale, opacity, rotation]);

  const pillAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
    opacity: opacity.value,
  }));

  const spinnerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View
      style={[styles.floatingPill, pillAnimatedStyle]}
      pointerEvents="none"
    >
      <Animated.View style={[styles.spinnerBox, spinnerAnimatedStyle]}>
        <Svg width={18} height={18} viewBox="0 0 32 32" fill="none">
          <Circle
            cx={16}
            cy={16}
            r={13}
            stroke="#00DEAB"
            strokeWidth={3}
            strokeDasharray="50 30"
            strokeLinecap="round"
          />
          {/* <Path
            d="M10.5 16.5L14 20L21.5 12"
            stroke="#00DEAB"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          /> */}
        </Svg>
      </Animated.View>
      <Text style={styles.text}>Syncing...</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  floatingPill: {
    position: "absolute",
    top: 72,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    zIndex: 9999,
  },
  spinnerBox: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
  },
});
