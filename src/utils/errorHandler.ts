import { ApiErrorEnvelope } from "@/types/api.types";

const AUTH_ERROR_MAP: Record<string, string> = {
  "Invalid password": "Email or password is incorrect.",
  "User not found": "Email or password is incorrect.",
};

function toBusinessMessage(raw: string): string {
  return AUTH_ERROR_MAP[raw.trim()] ?? raw;
}

export function extractErrorMessage(error: unknown): string {
  if (!error) return "An unexpected error occurred.";

  if (typeof error === "string") return error.trim();

  if (error instanceof Error) {
    const msg = error.message;

    if (msg.includes("Network request failed") || msg.includes("fetch")) {
      return "Network error. Please check your internet connection.";
    }
    if (msg.includes("timeout")) {
      return "Request timed out. Please try again.";
    }
    return msg.trim();
  }

  if (typeof error === "object" && error !== null) {
    const errObj = error as Record<string, unknown>;

    if (typeof errObj.Bad === "string" && errObj.Bad.trim()) {
      return errObj.Bad.trim();
    }
    if (typeof errObj.message === "string" && errObj.message.trim()) {
      return errObj.message.trim();
    }
    if (typeof errObj.msg === "string" && errObj.msg.trim()) {
      return errObj.msg.trim();
    }
    if (typeof errObj.error === "string" && errObj.error.trim()) {
      return errObj.error.trim();
    }
    if (typeof errObj.data === "string" && errObj.data.trim()) {
      return errObj.data.trim();
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
