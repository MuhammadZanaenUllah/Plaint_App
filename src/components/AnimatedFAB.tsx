import React, { useEffect } from "react";
import { Pressable, StyleSheet, ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { MaterialIcons } from "@expo/vector-icons";

interface AnimatedFABProps {
  onPress: () => void;
  style?: ViewStyle;
  iconName?: keyof typeof MaterialIcons.glyphMap;
  size?: number;
  color?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function AnimatedFAB({
  onPress,
  style,
  iconName = "add",
  size = 32,
  color = "#1D1D1D",
}: AnimatedFABProps) {
  const scale = useSharedValue(0);
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.6);
  const rotation = useSharedValue(0);

  useEffect(() => {
    // Spring entrance
    scale.value = withSpring(1, {
      damping: 12,
      stiffness: 120,
    });

    // Continuous subtle breathing pulse ring
    pulseScale.value = withRepeat(
      withTiming(1.35, { duration: 1800, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
    pulseOpacity.value = withRepeat(
      withTiming(0, { duration: 1800, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
  }, []);

  const handlePressIn = () => {
    scale.value = withSpring(0.88, { damping: 10, stiffness: 200 });
    rotation.value = withSpring(45, { damping: 12, stiffness: 180 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 8, stiffness: 140 });
    rotation.value = withSpring(0, { damping: 10, stiffness: 140 });
  };

  const fabAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const iconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const pulseAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  return (
    <AnimatedPressable
      style={[styles.container, fabAnimatedStyle, style]}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      {/* Pulse Glow Ring */}
      <Animated.View style={[styles.pulseRing, pulseAnimatedStyle]} />

      {/* FAB Inner Button */}
      <Animated.View style={iconAnimatedStyle}>
        <MaterialIcons name={iconName} size={size} color={color} />
      </Animated.View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 92,
    right: 20,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#00DEAB",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#00DEAB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 99,
  },
  pulseRing: {
    position: "absolute",
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#00DEAB",
    zIndex: -1,
  },
});
