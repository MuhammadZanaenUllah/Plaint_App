import { ApiErrorEnvelope } from "@/types/api.types";
import { getStoredToken } from "@/utils/token";

const BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  "https://backend-planit.soulservices.com/api/v1";

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
    console.log("📡 [API Header] Full Access Token attached:", token);
  } else {
    console.log("📡 [API Header] WARNING: Request dispatched without Access Token!");
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
    throw new Error("Session expired. Please log in again.");
  }

  if (!res.ok) {
    console.log("[API] Error response:", { status: res.status, url: res.url, body: JSON.stringify(body).slice(0, 500) });
    const errBody = body as ApiErrorEnvelope;
    const msg =
      (typeof errBody === "object" && errBody !== null
        ? (errBody.message ??
          (typeof errBody.data === "string" ? errBody.data : null))
        : null) ?? `Request failed (${res.status})`;
    throw new Error(msg);
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
  console.log("[API] POST:", path, "body:", isFormData ? "(FormData)" : JSON.stringify(body).slice(0, 500));

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
