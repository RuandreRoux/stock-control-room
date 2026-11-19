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

/**
 * The first sheet: the app went live with the team on 17 Nov 2026. Earlier dates have no
 * sheet anywhere (an early test sheet for 16 Nov is kept in the database but never shown).
 */
export const FIRST_SHEET = "2026-11-17";

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

// --- Working days: Monday to Friday, excluding South African public holidays ---

/** Easter Sunday (Gregorian) as [month, day]. */
function easter(year: number): [number, number] {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}

const pad = (n: number) => String(n).padStart(2, "0");
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const holidayCache = new Map<number, Map<string, string>>();

/**
 * South African public holidays for a year (date -> name). A holiday that falls on a
 * Sunday is observed on the next day that is not already a holiday. Once-off holidays
 * declared by the government (for example election days) are not included.
 */
export function publicHolidays(year: number): Map<string, string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const [em, ed] = easter(year);
  const easterSunday = `${year}-${pad(em)}-${pad(ed)}`;
  const fixed: [string, string][] = [
    [`${year}-01-01`, "New Year's Day"],
    [`${year}-03-21`, "Human Rights Day"],
    [addDays(easterSunday, -2), "Good Friday"],
    [addDays(easterSunday, 1), "Family Day"],
    [`${year}-04-27`, "Freedom Day"],
    [`${year}-05-01`, "Workers' Day"],
    [`${year}-06-16`, "Youth Day"],
    [`${year}-08-09`, "National Women's Day"],
    [`${year}-09-24`, "Heritage Day"],
    [`${year}-12-16`, "Day of Reconciliation"],
    [`${year}-12-25`, "Christmas Day"],
    [`${year}-12-26`, "Day of Goodwill"],
  ];
  const holidays = new Map(fixed);
  for (const [date, name] of fixed) {
    if (weekday(date) !== 0) continue;
    let observed = addDays(date, 1);
    while (holidays.has(observed)) observed = addDays(observed, 1);
    holidays.set(observed, `${name} (observed)`);
  }
  holidayCache.set(year, holidays);
  return holidays;
}

/** Why a date has no check sheet, or null when it is a working day. */
export function nonWorkingReason(date: string): string | null {
  const day = weekday(date);
  if (day === 6) return "Saturday";
  if (day === 0) return "Sunday";
  return publicHolidays(Number(date.slice(0, 4))).get(date) ?? null;
}

export const isWorkingDay = (date: string) => nonWorkingReason(date) === null;

export function previousWorkingDay(date: string): string {
  let d = addDays(date, -1);
  while (!isWorkingDay(d)) d = addDays(d, -1);
  return d;
}

export function nextWorkingDay(date: string): string {
  let d = addDays(date, 1);
  while (!isWorkingDay(d)) d = addDays(d, 1);
  return d;
}

/** The given date if it is a working day, otherwise the working day before it. */
export function latestWorkingDay(date: string): string {
  return isWorkingDay(date) ? date : previousWorkingDay(date);
}

// --- The sheet for a working day ---
//
// The sheet for day D collects the documents from 06:00 on D until 05:59 on the next
// working day, so the team fills it in as the day goes. Its counts are due at 10:00 on
// that next working day ("the due day"). After 10:00 the team resolves what was reported
// (data capturers by 15:00, the physical team by the end of the due day). Every sheet
// stays editable; the screens make it very clear which sheet is open.

/** The working day on which the sheet for `date` is due (10:00) and resolved (15:00). */
export const dueDay = (date: string): string => nextWorkingDay(date);

/** Epoch ms when the sheet for `date` stops collecting documents (06:00 on the due day). */
export const windowEndMs = (date: string): number => deadlineMs(dueDay(date), "06:00");

/** Epoch ms at the end of the sheet's due day (midnight after it), when it becomes an earlier sheet. */
export const closesMs = (date: string): number => deadlineMs(addDays(dueDay(date), 1), "00:00");

export function windowLabel(date: string): string {
  return `06:00 ${formatDay(date, false)} until 05:59 ${formatDay(dueDay(date), false)}`;
}

/**
 * The two sheets in play right now: the one collecting documents (it switches over at
 * 06:00, not midnight) and the one before it, which is due today.
 */
export function sheetsInPlay(nowMs = Date.now()): { current: string; due: string } {
  const current = latestWorkingDay(sastDate(nowMs - 6 * 60 * 60 * 1000));
  return { current, due: previousWorkingDay(current) };
}

export type SheetPhase = "collecting" | "countsDue" | "resolving" | "lastChance" | "closed";

/** Where the sheet for `date` is in its life, using the standard 10:00 and 15:00 times. */
export function sheetPhase(date: string, nowMs = Date.now()): SheetPhase {
  const due = dueDay(date);
  if (nowMs < windowEndMs(date)) return "collecting";
  if (nowMs < deadlineMs(due, "10:00")) return "countsDue";
  if (nowMs < deadlineMs(due, "15:00")) return "resolving";
  if (nowMs < closesMs(date)) return "lastChance";
  return "closed";
}

/** HH:MM (SAST) of an ISO timestamp. */
export function formatTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(new Date(iso).getTime() + OFFSET_MS).toISOString().slice(11, 16);
}
