import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const CARD_WIDTH = (Dimensions.get("window").width - 40 - 12 * 2) / 2.2;

type Props = {
  label: string;
  count: string | number;
  iconName?: React.ComponentProps<typeof Ionicons>["name"] | React.ReactNode;
  active?: boolean;
  onPress?: () => void;
  style?: any;
  cardContentStyle?: any;
  labelStyle?: any;
  countStyle?: any;
  // Shrinks the card to a single inline row (icon + label + count) — used
  // once the Tasks screen's list has scrolled, to match the collapsed header.
  compact?: boolean;
};

export default function StatCard({
  label,
  count,
  iconName,
  active,
  onPress,
  style,
  cardContentStyle,
  labelStyle,
  countStyle,
  compact = false,
}: Props) {
  const renderIcon = () => {
    if (!iconName) return null;
    if (typeof iconName === "string") {
      return (
        <Ionicons
          name={iconName as React.ComponentProps<typeof Ionicons>["name"]}
          size={18}
          color="#00DEAB"
        />
      );
    }
    return iconName as React.ReactNode;
  };

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={[
        styles.card,
        compact && styles.cardCompact,
        active && styles.activeCard,
        style,
      ]}
    >
      {iconName && (
        <View style={[styles.iconBox, compact && styles.iconBoxCompact]}>
          {renderIcon()}
        </View>
      )}

      <View
        style={[
          styles.content,
          compact && styles.contentCompact,
          cardContentStyle,
        ]}
      >
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit={!compact}
          minimumFontScale={0.8}
          style={[styles.label, compact && styles.labelCompact, labelStyle]}
        >
          {label}
        </Text>

        <Text
          style={[styles.count, compact && styles.countCompact, countStyle]}
        >
          {count}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    width: 142,
    minHeight: 56,
    gap: 8,

    backgroundColor: "#fff",

    borderWidth: 1,
    borderColor: "#E6E6E6",

    borderRadius: 12,

    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  cardCompact: {
    width: "auto",
    minHeight: 34,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },

  activeCard: {
    borderColor: "#0DDFAB",
    borderWidth: 1,
  },

  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,

    backgroundColor: "#E6FFFF",

    justifyContent: "center",
    alignItems: "center",
  },

  iconBoxCompact: {
    width: 22,
    height: 22,
    borderRadius: 6,
  },

  content: {
    flexDirection: "column",
    alignItems: "flex-start",
    flex: 1,
  },

  contentCompact: {
    flexDirection: "row",
    alignItems: "center",
    flex: 0,
    gap: 5,
  },

  label: {
    fontSize: 10,
    color: "#6B7280",
    fontFamily: "SF_Pro_Regular",
    fontWeight: "400",
  },

  labelCompact: {
    fontSize: 10,
    color: "#1D1D1D",
  },

  count: {
    fontSize: 14,
    fontFamily: "SF_Pro_Bold",
    fontWeight: "700",
    color: "#1D1D1D",
    marginTop: 0,
  },

  countCompact: {
    fontSize: 13,
    marginTop: 0,
  },
});
