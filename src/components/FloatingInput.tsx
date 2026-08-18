import { useEffect, useRef, useState } from "react";
import {
  Animated,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  TextInput,
  TextInputFocusEventData,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface FloatingInputProps extends TextInputProps {
  label: string;
  secureToggle?: boolean;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  containerStyle?: ViewStyle;
}

export default function FloatingInput({
  label,
  secureToggle = false,
  rightIcon,
  value,
  onChangeText,
  onFocus,
  onBlur,
  containerStyle,
  style,
  ...rest
}: FloatingInputProps) {
  const [focused, setFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const floated = focused || !!value;
  const anim = useRef(new Animated.Value(floated ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: floated ? 1 : 0,
      duration: 150,
      useNativeDriver: false,
    }).start();
  }, [floated, anim]);

  const handleFocus = (e: any) => {
    setFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e: any) => {
    setFocused(false);
    onBlur?.(e);
  };

  // When floated: label sits at -10 (above border), when not: sits centered in box
  const labelTop = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [13, -10],
  });
  const labelSize = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [15, 12],
  });

  return (
    <Pressable
      style={[
        styles.wrapper,
        (focused || !!value) && styles.wrapperFocused,
        containerStyle,
      ]}
      onPress={() => inputRef.current?.focus()}
    >
      <Animated.Text
        allowFontScaling={false}
        pointerEvents="none"
        style={[
          styles.label,
          {
            top: labelTop,
            fontSize: labelSize,
            color: focused || !!value ? "#1D1D1D" : "#8E8E93",
          },
        ]}
      >
        {label}
      </Animated.Text>

      <TextInput
        ref={inputRef}
        allowFontScaling={false}
        style={[styles.input, (secureToggle || rightIcon) && { paddingRight: 40 }, style]}
        value={value}
        onChangeText={onChangeText}
        onFocus={handleFocus}
        onBlur={handleBlur}
        secureTextEntry={secureToggle && !showPassword}
        placeholderTextColor="transparent"
        {...rest}
      />

      {secureToggle && (
        <Pressable
          style={styles.eyeIcon}
          onPress={() => setShowPassword((v) => !v)}
          hitSlop={8}
        >
          <Ionicons
            name={showPassword ? "eye-off" : "eye"}
            size={20}
            color={focused || !!value ? "#1D1D1D" : "#8E8E93"}
          />
        </Pressable>
      )}

      {rightIcon && !secureToggle && (
        <View style={styles.rightIconWrap} pointerEvents="none">
          <Ionicons
            name={rightIcon}
            size={18}
            color={focused || !!value ? "#1D1D1D" : "#8E8E93"}
          />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderWidth: 1,
    borderColor: "#E6E6E6",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#fff",
    marginTop: 10,
    position: "relative",
  },
  wrapperFocused: {
    borderColor: "#1D1D1D",
  },
  label: {
    position: "absolute",
    left: 12,
    fontFamily: "SF_Pro_Regular",
    backgroundColor: "#fff",
    paddingHorizontal: 4,
    color: "#E6E6E6",
    zIndex: 1,
  },
  input: {
    fontSize: 15,
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Regular",
    padding: 0,
    margin: 0,
    height: 20,
    textAlignVertical: "center",
  },
  eyeIcon: {
    position: "absolute",
    right: 14,
    top: 13,
    justifyContent: "center",
    zIndex: 2,
  },
  rightIconWrap: {
    position: "absolute",
    right: 14,
    top: 13,
    justifyContent: "center",
    zIndex: 2,
  },
});
