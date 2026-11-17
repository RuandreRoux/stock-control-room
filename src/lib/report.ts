import type { Db } from "mongodb";
import { getDay } from "./data";
import { analyse, stepInfo, summarise } from "./logic";
import type { TeamsMessage } from "./teams";
import { formatDay, formatTime, isWorkingDay, sastDate } from "./time";

/** The scheduled report times (SAST). */
export const REPORT_SLOTS = {
  "10": { hour: 10, title: "10:00 report" },
  "15": { hour: 15, title: "15:00 report" },
  "18": { hour: 18, title: "End of day report" },
} as const;
export type ReportSlot = keyof typeof REPORT_SLOTS;

const MAX_ROWS = 12;

function limit(rows: string[], what: string): string[] {
  return rows.length > MAX_ROWS ? [...rows.slice(0, MAX_ROWS), `...and ${rows.length - MAX_ROWS} more ${what} on the dashboard`] : rows;
}

/** The report for today, as a Teams card: totals, who still owes checks, and count mismatches. */
export async function buildReport(db: Db, title: string): Promise<TeamsMessage | null> {
  const today = sastDate();
  if (!isWorkingDay(today)) return null;
  const now = Date.now();
  const checks = await getDay(db, today, today);
  const summary = summarise(today, checks, now);
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

  return {
    title: `${title} - ${formatDay(today)}`,
    lines: [
      { label: "Checks done", value: `${done} of ${summary.totalChecks} (${summary.totalChecks ? Math.round((done / summary.totalChecks) * 100) : 0}%)` },
      { label: "Checks not done", value: `${summary.notDone}${summary.overdue ? ` (${summary.overdue} overdue)` : ""}` },
      { label: "Count mismatches", value: String(summary.mismatches) },
    ],
    sections,
    note:
      summary.notDone === 0 && summary.mismatches === 0
        ? "All checks are done and every count matches."
        : `As at ${formatTime(new Date(now).toISOString())}. Counts were due at 10:00.`,
    buttonTitle: "Open the Exceptions Dashboard",
    path: "/exceptions",
  };
}
