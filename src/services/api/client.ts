import { fetch, prefetch, nitroFetchOnWorklet } from "react-native-nitro-fetch";
import { getStoredToken } from "@/utils/token";

const BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  "https://backend-planit.soulservices.com/api/v1";

/**
 * Pre-warms DNS resolution and TCP/TLS socket connection to the API server on app launch.
 */
export function initNetworkPrewarm() {
  try {
    prefetch(BASE_URL, { headers: { prefetchKey: "api-base" } }).catch(() => {});
  } catch (err) {
    console.warn("[Network] Prewarm init error:", err);
  }
}

type AuthFailureCallback = () => void;

let onAuthFailure: AuthFailureCallback | null = null;

export function setAuthFailureHandler(cb: AuthFailureCallback) {
  onAuthFailure = cb;
}

function buildHeaders(token?: string | null, isFormData = false): HeadersInit {
  const headers: HeadersInit = {};
  if (!isFormData) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers["x-access-token"] = token;
    headers["authToken"] = token;
    // console.log("📡 [API Header] Full Access Token attached:", token);
  } else {
    // console.log("📡 [API Header] WARNING: Request dispatched without Access Token!");
  }
  return headers;
}

async function handleResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  if (typeof body === "string" && body.includes("Un-Athunticated request")) {
    onAuthFailure?.();
    console.log("Session expired. Please log in again.");
  }

  if (typeof body === "object" && body !== null) {
    const errObj = body as Record<string, unknown>;

    if (errObj.Good === false || errObj.success === false || !res.ok) {
      console.log("[API] Error response:", {
        status: res.status,
        url: res.url,
        body: JSON.stringify(body).slice(0, 500),
      });

      const msg =
        (typeof errObj.Bad === "string" && errObj.Bad.trim()) ||
        (typeof errObj.message === "string" && errObj.message.trim()) ||
        (typeof errObj.msg === "string" && errObj.msg.trim()) ||
        (typeof errObj.error === "string" && errObj.error.trim()) ||
        (typeof errObj.data === "string" && errObj.data.trim()) ||
        `Request failed (${res.status})`;

      console.log(msg);
    }
  } else if (!res.ok) {
    const msg =
      typeof body === "string" && body.trim().length > 0
        ? body.trim()
        : `Request failed (${res.status})`;
    console.log(msg);
  }

  return body as T;
}

export async function apiGet<T>(
  path: string,
  params?: Record<string, string | number>,
): Promise<T> {
  const token = await getStoredToken();
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) =>
      url.searchParams.set(k, String(v)),
    );
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: buildHeaders(token),
  });
  return handleResponse<T>(res);
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
  isFormData = false,
): Promise<T> {
  const token = await getStoredToken();
  const url = `${BASE_URL}${path}`;
  console.log(
    "[API] POST:",
    path,
    "body:",
    isFormData ? "(FormData)" : JSON.stringify(body).slice(0, 500),
  );

  const res = await fetch(url, {
    method: "POST",
    headers: buildHeaders(token, isFormData),
    body: isFormData
      ? (body as FormData)
      : body
        ? JSON.stringify(body)
        : undefined,
  });
  return handleResponse<T>(res);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const token = await getStoredToken();
  const url = `${BASE_URL}${path}`;

  const res = await fetch(url, {
    method: "DELETE",
    headers: buildHeaders(token),
  });
  return handleResponse<T>(res);
}

export async function apiUpload<T>(
  path: string,
  formData: FormData,
): Promise<T> {
  const token = await getStoredToken();
  const url = `${BASE_URL}${path}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "x-access-token": token ?? "",
      authToken: token ?? "",
    },
    body: formData,
  });
  return handleResponse<T>(res);
}

/**
 * Offloads API GET request and JSON response parsing to a background C++ worklet thread.
 * Ideal for fetching large collections (e.g. task lists or long message histories) without blocking UI.
 */
export async function apiGetWorklet<T>(
  path: string,
  params?: Record<string, string | number>,
): Promise<T> {
  const token = await getStoredToken();
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) =>
      url.searchParams.set(k, String(v)),
    );
  }

  return nitroFetchOnWorklet<T>(
    url.toString(),
    {
      method: "GET",
      headers: buildHeaders(token),
    },
    (payload) => {
      "worklet";
      if (payload.bodyString) {
        try {
          return JSON.parse(payload.bodyString) as T;
        } catch {
          return payload.bodyString as unknown as T;
        }
      }
      return {} as T;
    },
  );
}
