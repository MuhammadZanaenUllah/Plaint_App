// Priority constants
// Phase 1 — Foundation

export const PRIORITY_NORMAL = "normal";
export const PRIORITY_CRITICAL = "critical";

export const PRIORITY_DISPLAY: Record<"normal" | "critical", { name: string; color: string }> = {
  normal: { name: "Normal", color: "#0DDFAB" },
  critical: { name: "Critical", color: "#FF4444" },
};

export const PRIORITY_ACCENT_COLORS = {
  normal: "#0DDFAB",
  critical: "#FF4444",
};