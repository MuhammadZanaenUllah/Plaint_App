import { ApiErrorEnvelope } from "@/types/api.types";

const AUTH_ERROR_MAP: Record<string, string> = {
  "Invalid password": "Email or password is incorrect.",
  "User not found": "Email or password is incorrect.",
};

function toBusinessMessage(raw: string): string {
  return AUTH_ERROR_MAP[raw.trim()] ?? raw;
}

export function extractErrorMessage(error: unknown): string {
  if (!error) return "An unexpected error occurred";

  if (typeof error === "string") return toBusinessMessage(error);

  if (error instanceof Error) {
    const msg = error.message;

    if (msg.includes("Network request failed") || msg.includes("fetch")) {
      return "Network error. Please check your connection.";
    }
    if (msg.includes("timeout")) {
      return "Request timed out. Please try again.";
    }
    return toBusinessMessage(msg);
  }

  if (typeof error === "object" && error !== null) {
    const errObj = error as Record<string, unknown>;

    if ("Good" in errObj && errObj.Good === false) {
      const apiErr = error as ApiErrorEnvelope;
      if (apiErr.message) return toBusinessMessage(apiErr.message);
      if (typeof apiErr.data === "string") return toBusinessMessage(apiErr.data);
    }

    if ("message" in errObj && typeof errObj.message === "string") {
      return toBusinessMessage(errObj.message);
    }
  }

  return "An unexpected error occurred. Please try again.";
}

export function getPermissionErrorMessage(action: string): string {
  return `You do not have permission to ${action}.`;
}

export function getValidationError(field: string): string {
  return `${field} is required.`;
}
