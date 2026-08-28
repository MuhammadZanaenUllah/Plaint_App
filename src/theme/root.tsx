import { rf } from "@/utils/responsive";

export const Colors = {
  primary: '#1ED9A5',
  primaryDark: '#12C298',
  gradientTop: '#8FF0D3',
  gradientBottom: '#FFFFFF',
  background: '#FFFFFF',
  textPrimary: '#1D1D1D',
  textSecondary: '#6B6B6B',
  placeholder: '#E6E6E6',
  inputBorderFocused: '#1D1D1D',
  inputBorderDefault: '#E6E6E6',
  inputBackground: '#F7F7F7',
  bgButtonColor : '#00DFAB',
  buttonText: '#1D1D1D',
  link: '#1A1A1A',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const Typography = {
  logo: {
    fontSize: rf(22),
    fontWeight: '800' as const,
    letterSpacing: 1,
  },
  heading: {
    fontSize: rf(24),
    fontWeight: '600' as const,
  },
  label: {
    fontSize: rf(12),
    fontWeight: '400' as const,
  },
  input: {
    fontSize: rf(15),
    fontWeight: '500' as const,
  },
  button: {
    fontSize: rf(16),
    fontWeight: '700' as const,
  },
  link: {
    fontSize: rf(13),
    fontWeight: '600' as const,
  },
};

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 28,
  screen: 40,
};