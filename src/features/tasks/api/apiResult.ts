// API result contract for the Task Module.
// The shared client (`apiGet/apiPost/...`) returns the parsed response body and
// does not throw on business errors. New Task code must inspect this result.
//
// Contract references: §2.2 (Good/message precedence, 400/403/404/500),
// CONV-02, CONV-03, CONV-04, CONV-13.

export type ApiSuccess<T> = {
  ok: true;
  data: T;
  message?: string;
  stale?: boolean;
  raw: unknown;
};

export type ApiFailure = {
  ok: false;
  data?: undefined;
  message: string;
  status?: number;
  unauthenticated?: boolean;
  nonJson?: boolean;
  raw: unknown;
};

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

const UNAUTHENTICATED_MARKER = "Un-Athunticated request";

export function isUnauthenticated(body: unknown): boolean {
  return typeof body === "string" && body.includes(UNAUTHENTICATED_MARKER);
}

export function isNonJson(body: unknown): boolean {
  return typeof body === "string" && body.trim().length > 0 && !looksLikeJson(body);
}

function looksLikeJson(value: string): boolean {
  const trimmed = value.trim();
  return (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  );
}

function firstString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** First user-facing string in `data`, `message`, `msg`, `error` (or `Bad`). */
export function extractApiMessage(body: unknown): string {
  if (typeof body === "string") return body.trim();
  if (!body || typeof body !== "object") return "";

  const obj = body as Record<string, unknown>;
  return (
    firstString(obj.data) ??
    firstString(obj.message) ??
    firstString(obj.msg) ??
    firstString(obj.error) ??
    firstString(obj.Bad) ??
    ""
  );
}

export function normalizeApiResponse<T>(body: unknown, status = 0): ApiResult<T> {
  if (isUnauthenticated(body)) {
    return {
      ok: false,
      message: "Your session has expired. Please log in again.",
      status,
      unauthenticated: true,
      raw: body,
    };
  }

  const isObject = !!body && typeof body === "object" && !Array.isArray(body);
  const obj = isObject ? (body as Record<string, unknown>) : null;

  const explicitGood = obj?.Good;
  const explicitSuccess = obj?.success;
  const explicitFailure = explicitGood === false || explicitSuccess === false || status >= 400;
  const hasData = isObject && "data" in (obj as Record<string, unknown>);
  const hasOnlyMessage =
    isObject &&
    !hasData &&
    !!firstString((obj as Record<string, unknown>).message ?? (obj as Record<string, unknown>).error);
  const good =
    explicitGood === true ||
    explicitSuccess === true ||
    (!explicitFailure && !!isObject && !hasOnlyMessage);

  if (!good) {
    const nonJson = isNonJson(body);
    const message =
      (nonJson ? "" : extractApiMessage(body)) ||
      (nonJson ? "The server returned an unexpected response." : "Request failed.");
    return {
      ok: false,
      message,
      status,
      nonJson,
      raw: body,
    };
  }

  const data = (isObject && "data" in (obj as Record<string, unknown>)
    ? (obj as Record<string, unknown>).data
    : body) as T;

  return {
    ok: true,
    data,
    message: extractApiMessage(body) || undefined,
    stale: obj?.stale === true,
    raw: body,
  };
}

export function successResult<T>(data: T, raw: unknown = data): ApiResult<T> {
  return { ok: true, data, raw };
}

export function failureResult<T = never>(
  message: string,
  status?: number,
  raw: unknown = null,
): ApiResult<T> {
  return { ok: false, message, status, raw };
}

/** Convert a thrown error into a safe ApiResult. */
export function fromError<T = never>(error: unknown): ApiResult<T> {
  const message =
    error instanceof Error && error.message ? error.message : "An unexpected error occurred.";
  return failureResult<T>(message, undefined, error);
}
