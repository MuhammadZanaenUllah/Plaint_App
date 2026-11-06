// Plain non-interactive row used for read-only tables (e.g. dependency
// lists). Extracted from SingleTaskTable with no behaviour change (AUD-080).

import { TaskRowProps } from "@/components/TaskRow";
import { renderCounters } from "@/features/tasks/dev/counters";
import { memo } from "react";
import { View } from "react-native";
import type { SingleTaskTableColumn } from "./taskTableLayout";
import { ROW_HEIGHT } from "./taskTableLayout";
import { taskTableStyles as styles } from "./taskTableStyles";
import { TaskCellContent } from "./TaskRowCells";
import { LeadingCell } from "./TaskRowLeadingCell";

export const ReadOnlyRow = memo(function ReadOnlyRow({
  item,
  columns,
  columnWidths,
  leadingWidth,
  innerPadding,
  onTaskPress,
  onRemoveTask,
}: {
  item: TaskRowProps;
  columns: SingleTaskTableColumn[];
  columnWidths: Partial<Record<SingleTaskTableColumn, number>>;
  leadingWidth: number;
  innerPadding: number;
  onTaskPress?: (task: TaskRowProps) => void;
  onRemoveTask?: (task: TaskRowProps) => void;
}) {
  renderCounters.row(item.id ?? item.title);
  return (
    <View
      style={[styles.row, { minHeight: ROW_HEIGHT, paddingLeft: innerPadding }]}
    >
      <LeadingCell
        item={item}
        width={leadingWidth}
        readOnly
        onToggle={() => {}}
      />
      {columns.map((key) => (
        <TaskCellContent
          key={key}
          item={item}
          columnKey={key}
          width={columnWidths[key]!}
          onPress={key === "title" ? () => onTaskPress?.(item) : undefined}
          onRemove={key === "remove" ? () => onRemoveTask?.(item) : undefined}
        />
      ))}
    </View>
  );
});
