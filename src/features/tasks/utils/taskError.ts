// Shared Task/Project error taxonomy and logging helpers (Phase 11).
//
// API calls return ApiResult instead of throwing in normal operation. This file
// classifies thrown/offline/non-JSON failures and guarantees that background
// catches are logged instead of disappearing.

import type { ApiFailure } from "../api/apiResult";

export type TaskErrorKind =
  | "network"
  | "timeout"
  | "offline"
  | "auth"
  | "permission"
  | "not_found"
  | "validation"
  | "server"
  | "unknown";

const NETWORK_MARKERS = [
  "network request failed",
  "failed to fetch",
  "network error",
  "networkerror",
  "could not connect",
  "connection refused",
  "no internet",
  "offline",
  "econnrefused",
  "enotfound",
  "socket hang up",
];

const TIMEOUT_MARKERS = ["timeout", "timed out", "aborted"];

function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const message = record.message ?? record.error ?? record.Bad ?? record.data;
    return typeof message === "string" ? message : "";
  }
  return "";
}

function statusOf(value: unknown): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const status = (value as Record<string, unknown>).status;
  return typeof status === "number" ? status : undefined;
}

export function classifyTaskError(value: unknown): TaskErrorKind {
  if (!value) return "unknown";
  if (value instanceof Error && value.name === "AbortError") return "timeout";

  const message = textOf(value).toLowerCase();
  if (TIMEOUT_MARKERS.some((marker) => message.includes(marker))) {
    return "timeout";
  }
  if (NETWORK_MARKERS.some((marker) => message.includes(marker))) {
    return "offline";
  }

  const status = statusOf(value);
  if (status === 401) return "auth";
  if (status === 403) return "permission";
  if (status === 404) return "not_found";
  if (status === 400 || status === 422) return "validation";
  if (status !== undefined && status >= 500) return "server";

  const failure = value as Partial<ApiFailure>;
  if (failure.unauthenticated) return "auth";
  if (failure.nonJson) return "server";
  return "unknown";
}

export function taskErrorMessage(value: unknown, fallback = "Something went wrong."): string {
  const message = textOf(value).trim();
  if (message) return message;
  switch (classifyTaskError(value)) {
    case "offline":
      return "You appear to be offline. Check your connection and try again.";
    case "timeout":
      return "The request timed out. Please try again.";
    case "permission":
      return "You don't have permission to do that. Please contact your company admin if you need access.";
    case "not_found":
      return "This item no longer exists. Refresh and try again.";
    case "auth":
      return "Your session has expired. Please log in again.";
    case "validation":
      return "The request was rejected. Check the values and try again.";
    case "server":
      return "The server could not complete this request. Please try again.";
    default:
      return fallback;
  }
}

/** Logs a background failure in dev and returns a safe user-facing message. */
export function reportTaskError(
  context: string,
  value: unknown,
  fallback = "Something went wrong.",
): string {
  const message = taskErrorMessage(value, fallback);
  if (__DEV__) {
    console.warn(`[TaskModule] ${context}: ${message}`, value);
  }
  return message;
}

export function isNetworkErrorMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  return classifyTaskError(message) === "offline" || classifyTaskError(message) === "timeout";
}
