// Timeout/abort wrapper used by the shared API client (AUD-023 / F7).
// Kept pure (injected task) so the abort semantics can be tested in Node
// without React Native or a real network.

export type AbortTimeoutOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
};

export async function runWithAbortTimeout<T>(
  task: (signal?: AbortSignal) => Promise<T>,
  options: AbortTimeoutOptions = {},
): Promise<T> {
  if (!options.timeoutMs && !options.signal) {
    return task();
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener("abort", abort);
  const timer = options.timeoutMs
    ? setTimeout(abort, options.timeoutMs)
    : null;

  try {
    return await task(controller.signal);
  } finally {
    if (timer) clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}
