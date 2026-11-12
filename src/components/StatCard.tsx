import { rf } from "@/utils/responsive";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

const FULL_CARD_WIDTH = 142;
const FULL_CARD_HEIGHT = 56;
const COMPACT_CARD_HEIGHT = 34;
const CARD_BORDER_WIDTH = 1;

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

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
  /**
   * Continuous collapse progress: 0 = full card, 1 = compact card.
   * When provided the card morphs on the UI thread instead of switching
   * layouts via a layout animation.
   */
  collapseProgress?: SharedValue<number>;
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
  collapseProgress,
}: Props) {
  const fallbackProgress = useSharedValue(0);
  const compactWidth = useSharedValue(FULL_CARD_WIDTH);
  const progress = collapseProgress ?? fallbackProgress;
  const isAnimated = collapseProgress !== undefined;

  const animatedCardStyle = useAnimatedStyle(() => {
    if (!isAnimated) return {};
    const p = Math.min(1, Math.max(0, progress.value));
    return {
      width: interpolate(
        p,
        [0, 1],
        [FULL_CARD_WIDTH, compactWidth.value],
        Extrapolation.CLAMP,
      ),
      height: interpolate(
        p,
        [0, 1],
        [FULL_CARD_HEIGHT, COMPACT_CARD_HEIGHT],
        Extrapolation.CLAMP,
      ),
      borderRadius: interpolate(p, [0, 1], [12, 10], Extrapolation.CLAMP),
    };
  }, [isAnimated]);

  const fullLayerStyle = useAnimatedStyle(() => {
    if (!isAnimated) return { opacity: 1 };
    const p = Math.min(1, Math.max(0, progress.value));
    return {
      opacity: interpolate(
        p,
        [0, 0.45, 0.55, 1],
        [1, 1, 0, 0],
        Extrapolation.CLAMP,
      ),
    };
  }, [isAnimated]);

  const compactLayerStyle = useAnimatedStyle(() => {
    if (!isAnimated) return { opacity: 0 };
    const p = Math.min(1, Math.max(0, progress.value));
    return {
      opacity: interpolate(
        p,
        [0, 0.45, 0.55, 1],
        [0, 0, 1, 1],
        Extrapolation.CLAMP,
      ),
    };
  }, [isAnimated]);

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

  const renderCardContent = (compactMode: boolean) => (
    <>
      {iconName && (
        <View style={[styles.iconBox, compactMode && styles.iconBoxCompact]}>
          {renderIcon()}
        </View>
      )}

      <View
        style={[
          styles.content,
          compactMode && styles.contentCompact,
          !compactMode && cardContentStyle,
        ]}
      >
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit={!compactMode}
          minimumFontScale={0.8}
          style={[
            styles.label,
            compactMode && styles.labelCompact,
            labelStyle,
          ]}
        >
          {label}
        </Text>

        <Text
          style={[styles.count, compactMode && styles.countCompact, countStyle]}
        >
          {count}
        </Text>
      </View>
    </>
  );

  if (isAnimated) {
    return (
      <AnimatedTouchable
        activeOpacity={0.8}
        onPress={onPress}
        style={[
          styles.animatedCard,
          active && styles.activeCard,
          animatedCardStyle,
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[styles.layer, styles.fullLayer, fullLayerStyle]}
        >
          {renderCardContent(false)}
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          onLayout={(event) => {
            const width = event.nativeEvent.layout.width;
            // Only measure at rest. Measuring through the whole transition
            // can feed the step's own layout back into its target width.
            if (
              width > 0 &&
              (progress.value <= 0.01 || progress.value >= 0.99)
            ) {
              compactWidth.set(width + CARD_BORDER_WIDTH * 2);
            }
          }}
          style={[styles.layer, styles.compactLayer, compactLayerStyle]}
        >
          {renderCardContent(true)}
        </Animated.View>
      </AnimatedTouchable>
    );
  }

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
      {renderCardContent(compact)}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    width: FULL_CARD_WIDTH,
    minHeight: FULL_CARD_HEIGHT,
    gap: 8,

    backgroundColor: "#fff",

    borderWidth: CARD_BORDER_WIDTH,
    borderColor: "#E6E6E6",

    borderRadius: 12,

    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  animatedCard: {
    backgroundColor: "#fff",
    borderWidth: CARD_BORDER_WIDTH,
    borderColor: "#E6E6E6",
    overflow: "hidden",
  },

  layer: {
    position: "absolute",
    left: 0,
    top: 0,
  },

  fullLayer: {
    width: "100%",
    minHeight: FULL_CARD_HEIGHT - CARD_BORDER_WIDTH * 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  compactLayer: {
    minHeight: COMPACT_CARD_HEIGHT - CARD_BORDER_WIDTH * 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  cardCompact: {
    width: "auto",
    minHeight: COMPACT_CARD_HEIGHT,
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
    fontSize: rf(10),
    color: "#6B7280",
    fontFamily: "SF_Pro_Regular",
    fontWeight: "400",
  },

  labelCompact: {
    fontSize: rf(10),
    color: "#1D1D1D",
  },

  count: {
    fontSize: rf(14),
    fontFamily: "SF_Pro_Bold",
    fontWeight: "700",
    color: "#1D1D1D",
    marginTop: 0,
  },

  countCompact: {
    fontSize: rf(13),
    marginTop: 0,
  },
});
