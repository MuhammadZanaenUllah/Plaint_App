// API error extractor for Task Module
// Phase 1 — Foundation

import { parseApiResponse } from "./response-handler";

/** Parse API response, extracting error message per contract CONV-02 */
export { parseApiResponse };

/** Extract error message from API response, following contract conventions */
export function extractError(message?: string | null): string {
  if (!message) return "An unexpected error occurred";
  return message.trim();
}

/** Check if response indicates authentication failure */
export function isAuthFailure(good: boolean, error?: string): boolean {
  if (!good) return true;
  if (error && error.includes("Un-Authenticated")) return true;
  return false;
}

/** Check if response is a business error (400) vs server error (500) */
export function isBusinessError(good: boolean, status: number): boolean {
  return !good && status >= 400 && status < 500;
}

/** Check if response is a server error */
export function isServerError(good: boolean, status: number): boolean {
  return !good && status >= 500;
}