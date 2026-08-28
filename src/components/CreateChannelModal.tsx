import { rf } from "@/utils/responsive";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";

interface FloatingInputProps {
  value: string;
  onChangeText: (t: string) => void;
  label: string;
}

function FloatingInput({ value, onChangeText, label }: FloatingInputProps) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const animate = (to: number) =>
    Animated.timing(anim, { toValue: to, duration: 180, useNativeDriver: false }).start();

  const handleFocus = () => { animate(1); setFocused(true); };
  const handleBlur = () => { if (!value) animate(0); setFocused(false); };

  const labelTop = anim.interpolate({ inputRange: [0, 1], outputRange: [13, -10] });
  const labelSize = anim.interpolate({ inputRange: [0, 1], outputRange: [14, 11] });
  const activeColor = "#1D1D1D";
  const labelColor = focused || value ? activeColor : "#A0A0A0";
  const borderColor = focused ? "#1D1D1D" : "#D1D5DB";

  return (
    <TouchableWithoutFeedback onPress={() => inputRef.current?.focus()}>
      <View style={[inputStyles.wrapper, { borderColor }]}>
        <Animated.Text
          style={[
            inputStyles.label,
            {
              top: labelTop,
              fontSize: labelSize,
              color: labelColor,
            },
          ]}
        >
          {label}
        </Animated.Text>
        <TextInput
          ref={inputRef}
          style={inputStyles.input}
          value={value}
          onChangeText={onChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          autoCorrect={false}
          autoCapitalize="words"
        />
      </View>
    </TouchableWithoutFeedback>
  );
}

const inputStyles = StyleSheet.create({
  wrapper: {
    borderWidth: 1.3,
    borderRadius: 8,
    marginHorizontal: 20,
    marginBottom: 20,
    paddingHorizontal: 14,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    height: 45,
    position: "relative",
  },
  label: {
    position: "absolute",
    left: 12,
    backgroundColor: "#fff",
    paddingHorizontal: 3,
    fontFamily: "SF_Pro_Regular",
    zIndex: 1,
  },
  input: {
    flex: 1,
    fontSize: rf(15),
    fontFamily: "SF_Pro_Medium",
    color: "#1D1D1D",
    paddingVertical: 0,
    height: "100%",
  },
});

interface CreateChannelModalProps {
  visible: boolean;
  onClose: () => void;
  onNext: (channelName: string) => void;
  title?: string;
  placeholder?: string;
}

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function CreateChannelModal({
  visible,
  onClose,
  onNext,
  title = "Create Channel",
  placeholder = "Write your channel name",
}: CreateChannelModalProps) {
  const [channelName, setChannelName] = useState("");

  let mainTitle = title;
  let projectName = "";

  if (title.includes(' to "')) {
    const parts = title.split(' to "');
    mainTitle = parts[0];
    projectName = parts[1]?.replace(/"$/, "") || "";
  }

  const handleClose = () => {
    Keyboard.dismiss();
    setChannelName("");
    onClose();
  };

  const handleNext = () => {
    Keyboard.dismiss();
    onNext(channelName);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={modalStyles.backdrop} />
      </TouchableWithoutFeedback>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={StyleSheet.absoluteFill}
        pointerEvents="box-none"
      >
        <View style={modalStyles.kavWrapper}>
          <View style={modalStyles.sheet}>
            <View style={modalStyles.header}>
              <View style={modalStyles.headerTitleCol}>
                <Text style={modalStyles.mainTitle}>{mainTitle}</Text>
                {projectName ? (
                  <View style={modalStyles.projectBadge}>
                    <Ionicons name="folder-outline" size={13} color="#00DEAB" style={{ marginRight: 5 }} />
                    <Text style={modalStyles.projectBadgeText} numberOfLines={1}>
                      {projectName}
                    </Text>
                  </View>
                ) : null}
              </View>
              <TouchableOpacity
                style={modalStyles.closeBtn}
                onPress={handleClose}
                activeOpacity={0.7}
                hitSlop={8}
              >
                <Ionicons name="close" size={18} color="#1D1D1D" />
              </TouchableOpacity>
            </View>

            <FloatingInput
              label={placeholder}
              value={channelName}
              onChangeText={setChannelName}
            />

            <TouchableOpacity
              style={modalStyles.nextBtn}
              activeOpacity={0.85}
              onPress={handleNext}
            >
              <Text style={modalStyles.nextBtnText}>Next</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  kavWrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  sheet: {
    backgroundColor: "#fff",
    borderRadius: 24,
    width: "90%",
    paddingTop: 24,
    paddingBottom: 24,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginHorizontal: 20,
    marginBottom: 20,
  },
  headerTitleCol: {
    flex: 1,
    marginRight: 12,
  },
  mainTitle: {
    fontSize: rf(20),
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
  },
  projectBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E6FBF5",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 6,
    alignSelf: "flex-start",
  },
  projectBadgeText: {
    fontSize: rf(12),
    fontFamily: "SF_Pro_Medium",
    color: "#00DEAB",
    maxWidth: 200,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  nextBtn: {
    backgroundColor: "#00DEAB",
    borderRadius: 10,
    marginHorizontal: 20,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  nextBtnText: {
    color: "#fff",
    fontSize: rf(15),
    fontFamily: "SF_Pro_Semibold",
  },
});
