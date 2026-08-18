import Icons from "@/constants/icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

// Layout constants mirror SingleTaskTable.tsx so the skeleton lines up pixel
// perfect with the real table that eventually replaces it.
const ROW_HEIGHT = 39;
const MAX_TABLE_WIDTH = 640;
const MIN_TABLE_WIDTH = 320;
const SHIMMER_SIZE = 600;

function getTableMetrics(windowWidth: number) {
  // Mirrors SingleTaskTable.tsx: governs the header bar and data columns,
  // unchanged from the original symmetric 16px-each-side inset.
  const insetTableWidth = Math.max(
    MIN_TABLE_WIDTH,
    Math.min(windowWidth - 32, MAX_TABLE_WIDTH),
  );
  // Mirrors SingleTaskTable.tsx: the container's actual box width —
  // edge-flush on the right so the action column can reach the true screen edge.
  const tableWidth = Math.max(
    MIN_TABLE_WIDTH,
    Math.min(windowWidth - 16, MAX_TABLE_WIDTH),
  );
  const innerPadding = 6;
  const contentWidth = insetTableWidth - innerPadding * 2;
  const leadingWidth = 32;
  const actionWidth = 26;
  const dataWidth = contentWidth - leadingWidth - actionWidth;
  const dueDateWidth = Math.max(80, Math.round(dataWidth * 0.3));
  const createdByWidth = Math.max(88, Math.round(dataWidth * 0.31));
  const titleWidth = Math.max(
    104,
    dataWidth - dueDateWidth - createdByWidth,
  );
  // Half of chevronBadge's 21px width — actionCell clips to this via
  // overflow:hidden + marginLeft:"auto".
  const chevronClipWidth = 11;

  return {
    tableWidth,
    innerPadding,
    leadingWidth,
    actionWidth,
    chevronClipWidth,
    titleWidth,
    createdByWidth,
    dueDateWidth,
  };
}

/**
 * A rich, multi-directional shimmer overlay. A diagonal gradient band sweeps
 * across the content (combining left→right and top→bottom motion in a single
 * diagonal pass) while its own opacity breathes, producing a lively "loading"
 * feel. Driven entirely by reanimated shared values so the gradient itself
 * never re-renders on each frame.
 */
