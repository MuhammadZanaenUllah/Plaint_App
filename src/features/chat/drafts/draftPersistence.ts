// ─── Chat drafts — pure persistence core ─────────────────────────────────────
//
// Conversation-specific unsent message drafts. This module is intentionally
// free of React Native / React imports so it can be unit-tested directly with
// Node's test runner. The AsyncStorage/AppState wiring lives in `draftStore.ts`.
//
// Design:
//   • Drafts are a flat `{ [roomId]: text }` map for ONE account/company scope.
//   • The storage key embeds both the user id and the company id, so drafts can
//     never leak between accounts or company contexts.
//   • Empty/whitespace-only drafts are deleted, never persisted.
//   • Disk writes are debounced and serialized through a write chain, so an
//     older snapshot can never overwrite a newer one.
//   • Hydration merges drafts typed while the read was in flight (the in-memory
//     edits always win).

export type DraftMap = Record<string, string>;

export type DraftScope = {
  userId: number;
  companyId: number | null;
};

export type DraftStorageAdapter = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

export type DraftTimerApi = {
  setTimeout: (handler: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

export const DRAFT_STORAGE_PREFIX = "planit_chat_drafts";
export const DRAFT_DEBOUNCE_MS = 400;

/** AsyncStorage key for a scope. Company id is part of the key by design. */
export function draftStorageKey(scope: DraftScope): string {
  return `${DRAFT_STORAGE_PREFIX}_${scope.userId}_${scope.companyId ?? 0}`;
}

/** A draft is "empty" (and must not be shown/stored) when it is only spaces. */
export function isBlankDraft(text: string | null | undefined): boolean {
  return !text || text.trim().length === 0;
}

/**
 * Return a new draft map with `roomId` set to `text` (deleting blank drafts).
 * Returns the same map reference when nothing changes, so React subscribers
 * are not notified for no-op edits.
 */
export function applyDraft(
  map: DraftMap,
  roomId: string | number | null | undefined,
  text: string | null | undefined,
): DraftMap {
  const key = roomId == null ? "" : String(roomId);
  if (!key) return map;
  const value = text ?? "";
  if (isBlankDraft(value)) {
    if (!(key in map)) return map;
    const next = { ...map };
    delete next[key];
    return next;
  }
  if (map[key] === value) return map;
  return { ...map, [key]: value };
}

/** Remove a single draft (same as setting it to blank). */
export function removeDraft(
  map: DraftMap,
  roomId: string | number | null | undefined,
): DraftMap {
  return applyDraft(map, roomId, "");
}

/** Read a draft, normalised to a string. */
export function getDraftText(
  map: DraftMap,
  roomId: string | number | null | undefined,
): string {
  const key = roomId == null ? "" : String(roomId);
  if (!key) return "";
  return map[key] ?? "";
}

/** Parse a persisted draft map defensively (malformed storage is ignored). */
export function parseDraftMap(raw: string | null | undefined): DraftMap {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  const out: DraftMap = {};
  for (const [roomId, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== "string") continue;
    if (isBlankDraft(value)) continue;
    out[String(roomId)] = value;
  }
  return out;
}

export function serializeDraftMap(map: DraftMap): string {
  return JSON.stringify(map);
}

/** Number of non-empty drafts currently stored. */
export function draftCount(map: DraftMap): number {
  return Object.keys(map).length;
}

type Listener = () => void;

export type DraftPersistenceOptions = {
  debounceMs?: number;
  timer?: DraftTimerApi;
};

const defaultTimer: DraftTimerApi = {
  setTimeout: (handler, ms) => setTimeout(handler, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Owns the in-memory draft map for one scope and its debounced disk writes.
 * Not React-aware; subscribers are notified synchronously on every change.
 */
export class DraftPersistence {
  private readonly storage: DraftStorageAdapter;
  private readonly debounceMs: number;
  private readonly timer: DraftTimerApi;

  private scope: DraftScope | null = null;
  private storageKey: string | null = null;
  private drafts: DraftMap = {};
  private listeners = new Set<Listener>();

  private dirty = false;
  private hydrateToken = 0;
  private timerHandle: unknown = null;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(storage: DraftStorageAdapter, options?: DraftPersistenceOptions) {
    this.storage = storage;
    this.debounceMs = options?.debounceMs ?? DRAFT_DEBOUNCE_MS;
    this.timer = options?.timer ?? defaultTimer;
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Stable snapshot for `useSyncExternalStore`. */
  getSnapshot = (): DraftMap => this.drafts;

  getMap(): DraftMap {
    return this.drafts;
  }

  getScope(): DraftScope | null {
    return this.scope;
  }

  get(roomId: string | number | null | undefined): string {
    return getDraftText(this.drafts, roomId);
  }

  /** Update the in-memory draft immediately, then debounce a disk write. */
  set(
    roomId: string | number | null | undefined,
    text: string | null | undefined,
  ): void {
    const next = applyDraft(this.drafts, roomId, text);
    if (next === this.drafts) return;
    this.drafts = next;
    this.dirty = true;
    this.emit();
    this.schedule();
  }

  clear(roomId: string | number | null | undefined): void {
    this.set(roomId, "");
  }

  /**
   * Clear a draft only if it still holds `expectedText`.
   *
   * Used after a message send resolves: if the user typed a newer draft while
   * the request was in flight, the newer text is kept. Returns whether the
   * draft was cleared.
   */
  clearIfUnchanged(
    roomId: string | number | null | undefined,
    expectedText: string,
  ): boolean {
    const current = this.get(roomId);
    if (current !== expectedText) return false;
    this.clear(roomId);
    return true;
  }

  /** Load drafts for a scope, replacing the previous scope's map. */
  async hydrate(scope: DraftScope): Promise<void> {
    if (!scope.userId) {
      this.reset();
      return;
    }
    const key = draftStorageKey(scope);
    if (this.storageKey === key && this.scope) return;

    // Persist any pending writes for the previous scope before switching.
    if (this.dirty) {
      this.cancelScheduledFlush();
      void this.flushNow();
    }

    // On the very first identity bind (no previous scope) keep any drafts
    // already typed in memory: they belong to the user who is signing in and
    // must not be lost by the hydration reset. When switching between real
    // accounts/companies, drop the previous scope's drafts (isolation).
    const hadPreviousScope = this.scope !== null;
    const carriedDrafts = hadPreviousScope ? {} : this.drafts;

    const token = ++this.hydrateToken;
    this.scope = scope;
    this.storageKey = key;
    this.drafts = carriedDrafts;
    if (hadPreviousScope) this.dirty = false;
    this.cancelScheduledFlush();
    this.emit();

    try {
      const raw = await this.storage.getItem(key);
      if (token !== this.hydrateToken) return;
      const loaded = parseDraftMap(raw);
      // Any drafts typed while the read was in flight are in `this.drafts` and
      // must win over the persisted snapshot.
      const merged: DraftMap = { ...loaded, ...this.drafts };
      const changed =
        Object.keys(merged).length !== Object.keys(this.drafts).length ||
        Object.keys(merged).some((room) => merged[room] !== this.drafts[room]);
      this.drafts = merged;
      if (changed) this.emit();
      if (this.dirty) this.schedule();
    } catch {
      // Storage read failed: keep whatever is already in memory (safe fallback).
    }
  }

  /** Cancel the debounce timer and write the current map immediately. */
  async flush(): Promise<void> {
    this.cancelScheduledFlush();
    return this.flushNow();
  }

  /** Drop the current scope. Pending writes are flushed best-effort first. */
  reset(): void {
    if (this.dirty) {
      this.cancelScheduledFlush();
      void this.flushNow();
    }
    this.hydrateToken += 1;
    this.cancelScheduledFlush();
    this.scope = null;
    this.storageKey = null;
    this.drafts = {};
    this.dirty = false;
    this.emit();
  }

  private flushNow(): Promise<void> {
    if (!this.dirty || !this.storageKey) return this.writeChain;
    const key = this.storageKey;
    const snapshot = this.drafts;
    this.dirty = false;
    this.writeChain = this.writeChain
      .catch(() => {})
      .then(async () => {
        try {
          if (draftCount(snapshot) === 0) {
            await this.storage.removeItem(key);
          } else {
            await this.storage.setItem(key, serializeDraftMap(snapshot));
          }
        } catch {
          // A failed write must not break the chat UI; the next edit retries.
        }
      });
    return this.writeChain;
  }

  private schedule(): void {
    if (!this.storageKey) return;
    this.cancelScheduledFlush();
    this.timerHandle = this.timer.setTimeout(() => {
      this.timerHandle = null;
      void this.flushNow();
    }, this.debounceMs);
  }

  private cancelScheduledFlush(): void {
    if (this.timerHandle !== null) {
      this.timer.clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }
  }

  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // A subscriber must not prevent the others from being notified.
      }
    }
  }
}
