// Per-endpoint request generation tokens (AUD-006).
// Older responses are ignored when a newer request for the same endpoint key
// has already started, so a slow page/filter reply cannot overwrite newer data.

export type RequestToken = {
  key: string;
  generation: number;
};

export type RequestTracker = {
  begin: (key: string) => RequestToken;
  isCurrent: (token: RequestToken) => boolean;
  clear: (key?: string) => void;
};

export function createRequestTracker(): RequestTracker {
  let counter = 0;
  const current = new Map<string, number>();

  return {
    begin(key) {
      const generation = ++counter;
      current.set(key, generation);
      return { key, generation };
    },
    isCurrent(token) {
      return current.get(token.key) === token.generation;
    },
    clear(key) {
      if (key === undefined) current.clear();
      else current.delete(key);
    },
  };
}
