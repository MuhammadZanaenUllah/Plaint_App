// Assignee search + result cap (PERF-12 / contract §9.1).
// Two entry points preserve the exact behaviour of the create and detail
// pickers; only the list rebuild is shared.

export type AssigneeSearchRecord = {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
};

export const MAX_ASSIGNEE_RESULTS = 10;

function cap<T>(rows: T[]): T[] {
  return rows.slice(0, MAX_ASSIGNEE_RESULTS);
}

/** Create-task picker: first + last name, raw query (contract §9.1). */
export function filterAndCapCreateAssignees<T extends AssigneeSearchRecord>(
  owners: T[],
  query: string,
): T[] {
  const needle = query.toLowerCase();
  return cap(
    owners.filter((owner) =>
      `${owner.first_name ?? ""} ${owner.last_name ?? ""}`
        .toLowerCase()
        .includes(needle),
    ),
  );
}

/** Detail picker: first + last + full name, trimmed query. */
export function filterAndCapDetailAssignees<T extends AssigneeSearchRecord>(
  owners: T[],
  query: string,
): T[] {
  const needle = query.trim().toLowerCase();
  return cap(
    owners.filter((owner) =>
      `${owner.first_name ?? ""} ${owner.last_name ?? ""} ${owner.full_name ?? ""}`
        .toLowerCase()
        .includes(needle),
    ),
  );
}
