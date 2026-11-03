// PKT (Asia/Karachi, UTC+05:00) date utilities.
//
// Contract rules (§2.7, §CONV-10..12):
// - "YYYY-MM-DD" is a calendar day in PKT, never UTC midnight.
// - "YYYY-MM-DDTHH:mm" is PKT wall-clock time, without seconds or zone.
// - ISO strings with Z/offset are real instants.
// Pakistan has no DST; use a fixed +05:00 offset.

import { PKT_OFFSET_MS, PKT_TIMEZONE } from "../constants/taskConstants";

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = /^(\d{4})-(\d{1,2})-(\d{1,2})T(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

export type TaskDateInput = string | Date | null | undefined;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function isValidDate(value: Date): boolean {
  return !Number.isNaN(value.getTime());
}

/** Convert a PKT wall-clock date/time into a real instant. */
function pktWallClockToDate(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second) - PKT_OFFSET_MS);
}

export function parseTaskDate(value: TaskDateInput): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return isValidDate(value) ? new Date(value.getTime()) : null;

  const trimmed = value.trim();
  const dateOnly = DATE_ONLY.exec(trimmed);
  if (dateOnly) {
    return pktWallClockToDate(Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3]));
  }

  const dateTime = DATE_TIME.exec(trimmed);
  if (dateTime) {
    return pktWallClockToDate(
      Number(dateTime[1]),
      Number(dateTime[2]),
      Number(dateTime[3]),
      Number(dateTime[4]),
      Number(dateTime[5]),
      Number(dateTime[6] ?? 0),
    );
  }

  const parsed = new Date(trimmed);
  return isValidDate(parsed) ? parsed : null;
}

/** Format an instant as the PKT calendar day (YYYY-MM-DD). */
export function toPktDateOnly(value: TaskDateInput = new Date()): string {
  const date = typeof value === "string" ? parseTaskDate(value) : value;
  if (!date || !isValidDate(date)) return "";
  const shifted = new Date(date.getTime() + PKT_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** Format an instant as PKT wall-clock (YYYY-MM-DDTHH:mm). */
export function toPktDateTime(value: TaskDateInput = new Date()): string {
  const date = typeof value === "string" ? parseTaskDate(value) : value;
  if (!date || !isValidDate(date)) return "";
  const shifted = new Date(date.getTime() + PKT_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(
    shifted.getUTCDate(),
  )}T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

export function pktNow(): Date {
  return new Date();
}

/** Start of the current PKT calendar day, as an instant. */
export function pktTodayStart(now: Date = new Date()): Date {
  const today = toPktDateOnly(now);
  return parseTaskDate(today) as Date;
}

export function pktTomorrowStart(now: Date = new Date()): Date {
  return new Date(pktTodayStart(now).getTime() + 24 * 60 * 60 * 1000);
}

/** Start of the PKT calendar day containing `value`. */
export function pktDayStart(value: TaskDateInput): Date | null {
  const date = typeof value === "string" ? parseTaskDate(value) : value;
  if (!date) return null;
  return parseTaskDate(toPktDateOnly(date));
}

export function pktDayDiff(a: TaskDateInput, b: TaskDateInput): number | null {
  const startA = pktDayStart(a);
  const startB = pktDayStart(b);
  if (!startA || !startB) return null;
  return Math.round((startA.getTime() - startB.getTime()) / (24 * 60 * 60 * 1000));
}

export function isPktToday(value: TaskDateInput, now: Date = new Date()): boolean {
  const date = typeof value === "string" ? parseTaskDate(value) : value;
  if (!date) return false;
  return toPktDateOnly(date) === toPktDateOnly(now);
}

export function isPktPast(value: TaskDateInput, now: Date = new Date()): boolean {
  const date = typeof value === "string" ? parseTaskDate(value) : value;
  if (!date) return false;
  return date.getTime() < now.getTime();
}

export function formatTaskDueDatePkt(value: TaskDateInput): string {
  const date = typeof value === "string" ? parseTaskDate(value) : value;
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: PKT_TIMEZONE,
  }).format(date);
}

export function formatTaskDateTimePkt(value: TaskDateInput): string {
  const date = typeof value === "string" ? parseTaskDate(value) : value;
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: PKT_TIMEZONE,
  }).format(date);
}

// ---- Tab range helpers (date-only strings, [from, to) ) ----

export type DueDateRange = {
  from: string; // YYYY-MM-DD inclusive
  to: string; // YYYY-MM-DD exclusive
};

function addDays(dateOnly: string, days: number): string {
  const date = parseTaskDate(dateOnly);
  if (!date) return dateOnly;
  return toPktDateOnly(new Date(date.getTime() + days * 24 * 60 * 60 * 1000));
}

export function getDueTodayRange(now: Date = new Date()): DueDateRange {
  const today = toPktDateOnly(now);
  return { from: today, to: addDays(today, 1) };
}

/** Due today and the next 7 PKT days (website "Due in 7 days"). */
export function getWeekRange(now: Date = new Date()): DueDateRange {
  const tomorrow = addDays(toPktDateOnly(now), 1);
  return { from: tomorrow, to: addDays(tomorrow, 7) };
}

/** Everything before the start of today in PKT. */
export function getDelayedRange(now: Date = new Date()): DueDateRange {
  const today = toPktDateOnly(now);
  return { from: "1970-01-01", to: today };
}

// ---- Legacy aliases used by the current UI ----

export const PKT_OFFSET_MINUTES = 5 * 60;

export function toPKTDateString(isoDate: string): string {
  return toPktDateOnly(isoDate);
}

export function isDueTodayPKT(dueDate: string | null, now: Date | string = new Date()): boolean {
  const nowDate = typeof now === "string" ? parseTaskDate(now) ?? new Date() : now;
  return isPktToday(dueDate, nowDate);
}

export function isOverduePKT(dueDate: string | null, now: Date | string = new Date()): boolean {
  const nowDate = typeof now === "string" ? parseTaskDate(now) ?? new Date() : now;
  return isPktPast(dueDate, nowDate);
}
