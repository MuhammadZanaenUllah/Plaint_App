import { Dimensions, PixelRatio, Text as RNText, TextInput as RNTextInput } from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Base width standard (375px - standard mobile design baseline)
const BASE_WIDTH = 375;

/**
 * Calculates a responsive font size based on device screen width.
 * Prevents text from being microscopic on smaller devices or oversized on larger devices.
 */
export function responsiveFontSize(size: number): number {
  const scale = SCREEN_WIDTH / BASE_WIDTH;
  const newSize = size * scale;
  
  // Floor clamping: ensure font size never shrinks below 92% of original baseline size
  // and doesn't scale over 120% on very large screens.
  const clampedSize = Math.max(size * 0.92, Math.min(newSize, size * 1.2));
  return Math.round(PixelRatio.roundToNearestPixel(clampedSize));
}

export const rf = responsiveFontSize;

/**
 * Globally enforces allowFontScaling = false across all React Native <Text> and <TextInput>
 * components to prevent OS-level system font scaling from breaking app layout.
 */
export function setupGlobalFontScaling() {
  if ((RNText as any).defaultProps) {
    (RNText as any).defaultProps.allowFontScaling = false;
    (RNText as any).defaultProps.maxFontSizeMultiplier = 1;
  } else {
    (RNText as any).defaultProps = { allowFontScaling: false, maxFontSizeMultiplier: 1 };
  }

  if ((RNTextInput as any).defaultProps) {
    (RNTextInput as any).defaultProps.allowFontScaling = false;
    (RNTextInput as any).defaultProps.maxFontSizeMultiplier = 1;
  } else {
    (RNTextInput as any).defaultProps = { allowFontScaling: false, maxFontSizeMultiplier: 1 };
  }
}
