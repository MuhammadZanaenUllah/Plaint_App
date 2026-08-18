import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface FloatingInputProps extends TextInputProps {
  label: string;
  secureToggle?: boolean;
}

export default function FloatingInput({
  label,
  secureToggle = false,
  value,
  onChangeText,
  onChange: onChangeProp,
  ...rest
}: FloatingInputProps) {
  const [focused, setFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Refs avoid stale-closure issues when updateContent is called from event handlers.
  const hasContentRef = useRef(!!value);
  const focusedRef = useRef(false);
  const [hasContent, setHasContent] = useState(!!value);

  const floated = focused || hasContent;
  const anim = useRef(new Animated.Value(floated ? 1 : 0)).current;

  const animate = (toValue: number) =>
    Animated.timing(anim, { toValue, duration: 150, useNativeDriver: false }).start();

  const updateContent = (has: boolean) => {
    if (hasContentRef.current === has) return;
    hasContentRef.current = has;
    setHasContent(has);
    // Use focusedRef (not state) so we always read the current value, not a stale closure.
    animate(has || focusedRef.current ? 1 : 0);
  };

  // Layer 1 — controlled value prop changes (external clears, programmatic sets, storage loads)
  useEffect(() => {
    updateContent(!!value);
  }, [value]);

  // Layer 2 — raw onChange: covers autofill on non-secure fields (may be suppressed on secure fields)
  const handleChange = (e: any) => {
    updateContent(!!e.nativeEvent.text);
    onChangeProp?.(e);
  };

  // Layer 3 — onChangeText interception: ALWAYS fires for every field type including
  // secureTextEntry password fields on Android where onChange can be suppressed.
  const handleChangeText = (text: string) => {
    updateContent(!!text);
    onChangeText?.(text);
  };

  const handleFocus = () => {
    focusedRef.current = true;
    setFocused(true);
    animate(1);
  };

  const handleBlur = () => {
    focusedRef.current = false;
    setFocused(false);
    if (!hasContentRef.current) animate(0);
  };

  // When floated: label sits at -10 (above border), when not: sits centered in box
  const labelTop = anim.interpolate({ inputRange: [0, 1], outputRange: [13, -10] });
  const labelSize = anim.interpolate({ inputRange: [0, 1], outputRange: [15, 12] });

  return (
    <View style={[styles.wrapper, floated && styles.wrapperFocused]}>
      <Animated.Text
        style={[
          styles.label,
          {
            top: labelTop,
            fontSize: labelSize,
            color: floated ? "#1D1D1D" : "#E6E6E6",
          },
        ]}
      >
        {label}
      </Animated.Text>

      <TextInput
        style={[styles.input, secureToggle && { paddingRight: 44 }]}
        value={value}
        onChangeText={handleChangeText}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChange={handleChange}
        secureTextEntry={secureToggle && !showPassword}
        placeholderTextColor="transparent"
        {...rest}
      />

      {secureToggle && (
        <Pressable style={styles.eyeIcon} onPress={() => setShowPassword((v) => !v)}>
          <Ionicons
            name={showPassword ? "eye-off" : "eye"}
            size={20}
            color={floated ? "#1D1D1D" : "#E6E6E6"}
          />
        </Pressable>
      )}
    </View>
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
    bottom: 0,
    top: 0,
    justifyContent: "center",
  },
});
