import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { ReactNode, useCallback } from "react";
import { StyleSheet, Text, TouchableOpacity, View, StyleProp, ViewStyle } from "react-native";

type Props = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  rightActions?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export default function ScreenHeader({
  title,
  subtitle,
  onBack,
  rightActions,
  style,
}: Props) {
  const handleBack = useCallback(() => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  }, [onBack]);

  return (
    <View style={[styles.header, style]}>
      <TouchableOpacity onPress={handleBack} hitSlop={8} style={styles.backBtn}>
        <Ionicons name="chevron-back" size={24} color="#1D1D1D" />
      </TouchableOpacity>

      <View style={styles.titleCol}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        )}
      </View>

      {!!rightActions && <View style={styles.rightActions}>{rightActions}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
  },
  backBtn: {
    width: 32,
    justifyContent: "center",
  },
  titleCol: {
    flex: 1,
    marginHorizontal: 6,
  },
  title: {
    fontSize: 17,
    fontFamily: "SF_Pro_Semibold",
    color: "#1C1C1E",
  },
  subtitle: {
    marginTop: 2,
    fontSize: 11,
    fontFamily: "SF_Pro_Regular",
    color: "#8E8E93",
    flexShrink: 1,
  },
  rightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
});
