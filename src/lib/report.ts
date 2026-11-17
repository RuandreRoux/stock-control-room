import type { Db } from "mongodb";
import { getDay } from "./data";
import { analyse, stepInfo, summarise } from "./logic";
import type { TeamsMessage } from "./teams";
import { formatDay, formatTime, isWorkingDay, sastDate, sheetsInPlay, windowLabel } from "./time";

/** The scheduled report times (SAST). */
export const REPORT_SLOTS = {
  "10": { hour: 10, title: "10:00 report", note: "Counts for this sheet were due at 10:00 today." },
  "15": { hour: 15, title: "15:00 report", note: "Data capturers had until 15:00 to resolve their issues." },
  "18": { hour: 18, title: "End of day report", note: "The physical team has until the end of today to resolve their issues." },
} as const;
export type ReportSlot = keyof typeof REPORT_SLOTS;

const MAX_ROWS = 12;

function limit(rows: string[], what: string): string[] {
  return rows.length > MAX_ROWS ? [...rows.slice(0, MAX_ROWS), `...and ${rows.length - MAX_ROWS} more ${what} on the dashboard`] : rows;
}

/**
 * The report on the sheet due today (yesterday's working day: documents from 06:00 that
 * day until 05:59 today, counts due at 10:00 today), as a Teams card: totals, who still
 * owes checks, and count mismatches. It ends with how far today's sheet has got.
 */
export async function buildReport(db: Db, title: string, note?: string): Promise<TeamsMessage | null> {
  const today = sastDate();
  if (!isWorkingDay(today)) return null;
  const now = Date.now();
  const { current, due } = sheetsInPlay(now);
  const checks = await getDay(db, due, today);
  const summary = summarise(due, checks, now);
  const done = summary.totalChecks - summary.notDone;

  // Checks not done, grouped by accountable person, then responsible person.
  const byAccountable = new Map<string, Map<string, number>>();
  const mismatches: string[] = [];
  for (const check of checks) {
    const a = analyse(check, now);
    for (const step of a.notDone) {
      const info = stepInfo(check.line, step);
      const acc = info.accountable || "N/A";
      const resp = `${info.responsible || "N/A"} - ${step === "physical" ? "count" : "DC received"}`;
      const people = byAccountable.get(acc) ?? new Map<string, number>();
      people.set(resp, (people.get(resp) ?? 0) + 1);
      byAccountable.set(acc, people);
    }
    if (a.mismatch) {
      const from = check.line.fromWarehouse && check.line.fromWarehouse !== "N/A" ? ` from ${check.line.fromWarehouse}` : "";
      const to = check.line.toWarehouse && check.line.toWarehouse !== "N/A" ? ` to ${check.line.toWarehouse}` : "";
      mismatches.push(
        `${check.line.stockMovement}${from}${to}: ${check.line.responsiblePerson} counted ${check.physical.count ?? 0}, DC received ${check.received.count ?? 0}`,
      );
    }
  }
  const notDoneRows = [...byAccountable.entries()]
    .map(([acc, people]) => {
      const total = [...people.values()].reduce((n, v) => n + v, 0);
      const detail = [...people.entries()]
        .sort((x, y) => y[1] - x[1])
        .map(([resp, n]) => `${resp} ${n}`)
        .join(", ");
      return { total, text: `${acc} (accountable): ${total} not done. ${detail}` };
    })
    .sort((x, y) => y.total - x.total)
    .map((r) => r.text);

  const sections: TeamsMessage["sections"] = [];
  if (summary.notDone > 0) sections.push({ heading: "Checks not done", rows: limit(notDoneRows, "people") });
  if (mismatches.length > 0) sections.push({ heading: "Count mismatches", rows: limit(mismatches, "lines") });

  const todays = summarise(current, await getDay(db, current, today), now);

  return {
    title: `${title}: ${formatDay(due)} sheet`,
    lines: [
      { label: "Documents", value: windowLabel(due) },
      { label: "Checks done", value: `${done} of ${summary.totalChecks} (${summary.totalChecks ? Math.round((done / summary.totalChecks) * 100) : 0}%)` },
      { label: "Checks not done", value: `${summary.notDone}${summary.overdue ? ` (${summary.overdue} overdue)` : ""}` },
      { label: "Count mismatches", value: String(summary.mismatches) },
      ...(current !== due
        ? [{ label: `${formatDay(current, false)} sheet`, value: `${todays.totalChecks - todays.notDone} of ${todays.totalChecks} filled in so far` }]
        : []),
    ],
    sections,
    note:
      summary.notDone === 0 && summary.mismatches === 0
        ? `All checks are done and every count matches. As at ${formatTime(new Date(now).toISOString())}.`
        : `${note ?? "Counts for this sheet were due at 10:00 today."} As at ${formatTime(new Date(now).toISOString())}.`,
    buttonTitle: "Open the Exceptions Dashboard",
    path: "/exceptions",
  };
}
