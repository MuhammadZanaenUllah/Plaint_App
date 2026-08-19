import { useEffect } from "react";
import { Gesture } from "react-native-gesture-handler";
import {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;

/**
 * Swipe-down-to-dismiss for a bottom sheet. Returns a Pan gesture to attach
 * to a small, non-scrollable zone (a drag handle and/or header row — NOT
 * the sheet's scrollable body, which would otherwise fight the gesture for
 * ownership of vertical touches) plus an animated style to apply to the
 * sheet's outer container, so dragging that zone visually drags the whole
 * sheet down.
 *
 * Mirrors the activeOffset/failOffset pattern already used for row-swipe
 * gestures in SingleTaskTable.tsx: a small dead zone lets plain taps on
 * buttons inside the wrapped zone (e.g. a header's close button) fall
 * through instead of being captured as a drag.
 */
export function useSwipeToDismiss(visible: boolean, onDismiss: () => void) {
  const translateY = useSharedValue(0);
  const startY = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = 0;
    }
  }, [visible, translateY]);

  const panGesture = Gesture.Pan()
    .activeOffsetY([-15, 15])
    .failOffsetX([-20, 20])
    .onBegin(() => {
      // eslint-disable-next-line react-hooks/immutability
      startY.value = translateY.value;
    })
    .onUpdate((e) => {
      const next = startY.value + e.translationY;
      // eslint-disable-next-line react-hooks/immutability
      translateY.value = next < 0 ? 0 : next;
    })
    .onEnd((e) => {
      if (translateY.value > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
        // eslint-disable-next-line react-hooks/immutability
        translateY.value = withTiming(700, { duration: 180 }, () => {
          runOnJS(onDismiss)();
        });
      } else {
        // eslint-disable-next-line react-hooks/immutability
        translateY.value = withSpring(0, { damping: 22, stiffness: 260 });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return { panGesture, animatedStyle };
}
