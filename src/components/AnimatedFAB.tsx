import React, { useEffect, useState } from "react";
import { Keyboard, Pressable, StyleSheet, View, ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { MaterialIcons } from "@expo/vector-icons";
import { useIsFocused } from "expo-router";

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
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const isFocused = useIsFocused();
  const scale = useSharedValue(1);
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.6);
  const rotation = useSharedValue(0);

  useEffect(() => {
    const showKeyboard = Keyboard.addListener("keyboardDidShow", () => {
      setKeyboardVisible(true);
    });

    const hideKeyboard = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardVisible(false);
    });

    return () => {
      showKeyboard.remove();
      hideKeyboard.remove();
    };
  }, []);

  useEffect(() => {
    // Breathing pulse ring — only while this tab is actually focused. Tab
    // screens stay mounted when you switch tabs, so without this guard the
    // withRepeat(-1) loop below never stops, forcing a native render frame
    // every ~16ms for the life of the app even while the user is on a
    // different tab entirely.
    if (!isFocused) {
      cancelAnimation(pulseScale);
      cancelAnimation(pulseOpacity);
      pulseScale.value = 1;
      pulseOpacity.value = 0.6;
      return;
    }
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
  }, [isFocused, pulseScale, pulseOpacity]);

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

  if (keyboardVisible) {
    return <View style={{ height: 0 }} />;
  }

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
    elevation: 9999,
    zIndex: 99999,
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
