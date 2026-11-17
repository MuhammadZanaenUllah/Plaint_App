import { Dimensions, PixelRatio, Text as RNText, TextInput as RNTextInput, useWindowDimensions } from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

/**
 * On tablets every screen renders in a centered column of this width (see
 * RootLayout). Anything sized from the screen width and laid out inside a
 * screen must use the content width below, not the window width. Full-window
 * overlays (RN <Modal>, toasts) keep using the window size.
 */
export const CONTENT_MAX_WIDTH = 720;

/** Width of the app's content column; updates on rotation / iPad split view. */
export function useContentWidth(): number {
  const { width } = useWindowDimensions();
  return Math.min(width, CONTENT_MAX_WIDTH);
}

/** Non-hook read of the content width, for event handlers. */
export function getContentWidth(): number {
  return Math.min(Dimensions.get("window").width, CONTENT_MAX_WIDTH);
}

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
 * Slightly denser type scale used by the Projects module so its cards, forms
 * and pickers stay visually consistent with the chat screens.
 */
export function projectResponsiveFontSize(size: number): number {
  return responsiveFontSize(size * 0.85);
}

export const prf = projectResponsiveFontSize;

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
