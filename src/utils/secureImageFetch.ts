/**
 * Shared authenticated-image loading for Avatar and SecureImage.
 *
 * The backend's `secure-file` proxy requires auth headers, and RN's <Image>
 * doesn't reliably honor custom headers passed via `source={{ uri, headers }}`
 * on every platform/proxy combination — that silently produced a broken/blank
 * image (or, in Avatar's case, an endless initials fallback) even for a
 * correct URL. Fetching the bytes ourselves and rendering a `data:` URI
 * sidesteps the native image loader's header handling entirely. Uses RN's
 * built-in global `fetch` (not a native module) so this works without any
 * native rebuild.
 */

import { useEffect, useState } from "react";
import { getStoredToken } from "@/utils/token";

export type ImageCandidate = { uri: string; headers?: Record<string, string> };

const resolvedCache = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();

// `getStoredToken()` is async (reads from SecureStore), so on a cold app
// launch every Avatar/SecureImage mounts with no token yet. Without this,
// each one independently fired its very first candidate fetch with NO auth
// headers (since `token` state started `null`, indistinguishable from
// "confirmed logged out"), got a guaranteed 403, and permanently cached
// that as a miss in `resolvedCache` — *before* the real token loaded a
// moment later. That's why images "sometimes" appeared on launch and
// sometimes didn't: pure timing luck on whether the token beat the first
// fetch attempt. A single shared token promise (loaded once, reused by
// every consumer) plus `undefined` as an explicit "not loaded yet" state
// (see `useAuthToken`) means nothing fetches until the token is actually
// known, so there's no unauthenticated attempt to poison the cache.
let tokenPromise: Promise<string | null> | null = null;
function loadAuthTokenOnce(): Promise<string | null> {
  if (!tokenPromise) {
    tokenPromise = getStoredToken();
  }
  return tokenPromise;
}

/** Call after a login or logout so the next image fetch re-reads the token
 *  instead of reusing a stale one from a previous session, and so a new
 *  session doesn't reuse another account's cached image results. */
export function invalidateAuthTokenCache(): void {
  tokenPromise = null;
  resolvedCache.clear();
  inFlight.clear();
}

/** The stored auth token — `undefined` while it's still loading (nothing
 *  should fetch yet), `null` once loaded if there truly isn't one. */
export function useAuthToken(): string | null | undefined {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    loadAuthTokenOnce().then((t) => {
      if (!cancelled) setToken(t);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return token;
}

// A screen full of avatars/thumbnails mounts many of these at once, and each
// unresolved bare-filename image tries several guessed candidate paths in a
// row — that can add up to dozens of concurrent authenticated requests on a
// single mount. Observed as intermittent 403s that come and go across
// reloads with no code change, consistent with the backend (or a proxy in
// front of it) rate-limiting/rejecting request bursts rather than rejecting
// any single request on its own merits. Capping concurrency keeps this well
// under whatever that burst threshold is.
const MAX_CONCURRENT_FETCHES = 4;
let activeFetchCount = 0;
const fetchWaitQueue: (() => void)[] = [];

async function withFetchConcurrencyLimit<T>(fn: () => Promise<T>): Promise<T> {
  if (activeFetchCount >= MAX_CONCURRENT_FETCHES) {
    await new Promise<void>((resolve) => fetchWaitQueue.push(resolve));
  }
  activeFetchCount++;
  try {
    return await fn();
  } finally {
    activeFetchCount--;
    fetchWaitQueue.shift()?.();
  }
}

// Chunked to avoid a call-stack overflow from spreading a large byte array
// into String.fromCharCode at once.
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function fetchAsDataUri(
  uri: string,
  headers?: Record<string, string>,
): Promise<string | null> {
  try {
    const res = await withFetchConcurrencyLimit(() => fetch(uri, { headers }));
    if (!res.ok) {
      console.log(`[SecureImage] ${res.status} ${res.statusText} for ${uri}`);
      return null;
    }
    const contentType = res.headers.get("content-type") ?? "";
    // Reject only obvious non-image error bodies (JSON/HTML error pages) —
    // some file proxies don't set a strict image/* content-type on success.
    if (/json|html|text\/plain/i.test(contentType)) {
      console.log(
        `[SecureImage] rejected content-type "${contentType}" for ${uri}`,
      );
      return null;
    }
    const buffer = await res.arrayBuffer();
    if (!buffer || buffer.byteLength === 0) {
      console.log(`[SecureImage] empty body for ${uri}`);
      return null;
    }
    const mime = contentType.startsWith("image/") ? contentType : "image/jpeg";
    return `data:${mime};base64,${bytesToBase64(new Uint8Array(buffer))}`;
  } catch (err) {
    console.log(`[SecureImage] fetch threw for ${uri}:`, err);
    return null;
  }
}

/** Synchronously read an already-resolved (or already-failed, i.e. `null`)
 *  result from cache without kicking off a fetch. */
export function getCachedImageUri(cacheKey: string): string | null {
  return resolvedCache.get(cacheKey) ?? null;
}

/** Resolve the first candidate URL that loads successfully, trying each in
 *  order and caching the result (including a `null` miss) by `cacheKey` so
 *  the same image is only ever fetched once per session. */
export function resolveImageUri(
  cacheKey: string,
  candidates: ImageCandidate[],
): Promise<string | null> {
  if (resolvedCache.has(cacheKey)) {
    return Promise.resolve(resolvedCache.get(cacheKey) ?? null);
  }
  if (candidates.length === 0) {
    return Promise.resolve(null);
  }
  let promise = inFlight.get(cacheKey);
  if (!promise) {
    promise = (async () => {
      for (const candidate of candidates) {
        const dataUri = await fetchAsDataUri(candidate.uri, candidate.headers);
        if (dataUri) return dataUri;
      }
      return null;
    })().then((result) => {
      resolvedCache.set(cacheKey, result);
      inFlight.delete(cacheKey);
      return result;
    });
    inFlight.set(cacheKey, promise);
  }
  return promise;
}
