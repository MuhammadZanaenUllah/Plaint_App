// Cached-list retry rule (contract §2.5, AUD-005).
// Show stale data immediately; retry with wait_fresh=1. If the retry fails,
// keep the stale data instead of discarding it.

export type StaleAwareResult = {
  ok: boolean;
  stale?: boolean;
};

export async function listWithStaleRetry<T extends StaleAwareResult>(
  run: (waitFresh: boolean) => Promise<T>,
): Promise<T> {
  const first = await run(false);
  if (!first.ok || !first.stale) return first;
  const fresh = await run(true);
  return fresh.ok ? fresh : first;
}
