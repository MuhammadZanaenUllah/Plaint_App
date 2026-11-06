// Small presentational primitives shared by the task table row components
// (AUD-080). Behaviour is unchanged from the original SingleTaskTable.

import Icons from "@/constants/icons";
import { memo, useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { WAVE_BADGE_HEIGHT, WAVE_BADGE_WIDTH } from "./taskTableLayout";
import { taskTableStyles as styles } from "./taskTableStyles";

const { LeftWaveIcon, RightWaveIcon } = Icons;

export const CustomPullToRefreshBadge = memo(function CustomPullToRefreshBadge({
  pullDistance,
  refreshing,
}: {
  pullDistance: SharedValue<number>;
  refreshing: boolean;
}) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (refreshing) {
      rotation.value = withRepeat(
        withTiming(360, { duration: 800, easing: Easing.linear }),
        -1,
        false,
      );
    } else {
      rotation.value = 0;
    }
  }, [refreshing, rotation]);

  const animStyle = useAnimatedStyle(() => {
    if (refreshing) {
      return {
        transform: [
          { translateY: 10 },
          { scale: 1 },
          { rotate: `${rotation.value}deg` },
        ],
        opacity: 1,
      };
    }
    const dist = pullDistance.value;
    const progress = Math.min(1, Math.max(0, dist / 60));
    const translateY = Math.min(20, dist * 0.35);
    const scale = 0.4 + progress * 0.6;
    const opacity = Math.min(1, dist / 20);
    const rot = progress * 180;

    return {
      transform: [{ translateY }, { scale }, { rotate: `${rot}deg` }],
      opacity,
    };
  });

  return (
    <Animated.View
      style={[styles.pullContainer, animStyle]}
      pointerEvents="none"
    >
      <View style={styles.pullBadge}>
        <Svg width={20} height={20} viewBox="0 0 32 32" fill="none">
          <Circle
            cx={16}
            cy={16}
            r={13}
            stroke="#00DEAB"
            strokeWidth={3}
            strokeDasharray="52 28"
            strokeLinecap="round"
          />
        </Svg>
      </View>
    </Animated.View>
  );
});

// RightWaveIcon's flat edge is on the right (matches the row's closed-state
// chevron, clipped by the screen's right edge, bulging left into the row).
// LeftWaveIcon is its mirror — flat edge on the left, for the swipe-details
// panel's back button. Both already have their arrow glyph baked into the
// asset, so no separate Ionicons overlay is needed.
export function WaveChevronBadge({ mirrored = false }: { mirrored?: boolean }) {
  const WaveIcon = mirrored ? LeftWaveIcon : RightWaveIcon;
  return <WaveIcon width={WAVE_BADGE_WIDTH} height={WAVE_BADGE_HEIGHT} />;
}
