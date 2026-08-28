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

/** "Just now" / "5m ago" / "3h ago" / "2d ago" / falls back to "Aug 18" past a week. */
export function formatRelativeTime(dateString?: string, opts: FormatOptions = {}): string {
  const { emptyPlaceholder = "", invalidPlaceholder = "" } = opts;
  if (!dateString) return emptyPlaceholder;
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return invalidPlaceholder;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  const datePart = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return `${datePart}, ${formatClockTime(date)}`;
}
