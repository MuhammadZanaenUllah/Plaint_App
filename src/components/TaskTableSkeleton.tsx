import { rf } from "@/utils/responsive";
import Icons from "@/constants/icons";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";

// Every constant and formula below is copied verbatim from
// SingleTaskTable.tsx's own ROW_HEIGHT/getTableMetrics/row styles — this
// previously hand-approximated the real layout and drifted from it (wrong
// row height, wrong font sizes, wrong avatar shape, missing paddings, and a
// leading-cell structure that didn't match the real absolute-positioned
// accent bar). Copy exactly instead of re-deriving, so it can't drift again
// silently the next time the real table's metrics change.
const ROW_HEIGHT = 35;
const MAX_TABLE_WIDTH = 640;
const MIN_TABLE_WIDTH = 320;

function getTableMetrics(windowWidth: number) {
  const insetTableWidth = Math.max(
    MIN_TABLE_WIDTH,
    Math.min(windowWidth - 32, MAX_TABLE_WIDTH),
  );
  const naturalTableWidth = windowWidth;
  const tableWidth = Math.max(
    MIN_TABLE_WIDTH,
    Math.min(naturalTableWidth, MAX_TABLE_WIDTH),
  );
  const tableWidthClamped = tableWidth !== naturalTableWidth;
  // Only non-zero in the common (unclamped, phone-width) case — compensates
  // for the container being edge-flush instead of the old centered-card
  // inset. See SingleTaskTable.tsx's getTableMetrics for the full story.
  const leftCompensation = tableWidthClamped ? 0 : 16;
  const innerPadding = 6;
  const contentWidth = insetTableWidth - innerPadding * 2;
  const leadingWidth = 32;
  const actionWidth = 26;
  const dataWidth = contentWidth - leadingWidth - actionWidth;
  const dueDateWidth = Math.max(80, Math.round(dataWidth * 0.3));
  const createdByWidth = Math.max(88, Math.round(dataWidth * 0.31));
  const titleWidth = Math.max(104, dataWidth - dueDateWidth - createdByWidth);

  return {
    tableWidth,
    tableWidthClamped,
    leftCompensation,
    innerPadding,
    leadingWidth,
    titleWidth,
    createdByWidth,
    dueDateWidth,
    actionWidth,
  };
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
 * structure (section header → column header → task rows) with static bone
 * placeholders. Fills the full remaining height so placeholders extend to
 * the bottom of the screen instead of stopping short.
 */
export default function TaskTableSkeleton({
  rowCount = 6,
  showStatCards = false,
  sectionTitle = "All Tasks",
}: TaskTableSkeletonProps) {
  const { width: windowWidth } = useWindowDimensions();
  const m = getTableMetrics(windowWidth);

  return (
    <View
      style={[
        styles.root,
        {
          width: m.tableWidth,
          alignSelf: m.tableWidthClamped ? "center" : "flex-end",
        },
      ]}
    >
      {showStatCards ? (
        <View style={styles.statsScroll}>
          {Array.from({ length: 8 }).map((_, i) => (
            <View key={`stat-${i}`} style={styles.statCardPlaceholder} />
          ))}
        </View>
      ) : null}

      {/* Real section header — identical to SingleTaskTable */}
      <View
        style={[styles.sectionHeader, { marginLeft: m.leftCompensation }]}
      >
        <Text style={styles.sectionTitle}>{sectionTitle}</Text>
        <View style={styles.filterBtn}>
          <FilterIconBlack width={18} height={18} />
        </View>
      </View>

      {/* Real column headers — identical text to SingleTaskTable */}
      <View
        style={[
          styles.tableHeader,
          {
            paddingHorizontal: m.innerPadding,
            marginLeft: m.leftCompensation,
          },
        ]}
      >
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
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** A single skeleton row — structure copied from SingleTaskTable's
 *  LeadingCell + TaskCellContent (title/createdBy/dueDate), not
 *  re-approximated. */
function SkeletonRow({ m }: { m: ReturnType<typeof getTableMetrics> }) {
  return (
    <View
      style={[
        styles.row,
        {
          minHeight: ROW_HEIGHT,
          paddingLeft: m.innerPadding + m.leftCompensation,
        },
      ]}
    >
      {/* Leading cell: accent bar is absolutely positioned inside (matches
          LeadingCell exactly), checkbox centered in the full cell width. */}
      <View style={[styles.leadingCell, { width: m.leadingWidth }]}>
        <View style={styles.accent} />
        <View style={styles.checkboxWrap}>
          <View style={styles.checkbox} />
        </View>
      </View>

      {/* Title column */}
      <View style={[styles.titleCell, { width: m.titleWidth }]}>
        <View style={styles.titleLine} />
      </View>

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
      <View style={styles.actionCell}>
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
    marginBottom: 6,
    marginRight: 16,
  },
  sectionTitle: {
    fontSize: rf(15),
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
    height: 26,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E5E7EB",
    borderRadius: 4,
    marginBottom: 4,
    marginRight: 16,
  },
  colHead: {
    fontSize: rf(10),
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
  /* shared row chrome — matches SingleTaskTable's `row` style */
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    backgroundColor: "#fff",
  },
  /* leading cell — matches LeadingCell: accent absolutely positioned inside
     a full-width cell, checkbox centered via a flex:1 wrap. */
  leadingCell: {
    height: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
  },
  accent: {
    position: "absolute",
    left: 0,
    width: 3.5,
    height: 25,
    borderRadius: 4,
    backgroundColor: SKELETON_BG_DARK,
  },
  checkboxWrap: {
    flex: 1,
    height: ROW_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  checkbox: {
    width: 17,
    height: 17,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: SKELETON_BG_DARK,
    backgroundColor: "#fff",
  },
  /* title cell — matches titleCell (paddingRight:8) + titleText */
  titleCell: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 8,
  },
  titleLine: {
    width: "70%",
    height: 12,
    borderRadius: 2,
    backgroundColor: SKELETON_BG_DARK,
  },
  /* created-by cell — matches userCell (paddingRight:6) + Avatar (24,
     borderRadius 6 — a rounded square, not a circle) */
  userCell: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 6,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: SKELETON_BG_DARK,
    marginRight: 6,
  },
  nameLine: {
    flex: 1,
    height: 12,
    borderRadius: 2,
    backgroundColor: SKELETON_BG_DARK,
  },
  /* due-date cell — matches dateCell (paddingRight:6) */
  dateCell: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 6,
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
  /* action cell — floats to the row's true right edge, matching actionPress */
  actionCell: {
    alignItems: "center",
    justifyContent: "center",
    marginLeft: "auto",
  },
  chevronBadge: {
    width: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: SKELETON_BG_DARK,
  },
});
