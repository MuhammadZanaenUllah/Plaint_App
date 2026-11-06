// In-flight request dedupe by logical endpoint key (AUD-006 / F7).
// Extracted from tasksStore so the sharing/cleanup semantics can be verified
// without a device or network.

export type InflightDedupe = {
  run: <T>(key: string, task: () => Promise<T>) => Promise<T>;
  clear: () => void;
  size: () => number;
};

export function createInflightDedupe(): InflightDedupe {
  const inFlight = new Map<string, Promise<unknown>>();

  function run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const existing = inFlight.get(key);
    if (existing) return existing as Promise<T>;

    const promise = task().finally(() => {
      if (inFlight.get(key) === promise) inFlight.delete(key);
    });
    inFlight.set(key, promise);
    return promise;
  }

  return {
    run,
    clear: () => inFlight.clear(),
    size: () => inFlight.size,
  };
}
