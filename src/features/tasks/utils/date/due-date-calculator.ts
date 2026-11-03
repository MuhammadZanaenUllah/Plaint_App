// Due date calculator for task tabs
// Phase 1 — Foundation

import { isDueTodayPKT, isOverduePKT } from "./pkt-date-formatter";

export interface DueDateRange {
  from: string; // YYYY-MM-DD inclusive
  to: string; // YYYY-MM-DD exclusive
}

export function getDueTodayRange(serverTimePKT: string): DueDateRange {
  const now = new Date(serverTimePKT);
  const ktNow = new Date(now.getTime() + 3600000 * 5 * 60);
  const start = new Date(ktNow.getFullYear(), ktNow.getMonth(), ktNow.getDate());
  const end = new Date(start.getTime() + 86400000);
  return {
    from: `${start.getFullYear()}-${(start.getMonth() + 1).toString().padStart(2, "0")}-${start.getDate().toString().padStart(2, "0")}`,
    to: `${end.getFullYear()}-${(end.getMonth() + 1).toString().padStart(2, "0")}-${end.getDate().toString().padStart(2, "0")}`,
  };
}

export function getWeekRange(serverTimePKT: string): DueDateRange {
  const now = new Date(serverTimePKT);
  const ktNow = new Date(now.getTime() + 3600000 * 5 * 60);
  const day = ktNow.getDay();
  const monday = new Date(ktNow);
  monday.setDate(ktNow.getDate() - (day === 0 ? -6 : day - 1)); // previous Monday
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
  return { from: fmt(monday), to: fmt(friday) };
}

export function getDelayedRange(serverTimePKT: string): DueDateRange {
  const { from: today } = getDueTodayRange(serverTimePKT);
  const todayDate = new Date(today);
  const yesterday = new Date(todayDate.getTime() - 86400000);
  const fmt = (d: Date) => `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
  return { from: fmt(yesterday), to: todayDate };
}