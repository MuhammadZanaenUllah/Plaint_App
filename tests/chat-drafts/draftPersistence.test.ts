import assert from "node:assert/strict";
import test from "node:test";

import {
  DraftPersistence,
  DraftStorageAdapter,
  applyDraft,
  draftStorageKey,
  isBlankDraft,
  parseDraftMap,
  serializeDraftMap,
} from "../../src/features/chat/drafts/draftPersistence";

type FakeTimer = {
  api: {
    setTimeout: (handler: () => void, ms: number) => unknown;
    clearTimeout: (handle: unknown) => void;
  };
  runAll: () => void;
  flushQueue: () => Promise<void>;
  pending: () => number;
};

function createTimer(): FakeTimer {
  let nextId = 1;
  const queue = new Map<number, () => void>();
  return {
    api: {
      setTimeout: (handler) => {
        const id = nextId++;
        queue.set(id, handler);
        return id;
      },
      clearTimeout: (handle) => {
        queue.delete(handle as number);
      },
    },
    runAll: () => {
      const handlers = Array.from(queue.values());
      queue.clear();
      for (const handler of handlers) handler();
    },
    flushQueue: async () => {
      // Let any scheduled async write chains settle.
      await new Promise((resolve) => setImmediate(resolve));
    },
    pending: () => queue.size,
  };
}

function createStorage(initial: Record<string, string> = {}) {
  const data = new Map<string, string>(Object.entries(initial));
  const writes: string[] = [];
  const storage: DraftStorageAdapter = {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      writes.push(key);
      data.set(key, value);
    },
    removeItem: async (key) => {
      writes.push(key);
      data.delete(key);
    },
  };
  return { storage, data, writes };
}

function createPersistence(initial: Record<string, string> = {}) {
  const timer = createTimer();
  const fake = createStorage(initial);
  const persistence = new DraftPersistence(fake.storage, {
    debounceMs: 400,
    timer: timer.api,
  });
  return { persistence, timer, ...fake };
}

test("blank and whitespace-only drafts are treated as empty", () => {
  assert.equal(isBlankDraft(""), true);
  assert.equal(isBlankDraft("   \n\t"), true);
  assert.equal(isBlankDraft(" hello "), false);
});

test("drafts are independent per conversation and blank clears them", () => {
  let map = applyDraft({}, "room-a", "first");
  map = applyDraft(map, "room-b", "second");
  assert.deepEqual(map, { "room-a": "first", "room-b": "second" });

  map = applyDraft(map, "room-a", "   ");
  assert.deepEqual(map, { "room-b": "second" });

  const same = applyDraft(map, "room-c", "");
  assert.equal(same, map, "clearing an absent draft must keep the same reference");
});

test("draft storage keys are scoped by user and company", () => {
  assert.equal(
    draftStorageKey({ userId: 7, companyId: 3 }),
    "planit_chat_drafts_7_3",
  );
  assert.equal(
    draftStorageKey({ userId: 7, companyId: 9 }),
    "planit_chat_drafts_7_9",
  );
  assert.notEqual(
    draftStorageKey({ userId: 7, companyId: null }),
    draftStorageKey({ userId: 8, companyId: null }),
  );
});

test("parse/serialize ignore malformed and non-string values", () => {
  assert.deepEqual(parseDraftMap(null), {});
  assert.deepEqual(parseDraftMap("not json"), {});
  assert.deepEqual(parseDraftMap('["a"]'), {});
  assert.deepEqual(parseDraftMap('{"r1":"ok","r2":3,"r3":"  ","r4":""}'), {
    r1: "ok",
  });
  assert.equal(serializeDraftMap({ r1: "ok" }), '{"r1":"ok"}');
});

test("updates are immediate in memory and debounced on disk", async () => {
  const { persistence, timer, data } = createPersistence();
  await persistence.hydrate({ userId: 1, companyId: 2 });
  persistence.set("room-a", "hello");

  assert.equal(persistence.get("room-a"), "hello");
  assert.equal(data.size, 0, "nothing is written before the debounce fires");
  assert.equal(timer.pending(), 1);

  timer.runAll();
  assert.equal(data.size, 0, "write is async; flushed via chain");
});

