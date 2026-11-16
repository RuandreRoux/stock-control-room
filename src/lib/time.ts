// All business dates and deadlines are in South African Standard Time (UTC+2, no DST).
const OFFSET_MS = 2 * 60 * 60 * 1000;

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function sastDate(d: Date | number | string = new Date()): string {
  return new Date(new Date(d).getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

export function isValidDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function isValidTime(s: unknown): s is string {
  return typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Epoch ms of HH:MM (SAST) on the given check date. */
export function deadlineMs(date: string, hhmm: string): number {
  const time = isValidTime(hhmm) ? hhmm : "23:59";
  return new Date(`${date}T${time}:00Z`).getTime() - OFFSET_MS;
}

export function formatDay(date: string, withYear = true): string {
  const d = new Date(`${date}T00:00:00Z`);
  const base = `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return withYear ? `${base} ${d.getUTCFullYear()}` : base;
}

/** The business window a check day covers: 06:00 the previous day to 06:00 on the day. */
export function windowLabel(date: string): string {
  return `06:00 ${formatDay(addDays(date, -1), false)} to 06:00 ${formatDay(date, false)}`;
}

/** HH:MM (SAST) of an ISO timestamp. */
export function formatTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(new Date(iso).getTime() + OFFSET_MS).toISOString().slice(11, 16);
}
