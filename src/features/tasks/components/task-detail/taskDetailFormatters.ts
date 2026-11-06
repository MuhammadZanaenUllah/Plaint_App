// Pure display formatters extracted from TaskDetailModal (AUD-081).

import {
  formatFullDateTime as formatFullDateTimeShared,
  formatShortDate,
} from "@/utils/dateFormat";

export function getDependencyInitials(name: string): string {
  if (!name || name === "-") return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function formatApiDate(dateStr: string): string {
  return formatShortDate(dateStr);
}

export function formatApiDateTime(dateStr: string): string {
  return formatFullDateTimeShared(dateStr);
}

export function formatDetailDateTime(dateStr?: string | null): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const day = String(d.getDate()).padStart(2, "0");
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${month} ${day}, ${year} ${hours}:${minutes} ${ampm}`;
}