test("flush writes the latest snapshot and empty maps remove the key", async () => {
  const { persistence, timer, data, storage } = createPersistence();

  persistence.set("room-a", "hello");
  await persistence.flush();
  assert.equal(data.get("planit_chat_drafts_0_0"), undefined);
  // No scope yet: the store refuses to write without a storage key.
  assert.equal(data.size, 0);

  await persistence.hydrate({ userId: 1, companyId: 2 });
  persistence.set("room-a", "hello");
  persistence.set("room-b", "world");
  await persistence.flush();
  assert.equal(
    data.get(draftStorageKey({ userId: 1, companyId: 2 })),
    JSON.stringify({ "room-a": "hello", "room-b": "world" }),
  );

  persistence.clear("room-a");
  persistence.clear("room-b");
  await persistence.flush();
  assert.equal(
    data.has(draftStorageKey({ userId: 1, companyId: 2 })),
    false,
    "empty draft maps are removed from storage",
  );

  // Touch `storage` so TypeScript keeps the unused variable intentionally.
  assert.ok(storage);
  assert.equal(timer.pending(), 0);
});

test("clearIfUnchanged never removes a newer draft", async () => {
  const { persistence } = createPersistence();
  await persistence.hydrate({ userId: 1, companyId: null });

  persistence.set("room-a", "old text");
  assert.equal(persistence.clearIfUnchanged("room-a", "older text"), false);
  assert.equal(persistence.get("room-a"), "old text");

  persistence.set("room-a", "new text");
  assert.equal(persistence.clearIfUnchanged("room-a", "old text"), false);
  assert.equal(persistence.get("room-a"), "new text");

  assert.equal(persistence.clearIfUnchanged("room-a", "new text"), true);
  assert.equal(persistence.get("room-a"), "");
});

test("hydrate restores the scoped map and isolates accounts", async () => {
  const userOneKey = draftStorageKey({ userId: 1, companyId: 10 });
  const userTwoKey = draftStorageKey({ userId: 2, companyId: 10 });
  const { persistence, data } = createPersistence({
    [userOneKey]: JSON.stringify({ "room-a": "user one draft" }),
    [userTwoKey]: JSON.stringify({ "room-a": "user two draft" }),
  });

  await persistence.hydrate({ userId: 1, companyId: 10 });
  assert.equal(persistence.get("room-a"), "user one draft");

  await persistence.hydrate({ userId: 2, companyId: 10 });
  assert.equal(persistence.get("room-a"), "user two draft");

  persistence.set("room-a", "updated");
  await persistence.flush();
  assert.equal(
    data.get(userTwoKey),
    JSON.stringify({ "room-a": "updated" }),
  );
  // The first account's draught is untouched.
  assert.equal(
    data.get(userOneKey),
    JSON.stringify({ "room-a": "user one draft" }),
  );
});

test("drafts typed before the first scope hydration are preserved", async () => {
  const key = draftStorageKey({ userId: 8, companyId: 2 });
  const { persistence, data } = createPersistence({
    [key]: JSON.stringify({ "room-b": "stored" }),
  });

  // The user can theoretically type before the auth effect binds the scope.
  persistence.set("room-a", "typed early");
  await persistence.hydrate({ userId: 8, companyId: 2 });

  assert.equal(persistence.get("room-a"), "typed early");
  assert.equal(persistence.get("room-b"), "stored");

  await persistence.flush();
  assert.deepEqual(JSON.parse(data.get(key) ?? "{}"), {
    "room-a": "typed early",
    "room-b": "stored",
  });
});

test("edits made while hydration is in flight win over the stored snapshot", async () => {
  const key = draftStorageKey({ userId: 5, companyId: 1 });
  const readGate: { resolve?: (value: string | null) => void } = {};
  const timer = createTimer();
  const writes: Record<string, string> = {};
  const persistence = new DraftPersistence(
    {
      getItem: () =>
        new Promise((resolve) => {
          readGate.resolve = resolve;
        }),
      setItem: async (storageKey, value) => {
        writes[storageKey] = value;
      },
      removeItem: async (storageKey) => {
        delete writes[storageKey];
      },
    },
    { debounceMs: 400, timer: timer.api },
  );

  const hydrating = persistence.hydrate({ userId: 5, companyId: 1 });
  persistence.set("room-a", "typed while loading");
  readGate.resolve?.(JSON.stringify({ "room-a": "stored", "room-b": "two" }));
  await hydrating;

  assert.equal(persistence.get("room-a"), "typed while loading");
  assert.equal(persistence.get("room-b"), "two");

  await persistence.flush();
  assert.deepEqual(JSON.parse(writes[key]), {
    "room-a": "typed while loading",
    "room-b": "two",
  });
});

test("reset forgets the scope and emits a change", async () => {
  const { persistence } = createPersistence();
  let notifications = 0;
  const unsubscribe = persistence.subscribe(() => {
    notifications += 1;
  });

  await persistence.hydrate({ userId: 3, companyId: 4 });
  persistence.set("room-a", "draft");
  const beforeReset = notifications;
  persistence.reset();

  assert.equal(persistence.get("room-a"), "");
  assert.equal(persistence.getScope(), null);
  assert.ok(notifications > beforeReset);

  unsubscribe();
});
