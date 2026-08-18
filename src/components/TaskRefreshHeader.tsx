import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";

type Props = {
  refreshing: boolean;
};

export default function TaskRefreshHeader({ refreshing }: Props) {
  const rotation = useSharedValue(0);
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.6);
  const headerHeight = useSharedValue(0);

  useEffect(() => {
    if (refreshing) {
      // Expand header height smoothly
      headerHeight.value = withTiming(58, { duration: 250 });

      // Continuous 360-degree rotation for the checkmark ring
      rotation.value = withRepeat(
        withTiming(360, { duration: 900, easing: Easing.linear }),
        -1,
        false
      );

      // Pulsing wave effect
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.35, { duration: 700 }),
          withTiming(1, { duration: 700 })
        ),
        -1,
        true
      );
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.1, { duration: 700 }),
          withTiming(0.6, { duration: 700 })
        ),
        -1,
        true
      );
    } else {
      // Collapse header height smoothly
      headerHeight.value = withTiming(0, { duration: 300 });
      rotation.value = 0;
      pulseScale.value = 1;
      pulseOpacity.value = 0.6;
    }
  }, [refreshing, headerHeight, rotation, pulseScale, pulseOpacity]);

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    height: headerHeight.value,
    opacity: headerHeight.value > 5 ? 1 : 0,
  }));

  const spinnerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const pulseAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  if (!refreshing && headerHeight.value === 0) {
    return null;
  }

  return (
    <Animated.View style={[styles.container, containerAnimatedStyle]}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          {/* Pulsing wave ring */}
          <Animated.View style={[styles.pulseRing, pulseAnimatedStyle]} />

          {/* Animated Spinner Icon */}
          <Animated.View style={[styles.spinnerBox, spinnerAnimatedStyle]}>
            <Svg width={32} height={32} viewBox="0 0 32 32" fill="none">
              <Circle
                cx={16}
                cy={16}
                r={13}
                stroke="#00DEAB"
                strokeWidth={2.5}
                strokeDasharray="60 25"
                strokeLinecap="round"
              />
              <Path
                d="M10.5 16.5L14 20L21.5 12"
                stroke="#00DEAB"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Animated.View>
        </View>

        <Text style={styles.text}>Syncing your tasks...</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4FDFB",
    borderBottomWidth: 1,
    borderBottomColor: "#E0F7F2",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 58,
  },
  iconContainer: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  pulseRing: {
    position: "absolute",
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#00DEAB",
  },
  spinnerBox: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontSize: 13,
    fontFamily: "SF_Pro_Medium",
    color: "#00A881",
    letterSpacing: 0.2,
  },
});
