/**
 * Shared date/time display formatters.
 *
 * Consolidates several near-duplicate implementations that previously lived
 * independently in statusMapper.ts, chatHelpers.ts, TaskDetailModal.tsx,
 * notifications.tsx, InboxModal.tsx, and CriticalTaskModal.tsx. Each call site
 * disagreed on the placeholder shown for empty/invalid input ("", "-", "—"),
 * so those are explicit options here rather than a hardcoded default.
 */

type FormatOptions = {
  /** Returned when the input is falsy (null/undefined/""). Defaults to "-". */
  emptyPlaceholder?: string;
  /** Returned when the input can't be parsed as a valid date. Defaults to the raw input string. */
  invalidPlaceholder?: string;
};

/** "18, Aug" — short day + abbreviated month. */
export function formatShortDate(dateStr?: string, opts: FormatOptions = {}): string {
  const { emptyPlaceholder = "-", invalidPlaceholder } = opts;
  if (!dateStr) return emptyPlaceholder;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return invalidPlaceholder ?? dateStr;
  return `${d.getDate()}, ${d.toLocaleString("en-US", { month: "short" })}`;
}

/** "Today 3:29 PM" / "27, Aug 3:29 PM" — formatted task due date with time. */
export function formatTaskDueDate(dateStr?: string, opts: FormatOptions = {}): string {
  const { emptyPlaceholder = "-", invalidPlaceholder } = opts;
  if (!dateStr) return emptyPlaceholder;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return invalidPlaceholder ?? dateStr;

  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  const timeStr = formatClockTime(d);
  const hasTime =
    dateStr.includes("T") ||
    dateStr.includes(":") ||
    d.getHours() !== 0 ||
    d.getMinutes() !== 0;

  if (isToday) {
    return hasTime ? `Today ${timeStr}` : "Today";
  }

  const datePart = `${d.getDate()}, ${d.toLocaleString("en-US", { month: "short" })}`;
  return hasTime ? `${datePart} ${timeStr}` : datePart;
}

/** "3:45 PM" (or "3:45 pm" when `lowercase` is set). */
export function formatClockTime(date: Date, lowercase = false): string {
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return lowercase ? time.toLowerCase() : time;
}

/** "18, Aug 3:45 PM" (default) or "Aug 18, 2026, 3:45 PM" (`includeYear`). */
export function formatFullDateTime(
  dateStr?: string,
  opts: FormatOptions & { includeYear?: boolean } = {}
): string {
  const { emptyPlaceholder = "-", invalidPlaceholder, includeYear = false } = opts;
  if (!dateStr) return emptyPlaceholder;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return invalidPlaceholder ?? dateStr;
  const time = formatClockTime(d);
  if (includeYear) {
    const datePart = d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return `${datePart}, ${time}`;
  }
  return `${d.getDate()}, ${d.toLocaleString("en-US", { month: "short" })} ${time}`;
}

/**
 * Chat-list timestamp:
 *  - less than 24h old → clock time, e.g. "3:45 pm" (existing behaviour)
 *  - 24h to 7 days old → weekday name, e.g. "Thursday"
 *  - older than 7 days → dd/mm/yy, e.g. "11/12/26"
 *
 * `nowMs` is injectable for deterministic tests.
 */
export function formatChatListTimestamp(
  dateString?: string,
  opts: FormatOptions & { nowMs?: number } = {}
): string {
  const { emptyPlaceholder = "", invalidPlaceholder = "" } = opts;
  if (!dateString) return emptyPlaceholder;
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return invalidPlaceholder;

  const nowMs = opts.nowMs ?? Date.now();
  const diffMs = Math.max(0, nowMs - date.getTime());
  const DAY_MS = 86400000;

  if (diffMs < DAY_MS) return formatClockTime(date, true);
  if (diffMs <= 7 * DAY_MS) {
    return date.toLocaleDateString("en-US", { weekday: "long" });
  }

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

/**
 * "Just now" / "5m ago" / "3h ago" / "2d ago".
 *
 * Ages are elapsed-time based: minutes under an hour, hours under a day, then
 * whole days. `nowMs` is injectable for deterministic tests.
 */
export function formatRelativeTime(
  dateString?: string,
  opts: FormatOptions & { nowMs?: number } = {}
): string {
  const { emptyPlaceholder = "", invalidPlaceholder = "" } = opts;
  if (!dateString) return emptyPlaceholder;
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return invalidPlaceholder;
  const nowMs = opts.nowMs ?? Date.now();
  // Clamp future timestamps (server/client clock skew) to "Just now" instead of
  // producing a negative age.
  const diffMs = Math.max(0, nowMs - date.getTime());
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMs / 3600000);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffMs / 86400000);
  return `${diffDays}d ago`;
}
