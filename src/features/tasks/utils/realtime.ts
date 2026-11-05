// Shared realtime helpers (contract §5.1/§5.3).
// Socket ids can be numbers or strings; every comparison must use Number().

export function sameNumericId(
  left: number | string | null | undefined,
  right: number | string | null | undefined,
): boolean {
  if (left === undefined || left === null) return false;
  if (right === undefined || right === null) return false;
  const a = Number(left);
  const b = Number(right);
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}

export function needsTaskLookupRefresh(
  owners: unknown[],
  priorities: unknown[],
): boolean {
  return owners.length === 0 || priorities.length === 0;
}
