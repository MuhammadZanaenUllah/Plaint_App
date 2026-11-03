// PKT-aware date formatter for tasks
// Pakistan Time = UTC+05:00
// Phase 1 — Foundation

export const PKT_OFFSET_MINUTES = 5 * 60; // 300 = UTC+05:00

export function toPKTDateString(isoDate: string): string {
  // Convert ISO date string to PKT YYYY-MM-DD
  const date = new Date(isoDate);
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  const kt = utc + 3600000 * PKT_OFFSET_MINUTES; // +5 hours
  const kst = new Date(kt);
  const year = kst.getFullYear();
  const month = String(kst.getMonth() + 1).padStart(2, "0");
  const day = String(kst.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isDueTodayPKT(dueDate: string | null, serverTimePKT: string): boolean {
  if (!dueDate) return false;
  const due = new Date(dueDate);
  const now = new Date(serverTimePKT);
  const duePKT = new Date(due.getTime() + 3600000 * PKT_OFFSET_MINUTES);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueStart = new Date(duePKT.getFullYear(), duePKT.getMonth(), duePKT.getDate());
  return dueStart >= todayStart && dueStart < new Date(todayStart.getTime() + 86400000);
}

export function isOverduePKT(dueDate: string | null, serverTimePKT: string): boolean {
  if (!dueDate) return false;
  const due = new Date(dueDate);
  const now = new Date(serverTimePKT);
  const duePKT = new Date(due.getTime() + 3600000 * PKT_OFFSET_MINUTES);
  return duePKT < now;
}