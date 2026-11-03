// Task-specific wrapper around the shared FilterModal. Keeps the task-only
// Assigned-To gate in one place while preserving FilterModal's public API.

import React from "react";
import FilterModal from "@/components/FilterModal";

type Props = Omit<React.ComponentProps<typeof FilterModal>, "showAssignedTo"> & {
  canUseOwnerFilter: boolean;
};

export default function TaskFilterModal({ canUseOwnerFilter, ...props }: Props) {
  return <FilterModal {...props} showAssignedTo={canUseOwnerFilter} />;
}