function ShimmerOverlay({ tableWidth }: { tableWidth: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, {
        duration: 2400,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      false,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  const sweepDistance = tableWidth + SHIMMER_SIZE;
  const heightRange = 1200 + SHIMMER_SIZE;

  const style = useAnimatedStyle(() => {
    const x = interpolate(progress.value, [0, 1], [0, sweepDistance]);
    const y = interpolate(progress.value, [0, 1], [0, heightRange]);
    const opacity = interpolate(
      progress.value,
      [0, 0.5, 1],
      [0.4, 0.85, 0.4],
    );
    return {
      transform: [{ translateX: x }, { translateY: y }],
      opacity,
    };
  });

  return (
    <Animated.View style={[styles.shimmer, style]} pointerEvents="none">
      <LinearGradient
        colors={["transparent", "rgba(255,255,255,0.6)", "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.shimmerGradient}
      />
    </Animated.View>
  );
}

const { FilterIconBlack } = Icons;

export type TaskTableSkeletonProps = {
  /** Number of skeleton task rows to render. */
  rowCount?: number;
  /** When true, render placeholder stat-card tabs above the table. */
  showStatCards?: boolean;
  /** Section title displayed above the table (matches SingleTaskTable). */
  sectionTitle?: string;
};

/**
 * Skeleton loading state for the tasks screen. Mirrors the real TaskTable
 * structure (section header → column header → task rows) with a sweeping
 * diagonal shimmer. Fills the full remaining height so placeholders extend
 * to the bottom of the screen instead of stopping short.
 */
export default function TaskTableSkeleton({
  rowCount = 6,
  showStatCards = false,
  sectionTitle = "All Tasks",
}: TaskTableSkeletonProps) {
  const { width: windowWidth } = useWindowDimensions();
  const m = getTableMetrics(windowWidth);

  return (
    <View style={[styles.root, { width: m.tableWidth }]}>
      {showStatCards ? (
        <View style={styles.statsScroll}>
          {Array.from({ length: 8 }).map((_, i) => (
            <View key={`stat-${i}`} style={styles.statCardPlaceholder} />
          ))}
        </View>
      ) : null}

      {/* Real section header — identical to SingleTaskTable */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{sectionTitle}</Text>
        <View style={styles.filterBtn}>
          <FilterIconBlack width={18} height={18} />
        </View>
      </View>

      {/* Real column headers — identical text to SingleTaskTable */}
      <View style={[styles.tableHeader, { paddingHorizontal: m.innerPadding }]}>
        <View style={{ width: m.leadingWidth }} />
        <Text style={[styles.colHead, { width: m.titleWidth }]}>Task Title</Text>
        <Text style={[styles.colHead, { width: m.createdByWidth }]}>Created By</Text>
        <Text style={[styles.colHead, { width: m.dueDateWidth }]}>Due Date</Text>
        <View style={{ width: m.actionWidth }} />
      </View>

      {/* Rows container — flex:1 so it fills all remaining vertical space */}
      <View style={styles.rowsWrap}>
        {/* Explicit skeleton rows */}
        {Array.from({ length: rowCount }).map((_, i) => (
          <SkeletonRow key={`row-${i}`} m={m} />
        ))}

        {/* Filler rows to fill any leftover space below */}
        {Array.from({ length: 20 }).map((_, i) => (
          <SkeletonRow key={`filler-${i}`} m={m} />
        ))}

        <ShimmerOverlay tableWidth={m.tableWidth} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** A single skeleton row that closely mirrors the real SwipeTaskRow layout. */
function SkeletonRow({ m }: { m: ReturnType<typeof getTableMetrics> }) {
  return (
    <View
      style={[
        styles.row,
        { minHeight: ROW_HEIGHT, paddingLeft: m.innerPadding },
      ]}
    >
      {/* Accent bar — same position as the coloured priority bar in real rows */}
      <View style={styles.accent} />

      {/* Leading cell: checkbox placeholder */}
      <View style={[styles.leadingCell, { width: m.leadingWidth - 3.5 - 6 }]}>
        <View style={styles.checkbox} />
      </View>

      {/* Title column */}
      <View style={[styles.titleLine, { width: m.titleWidth - 16 }]} />

      {/* Created-by column: avatar + name bar */}
      <View style={[styles.userCell, { width: m.createdByWidth }]}>
        <View style={styles.avatar} />
        <View style={styles.nameLine} />
      </View>

      {/* Due-date column: calendar icon + date bar */}
      <View style={[styles.dateCell, { width: m.dueDateWidth }]}>
        <View style={styles.dateIcon} />
        <View style={styles.dateLine} />
      </View>

      {/* Action cell: chevron-badge placeholder */}
      <View style={[styles.actionCell, { width: m.chevronClipWidth }]}>
        <View style={styles.chevronBadge} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const SKELETON_BG = "#E5E7EB";
const SKELETON_BG_DARK = "#C9CDD6";


const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignSelf: "center",
  },
  /* stat-card tab bar (optional) */
  statsScroll: {
    flexDirection: "row",
    gap: 6,
    paddingBottom: 15,
    marginBottom: 10,
  },
  statCardPlaceholder: {
    minWidth: 140,
    minHeight: 64,
    borderRadius: 12,
    backgroundColor: SKELETON_BG,
  },
  /* section header — matches SingleTaskTable exactly */
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    marginRight: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: "SF_Pro_Medium",
    color: "#1F2937",
  },
  filterBtn: {
    width: 35,
    height: 35,
    borderRadius: 8,
    backgroundColor: "#E6E6E6",
    alignItems: "center",
    justifyContent: "center",
  },
  /* table column header — matches SingleTaskTable */
  tableHeader: {
    height: 31,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E5E7EB",
    borderRadius: 4,
    marginBottom: 8,
    marginRight: 16,
  },
  colHead: {
    fontSize: 12,
    fontFamily: "SF_Pro_Bold",
    fontWeight: "700",
    color: "#1D1D1D",
    textAlign: "center",
  },
  /* rows container — fills remaining screen height */
  rowsWrap: {
    flex: 1,
    position: "relative",
    backgroundColor: "#fff",
    borderRadius: 4,
    overflow: "hidden",
  },
  /* shared row chrome */
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    backgroundColor: "#fff",
  },
  accent: {
    width: 3.5,
    height: 25,
    borderRadius: 4,
    backgroundColor: SKELETON_BG_DARK,
    marginRight: 6,
  },
  leadingCell: {
    height: ROW_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  checkbox: {
    width: 17,
    height: 17,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: SKELETON_BG_DARK,
    backgroundColor: "#fff",
  },
  titleLine: {
    height: 12,
    borderRadius: 2,
    backgroundColor: SKELETON_BG_DARK,
  },
  userCell: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 21,
    height: 21,
    borderRadius: 10.5,
    backgroundColor: SKELETON_BG_DARK,
    marginRight: 6,
  },
  nameLine: {
    flex: 1,
    height: 12,
    borderRadius: 2,
    backgroundColor: SKELETON_BG_DARK,
  },
  dateCell: {
    flexDirection: "row",
    alignItems: "center",
  },
  dateIcon: {
    width: 16,
    height: 16,
    borderRadius: 2,
    backgroundColor: SKELETON_BG_DARK,
    marginRight: 5,
  },
  dateLine: {
    width: 48,
    height: 12,
    borderRadius: 2,
    backgroundColor: SKELETON_BG_DARK,
  },
  actionCell: {
    alignItems: "flex-start",
    justifyContent: "center",
    marginLeft: "auto",
    overflow: "hidden",
  },
  chevronBadge: {
    width: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: SKELETON_BG_DARK,
  },
  /* diagonal shimmer sweep */
  shimmer: {
    position: "absolute",
    top: -SHIMMER_SIZE / 2,
    left: -SHIMMER_SIZE / 2,
    width: SHIMMER_SIZE,
    height: SHIMMER_SIZE,
    pointerEvents: "none",
  },
  shimmerGradient: {
    width: SHIMMER_SIZE,
    height: SHIMMER_SIZE,
  },
});
