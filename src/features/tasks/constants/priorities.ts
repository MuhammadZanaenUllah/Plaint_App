// Compatibility re-exports. Canonical constants live in taskConstants.ts.
export { PRIORITY_VALUES } from "./taskConstants";

export const PRIORITY_NORMAL = "normal" as const;
export const PRIORITY_CRITICAL = "critical" as const;

export const PRIORITY_DISPLAY: Record<"normal" | "critical", { name: string; color: string }> = {
  normal: { name: "Normal", color: "#0DDFAB" },
  critical: { name: "Critical", color: "#FF4444" },
};

export const PRIORITY_ACCENT_COLORS = {
  normal: "#0DDFAB",
  critical: "#FF4444",
} as const;
