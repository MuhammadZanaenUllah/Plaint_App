// Compatibility re-exports. Canonical API result contract lives in apiResult.ts.
import { extractApiMessage, isUnauthenticated } from "./apiResult";

export { extractApiMessage, isUnauthenticated };

export function extractError(message?: string | null): string {
  if (!message) return "An unexpected error occurred";
  return message.trim();
}

export function isAuthFailure(good: boolean, error?: string): boolean {
  if (!good) return true;
  return !!error && error.includes("Un-Athunticated request");
}

export function isBusinessError(good: boolean, status: number): boolean {
  return !good && status >= 400 && status < 500;
}

export function isServerError(good: boolean, status: number): boolean {
  return !good && status >= 500;
}

export { extractApiMessage as extractMessage };
